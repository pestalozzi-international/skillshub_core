# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe import _

# (doctype, class_link_field, programme_name)
# SH Soft Skills Feedback uses "program_schedule" (American spelling — zm_sh_soft_skills wins at migrate)
_FB = {
	"mindset_camp": ("SH Mindset Camp Feedback", "programme_schedule", "Mindset Camp"),
	"soft_skills": ("SH Soft Skills Feedback", "sh_class", "Soft Skills Programme"),
	"vocational": ("SH VT Feedback", "programme_schedule", "Vocational Training"),
	"edulution": (
		"SH Edulution Feedback",
		"programme_schedule",
		"Remedial Programme: Literacy and Numeracy",
	),
	"attachment": ("SH Attachment Feedback", "programme_schedule", "Vocational Training"),
}

# Display order for FIELD() sort
_PROG_ORDER = [
	"Mindset Camp",
	"Remedial Programme: Literacy and Numeracy",
	"Soft Skills Programme",
	"Vocational Training",
]


def execute(filters=None):
	filters = frappe._dict(filters or {})
	view = filters.view or "Class Summary"

	if view == "Student Detail":
		columns = _student_columns()
		data = _get_student_data(filters)
	else:
		columns = _class_columns()
		data = _get_class_data(filters)

	summary = _report_summary(data, view)
	return columns, data, None, None, summary


# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------


def _class_columns():
	return [
		{
			"label": _("Class"),
			"fieldname": "class_name",
			"fieldtype": "Link",
			"options": "SH Class",
			"width": 160,
		},
		{
			"label": _("Academic Year"),
			"fieldname": "academic_year",
			"fieldtype": "Link",
			"options": "SH Academic Year",
			"width": 110,
		},
		{
			"label": _("Cohort"),
			"fieldname": "cohort",
			"fieldtype": "Link",
			"options": "SH Cohort",
			"width": 130,
		},
		{
			"label": _("Programme"),
			"fieldname": "programme",
			"fieldtype": "Data",
			"width": 200,
		},
		{
			"label": _("Course"),
			"fieldname": "course",
			"fieldtype": "Link",
			"options": "SkillsHub Course",
			"width": 180,
		},
		{
			"label": _("Course Run"),
			"fieldname": "course_run",
			"fieldtype": "Data",
			"width": 80,
		},
		{
			"label": _("Complete"),
			"fieldname": "complete",
			"fieldtype": "Check",
			"width": 75,
		},
		{
			"label": _("Enrolments"),
			"fieldname": "total_enrolments",
			"fieldtype": "Int",
			"width": 90,
		},
		{
			"label": _("Active"),
			"fieldname": "enrolled",
			"fieldtype": "Int",
			"width": 65,
		},
		{
			"label": _("Completed"),
			"fieldname": "completed",
			"fieldtype": "Int",
			"width": 80,
		},
		{
			"label": _("Dropped"),
			"fieldname": "dropped",
			"fieldtype": "Int",
			"width": 70,
		},
		{
			"label": _("Baselines"),
			"fieldname": "baselines",
			"fieldtype": "Int",
			"width": 80,
		},
		{
			"label": _("Baseline %"),
			"fieldname": "baseline_pct",
			"fieldtype": "Percent",
			"width": 90,
		},
		{
			"label": _("⛺ MSC Feedback"),
			"fieldname": "fb_mindset_camp",
			"fieldtype": "Int",
			"width": 115,
		},
		{
			"label": _("📖 Edulution Feedback"),
			"fieldname": "fb_edulution",
			"fieldtype": "Int",
			"width": 125,
		},
		{
			"label": _("🧠 SS Feedback"),
			"fieldname": "fb_soft_skills",
			"fieldtype": "Int",
			"width": 105,
		},
		{
			"label": _("🔧 VT Feedback"),
			"fieldname": "fb_vocational",
			"fieldtype": "Int",
			"width": 100,
		},
		{
			"label": _("🏢 Attachment Feedback"),
			"fieldname": "fb_attachment",
			"fieldtype": "Int",
			"width": 125,
		},
		{
			"label": _("Feedback %"),
			"fieldname": "feedback_pct",
			"fieldtype": "Percent",
			"width": 90,
		},
	]


