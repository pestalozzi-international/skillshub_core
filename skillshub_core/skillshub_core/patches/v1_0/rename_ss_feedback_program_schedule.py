"""
Rename program_schedule → sh_class on SH Soft Skills Feedback.

The old fieldname used American spelling and an ambiguous label.
The DB column is renamed; data was already corrected in the console
prior to this patch (enrolment_ticket JOIN used to backfill values).
"""

import frappe


def execute():
	frappe.rename_field("SH Soft Skills Feedback", "program_schedule", "sh_class")
