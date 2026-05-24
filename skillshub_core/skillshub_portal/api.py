import json
import secrets

import frappe
from frappe import _

from skillshub_core.skillshub_core.api import _recompute_enrolment_for_student
from skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings import (
	get_portal_settings,
)

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
	{"doctype": "SH Baseline", "label": "Baseline Assessment", "route": "/skillshub/s/baseline"},
	{
		"doctype": "SH Soft Skills Feedback",
		"label": "Soft Skills Feedback",
		"route": "/skillshub/s/soft-skills",
	},
	{
		"doctype": "SH Mindset Camp Feedback",
		"label": "Mindset Camp Feedback",
		"route": "/skillshub/s/mindset-camp",
	},
	{
		"doctype": "SH VT Feedback",
		"label": "Vocational Training Feedback",
		"route": "/skillshub/s/vocational-training",
	},
	{
		"doctype": "SH Edulution Feedback",
		"label": "Edulution Feedback",
		"route": "/skillshub/s/edulution",
	},
	{
		"doctype": "SH Attachment Feedback",
		"label": "Attachment Feedback",
		"route": "/skillshub/s/attachment",
	},
	{"doctype": "SH Parent Feedback", "label": "Parent Feedback", "route": "/skillshub/s/parent"},
	{
		"doctype": "SH Graduate Feedback",
		"label": "Graduate Feedback",
		"route": "/skillshub/s/graduate-feedback",
	},
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
	return [
		fieldname for fieldname in candidates if fieldname == "name" or _doctype_has_field(doctype, fieldname)
	]


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


@frappe.whitelist(allow_guest=True)  # nosemgrep
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


@frappe.whitelist(allow_guest=True)  # nosemgrep
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


@frappe.whitelist()  # nosemgrep
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

	requested_fields = _existing_fields(
		"SH Student",
		[
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
		],
	)
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
		search_fields = _existing_fields("SH Student", ["name", "student_name", *STUDENT_LOGIN_FIELDS])
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


@frappe.whitelist()  # nosemgrep
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


@frappe.whitelist()  # nosemgrep
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

	enrolment_fields = _existing_fields(
		"SH Enrolment",
		[
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
		],
	)
	enrolments = frappe.get_all(
		"SH Enrolment",
		filters={"student": student},
		fields=enrolment_fields,
		order_by="enrolment_date desc",
		limit=1000,
	)

	attendance_fields = _existing_fields(
		"SH Attendance",
		[
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
		],
	)
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


@frappe.whitelist()  # nosemgrep
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
				if child_field.fieldtype in {
					"Section Break",
					"Column Break",
					"Tab Break",
					"Fold",
					"HTML",
					"Button",
				}:
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


@frappe.whitelist()  # nosemgrep
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


@frappe.whitelist()  # nosemgrep
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
	frappe.db.commit()  # nosemgrep
	return {"name": doc.name, "doctype": doctype}


@frappe.whitelist()  # nosemgrep
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


@frappe.whitelist()  # nosemgrep
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


@frappe.whitelist()  # nosemgrep
def get_attendance_records(schedule, date):
	if not schedule or not date:
		frappe.throw(_("Class and date are required."))
	if not _has_admin_access():
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	rows = frappe.get_all(
		"SH Attendance",
		filters={"sh_programme_schedule": schedule, "date": date},
		fields=[
			"name",
			"sh_student",
			"student_name",
			"status",
			"late_minutes",
			"notes",
			"modified",
			"marked_by",
		],
		order_by="student_name asc",
		limit=10000,
	)
	return rows


@frappe.whitelist()  # nosemgrep
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
	student_ids = sorted(
		{row.get("student") for row in attendance_records if isinstance(row, dict) and row.get("student")}
	)
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

	frappe.db.commit()  # nosemgrep
	return {
		"created": created,
		"updated": updated,
		"total": created + updated,
	}


@frappe.whitelist()  # nosemgrep
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


# ---------------------------------------------------------------------------
# Public Portal Constants
# ---------------------------------------------------------------------------

