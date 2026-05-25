// Copyright (c) 2026, PI Dev and contributors
// For license information, please see license.txt

// frappe.ui.form.on("SH Student", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("SH Student", {
	refresh(frm) {
		if (!frm.is_new() && frm.doc.name) {
			frm.add_custom_button(
				__("Open Portal Admin Profile"),
				function () {
					var url = "/skillshub/admin/student?id=" + encodeURIComponent(frm.doc.name);
					window.open(url, "_blank");
				},
				__("Actions"),
			);
		}
	},
});
