import frappe


@frappe.whitelist(allow_guest=True)
def find_student_by_email(email):
    """
    Return student name for a given login email (safe server-side lookup).
    """
    if not email:
        return None
    found = frappe.get_all('SH Student', filters=[['portal_access_user_id', '=', email]], fields=['name'], limit=1)
    return found[0]['name'] if found else None


@frappe.whitelist()
def get_programme_overview():
    """
    Returns a nested structure for the Programme Overview page:
    intake_year -> programme_path -> milestone -> cohort -> schedule -> {
        enrolments, baselines, feedback counts per type
    }
    All counts are aggregated server-side for performance.
    """

    # --- 1. All enrolments with student context ---
    enrolments = frappe.db.sql("""
        SELECT
            e.name AS enrolment,
            e.student,
            e.programme_schedule,
            e.milestone,
            e.cohort,
            e.course,
            e.status,
            e.programme_path,
            s.intake_year,
            s.programme_path AS student_path,
            s.status AS student_status,
            CONCAT(IFNULL(s.first_name,''), ' ', IFNULL(s.last_name,'')) AS student_name
        FROM `tabSH Student Enrolment` e
        LEFT JOIN `tabSH Student` s ON s.name = e.student
        ORDER BY s.intake_year DESC, e.milestone, e.cohort, e.programme_schedule
    """, as_dict=True)

    # --- 2. Baseline counts per programme_schedule ---
    baselines = frappe.db.sql("""
        SELECT programme_schedule, COUNT(*) AS cnt
        FROM `tabSH Student Baseline Form`
        WHERE programme_schedule IS NOT NULL AND programme_schedule != ''
        GROUP BY programme_schedule
    """, as_dict=True)
    baseline_map = {r.programme_schedule: r.cnt for r in baselines}

    # --- 3. Feedback counts per enrolment_ticket ---
    feedback_tables = {
        'soft_skills':  'SH Soft Skills Feedback',
        'mindset_camp': 'SH Mindset Camp Feedback',
        'vocational':   'SkillsHub Vocational Training Feedback',
        'edulution':    'SkillsHub Edulution Feedback',
        'attachment':   'ZM SkillsHub Attachment Feedback',
    }
    feedback_maps = {}
    for key, doctype in feedback_tables.items():
        try:
            rows = frappe.db.sql(f"""
                SELECT enrolment_ticket, COUNT(*) AS cnt
                FROM `tab{doctype}`
                WHERE enrolment_ticket IS NOT NULL AND enrolment_ticket != ''
                GROUP BY enrolment_ticket
            """, as_dict=True)
            feedback_maps[key] = {r.enrolment_ticket: r.cnt for r in rows}
        except Exception:
            feedback_maps[key] = {}

    # --- 4. Build nested structure ---
    tree = {}
    for e in enrolments:
        year  = e.intake_year or 'Unknown'
        path  = e.student_path or e.programme_path or 'Unknown'
        mile  = e.milestone or 'Unknown'
        cohort = e.cohort or 'Unknown'
        sched = e.programme_schedule or 'Unknown'

        tree.setdefault(year, {})
        tree[year].setdefault(path, {})
        tree[year][path].setdefault(mile, {})
        tree[year][path][mile].setdefault(cohort, {})
        tree[year][path][mile][cohort].setdefault(sched, {
            'schedule': sched,
            'milestone': mile,
            'cohort': cohort,
            'enrolments': [],
            'baseline_count': baseline_map.get(sched, 0),
            'feedback': {k: 0 for k in feedback_tables},
        })

        # Accumulate feedback for this enrolment
        node = tree[year][path][mile][cohort][sched]
        for key in feedback_tables:
            node['feedback'][key] += feedback_maps[key].get(e.enrolment, 0)

        node['enrolments'].append({
            'id':     e.enrolment,
            'student': e.student,
            'name':   e.student_name.strip(),
            'status': e.status,
        })

    # --- 5. Compute summary stats ---
    all_students = frappe.db.sql("""
        SELECT status, intake_year, COUNT(*) as cnt
        FROM `tabSH Student`
        GROUP BY status, intake_year
    """, as_dict=True)

    schedules = frappe.db.sql("""
        SELECT name, skillshub_programme, skillshub_course, cohort, academic_year, complete
        FROM `tabSH Programme Schedule`
    """, as_dict=True)
    schedule_meta = {s.name: s for s in schedules}

    return {
        'tree': tree,
        'schedule_meta': schedule_meta,
        'summary': all_students,
        'feedback_types': list(feedback_tables.keys()),
        'feedback_labels': {
            'soft_skills':  'Soft Skills Feedback',
            'mindset_camp': 'Mindset Camp Feedback',
            'vocational':   'VT Feedback',
            'edulution':    'Edulution Feedback',
            'attachment':   'Attachment Feedback',
        }
    }
