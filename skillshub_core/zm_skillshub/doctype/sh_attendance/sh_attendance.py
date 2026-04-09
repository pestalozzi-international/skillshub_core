# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
import datetime
from frappe.model.document import Document


class SHAttendance(Document):

    def autoname(self):
        if not self.sh_programme_schedule or not self.date:
            frappe.throw("Programme Schedule and Date are required.")
        date_str = str(self.date)[:10]
        day = datetime.datetime.strptime(date_str, "%Y-%m-%d").strftime("%A").upper()
        date_part = date_str[5:]
        self.name = f"ATT-{self.sh_programme_schedule}-{day}-{date_part}"

    def validate(self):
        self.compute_day()
        self.validate_duplicate()
        self.validate_holiday()
        self.validate_schedule_day()
        self.compute_summary()

    def compute_day(self):
        if self.date:
            self.day = datetime.datetime.strptime(
                str(self.date)[:10], "%Y-%m-%d"
            ).strftime("%A").upper()

    def validate_duplicate(self):
        if not self.sh_programme_schedule or not self.date:
            return
        existing = frappe.db.get_value(
            "SH Attendance",
            {
                "sh_programme_schedule": self.sh_programme_schedule,
                "date": self.date,
                "name": ("!=", self.name or "")
            },
            "name"
        )
        if existing:
            frappe.throw(
                f"Attendance for <b>{self.sh_programme_schedule}</b> on "
                f"<b>{self.date}</b> already exists: "
                f"<a href='/app/sh-attendance/{existing}'>{existing}</a>"
            )

    def validate_holiday(self):
        if not self.sh_programme_schedule or not self.date:
            return
        holiday_list = frappe.db.get_value(
            "SH Programme Schedule", self.sh_programme_schedule, "holiday_list"
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
        day_name = datetime.datetime.strptime(str(self.date)[:10], "%Y-%m-%d").strftime("%A").upper()
        if day_name not in allowed_days:
            frappe.throw(
                f"<b>{day_name}</b> is not a scheduled day for <b>{self.sh_programme_schedule}</b>. "
                f"Scheduled days are: {', '.join(allowed_days)}"
            )

    def compute_summary(self):
        self.present_count = sum(1 for r in self.student_attendance if r.status == "Present")
        self.absent_count  = sum(1 for r in self.student_attendance if r.status == "Absent")
        self.leave_count   = sum(1 for r in self.student_attendance if r.status == "Leave")

    def after_save(self):
        self.update_programme_history_attendance()

    def update_programme_history_attendance(self):
        all_sessions = frappe.get_all(
            "SH Attendance",
            filters={"sh_programme_schedule": self.sh_programme_schedule},
            pluck="name"
        )
        total = len(all_sessions)

        for row in self.student_attendance:
            if not row.student:
                continue

            present = frappe.db.count(
                "SH Attendance Student Link",
                {
                    "student": row.student,
                    "status": "Present",
                    "parenttype": "SH Attendance",
                    "parent": ("in", all_sessions)
                }
            )
            pct = round((present / total) * 100, 1) if total else 0.0

            student_doc = frappe.get_doc("SH Student", row.student)
            for hist_row in student_doc.programme_history:
                if hist_row.programme_schedule == self.sh_programme_schedule:
                    hist_row.total_sessions = total
                    hist_row.sessions_present = present
                    hist_row.sessions_absent = total - present
                    hist_row.attendance_pct = pct
                    break
            student_doc.save(ignore_permissions=True)

    @frappe.whitelist()
    def populate_from_schedule(self):
        if not self.sh_programme_schedule:
            frappe.throw("Please set a Programme Schedule first.")

        students = frappe.db.sql("""
            SELECT DISTINCT
                s.name,
                s.student_name
            FROM `tabSH Student` s
            INNER JOIN `tabSkillsHub Programme-Student Link` h
                ON h.parent = s.name
            WHERE h.programme_schedule = %s
                AND h.is_current = 1
            ORDER BY s.student_name ASC
        """, self.sh_programme_schedule, as_dict=True)

        if not students:
            frappe.msgprint(
                f"No students found with current schedule: {self.sh_programme_schedule}"
            )
            return []

        return students
