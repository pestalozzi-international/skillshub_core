# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _

ADMIN_ROLES = {
    "System Manager",
    "Administrator",
    "PI Admin",
    "SH Admin",
    "SkillsHub Admin",
    "SH Teacher",
    "SkillsHub Teacher",
}


def _has_student_access(student_doc):
    user = frappe.session.user
    if not user or user == "Guest":
        return False
    roles = set(frappe.get_roles(user))
    if roles.intersection(ADMIN_ROLES):
        return True
    portal_user = getattr(student_doc, "portal_user_account", None)
    login_email = getattr(student_doc, "user_login_email", None)
    user_norm = (user or "").strip().lower()
    allowed = {(portal_user or "").strip().lower(), (login_email or "").strip().lower()}
    return user_norm in allowed


@frappe.whitelist()
def get_student_summary(student):
    """
    Return full student dashboard payload for the HTML portal.
    GET /api/method/skillshub_core.skillshub_core.api.get_student_summary?student={id}
    """
    student_doc = frappe.get_doc("SH Student", student)
    if not _has_student_access(student_doc):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

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
            "course",
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
            "name":             student_doc.name,
            "id":               student_doc.name,
            "full_name":        student_doc.student_name,
            "student_name":     student_doc.student_name,
            "image":            student_doc.student_image,
            "status":           student_doc.status,
            "programme_path":   student_doc.programme_path,
            "current_schedule": student_doc.current_schedule,
            "current_cohort":   student_doc.current_cohort,
            "portal_enabled":   getattr(student_doc, 'portal_enabled', False),
            "date_of_birth":    str(student_doc.date_of_birth) if student_doc.date_of_birth else None,
            "gender":           student_doc.gender,
            "nrc_number":       student_doc.nrc_number,
            "address_line_1":   student_doc.address_line_1,
            "address_line_2":   student_doc.address_line_2,
            "pincode":          student_doc.pincode,
            "mobile":           student_doc.mobile,
            "personal_email":   student_doc.personal_email,
            "guardian_name":    student_doc.guardian_name,
            "guardian_mobile_number": student_doc.guardian_mobile_number,
            "enrolment_date":   str(student_doc.enrolment_date) if student_doc.enrolment_date else None,
            "skillshub_programme": student_doc.skillshub_programme,
            "motivations":      [{"name": m.name, "motivation": m.motivation} for m in student_doc.motivations],
            "resilience_links": [{"name": r.name, "resilience_statement": r.resilience_statement} for r in student_doc.resilience_links],
        },
        "enrolments":        enrolments,
        "employment_history": employment,
        "baselines":         baselines,
    }


@frappe.whitelist()
def get_student_editable(student):
    student_doc = frappe.get_doc("SH Student", student)
    if not _has_student_access(student_doc):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    return {
        "name": student_doc.name,
        "address_line_1": student_doc.address_line_1,
        "address_line_2": student_doc.address_line_2,
        "pincode": student_doc.pincode,
        "mobile": student_doc.mobile,
        "motivations": [
            {"name": m.name, "motivation": m.motivation}
            for m in (student_doc.motivations or [])
            if m and m.motivation
        ],
        "resilience_links": [
            {"name": r.name, "resilience_statement": r.resilience_statement}
            for r in (student_doc.resilience_links or [])
            if r and r.resilience_statement
        ],
    }


@frappe.whitelist()
def update_student_profile(student, payload):
    if isinstance(payload, str):
        payload = json.loads(payload or "{}")
    payload = payload or {}

    student_doc = frappe.get_doc("SH Student", student)
    if not _has_student_access(student_doc):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    allowed_fields = {"address_line_1", "address_line_2", "pincode", "mobile"}
    for fieldname in allowed_fields:
        if fieldname in payload:
            student_doc.set(fieldname, payload.get(fieldname) or "")

    if "motivations" in payload and isinstance(payload.get("motivations"), list):
        student_doc.set("motivations", [])
        for row in payload.get("motivations") or []:
            if not isinstance(row, dict):
                continue
            motivation = (row.get("motivation") or "").strip()
            if motivation:
                student_doc.append("motivations", {"motivation": motivation})

    if "resilience_links" in payload and isinstance(payload.get("resilience_links"), list):
        student_doc.set("resilience_links", [])
        for row in payload.get("resilience_links") or []:
            if not isinstance(row, dict):
                continue
            statement = (row.get("resilience_statement") or "").strip()
            if statement:
                student_doc.append("resilience_links", {"resilience_statement": statement})

    student_doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True, "name": student_doc.name}


@frappe.whitelist()
def mark_attendance(schedule, date, attendance_records):
    """
    Atomically create an SH Attendance session header + all SH Student Attendance rows.
    POST /api/method/skillshub_core.skillshub_core.api.mark_attendance
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

    session = frappe.new_doc("SH Attendance")
    session.sh_programme_schedule = schedule
    session.date = date
    session.attendance_recorded_by = frappe.session.user
    session.insert()

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

    for record in attendance_records:
        _recompute_enrolment_for_student(record.get("student"), schedule)

    frappe.db.commit()
    return {"session": session.name, "records_created": len(attendance_records)}


@frappe.whitelist()
def enrol_cohort(cohort, programme_schedule, enrolment_date=None):
    """
    Bulk-enrol all active students in a cohort into a Programme Schedule.
    POST /api/method/skillshub_core.skillshub_core.api.enrol_cohort
    """
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


@frappe.whitelist()
def get_current_user_roles():
    """Return a list of roles for the currently logged-in user."""
    return frappe.get_roles(frappe.session.user)


# ---------------------------------------------------------------------------
# Internal helpers (not whitelisted)
# ---------------------------------------------------------------------------

def _recompute_enrolment_for_student(student, schedule):
    """Recompute attendance stats on the SH Student Enrolment for this student+schedule."""
    enrolment_name = frappe.db.get_value(
        "SH Student Enrolment",
        {"student": student, "programme_schedule": schedule},
    )
    if enrolment_name:
        doc = frappe.get_doc("SH Student Enrolment", enrolment_name)
        doc.compute_attendance_stats()
        doc.save(ignore_permissions=True)


def _recompute_enrolment_on_attendance(doc, method=None):
    """
    doc_events hook: triggered after SH Student Attendance insert/update/trash.
    Re-runs attendance stat computation on the linked SH Student Enrolment.
    """
    _recompute_enrolment_for_student(
        doc.sh_student, doc.sh_programme_schedule
    )
