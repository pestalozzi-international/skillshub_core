import json

import frappe


LEGACY_DOCTYPE_MAP = {
    "SH Student Enrolment": "SH Enrolment",
    "SH Programme Schedule": "SH Class",
    "SH Student Baseline Form": "SH Baseline",
    "SkillsHub Edulution Feedback": "SH Edulution Feedback",
    "SkillsHub Edultion Feedback": "SH Edulution Feedback",
}

WORKSPACE_NAMES = [
    "Zambia: SkillsHub",
    "Mindset Camp",
    "Edulution",
    "Soft Skills",
    "Vocational Training",
    "Alumni & Work",
    "Parent Feedback",
]

DASHBOARD_NAMES = [
    "SkillsHub Programme Overview",
    "SkillsHub Cohort Analysis",
    "SkillsHub Employment & Outcomes",
]


def _doctype_has_field(doctype, fieldname):
    if not doctype or not fieldname:
        return False
    if not frappe.db.exists("DocType", doctype):
        return False
    try:
        return bool(frappe.get_meta(doctype).get_field(fieldname))
    except Exception:
        return False


def _loads_json(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _dumps_json(value):
    return json.dumps(value, separators=(",", ":"))


def _sanitize_filters_json(filters_json, fallback_doctype=None):
    filters = _loads_json(filters_json, [])
    if not isinstance(filters, list):
        return filters_json, False

    changed = False
    cleaned = []
    for condition in filters:
        if not isinstance(condition, (list, tuple)) or len(condition) < 4:
            cleaned.append(condition)
            continue

        doctype = condition[0] or fallback_doctype
        fieldname = condition[1]
        operator = condition[2]
        value = condition[3]
        extra = list(condition[4:]) if len(condition) > 4 else []

        if isinstance(doctype, str) and doctype in LEGACY_DOCTYPE_MAP:
            doctype = LEGACY_DOCTYPE_MAP[doctype]
            changed = True

        if fieldname == "attendance_pct":
            fieldname = "attendance_rate"
            changed = True
        if fieldname == "programme_schedule":
            fieldname = "class"
            changed = True

        if doctype and not frappe.db.exists("DocType", doctype):
            changed = True
            continue

        if doctype and fieldname and not _doctype_has_field(doctype, fieldname):
            changed = True
            continue

        cleaned.append([doctype, fieldname, operator, value] + extra)

    if changed or cleaned != filters:
        return _dumps_json(cleaned), True
    return filters_json, False


def _cleanup_workspace(workspace_name):
    if not frappe.db.exists("Workspace", workspace_name):
        return

    doc = frappe.get_doc("Workspace", workspace_name)
    changed = False

    for row in doc.shortcuts or []:
        link_to = row.link_to
        if row.type != "DocType" or not link_to:
            continue
        mapped = LEGACY_DOCTYPE_MAP.get(link_to, link_to)
        if mapped != link_to:
            row.link_to = mapped
            changed = True
        if row.link_to and not frappe.db.exists("DocType", row.link_to):
            row.hidden = 1
            changed = True
        if row.label in {"Programme Schedule", "SH Class"}:
            row.label = "Class"
            changed = True

    for row in doc.links or []:
        if row.type == "Card Break":
            continue

        link_to = row.link_to
        if row.link_type == "DocType" and link_to:
            mapped = LEGACY_DOCTYPE_MAP.get(link_to, link_to)
            if mapped != link_to:
                row.link_to = mapped
                changed = True
            if row.link_to and not frappe.db.exists("DocType", row.link_to):
                row.hidden = 1
                changed = True

        if row.label in {"Programme Schedule", "SH Class"}:
            row.label = "Class"
            changed = True

    content = doc.content or ""
    replacements = {
        "Programme Schedule": "Class",
        "SH Student Enrolment": "SH Enrolment",
        "Student Enrolment": "SH Enrolment",
    }
    for old, new in replacements.items():
        if old in content:
            content = content.replace(old, new)
            changed = True
    if content != (doc.content or ""):
        doc.content = content

    if workspace_name == "Zambia: SkillsHub":
        if not any((row.type == "DocType" and row.link_to == "SkillsHub Portal Settings") for row in (doc.shortcuts or [])):
            doc.append(
                "shortcuts",
                {
                    "label": "Portal Settings",
                    "type": "DocType",
                    "link_to": "SkillsHub Portal Settings",
                    "doc_view": "List",
                    "color": "Grey",
                },
            )
            changed = True

    if changed:
        doc.save(ignore_permissions=True)


def _cleanup_number_cards():
    if frappe.db.exists("Number Card", "SH - At-Risk Students"):
        doc = frappe.get_doc("Number Card", "SH - At-Risk Students")
        doc.document_type = "SH Enrolment"
        doc.function = "Count"
        doc.aggregate_function_based_on = ""
        doc.filters_json = _dumps_json([
            ["SH Enrolment", "attendance_rate", "<", 75],
            ["SH Enrolment", "status", "=", "Enrolled"],
        ])
        doc.save(ignore_permissions=True)

    rows = frappe.get_all("Number Card", filters={"name": ["like", "SH -%"]}, fields=["name"], limit=0)
    for row in rows:
        doc = frappe.get_doc("Number Card", row.name)
        changed = False

        mapped_doctype = LEGACY_DOCTYPE_MAP.get(doc.document_type, doc.document_type)
        if mapped_doctype != doc.document_type:
            doc.document_type = mapped_doctype
            changed = True

        updated_filters, filters_changed = _sanitize_filters_json(doc.filters_json, doc.document_type)
        if filters_changed:
            doc.filters_json = updated_filters
            changed = True

        if doc.function in {"Average", "Sum"}:
            value_field = (doc.aggregate_function_based_on or "").strip()
            if not value_field or not _doctype_has_field(doc.document_type, value_field):
                doc.function = "Count"
                doc.aggregate_function_based_on = ""
                changed = True

        if changed:
            doc.save(ignore_permissions=True)


def _cleanup_dashboard_charts():
    chart_fixes = {
        "SH Enrolments by Cohort": "cohort",
        "SH Enrolments by Course": "course",
    }
    for chart_name, group_field in chart_fixes.items():
        if not frappe.db.exists("Dashboard Chart", chart_name):
            continue
        doc = frappe.get_doc("Dashboard Chart", chart_name)
        doc.document_type = "SH Enrolment"
        doc.chart_type = "Group By"
        doc.group_by_type = "Count"
        doc.group_by_based_on = group_field
        doc.aggregate_function_based_on = ""
        doc.filters_json = "[]"
        doc.save(ignore_permissions=True)

    rows = frappe.get_all("Dashboard Chart", filters={"name": ["like", "SH %"]}, fields=["name"], limit=0)
    for row in rows:
        doc = frappe.get_doc("Dashboard Chart", row.name)
        changed = False

        mapped_doctype = LEGACY_DOCTYPE_MAP.get(doc.document_type, doc.document_type)
        if mapped_doctype != doc.document_type:
            doc.document_type = mapped_doctype
            changed = True

        updated_filters, filters_changed = _sanitize_filters_json(doc.filters_json, doc.document_type)
        if filters_changed:
            doc.filters_json = updated_filters
            changed = True

        if doc.chart_type == "Group By":
            if not _doctype_has_field(doc.document_type, doc.group_by_based_on):
                if _doctype_has_field(doc.document_type, "status"):
                    doc.group_by_based_on = "status"
                    changed = True
                elif _doctype_has_field(doc.document_type, "name"):
                    doc.group_by_based_on = "name"
                    changed = True

            if doc.group_by_type in {"Average", "Sum"}:
                agg = (doc.aggregate_function_based_on or "").strip()
                if not agg or not _doctype_has_field(doc.document_type, agg):
                    doc.group_by_type = "Count"
                    doc.aggregate_function_based_on = ""
                    changed = True

        if changed:
            doc.save(ignore_permissions=True)


def _cleanup_dashboards():
    for dashboard_name in DASHBOARD_NAMES:
        if not frappe.db.exists("Dashboard", dashboard_name):
            continue

        doc = frappe.get_doc("Dashboard", dashboard_name)
        changed = False

        kept_charts = []
        for row in doc.charts or []:
            if row.chart and frappe.db.exists("Dashboard Chart", row.chart):
                kept_charts.append(row)
            else:
                changed = True
        if len(kept_charts) != len(doc.charts or []):
            doc.charts = kept_charts

        kept_cards = []
        for row in doc.cards or []:
            if row.card and frappe.db.exists("Number Card", row.card):
                kept_cards.append(row)
            else:
                changed = True
        if len(kept_cards) != len(doc.cards or []):
            doc.cards = kept_cards

        if changed:
            doc.save(ignore_permissions=True)


def _drop_legacy_tables():
    for table_name in (
        "tabSkillsHub Edultion Feedback",
        "tabSkillsHub Edulution Feedback",
        "tabSH Student Enrolment",
    ):
        exists = frappe.db.sql("SHOW TABLES LIKE %s", table_name)
        if exists:
            frappe.db.sql(f"DROP TABLE `{table_name}`")

    for doctype_name in ("SkillsHub Edulution Feedback", "SkillsHub Edultion Feedback"):
        if frappe.db.exists("DocType", doctype_name):
            frappe.delete_doc("DocType", doctype_name, force=1, ignore_permissions=True)


def execute():
    for workspace_name in WORKSPACE_NAMES:
        _cleanup_workspace(workspace_name)

    _cleanup_number_cards()
    _cleanup_dashboard_charts()
    _cleanup_dashboards()
    _drop_legacy_tables()
    frappe.db.commit()
