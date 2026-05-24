# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import cint


class SHApplicant(Document):
	@frappe.whitelist()
	def convert_to_student(self):
		"""
		Convert an Accepted SH Applicant to an SH Student.

		Rules
		-----
		* Applicant status must be 'Accepted'.
		* Cannot convert twice (converted_to_student must be empty).
		* Splits full_name into first / last name on the first space;
		  if only one word, puts it all in first_name.
		* Copies a comprehensive set of fields from the applicant to the
		  new SH Student record where values are present.
		* Sets applicant_record on the new SH Student back to this applicant.
		* Marks this applicant as Converted and stores the new student name.

		Returns the new SH Student name (string).
		"""
		if self.status != "Accepted":
			frappe.throw(
				f"Only Accepted applicants can be converted. This applicant's status is <b>{self.status}</b>."
			)

		if self.converted_to_student:
			frappe.throw(
				f"This applicant has already been converted to student "
				f"<a href='/app/sh-student/{self.converted_to_student}'>"
				f"{self.converted_to_student}</a>."
			)

		# Check if a student with the same email already exists
		if self.personal_email:
			existing = frappe.db.get_value("SH Student", {"personal_email": self.personal_email}, "name")
			if existing:
				frappe.throw(
					f"A student with email <b>{self.personal_email}</b> already exists: "
					f"<a href='/app/sh-student/{existing}'>{existing}</a>. "
					f"Link the applicant manually if needed."
				)

		# Split full_name into first_name / last_name
		name_parts = (self.full_name or "").strip().split(" ", 1)
		first_name = name_parts[0] if name_parts else ""
		last_name = name_parts[1] if len(name_parts) > 1 else ""

		# Build the base student document
		student_doc = {
			"doctype": "SH Student",
			"naming_series": "SH.YY.####",
			"first_name": first_name,
			"last_name": last_name,
			"status": "Student",
			"applicant_record": self.name,
		}

		# Direct field mappings: applicant_fieldname -> student_fieldname
		field_map = {
			"mobile": "mobile",
			"personal_email": "personal_email",
			"residential_area": "address_line_1",
			"guardian_name": "guardian_name",
			"guardian_mobile": "guardian_mobile_number",
			"guardian_occupation": "guardian_occupation",
			"guardian_relationship": "relationship",
			"household_income": "household_income",
			"housing_status": "housing_status",
			"number_of_siblings": "number_of_siblings",
			"highest_level_of_schooling": "highest_level_of_schooling",
			"last_school_attended": "last_school_attended",
			"can_read_and_write": "can_read_and_write",
			"has_vocational_training_history": "has_vocational_training_history",
			"vocational_training_details": "vocational_training_received",
			"nrc_number": "nrc_number",
			"intake_year": "intake_year",
			"intake_cohort": "intake_cohort",
			"date_of_birth": "date_of_birth",
		}

		for applicant_field, student_field in field_map.items():
			value = getattr(self, applicant_field, None)
			if (
				value is not None and value != "" and value != 0
			) or applicant_field == "has_vocational_training_history":
				# For Check fields, include even when 0 so the value is explicit
				if applicant_field == "has_vocational_training_history":
					student_doc[student_field] = cint(value)
				else:
					if value is not None and value != "":
						student_doc[student_field] = value

		# Map household_receives_financial_aid (Yes/No/Maybe) to integer (1/0/0)
		financial_aid = getattr(self, "household_receives_financial_aid", None)
		if financial_aid is not None:
			student_doc["household_receives_financial_aid"] = 1 if financial_aid == "Yes" else 0

		# Create the SH Student document
		student = frappe.get_doc(student_doc)
		student.insert(ignore_permissions=True)

		# Mark applicant as converted
		frappe.db.set_value(
			"SH Applicant", self.name, {"status": "Converted", "converted_to_student": student.name}
		)
		self.reload()

		frappe.msgprint(
			f"Student <a href='/app/sh-student/{student.name}'>{student.name}</a> created successfully.",
			title="Conversion Complete",
			indicator="green",
		)
		return student.name