def _student_columns():
	return [
		{
			"label": _("Student"),
			"fieldname": "student",
			"fieldtype": "Link",
			"options": "SH Student",
			"width": 120,
		},
		{
			"label": _("Name"),
			"fieldname": "student_name",
			"fieldtype": "Data",
			"width": 180,
		},
		{
			"label": _("Intake Year"),
			"fieldname": "intake_year",
			"fieldtype": "Data",
			"width": 90,
		},
		{
			"label": _("Cohort"),
			"fieldname": "intake_cohort",
			"fieldtype": "Link",
			"options": "SH Cohort",
			"width": 120,
		},
		{
			"label": _("Path"),
			"fieldname": "programme_path",
			"fieldtype": "Data",
			"width": 80,
		},
		{
			"label": _("Class"),
			"fieldname": "class_name",
			"fieldtype": "Link",
			"options": "SH Class",
			"width": 160,
		},
		{
			"label": _("Programme"),
			"fieldname": "programme",
			"fieldtype": "Data",
			"width": 220,
		},
		{
			"label": _("Course"),
			"fieldname": "course",
			"fieldtype": "Link",
			"options": "SkillsHub Course",
			"width": 180,
		},
		{
			"label": _("Course Run"),
			"fieldname": "course_run",
			"fieldtype": "Data",
			"width": 80,
		},
		{
			"label": _("Academic Year"),
			"fieldname": "academic_year",
			"fieldtype": "Link",
			"options": "SH Academic Year",
			"width": 100,
		},
		{
			"label": _("Status"),
			"fieldname": "status",
			"fieldtype": "Data",
			"width": 85,
		},
		{
			"label": _("Baseline"),
			"fieldname": "has_baseline",
			"fieldtype": "Check",
			"width": 70,
		},
		{
			"label": _("Feedback"),
			"fieldname": "has_feedback",
			"fieldtype": "Check",
			"width": 70,
		},
	]


# ---------------------------------------------------------------------------
# Class Summary
# ---------------------------------------------------------------------------


def _get_class_data(filters):
	where, values = _where(filters)

	prog_order_sql = ", ".join(f"'{p}'" for p in _PROG_ORDER)

	rows = frappe.db.sql(  # nosemgrep
		f"""
        SELECT
            sc.name                         AS class_name,
            sc.skillshub_programme          AS programme,
            sc.skillshub_course             AS course,
            sc.course_run                   AS course_run,
            sc.academic_year                AS academic_year,
            COALESCE(sc.cohort, MIN(e.cohort)) AS cohort,
            sc.complete                     AS complete,
            COUNT(DISTINCT e.name)          AS total_enrolments,
            SUM(e.status = 'Enrolled')      AS enrolled,
            SUM(e.status = 'Completed')     AS completed,
            SUM(e.status = 'Dropped')       AS dropped
        FROM `tabSH Class` sc
        JOIN `tabSH Enrolment` e ON e.class = sc.name
        JOIN `tabSH Student`   s ON s.name  = e.student
        WHERE {where}
        GROUP BY sc.name
        ORDER BY
            sc.academic_year DESC,
            FIELD(sc.skillshub_programme, {prog_order_sql}),
            sc.skillshub_course,
            sc.course_run
        """,
		values,
		as_dict=True,
	)

	if not rows:
		return []

	class_names = [r.class_name for r in rows]

	# Baseline counts — query SH Baseline directly by programme_schedule (= SH Class name)
	bl_map = _counts_by_class("SH Baseline", "programme_schedule", class_names)

	# Feedback counts
	# Most feedback types link directly to SH Class via programme_schedule.
	# SH Soft Skills Feedback uses the retired program_schedule field (old Programme Schedule
	# names) so it must be counted via enrolment_ticket → SH Enrolment.class instead.
	fb_maps = {}
	for key, (doctype, class_field, _prog) in _FB.items():
		if key == "soft_skills":
			fb_maps[key] = _counts_via_enrolment(doctype, class_names)
		else:
			fb_maps[key] = _counts_by_class(doctype, class_field, class_names)

	# Distinct-student counts for the feedback % column — SS students submit multiple forms
	# per session so raw record count / enrolments would exceed 100%.
	ss_distinct = _distinct_students_via_enrolment("SH Soft Skills Feedback", class_names)

	# Programme → which fb key drives the primary feedback % column
	_prog_to_primary_fb = {
		"Mindset Camp": "mindset_camp",
		"Soft Skills Programme": "soft_skills",
		"Vocational Training": "vocational",
		"Remedial Programme: Literacy and Numeracy": "edulution",
	}

	for r in rows:
		cn = r.class_name
		prog = r.programme or ""

		r.baselines = bl_map.get(cn, 0)
		r.baseline_pct = _pct(r.baselines, r.total_enrolments)

		# Show each feedback column only for the relevant programme; None = N/A (renders as —)
		# Use .get(cn, 0) so applicable types with zero submissions show 0, not —
		r.fb_mindset_camp = fb_maps["mindset_camp"].get(cn, 0) if prog == "Mindset Camp" else None
		r.fb_soft_skills = fb_maps["soft_skills"].get(cn, 0) if prog == "Soft Skills Programme" else None
		r.fb_vocational = fb_maps["vocational"].get(cn, 0) if prog == "Vocational Training" else None
		r.fb_edulution = (
			fb_maps["edulution"].get(cn, 0) if prog == "Remedial Programme: Literacy and Numeracy" else None
		)
		r.fb_attachment = fb_maps["attachment"].get(cn, 0) if prog == "Vocational Training" else None

		primary_key = _prog_to_primary_fb.get(prog)
		if prog == "Soft Skills Programme":
			# Use distinct student count so % reflects coverage, not submission volume
			primary_count = ss_distinct.get(cn, 0)
		else:
			primary_count = fb_maps[primary_key].get(cn, 0) if primary_key else 0
		r.feedback_pct = _pct(primary_count, r.total_enrolments)

	return rows


