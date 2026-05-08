import json

import frappe
from frappe import _

from skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings import (
    get_portal_settings,
)
from skillshub_core.skillshub_core.api import _recompute_enrolment_for_student

ADMIN_ROLES = {
    "System Manager",
    "Administrator",
    "PI Admin",
    "SH Admin",
    "SkillsHub Admin",
    "SH Teacher",
    "SkillsHub Teacher",
}

STUDENT_LOGIN_FIELDS = [
    "portal_user_account",
    "user_login_email",
    "pestalozzi_student_email",
    "personal_email",
]

FEEDBACK_DOCTYPES = [
    {"doctype": "SH Baseline", "label": "Baseline Assessment", "route": "/skillshub/baseline"},
    {"doctype": "SH Soft Skills Feedback", "label": "Soft Skills Feedback", "route": "/skillshub/feedback/soft-skills"},
    {"doctype": "SH Mindset Camp Feedback", "label": "Mindset Camp Feedback", "route": "/skillshub/feedback/mindset-camp"},
    {"doctype": "SH VT Feedback", "label": "Vocational Training Feedback", "route": "/skillshub/feedback/vocational-training"},
    {"doctype": "SH Edulution Feedback", "label": "Edulution Feedback", "route": "/skillshub/feedback/edulution"},
    {"doctype": "SH Attachment Feedback", "label": "Attachment Feedback", "route": "/skillshub/feedback/attachment"},
    {"doctype": "SH Parent Feedback", "label": "Parent Feedback", "route": "/skillshub/feedback/parent"},
]


def _has_admin_access(user=None):
    user = user or frappe.session.user
    if not user or user == "Guest":
        return False
    roles = set(frappe.get_roles(user))
    return bool(roles.intersection(ADMIN_ROLES))


def _find_linked_student(user):
    if not user or user == "Guest":
        return None
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


def _json_arg(value, fallback):
    if value is None:
        return fallback
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return fallback
        try:
            return json.loads(value)
        except Exception:
            return fallback
    return value


def _feedback_student_field(doctype):
    try:
        meta = frappe.get_meta(doctype)
        if meta.get_field("sh_student"):
            return "sh_student"
        if meta.get_field("student"):
            return "student"
    except Exception:
        return None
    return None


def _doctype_has_field(doctype, fieldname):
    try:
        return bool(frappe.get_meta(doctype).get_field(fieldname))
    except Exception:
        return False


def _existing_fields(doctype, candidates):
    return [fieldname for fieldname in candidates if fieldname == "name" or _doctype_has_field(doctype, fieldname)]


def _feedback_schedule_field(doctype):
    for fieldname in ("programme_schedule", "program_schedule", "sh_programme_schedule", "class"):
        if _doctype_has_field(doctype, fieldname):
            return fieldname
    return None


def _student_identity_values(student_doc):
    values = set()
    for fieldname in STUDENT_LOGIN_FIELDS:
        value = (student_doc.get(fieldname) or "").strip().lower()
        if value:
            values.add(value)
    return values


def _clean_field(field):
    return {
        "fieldname": field.fieldname,
        "label": field.label,
        "fieldtype": field.fieldtype,
        "options": field.options,
        "reqd": int(field.reqd or 0),
        "read_only": int(field.read_only or 0),
        "hidden": int(field.hidden or 0),
        "default": field.default,
        "depends_on": field.depends_on,
        "mandatory_depends_on": field.mandatory_depends_on,
        "fetch_from": field.fetch_from,
        "description": field.description,
    }


@frappe.whitelist(allow_guest=True)
def get_portal_bootstrap(student=None):
    user = frappe.session.user
    roles = [] if not user or user == "Guest" else frappe.get_roles(user)
    is_admin = _has_admin_access(user)
    linked_student = _find_linked_student(user)
    target_student = student or linked_student

    student_doc = None
    if target_student and frappe.db.exists("SH Student", target_student):
        student_doc = frappe.get_doc("SH Student", target_student)
        if not is_admin and (user or "").strip().lower() not in _student_identity_values(student_doc):
            student_doc = None

    return {
        "user": user,
        "roles": roles,
        "is_logged_in": bool(user and user != "Guest"),
        "is_admin": is_admin,
        "linked_student": linked_student,
        "student": (
            {
                "name": student_doc.name,
                "student_name": student_doc.get("student_name"),
                "programme_path": student_doc.get("programme_path"),
                "status": student_doc.get("status"),
            }
            if student_doc
            else None
        ),
        "settings": get_portal_settings(),
    }


