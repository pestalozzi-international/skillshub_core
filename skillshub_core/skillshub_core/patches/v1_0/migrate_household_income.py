import frappe

RANGE_VALUES = {
	"Less than 500",
	"500 to 1000",
	"1000 to 1500",
	"1500 to 2000",
	"2000+",
}


def _to_range(num):
	if num < 500:
		return "Less than 500"
	if num < 1000:
		return "500 to 1000"
	if num < 1500:
		return "1000 to 1500"
	if num < 2000:
		return "1500 to 2000"
	return "2000+"


def execute():
	if not frappe.db.has_column("SH Student", "household_income"):
		return

	# Create household_income_range column before model sync does it,
	# so we can write range data into it now
	if not frappe.db.has_column("SH Student", "household_income_range"):
		frappe.db.sql("ALTER TABLE `tabSH Student` ADD COLUMN `household_income_range` varchar(140)")

	rows = frappe.db.sql(
		"SELECT name, household_income FROM `tabSH Student`"
		" WHERE household_income IS NOT NULL AND household_income != ''",
		as_dict=True,
	)

	for row in rows:
		val = (row.household_income or "").strip()

		if val in RANGE_VALUES:
			frappe.db.sql(
				"UPDATE `tabSH Student`"
				" SET household_income_range = %s, household_income = NULL"
				" WHERE name = %s",
				(val, row.name),
			)
			continue

		# Try to parse as a numeric value
		num_str = val.replace("K", "").replace("k", "").replace(",", "").strip()
		try:
			num = float(num_str)
			range_val = _to_range(num)
			frappe.db.sql(
				"UPDATE `tabSH Student`"
				" SET household_income_range = %s, household_income = %s"
				" WHERE name = %s",
				(range_val, num, row.name),
			)
		except ValueError:
			# Unparseable — preserve in range field, clear income
			frappe.db.sql(
				"UPDATE `tabSH Student`"
				" SET household_income_range = %s, household_income = NULL"
				" WHERE name = %s",
				(val, row.name),
			)

	frappe.db.commit()
