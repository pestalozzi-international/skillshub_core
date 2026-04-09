// Copyright (c) 2026, PI Dev and contributors
// For license information, please see license.txt

frappe.ui.form.on("SH Attendance", {

    refresh(frm) {
        // Summary bar — always show if rows exist
        if (frm.doc.student_attendance && frm.doc.student_attendance.length) {
            const present = frm.doc.present_count || 0;
            const absent  = frm.doc.absent_count  || 0;
            const leave   = frm.doc.leave_count   || 0;
            const total   = frm.doc.student_attendance.length;
            frm.set_intro(
                `<b>Total:</b> ${total} &nbsp;|&nbsp; ` +
                `<span style="color:green"><b>Present:</b> ${present}</span> &nbsp;|&nbsp; ` +
                `<span style="color:red"><b>Absent:</b> ${absent}</span> &nbsp;|&nbsp; ` +
                `<span style="color:orange"><b>Leave:</b> ${leave}</span>`,
                "blue"
            );

            frm.add_custom_button(__("Mark All Present"), function () {
                frm.doc.student_attendance.forEach(row => {
                    frappe.model.set_value(row.doctype, row.name, "status", "Present");
                });
                frm.refresh_field("student_attendance");
            }, __("Tools"));

            frm.add_custom_button(__("Mark All Absent"), function () {
                frm.doc.student_attendance.forEach(row => {
                    frappe.model.set_value(row.doctype, row.name, "status", "Absent");
                });
                frm.refresh_field("student_attendance");
            }, __("Tools"));
        }

        // "Fetch Students" always visible when a schedule is set —
        // regardless of whether the table is empty or already populated
        if (frm.doc.sh_programme_schedule) {
            frm.add_custom_button(__("Fetch Students"), function () {
                fetch_students(frm, false);
            }, __("Tools"));

            frm.add_custom_button(__("Re-fetch (Clear & Reload)"), function () {
                frappe.confirm(
                    __("This will clear existing rows and re-fetch from the schedule. Continue?"),
                    function () {
                        fetch_students(frm, true);
                    }
                );
            }, __("Tools"));
        }
    },

    sh_programme_schedule(frm) {
        if (!frm.doc.date) {
            frm.set_value("date", frappe.datetime.get_today());
        }
        // Clear table and fetch fresh on schedule change
        frm.clear_table("student_attendance");
        frm.refresh_field("student_attendance");

        if (frm.doc.sh_programme_schedule) {
            fetch_students(frm, false);
        }
    }
});


// Shared fetch function
// clear_first: true = wipe existing rows before adding (Re-fetch)
//              false = append only missing students (Fetch Students)
function fetch_students(frm, clear_first) {
    frappe.call({
        method: "populate_from_schedule",
        doc: frm.doc,
        freeze: true,
        freeze_message: __("Fetching students from schedule..."),
        callback: function (r) {
            if (!r.message || !r.message.length) return;

            if (clear_first) {
                frm.clear_table("student_attendance");
            }

            // Build set of already-present students to avoid duplicates
            const existing = new Set(
                (frm.doc.student_attendance || []).map(row => row.student)
            );

            let added = 0;
            r.message.forEach(s => {
                if (!existing.has(s.name)) {
                    let row = frm.add_child("student_attendance");
                    row.student = s.name;
                    row.full_name = s.student_name;
                    row.status = "Present";
                    added++;
                }
            });

            frm.refresh_field("student_attendance");

            if (added > 0) {
                frappe.show_alert({
                    message: `${added} student(s) loaded — edit statuses then Save.`,
                    indicator: "blue"
                }, 5);
            } else {
                frappe.show_alert({
                    message: "All students already in the table.",
                    indicator: "orange"
                }, 4);
            }
        }
    });
}