@frappe.whitelist(allow_guest=True)
def portal_logout(redirect_to="/skillshub"):
    """
    Explicitly terminate the active Frappe session for portal users.
    Safe to call repeatedly; supports both JSON API and hard redirect flows.
    """
    target = (redirect_to or "/skillshub").strip() or "/skillshub"
    try:
        if getattr(frappe.session, "user", None) and frappe.session.user != "Guest":
            frappe.local.login_manager.logout()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "SkillsHub Portal Logout")

    if getattr(frappe, "request", None) and frappe.request.method == "GET":
        frappe.local.response["type"] = "redirect"
        frappe.local.response["location"] = target
        return

    return {"ok": True, "redirect_to": target}


@frappe.whitelist()
def get_admin_students(filters=None, page=1, page_size=25):
    if not _has_admin_access():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    filters = _json_arg(filters, {}) or {}
    page = max(int(page or 1), 1)
    page_size = min(max(int(page_size or 25), 5), 200)
    offset = (page - 1) * page_size

    student_filters = {}
    if filters.get("status"):
        student_filters["status"] = filters.get("status")
    if filters.get("programme_path"):
        student_filters["programme_path"] = filters.get("programme_path")
    if filters.get("intake_cohort"):
        student_filters["intake_cohort"] = filters.get("intake_cohort")

    requested_fields = _existing_fields("SH Student", [
        "name",
        "student_name",
        "status",
        "programme_path",
        "intake_year",
        "intake_cohort",
        "current_schedule",
        "current_course",
        "current_milestone",
        "mobile",
        "modified",
    ])
    for optional in STUDENT_LOGIN_FIELDS:
        if _doctype_has_field("SH Student", optional):
            requested_fields.append(optional)

    search = (filters.get("search") or "").strip().lower()

    if search:
        students = frappe.get_all(
            "SH Student",
            filters=student_filters,
            fields=requested_fields,
            order_by="modified desc",
            limit=0,
        )
        search_fields = _existing_fields("SH Student", ["name", "student_name"] + STUDENT_LOGIN_FIELDS)
        students = [
            row
            for row in students
            if any(search in (row.get(fieldname) or "").lower() for fieldname in search_fields)
        ]
        total = len(students)
        students = students[offset : offset + page_size]
    else:
        students = frappe.get_all(
            "SH Student",
            filters=student_filters,
            fields=requested_fields,
            order_by="modified desc",
            limit_start=offset,
            limit=page_size,
        )
        total = frappe.db.count("SH Student", student_filters)

    student_ids = [row.name for row in students]
    enrolments = {}
    if student_ids:
        enrolment_rows = frappe.db.sql(
            """
            SELECT
                student,
                COUNT(*) AS enrolment_count,
                SUM(CASE WHEN status = 'Enrolled' THEN 1 ELSE 0 END) AS active_enrolments,
                AVG(attendance_rate) AS avg_attendance
            FROM `tabSH Enrolment`
            WHERE student IN %(students)s
            GROUP BY student
            """,
            {"students": tuple(student_ids)},
            as_dict=True,
        )
        enrolments = {row.student: row for row in enrolment_rows}

    for row in students:
        stat = enrolments.get(row.name) or {}
        row["enrolment_count"] = int(stat.get("enrolment_count") or 0)
        row["active_enrolments"] = int(stat.get("active_enrolments") or 0)
        row["avg_attendance"] = float(stat.get("avg_attendance") or 0)

    return {
        "items": students,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max((total + page_size - 1) // page_size, 1),
    }


@frappe.whitelist()
def get_feedback_records(student):
    if not student:
        frappe.throw(_("Student is required."))

    is_admin = _has_admin_access()
    user = frappe.session.user
    linked = _find_linked_student(user)
    if not is_admin and linked != student:
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    records = []
    for spec in FEEDBACK_DOCTYPES:
        doctype = spec["doctype"]
        if not frappe.db.exists("DocType", doctype):
            continue
        student_field = _feedback_student_field(doctype)
        schedule_field = _feedback_schedule_field(doctype)
        if not student_field:
            continue
        fields = ["name", "creation", "modified"]
        if _doctype_has_field(doctype, "enrolment_ticket"):
            fields.append("enrolment_ticket")
        if schedule_field:
            fields.append(schedule_field)

        rows = frappe.get_all(
            doctype,
            filters={student_field: student},
            fields=fields,
            order_by="creation desc",
            limit=500,
        )
        for row in rows:
            row["doctype"] = doctype
            row["label"] = spec["label"]
            row["route"] = spec["route"]
            row["enrolment_ticket"] = row.get("enrolment_ticket") or ""
            row["programme_schedule"] = row.get(schedule_field) if schedule_field else ""
            records.append(row)

    records.sort(key=lambda x: x.get("creation") or "", reverse=True)
    return records


@frappe.whitelist()
def get_student_admin_bundle(student):
    if not student:
        frappe.throw(_("Student is required."))

    user = frappe.session.user
    is_admin = _has_admin_access(user)
    linked = _find_linked_student(user)

    if not is_admin and linked != student:
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    student_doc = frappe.get_doc("SH Student", student)
    student_data = student_doc.as_dict()

    enrolment_fields = _existing_fields("SH Enrolment", [
        "name",
        "class",
        "course",
        "milestone",
        "cohort",
        "course_run",
        "status",
        "enrolment_date",
        "completion_date",
        "sessions_total",
        "sessions_present",
        "sessions_absent",
        "attendance_rate",
        "feedback_submitted",
        "baseline_submitted",
    ])
    enrolments = frappe.get_all(
        "SH Enrolment",
        filters={"student": student},
        fields=enrolment_fields,
        order_by="enrolment_date desc",
        limit=1000,
    )

    attendance_fields = _existing_fields("SH Attendance", [
        "name",
        "date",
        "status",
        "sh_programme_schedule",
        "week",
        "day",
        "late_minutes",
        "notes",
        "marked_by",
        "modified",
    ])
    attendance = frappe.get_all(
        "SH Attendance",
        filters={"sh_student": student},
        fields=attendance_fields,
        order_by="date desc",
        limit=2000,
    )

    feedback = get_feedback_records(student)
    return {
        "student": student_data,
        "enrolments": enrolments,
        "attendance": attendance,
        "feedback": feedback,
        "is_admin": is_admin,
    }


@frappe.whitelist()
def get_form_meta(doctype):
    allowed = {row["doctype"] for row in FEEDBACK_DOCTYPES}
    if doctype not in allowed:
        frappe.throw(_("Form is not exposed in portal."))

    if not frappe.db.exists("DocType", doctype):
        frappe.throw(_("DocType does not exist: {0}").format(doctype))

    meta = frappe.get_meta(doctype)
    fields = []
    child_tables = {}

    for field in meta.fields:
        if field.fieldtype in {"Section Break", "Column Break", "Tab Break", "Fold", "HTML", "Button"}:
            continue
        fields.append(_clean_field(field))

        if field.fieldtype == "Table" and field.options:
            child_meta = frappe.get_meta(field.options)
            child_fields = []
            for child_field in child_meta.fields:
                if child_field.fieldtype in {"Section Break", "Column Break", "Tab Break", "Fold", "HTML", "Button"}:
                    continue
                if child_field.fieldname in {"idx", "parent", "parentfield", "parenttype"}:
                    continue
                child_fields.append(_clean_field(child_field))
            child_tables[field.fieldname] = {
                "doctype": field.options,
                "fields": child_fields,
            }

    return {
        "doctype": doctype,
        "fields": fields,
        "child_tables": child_tables,
        "allowed_links": FEEDBACK_DOCTYPES,
    }


@frappe.whitelist()
def get_link_options(doctype, search_text=None, limit=200):
    limit = min(max(int(limit or 200), 1), 500)
    filters = {}
    if search_text:
        filters["name"] = ["like", f"%{search_text}%"]

    rows = frappe.get_all(
        doctype,
        filters=filters,
        fields=["name"],
        limit=limit,
        order_by="name asc",
    )
    return [row.name for row in rows]


@frappe.whitelist()
def get_intake_cohort_options():
    if not _has_admin_access():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    options = set()

    if frappe.db.exists("DocType", "SH Cohort"):
        cohort_fields = _existing_fields("SH Cohort", ["name", "cohort_name"])
        cohort_rows = frappe.get_all(
            "SH Cohort",
            fields=cohort_fields,
            limit=1000,
            order_by="name asc",
        )
        for row in cohort_rows:
            value = (row.get("name") or row.get("cohort_name") or "").strip()
            if value:
                options.add(value)

    if _doctype_has_field("SH Student", "intake_cohort"):
        student_rows = frappe.db.sql(
            """
            SELECT DISTINCT intake_cohort
            FROM `tabSH Student`
            WHERE IFNULL(intake_cohort, '') != ''
            ORDER BY intake_cohort ASC
            """,
            as_dict=True,
        )
        for row in student_rows:
            value = (row.get("intake_cohort") or "").strip()
            if value:
                options.add(value)

    return sorted(options)


@frappe.whitelist()
def submit_portal_form(doctype, values):
    allowed = {row["doctype"] for row in FEEDBACK_DOCTYPES}
    if doctype not in allowed:
        frappe.throw(_("Form is not exposed in portal."))

    values = _json_arg(values, {})
    if not isinstance(values, dict):
        frappe.throw(_("Invalid payload."))

    user = frappe.session.user
    is_admin = _has_admin_access(user)
    linked = _find_linked_student(user)

    student_field = "sh_student" if "sh_student" in values else ("student" if "student" in values else None)
    target_student = values.get(student_field) if student_field else None
    if target_student and not is_admin and linked != target_student:
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    doc = frappe.new_doc(doctype)
    meta = frappe.get_meta(doctype)
    for field in meta.fields:
        name = field.fieldname
        if name in {"name", "owner", "creation", "modified", "modified_by"}:
            continue
        if name not in values:
            continue
        value = values.get(name)
        if field.fieldtype == "Table" and isinstance(value, list):
            doc.set(name, [])
            for row in value:
                if isinstance(row, dict):
                    doc.append(name, row)
        else:
            doc.set(name, value)

    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name, "doctype": doctype}


