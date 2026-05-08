# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
import datetime
from frappe.model.document import Document
from frappe.utils import flt


class SHAttendance(Document):

    def autoname(self):
        if not self.sh_student or not self.sh_programme_schedule or not self.date:
            frappe.throw("Student, Programme Schedule and Date are required.")
        date_str = str(self.date)[:10]
        self.name = f"SA-{self.sh_programme_schedule}-{self.sh_student}-{date_str}"

    def validate(self):
        self.compute_day_and_week()
        self.validate_duplicate()
        self.validate_holiday()
        self.validate_schedule_day()
        if not self.marked_by:
            self.marked_by = frappe.session.user

    def compute_day_and_week(self):
        if not self.date:
            return
        date_obj = datetime.datetime.strptime(str(self.date)[:10], "%Y-%m-%d")
        self.day = date_obj.strftime("%A").upper()
        if self.sh_programme_schedule:
            start_date = frappe.db.get_value(
                "SH Class", self.sh_programme_schedule, "start_date"
            )
            if start_date:
                delta = (date_obj.date() - start_date).days
                week_num = min(max(delta // 7 + 1, 1), 35)
                self.week = f"WEEK {week_num}"

    def validate_duplicate(self):
        if not self.sh_student or not self.sh_programme_schedule or not self.date:
            return
        existing = frappe.db.get_value(
            "SH Attendance",
            {
                "sh_student": self.sh_student,
                "sh_programme_schedule": self.sh_programme_schedule,
                "date": self.date,
                "name": ("!=", self.name or "")
            },
            "name"
        )
        if existing:
            frappe.throw(
                f"Attendance for <b>{self.sh_student}</b> on <b>{self.date}</b> "
                f"(schedule: <b>{self.sh_programme_schedule}</b>) already exists: "
                f"<a href='/app/sh-student-attendance/{existing}'>{existing}</a>"
            )

    def validate_holiday(self):
        if not self.sh_programme_schedule or not self.date:
            return
        holiday_list = frappe.db.get_value(
            "SH Class", self.sh_programme_schedule, "holiday_list"
        )
        if not holiday_list:
            return
        holiday = frappe.db.get_value(
            "SH Holidays",
            {"parent": holiday_list, "holiday_date": self.date},
            "holiday_name"
        )
        if holiday:
            frappe.throw(
                f"<b>{self.date}</b> is a holiday: <b>{holiday}</b>. "
                f"Cannot mark attendance on a holiday."
            )

    def validate_schedule_day(self):
        if not self.sh_programme_schedule or not self.date:
            return
        days_offered = frappe.get_all(
            "SH Schedule Days",
            filters={"parent": self.sh_programme_schedule},
            fields=["day"]
        )
        if not days_offered:
            return
        allowed_days = [d.day.upper() for d in days_offered]
        day_name = datetime.datetime.strptime(
            str(self.date)[:10], "%Y-%m-%d"
        ).strftime("%A").upper()
        if day_name not in allowed_days:
            frappe.throw(
                f"<b>{day_name}</b> is not a scheduled day for <b>{self.sh_programme_schedule}</b>. "
                f"Scheduled days are: {', '.join(allowed_days)}"
            )

    def after_save(self):
        _recompute_stats_for_student(self.sh_student, self.sh_programme_schedule)
        _sync_session_header(self.sh_programme_schedule, self.date)

    def after_delete(self):
        _recompute_stats_for_student(self.sh_student, self.sh_programme_schedule)
        _sync_session_header(self.sh_programme_schedule, self.date)


# ------------------------------------------------------------------ #
#  Module-level helpers (also importable by migration patch)         #
# ------------------------------------------------------------------ #

def _recompute_stats_for_student(student, schedule):
    """
    Recalculate and persist attendance stats for one student in one schedule.
    Called after every SH Student Attendance save or delete.
    """
    if not student or not schedule:
        return

    # Count distinct session dates so total reflects sessions, not student rows
    total = frappe.db.sql("""
        SELECT COUNT(DISTINCT date)
        FROM `tabSH Attendance`
        WHERE sh_programme_schedule = %s
    """, schedule)[0][0] or 0

    present = frappe.db.count("SH Attendance", {
        "sh_student": student,
        "sh_programme_schedule": schedule,
        "status": ("in", ["Present", "Late"])
    })
    absent = frappe.db.count("SH Attendance", {
        "sh_student": student,
        "sh_programme_schedule": schedule,
        "status": "Absent"
    })
    pct = round(flt(present) / total * 100, 1) if total else 0.0

    child_rows = frappe.get_all(
        "SkillsHub Programme-Student Link",
        filters={
            "parent": student,
            "parenttype": "SH Student",
            "programme_schedule": schedule
        },
        fields=["name", "is_current"],
        limit=1
    )
    if child_rows:
        frappe.db.set_value(
            "SkillsHub Programme-Student Link",
            child_rows[0].name,
            {
                "total_sessions":   total,
                "sessions_present": present,
                "sessions_absent":  absent,
                "attendance_pct":   pct
            },
            update_modified=False
        )
        if child_rows[0].is_current:
            frappe.db.set_value(
                "SH Student", student,
                {
                    "total_sessions":   total,
                    "sessions_present": present,
                    "sessions_absent":  absent,
                    "attendance_pct":   pct
                },
                update_modified=False
            )


def _sync_session_header(schedule, date):
    """
    Update the SH Attendance session header summary counts from
    the flat SH Student Attendance records for this schedule + date.
    """
    if not schedule or not date:
        return
    session = frappe.db.get_value(
        "SH Attendance",
        {"sh_programme_schedule": schedule, "date": date},
        "name"
    )
    if not session:
        return

    counts = frappe.db.sql("""
        SELECT status, COUNT(*) AS cnt
        FROM `tabSH Attendance`
        WHERE sh_programme_schedule = %s AND date = %s
        GROUP BY status
    """, (schedule, date), as_dict=True)

    status_map = {r.status: r.cnt for r in counts}
    present = status_map.get("Present", 0) + status_map.get("Late", 0)
    absent  = status_map.get("Absent", 0)
    leave   = status_map.get("Leave", 0)
    total   = present + absent + leave
    rate    = round(flt(present) / total * 100, 1) if total else 0.0

    frappe.db.set_value(
        "SH Attendance", session,
        {
            "total_students":  total,
            "present_count":   present,
            "absent_count":    absent,
            "leave_count":     leave,
            "attendance_rate": rate
        },
        update_modified=False
    )