ONCE_PER_ENROLMENT_DOCTYPES = {
	"SH Mindset Camp Feedback",
	"SH VT Feedback",
	"SH Edulution Feedback",
	"SH Attachment Feedback",
	"SH Parent Feedback",
}

PUBLIC_PROFILE_READONLY = {
	"name",
	"naming_series",
	"route",
	"published",
	"fullname_and_id",
	"creation",
	"modified",
	"modified_by",
	"owner",
	"docstatus",
	"idx",
	"parent",
	"parentfield",
	"parenttype",
	"pestalozzi_student_id",
	"status",
	"portal_user_account",
	"enabled",
	"student_enrolment",
	"intake_year",
	"intake_cohort",
	"current_schedule",
	"current_course",
	"current_milestone",
	"programme_path",
	"student_name",
	"age",
	"graduated",
	"discipline",
	"enrolment_date",
	"graduation_completion_date",
	"date_submitted_enrolment_form",
	"applicant_record",
	"exit_reason",
	"last_year_of_schooling",
}

# Fields never shown to students in the public profile (hidden entirely, not just read-only)
PUBLIC_PROFILE_EXCLUDED = {
	"route",
	"published",
	"portal_user_account",
	"enabled",
	"pestalozzi_student_email",
	"naming_series",
	"fullname_and_id",
	"discipline",
}

# Section break fieldnames whose entire section is hidden from the profile
EXCLUDED_SECTION_FNS = {
	"portal_access_section",
	"attachment_during_skillshub_section",
	"section_break_veyp",
	"section_break_lzmy",  # Employment Post SkillsHub
}

# Fields that must appear even if they fall inside an excluded section
# (needed when live-server doctype customisations move fields between sections)
FORCE_INCLUDE_FNS = {"number_of_siblings"}

PUBLIC_LINK_ALLOWED = {
	"SH Class",
	"SkillsHub Programme",
	"SH Enrolment",
	"SH Cohort",
	"SH Academic Year",
	"SkillsHub Course",
	"SkillsHub Soft Skills",
	"SH Student Motivation",
	"SH Student Resilience",
	"SH Student Community Challenge",
	"SH Mindset Camp Aspect",
	"SH VT Beneficial Programme Aspect",
	"SH VT Course Expectation",
	"SH SS Course Expectation",
	"SH Attachment Challenge",
	"SH Household Participation Impact",
	"SH Beneficiary",
	"SH Employment Institution",
	"Religion",
	"Nationality",
	"Gender",
	"Country",
	"Currency",
}

PUBLIC_FORM_ROUTES = {
	"SH Baseline": "/skillshub/s/baseline",
	"SH Soft Skills Feedback": "/skillshub/s/soft-skills",
	"SH Mindset Camp Feedback": "/skillshub/s/mindset-camp",
	"SH VT Feedback": "/skillshub/s/vocational-training",
	"SH Edulution Feedback": "/skillshub/s/edulution",
	"SH Attachment Feedback": "/skillshub/s/attachment",
	"SH Parent Feedback": "/skillshub/s/parent",
	"SH Graduate Feedback": "/skillshub/s/graduate-feedback",
}


PUBLIC_FORM_LIST = [
	{"doctype": "SH Baseline", "label": "Baseline Assessment", "section": "assessment"},
	{"doctype": "SH Soft Skills Feedback", "label": "Soft Skills Feedback", "section": "assessment"},
	{"doctype": "SH Mindset Camp Feedback", "label": "Mindset Camp Feedback", "section": "programme"},
	{
		"doctype": "SH Edulution Feedback",
		"label": "Edulution Feedback",
		"section": "programme",
		"path_a_only": True,
	},
	{"doctype": "SH VT Feedback", "label": "Vocational Training Feedback", "section": "programme"},
	{"doctype": "SH Attachment Feedback", "label": "Attachment Feedback", "section": "other"},
	{"doctype": "SH Parent Feedback", "label": "Parent / Guardian Feedback", "section": "other"},
	{
		"doctype": "SH Graduate Feedback",
		"label": "Graduate Feedback",
		"section": "alumni",
		"alumni_only": True,
	},
]


