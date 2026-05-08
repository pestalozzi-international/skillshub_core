import frappe


ARCHITECTURE_GUIDE_HTML = """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-left: 5px solid #2e3192; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
    <h2 style="margin-top: 0; color: #2e3192;">🎓 The SkillsHub System Guide</h2>
    <p style="margin-bottom: 0; font-size: 16px;">
      SkillsHub now separates <strong>student grouping (Cohort)</strong> from <strong>teaching runs (Class/Course Run)</strong>.
      This guide reflects the live data model used across Desk, portal, enrolments, attendance, and feedback.
    </p>
  </div>

  <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">1. Student Identity (Who)</h3>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fff;">
      <h4 style="margin-top: 0; color: #d93829;">🧑‍🎓 SH Student</h4>
      <p style="font-size: 14px;"><strong>What it is:</strong> The person record (one per student).</p>
      <p style="font-size: 14px;"><strong>Key fields:</strong> Intake Year, Intake Cohort, Programme Path, contact/background details.</p>
    </div>
    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fff;">
      <h4 style="margin-top: 0; color: #d93829;">📅 Intake Year</h4>
      <p style="font-size: 14px;"><strong>What it is:</strong> Year the student joined SkillsHub.</p>
      <p style="font-size: 14px;"><strong>Use:</strong> Long-term cohort and completion trend analysis.</p>
    </div>
    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fff;">
      <h4 style="margin-top: 0; color: #d93829;">👥 Intake Cohort</h4>
      <p style="font-size: 14px;"><strong>What it is:</strong> The student grouping (e.g. Cohort 1, Cohort 2).</p>
      <p style="font-size: 14px; color: #666;"><em>Important:</em> Cohort is a student group, not a class run.</p>
    </div>
  </div>

  <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">2. Curriculum Model (What)</h3>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fff;">
      <h4 style="margin-top: 0; color: #008080;">📚 SkillsHub Programme</h4>
      <p style="font-size: 14px;"><strong>What it is:</strong> Milestone layer (Mindset Camp, Soft Skills, Vocational Training, etc).</p>
    </div>
    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fff;">
      <h4 style="margin-top: 0; color: #008080;">📖 SkillsHub Course</h4>
      <p style="font-size: 14px;"><strong>What it is:</strong> Subject/course under a programme.</p>
    </div>
    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fff;">
      <h4 style="margin-top: 0; color: #008080;">🔁 Course Run + Class</h4>
      <p style="font-size: 14px;"><strong>What it is:</strong> Delivery instance (e.g. R2A) where sessions and attendance happen.</p>
    </div>
  </div>

  <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">3. Bridge Record (Student ↔ Class)</h3>
  <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
    <h4 style="margin-top: 0; color: #0056b3;">🎟️ SH Enrolment</h4>
    <p style="font-size: 14px;"><strong>What it is:</strong> The single source of truth linking one student to one class.</p>
    <p style="font-size: 14px;"><strong>Naming:</strong> <code>STUDENT-CLASS</code> (e.g. <code>SH260685-MSC100-R2A</code>).</p>
    <p style="font-size: 14px;"><strong>Why it matters:</strong> Attendance stats and feedback completion are tracked against enrolment.</p>
  </div>

  <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">4. Operational Rulebook</h3>
  <ul style="font-size: 14px; margin: 0; padding-left: 18px;">
    <li><strong>Cohort</strong> = student grouping only.</li>
    <li><strong>Class</strong> = teaching schedule instance (formerly called programme schedule in legacy labels).</li>
    <li><strong>Attendance</strong> is captured on SH Attendance by student + class + date.</li>
    <li><strong>Feedback forms</strong> should carry student + class + enrolment ticket context.</li>
    <li><strong>Portal and Desk</strong> should both resolve through SH Student + SH Enrolment + SH Class model.</li>
  </ul>
</div>
""".strip()