@frappe.whitelist()
def get_portal_form_doc(doctype, name):
    if not doctype or not name:
        frappe.throw(_("DocType and name are required."))

    allowed = {row["doctype"] for row in FEEDBACK_DOCTYPES}
    if doctype not in allowed:
        frappe.throw(_("Form is not exposed in portal."))

    doc = frappe.get_doc(doctype, name)
    data = doc.as_dict()

    user = frappe.session.user
    is_admin = _has_admin_access(user)
    linked = _find_linked_student(user)

    student = data.get("sh_student") or data.get("student")
    if not is_admin and linked != student:
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    return data


@frappe.whitelist()
def get_attendance_roster(schedule):
    if not schedule:
        frappe.throw(_("Class is required."))
    if not _has_admin_access():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    rows = frappe.get_all(
        "SH Enrolment",
        filters={"class": schedule, "status": "Enrolled"},
        fields=["student", "student_name", "name", "attendance_rate", "sessions_total"],
        order_by="student_name asc",
        limit=5000,
    )
    missing_names = [row.student for row in rows if not row.get("student_name")]
    if missing_names:
        student_names = {
            row.name: row.student_name
            for row in frappe.get_all(
                "SH Student",
                filters={"name": ["in", missing_names]},
                fields=["name", "student_name"],
                limit=5000,
            )
        }
        for row in rows:
            if not row.get("student_name"):
                row["student_name"] = student_names.get(row.student) or row.student
    return rows