# ---------------------------------------------------------------------------
# Token helpers (Redis-backed, 60-minute TTL)
# ---------------------------------------------------------------------------


def _get_redis():
	cache = frappe.cache
	if callable(cache):
		cache = cache()
	return cache


def _tok_key(token):
	return f"sh_pub:{token}"


def _tok_set(token, student_id, ttl=3600):
	try:
		_get_redis().set(_tok_key(token), student_id, ex=ttl)
	except Exception:
		frappe.cache.set_value(_tok_key(token), student_id, expires_in_sec=ttl)


def _tok_get(token):
	try:
		val = _get_redis().get(_tok_key(token))
		if val is None:
			return None
		return val.decode() if isinstance(val, bytes) else str(val)
	except Exception:
		return frappe.cache.get_value(_tok_key(token))


def _tok_del(token):
	try:
		_get_redis().delete(_tok_key(token))
	except Exception:
		frappe.cache.delete_value(_tok_key(token))


def _validate_pub_token(student_id, token):
	if not token or not student_id:
		frappe.throw(_("Session expired. Please verify your identity again."), frappe.AuthenticationError)
	cached = _tok_get(token)
	if not cached or cached.strip() != (student_id or "").strip():
		frappe.throw(_("Session expired. Please verify your identity again."), frappe.AuthenticationError)


# ---------------------------------------------------------------------------
# Public Portal Endpoints (allow_guest=True)
# ---------------------------------------------------------------------------


@frappe.whitelist(allow_guest=True)  # nosemgrep
def verify_student_public(student_id, date_of_birth):
	"""Verify student identity with ID + DOB. Returns a short-lived session token."""
	import datetime

	student_id = (student_id or "").strip().upper()
	dob_input = (date_of_birth or "").strip()

	if not student_id or not dob_input:
		frappe.throw(_("Student ID and Date of Birth are required."))

	if not frappe.db.exists("SH Student", student_id):
		frappe.throw(_("Incorrect Student ID or Date of Birth."), frappe.AuthenticationError)

	student_doc = frappe.get_doc("SH Student", student_id)

	stored_dob = student_doc.get("date_of_birth")
	if stored_dob:
		if isinstance(stored_dob, datetime.date | datetime.datetime):
			stored_dob = stored_dob.strftime("%Y-%m-%d")
		else:
			stored_dob = str(stored_dob).strip()
	else:
		stored_dob = ""

	if not stored_dob or dob_input != stored_dob:
		frappe.throw(_("Incorrect Student ID or Date of Birth."), frappe.AuthenticationError)

	token = secrets.token_hex(32)
	_tok_set(token, student_id)

	return {
		"token": token,
		"student_id": student_id,
		"student_name": student_doc.get("student_name") or "",
		"programme_path": student_doc.get("programme_path") or "",
		"status": student_doc.get("status") or "",
	}


@frappe.whitelist(allow_guest=True)  # nosemgrep
def get_public_profile(student_id, token):
	"""Return full SH Student doc + meta for the public profile editor."""
	_validate_pub_token(student_id, token)

	student_doc = frappe.get_doc("SH Student", student_id)
	data = student_doc.as_dict()

	meta = frappe.get_meta("SH Student")
	fields = []
	child_tables = {}

	skip_section = False
	for field in meta.fields:
		if field.fieldtype in {"Fold", "HTML", "Button"}:
			continue
		if field.fieldtype == "Section Break":
			if field.fieldname in EXCLUDED_SECTION_FNS:
				skip_section = True
				continue  # omit this section break too
			else:
				skip_section = False
		if skip_section and field.fieldname not in FORCE_INCLUDE_FNS:
			continue
		if field.fieldname in PUBLIC_PROFILE_EXCLUDED:
			continue
		is_ro = bool(field.read_only or field.fieldname in PUBLIC_PROFILE_READONLY)
		fd = {
			"fieldname": field.fieldname,
			"label": field.label or field.fieldname,
			"fieldtype": field.fieldtype,
			"options": field.options or "",
			"reqd": int(field.reqd or 0),
			"read_only": 1 if is_ro else 0,
			"hidden": int(field.hidden or 0),
			"default": field.default or "",
			"description": field.description or "",
			"depends_on": field.depends_on or "",
		}
		fields.append(fd)

		if field.fieldtype == "Table" and field.options:
			child_meta = frappe.get_meta(field.options)
			child_fields = []
			for cf in child_meta.fields:
				if cf.fieldtype in {"Section Break", "Column Break", "Tab Break", "Fold", "HTML", "Button"}:
					continue
				if cf.fieldname in {"idx", "parent", "parentfield", "parenttype"}:
					continue
				child_fields.append(
					{
						"fieldname": cf.fieldname,
						"label": cf.label or cf.fieldname,
						"fieldtype": cf.fieldtype,
						"options": cf.options or "",
						"reqd": int(cf.reqd or 0),
					}
				)
			child_tables[field.fieldname] = {"doctype": field.options, "fields": child_fields}

	return {
		"student": data,
		"fields": fields,
		"child_tables": child_tables,
		"readonly_fields": list(PUBLIC_PROFILE_READONLY),
	}


