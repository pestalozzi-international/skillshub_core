# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt
"""
Scheduled background tasks for SkillsHub Core.

All tasks are referenced in hooks.py under scheduler_events.
They run inside Frappe's task worker process (bench worker).
"""

import frappe
from frappe.utils import today, add_days, flt


# ------------------------------------------------------------------ #
#  Daily tasks                                                        #
# ------------------------------------------------------------------ #

def daily_attendance_alerts():
    """
    Identify active students whose current-programme attendance has fallen
    below 80 % and create a Frappe Notification (ToDo) for PI Admin users.

    Runs daily. Skips students with < 3 sessions so early-programme noise
    is avoided.
    """
    LOW_THRESHOLD = 80.0
    MIN_SESSIONS  = 3

    at_risk = frappe.db.sql("""
        SELECT
            s.name          AS student,
            s.student_name  AS full_name,
            s.attendance_pct AS pct,
            s.sessions_present AS present,
            s.total_sessions   AS total,
            s.current_schedule AS schedule
        FROM `tabSH Student` s
        WHERE s.status = 'Student'
          AND s.total_sessions >= %(min)s
          AND s.attendance_pct < %(threshold)s
        ORDER BY s.attendance_pct ASC
    """, {"min": MIN_SESSIONS, "threshold": LOW_THRESHOLD}, as_dict=True)

    if not at_risk:
        return

    # Get PI Admin users to notify
    admins = frappe.get_all(
        "Has Role",
        filters={"role": "PI Admin", "parenttype": "User"},
        pluck="parent"
    )
    if not admins:
        admins = ["Administrator"]

    for student in at_risk:
        note = (
            f"Low attendance alert: {student.full_name} ({student.student}) "
            f"has {student.pct}% attendance "
            f"({student.present}/{student.total} sessions) "
            f"in schedule {student.schedule}."
        )
        for admin in admins:
            try:
                todo = frappe.get_doc({
                    "doctype":       "ToDo",
                    "description":   note,
                    "reference_type": "SH Student",
                    "reference_name": student.student,
                    "owner":         admin,
                    "assigned_by":   "Administrator",
                    "date":          today(),
                    "priority":      "Medium",
                    "status":        "Open"
                })
                todo.insert(ignore_permissions=True)
            except Exception as e:
                frappe.log_error(
                    f"daily_attendance_alerts: could not create ToDo for {admin}: {e}",
                    "Attendance Alert Task"
                )

    frappe.db.commit()
    frappe.logger().info(
        f"[daily_attendance_alerts] Created alerts for {len(at_risk)} at-risk students."
    )


def check_post_skillshub_followups():
    """
    Flag Alumni records that have no post-SkillsHub occupation or employer
    recorded after 30 days from their graduation_completion_date.

    Creates a ToDo for PI Admin users to follow up.
    """
    FOLLOW_UP_DAYS = 30
    cutoff = add_days(today(), -FOLLOW_UP_DAYS)

    unfollowed = frappe.db.sql("""
        SELECT
            s.name              AS student,
            s.student_name      AS full_name,
            s.graduation_completion_date AS grad_date
        FROM `tabSH Student` s
        WHERE s.status = 'Alumni'
          AND s.graduation_completion_date IS NOT NULL
          AND s.graduation_completion_date <= %(cutoff)s
          AND (s.occupation_post_completion IS NULL OR s.occupation_post_completion = '')
          AND (s.employer IS NULL OR s.employer = '')
        ORDER BY s.graduation_completion_date ASC
    """, {"cutoff": cutoff}, as_dict=True)

    if not unfollowed:
        return

    admins = frappe.get_all(
        "Has Role",
        filters={"role": "PI Admin", "parenttype": "User"},
        pluck="parent"
    )
    if not admins:
        admins = ["Administrator"]

    for alumni in unfollowed:
        note = (
            f"Post-SkillsHub follow-up needed: {alumni.full_name} ({alumni.student}) "
            f"graduated {alumni.grad_date} but has no occupation or employer recorded."
        )
        # Only notify once per student per day by checking existing open ToDos
        already_open = frappe.db.get_value(
            "ToDo",
            {
                "reference_type": "SH Student",
                "reference_name": alumni.student,
                "status":         "Open"
            },
            "name"
        )
        if already_open:
            continue

        for admin in admins:
            try:
                todo = frappe.get_doc({
                    "doctype":        "ToDo",
                    "description":    note,
                    "reference_type": "SH Student",
                    "reference_name": alumni.student,
                    "owner":          admin,
                    "assigned_by":    "Administrator",
                    "date":           today(),
                    "priority":       "Low",
                    "status":         "Open"
                })
                todo.insert(ignore_permissions=True)
            except Exception as e:
                frappe.log_error(
                    f"check_post_skillshub_followups: could not create ToDo: {e}",
                    "Post-SkillsHub Followup Task"
                )

    frappe.db.commit()
    frappe.logger().info(
        f"[check_post_skillshub_followups] Flagged {len(unfollowed)} alumni for follow-up."
    )


# ------------------------------------------------------------------ #
#  Weekly tasks                                                       #
# ------------------------------------------------------------------ #

def weekly_attendance_summary():
    """
    Log a per-schedule attendance summary to Frappe's Error Log (title:
    'Weekly Attendance Summary') for easy admin review.

    Lists each active SH Programme Schedule with: total enrolled students,
    sessions held this week, average attendance rate.
    """
    week_start = add_days(today(), -7)

    schedules = frappe.db.sql("""
        SELECT
            sa.sh_programme_schedule                AS schedule,
            COUNT(DISTINCT sa.date)                 AS sessions_this_week,
            COUNT(DISTINCT sa.sh_student)           AS unique_students,
            AVG(CASE WHEN sa.status IN ('Present','Late') THEN 100.0 ELSE 0.0 END) AS avg_rate
        FROM `tabSH Attendance` sa
        WHERE sa.date BETWEEN %(start)s AND %(end)s
        GROUP BY sa.sh_programme_schedule
        ORDER BY avg_rate ASC
    """, {"start": week_start, "end": today()}, as_dict=True)

    if not schedules:
        frappe.logger().info("[weekly_attendance_summary] No sessions found in past 7 days.")
        return

    lines = [f"Weekly Attendance Summary ({week_start} → {today()})\n"]
    for row in schedules:
        lines.append(
            f"  {row.schedule}: {row.sessions_this_week} sessions, "
            f"{row.unique_students} students, avg rate {round(flt(row.avg_rate), 1)}%"
        )

    frappe.log_error("\n".join(lines), "Weekly Attendance Summary")
    frappe.db.commit()
