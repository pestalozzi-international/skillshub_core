"""
Backfill sh_class from program_schedule on SH Soft Skills Feedback.

The DocType JSON renamed program_schedule → sh_class; bench migrate
creates the new column automatically. This patch copies the data from
the old column into the new one so no records lose their class link.
"""

import frappe


def execute():
	if not frappe.db.has_column("SH Soft Skills Feedback", "program_schedule"):
		return  # already cleaned up or never existed

	frappe.db.sql(
		"""
        UPDATE `tabSH Soft Skills Feedback`
        SET `sh_class` = `program_schedule`
        WHERE (`sh_class` IS NULL OR `sh_class` = '')
          AND `program_schedule` IS NOT NULL
          AND `program_schedule` != ''
        """
	)
	frappe.db.commit()
