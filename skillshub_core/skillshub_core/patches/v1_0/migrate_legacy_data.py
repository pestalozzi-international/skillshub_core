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
  4. Delete all SkillsHub Phases records and the DocType.

All steps are idempotent and safe to re-run.
"""

import frappe
import frappe.utils


def execute():
    _migrate_programme_history()
    _migrate_employment_fields()
    _migrate_feedback_phases()
    _remove_skillshub_phases()
    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 1: programme_history → SH Student Enrolment
# ---------------------------------------------------------------------------

def _migrate_programme_history():
    """
    Read every SkillsHub Programme-Student Link child row and create a
    matching SH Student Enrolment.  Skips rows where the target enrolment
    already exists (idempotent).
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
        "Enrolled": "Enrolled",
        "Completed": "Completed",
        "Dropped": "Dropped",
        "Transferred": "Transferred",
    }

    for row in rows:
        student = row.get("parent")
        programme = row.get("programme")
        if not (student and programme):
            continue

        # Find the best matching Programme Schedule (most recent, same programme)
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

        enrolment = frappe.new_doc("SH Student Enrolment")
        enrolment.student = student
        enrolment.programme_schedule = schedule
        enrolment.status = status_map.get(row.get("status") or "", "Completed")
        enrolment.enrolment_date = (
            row.get("creation").date()
            if hasattr(row.get("creation"), "date")
            else frappe.utils.today()
        )
        enrolment.flags.ignore_permissions = True
        enrolment.flags.ignore_mandatory = True
        enrolment.insert()

    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 2: occupation_post_completion + employer → SH Employment History
# ---------------------------------------------------------------------------

def _migrate_employment_fields():
    """
    Copy legacy occupation_post_completion / employer columns (still present
    in the DB despite being removed from the JSON) into SH Employment History
    child rows.  Skips students that already have at least one history row.
    """
    # These columns may have already been purged by a prior bench purge-tables
    columns = frappe.db.sql(
        "SHOW COLUMNS FROM `tabSH Student` LIKE 'occupation_post_completion'",
        as_list=True,
    )
    if not columns:
        return  # columns already gone — nothing to migrate

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
        student = row["name"]
        occupation = (row.get("occupation_post_completion") or "").strip()
        employer_name = (row.get("employer") or "").strip()

        if not (occupation or employer_name):
            continue

        # Skip if the student already has employment history rows
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
            VALUES (%s, %s, 'SH Student', 'employment_history', 1,
                    %s, 0, NOW(), NOW(), 'Administrator', 'Administrator', 0)
            """,
            (
                frappe.generate_hash(length=10),
                student,
                occupation or employer_name,
            ),
        )

    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 3: feedback_phase → milestone on all 7 forms
# ---------------------------------------------------------------------------

def _migrate_feedback_phases():
    """
    For every feedback/baseline record that has a feedback_phase value that
    matches a SkillsHub Programme, copy it to the milestone field.
    Safe to run multiple times (only updates rows where milestone is empty).
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

        # Check feedback_phase column still exists (may have been purged)
        cols = frappe.db.sql(
            f"SHOW COLUMNS FROM `{table}` LIKE 'feedback_phase'", as_list=True
        )
        if not cols:
            continue

        # milestone column must exist (added by the JSON schema update)
        milestone_cols = frappe.db.sql(
            f"SHOW COLUMNS FROM `{table}` LIKE 'milestone'", as_list=True
        )
        if not milestone_cols:
            continue

        try:
            frappe.db.sql(
                f"""
                UPDATE `{table}` t
                SET t.milestone = t.feedback_phase
                WHERE t.feedback_phase IS NOT NULL
                  AND t.feedback_phase != ''
                  AND (t.milestone IS NULL OR t.milestone = '')
                  AND EXISTS (
                      SELECT 1 FROM `tabSkillsHub Programme` p
                      WHERE p.name = t.feedback_phase
                  )
                """
            )
        except Exception as exc:
            frappe.log_error(
                f"feedback_phase migration failed for {table}: {exc}",
                "migrate_legacy_data:feedback_phases",
            )

    frappe.db.commit()


# ---------------------------------------------------------------------------
# Step 4: Remove SkillsHub Phases DocType and all records
# ---------------------------------------------------------------------------

def _remove_skillshub_phases():
    """
    Delete all SkillsHub Phases data records, then delete the DocType itself.
    After this patch the skillshub_phases directory in the repo can be
    removed in a follow-up cleanup commit.
    """
    if not frappe.db.table_exists("tabSkillsHub Phases"):
        return

    frappe.db.sql("DELETE FROM `tabSkillsHub Phases`")

    if frappe.db.exists("DocType", "SkillsHub Phases"):
        frappe.delete_doc(
            "DocType",
            "SkillsHub Phases",
            force=True,
            ignore_permissions=True,
        )

    frappe.db.commit()