# ---------------------------------------------------------------------------
# Student Detail
# ---------------------------------------------------------------------------


def _get_student_data(filters):
	where, values = _where(filters, include_student=True)

	rows = frappe.db.sql(  # nosemgrep
		f"""
        SELECT
            e.name          AS enrolment_id,
            e.student,
            TRIM(CONCAT(IFNULL(s.first_name, ''), ' ', IFNULL(s.last_name, ''))) AS student_name,
            s.intake_year,
            s.intake_cohort,
            s.programme_path,
            e.class                     AS class_name,
            sc.skillshub_programme      AS programme,
            sc.skillshub_course         AS course,
            sc.course_run,
            sc.academic_year,
            e.status
        FROM `tabSH Enrolment` e
        JOIN `tabSH Student` s   ON s.name  = e.student
        LEFT JOIN `tabSH Class` sc ON sc.name = e.class
        WHERE {where}
        ORDER BY s.intake_year DESC, s.name, sc.academic_year DESC, sc.skillshub_programme
        """,
		values,
		as_dict=True,
	)

	if not rows:
		return []

	enrolment_ids = [r.enrolment_id for r in rows]
	placeholders = ", ".join(["%s"] * len(enrolment_ids))

	# Baseline: does this specific enrolment have a baseline? (keyed by enrolment_ticket)
	bl_set = set()
	try:
		bl_rows = frappe.db.sql(  # nosemgrep
			f"SELECT DISTINCT enrolment_ticket FROM `tabSH Baseline` "
			f"WHERE enrolment_ticket IN ({placeholders})",
			enrolment_ids,
		)
		bl_set = {r[0] for r in bl_rows}
	except Exception:
		pass

	# Feedback: any matching feedback type for this specific enrolment (keyed by enrolment_ticket)
	fb_set = set()
	for _key, (doctype, _field, _prog) in _FB.items():
		try:
			fb_rows = frappe.db.sql(  # nosemgrep
				f"SELECT DISTINCT enrolment_ticket FROM `tab{doctype}` "
				f"WHERE enrolment_ticket IN ({placeholders})",
				enrolment_ids,
			)
			fb_set.update(r[0] for r in fb_rows if r[0])
		except Exception:
			pass

	# Fallback for older records where enrolment_ticket was not filled in:
	# match by (sh_student, class_link_field) for records with no enrolment_ticket.
	all_students = list({r.student for r in rows})
	all_classes = list({r.class_name for r in rows if r.class_name})
	if all_students and all_classes:
		st_ph = ", ".join(["%s"] * len(all_students))
		cl_ph = ", ".join(["%s"] * len(all_classes))
		no_ticket = "(enrolment_ticket IS NULL OR enrolment_ticket = '')"

		bl_fallback = set()
		try:
			bl_fb_rows = frappe.db.sql(  # nosemgrep
				f"SELECT sh_student, programme_schedule FROM `tabSH Baseline` "
				f"WHERE sh_student IN ({st_ph}) AND programme_schedule IN ({cl_ph}) "
				f"AND {no_ticket}",
				all_students + all_classes,
			)
			bl_fallback = {(r[0], r[1]) for r in bl_fb_rows}
		except Exception:
			pass

		fb_fallback = set()
		for _key, (doctype, class_field, _prog) in _FB.items():
			try:
				fb_fb_rows = frappe.db.sql(  # nosemgrep
					f"SELECT sh_student, `{class_field}` FROM `tab{doctype}` "
					f"WHERE sh_student IN ({st_ph}) AND `{class_field}` IN ({cl_ph}) "
					f"AND {no_ticket}",
					all_students + all_classes,
				)
				fb_fallback.update((r[0], r[1]) for r in fb_fb_rows if r[0] and r[1])
			except Exception:
				pass
	else:
		bl_fallback = set()
		fb_fallback = set()

	for r in rows:
		r.has_baseline = 1 if (r.enrolment_id in bl_set or (r.student, r.class_name) in bl_fallback) else 0
		r.has_feedback = 1 if (r.enrolment_id in fb_set or (r.student, r.class_name) in fb_fallback) else 0

	return rows


