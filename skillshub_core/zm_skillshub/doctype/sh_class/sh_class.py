# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SHClass(Document):

    def autoname(self):
        """
        fetch_from (Read Only) fields such as course_code and cohort_code are
        NOT populated at autoname() time — Frappe fills them AFTER naming.
        We therefore query the linked Course and Cohort docs directly.
        """
        if not self.skillshub_course or not self.cohort or not self.academic_year:
            frappe.throw(
                "Course, Cohort, and Academic Year are required before saving."
            )

        course_code = frappe.db.get_value(
            "SkillsHub Course", self.skillshub_course, "course_code"
        )
        cohort_code = frappe.db.get_value(
            "SkillsHub Cohort", self.cohort, "cohort_code"
        )

        if not course_code:
            frappe.throw(
                f"Course <b>{self.skillshub_course}</b> has no Course Code set. "
                f"Please add a Course Code to the SkillsHub Course record first."
            )
        if not cohort_code:
            frappe.throw(
                f"Cohort <b>{self.cohort}</b> has no Cohort Code set. "
                f"Please add a Cohort Code to the SkillsHub Cohort record first."
            )

        # Count existing schedules for the same course+cohort+year to get
        # a sequence number. Filter on Link fields (not fetch-from fields).
        count = frappe.db.count(
            "SH Programme Schedule",
            {
                "skillshub_course": self.skillshub_course,
                "cohort":           self.cohort,
                "academic_year":    self.academic_year,
                "name":             ("!=", self.name or "")
            }
        ) + 1

        self.name = f"{course_code}-{cohort_code}-{self.academic_year}-{count:02d}"
