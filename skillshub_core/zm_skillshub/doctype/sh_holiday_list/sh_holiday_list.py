# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
import requests
from frappe.model.document import Document

CALENDARIFIC_API_KEY = "FSSuEcYGKpu29AXJhtNi9mhaOtiNByf9"


class SHHolidayList(Document):
	@frappe.whitelist()
	def fetch_holidays(self):
		if not self.academic_year:
			frappe.throw("Please set an <b>Academic Year</b> before fetching holidays.")  # nosemgrep

		is_current = frappe.db.get_value("SH Academic Year", self.academic_year, "current")
		if not is_current:
			frappe.throw(
				f"Academic Year <b>{self.academic_year}</b> is not marked as "
				f"<b>Current</b> in the SH Academic Year doctype. "
				f"Please mark it as current before fetching."
			)

		current_year = str(frappe.utils.now_datetime().year)
		if str(self.academic_year) != current_year:
			frappe.throw(
				f"Academic Year <b>{self.academic_year}</b> does not match "
				f"the current calendar year <b>{current_year}</b>. "
				f"Holidays can only be fetched for the active year."
			)

		try:
			response = requests.get(
				"https://calendarific.com/api/v2/holidays",
				params={"api_key": CALENDARIFIC_API_KEY, "country": "ZM", "year": current_year},
				timeout=15,
			)
			response.raise_for_status()
			data = response.json()
		except requests.exceptions.Timeout:
			frappe.throw("The request timed out. Check your server internet connection and try again.")  # nosemgrep
		except requests.exceptions.RequestException as e:
			frappe.throw(f"Failed to reach Calendarific API: {e!s}")

		if data.get("meta", {}).get("code") != 200:
			error_detail = data.get("meta", {}).get("error_detail", "Unknown API error")
			frappe.throw(f"Calendarific API error: {error_detail}")

		holidays = data.get("response", {}).get("holidays", [])
		if not holidays:
			frappe.msgprint("No holidays returned by the API for Zambia.")  # nosemgrep
			return

		self.set("holidays", [])
		count = 0

		for h in holidays:
			if h.get("primary_type") != "Public Holiday":
				continue

			date_iso = h["date"]["iso"][:10]
			self.append(
				"holidays",
				{
					"holiday_name": h.get("name"),
					"holiday_date": date_iso,
					"description": h.get("description", ""),
					"type": "National holiday",
				},
			)
			count += 1

		self.save()

		frappe.msgprint(f"✅ <b>{count}</b> public holidays fetched and saved for <b>{current_year}</b>.")
