# Copyright (c) 2026, PI Dev and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

SCHOOLING_RANGE_MAP = {
    "Preschool":                 "Grades 1 to 7",
    "Pre-Kindergarten":          "Grades 1 to 7",
    "Kindergarten":              "Grades 1 to 7",
    "Grade 1":                   "Grades 1 to 7",
    "Grade 2":                   "Grades 1 to 7",
    "Grade 3":                   "Grades 1 to 7",
    "Grade 4":                   "Grades 1 to 7",
    "Grade 5":                   "Grades 1 to 7",
    "Grade 6":                   "Grades 1 to 7",
    "Grade 7":                   "Grades 1 to 7",
    "Grade 8":                   "Grades 8 to 9",
    "Grade 9":                   "Grades 8 to 9",
    "Grade 10":                  "Grades 10 to 12",
    "Grade 11":                  "Grades 10 to 12",
    "Grade 12":                  "Grades 10 to 12",
    "Undergraduate/Bachelor's":  "University or Diploma",
    "Graduate/Master's":         "University or Diploma",
    "Doctoral/PhD":              "University or Diploma",
}


class SHStudent(Document):

    def before_save(self):
        self.compute_schooling_range()
        self.sync_programme_history()
        self.compute_current_fields()

    def compute_schooling_range(self):
        if self.last_year_of_schooling:
            self.highest_level_of_schooling = SCHOOLING_RANGE_MAP.get(
                self.last_year_of_schooling, ""
            )

    def sync_programme_history(self):
        if not self.current_schedule:
            has_active = any(
                row.is_current and not row.graduation_completion_date
                for row in self.programme_history
            )
            if has_active:
                frappe.throw(
                    "Please fill <b>Graduation/Completion Date</b> "
                    "before removing the current schedule."
                )
            return

        existing_row = None
        for row in self.programme_history:
            if row.programme_schedule == self.current_schedule:
                existing_row = row
                break

        if not existing_row:
            self.append("programme_history", {
                "programme_schedule": self.current_schedule,
                "is_current": 1,
                "enrolment_date": self.enrolment_date or frappe.utils.today()
            })
        else:
            existing_row.is_current = 1
            existing_row.enrolment_date = self.enrolment_date or existing_row.enrolment_date

        for row in self.programme_history:
            if row.programme_schedule == self.current_schedule:
                row.graduation_completion_date = self.graduation_completion_date
                if self.graduation_completion_date:
                    row.is_current = 0
            else:
                row.is_current = 0

    def compute_current_fields(self):
        self.total_sessions   = 0
        self.sessions_present = 0
        self.sessions_absent  = 0
        self.attendance_pct   = 0.0
        self.current_course   = None
        self.current_cohort   = None
        self.current_phase    = None
        self.skillshub_programme = None

        for row in self.programme_history:
            if row.is_current:
                schedule = frappe.db.get_value(
                    "SH Programme Schedule",
                    row.programme_schedule,
                    ["name", "skillshub_programme", "skillshub_course", "cohort", "current_phase"],
                    as_dict=True
                )
                if schedule:
                    self.skillshub_programme = schedule.skillshub_programme
                    self.current_course      = schedule.skillshub_course
                    self.current_cohort      = schedule.cohort
                    self.current_phase       = schedule.current_phase

                self.total_sessions   = row.total_sessions   or 0
                self.sessions_present = row.sessions_present or 0
                self.sessions_absent  = row.sessions_absent  or 0
                self.attendance_pct   = row.attendance_pct   or 0.0
                break