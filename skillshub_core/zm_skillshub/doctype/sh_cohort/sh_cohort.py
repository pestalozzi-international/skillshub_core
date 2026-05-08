# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SHCohort(Document):  # ← capital H

    def autoname(self):
        if not self.cohort_name:
            frappe.throw("Cohort Name is required.")
        self.name = self.cohort_name

    def before_save(self):
        self.compute_code()

    def compute_code(self):
        if self.cohort_name:
            number = self.cohort_name.replace("Cohort ", "").strip()
            self.code = f"C{number}"