app_name = "skillshub_core"
app_title = "Skillshub Core"
app_publisher = "PI Dev"
app_description = "SkillsHub Zambia App"
app_email = "techsupport@pestalozzi.international"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/skillshub_core/css/skillshub_core.css"
# app_include_js = "/assets/skillshub_core/js/skillshub_core.js"

# include js, css files in header of web template
# web_include_css = "/assets/skillshub_core/css/skillshub_core.css"
# web_include_js = "/assets/skillshub_core/js/skillshub_core.js"

# Scheduled Tasks
# ---------------

scheduler_events = {
    "daily": [
        # Flag students with 3+ consecutive absences
        "skillshub_core.skillshub_core.tasks.daily_attendance_alerts",
        # Flag alumni with no employment history data
        "skillshub_core.skillshub_core.tasks.check_post_skillshub_followups",
    ],
    "weekly": [
        # Per-schedule attendance summary digest
        "skillshub_core.skillshub_core.tasks.weekly_attendance_summary",
    ],
}

# Document Events
# ---------------
# Recompute enrolment attendance stats whenever a student attendance record changes.

doc_events = {
    "SH Student Attendance": {
        "after_insert": "skillshub_core.skillshub_core.api._recompute_enrolment_on_attendance",
        "on_update": "skillshub_core.skillshub_core.api._recompute_enrolment_on_attendance",
        "on_trash": "skillshub_core.skillshub_core.api._recompute_enrolment_on_attendance",
    }
}

# Portal API — Whitelisted Methods
# ---------------------------------
# All methods below are decorated with @frappe.whitelist() in their modules.
# They are accessible at:
#
#   GET  /api/method/skillshub_core.skillshub_core.api.get_student_summary?student={id}
#   POST /api/method/skillshub_core.skillshub_core.api.mark_attendance
#   POST /api/method/skillshub_core.skillshub_core.api.enrol_cohort
#   POST /api/method/skillshub_core.zm_skillshub.doctype
#              .sh_student_enrolment.sh_student_enrolment.recompute_enrolment_stats
#
# No additional hooks.py entries are required for @frappe.whitelist() methods.

# Home Pages
# ----------
# application home page (will override Website Settings)
# home_page = "login"

# Generators
# ----------
# website_generators = ["Web Page"]

# Installation
# ------------
# before_install = "skillshub_core.install.before_install"
# after_install = "skillshub_core.install.after_install"

# Testing
# -------
# before_tests = "skillshub_core.install.before_tests"

# User Data Protection
# --------------------
# user_data_fields = []

# Translation
# ------------
# ignore_translatable_strings_from = []
