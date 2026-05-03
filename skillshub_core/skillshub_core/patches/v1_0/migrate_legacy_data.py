# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

"""
Phase 1 legacy data migration — runs post_model_sync.

Performs in order:
  1. Migrate SkillsHub Programme-Student Link (programme_history child rows)
     to standalone SH Student Enrolment documents.
  2. Migrate legacy standalone employment fields (occupation_post_completion,
     employer) to SH Employment History child rows.
  3. Copy feedback_phase values to the new milestone field on all 6 feedback
     forms and the baseline form (direct copy — phase name == programme name).
  4. Populate the enrolled_students roster child table on every SH Programme
     Schedule from current active SH Student records AND from SH Student
     Enrolment records.
  5. Create SH Student Enrolment records for every active student that has a
     current_schedule set, if one does not already exist.
  6. Delete all SkillsHub Phases records and the DocType itself.

All steps are idempotent and safe to re-run.
All SH Student Enrolment records are created via frappe.new_doc().insert()
to avoid TypeError from raw SQL parameter tuple formatting.
"""

import frappe
import frappe.utils


def execute():
    _migrate_programme_history()
    _migrate_employment_fields()
    _migrate_feedback_phases()
    _create_enrolments_for_active_students()
    _populate_schedule_rosters()
    _remove_skillshub_phases()
    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 1: programme_history → SH Student Enrolment
# ---------------------------------------------------------------------------

def _migrate_programme_history():
    """
    Read every SkillsHub Programme-Student Link child row and create a
    matching SH Student Enrolment via frappe.new_doc().insert().
    Skips rows where the target enrolment already exists (idempotent).
    """
    if not frappe.db.table_exists("tabSkillsHub Programme-Student Link"):
        return

    rows = frappe.db.sql(
        """
        SELECT parent, programme, status, creation
        FROM `tabSkillsHub Programme-Student Link`
        WHERE parenttype = 'SH Student'
        ORDER BY parent, creation
        """,
        as_dict=True,
    )

    status_map = {
        "Enrolled":    "Enrolled",
        "Completed":   "Completed",
        "Dropped":     "Dropped",
        "Transferred": "Transferred",
    }

    for row in rows:
        student   = row.get("parent")
        programme = row.get("programme")
        if not (student and programme):
            continue

        # Find the most recent Programme Schedule for this programme
        schedule = frappe.db.get_value(
            "SH Programme Schedule",
            {"skillshub_programme": programme},
            "name",
            order_by="start_date desc",
        )
        if not schedule:
            frappe.log_error(
                f"No Programme Schedule found for programme '{programme}' — "
                f"skipping student '{student}'",
                "migrate_legacy_data:programme_history",
            )
            continue

        if frappe.db.exists(
            "SH Student Enrolment",
            {"student": student, "programme_schedule": schedule},
        ):
            continue

        enrolment_date = (
            row.get("creation").date()
            if row.get("creation") and hasattr(row.get("creation"), "date")
            else frappe.utils.today()
        )

        doc = frappe.new_doc("SH Student Enrolment")
        doc.student           = student
        doc.programme_schedule = schedule
        doc.status            = status_map.get(row.get("status") or "", "Completed")
        doc.enrolment_date    = enrolment_date
        doc.flags.ignore_permissions = True
        doc.flags.ignore_mandatory   = True
        doc.flags.ignore_validate    = True
        try:
            doc.insert()
        except Exception as exc:
            frappe.log_error(
                f"Could not insert SH Student Enrolment for student '{student}' "
                f"schedule '{schedule}': {exc}",
                "migrate_legacy_data:programme_history:insert",
            )

    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 2: occupation_post_completion + employer → SH Employment History
# ---------------------------------------------------------------------------

