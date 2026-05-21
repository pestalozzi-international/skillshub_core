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
		"portal_name": doc.portal_name or "SkillsHub Portal",
		"portal_tagline": doc.portal_tagline or "",
		"landing_title": doc.landing_title or "Welcome to SkillsHub",
		"landing_subtitle": doc.landing_subtitle or "",
		"login_notice": doc.login_notice or "",
		"support_email": doc.support_email or "",
		"student_home_route": doc.student_home_route or "/skillshub/profile",
		"admin_home_route": doc.admin_home_route or "/skillshub/admin/students",
		"primary_color": doc.primary_color or "#0f766e",
		"secondary_color": doc.secondary_color or "#115e59",
		"accent_color": doc.accent_color or "#0ea5a4",
		"background_color": doc.background_color or "#f8fafc",
		"surface_color": doc.surface_color or "#ffffff",
		"text_color": doc.text_color or "#0f172a",
		"muted_text_color": doc.muted_text_color or "#64748b",
		"header_gradient": doc.header_gradient or "linear-gradient(135deg, #0f766e 0%, #115e59 100%)",
		"logo": doc.logo or "",
		"favicon": doc.favicon or "",
		"current_cohort": doc.current_cohort or "",
		"default_academic_year": doc.default_academic_year or "",
		"default_programme": doc.default_programme or "",
	}
