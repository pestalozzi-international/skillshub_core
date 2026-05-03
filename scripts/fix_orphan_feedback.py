"""
SkillsHub — Orphan Feedback Recovery Script
=============================================
Run in bench console:
    bench --site <site> console
    exec(open('/home/azureuser/frappe/pestalozzi-platforms/apps/skillshub_core/scripts/fix_orphan_feedback.py').read())

Set DRY_RUN = False inside run() to commit changes.
"""

def run():
    """Main entry point — all config and imports inside to avoid exec() scoping issues."""
    import frappe
    from frappe.utils import now_datetime

    # ── Configuration ────────────────────────────────────────────────
    DRY_RUN = False          # Set to False to actually commit changes
    LOG_DETAILS = True      # Print per-record match details

    # ── Programme schedule prefix mapping ────────────────────────────
    # The milestone field is often null on enrolments. Instead, we match
    # by the programme_schedule name prefix (e.g. SSP111 -> Soft Skills).
    FEEDBACK_CONFIG = [
        {
            "doctype": "SH Soft Skills Feedback",
            "schedule_prefix": "SSP",
            "label": "Soft Skills",
            "student_field": None,
            "enrolment_field": "enrolment_ticket",
        },
        {
            "doctype": "SH Mindset Camp Feedback",
            "schedule_prefix": "MSC",
            "label": "Mindset Camp",
            "student_field": "sh_student",
            "enrolment_field": "enrolment_ticket",
        },
        {
            "doctype": "SkillsHub Edulution Feedback",
            "schedule_prefix": "EDU",
            "label": "Edulution",
            "student_field": None,
            "enrolment_field": "enrolment_ticket",
        },
        {
            "doctype": "SH Student Baseline Form",
            "schedule_prefix": None,
            "label": "Baseline (any)",
            "student_field": "sh_student",
            "enrolment_field": "enrolment_ticket",
        },
    ]

    # ── Helper: email → student map ──────────────────────────────────
    def build_email_to_student_map():
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
        print(f"  -> Built email->student map: {len(mapping)} entries")
        return mapping

    # ── Helper: find best enrolment ──────────────────────────────────
    def find_enrolment(student_id, schedule_prefix):
        # 1. Try specific prefix match first
        if schedule_prefix:
            filters = {
                "student": student_id,
                "programme_schedule": ["like", f"{schedule_prefix}%"]
            }
            enrolments = frappe.get_all(
                "SH Student Enrolment",
                filters=filters,
                fields=["name", "status", "enrolment_date"],
                order_by="enrolment_date desc",
                limit=1,
            )
            if enrolments:
                return enrolments[0].name, "exact"

        # 2. Fallback to ANY enrolment for this student (Logical Match)
        enrolments = frappe.get_all(
            "SH Student Enrolment",
            filters={"student": student_id},
            fields=["name", "status", "enrolment_date"],
            order_by="enrolment_date desc",
            limit=0,
        )

        if not enrolments:
            return None, "no_match"
        
        # If we reached here and had a prefix, it's a fallback match
        match_label = "fallback" if schedule_prefix else "exact"
        if len(enrolments) == 1:
            return enrolments[0].name, match_label

        active = [e for e in enrolments if e.status in ("Enrolled", "Active")]
        if active:
            return active[0].name, f"{match_label}_active"
        return enrolments[0].name, f"{match_label}_recent"

    # ── Process one DocType ──────────────────────────────────────────
    def process_doctype(config, email_map):
        dt = config["doctype"]
        schedule_prefix = config["schedule_prefix"]
        label = config["label"]
        student_field = config["student_field"]
        enrolment_field = config["enrolment_field"]

        print(f"\n{'='*60}")
        print(f"Processing: {dt}")
        print(f"  Match by: programme_schedule prefix '{schedule_prefix or 'ANY'}'  ({label})")
        print(f"  Student field: {student_field or 'owner (email lookup) + name fallback'}")
        print(f"{'='*60}")

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

            if student_field and orphan.get(student_field):
                student_id = orphan[student_field]
            else:
                # Strategy 1: try owner email lookup
                owner_email = (orphan.owner or "").strip().lower()
                student_id = email_map.get(owner_email)

                # Strategy 2: extract Student ID from record name (e.g. SH260361-SS3169 -> SH260361)
                if not student_id and "-" in record_name:
                    candidate = record_name.split("-")[0]
                    if frappe.db.exists("SH Student", candidate):
                        student_id = candidate

                if not student_id:
                    stats["no_student"] += 1
                    if LOG_DETAILS:
                        print(f"    x {record_name}: No student found for owner '{orphan.owner}'")
                    results.append({"record": record_name, "status": "no_student", "owner": orphan.owner})
                    continue

            enrolment_name, match_type = find_enrolment(student_id, schedule_prefix)

            if not enrolment_name:
                stats["no_enrolment"] += 1
                if LOG_DETAILS:
                    print(f"    x {record_name}: Student {student_id} has no '{label}' enrolment")
                results.append({
                    "record": record_name, "status": "no_enrolment",
                    "student": student_id, "label": label,
                })
                continue

            if match_type != "exact":
                stats["ambiguous"] += 1
                qualifier = f" ({match_type})"
            else:
                qualifier = ""
            
            stats["matched"] += 1

            if LOG_DETAILS:
                print(f"    OK {record_name}: -> {enrolment_name} (student={student_id}){qualifier}")

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
                    print(f"    WARNING {record_name}: Error updating - {e}")

        print(f"\n  Summary for {dt}:")
        print(f"    Total orphans:     {len(orphans)}")
        print(f"    Exact matches:     {stats['matched'] - stats['ambiguous']}")
        print(f"    Ambiguous/Fallback:{stats['ambiguous']}")
        print(f"    No student found:  {stats['no_student']}")
        print(f"    No enrolment:      {stats['no_enrolment']}")
        print(f"    Errors:            {stats['error']}")
        print(f"    ----------------------")
        print(f"    Successfully linked: {stats['matched']}")

        return results, stats

    # ── Main execution ───────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  SkillsHub - Orphan Feedback Recovery")
    mode_str = "DRY RUN (no changes)" if DRY_RUN else "LIVE - changes will be committed"
    print(f"  Mode: {mode_str}")
    print(f"  Started: {now_datetime()}")
    print("=" * 60)

    print("\nBuilding email -> student lookup...")
    email_map = build_email_to_student_map()

    all_results = {}
    grand_stats = {"matched": 0, "ambiguous": 0, "no_student": 0, "no_enrolment": 0, "error": 0}

    for config in FEEDBACK_CONFIG:
        results, stats = process_doctype(config, email_map)
        all_results[config["doctype"]] = results
        for k in grand_stats:
            grand_stats[k] += stats[k]

    total_orphans = sum(len(r) for r in all_results.values())
    total_linked = grand_stats["matched"] + grand_stats["ambiguous"]

    print("\n" + "=" * 60)
    print("  GRAND SUMMARY")
    print("=" * 60)
    print(f"  Total orphans processed: {total_orphans}")
    print(f"  Successfully linked:     {total_linked}")
    print(f"    - Exact matches:       {grand_stats['matched']}")
    print(f"    - Ambiguous (linked):  {grand_stats['ambiguous']}")
    print(f"  Not linked:")
    print(f"    - No student found:    {grand_stats['no_student']}")
    print(f"    - No enrolment found:  {grand_stats['no_enrolment']}")
    print(f"    - Errors:              {grand_stats['error']}")

    if DRY_RUN:
        print("\n  DRY RUN - No changes were made.")
        print("  Set DRY_RUN = False and re-run to commit.")
    else:
        frappe.db.commit()
        print("\n  Changes committed to database.")

    print(f"\n  Completed: {now_datetime()}")
    print("=" * 60 + "\n")

    return all_results


# ── Execute ──────────────────────────────────────────────────────────────────
results = run()
