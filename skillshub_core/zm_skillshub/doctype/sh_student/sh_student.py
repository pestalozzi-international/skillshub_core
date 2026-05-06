# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.website.website_generator import WebsiteGenerator
from frappe.model.document import Document



class SHStudent(Document):
    def before_save(self):
        self.update_programme_path_from_enrolment()

    def update_programme_path_from_enrolment(self):
        """Sync programme_path (read-only) from the most recent active SH Student Enrolment."""
        if not self.name or self.is_new():
            return

        latest_path = frappe.db.get_value(
            "SH Student Enrolment",
            filters={"student": self.name, "status": "Enrolled"},
            fieldname="programme_path",
            order_by="enrolment_date desc",
        )
        if latest_path:
            self.programme_path = latest_path
