# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
import datetime
import json
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
        # Security: Prevent Students from creating or editing attendance records
        if "Student" in frappe.get_roles() and not "System Manager" in frappe.get_roles():
            frappe.throw("Students are not authorized to create or modify attendance records.", frappe.PermissionError)

        self.compute_day()
        self.validate_duplicate()
        self.validate_holiday()
        self.validate_schedule_day()

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
        day_name = datetime.datetime.strptime(
            str(self.date)[:10], "%Y-%m-%d"
        ).strftime("%A").upper()
        if day_name not in allowed_days:
            frappe.throw(
                f"<b>{day_name}</b> is not a scheduled day for "
                f"<b>{self.sh_programme_schedule}</b>. "
                f"Scheduled days are: {', '.join(allowed_days)}"
            )

    def after_save(self):
        self._refresh_stats()

    def _refresh_stats(self):
        """
        Recount totals directly from tabSH Student Attendance for this
        schedule + date combination and write back to SH Attendance header
        without triggering another save cycle.
        """
        row = frappe.db.sql("""
            SELECT
                COUNT(*)                    AS total,
                SUM(status IN ('Present','Late')) AS present,
                SUM(status = 'Absent')      AS absent,
                SUM(status = 'Leave')       AS leave_cnt
            FROM `tabSH Student Attendance`
            WHERE sh_programme_schedule = %s
              AND date = %s
        """, (self.sh_programme_schedule, self.date), as_dict=True)[0]

        total   = int(row.get("total")    or 0)
        present = int(row.get("present")  or 0)
        absent  = int(row.get("absent")   or 0)
        leave   = int(row.get("leave_cnt") or 0)
        rate    = round(present / total * 100, 1) if total else 0.0

        frappe.db.set_value(
            "SH Attendance",
            self.name,
            {
                "total_students":  total,
                "present_count":   present,
                "absent_count":    absent,
                "leave_count":     leave,
                "attendance_rate": rate
            },
            update_modified=False
        )

    @frappe.whitelist()
    def get_session_attendance(self):
        """
        Returns enrolled students for this session together with their
        current SH Student Attendance status (if already marked).
        Called from the 'Mark Attendance' dialog in the JS.
        """
        if not self.sh_programme_schedule or not self.date:
            frappe.throw("Programme Schedule and Date are required.")

        students = frappe.db.sql("""
            SELECT DISTINCT
                s.name          AS student,
                s.student_name  AS full_name
            FROM `tabSH Student` s
            INNER JOIN `tabSkillsHub Programme-Student Link` h
                ON h.parent = s.name
            WHERE h.programme_schedule = %s
              AND h.is_current = 1
            ORDER BY s.student_name ASC
        """, self.sh_programme_schedule, as_dict=True)

        if not students:
            frappe.msgprint(
                f"No students currently enrolled in {self.sh_programme_schedule}."
            )
            return []

        # Existing attendance records keyed by student
        existing_list = frappe.get_all(
            "SH Student Attendance",
            filters={
                "sh_programme_schedule": self.sh_programme_schedule,
                "date": self.date
            },
            fields=["sh_student", "status", "late_minutes", "notes", "name"]
        )
        existing_map = {r.sh_student: r for r in existing_list}

        result = []
        for s in students:
            rec = existing_map.get(s.student, frappe._dict())
            result.append({
                "student":       s.student,
                "full_name":     s.full_name,
                "status":        rec.get("status") or "Present",
                "late_minutes":  rec.get("late_minutes") or 0,
                "notes":         rec.get("notes") or "",
                "existing_name": rec.get("name") or ""
            })

        return result

    @frappe.whitelist()
    def save_session_attendance(self, rows):
        """
        Bulk create or update SH Student Attendance records for this session.
        `rows` — JSON list of {student, status, late_minutes, notes}.
        Returns a summary dict {created, updated, errors}.
        """
        if isinstance(rows, str):
            rows = json.loads(rows)

        counts = {"created": 0, "updated": 0, "errors": 0}

        for row in rows:
            student     = row.get("student")
            status      = row.get("status", "Present")
            late_min    = int(row.get("late_minutes") or 0)
            notes       = row.get("notes") or ""

            if not student:
                continue

            date_str = str(self.date)[:10]
            rec_name = f"SA-{self.sh_programme_schedule}-{student}-{date_str}"

            try:
                if frappe.db.exists("SH Student Attendance", rec_name):
                    frappe.db.set_value(
                        "SH Student Attendance",
                        rec_name,
                        {
                            "status":        status,
                            "late_minutes":  late_min,
                            "notes":         notes,
                            "sh_attendance": self.name
                        },
                        update_modified=False
                    )
                    # Trigger stat recomputation via the flat record controller
                    from skillshub_core.zm_skillshub.doctype.sh_student_attendance.sh_student_attendance import (
                        _recompute_stats_for_student
                    )
                    _recompute_stats_for_student(student, self.sh_programme_schedule)
                    counts["updated"] += 1
                else:
                    att = frappe.get_doc({
                        "doctype":              "SH Student Attendance",
                        "sh_student":           student,
                        "sh_programme_schedule": self.sh_programme_schedule,
                        "date":                 self.date,
                        "status":               status,
                        "late_minutes":         late_min,
                        "notes":                notes,
                        "sh_attendance":        self.name,
                        "marked_by":            frappe.session.user
                    })
                    att.insert(ignore_permissions=True)
                    # after_save on SHStudentAttendance handles stats automatically
                    counts["created"] += 1
            except Exception as e:
                frappe.log_error(
                    f"save_session_attendance error for {student}: {e}",
                    "Save Session Attendance"
                )
                counts["errors"] += 1

        # Refresh session header stats after all records are written
        self._refresh_stats()
        return counts
