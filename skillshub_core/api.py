import frappe


@frappe.whitelist(allow_guest=True)  # nosemgrep
def find_student_by_email(email):
	"""
	Return student name for a given login email (safe server-side lookup).
	"""
	if not email:
		return None
	found = frappe.get_all("SH Student", filters=[["user_login_email", "=", email]], fields=["name"], limit=1)
	if not found:
		found = frappe.get_all(
			"SH Student", filters=[["portal_user_account", "=", email]], fields=["name"], limit=1
		)
	return found[0]["name"] if found else None


@frappe.whitelist()
def get_programme_overview():
	"""
	Returns data for the Programme Overview page.

	Correct hierarchy:
	  Intake Year → Path → Programme → Course → Course Run → Schedule → Enrolments

	Key rules:
	- Path always comes from SH Student.programme_path (reliable)
	- Programme/Course/Course Run always come from SH Class (reliable)
	  NOT from the enrolment fields — those are often null (e.g. SSP enrolments)
	- When course == programme name, collapse to avoid redundant level (e.g. Mindset Camp / Mindset Camp)
	"""

	# ── 1. All enrolments — resolve everything from schedule, not enrolment ─
	enrolments = frappe.db.sql(
		"""
        SELECT
            e.name                  AS enrolment,
            e.student,
            e.class                 AS class_name,
            e.status,
            s.intake_year,
            s.programme_path,
            CONCAT(IFNULL(s.first_name,''), ' ', IFNULL(s.last_name,'')) AS student_name,
            sc.skillshub_programme  AS programme,
            sc.skillshub_course     AS course,
            sc.course_run           AS course_run,
            s.intake_cohort         AS student_cohort,
            sc.academic_year        AS sched_year,
            sc.complete             AS sched_complete
        FROM `tabSH Enrolment` e
        JOIN  `tabSH Student`            s  ON s.name  = e.student
        LEFT JOIN `tabSH Class` sc ON sc.name = e.class
        ORDER BY s.intake_year DESC, sc.skillshub_programme, sc.skillshub_course, sc.course_run, e.class
    """,
		as_dict=True,
	)

	# ── 2. Baseline counts keyed by programme_schedule ──────────────────────
	baselines = frappe.db.sql(
		"""
        SELECT programme_schedule, COUNT(*) AS cnt
        FROM `tabSH Baseline`
        WHERE programme_schedule IS NOT NULL AND programme_schedule != ''
        GROUP BY programme_schedule
    """,
		as_dict=True,
	)
	baseline_map = {r.programme_schedule: r.cnt for r in baselines}

	# ── 3. Feedback counts keyed by class (via student-JOIN) ────────────────
	def _fb_student_field(doctype):
		for fn in ("sh_student", "student"):
			try:
				if frappe.get_meta(doctype).get_field(fn):
					return fn
			except Exception:
				pass
		return None

	feedback_tables = {
		"soft_skills": "SH Soft Skills Feedback",
		"mindset_camp": "SH Mindset Camp Feedback",
		"vocational": "SH VT Feedback",
		"edulution": "SH Edulution Feedback",
		"attachment": "SH Attachment Feedback",
	}
	feedback_maps = {}
	for key, doctype in feedback_tables.items():
		student_field = _fb_student_field(doctype)
		if not student_field:
			feedback_maps[key] = {}
			continue
		try:
			rows = frappe.db.sql(  # nosemgrep
				f"""
                SELECT e.class AS class_name, COUNT(DISTINCT fb.name) AS cnt
                FROM `tab{doctype}` fb
                JOIN `tabSH Enrolment` e ON e.student = fb.`{student_field}`
                WHERE e.class IS NOT NULL AND e.class != ''
                GROUP BY e.class
                """,
				as_dict=True,
			)
			feedback_maps[key] = {r.class_name: r.cnt for r in rows}
		except Exception:
			feedback_maps[key] = {}

	# ── 4. Build nested tree ─────────────────────────────────────────────────
	tree = {}
	flat_rows = []

	for e in enrolments:
		year = e.intake_year or "Unknown"
		path = e.programme_path or "Unknown"
		programme = e.programme or "Unknown"
		course_run = e.course_run or "Unknown"
		sched = e.class_name or "Unknown"

		# Collapse course level when it is identical to the programme name
		# (e.g. Mindset Camp programme / Mindset Camp course → just show once)
		raw_course = e.course or programme
		course = raw_course if raw_course != programme else programme

		(
			tree.setdefault(year, {})
			.setdefault(path, {})
			.setdefault(programme, {})
			.setdefault(course, {})
			.setdefault(course_run, {})
			.setdefault(
				sched,
				{
					"schedule": sched,
					"programme": programme,
					"course": course,
					"course_run": course_run,
					"student_cohort": e.student_cohort or "",
					"year": e.sched_year or year,
					"complete": bool(e.sched_complete),
					"enrolments": [],
					"baseline_count": baseline_map.get(sched, 0),
					"feedback": {k: feedback_maps[k].get(sched, 0) for k in feedback_tables},
				},
			)
		)

		node = tree[year][path][programme][course][course_run][sched]

		node["enrolments"].append(
			{
				"id": e.enrolment,
				"student": e.student,
				"name": (e.student_name or "").strip(),
				"status": e.status,
			}
		)

		flat_rows.append(
			{
				"enrolment": e.enrolment,
				"student": e.student,
				"name": (e.student_name or "").strip(),
				"year": year,
				"path": path,
				"programme": programme,
				"course": course,
				"course_run": course_run,
				"cohort": course_run,
				"student_cohort": e.student_cohort or "",
				"schedule": sched,
				"status": e.status,
				"baselines": baseline_map.get(sched, 0),
				"fb_ss": feedback_maps["soft_skills"].get(sched, 0),
				"fb_msc": feedback_maps["mindset_camp"].get(sched, 0),
				"fb_vt": feedback_maps["vocational"].get(sched, 0),
				"fb_edu": feedback_maps["edulution"].get(sched, 0),
				"fb_att": feedback_maps["attachment"].get(sched, 0),
			}
		)

	# ── 5. Summary ───────────────────────────────────────────────────────────
	summary = frappe.db.sql(
		"""
        SELECT status, intake_year, COUNT(*) as cnt
        FROM `tabSH Student`
        GROUP BY status, intake_year
    """,
		as_dict=True,
	)

	return {
		"tree": tree,
		"flat": flat_rows,
		"summary": summary,
		"feedback_labels": {
			"soft_skills": "Soft Skills",
			"mindset_camp": "Mindset Camp",
			"vocational": "Vocational Training",
			"edulution": "Edulution",
			"attachment": "Attachment",
		},
	}