def _migrate_employment_fields():
    """
    Copy legacy occupation_post_completion / employer columns into SH
    Employment History child rows.  Skips students that already have rows.
    """
    columns = frappe.db.sql(
        "SHOW COLUMNS FROM `tabSH Student` LIKE 'occupation_post_completion'",
        as_list=True,
    )
    if not columns:
        return

    rows = frappe.db.sql(
        """
        SELECT name, occupation_post_completion, employer
        FROM `tabSH Student`
        WHERE (occupation_post_completion IS NOT NULL AND occupation_post_completion != '')
           OR (employer IS NOT NULL AND employer != '')
        """,
        as_dict=True,
    )

    for row in rows:
        student      = row["name"]
        occupation   = (row.get("occupation_post_completion") or "").strip()
        employer_val = (row.get("employer") or "").strip()

        if not (occupation or employer_val):
            continue

        if frappe.db.exists(
            "SH Employment History",
            {"parent": student, "parenttype": "SH Student"},
        ):
            continue

        frappe.db.sql(
            """
            INSERT INTO `tabSH Employment History`
                (name, parent, parenttype, parentfield, idx,
                 occupation, is_current, creation, modified,
                 modified_by, owner, docstatus)
            VALUES (%s, %s, %s, %s, %s,
                    %s, %s, NOW(), NOW(), %s, %s, %s)
            """,
            (
                frappe.generate_hash(length=10),
                student,
                "SH Student",
                "employment_history",
                1,
                occupation or employer_val,
                0,
                "Administrator",
                "Administrator",
                0,
            ),
        )

    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 3: feedback_phase → milestone on all 7 forms
# ---------------------------------------------------------------------------

def _migrate_feedback_phases():
    """
    Copy feedback_phase values to the milestone field where milestone is
    empty and the phase name matches a SkillsHub Programme record.
    Safe to run multiple times.
    """
    tables = [
        "tabSH Mindset Camp Feedback",
        "tabSH Soft Skills Feedback",
        "tabSkillsHub Edulution Feedback",
        "tabSkillsHub Vocational Training Feedback",
        "tabZM SkillsHub Attachment Feedback",
        "tabZM SkillsHub Parent Feedback",
        "tabSH Student Baseline Form",
    ]

    for table in tables:
        if not frappe.db.table_exists(table):
            continue

        has_phase = frappe.db.sql(
            f"SHOW COLUMNS FROM `{table}` LIKE 'feedback_phase'", as_list=True
        )
        has_milestone = frappe.db.sql(
            f"SHOW COLUMNS FROM `{table}` LIKE 'milestone'", as_list=True
        )
        if not has_phase or not has_milestone:
            continue

        try:
            frappe.db.sql(
                f"""
                UPDATE `{table}` t
                INNER JOIN `tabSkillsHub Programme` p ON p.name = t.feedback_phase
                SET t.milestone = t.feedback_phase
                WHERE t.feedback_phase IS NOT NULL
                  AND t.feedback_phase != ''
                  AND (t.milestone IS NULL OR t.milestone = '')
                """
            )
        except Exception as exc:
            frappe.log_error(
                f"feedback_phase migration failed for {table}: {exc}",
                "migrate_legacy_data:feedback_phases",
            )

    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 4: Create SH Student Enrolment for every active student
# ---------------------------------------------------------------------------

def _create_enrolments_for_active_students():
    """
    For every SH Student with status='Student' and a current_schedule,
    create an SH Student Enrolment record if one does not already exist.
    Uses frappe.new_doc().insert() to avoid TypeError in SQL formatting.
    """
    active_students = frappe.db.sql(
        """
        SELECT name AS student, student_name, current_schedule
        FROM `tabSH Student`
        WHERE status = 'Student'
          AND current_schedule IS NOT NULL
          AND current_schedule != ''
        """,
        as_dict=True,
    )

    for s in active_students:
        student  = s["student"]
        schedule = s["current_schedule"]

        if not schedule:
            continue

        if frappe.db.exists(
            "SH Student Enrolment",
            {"student": student, "programme_schedule": schedule},
        ):
            continue

        doc = frappe.new_doc("SH Student Enrolment")
        doc.student            = student
        doc.programme_schedule = schedule
        doc.status             = "Enrolled"
        doc.enrolment_date     = frappe.utils.today()
        doc.flags.ignore_permissions = True
        doc.flags.ignore_mandatory   = True
        doc.flags.ignore_validate    = True
        try:
            doc.insert()
        except Exception as exc:
            frappe.log_error(
                f"Could not create enrolment for student '{student}' "
                f"schedule '{schedule}': {exc}",
                "migrate_legacy_data:enrolments:insert",
            )

    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 5: Populate enrolled_students roster on SH Programme Schedule
