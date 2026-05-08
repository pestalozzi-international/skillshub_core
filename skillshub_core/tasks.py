# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt
"""
Top-level tasks.py — thin redirect to the canonical implementation.

All scheduled task logic lives in skillshub_core/skillshub_core/tasks.py.
Hooks.py references skillshub_core.skillshub_core.tasks.* so this file
is not called by the scheduler. It is kept for import compatibility only.
"""

from skillshub_core.skillshub_core.tasks import (
    daily_attendance_alerts,
    weekly_attendance_summary,
    check_post_skillshub_followups,
)

__all__ = [
    "daily_attendance_alerts",
    "weekly_attendance_summary",
    "check_post_skillshub_followups",
]