# ---------------------------------------------------------------------------
# Report summary pills
# ---------------------------------------------------------------------------


def _report_summary(data, view):
	if not data:
		return []

	if view == "Student Detail":
		total = len(data)
		has_bl = sum(1 for r in data if r.get("has_baseline"))
		has_fb = sum(1 for r in data if r.get("has_feedback"))
		enrolled = sum(1 for r in data if r.get("status") == "Enrolled")
		completed = sum(1 for r in data if r.get("status") == "Completed")
		dropped = sum(1 for r in data if r.get("status") == "Dropped")
		return [
			{"value": total, "label": _("Total Enrolments"), "datatype": "Int", "indicator": "Blue"},
			{"value": enrolled, "label": _("Active"), "datatype": "Int", "indicator": "Blue"},
			{"value": completed, "label": _("Completed"), "datatype": "Int", "indicator": "Green"},
			{"value": dropped, "label": _("Dropped"), "datatype": "Int", "indicator": "Red"},
			{"value": has_bl, "label": _("Have Baseline"), "datatype": "Int", "indicator": "Green"},
			{"value": has_fb, "label": _("Have Feedback"), "datatype": "Int", "indicator": "Purple"},
		]

	# Class Summary
	total_enrolments = sum(r.get("total_enrolments") or 0 for r in data)
	total_baselines = sum(r.get("baselines") or 0 for r in data)
	total_classes = len(data)
	completed_classes = sum(1 for r in data if r.get("complete"))
	return [
		{"value": total_classes, "label": _("Classes"), "datatype": "Int", "indicator": "Blue"},
		{
			"value": completed_classes,
			"label": _("Complete"),
			"datatype": "Int",
			"indicator": "Green",
		},
		{
			"value": total_enrolments,
			"label": _("Total Enrolments"),
			"datatype": "Int",
			"indicator": "Blue",
		},
		{
			"value": total_baselines,
			"label": _("Total Baselines"),
			"datatype": "Int",
			"indicator": "Green",
		},
	]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _where(filters, include_student=False):
	conditions = ["1=1"]
	values = {}

	if filters.get("academic_year"):
		conditions.append("sc.academic_year = %(academic_year)s")
		values["academic_year"] = filters.academic_year

	if filters.get("intake_year"):
		conditions.append("s.intake_year = %(intake_year)s")
		values["intake_year"] = filters.intake_year

	if filters.get("cohort"):
		conditions.append("(sc.cohort = %(cohort)s OR (sc.cohort IS NULL AND e.cohort = %(cohort)s))")
		values["cohort"] = filters.cohort

	if filters.get("programme"):
		conditions.append("sc.skillshub_programme = %(programme)s")
		values["programme"] = filters.programme

	if filters.get("course"):
		conditions.append("sc.skillshub_course = %(course)s")
		values["course"] = filters.course

	if filters.get("course_run"):
		conditions.append("sc.course_run = %(course_run)s")
		values["course_run"] = filters.course_run

	if filters.get("programme_path"):
		conditions.append("s.programme_path = %(programme_path)s")
		values["programme_path"] = filters.programme_path

	if filters.get("enrolment_status"):
		conditions.append("e.status = %(enrolment_status)s")
		values["enrolment_status"] = filters.enrolment_status

	if include_student and filters.get("student"):
		conditions.append("s.name = %(student)s")
		values["student"] = filters.student

	return " AND ".join(conditions), values