# ---------------------------------------------------------------------------

def _populate_schedule_rosters():
    """
    Sync every student in SH Student Enrolment into the enrolled_students
    child table on their SH Programme Schedule.
    Uses raw-SQL INSERT for performance; idempotent via duplicate check.
    """
    if not frappe.db.table_exists("tabSH Student Enrolment"):
        return
    if not frappe.db.table_exists("tabSH Schedule Student"):
        return

    enrolment_rows = frappe.db.sql(
        """
        SELECT
            e.programme_schedule AS schedule_name,
            e.student,
            s.student_name,
            e.enrolment_date
        FROM `tabSH Student Enrolment` e
        INNER JOIN `tabSH Student` s ON s.name = e.student
        WHERE e.programme_schedule IS NOT NULL
          AND e.programme_schedule != ''
        ORDER BY e.programme_schedule, e.enrolment_date
        """,
        as_dict=True,
    )

    # Group by schedule
    by_schedule = {}
    for row in enrolment_rows:
        by_schedule.setdefault(row["schedule_name"], []).append(row)

    for schedule_name, students in by_schedule.items():
        if not frappe.db.exists("SH Programme Schedule", schedule_name):
            continue

        # Fetch already-present student IDs for this schedule
        existing = frappe.db.sql(
            """
            SELECT student FROM `tabSH Schedule Student`
            WHERE parent = %s AND parenttype = 'SH Programme Schedule'
            """,
            (schedule_name,),
            as_list=True,
        )
        existing_ids = {r[0] for r in existing}

        max_idx = frappe.db.sql(
            """
            SELECT COALESCE(MAX(idx), 0)
            FROM `tabSH Schedule Student`
            WHERE parent = %s AND parenttype = 'SH Programme Schedule'
            """,
            (schedule_name,),
            as_list=True,
        )
        next_idx = int((max_idx[0][0] if max_idx else 0) or 0) + 1

        for s in students:
            student_id = s.get("student")
            if not student_id or student_id in existing_ids:
                continue

            enrolment_date = s.get("enrolment_date") or frappe.utils.today()

            frappe.db.sql(
                """
                INSERT INTO `tabSH Schedule Student`
                    (name, parent, parenttype, parentfield, idx,
                     student, student_name, enrolment_date, active,
                     creation, modified, modified_by, owner, docstatus)
                VALUES (%s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        NOW(), NOW(), %s, %s, %s)
                """,
                (
                    frappe.generate_hash(length=10),
                    schedule_name,
                    "SH Programme Schedule",
                    "enrolled_students",
                    next_idx,
                    student_id,
                    s.get("student_name") or "",
                    enrolment_date,
                    1,
                    "Administrator",
                    "Administrator",
                    0,
                ),
            )
            existing_ids.add(student_id)
            next_idx += 1

    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 6: Remove SkillsHub Phases DocType and all records
# ---------------------------------------------------------------------------

def _remove_skillshub_phases():
    """
    Delete all SkillsHub Phases data records, then delete the DocType itself.
    Handles the case where the table exists but the DocType meta is already gone.
    """
    if frappe.db.table_exists("tabSkillsHub Phases"):
        frappe.db.sql("DELETE FROM `tabSkillsHub Phases`")

    if frappe.db.exists("DocType", "SkillsHub Phases"):
        try:
            frappe.delete_doc(
                "DocType",
                "SkillsHub Phases",
                force=True,
                ignore_permissions=True,
            )
        except Exception as exc:
            frappe.log_error(
                f"Could not delete SkillsHub Phases DocType: {exc}",
                "migrate_legacy_data:phases_cleanup",
            )

    frappe.db.commit()
