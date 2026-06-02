# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class SHEnrolment(Document):
	def autoname(self):
		"""
		Force the name to {student}-{class} reliably.

		The DocType autoname expression {student}-{class} fails when
		created server-side because `class` is a Python reserved word —
		the ORM never writes it to the document object at autoname time,
		so the expression resolves to {student}-None and Frappe falls
		back to a random hash.

		Setting self.name here runs before Frappe's expression evaluator
		and takes precedence for both single and bulk enrolments.
		"""
		student = self.student
		class_name = self.get("class")
		if student and class_name:
			self.name = student + "-" + class_name

	def validate(self):
		self.validate_duplicate_enrolment()
		self.validate_path_b_not_edulution()
		self.compute_attendance_stats()

	def validate_duplicate_enrolment(self):
		"""Enforce unique constraint: one enrolment per student per class."""
		class_name = self.get("class")
		existing = frappe.db.exists(
			"SH Enrolment",
			{
				"student": self.student,
				"class": class_name,
				"name": ["!=", self.name],
			},
		)
		if existing:
			frappe.throw(_("Student {0} is already enrolled in Class {1}.").format(self.student, class_name))

	def validate_path_b_not_edulution(self):
		"""Path B students must not be enrolled in an Edulution class."""
		# Check self.course (Link → SkillsHub Course), not self.milestone
		# (which is a Link → SkillsHub Programme e.g. "Remedial Programme: Literacy and Numeracy")
		if self.programme_path == "Path B" and self.course == "Edulution":
			frappe.throw(_("Path B students cannot be enrolled in an Edulution class."))

	def compute_attendance_stats(self):
		"""Recompute attendance totals from SH Attendance records for this class."""
		class_name = self.get("class")
		if not (self.student and class_name):
			return

		stats = frappe.db.sql(
			"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'Present' OR status = 'Late' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent
            FROM `tabSH Attendance`
            WHERE sh_student = %s
              AND sh_programme_schedule = %s
            """,
			(self.student, class_name),
			as_dict=True,
		)

		if stats:
			row = stats[0]
			self.sessions_total = int(row.total or 0)
			self.sessions_present = int(row.present or 0)
			self.sessions_absent = int(row.absent or 0)
			self.attendance_rate = (
				round((self.sessions_present / self.sessions_total) * 100, 2) if self.sessions_total else 0.0
			)


@frappe.whitelist()  # nosemgrep
def recompute_enrolment_stats(enrolment_name):
	"""Manually trigger attendance stat recomputation for a single enrolment."""
	doc = frappe.get_doc("SH Enrolment", enrolment_name)
	doc.compute_attendance_stats()
	doc.save(ignore_permissions=True)
	return {"sessions_total": doc.sessions_total, "attendance_rate": doc.attendance_rate}
