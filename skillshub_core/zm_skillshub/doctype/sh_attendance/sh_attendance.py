# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import datetime

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class SHAttendance(Document):  # nosemgrep
	def autoname(self):
		if not self.sh_student or not self.sh_programme_schedule or not self.date:
			frappe.throw("Student, Class and Date are required.")  # nosemgrep
		date_str = str(self.date)[:10]
		self.name = f"SA-{self.sh_programme_schedule}-{self.sh_student}-{date_str}"

	def validate(self):
		if self.sh_student and not self.student_name:
			self.student_name = (
				frappe.db.get_value("SH Student", self.sh_student, "student_name") or self.sh_student
			)
		self.compute_day_and_week()
		self.validate_duplicate()
		self.validate_holiday()
		self.validate_schedule_day()
		if not self.marked_by:
			self.marked_by = frappe.session.user

	def compute_day_and_week(self):
		if not self.date:
			return
		date_obj = datetime.datetime.strptime(str(self.date)[:10], "%Y-%m-%d")
		self.day = date_obj.strftime("%A").upper()
		if self.sh_programme_schedule:
			start_date = frappe.db.get_value("SH Class", self.sh_programme_schedule, "start_date")
			if start_date:
				delta = (date_obj.date() - start_date).days
				week_num = min(max(delta // 7 + 1, 1), 35)
				self.week = f"WEEK {week_num}"

	def validate_duplicate(self):
		if not self.sh_student or not self.sh_programme_schedule or not self.date:
			return
		existing = frappe.db.get_value(
			"SH Attendance",
			{
				"sh_student": self.sh_student,
				"sh_programme_schedule": self.sh_programme_schedule,
				"date": self.date,
				"name": ("!=", self.name or ""),
			},
			"name",
		)
		if existing:
			frappe.throw(
				f"Attendance for <b>{self.sh_student}</b> on <b>{self.date}</b> "
				f"(class: <b>{self.sh_programme_schedule}</b>) already exists: "
				f"<a href='/app/sh-attendance/{existing}'>{existing}</a>"
			)

	def validate_holiday(self):
		if not self.sh_programme_schedule or not self.date:
			return
		holiday_list = frappe.db.get_value("SH Class", self.sh_programme_schedule, "holiday_list")
		if not holiday_list:
			return
		holiday = frappe.db.get_value(
			"SH Holidays", {"parent": holiday_list, "holiday_date": self.date}, "holiday_name"
		)
		if holiday:
			frappe.throw(
				f"<b>{self.date}</b> is a holiday: <b>{holiday}</b>. " f"Cannot mark attendance on a holiday."
			)

	def validate_schedule_day(self):
		if not self.sh_programme_schedule or not self.date:
			return
		days_offered = frappe.get_all(
			"SH Schedule Days", filters={"parent": self.sh_programme_schedule}, fields=["day"]
		)
		if not days_offered:
			return
		allowed_days = [d.day.upper() for d in days_offered]
		day_name = datetime.datetime.strptime(str(self.date)[:10], "%Y-%m-%d").strftime("%A").upper()
		if day_name not in allowed_days:
			frappe.throw(
				f"<b>{day_name}</b> is not a scheduled day for <b>{self.sh_programme_schedule}</b>. "
				f"Scheduled days are: {', '.join(allowed_days)}"
			)

	def after_save(self):
		_recompute_stats_for_student(self.sh_student, self.sh_programme_schedule)

	def after_delete(self):
		_recompute_stats_for_student(self.sh_student, self.sh_programme_schedule)


# ------------------------------------------------------------------ #
#  Module-level helpers (also importable by migration patch)         #
# ------------------------------------------------------------------ #


def _recompute_stats_for_student(student, schedule):
	"""
	Recalculate and persist attendance stats for one student in one class.
	Writes to the SH Enrolment record (the source of truth for per-class stats).
	Called after every SH Attendance save or delete.
	"""
	if not student or not schedule:
		return

	enrolment_name = frappe.db.get_value("SH Enrolment", {"student": student, "class": schedule}, "name")
	if not enrolment_name:
		return

	stats = frappe.db.sql(
		"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent
        FROM `tabSH Attendance`
        WHERE sh_student = %s
          AND sh_programme_schedule = %s
        """,
		(student, schedule),
		as_dict=True,
	)

	if not stats:
		return

	row = stats[0]
	total = int(row.total or 0)
	present = int(row.present or 0)
	absent = int(row.absent or 0)
	rate = round(flt(present) / total * 100, 1) if total else 0.0

	frappe.db.set_value(
		"SH Enrolment",
		enrolment_name,
		{
			"sessions_total": total,
			"sessions_present": present,
			"sessions_absent": absent,
			"attendance_rate": rate,
		},
		update_modified=False,
	)
