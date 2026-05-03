"""
SkillsHub — Orphan Feedback Recovery Script
=============================================
Run in bench console:
    bench --site <site> console
    exec(open('/path/to/fix_orphan_feedback.py').read())

Or paste the contents directly into the console.

Set DRY_RUN = False to commit changes.
"""

import frappe
from frappe.utils import now_datetime

# ── Configuration ────────────────────────────────────────────────────────────
DRY_RUN = True          # Set to False to actually commit changes
LOG_DETAILS = True      # Print per-record match details

# ── Milestone mapping: Feedback DocType → expected SkillsHub Programme name ──
# The "milestone" field on SH Student Enrolment is a Link to SkillsHub Programme,
# fetched from programme_schedule.skillshub_programme.
FEEDBACK_CONFIG = [
    {
        "doctype": "SH Soft Skills Feedback",
        "milestone": "Soft Skills",
        "student_field": None,          # No direct sh_student link; use owner
        "enrolment_field": "enrolment_ticket",
    },
    {
        "doctype": "SH Mindset Camp Feedback",
        "milestone": "Mindset Camp",
        "student_field": "sh_student",  # Direct Link to SH Student
        "enrolment_field": "enrolment_ticket",
    },
    {
        "doctype": "SkillsHub Edulution Feedback",
        "milestone": "Edulution",
        "student_field": None,          # No direct sh_student link; use owner
        "enrolment_field": "enrolment_ticket",
    },
    {
        "doctype": "SH Student Baseline Form",
        "milestone": None,             # Baseline is not milestone-specific
        "student_field": "sh_student",  # Direct Link to SH Student
        "enrolment_field": "enrolment_ticket",
    },
]


def build_email_to_student_map():
    """
    Build a lookup: pestalozzi_student_email → SH Student name.
    Used for Soft Skills and Edulution where only `owner` identifies the student.
    """
    students = frappe.get_all(
        "SH Student",
        filters={"pestalozzi_student_email": ["is", "set"]},
        fields=["name", "pestalozzi_student_email"],
        limit=0,
    )
    mapping = {}
    for s in students:
        email = (s.pestalozzi_student_email or "").strip().lower()
        if email:
            mapping[email] = s.name
    print(f"  → Built email→student map: {len(mapping)} entries")
    return mapping


def find_enrolment(student_id, milestone):
    """
    Find the best matching SH Student Enrolment for a student + milestone.
    Ignores cohort entirely — matches only on student + milestone (subject).
    Returns the enrolment name or None.
    """
    filters = {"student": student_id}

    if milestone:
        filters["milestone"] = milestone

    enrolments = frappe.get_all(
        "SH Student Enrolment",
        filters=filters,
        fields=["name", "status", "enrolment_date"],
        order_by="enrolment_date desc",
        limit=0,
    )

    if not enrolments:
        return None, "no_match"

    if len(enrolments) == 1:
        return enrolments[0].name, "exact"

    # Multiple matches: prefer Active/Enrolled, then most recent
    active = [e for e in enrolments if e.status in ("Enrolled", "Active")]
    if active:
        return active[0].name, "active_pick"

    # Fall back to the most recent by date
    return enrolments[0].name, "recent_pick"


