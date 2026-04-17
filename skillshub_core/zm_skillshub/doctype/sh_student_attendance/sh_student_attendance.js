// Copyright (c) 2026, PI Dev and contributors
// For license information, please see license.txt

frappe.ui.form.on("SH Student Attendance", {

    refresh(frm) {
        if (!frm.is_new()) {
            const color = {
                Present: "green",
                Absent:  "red",
                Leave:   "orange",
                Late:    "yellow"
            }[frm.doc.status] || "grey";
            frm.set_intro(
                `<b>Status:</b> <span style="color:${color};font-weight:bold;">${frm.doc.status || "—"}</span>`,
                color
            );
        }
    },

    sh_student(frm) {
        if (frm.doc.sh_student && !frm.doc.sh_programme_schedule) {
            // Prefill schedule from the student's current schedule
            frappe.db.get_value("SH Student", frm.doc.sh_student, "current_schedule")
                .then(r => {
                    if (r.message && r.message.current_schedule) {
                        frm.set_value("sh_programme_schedule", r.message.current_schedule);
                    }
                });
        }
    },

    sh_programme_schedule(frm) {
        if (!frm.doc.date) {
            frm.set_value("date", frappe.datetime.get_today());
        }
    }
});