@frappe.whitelist(allow_guest=True)  # nosemgrep
def update_public_profile(student_id, token, payload):
	"""Save editable fields of SH Student from the public profile form."""
	_validate_pub_token(student_id, token)

	payload = _json_arg(payload, {})
	if not isinstance(payload, dict):
		frappe.throw(_("Invalid payload."))

	student_doc = frappe.get_doc("SH Student", student_id)
	meta = frappe.get_meta("SH Student")

	for field in meta.fields:
		fn = field.fieldname
		if fn not in payload or fn in PUBLIC_PROFILE_READONLY:
			continue
		value = payload[fn]
		if field.fieldtype == "Table" and isinstance(value, list):
			student_doc.set(fn, [])
			for row in value:
				if isinstance(row, dict):
					student_doc.append(fn, row)
		else:
			try:
				student_doc.set(fn, value)
			except Exception:
				pass

	student_doc.save(ignore_permissions=True)
	frappe.db.commit()  # nosemgrep
	return {"ok": True, "name": student_doc.name}


@frappe.whitelist(allow_guest=True)  # nosemgrep
def upload_public_profile_image(student_id, token, filename, filedata):
	"""Upload a student profile photo. filedata must be a base64-encoded image."""
	import base64

	from frappe.utils.file_manager import save_file

	_validate_pub_token(student_id, token)

	filename = (filename or "photo.jpg").strip()
	ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
	if ext not in {"jpg", "jpeg", "png", "gif", "webp"}:
		frappe.throw(_("Invalid image type. Allowed: jpg, jpeg, png, gif, webp"))

	raw = str(filedata or "")
	if "," in raw:
		raw = raw.split(",", 1)[1]

	try:
		content = base64.b64decode(raw)
	except Exception:
		frappe.throw(_("Invalid image data."))

	if len(content) > 2 * 1024 * 1024:
		frappe.throw(_("Image must be smaller than 2 MB."))

	saved = save_file(
		fname=filename,
		content=content,
		dt="SH Student",
		dn=student_id,
		folder="Home/Attachments",
		is_private=0,
	)

	student_doc = frappe.get_doc("SH Student", student_id)
	student_doc.student_image = saved.file_url
	student_doc.save(ignore_permissions=True)
	frappe.db.commit()  # nosemgrep

	return {"ok": True, "file_url": saved.file_url}


