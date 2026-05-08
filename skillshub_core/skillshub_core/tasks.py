# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe


def daily_attendance_alerts():
    """
    Flag students with 3+ consecutive absences in their active schedule enrolment.
    Source of truth: tabSH Enrolment (active enrolments) +
                     tabSH Attendance (per-day records).
    """
    active_enrolments = frappe.db.sql(
        """
        SELECT
            e.name          AS enrolment,
            e.student,
            e.programme_schedule,
            s.student_name,
            s.pestalozzi_student_email
        FROM `tabSH Enrolment` e
        INNER JOIN `tabSH Student` s ON s.name = e.student
        WHERE e.status = 'Enrolled'
        """,
        as_dict=True,
    )

    at_risk = []

    for enrolment in active_enrolments:
        recent = frappe.db.sql(
            """
            SELECT status
            FROM `tabSH Attendance`
            WHERE sh_student = %s
              AND sh_programme_schedule = %s
            ORDER BY date DESC
            LIMIT 3
            """,
            (enrolment.student, enrolment.programme_schedule),
            as_list=True,
        )

        if len(recent) >= 3 and all(row[0] == "Absent" for row in recent):
            at_risk.append(enrolment)

    if not at_risk:
        return 0

    rows = "".join(
        f"<tr><td>{a.student}</td><td>{a.student_name}</td>"
        f"<td>{a.programme_schedule}</td></tr>"
        for a in at_risk
    )
    body = (
        "<h3>Students with 3+ consecutive absences</h3>"
        "<table border='1' cellpadding='4'>"
        "<thead><tr><th>Student ID</th><th>Name</th><th>Schedule</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )
    frappe.sendmail(
        recipients=["techsupport@pestalozzi.international"],
        subject="SkillsHub: Daily Attendance Alert — Consecutive Absences",
        message=body,
    )
    return len(at_risk)


def weekly_attendance_summary():
    """
    Weekly digest: per-schedule unique student counts and average attendance rates.
    Source of truth: tabSH Enrolment aggregated by programme_schedule.
    """
    summary = frappe.db.sql(
        """
        SELECT
            e.programme_schedule,
            e.milestone,
            COUNT(DISTINCT e.student)   AS unique_students,
            AVG(e.attendance_rate)      AS avg_attendance_rate
        FROM `tabSH Enrolment` e
        WHERE e.status = 'Enrolled'
        GROUP BY e.programme_schedule, e.milestone
        ORDER BY e.programme_schedule
        """,
        as_dict=True,
    )

    if not summary:
        return

    rows = "".join(
        f"<tr><td>{r.programme_schedule}</td><td>{r.milestone or '-'}</td>"
        f"<td>{r.unique_students}</td>"
        f"<td>{round(float(r.avg_attendance_rate or 0), 1)}%</td></tr>"
        for r in summary
    )
    body = (
        "<h3>Weekly Attendance Summary</h3>"
        "<table border='1' cellpadding='4'>"
        "<thead><tr><th>Schedule</th><th>Milestone</th>"
        "<th>Students</th><th>Avg Attendance</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )
    frappe.sendmail(
        recipients=["techsupport@pestalozzi.international"],
        subject="SkillsHub: Weekly Attendance Summary",
        message=body,
    )


def check_post_skillshub_followups():
    """
    Flag Alumni students whose employment_history child table has no entries.
    Source of truth: tabSH Employment History (child table on SH Student).
    """
    alumni_no_employment = frappe.db.sql(
        """
        SELECT
            s.name          AS student_id,
            s.student_name,
            s.graduation_completion_date
        FROM `tabSH Student` s
        WHERE s.status = 'Alumni'
          AND NOT EXISTS (
              SELECT 1
              FROM `tabSH Employment History` eh
              WHERE eh.parent = s.name
                AND eh.parenttype = 'SH Student'
          )
        ORDER BY s.graduation_completion_date DESC
        LIMIT 50
        """,
        as_dict=True,
    )

    if not alumni_no_employment:
        return

    rows = "".join(
        f"<tr><td>{s.student_id}</td><td>{s.student_name}</td>"
        f"<td>{s.graduation_completion_date or '-'}</td></tr>"
        for s in alumni_no_employment
    )
    body = (
        f"<h3>Alumni with no Employment History "
        f"({len(alumni_no_employment)} students)</h3>"
        "<table border='1' cellpadding='4'>"
        "<thead><tr><th>Student ID</th><th>Name</th><th>Completion Date</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )
    frappe.sendmail(
        recipients=["techsupport@pestalozzi.international"],
        subject="SkillsHub: Post-Programme Follow-up — Missing Employment Data",
        message=body,
    )
