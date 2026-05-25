"""
Fix broken enrolment_ticket values in tabSH Soft Skills Feedback.

SH Class records were renamed ~2 weeks ago from the old naming scheme
(e.g. SSP111-C3-2025-288) to the new scheme (e.g. SSP111-R3A).
SH Enrolment records were renamed accordingly, but enrolment_ticket in
SH Soft Skills Feedback was not updated for pre-existing records.

This patch:
  1. Reads rename history from the Frappe Activity Log.
  2. Builds an old-class → new-class mapping for SH Class renames.
  3. For each SS feedback record whose enrolment_ticket no longer exists,
     parses the student ID and old class name from the stale ticket,
     looks up the new enrolment via student + new class name, and updates
     the ticket.
"""

import frappe


def execute():
	# ------------------------------------------------------------------
	# 1. Build old-class → new-class mapping from Activity Log
	# ------------------------------------------------------------------
	rename_rows = frappe.db.sql(
		"""
        SELECT subject, reference_name
        FROM   `tabActivity Log`
        WHERE  reference_doctype = 'SH Class'
          AND  subject LIKE 'renamed from%'
        """,
		as_dict=True,
	)

	class_map = {}  # old_name → new_name
	for row in rename_rows:
		# subject format: "renamed from <old> to <new>"
		try:
			parts = row.subject.split(" ")
			# parts: ['renamed', 'from', '<old>', 'to', '<new>']
			old_idx = parts.index("from") + 1
			to_idx = parts.index("to", old_idx) + 1
			old_name = " ".join(parts[old_idx : to_idx - 1])
			new_name = " ".join(parts[to_idx:])
			if old_name and new_name:
				class_map[old_name] = new_name
		except (ValueError, IndexError):
			continue

	if not class_map:
		frappe.log_error(
			"fix_ss_feedback_enrolment_tickets: no SH Class rename entries found in Activity Log",
			"Patch Warning",
		)

	# Also try the __Rename Log table if it exists (Frappe v15+)
	try:
		extra = frappe.db.sql(
			"SELECT old_name, new_name FROM `__Rename Log` WHERE doctype = 'SH Class'",
			as_dict=True,
		)
		for row in extra:
			class_map.setdefault(row.old_name, row.new_name)
	except Exception:
		pass  # table may not exist on older Frappe versions

	# ------------------------------------------------------------------
	# 2. Load all current SH Enrolment records (student, class → name)
	# ------------------------------------------------------------------
	enrolment_rows = frappe.db.sql(
		"SELECT name, student, `class` FROM `tabSH Enrolment`",
		as_dict=True,
	)
	enrolment_index = {}  # (student, class_name) → enrolment.name
	for e in enrolment_rows:
		if e.student and e["class"]:
			enrolment_index[(e.student, e["class"])] = e.name

	current_enrolment_names = {e.name for e in enrolment_rows}

	# ------------------------------------------------------------------
	# 3. Find broken SS feedback records
	# ------------------------------------------------------------------
	fb_rows = frappe.db.sql(
		"""
        SELECT name, student, enrolment_ticket
        FROM   `tabSH Soft Skills Feedback`
        WHERE  enrolment_ticket IS NOT NULL
          AND  enrolment_ticket != ''
        """,
		as_dict=True,
	)

	broken = [r for r in fb_rows if r.enrolment_ticket not in current_enrolment_names]

	updated = 0
	skipped_no_map = 0
	skipped_no_enrolment = 0
	skipped_bad_format = 0

	for fb in broken:
		ticket = fb.enrolment_ticket  # e.g. SH260116-SSP111-C3-2025-288

		# Extract student ID (SH + 6 digits = 8 chars) and old class name
		# Ticket format: {student_id}-{class_name}
		if not ticket or len(ticket) < 10:
			skipped_bad_format += 1
			continue

		# Student IDs are always "SH" followed by exactly 6 digits
		if ticket[:2] != "SH" or not ticket[2:8].isdigit() or ticket[8] != "-":
			skipped_bad_format += 1
			continue

		student_id = ticket[:8]
		old_class = ticket[9:]

		# Map old class → new class
		new_class = class_map.get(old_class)
		if not new_class:
			skipped_no_map += 1
			continue

		# Find the current enrolment for this student in the new class
		new_enrolment = enrolment_index.get((student_id, new_class))
		if not new_enrolment:
			# Also try the fb.student field (may differ from parsed student_id)
			if fb.student:
				new_enrolment = enrolment_index.get((fb.student, new_class))
		if not new_enrolment:
			skipped_no_enrolment += 1
			continue

		frappe.db.set_value(
			"SH Soft Skills Feedback",
			fb.name,
			"enrolment_ticket",
			new_enrolment,
			update_modified=False,
		)
		updated += 1

	frappe.db.commit()

	summary = (
		f"fix_ss_feedback_enrolment_tickets: "
		f"total broken={len(broken)}, "
		f"updated={updated}, "
		f"skipped_no_class_map={skipped_no_map}, "
		f"skipped_no_enrolment={skipped_no_enrolment}, "
		f"skipped_bad_format={skipped_bad_format}"
	)
	print(summary)
	frappe.log_error(summary, "Patch Info")