def _counts_via_enrolment(doctype, class_names):
	"""Count feedback records per SH Class by joining through enrolment_ticket.

	Used for doctypes where the direct class link field stores retired Programme Schedule
	names rather than current SH Class names (e.g. SH Soft Skills Feedback).
	"""
	if not class_names:
		return {}
	placeholders = ", ".join(["%s"] * len(class_names))
	try:
		rows = frappe.db.sql(  # nosemgrep
			f"SELECT e.`class` AS class_name, COUNT(*) AS cnt "
			f"FROM `tab{doctype}` fb "
			f"JOIN `tabSH Enrolment` e ON e.name = fb.enrolment_ticket "
			f"WHERE e.`class` IN ({placeholders}) "
			f"GROUP BY e.`class`",
			class_names,
			as_dict=True,
		)
		return {r.class_name: r.cnt for r in rows}
	except Exception:
		return {}


def _distinct_students_via_enrolment(doctype, class_names):
	"""Count distinct students who submitted at least one feedback record, per SH Class.

	Used for the Feedback % column on doctypes like SH Soft Skills Feedback where students
	submit multiple records per class (one per session), so COUNT(*) would exceed enrolments.
	"""
	if not class_names:
		return {}
	placeholders = ", ".join(["%s"] * len(class_names))
	try:
		rows = frappe.db.sql(  # nosemgrep
			f"SELECT e.`class` AS class_name, COUNT(DISTINCT fb.enrolment_ticket) AS cnt "
			f"FROM `tab{doctype}` fb "
			f"JOIN `tabSH Enrolment` e ON e.name = fb.enrolment_ticket "
			f"WHERE e.`class` IN ({placeholders}) "
			f"GROUP BY e.`class`",
			class_names,
			as_dict=True,
		)
		return {r.class_name: r.cnt for r in rows}
	except Exception:
		return {}


def _counts_by_class(doctype, class_field, class_names):
	"""Count records per SH Class using the direct class link field on the doctype.

	Querying by programme_schedule (the SH Class name stored on each feedback/baseline
	record) is accurate because it reflects exactly which class the record belongs to —
	no student-level JOIN that could inflate counts across multiple enrolments.
	"""
	if not class_names:
		return {}
	placeholders = ", ".join(["%s"] * len(class_names))
	try:
		rows = frappe.db.sql(  # nosemgrep
			f"SELECT `{class_field}` AS class_name, COUNT(*) AS cnt "
			f"FROM `tab{doctype}` "
			f"WHERE `{class_field}` IN ({placeholders}) AND `{class_field}` IS NOT NULL "
			f"GROUP BY `{class_field}`",
			class_names,
			as_dict=True,
		)
		return {r.class_name: r.cnt for r in rows}
	except Exception:
		return {}


def _pct(numerator, denominator):
	if not denominator:
		return 0.0
	return round(100.0 * (numerator or 0) / denominator, 1)