def process_doctype(config, email_map):
    """Process a single feedback DocType, matching orphans to enrolments."""
    dt = config["doctype"]
    milestone = config["milestone"]
    student_field = config["student_field"]
    enrolment_field = config["enrolment_field"]

    print(f"\n{'='*60}")
    print(f"Processing: {dt}")
    print(f"  Expected milestone: {milestone or '(any)'}")
    print(f"  Student field: {student_field or 'owner (email lookup)'}")
    print(f"{'='*60}")

    # Find orphans: records with empty or null enrolment_ticket
    orphans = frappe.get_all(
        dt,
        filters={enrolment_field: ["in", ["", None]]},
        fields=["name", "owner"] + ([student_field] if student_field else []),
        limit=0,
    )

    print(f"  Found {len(orphans)} orphan record(s)")

    stats = {"matched": 0, "ambiguous": 0, "no_student": 0, "no_enrolment": 0, "error": 0}
    results = []

    for orphan in orphans:
        record_name = orphan.name
        student_id = None

        # ── Resolve student ID ───────────────────────────────────────
        if student_field and orphan.get(student_field):
            student_id = orphan[student_field]
        else:
            # Fallback: use owner email to look up student
            owner_email = (orphan.owner or "").strip().lower()
            student_id = email_map.get(owner_email)

            if not student_id:
                stats["no_student"] += 1
                if LOG_DETAILS:
                    print(f"    ✗ {record_name}: No student found for owner '{orphan.owner}'")
                results.append({"record": record_name, "status": "no_student", "owner": orphan.owner})
                continue

        # ── Find matching enrolment ──────────────────────────────────
        enrolment_name, match_type = find_enrolment(student_id, milestone)

        if not enrolment_name:
            stats["no_enrolment"] += 1
            if LOG_DETAILS:
                print(f"    ✗ {record_name}: Student {student_id} has no '{milestone or 'any'}' enrolment")
            results.append({
                "record": record_name, "status": "no_enrolment",
                "student": student_id, "milestone": milestone,
            })
            continue

        # ── Update the record ────────────────────────────────────────
        if match_type in ("active_pick", "recent_pick"):
            stats["ambiguous"] += 1
            qualifier = f" (ambiguous → {match_type})"
        else:
            qualifier = ""
            stats["matched"] += 1

        if LOG_DETAILS:
            print(f"    ✓ {record_name}: → {enrolment_name} (student={student_id}){qualifier}")

        results.append({
            "record": record_name, "status": "linked",
            "student": student_id, "enrolment": enrolment_name,
            "match_type": match_type,
        })

        if not DRY_RUN:
            try:
                frappe.db.set_value(dt, record_name, enrolment_field, enrolment_name, update_modified=False)
            except Exception as e:
                stats["error"] += 1
                print(f"    ⚠ {record_name}: Error updating — {e}")

    # ── Summary ──────────────────────────────────────────────────────
    total_linked = stats["matched"] + stats["ambiguous"]
    print(f"\n  Summary for {dt}:")
    print(f"    Total orphans:     {len(orphans)}")
    print(f"    Exact matches:     {stats['matched']}")
    print(f"    Ambiguous (linked):{stats['ambiguous']}")
    print(f"    No student found:  {stats['no_student']}")
    print(f"    No enrolment:      {stats['no_enrolment']}")
    print(f"    Errors:            {stats['error']}")
    print(f"    ────────────────────")
    print(f"    Successfully linked: {total_linked}")

    return results, stats


def run():
    """Main entry point."""
    print("\n" + "█" * 60)
    print("  SkillsHub — Orphan Feedback Recovery")
    print(f"  Mode: {'DRY RUN (no changes)' if DRY_RUN else '⚠️  LIVE — changes will be committed'}")
    print(f"  Started: {now_datetime()}")
    print("█" * 60)

    # Build the email → student lookup (used for Soft Skills & Edulution)
    print("\nBuilding email → student lookup...")
    email_map = build_email_to_student_map()

    all_results = {}
    grand_stats = {"matched": 0, "ambiguous": 0, "no_student": 0, "no_enrolment": 0, "error": 0}

    for config in FEEDBACK_CONFIG:
        results, stats = process_doctype(config, email_map)
        all_results[config["doctype"]] = results
        for k in grand_stats:
            grand_stats[k] += stats[k]

    # ── Grand Summary ────────────────────────────────────────────────
    total_orphans = sum(len(r) for r in all_results.values())
    total_linked = grand_stats["matched"] + grand_stats["ambiguous"]

    print("\n" + "█" * 60)
    print("  GRAND SUMMARY")
    print("█" * 60)
    print(f"  Total orphans processed: {total_orphans}")
    print(f"  Successfully linked:     {total_linked}")
    print(f"    - Exact matches:       {grand_stats['matched']}")
    print(f"    - Ambiguous (linked):  {grand_stats['ambiguous']}")
    print(f"  Not linked:")
    print(f"    - No student found:    {grand_stats['no_student']}")
    print(f"    - No enrolment found:  {grand_stats['no_enrolment']}")
    print(f"    - Errors:              {grand_stats['error']}")

    if DRY_RUN:
        print("\n  ⚠️  DRY RUN — No changes were made.")
        print("  Set DRY_RUN = False and re-run to commit.")
    else:
        frappe.db.commit()
        print("\n  ✅ Changes committed to database.")

    print(f"\n  Completed: {now_datetime()}")
    print("█" * 60 + "\n")

    return all_results


# ── Execute ──────────────────────────────────────────────────────────────────
results = run()