@frappe.whitelist()
def get_attendance_records(schedule, date):
    if not schedule or not date:
        frappe.throw(_("Class and date are required."))
    if not _has_admin_access():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    rows = frappe.get_all(
        "SH Attendance",
        filters={"sh_programme_schedule": schedule, "date": date},
        fields=["name", "sh_student", "student_name", "status", "late_minutes", "notes", "modified", "marked_by"],
        order_by="student_name asc",
        limit=10000,
    )
    return rows


@frappe.whitelist()
def save_attendance(schedule, date, attendance_records):
    if not schedule or not date:
        frappe.throw(_("Class and date are required."))
    if not _has_admin_access():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    attendance_records = _json_arg(attendance_records, [])
    if not isinstance(attendance_records, list):
        frappe.throw(_("Invalid attendance records payload."))

    changed_students = set()
    created = 0
    updated = 0
    student_ids = sorted({
        row.get("student")
        for row in attendance_records
        if isinstance(row, dict) and row.get("student")
    })
    student_name_map = {}
    if student_ids:
        student_name_map = {
            row.name: row.student_name
            for row in frappe.get_all(
                "SH Student",
                filters={"name": ["in", student_ids]},
                fields=["name", "student_name"],
                limit=len(student_ids),
            )
        }

    for row in attendance_records:
        if not isinstance(row, dict):
            continue
        student = row.get("student")
        if not student:
            continue

        values = {
            "sh_student": student,
            "student_name": student_name_map.get(student) or student,
            "sh_programme_schedule": schedule,
            "date": date,
            "status": row.get("status") or "Absent",
            "late_minutes": row.get("late_minutes") or 0,
            "notes": row.get("notes") or "",
            "marked_by": frappe.session.user,
        }
        existing = frappe.db.get_value(
            "SH Attendance",
            {"sh_student": student, "sh_programme_schedule": schedule, "date": date},
            "name",
        )
        if existing:
            frappe.db.set_value("SH Attendance", existing, values)
            updated += 1
        else:
            doc = frappe.new_doc("SH Attendance")
            for key, value in values.items():
                doc.set(key, value)
            doc.insert(ignore_permissions=True)
            created += 1
        changed_students.add(student)

    for student in changed_students:
        _recompute_enrolment_for_student(student, schedule)

    frappe.db.commit()
    return {
        "created": created,
        "updated": updated,
        "total": created + updated,
    }


