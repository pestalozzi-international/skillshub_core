// Copyright (c) 2026, PI Dev and contributors
// For license information, please see license.txt

frappe.ui.form.on("SH Holiday List", {
	refresh(frm) {
		// Only show button when academic year is set
		if (frm.doc.academic_year) {
			frm.add_custom_button(
				__("Fetch Holidays"),
				function () {
					frappe.confirm(
						__(
							"This will <b>clear all existing holidays</b> and re-fetch from Calendarific for <b>{0}</b>.<br><br>Continue?",
							[frm.doc.academic_year],
						),
						function () {
							frappe.call({
								method: "fetch_holidays",
								doc: frm.doc,
								freeze: true,
								freeze_message: __(
									"Fetching Zambia public holidays from Calendarific...",
								),
								callback: function () {
									frm.reload_doc();
								},
							});
						},
					);
				},
				__("Tools"),
			);
		}
	},
});
