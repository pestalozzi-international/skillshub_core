# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SHProgrammeSchedule(Document):

    def autoname(self):
        if not self.course_code or not self.cohort_code or not self.academic_year:
            frappe.throw("Course, Cohort, and Academic Year are required before saving.")

        count = frappe.db.count(
            "SH Programme Schedule",
            {
                "course_code": self.course_code,
                "cohort_code": self.cohort_code,
                "academic_year": self.academic_year,
                "name": ("!=", self.name or "")
            }
        ) + 1
        self.name = f"{self.course_code}-{self.cohort_code}-{self.academic_year}-{count:02d}"