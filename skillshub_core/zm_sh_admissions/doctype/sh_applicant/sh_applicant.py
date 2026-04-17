# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SHApplicant(Document):

    @frappe.whitelist()
    def convert_to_student(self):
        """
        Convert an Accepted SH Applicant to an SH Student.

        Rules
        -----
        * Applicant status must be 'Accepted'.
        * Cannot convert twice (converted_to_student must be empty).
        * Tries to split full_name into first / last name on the first space;
          if only one word, puts it all in first_name.
        * Copies email → personal_email, center → notes the center in a
          description field if SH Student ever gains one (for now ignored).
        * Sets applicant_record on the new SH Student back to this applicant.
        * Marks this applicant as Converted and stores the new student name.

        Returns the new SH Student name (string).
        """
        if self.status != "Accepted":
            frappe.throw(
                f"Only Accepted applicants can be converted. "
                f"This applicant's status is <b>{self.status}</b>."
            )

        if self.converted_to_student:
            frappe.throw(
                f"This applicant has already been converted to student "
                f"<a href='/app/sh-student/{self.converted_to_student}'>"
                f"{self.converted_to_student}</a>."
            )

        # Check if a student with the same email already exists
        if self.email:
            existing = frappe.db.get_value(
                "SH Student", {"personal_email": self.email}, "name"
            )
            if existing:
                frappe.throw(
                    f"A student with email <b>{self.email}</b> already exists: "
                    f"<a href='/app/sh-student/{existing}'>{existing}</a>. "
                    f"Link the applicant manually if needed."
                )

        # Split full_name into first_name / last_name
        name_parts  = (self.full_name or "").strip().split(" ", 1)
        first_name  = name_parts[0] if name_parts else ""
        last_name   = name_parts[1] if len(name_parts) > 1 else ""

        # Create the SH Student document
        student = frappe.get_doc({
            "doctype":          "SH Student",
            "first_name":       first_name,
            "last_name":        last_name,
            "personal_email":   self.email or "",
            "status":           "Student",
            "applicant_record": self.name,
            "naming_series":    "SH.YY.####"
        })
        student.insert(ignore_permissions=True)

        # Mark applicant as converted
        frappe.db.set_value(
            "SH Applicant",
            self.name,
            {
                "status":               "Converted",
                "converted_to_student": student.name
            }
        )
        self.reload()

        frappe.msgprint(
            f"Student <a href='/app/sh-student/{student.name}'>{student.name}</a> "
            f"created successfully.",
            title="Conversion Complete",
            indicator="green"
        )
        return student.name
