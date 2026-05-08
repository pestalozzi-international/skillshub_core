# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class SHEnrolment(Document):
    def validate(self):
        self.validate_duplicate_enrolment()
        self.validate_path_b_not_edulution()
        self.compute_attendance_stats()

    def after_insert(self):
        self.update_programme_schedule_roster()

    def validate_duplicate_enrolment(self):
        """Enforce unique constraint: one enrolment per student per programme schedule."""
        existing = frappe.db.exists(
            "SH Enrolment",
            {
                "student": self.student,
                "programme_schedule": self.programme_schedule,
                "name": ["!=", self.name],
            },
        )
        if existing:
            frappe.throw(
                _("Student {0} is already enrolled in Programme Schedule {1}.").format(
                    self.student, self.programme_schedule
                )
            )

    def validate_path_b_not_edulution(self):
        """Path B students must not be enrolled in an Edulution Programme Schedule."""
        if self.programme_path == "Path B" and self.milestone == "Edulution":
            frappe.throw(_("Path B students cannot be enrolled in an Edulution Programme Schedule."))

    def compute_attendance_stats(self):
        """Recompute attendance totals from SH Student Attendance records for this schedule."""
        if not (self.student and self.programme_schedule):
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
            (self.student, self.programme_schedule),
            as_dict=True,
        )

        if stats:
            row = stats[0]
            self.sessions_total = int(row.total or 0)
            self.sessions_present = int(row.present or 0)
            self.sessions_absent = int(row.absent or 0)
            self.attendance_rate = (
                round((self.sessions_present / self.sessions_total) * 100, 2)
                if self.sessions_total
                else 0.0
            )

    def update_programme_schedule_roster(self):
        """Sync this student into the enrolled_students child table on the Programme Schedule."""
        if not (self.student and self.programme_schedule):
            return

        schedule = frappe.get_doc("SH Class", self.programme_schedule)
        existing_students = [row.student for row in (schedule.enrolled_students or [])]

        if self.student not in existing_students:
            schedule.append(
                "enrolled_students",
                {
                    "student": self.student,
                    "student_name": self.student_name,
                    "enrolment_date": self.enrolment_date,
                    "active": 1,
                },
            )
            schedule.save(ignore_permissions=True)


@frappe.whitelist()
def recompute_enrolment_stats(enrolment_name):
    """Manually trigger attendance stat recomputation for a single enrolment."""
    doc = frappe.get_doc("SH Enrolment", enrolment_name)
    doc.compute_attendance_stats()
    doc.save(ignore_permissions=True)
    return {"sessions_total": doc.sessions_total, "attendance_rate": doc.attendance_rate}
