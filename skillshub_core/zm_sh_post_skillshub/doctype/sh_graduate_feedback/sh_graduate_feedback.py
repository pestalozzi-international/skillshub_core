# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import today


class SHGraduateFeedback(Document):
	def before_insert(self):
		if not self.date_submitted:
			self.date_submitted = today()
