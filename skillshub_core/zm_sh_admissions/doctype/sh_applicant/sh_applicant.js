// Copyright (c) 2026, PI Dev and contributors
// For license information, please see license.txt

frappe.ui.form.on("SH Applicant", {
	refresh(frm) {
		_update_intro(frm);

		// Show 'Convert to Student' only for Accepted applicants not yet converted
		if (!frm.is_new() && frm.doc.status === "Accepted" && !frm.doc.converted_to_student) {
			frm.add_custom_button(__("Convert to Student"), function () {
				_do_conversion(frm);
			});
			frm.page.set_primary_action(__("Convert to Student"), function () {
				_do_conversion(frm);
			});
		}

		// If already converted, show a link to the student record
		if (frm.doc.converted_to_student) {
			frm.set_intro(
				`Already converted — <a href="/app/sh-student/${encodeURIComponent(
					frm.doc.converted_to_student
				)}">${frm.doc.converted_to_student}</a>`,
				"green"
			);
		}
	},
});

function _update_intro(frm) {
	const STATUS_COLORS = {
		Draft: "gray",
		Submitted: "blue",
		"Under Review": "yellow",
		Accepted: "green",
		Rejected: "red",
		Waitlisted: "orange",
		Converted: "purple",
	};
	if (frm.doc.status && !frm.doc.converted_to_student) {
		frm.set_intro(`Status: <b>${frm.doc.status}</b>`, STATUS_COLORS[frm.doc.status] || "blue");
	}
}

function _do_conversion(frm) {
	frappe.confirm(
		__(
			`Convert <b>${frm.doc.full_name}</b> to an SH Student record?<br><br>` +
				`This will create a new student with status <b>Student</b> ` +
				`and mark this applicant as <b>Converted</b>.`
		),
		function () {
			frappe.call({
				method: "convert_to_student",
				doc: frm.doc,
				freeze: true,
				freeze_message: __("Creating student record…"),
				callback: function (r) {
					if (r.message) {
						frm.reload_doc();
						// Open the new student record in a new tab
						setTimeout(function () {
							window.open(
								`/app/sh-student/${encodeURIComponent(r.message)}`,
								"_blank"
							);
						}, 800);
					}
				},
			});
		}
	);
}