@frappe.whitelist(allow_guest=True)  # nosemgrep
def get_public_forms_context(student_id, token):
	"""Return the student's current enrolment + which forms are available / submitted."""
	_validate_pub_token(student_id, token)

	student_doc = frappe.get_doc("SH Student", student_id)
	programme_path = (student_doc.get("programme_path") or "").strip()

	enrolments = frappe.get_all(
		"SH Enrolment",
		filters={"student": student_id, "status": "Enrolled"},
		fields=[
			"name",
			"class",
			"course",
			"milestone",
			"cohort",
			"course_run",
			"academic_year",
			"programme_path",
		],
		order_by="enrolment_date desc",
		limit=1,
	)
	enrolment = enrolments[0] if enrolments else None

	forms = []
	student_status = (student_doc.get("status") or "").strip()

	for spec in PUBLIC_FORM_LIST:
		doctype = spec["doctype"]
		if spec.get("path_a_only") and programme_path and programme_path != "Path A":
			continue
		if spec.get("alumni_only") and student_status != "Alumni":
			continue
		if not frappe.db.exists("DocType", doctype):
			continue

		multi_allowed = doctype not in ONCE_PER_ENROLMENT_DOCTYPES
		submitted = False

		if enrolment and not multi_allowed:
			student_field = _feedback_student_field(doctype)
			if student_field:
				submitted = bool(
					frappe.db.exists(
						doctype,
						{student_field: student_id, "enrolment_ticket": enrolment.get("name", "")},
					)
				)

		forms.append(
			{
				"doctype": doctype,
				"label": spec["label"],
				"section": spec["section"],
				"route": PUBLIC_FORM_ROUTES.get(doctype, ""),
				"multi_allowed": multi_allowed,
				"submitted": submitted,
				"can_submit": multi_allowed or not submitted,
			}
		)

	return {
		"student": {
			"name": student_doc.name,
			"student_name": student_doc.get("student_name") or "",
			"programme_path": programme_path,
			"status": student_doc.get("status") or "",
			"intake_cohort": str(student_doc.get("intake_cohort") or ""),
		},
		"enrolment": dict(enrolment) if enrolment else None,
		"forms": forms,
	}


@frappe.whitelist(allow_guest=True)  # nosemgrep
def submit_public_form(student_id, token, doctype, values):
	"""Create a feedback doc via the public portal. Expires the token on success."""
	_validate_pub_token(student_id, token)

	allowed = {row["doctype"] for row in FEEDBACK_DOCTYPES}
	if doctype not in allowed:
		frappe.throw(_("Form is not exposed in portal."))

	values = _json_arg(values, {})
	if not isinstance(values, dict):
		frappe.throw(_("Invalid payload."))

	# Alumni-only server-side guard
	if doctype == "SH Graduate Feedback":
		student_status = frappe.db.get_value("SH Student", student_id, "status") or ""
		if student_status != "Alumni":
			frappe.throw(_("Graduate Feedback is only available for alumni."))

	student_field = _feedback_student_field(doctype)
	if not student_field:
		frappe.throw(_("Cannot determine student field for this form."))

	values[student_field] = student_id

	# Auto-set the schedule/class field from the student's current active enrolment
	schedule_field = _feedback_schedule_field(doctype)
	if schedule_field and not values.get(schedule_field):
		active_enrol = frappe.db.get_value(
			"SH Enrolment",
			{"student": student_id, "status": "Active"},
			"class",
			order_by="creation desc",
		)
		if active_enrol:
			values[schedule_field] = active_enrol

	enrolment_ticket = (values.get("enrolment_ticket") or "").strip()

	if doctype in ONCE_PER_ENROLMENT_DOCTYPES and enrolment_ticket:
		if frappe.db.exists(doctype, {student_field: student_id, "enrolment_ticket": enrolment_ticket}):
			frappe.throw(_("You have already submitted this form for this enrolment."))

	doc = frappe.new_doc(doctype)
	meta = frappe.get_meta(doctype)
	for field in meta.fields:
		fn = field.fieldname
		if fn in {"name", "owner", "creation", "modified", "modified_by"} or fn not in values:
			continue
		value = values[fn]
		if field.fieldtype == "Table" and isinstance(value, list):
			doc.set(fn, [])
			for row in value:
				if isinstance(row, dict):
					doc.append(fn, row)
		else:
			doc.set(fn, value)

	doc.insert(ignore_permissions=True)
	frappe.db.commit()  # nosemgrep

	_tok_del(token)

	return {"name": doc.name, "doctype": doctype}


