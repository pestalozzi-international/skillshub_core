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

FEEDBACK_ROUTE_MAP = {
    "SH Baseline": "/skillshub/baseline",
    "SH Soft Skills Feedback": "/skillshub/feedback/soft-skills",
    "SH Mindset Camp Feedback": "/skillshub/feedback/mindset-camp",
    "SH Edulution Feedback": "/skillshub/feedback/edulution",
    "SH VT Feedback": "/skillshub/feedback/vocational-training",
    "SH Attachment Feedback": "/skillshub/feedback/attachment",
    "SH Parent Feedback": "/skillshub/feedback/parent",
}

STUDENT_LOGIN_FIELDS = [
    "portal_user_account",
    "user_login_email",
    "pestalozzi_student_email",
    "personal_email",
]


def _has_student_access(student_doc):
    user = frappe.session.user
    if not user or user == "Guest":
        return False
    roles = set(frappe.get_roles(user))
    if roles.intersection(ADMIN_ROLES):
        return True
    user_norm = (user or "").strip().lower()
    return user_norm in _student_identity_values(student_doc)


def _feedback_forms_for_path(programme_path):
    path = (programme_path or "").strip()
    forms = [
        {"doctype": "SH Baseline", "label": "Baseline Assessment", "route": FEEDBACK_ROUTE_MAP["SH Baseline"]},
        {"doctype": "SH Soft Skills Feedback", "label": "Soft Skills Feedback", "route": FEEDBACK_ROUTE_MAP["SH Soft Skills Feedback"]},
        {"doctype": "SH Mindset Camp Feedback", "label": "Mindset Camp Feedback", "route": FEEDBACK_ROUTE_MAP["SH Mindset Camp Feedback"]},
        {"doctype": "SH VT Feedback", "label": "Vocational Training Feedback", "route": FEEDBACK_ROUTE_MAP["SH VT Feedback"]},
        {"doctype": "SH Attachment Feedback", "label": "Attachment Feedback", "route": FEEDBACK_ROUTE_MAP["SH Attachment Feedback"]},
        {"doctype": "SH Parent Feedback", "label": "Parent Feedback", "route": FEEDBACK_ROUTE_MAP["SH Parent Feedback"]},
    ]
    if path == "Path A" or not path:
        forms.insert(
            3,
            {"doctype": "SH Edulution Feedback", "label": "Edulution Feedback", "route": FEEDBACK_ROUTE_MAP["SH Edulution Feedback"]},
        )
    return forms


def _pick_first(student_doc, fieldnames):
    for fieldname in fieldnames:
        try:
            value = student_doc.get(fieldname)
        except Exception:
            value = None
        if value not in (None, ""):
            return value
    return None


def _doctype_has_field(doctype, fieldname):
    try:
        return bool(frappe.get_meta(doctype).get_field(fieldname))
    except Exception:
        return False


def _student_identity_values(student_doc):
    values = set()
    for fieldname in STUDENT_LOGIN_FIELDS:
        value = (student_doc.get(fieldname) or "").strip().lower()
        if value:
            values.add(value)
    return values


def _find_student_for_user(user):
    for fieldname in STUDENT_LOGIN_FIELDS:
        if not _doctype_has_field("SH Student", fieldname):
            continue
        found = frappe.get_all(
            "SH Student",
            filters=[[fieldname, "=", user]],
            fields=["name"],
            limit=1,
        )
        if found:
            return found[0].name
    return None


def _feedback_student_field(doctype):
    if _doctype_has_field(doctype, "sh_student"):
        return "sh_student"
    if _doctype_has_field(doctype, "student"):
        return "student"
    return None


