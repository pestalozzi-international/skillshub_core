# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt
"""
Migration patch: flatten SH Attendance child-table rows into the new
flat SH Student Attendance doctype (one document per student per session date).

Design notes
------------
* Uses raw SQL INSERT so Frappe validation hooks (validate_holiday,
  validate_schedule_day) do not block migration of historical data.
* Idempotent — records that already exist are skipped; safe to re-run.
* Runs in [post_model_sync] so tabSH Attendance already exists
  when this patch executes.
* After inserting all flat records, batch-recomputes stats for every
  unique (student, schedule) pair, then refreshes all SH Attendance
  session headers.
"""

import datetime
import frappe
from frappe.utils import now as frappe_now


def execute():
    # ---------------------------------------------------------------- #
    #  1. Read all child rows with their parent session details         #
    # ---------------------------------------------------------------- #
    rows = frappe.db.sql("""
        SELECT
            sal.student              AS sh_student,
            sal.status               AS status,
            sa.sh_programme_schedule AS schedule,
            sa.date                  AS date,
            sa.attendance_recorded_by AS recorded_by,
            sa.name                  AS session_name
        FROM `tabSH Attendance Student Link` sal
        INNER JOIN `tabSH Attendance` sa
            ON sa.name = sal.parent
        WHERE sal.student           IS NOT NULL
          AND sal.student           != ''
          AND sa.sh_programme_schedule IS NOT NULL
          AND sa.date               IS NOT NULL
        ORDER BY sa.date ASC, sal.student ASC
    """, as_dict=True)

    if not rows:
        print("[flatten_attendance] No SH Attendance Student Link rows found — nothing to migrate.")
        return

    print(f"[flatten_attendance] Found {len(rows)} child rows to process.")

    # Cache schedule start_dates to avoid N+1 queries
    start_date_cache = {}

    def _get_start_date(schedule):
        if schedule not in start_date_cache:
            sd = frappe.db.get_value("SH Class", schedule, "start_date")
            start_date_cache[schedule] = sd
        return start_date_cache[schedule]

    # ---------------------------------------------------------------- #
    #  2. Insert flat SH Student Attendance records via raw SQL         #
    # ---------------------------------------------------------------- #
    ts = frappe_now()
    created = 0
    skipped = 0
    errors  = 0

    for row in rows:
        try:
            date_str = str(row.date)[:10]
            rec_name = f"SA-{row.schedule}-{row.sh_student}-{date_str}"

            # Idempotency guard
            if frappe.db.exists("SH Attendance", rec_name):
                skipped += 1
                continue

            # Map status — old table only had Present/Absent/Leave
            status = row.status if row.status in ("Present", "Absent", "Leave", "Late") else "Present"

            # Compute day name
            date_obj = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            day_name = date_obj.strftime("%A").upper()

            # Compute week number relative to schedule start_date
            week_val  = None
            start_dt  = _get_start_date(row.schedule)
            if start_dt:
                delta    = (date_obj.date() - start_dt).days
                week_num = min(max(delta // 7 + 1, 1), 35)
                week_val = f"WEEK {week_num}"

            owner = row.recorded_by or "Administrator"

            frappe.db.sql("""
                INSERT INTO `tabSH Attendance`
                    (name, sh_student, sh_programme_schedule, date,
                     status, day, week, marked_by,
                     creation, modified, modified_by, owner, docstatus)
                VALUES
                    (%s, %s, %s, %s,
                     %s, %s, %s, %s,
                     %s, %s, %s, %s, %s)
            """, (
                rec_name,
                row.sh_student,
                row.schedule,
                row.date,
                status,
                day_name,
                week_val,
                owner,
                ts, ts,
                owner,
                owner,
                0    # docstatus = Saved
            ))
            created += 1

        except Exception as e:
            frappe.log_error(
                f"Migration insert error — student: {row.sh_student}, "
                f"schedule: {row.schedule}, date: {row.date}\n{e}",
                "Flatten Attendance Migration"
            )
            errors += 1

    frappe.db.commit()
    print(f"[flatten_attendance] Insert phase: {created} created, {skipped} skipped, {errors} errors.")

    # ---------------------------------------------------------------- #
    #  3. Batch-recompute student stats                                 #
    # ---------------------------------------------------------------- #
    from skillshub_core.zm_skillshub.doctype.sh_student_attendance.sh_student_attendance import (
        _recompute_stats_for_student,
        _sync_session_header,
    )

    combos = frappe.db.sql("""
        SELECT DISTINCT sh_student, sh_programme_schedule
        FROM `tabSH Attendance`
    """, as_dict=True)

    stat_errors = 0
    for combo in combos:
        try:
            _recompute_stats_for_student(combo.sh_student, combo.sh_programme_schedule)
        except Exception as e:
            frappe.log_error(
                f"Stats recompute error — {combo.sh_student} / {combo.sh_programme_schedule}\n{e}",
                "Flatten Attendance Migration"
            )
            stat_errors += 1

    print(f"[flatten_attendance] Stats recomputed for {len(combos)} student+schedule pairs "
          f"({stat_errors} errors).")

    # ---------------------------------------------------------------- #
    #  4. Refresh all SH Attendance session headers                     #
    # ---------------------------------------------------------------- #
    sessions = frappe.db.sql("""
        SELECT DISTINCT sh_programme_schedule, date
        FROM `tabSH Attendance`
    """, as_dict=True)

    hdr_errors = 0
    for session in sessions:
        try:
            _sync_session_header(session.sh_programme_schedule, session.date)
        except Exception as e:
            frappe.log_error(
                f"Session header sync error — {session.sh_programme_schedule} / {session.date}\n{e}",
                "Flatten Attendance Migration"
            )
            hdr_errors += 1

    frappe.db.commit()
    print(f"[flatten_attendance] Session headers refreshed for {len(sessions)} sessions "
          f"({hdr_errors} errors).")
    print(f"[flatten_attendance] Migration complete. "
          f"Total: {created} created, {skipped} skipped, {errors + stat_errors + hdr_errors} total errors.")