@frappe.whitelist(allow_guest=True)  # nosemgrep
def get_public_form_meta(doctype):
	"""Guest-accessible form schema for feedback forms."""
	allowed = {row["doctype"] for row in FEEDBACK_DOCTYPES}
	if doctype not in allowed:
		frappe.throw(_("Form is not exposed in portal."))
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType does not exist: {0}").format(doctype))

	meta = frappe.get_meta(doctype)
	fields = []
	child_tables = {}

	for field in meta.fields:
		if field.fieldtype in {"Column Break", "Tab Break", "Fold", "HTML", "Button"}:
			continue  # skip these only
		fields.append(_clean_field(field))  # include Section Break

		if field.fieldtype == "Table" and field.options:
			child_meta = frappe.get_meta(field.options)
			child_fields = []
			for cf in child_meta.fields:
				if cf.fieldtype in {"Section Break", "Column Break", "Tab Break", "Fold", "HTML", "Button"}:
					continue
				if cf.fieldname in {"idx", "parent", "parentfield", "parenttype"}:
					continue
				child_fields.append(_clean_field(cf))
			child_tables[field.fieldname] = {"doctype": field.options, "fields": child_fields}

	return {"doctype": doctype, "fields": fields, "child_tables": child_tables}


@frappe.whitelist(allow_guest=True)  # nosemgrep
def get_public_link_options(doctype, search_text=None, limit=500):
	"""Guest-accessible link options — allowlisted doctypes only."""
	if doctype not in PUBLIC_LINK_ALLOWED:
		frappe.throw(_("DocType not accessible."))
	limit = min(max(int(limit or 200), 1), 500)
	filters = {}
	if search_text:
		filters["name"] = ["like", f"%{search_text}%"]
	rows = frappe.get_all(doctype, filters=filters, fields=["name"], limit=limit, order_by="name asc")
	return [row.name for row in rows]


@frappe.whitelist()  # nosemgrep
def get_student_cards(filters=None, page=1, page_size=24):
	"""Admin-only paginated student card data."""
	import datetime

	if not _has_admin_access():
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	filters = _json_arg(filters, {}) or {}
	page = max(int(page or 1), 1)
	page_size = min(max(int(page_size or 24), 6), 100)
	offset = (page - 1) * page_size

	student_filters = {}
	if filters.get("status"):
		student_filters["status"] = filters["status"]
	if filters.get("programme_path"):
		student_filters["programme_path"] = filters["programme_path"]
	if filters.get("intake_cohort"):
		student_filters["intake_cohort"] = filters["intake_cohort"]

	card_fields = _existing_fields(
		"SH Student",
		[
			"name",
			"student_name",
			"student_image",
			"date_of_birth",
			"status",
			"programme_path",
			"intake_cohort",
			"intake_year",
			"current_schedule",
			"current_course",
			"mobile",
			"gender",
		],
	)

	search = (filters.get("search") or "").strip().lower()

	if search:
		all_students = frappe.get_all(
			"SH Student", filters=student_filters, fields=card_fields, limit=0, order_by="student_name asc"
		)
		search_in = _existing_fields("SH Student", ["name", "student_name"])
		all_students = [s for s in all_students if any(search in (s.get(f) or "").lower() for f in search_in)]
		total = len(all_students)
		students = all_students[offset : offset + page_size]
	else:
		students = frappe.get_all(
			"SH Student",
			filters=student_filters,
			fields=card_fields,
			order_by="student_name asc",
			limit_start=offset,
			limit=page_size,
		)
		total = frappe.db.count("SH Student", student_filters)

	for s in students:
		dob = s.get("date_of_birth")
		if dob:
			if isinstance(dob, datetime.date | datetime.datetime):
				s["date_of_birth_display"] = dob.strftime("%d %b %Y")
				s["date_of_birth"] = dob.strftime("%Y-%m-%d")
			else:
				try:
					dt = datetime.datetime.strptime(str(dob), "%Y-%m-%d")
					s["date_of_birth_display"] = dt.strftime("%d %b %Y")
					s["date_of_birth"] = str(dob)
				except Exception:
					s["date_of_birth_display"] = str(dob)
		else:
			s["date_of_birth_display"] = ""

	return {
		"items": students,
		"page": page,
		"page_size": page_size,
		"total": total,
		"total_pages": max((total + page_size - 1) // page_size, 1),
	}


@frappe.whitelist()  # nosemgrep
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
		"application_portal_enabled",
		"application_open_from",
		"application_open_until",
		"application_default_cohort",
		"application_default_year",
		"application_closed_message",
	}

	doc = frappe.get_single("SkillsHub Portal Settings")
	for key, value in values.items():
		if key in allowed:
			doc.set(key, value)
	doc.save(ignore_permissions=True)
	frappe.db.commit()  # nosemgrep
	return get_portal_settings()


