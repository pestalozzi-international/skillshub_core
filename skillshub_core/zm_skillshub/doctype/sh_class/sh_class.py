# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class SHClass(Document):
    def autoname(self):
        # Fetch the code manually from the linked doctype if it isn't loaded yet
        if not self.course_code and self.skillshub_course:
            self.course_code = frappe.db.get_value("SkillsHub Course", self.skillshub_course, "course_code")
            
        if not self.course_code or not self.course_run:
            frappe.throw("Course Code and Course Run are required to generate the Class ID.")
            
        class_suffix = self.class_no or "A"
        
        # Manually set the primary key string
        self.name = f"{self.course_code}-{self.course_run}{class_suffix}"
