// Copyright (c) 2026, PI Dev and contributors
// For license information, please see license.txt

frappe.ui.form.on("SH Attendance", {

    refresh(frm) {
        _update_stats_intro(frm);

        if (!frm.is_new() && frm.doc.sh_programme_schedule && frm.doc.date) {
            frm.add_custom_button(__("Mark Attendance"), function () {
                _open_attendance_dialog(frm);
            });
            // Make it prominent
            frm.page.set_primary_action(__("Mark Attendance"), function () {
                _open_attendance_dialog(frm);
            });
        }
    },

    sh_programme_schedule(frm) {
        if (!frm.doc.date) {
            frm.set_value("date", frappe.datetime.get_today());
        }
    }

});


// ─── Stats intro bar ────────────────────────────────────────────────────────
function _update_stats_intro(frm) {
    const total   = frm.doc.total_students  || 0;
    const present = frm.doc.present_count   || 0;
    const absent  = frm.doc.absent_count    || 0;
    const leave   = frm.doc.leave_count     || 0;
    const rate    = frm.doc.attendance_rate || 0;

    if (total > 0) {
        frm.set_intro(
            `<b>Session total:</b> ${total} &nbsp;|&nbsp; ` +
            `<span style="color:green"><b>Present:</b> ${present}</span> &nbsp;|&nbsp; ` +
            `<span style="color:red"><b>Absent:</b> ${absent}</span> &nbsp;|&nbsp; ` +
            `<span style="color:orange"><b>Leave:</b> ${leave}</span> &nbsp;|&nbsp; ` +
            `<b>Rate:</b> <span style="color:${rate >= 80 ? 'green' : rate >= 60 ? 'orange' : 'red'}">${rate}%</span>`,
            "blue"
        );
    }
}


// ─── Mark Attendance dialog ──────────────────────────────────────────────────
function _open_attendance_dialog(frm) {
    frappe.call({
        method: "get_session_attendance",
        doc: frm.doc,
        freeze: true,
        freeze_message: __("Loading student list…"),
        callback: function (r) {
            if (!r.message || !r.message.length) {
                frappe.msgprint(__("No enrolled students found for this schedule."));
                return;
            }
            _show_attendance_dialog(frm, r.message);
        }
    });
}


function _show_attendance_dialog(frm, students) {
    const STATUS_OPTS   = ["Present", "Absent", "Leave", "Late"];
    const STATUS_COLORS = { Present: "green", Absent: "red", Leave: "orange", Late: "#0070c0" };

    // ── Build the HTML table ──────────────────────────────────────────────
    let rows_html = students.map((s, i) => {
        const opts = STATUS_OPTS.map(o =>
            `<option value="${o}" ${s.status === o ? "selected" : ""}>${o}</option>`
        ).join("");
        const late_visible = s.status === "Late" ? "" : "display:none;";
        return `
        <tr data-idx="${i}">
            <td style="width:32px;text-align:center;color:#888">${i + 1}</td>
            <td>
                <b>${frappe.utils.escape_html(s.full_name)}</b><br>
                <small class="text-muted">${frappe.utils.escape_html(s.student)}</small>
            </td>
            <td style="width:120px">
                <select class="form-control input-xs att-status" data-idx="${i}">
                    ${opts}
                </select>
            </td>
            <td style="width:80px">
                <input type="number" class="form-control input-xs att-late" data-idx="${i}"
                       value="${s.late_minutes || 0}" min="0" max="999"
                       style="${late_visible}">
            </td>
        </tr>`;
    }).join("");

    const table_html = `
        <div style="margin-bottom:8px;display:flex;gap:6px;">
            <button class="btn btn-xs btn-success mark-all-btn" data-status="Present">✓ All Present</button>
            <button class="btn btn-xs btn-danger  mark-all-btn" data-status="Absent" >✗ All Absent</button>
            <button class="btn btn-xs btn-warning mark-all-btn" data-status="Leave"  >⏸ All Leave</button>
        </div>
        <div style="max-height:420px;overflow-y:auto;">
        <table class="table table-bordered table-condensed" style="margin-bottom:0">
            <thead style="position:sticky;top:0;background:#f5f5f5;">
                <tr>
                    <th style="width:32px">#</th>
                    <th>Student</th>
                    <th style="width:120px">Status</th>
                    <th style="width:80px">Late&nbsp;(min)</th>
                </tr>
            </thead>
            <tbody>${rows_html}</tbody>
        </table>
        </div>`;

    // ── Build dialog ─────────────────────────────────────────────────────
    const dialog = new frappe.ui.Dialog({
        title: __(`Mark Attendance — ${frm.doc.sh_programme_schedule} — ${frm.doc.date}`),
        size: "large",
        fields: [{
            fieldtype: "HTML",
            fieldname: "att_table_html",
            options: table_html
        }],
        primary_action_label: __(`Save ${students.length} Records`),
        primary_action() {
            const collected = _collect_rows(dialog, students);
            _do_save(frm, dialog, collected);
        }
    });

    dialog.show();

    // ── Event bindings ────────────────────────────────────────────────────
    // Mark-all buttons
    dialog.$wrapper.find(".mark-all-btn").on("click", function () {
        const s = $(this).data("status");
        dialog.$wrapper.find(".att-status").val(s).trigger("change");
    });

    // Toggle late_minutes visibility
    dialog.$wrapper.on("change", ".att-status", function () {
        const idx = $(this).data("idx");
        const show = $(this).val() === "Late";
        dialog.$wrapper.find(`.att-late[data-idx="${idx}"]`).toggle(show);
    });

    // Colour-code status selects on change
    dialog.$wrapper.on("change", ".att-status", function () {
        const val = $(this).val();
        $(this).css("color", STATUS_COLORS[val] || "");
    });

    // Initialise colours
    dialog.$wrapper.find(".att-status").each(function () {
        const val = $(this).val();
        $(this).css("color", STATUS_COLORS[val] || "");
    });
}


function _collect_rows(dialog, students) {
    const result = [];
    dialog.$wrapper.find("tr[data-idx]").each(function () {
        const idx    = parseInt($(this).data("idx"));
        const status = $(this).find(".att-status").val();
        const late   = parseInt($(this).find(".att-late").val() || 0);
        result.push({
            student:      students[idx].student,
            full_name:    students[idx].full_name,
            status:       status,
            late_minutes: late
        });
    });
    return result;
}


function _do_save(frm, dialog, rows) {
    frappe.call({
        method: "save_session_attendance",
        doc: frm.doc,
        args: { rows: JSON.stringify(rows) },
        freeze: true,
        freeze_message: __("Saving attendance records…"),
        callback: function (r) {
            if (r.message) {
                const c = r.message;
                const had_errors = c.errors > 0;
                frappe.show_alert({
                    message: __(`Attendance saved — Created: ${c.created}, Updated: ${c.updated}`) +
                             (had_errors ? __(`, Errors: ${c.errors} (check Error Log)`) : ""),
                    indicator: had_errors ? "orange" : "green"
                }, 7);
                dialog.hide();
                frm.reload_doc();
            }
        }
    });
}