# ── Public Application Form ──────────────────────────────────────────────────


_APPLICATION_ALLOWED_FIELDS = {
	"full_name",
	"date_of_birth",
	"gender",
	"nationality",
	"nrc_number",
	"marital_status",
	"mobile",
	"personal_email",
	"emergency_contact",
	"residential_area",
	"address_line_1",
	"city",
	"guardian_name",
	"guardian_relationship",
	"guardian_mobile",
	"guardian_occupation",
	"household_income",
	"household_receives_financial_aid",
	"housing_status",
	"number_of_siblings",
	"is_parent",
	"number_of_children",
	"highest_level_of_schooling",
	"last_school_attended",
	"year_left_school",
	"reason_for_leaving_school",
	"can_read_and_write",
	"has_vocational_training_history",
	"vocational_training_details",
	"special_talents",
	"community_participation",
	"has_volunteering_history",
	"details_of_volunteering",
	"parents_marital_status",
	"currently_employed",
	"employment_type",
	"students_occupation",
	"preferred_course",
	"second_preference_course",
	"why_join_skillshub",
	"career_goals",
	"how_skill_benefits_community",
	"how_skill_improves_livelihood",
	"available_to_start",
	"fully_committed",
	"participation_challenges",
	"has_health_conditions",
	"health_conditions_details",
	"declaration_consent",
	"media_consent",
	"contact_consent",
	"declaration_name",
}

_APPLICATION_REQUIRED_FIELDS = [
	"full_name",
	"date_of_birth",
	"gender",
	"mobile",
	"residential_area",
	"guardian_name",
	"guardian_relationship",
	"household_income",
	"highest_level_of_schooling",
	"can_read_and_write",
	"preferred_course",
	"why_join_skillshub",
	"career_goals",
	"declaration_name",
]


@frappe.whitelist(allow_guest=True)  # nosemgrep
def submit_application(payload):
	"""Create an SH Applicant record from the public application form."""
	from frappe.utils import getdate, today

	data = _json_arg(payload, {})
	if not isinstance(data, dict):
		frappe.throw(_("Invalid application data."))

	# Check application portal status
	settings = get_portal_settings()
	if not settings.get("application_portal_enabled"):
		frappe.throw(_(settings.get("application_closed_message") or "Applications are currently closed."))

	today_date = getdate(today())
	open_from = settings.get("application_open_from")
	open_until = settings.get("application_open_until")
	if open_from and getdate(open_from) > today_date:
		frappe.throw(_(settings.get("application_closed_message") or "Applications are not yet open."))
	if open_until and getdate(open_until) < today_date:
		frappe.throw(_(settings.get("application_closed_message") or "The application period has closed."))

	clean = {k: v for k, v in data.items() if k in _APPLICATION_ALLOWED_FIELDS}

	for fn in _APPLICATION_REQUIRED_FIELDS:
		if not clean.get(fn):
			frappe.throw(_(fn.replace("_", " ").title() + " is required."))

	if not clean.get("declaration_consent"):
		frappe.throw(_("You must accept the declaration to submit your application."))

	clean["status"] = "Submitted"
	clean["application_date"] = today()
	clean["application_source"] = "Online Portal"
	clean["naming_series"] = "SA.YY.####"

	# Auto-fill cohort and year from portal settings (always authoritative)
	if settings.get("application_default_cohort"):
		clean["intake_cohort"] = settings["application_default_cohort"]
	if settings.get("application_default_year"):
		clean["intake_year"] = settings["application_default_year"]

	doc = frappe.get_doc({"doctype": "SH Applicant", **clean})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()  # nosemgrep

	return {"ok": True, "name": doc.name}
