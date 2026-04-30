# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _


@frappe.whitelist()
def get_student_summary(student):
    """
    Return full student dashboard payload for the HTML portal.
    GET /api/method/skillshub_core.api.get_student_summary?student={id}
    """
    if not frappe.has_permission("SH Student", "read", doc=student):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    student_doc = frappe.get_doc("SH Student", student)

    enrolments = frappe.get_all(
        "SH Student Enrolment",
        filters={"student": student},
        fields=[
            "name",
            "programme_schedule",
            "milestone",
            "status",
            "enrolment_date",
            "completion_date",
            "programme_path",
            "attendance_rate",
            "sessions_total",
            "sessions_present",
            "sessions_absent",
            "feedback_submitted",
            "baseline_submitted",
        ],
        order_by="enrolment_date asc",
    )

    employment = frappe.get_all(
        "SH Employment History",
        filters={"parent": student, "parenttype": "SH Student"},
        fields=[
            "institution",
            "occupation",
            "role",
            "employer_type",
            "start_date",
            "end_date",
            "monthly_salary_zmw",
            "is_current",
            "notes",
        ],
        order_by="start_date desc",
    )

    baselines = frappe.get_all(
        "SH Student Baseline Form",
        filters={"sh_student": student},
        fields=["name", "milestone", "date_submitted", "programme_schedule"],
        order_by="date_submitted desc",
    )

    return {
        "student": {
            "id": student_doc.name,
            "full_name": student_doc.student_name,
            "image": student_doc.student_image,
            "status": student_doc.status,
            "programme_path": student_doc.programme_path,
            "current_schedule": student_doc.current_schedule,
            "current_cohort": student_doc.current_cohort,
            "portal_enabled": student_doc.enabled,
        },
        "enrolments": enrolments,
        "employment_history": employment,
        "baselines": baselines,
    }


@frappe.whitelist()
def mark_attendance(schedule, date, attendance_records):
    """
    Atomically create an SH Attendance session header and all SH Student Attendance rows.
    POST /api/method/skillshub_core.api.mark_attendance
    attendance_records: JSON list of {student, status, late_minutes?, notes?}
    """
    if isinstance(attendance_records, str):
        attendance_records = json.loads(attendance_records)

    existing = frappe.db.exists(
        "SH Attendance", {"sh_programme_schedule": schedule, "date": date}
    )
    if existing:
        frappe.throw(
            _("An attendance session already exists for schedule {0} on {1}.").format(
                schedule, date
            )
        )

    # Create session header
    session = frappe.new_doc("SH Attendance")
    session.sh_programme_schedule = schedule
    session.date = date
    session.attendance_recorded_by = frappe.session.user
    session.insert()

    # Create per-student rows
    for record in attendance_records:
        row = frappe.new_doc("SH Student Attendance")
        row.sh_student = record.get("student")
        row.sh_programme_schedule = schedule
        row.date = date
        row.status = record.get("status", "Present")
        row.late_minutes = record.get("late_minutes") or 0
        row.notes = record.get("notes") or ""
        row.sh_attendance = session.name
        row.marked_by = frappe.session.user
        row.insert()

    # Recompute attendance stats on affected enrolments
    for record in attendance_records:
        enrolment_name = frappe.db.get_value(
            "SH Student Enrolment",
            {"student": record.get("student"), "programme_schedule": schedule},
        )
        if enrolment_name:
            enrolment_doc = frappe.get_doc("SH Student Enrolment", enrolment_name)
            enrolment_doc.compute_attendance_stats()
            enrolment_doc.save(ignore_permissions=True)

    frappe.db.commit()
    return {"session": session.name, "records_created": len(attendance_records)}


@frappe.whitelist()
def enrol_cohort(cohort, programme_schedule, enrolment_date=None):
    """
    Bulk-enrol all active students in a cohort into a Programme Schedule.
    POST /api/method/skillshub_core.api.enrol_cohort
    """
    import frappe.utils

    enrolment_date = enrolment_date or frappe.utils.today()

    students = frappe.get_all(
        "SH Student",
        filters={"current_cohort": cohort, "status": "Student"},
        fields=["name", "student_name"],
    )
    if not students:
        frappe.throw(_("No active students found in cohort {0}.").format(cohort))

    created, skipped = [], []

    for student in students:
        if frappe.db.exists(
            "SH Student Enrolment",
            {"student": student.name, "programme_schedule": programme_schedule},
        ):
            skipped.append(student.name)
            continue

        enrolment = frappe.new_doc("SH Student Enrolment")
        enrolment.student = student.name
        enrolment.programme_schedule = programme_schedule
        enrolment.status = "Enrolled"
        enrolment.enrolment_date = enrolment_date
        enrolment.insert()
        created.append(student.name)

    frappe.db.commit()
    return {
        "cohort": cohort,
        "programme_schedule": programme_schedule,
        "enrolled": len(created),
        "skipped_duplicates": len(skipped),
    }
