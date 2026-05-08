import frappe


LEGACY_WEB_FORMS = [
    "skillshub_student_baseline_assessment",
    "skillshub_attachment_feedback",
    "skillshub_vocational_training_feedback",
    "skillshub_parent_feedback",
    "skillshub_soft_skills_feedback",
    "skillshub_edulution_feedback",
    "skillshub_profile",
    "abc",
]

LEGACY_DOCTYPES = [
    "SkillsHub Edulution Feedback",
]


def execute():
    for web_form_name in LEGACY_WEB_FORMS:
        if frappe.db.exists("Web Form", web_form_name):
            frappe.delete_doc("Web Form", web_form_name, force=True, ignore_permissions=True)

    for doctype_name in LEGACY_DOCTYPES:
        if frappe.db.exists("DocType", doctype_name):
            frappe.delete_doc("DocType", doctype_name, force=True, ignore_permissions=True)
