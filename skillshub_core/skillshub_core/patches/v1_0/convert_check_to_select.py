import frappe


def _convert_field(field, mapping):
	if not frappe.db.has_column("SH Student", field):
		return
	for old_val, new_val in mapping.items():
		frappe.db.set_value(
			"SH Student",
			{field: old_val},
			field,
			new_val,
			update_modified=False,
		)


def execute():
	# After model sync, Check (tinyint) columns have been altered to Select (varchar).
	# MySQL converts 1 → "1" and 0 → "0". Map these to meaningful labels.
	_convert_field("can_read_and_write", {"1": "Yes", "0": "No"})
	_convert_field("household_receives_financial_aid", {"1": "Yes", "0": "No"})
	_convert_field("has_history_of_medical_conditions", {"1": "Yes", "0": "No"})
	frappe.db.commit()
