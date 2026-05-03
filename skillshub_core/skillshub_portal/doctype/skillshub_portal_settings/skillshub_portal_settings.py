# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SkillsHubPortalSettings(Document):
    pass


@frappe.whitelist(allow_guest=True)
def get_portal_settings():
    """
    Return portal branding settings for the frontend.
    Accessible to guests so the login page can apply branding.
    GET /api/method/skillshub_core.skillshub_portal.doctype
             .skillshub_portal_settings.skillshub_portal_settings.get_portal_settings
    """
    doc = frappe.get_single("SkillsHub Portal Settings")
    return {
        "primary_color":           doc.primary_color           or "#0f766e",
        "secondary_color":         doc.secondary_color         or "#115e59",
        "header_gradient":         doc.header_gradient         or "linear-gradient(135deg, #0f766e 0%, #115e59 100%)",
        "logo":                    doc.logo                    or "",
        "favicon":                 doc.favicon                 or "",
        "current_cohort":          doc.current_cohort          or "",
        "default_academic_year":   doc.default_academic_year   or "",
        "default_programme":       doc.default_programme       or "",
        "default_term":            doc.default_term            or "",
    }