DASHBOARD_LAYOUTS = {
    "SkillsHub Programme Overview": {
        "charts": [
            "SH Students by Status",
            "SH Students by Gender",
            "SH Enrollment by Course",
            "SH Students by Cohort",
            "SH Enrolments by Cohort",
            "SH Enrolments by Course",
            "SH Avg Attendance by Course",
            "SH Avg Attendance by Cohort",
            "SH Student Enrollment Trend",
            "SH Graduation Timeline",
            "SH Education Level Distribution",
            "SH Housing Status Distribution",
            "SH Attachment Institution Distribution",
            "SH Attachment Completion Status",
            "SH Attachments by Course",
        ],
        "cards": [
            "SH - Total Students",
            "SH - Active Students",
            "SH - Alumni",
            "SH - Avg Attendance %",
            "SH - At-Risk Students",
            "SH - Graduated",
            "SH - Attachments Completed",
            "SH - Students Placed",
            "SH - Alumni Employed",
            "SH - Portal Activated",
        ],
    },
    "SkillsHub Cohort Analysis": {
        "charts": [
            "SH Students by Cohort",
            "SH Enrolments by Cohort",
            "SH Enrolments by Course",
            "SH Gender by Cohort",
            "SH Graduates by Cohort",
            "SH Avg Attendance by Cohort",
            "SH Mindset Camp Participation",
            "SH Literacy Baseline",
            "SH Vocational History",
            "SH Alumni Employed",
        ],
        "cards": [
            "SH - Active Students",
            "SH - Avg Attendance %",
            "SH - Graduated",
            "SH - At-Risk Students",
            "SH - Total Students",
            "SH - Alumni",
        ],
    },
    "SkillsHub Employment & Outcomes": {
        "charts": [
            "SH Attachment Institution Distribution",
            "SH Attachments by Course",
            "SH Attachment Completion Status",
            "SH Attachment Start Trend",
            "SH Alumni Employed",
            "SH Graduation Timeline",
            "SH Enrollment by Course",
            "SH Enrolments by Course",
        ],
        "cards": [
            "SH - Total Employers",
            "SH - Students Placed",
            "SH - Attachments Completed",
            "SH - Alumni Employed",
            "SH - Graduated",
            "SH - Active Students",
        ],
    },
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


def _sync_architecture_guide():
    if not frappe.db.exists("Custom HTML Block", "SkillsHub Architecture Guide"):
        return
    doc = frappe.get_doc("Custom HTML Block", "SkillsHub Architecture Guide")
    if (doc.html or "").strip() == ARCHITECTURE_GUIDE_HTML:
        return
    doc.html = ARCHITECTURE_GUIDE_HTML
    doc.save(ignore_permissions=True)


def _cleanup_workspace(workspace_name):
    if not frappe.db.exists("Workspace", workspace_name):
        return

    doc = frappe.get_doc("Workspace", workspace_name)
    changed = False

    cleaned_shortcuts = []
    for row in doc.shortcuts or []:
        row_type = row.type
        link_to = row.link_to
        if row_type == "DocType" and link_to and not frappe.db.exists("DocType", link_to):
            changed = True
            continue
        if row_type == "Dashboard" and link_to and not frappe.db.exists("Dashboard", link_to):
            changed = True
            continue
        if row_type == "Report" and link_to and not frappe.db.exists("Report", link_to):
            changed = True
            continue
        if row.label == "Student Enrolment" and row.link_to == "SH Enrolment":
            row.label = "SH Enrolment"
            changed = True
        cleaned_shortcuts.append(row)
    if len(cleaned_shortcuts) != len(doc.shortcuts or []):
        changed = True
    doc.shortcuts = cleaned_shortcuts

    cleaned_links = []
    for row in doc.links or []:
        if row.type == "Card Break":
            cleaned_links.append(row)
            continue
        link_type = row.link_type
        link_to = row.link_to
        if link_type == "DocType" and link_to and not frappe.db.exists("DocType", link_to):
            changed = True
            continue
        if link_type == "Report" and link_to and not frappe.db.exists("Report", link_to):
            changed = True
            continue
        cleaned_links.append(row)
    if len(cleaned_links) != len(doc.links or []):
        changed = True
    doc.links = cleaned_links

    if workspace_name == "Zambia: SkillsHub":
        if not any((s.label == "Portal Settings" and s.type == "DocType") for s in (doc.shortcuts or [])):
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


def _sync_dashboard(dashboard_name, config):
    if not frappe.db.exists("Dashboard", dashboard_name):
        return
    doc = frappe.get_doc("Dashboard", dashboard_name)

    chart_rows = []
    for chart_name in config.get("charts", []):
        if frappe.db.exists("Dashboard Chart", chart_name):
            chart_rows.append({"chart": chart_name, "width": "Half"})

    card_rows = []
    for card_name in config.get("cards", []):
        if frappe.db.exists("Number Card", card_name):
            card_rows.append({"card": card_name})

    changed = False
    existing_charts = [row.chart for row in (doc.charts or []) if row.chart]
    existing_cards = [row.card for row in (doc.cards or []) if row.card]
    target_charts = [row["chart"] for row in chart_rows]
    target_cards = [row["card"] for row in card_rows]
    if existing_charts != target_charts:
        doc.set("charts", chart_rows)
        changed = True
    if existing_cards != target_cards:
        doc.set("cards", card_rows)
        changed = True

    if changed:
        doc.save(ignore_permissions=True)


def execute():
    _sync_architecture_guide()

    for workspace_name in WORKSPACE_NAMES:
        _cleanup_workspace(workspace_name)

    for dashboard_name, config in DASHBOARD_LAYOUTS.items():
        _sync_dashboard(dashboard_name, config)

    frappe.db.commit()