@frappe.whitelist()
def get_doctype_meta(doctype):
    if not _has_admin_access():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    if not doctype or not frappe.db.exists("DocType", doctype):
        frappe.throw(_("DocType not found: {0}").format(doctype or ""))

    meta = frappe.get_meta(doctype)
    fields = []
    tables = {}
    for field in meta.fields:
        fields.append(_clean_field(field))
        if field.fieldtype == "Table" and field.options:
            child_meta = frappe.get_meta(field.options)
            child_fields = []
            for child_field in child_meta.fields:
                if child_field.fieldname in {"idx", "parent", "parentfield", "parenttype"}:
                    continue
                child_fields.append(_clean_field(child_field))
            tables[field.fieldname] = {"doctype": field.options, "fields": child_fields}

    return {
        "doctype": doctype,
        "title_field": meta.title_field,
        "search_fields": meta.search_fields,
        "fields": fields,
        "tables": tables,
    }


@frappe.whitelist()
def update_portal_settings(values):
    if not _has_admin_access():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    values = _json_arg(values, {})
    if not isinstance(values, dict):
        frappe.throw(_("Invalid settings payload."))

    allowed = {
        "portal_name",
        "portal_tagline",
        "landing_title",
        "landing_subtitle",
        "login_notice",
        "support_email",
        "student_home_route",
        "admin_home_route",
        "primary_color",
        "secondary_color",
        "accent_color",
        "background_color",
        "surface_color",
        "text_color",
        "muted_text_color",
        "header_gradient",
        "logo",
        "favicon",
        "current_cohort",
        "default_academic_year",
        "default_programme",
    }

    doc = frappe.get_single("SkillsHub Portal Settings")
    for key, value in values.items():
        if key in allowed:
            doc.set(key, value)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return get_portal_settings()