def _feedback_schedule_field(doctype):
    if _doctype_has_field(doctype, "programme_schedule"):
        return "programme_schedule"
    if _doctype_has_field(doctype, "program_schedule"):
        return "program_schedule"
    if _doctype_has_field(doctype, "class"):
        return "class"
    return None


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
        "SH Enrolment",
        filters={"student": student},
        fields=[
            "name",
            "class",
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
        "SH Baseline",
        filters={"sh_student": student},
        fields=["name", "milestone", "date_submitted", "programme_schedule"],
        order_by="date_submitted desc",
    )
    programme_path = student_doc.get("programme_path")
    feedback_forms = _feedback_forms_for_path(programme_path)
    feedback_status = {}
    for form in feedback_forms:
        student_field = _feedback_student_field(form["doctype"])
        if not student_field:
            feedback_status[form["doctype"]] = False
            continue
        feedback_status[form["doctype"]] = bool(
            frappe.db.exists(
                form["doctype"],
                {student_field: student_doc.name},
            )
        )
    schedule_feedback = {}
    for enrolment in enrolments:
        schedule_name = enrolment.get("class")
        if not schedule_name:
            continue
        submitted = []
        for form in feedback_forms:
            student_field = _feedback_student_field(form["doctype"])
            schedule_field = _feedback_schedule_field(form["doctype"])
            if not student_field or not schedule_field:
                continue
            if frappe.db.exists(
                form["doctype"],
                {student_field: student_doc.name, schedule_field: schedule_name},
            ):
                submitted.append(form["label"])
        enrolment["feedback_forms_submitted"] = submitted
        schedule_feedback[schedule_name] = submitted

    intake_year = _pick_first(
        student_doc,
        ["intake_year", "student_intake_year", "intake_academic_year", "year_of_intake", "intake"],
    )

    current_enrolment = None
    try:
        enrolled = [e for e in enrolments if e.get('status') == 'Enrolled']
        if enrolled:
            enrolled_sorted = sorted(enrolled, key=lambda x: x.get('enrolment_date') or '', reverse=True)
            current_enrolment = enrolled_sorted[0].get('name')
        elif enrolments:
            enrolments_sorted = sorted(enrolments, key=lambda x: x.get('enrolment_date') or '', reverse=True)
            current_enrolment = enrolments_sorted[0].get('name')
    except Exception:
        current_enrolment = None

    return {
        "student": {
            "name":             student_doc.name,
            "id":               student_doc.name,
            "full_name":        student_doc.get("student_name"),
            "student_name":     student_doc.get("student_name"),
            "image":            student_doc.get("student_image"),
            "status":           student_doc.get("status"),
            "programme_path":   programme_path,
            "current_schedule": student_doc.get("current_schedule"),
            "current_cohort":   student_doc.get("current_cohort") or student_doc.get("intake_cohort"),
            "intake_year":      intake_year,
            "portal_enabled":   bool(student_doc.get("portal_enabled")),
            "date_of_birth":    str(student_doc.get("date_of_birth")) if student_doc.get("date_of_birth") else None,
            "gender":           student_doc.get("gender"),
            "nrc_number":       student_doc.get("nrc_number"),
            "address_line_1":   student_doc.get("address_line_1"),
            "address_line_2":   student_doc.get("address_line_2"),
            "pincode":          student_doc.get("pincode"),
            "mobile":           student_doc.get("mobile"),
            "personal_email":   student_doc.get("personal_email"),
            "user_login_email": _pick_first(student_doc, ["user_login_email", "pestalozzi_student_email", "personal_email"]),
            "guardian_name":    student_doc.get("guardian_name"),
            "guardian_mobile_number": student_doc.get("guardian_mobile_number"),
            "enrolment_date":   str(student_doc.get("enrolment_date")) if student_doc.get("enrolment_date") else None,
            "skillshub_programme": student_doc.get("skillshub_programme"),
            "path_definition": (
                "Path A is the standard progression path."
                if (programme_path or "") == "Path A"
                else "Path B is the standard path without remedial modules."
            ),
            "motivations":      [{"name": m.name, "motivation": m.motivation} for m in (student_doc.get("motivations") or [])],
            "resilience_links": [{"name": r.name, "resilience_statement": r.resilience_statement} for r in (student_doc.get("resilience_links") or [])],
            "current_enrolment": current_enrolment,
        },
        "enrolments":        enrolments,
        "employment_history": employment,
        "baselines":         baselines,
        "feedback_forms":    feedback_forms,
        "feedback_status":   feedback_status,
        "schedule_feedback": schedule_feedback,
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
def get_portal_student_context(student=None):
    """Unified student portal context from SH Student master + enrolments + feedback availability."""
    student_doc = None
    if student:
        student_doc = frappe.get_doc("SH Student", student)
    else:
        user = frappe.session.user
        if not user or user == "Guest":
            frappe.throw(_("Not permitted"), frappe.PermissionError)
        linked_student = _find_student_for_user(user)
        if not linked_student:
            frappe.throw(_("Student profile not linked to current login."), frappe.PermissionError)
        student_doc = frappe.get_doc("SH Student", linked_student)

    if not _has_student_access(student_doc):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    summary = get_student_summary(student_doc.name)
    return summary


@frappe.whitelist()
def mark_attendance(schedule, date, attendance_records):
    """
    Atomically create SH Attendance rows for the selected class and date.
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
        row = frappe.new_doc("SH Attendance")
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
def enrol_cohort(cohort, class_name, enrolment_date=None):
    """
    Bulk-enrol all active students in a cohort into a class.
    POST /api/method/skillshub_core.skillshub_core.api.enrol_cohort
    """
    if not class_name:
        frappe.throw(_("Class is required."))
    enrolment_date = enrolment_date or frappe.utils.today()

    cohort_field = "current_cohort" if _doctype_has_field("SH Student", "current_cohort") else "intake_cohort"
    students = frappe.get_all(
        "SH Student",
        filters={cohort_field: cohort, "status": "Student"},
        fields=["name", "student_name"],
    )
    if not students:
        frappe.throw(_("No active students found in cohort {0}.").format(cohort))

    created, skipped = [], []

    for student in students:
        if frappe.db.exists(
            "SH Enrolment",
            {"student": student.name, "class": class_name},
        ):
            skipped.append(student.name)
            continue

        enrolment = frappe.new_doc("SH Enrolment")
        enrolment.student = student.name
        enrolment.set("class", class_name)
        enrolment.status = "Enrolled"
        enrolment.enrolment_date = enrolment_date
        enrolment.insert()
        created.append(student.name)

    frappe.db.commit()
    return {
        "cohort": cohort,
        "class": class_name,
        "enrolled": len(created),
        "skipped_duplicates": len(skipped),
    }


@frappe.whitelist()
def get_current_user_roles():
    """Return a list of roles for the currently logged-in user."""
    return frappe.get_roles(frappe.session.user)


@frappe.whitelist()
def get_user_roles():
    """Securely returns the roles of the currently logged-in user for the portal frontend."""
    return frappe.get_roles(frappe.session.user)


@frappe.whitelist(allow_guest=True)
def find_student_by_email(email):
    """
    Return student name for a given login email (safe server-side lookup).
    Use this from the frontend instead of calling client.get_list with filters
    that Frappe rejects (user_login_email is not a permitted client filter field).
    """
    if not email:
        return None
    return _find_student_for_user(email)


# ---------------------------------------------------------------------------
# Internal helpers (not whitelisted)
# ---------------------------------------------------------------------------

def _recompute_enrolment_for_student(student, schedule):
    """Recompute attendance stats on the SH Enrolment for this student+class."""
    enrolment_name = frappe.db.get_value(
        "SH Enrolment",
        {"student": student, "class": schedule},
    )
    if enrolment_name:
        doc = frappe.get_doc("SH Enrolment", enrolment_name)
        doc.compute_attendance_stats()
        doc.save(ignore_permissions=True)


def _recompute_enrolment_on_attendance(doc, method=None):
    """
    doc_events hook: triggered after SH Attendance insert/update/trash.
    Re-runs attendance stat computation on the linked SH Enrolment.
    """
    _recompute_enrolment_for_student(
        doc.sh_student, doc.sh_programme_schedule
    )


@frappe.whitelist()
def update_student_admin(student, payload):
    """Admin-level update for SH Student: accepts a JSON payload and updates fields and child tables.
    Must be an admin role (System Manager / PI Admin / PI Admin variants).
    """
    if isinstance(payload, str):
        payload = json.loads(payload or "{}")
    payload = payload or {}

    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    if not roles.intersection(ADMIN_ROLES):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    student_doc = frappe.get_doc("SH Student", student)

    for key, val in payload.items():
        try:
            meta = student_doc.meta.get_field(key) if hasattr(student_doc, 'meta') else None
        except Exception:
            meta = None
        if meta and meta.fieldtype == 'Table' and isinstance(val, list):
            student_doc.set(key, [])
            for row in val:
                if isinstance(row, dict):
                    student_doc.append(key, row)
        else:
            if key in ('name', 'doctype'):
                continue
            try:
                student_doc.set(key, val)
            except Exception:
                pass

    student_doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True, "name": student_doc.name}


@frappe.whitelist()
def create_student_admin(payload):
    """Admin-level create for SH Student. Accepts JSON payload and returns created name."""
    if isinstance(payload, str):
        payload = json.loads(payload or "{}")
    payload = payload or {}

    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    if not roles.intersection(ADMIN_ROLES):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    doc = frappe.new_doc('SH Student')
    for k, v in payload.items():
        try:
            doc.set(k, v)
        except Exception:
            pass
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True, "name": doc.name}


@frappe.whitelist()
def delete_student_admin(student):
    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    if not roles.intersection(ADMIN_ROLES):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    frappe.delete_doc('SH Student', student, force=True)
    frappe.db.commit()
    return {"ok": True}
