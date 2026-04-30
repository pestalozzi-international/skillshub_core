# SkillsHub — Reference Document for Rebuild & Upgrade

> This document is the single source of truth for revamping the `skillshub_core` custom Frappe app.
> Use it as context at the start of every build session.
> Github MCP Connector: PI Github
> Repo: https://github.com/pestalozzi-international/skillshub_core
> Frappe Site: portal.pestalozzi.education
> Frappe MCP Connector: PI Portal

---

## 1. Project Context

**Organisation:** Pestalozzi International (Zambia SkillsHub)
**Platform:** Frappe (custom app — `skillshub_core`, deployed on PI Portal ERPNext instance)
**Goal:** Flatten, rationalise, and upgrade the SkillsHub student management system, then build a clean HTML frontend portal backed by the Frappe REST API.
**Primary Users:** Programme coordinators (admin), instructors (attendance), students (feedback/profile). Non-technical staff — simplicity is non-negotiable.

**Student ID format:** `SH.YY.####` (e.g. `SH.25.0042`) — this is the universal unique identifier across all records. Always present. Never use NRC as the key.

---

## 2. Programme Pathway (the ground truth)

```
ENTRY (all students)
  ├── 1. Mindset Camp          → Mindset Camp Feedback
  └── 2. Soft Skills           → Soft Skills Feedback

PATH A (with Edulution)
  ├── 3. Edulution             → Edulution Feedback
  └── 4. Vocational Training   → VT Feedback  (student selects a course/trade)

PATH B (direct VT, no Edulution)
  └── 3. Vocational Training   → VT Feedback  (student selects a course/trade)

POST-PROGRAMME (all VT graduates)
  ├── Attachment               → Attachment Feedback  (during VT attachment placement)
  └── Employment               → tracked via Employment History child table (ongoing)

CROSS-CUTTING (any time, not sequential)
  ├── Baseline Form            → submitted at each milestone (= the SkillsHub Programme they are at)
  └── Parent Feedback          → submitted as needed, not tied to a specific programme step
```

**Rules:**
- Mindset Camp and Soft Skills each have exactly one course (no course selection needed).
- Edulution has exactly one course.
- Vocational Training is the only programme where a student selects a specific course/trade.
- Path A/B is set on the student's enrolment record when they move into VT.
- Attachment happens during or after VT — it is not a separate Programme Schedule.
- Employment is tracked as a child table; not a programme.

---

## 3. Current App Architecture (as-is)

### Modules and Doctypes

| Module | Doctypes |
|---|---|
| **Skillshub Core** | *(empty — no doctypes registered here)* |
| **Skillshub Portal** | *(empty — no doctypes registered here)* |
| **ZM SH Admissions** | SH Applicant |
| **ZM SH Baseline** | SH Student Baseline Form, SH Student Community Challenge, SH Student Community Challenge Link |
| **ZM SH Mindset Camp** | SH Mindset Camp Aspect, SH Mindset Camp Aspect Link, SH Mindset Camp Feedback |
| **ZM SH Soft Skills** | SH Soft Skills Feedback, SH SS Course Expectation Link, SkillsHub Soft Skills, SkillsHub Soft Skills Link |
| **ZM SH Edulution** | SkillsHub Edulution Feedback |
| **ZM SH Vocational Training** | SH SS Course Expectation, SH VT Attachment Challenge, SH VT Beneficial Programme Aspect, SH VT Beneficial Programme Aspect Link (custom), SH VT Course Expectation, SkillsHub Vocational Training Feedback |
| **ZM SH Post SkillsHub** | SH Attachment Challenge, SH Attachment Challenge Link, ZM SkillsHub Attachment Feedback |
| **ZM SH Parent Feedback** | SH Household Participation Impact, SH Household Participation Impact Link, ZM SkillsHub Parent Feedback |
| **ZM SkillsHub** | SH Academic Year, SH Attendance, SH Beneficiary, SH Beneficiary Link, SH Course Expectation Link, SH Discipline, SH Employment History, SH Employment Institution, SH Holiday List, SH Holidays, SH Instructor, SH Instructor Link, SH Programme Schedule, SH Schedule Days, SH Student, SH Student Attendance, SH Student Motivation, SH Student Motivation Link, SH Student Resilience, SH Student Resilience Link, SH Teaching Partner, SH Teaching Partner Link, SH VT Course Expectation Link, SkillsHub Cohort, SkillsHub Cohort Link, SkillsHub Course, SkillsHub Course-Programme Link, **SkillsHub Phases**, SkillsHub Programme, **SkillsHub Programme-Student Link** |

---

### Key Existing Doctype Schemas (as-is)

#### SH Applicant
`autoname: custom` | Module: ZM SH Admissions
- `full_name` Data
- `email` Data (Email, unique)
- `center` Data
- `status` Select: Applied / Interviewed / Accepted / Rejected / Converted
- `converted_to_student` Link → SH Student (read-only)

---

#### SkillsHub Programme
`autoname: field:programme_name` | Module: ZM SkillsHub
- `programme_name` Data (unique)
- `description` Small Text
- `has_courses` Check
- `courses` Table → SkillsHub Course-Programme Link *(shown only if has_courses)*

**Current values:** Mindset Camp, Soft Skills, Edulution, Vocational Training, Attachment

---

#### SkillsHub Cohort
`autoname: custom` | Module: ZM SkillsHub
- `cohort_name` Select: Cohort 0 … Cohort 50 (required, in list view)
- `code` Data (unique, read-only — auto-generated)
- `cohort_details` Small Text

**Concept:** An *intake batch* — students who start together. Not programme-specific. Cohort 5 spans Mindset Camp → Soft Skills → VT across multiple Programme Schedules.

---

#### SkillsHub Phases ← **TO BE REMOVED**
`autoname: field:phase` | Module: ZM SkillsHub
- `phase` Data (unique)

**Problem:** Redundant. The SkillsHub Programme name IS the phase. Remove this doctype and all references to it once feedback forms are migrated.

---

#### SH Programme Schedule (current)
`autoname: custom` | Module: ZM SkillsHub
- `current_phase` Link → SkillsHub Phases (**REMOVE**)
- `complete` Check
- `academic_year` Link → SH Academic Year (reqd)
- `skillshub_programme` Link → SkillsHub Programme (reqd)
- `skillshub_course` Link → SkillsHub Course (reqd)
- `course_code` Read Only (fetch from skillshub_course.course_code)
- `cohort` Link → SkillsHub Cohort (reqd)
- `cohort_code` Read Only (fetch from cohort.code)
- `course_notes` Small Text (reqd)
- `class_id` Data
- `instructors` Table → SH Instructor Link
- `teaching_partners` Table → SH Teaching Partner Link
- `duration` Select: 6 Months / 3 Months / 6 Weeks (reqd)
- `holiday_list` Link → SH Holiday List (reqd)
- `days_offered` Table → SH Schedule Days (reqd)
- `start_date` Date (reqd)
- `end_date` Date (reqd, fieldname: `end_state` — typo in current schema)

---

#### SH Student (current — key fields by tab)
`autoname: SH.YY.####` | Module: ZM SkillsHub | Roles: System Manager, PI Admin, Student

**Details Tab**
- `first_name`, `middle_name`, `last_name` Data
- `student_name` Data — "Student Full Name" (searchable, in list view)
- `student_image` Attach Image
- `date_of_birth` Date
- `age` Data
- `religion` Link → Religion
- `nationality` Link → Nationality
- `gender` Link → Gender
- `nrc_number` Data
- `airtel_money_name` Data
- `english_language_proficiency` Rating

**Address and Contact Tab**
- `address_line_1`, `address_line_2`, `pincode` Data
- (contact fields)

**ID and Application Tab**
- `students_occupation` Data — occupation at selection time
- `highest_salary_in_zmw` Data
- `last_school_attended` Data
- `last_year_of_schooling` Select: Preschool / Pre-K / Kindergarten / Grade 1–12 / Undergraduate / Graduate / Doctoral
- `highest_level_of_schooling` Select (read-only, derived)
- `has_vocational_training_history` Check
- `vocational_training_received` Small Text
- `has_volunteering_history` Check
- `details_of_volunteering` Small Text
- `has_history_of_medical_conditions` Check
- `details_of_medical_conditions` Small Text
- `naming_series` Data (hidden, reqd) — `SH.YY.####`
- `portal_enabled` Check
- `portal_user_account` Link → User

**Enroled Programmes and History Tab** ← **MAJOR CHANGES NEEDED**
- `status` Select: Student / Alumni (reqd)
- `current_schedule` Link → SH Programme Schedule (reqd if status=Student)
- `skillshub_programme` Link → SkillsHub Programme
- `current_course` Link → SkillsHub Course
- `current_cohort` Link → SkillsHub Cohort
- `current_phase` Link → SkillsHub Phases (**REMOVE**)
- `enrolment_date` Date
- `graduation_completion_date` Date (reqd if status=Alumni)
- `total_sessions` Int (read-only) ← **REMOVE — move to Enrolment**
- `sessions_present` Int (read-only) ← **REMOVE — move to Enrolment**
- `sessions_absent` Int (read-only) ← **REMOVE — move to Enrolment**
- `attendance_pct` Percent (read-only) ← **REMOVE — move to Enrolment**
- `programme_history` Table → SkillsHub Programme-Student Link ← **REMOVE — replaced by SH Student Enrolment doctype**

**Mindset Camp Tab** ← **REMOVE ENTIRELY**
- `mindset_camp_attendance` Check
- `mindset_camp_date` Date
- `mindset_camp_notes` Small Text

**Family Tab**
- `household_income` Data
- `household_receives_financial_aid` Check
- `housing_status` Select: Rented Home / Owned Home / Government
- `guardian_name`, `guardian_email`, `guardian_mobile_number`, `guardian_date_of_birth`, `guardian_occupation`, `guardian_address` (various)
- `relationship` Select: Mother / Father / Stepmother / Stepfather / Grandmother / Grandfather / Aunt / Uncle / Brother / Sister / Cousin / Legal Guardian / Foster Parent / Adoptive Parent / Daughter / Husband / Self / Wife
- `parents_marital_status` Select: Married / Divorced / Widowed / Separated / Single Parent
- `number_of_siblings` Data

*Note: Guardian fields remain embedded — no Guardian doctype needed for now.*

**Discipline Tab**
- `discipline` Table → SH Discipline

**Work Tab**
- Attachment During SkillsHub section:
  - `attachment_institution` Link → SH Employment Institution
  - `attachment_institution_niche` Data (fetch from institution.niche)
  - `attachment_institution_address` Data (fetch from institution.address)
  - `course_at_time_of_attachment` Link → SkillsHub Course
  - `start_date` Date
  - `attachment_completed` Check
  - `end_date` Date (depends_on: attachment_completed)
- Employment Post SkillsHub section:
  - `occupation_post_completion` Data ← **REMOVE — data moves to employment_history**
  - `employer` Data ← **REMOVE — data moves to employment_history**
  - `employment_history` Table → SH Employment History ← **KEEP & ENRICH**

---

#### SH Attendance (session header)
`autoname: custom` | Module: ZM SkillsHub
- `sh_programme_schedule` Link → SH Programme Schedule (reqd, in list view)
- `week` Select: WEEK 1 … WEEK 35 (reqd)
- `date` Date (reqd, in list view)
- `day` Select: MONDAY–SUNDAY (read-only, in list view)
- `general_notes` Small Text
- `partner` Link → SH Teaching Partner (in list view, standard filter)
- `attendance_recorded_by` Link → User (in list view, standard filter)
- `full_name` Data (fetch from attendance_recorded_by.full_name, reqd)
- *(fetched read-only: programme, course, cohort, academic_year, programme_schedule_phase)*
- `total_students` Int (read-only, computed)
- `present_count` Int (read-only, computed)
- `absent_count` Int (read-only, computed)
- `leave_count` Int (read-only, computed)
- `attendance_rate` Percent (read-only, computed)

**How it works:** One SH Attendance per class day = the session envelope. The instructor creates it, picks the date, and the system aggregates counts from the linked SH Student Attendance records.

---

#### SH Student Attendance (per-student per-day)
`autoname: custom` | Module: ZM SkillsHub | Roles: System Manager, PI Admin, Student (read-only own)
- `sh_student` Link → SH Student (reqd, search_index, standard filter)
- `student_name` Data (fetch from sh_student.student_name, read-only)
- `sh_programme_schedule` Link → SH Programme Schedule (reqd, search_index, standard filter)
- `date` Date (reqd, search_index)
- `status` Select: Present / Absent / Leave / Late (reqd, standard filter)
- `week` Select: WEEK 1–35 (read-only)
- `day` Select: MONDAY–SUNDAY (read-only, standard filter)
- `late_minutes` Int (shown only if status=Late)
- `notes` Small Text
- *(fetched read-only: programme, course, cohort, academic_year, current_phase)*
- `marked_by` Link → User (read-only)
- `sh_attendance` Link → SH Attendance — "Session Header" (read-only, search_index)

**Attendance model summary:**
> SH Attendance = "Tuesday's Soft Skills class had 18/20 present"
> SH Student Attendance = "John: Present, Mary: Absent" (one row per student)
> The instructor creates the session header, marks each student. Aggregates roll up to the header automatically.

---

#### Feedback Forms — Common Pattern (all 6 forms)

Every feedback form follows the same General tab structure. **Current state has problems:**
- `portal_user_account` Link → User — **UNUSED, REMOVE**
- `student_name` Link → SH Student — *confusingly named (it's a link, not a display name)*
- `sh_student` Link → SH Student — **duplicate student link, CONSOLIDATE**
- `pestalozzi_student_id` Data — fetched from portal_user_account — **REMOVE** (use SH Student ID directly)
- `feedback_phase` Link → SkillsHub Phases — **REPLACE with `milestone` Link → SkillsHub Programme** (auto-fetched from programme_schedule)
- `program_schedule` Link → SH Programme Schedule — **KEEP, make reqd**
- `academic_year`, `cohort`, `course` — fetched read-only from programme_schedule — **KEEP**

**Target pattern for all feedback form General tabs:**

| fieldname | label | fieldtype | options | notes |
|---|---|---|---|---|
| `sh_student` | Student | Link | SH Student | reqd, in list view |
| `student_full_name` | Student Name | Data | — | fetch from sh_student.student_name, read-only |
| `programme_schedule` | Programme Schedule | Link | SH Programme Schedule | reqd |
| `milestone` | Milestone | Link | SkillsHub Programme | fetch from programme_schedule.skillshub_programme, read-only |
| `academic_year` | Academic Year | Link | SH Academic Year | fetch from programme_schedule.academic_year, read-only |
| `cohort` | Cohort | Link | SkillsHub Cohort | fetch from programme_schedule.cohort, read-only |
| `course` | Course | Link | SkillsHub Course | fetch from programme_schedule.skillshub_course, read-only |
| `date_submitted` | Date Submitted | Datetime | — | default: Now |

---

#### The Six Feedback Forms (content summary)

| DocType | Autoname | Key Content Fields |
|---|---|---|
| **SH Mindset Camp Feedback** | `{student_name}-MC{##}` | aspects table (SH Mindset Camp Aspect Link), open text fields |
| **SH Soft Skills Feedback** | (TBC) | soft skills multi-select table, course expectation table, open text |
| **SkillsHub Edulution Feedback** | `{student_name}-ED{##}` | goals check, skills learned table, ratings (confidence, literacy, numeracy, resilience, problem-solving), motivations, impact, coaching opt-in, photo |
| **SkillsHub Vocational Training Feedback** | `{student_name}-VT{##}` | expectations table, course met expectations, objective comms rating, goals, trainer comms rating, skills ratings (problem-solving, time management, teamwork, mental resilience), beneficial aspects table, beneficiaries table, volunteering check |
| **ZM SkillsHub Attachment Feedback** | `{student_name}-AF{##}` | attachment preparation rating, skills use example, challenges table (SH Attachment Challenge Link), challenges text, improvement suggestions |
| **ZM SkillsHub Parent Feedback** | (TBC) | household participation impact table, open text |

---

#### SH Student Baseline Form
Module: ZM SH Baseline — **fields TBC from schema** (too large to read in session)
**Target:** Add a `milestone` field (Link → SkillsHub Programme, reqd) so each baseline submission is anchored to the programme the student is currently in. Remove `feedback_phase` Link → SkillsHub Phases.

---

## 4. Current Problems (explicit list)

1. **SkillsHub Phases** — a redundant lookup doctype (just one field: `phase`). The programme name already IS the phase. Used in `current_phase` on Programme Schedule and `feedback_phase` on all feedback forms. Must be removed after migration.

2. **Programme history is programmatic** — `programme_history` child table on SH Student (`SkillsHub Programme-Student Link`) is managed by Python controllers, not queryable in standard Frappe reports, and has no per-programme stats. Replace with standalone `SH Student Enrolment` doctype.

3. **Attendance stats on SH Student are lifetime totals** — `total_sessions`, `sessions_present`, `sessions_absent`, `attendance_pct` on the main student record are programmatically computed, represent lifetime totals (not per-programme), and can't be queried per cohort/programme. Move to SH Student Enrolment.

4. **Mindset Camp tab on SH Student** — embedding per-programme data (`mindset_camp_attendance`, `mindset_camp_date`, `mindset_camp_notes`) directly on the student record. Doesn't scale; already the first sign of a pattern that would require a new tab per programme. Remove entirely.

5. **No student roster on Programme Schedule** — attendance recording requires searching for students one by one. Should be pre-loaded from a roster child table on the schedule.

6. **Duplicate student link fields on feedback forms** — every feedback form has both `student_name` (Link → SH Student) and `sh_student` (Link → SH Student). Consolidate to one.

7. **`portal_user_account` on feedback forms** — the General tab of every feedback form has `portal_user_account` (Link → User) and `pestalozzi_student_id` (fetched from it). These are not in use and rely on a portal user pattern that has been superseded. Remove.

8. **`feedback_phase` Link → SkillsHub Phases** — on every feedback form and baseline form. Replace with `milestone` Link → SkillsHub Programme, auto-fetched from the programme_schedule field.

9. **Direct employment fields on SH Student** — `occupation_post_completion` and `employer` are standalone fields. All employment data should live in the `employment_history` child table (SH Employment History). Remove the standalone fields.

10. **`end_state` fieldname typo** — the End Date field on SH Programme Schedule has fieldname `end_state` instead of `end_date`. Fix this.

11. **No path tracking** — no field records whether a student is on Path A or Path B. Add `programme_path` to SH Student Enrolment (and optionally a read-only copy on SH Student).

12. **Skillshub Portal module is empty** — the Skillshub Portal module has no registered doctypes. The frontend portal will be built as static HTML using the Frappe REST API, not as Frappe web views/web forms.

---

## 5. Target Architecture (to-build)

### 5A. NEW: SH Student Enrolment

**Purpose:** One record per student per programme schedule. Replaces the `programme_history` child table. The central junction for reporting, per-programme stats, and pathway tracking.

`autoname: format:{student}-{programme_schedule}` | Module: ZM SkillsHub | track_changes: true

| fieldname | label | fieldtype | options | reqd | read_only | notes |
|---|---|---|---|---|---|---|
| `student` | Student | Link | SH Student | ✓ | — | in list view, search_index |
| `student_name` | Student Name | Data | — | — | ✓ | fetch from student.student_name |
| `programme_schedule` | Programme Schedule | Link | SH Programme Schedule | ✓ | — | in list view, search_index |
| `milestone` | Milestone | Link | SkillsHub Programme | — | ✓ | fetch from programme_schedule.skillshub_programme |
| `academic_year` | Academic Year | Link | SH Academic Year | — | ✓ | fetch from programme_schedule.academic_year |
| `cohort` | Cohort | Link | SkillsHub Cohort | — | ✓ | fetch from programme_schedule.cohort |
| `course` | Course | Link | SkillsHub Course | — | ✓ | fetch from programme_schedule.skillshub_course |
| `programme_path` | Path | Select | — / Path A / Path B | — | — | relevant for VT onwards; blank for Mindset Camp/SS/Edulution |
| `status` | Status | Select | Enrolled / Completed / Dropped / Transferred | ✓ | — | in list view, standard filter |
| `enrolment_date` | Enrolment Date | Date | — | ✓ | — | |
| `completion_date` | Completion Date | Date | — | — | — | reqd when status → Completed |
| `exit_reason` | Exit Reason | Small Text | — | — | — | shown only if status = Dropped |
| `attendance_rate` | Attendance Rate | Percent | — | — | ✓ | computed from SH Student Attendance records for this schedule |
| `sessions_total` | Total Sessions | Int | — | — | ✓ | computed |
| `sessions_present` | Sessions Present | Int | — | — | ✓ | computed |
| `sessions_absent` | Sessions Absent | Int | — | — | ✓ | computed |
| `feedback_submitted` | Feedback Submitted | Check | — | — | ✓ | set by controller when relevant feedback form created |
| `baseline_submitted` | Baseline Submitted | Check | — | — | ✓ | set by controller when baseline form for this milestone created |
| `notes` | Notes | Small Text | — | — | — | |

**Unique constraint:** student + programme_schedule combination (prevent duplicate enrolments).

**Permissions:** System Manager (full), PI Admin (full), Student (read own).

---

### 5B. MODIFIED: SH Programme Schedule

**Changes:**
1. Remove `current_phase` (Link → SkillsHub Phases)
2. Fix fieldname `end_state` → `end_date`
3. Add `enrolled_students` child table (new child doctype: `SH Schedule Student`)
4. Add `max_strength` Int field (capacity limit)
5. Add `status` Select: Active / Complete / Cancelled

**New child doctype: SH Schedule Student** (istable: true)
| fieldname | label | fieldtype | options | notes |
|---|---|---|---|---|
| `student` | Student | Link | SH Student | reqd, in list view |
| `student_name` | Student Name | Data | — | fetch from student.student_name, read-only |
| `enrolment_date` | Enrolment Date | Date | — | |
| `active` | Active | Check | — | default: 1 |

**New fields to add to SH Programme Schedule:**
| fieldname | label | fieldtype | notes |
|---|---|---|---|
| `status` | Status | Select: Active / Complete / Cancelled | default: Active |
| `max_strength` | Max Strength | Int | optional capacity cap |
| `enrolled_students` | Enrolled Students | Table → SH Schedule Student | |

**Fields to remove:** `current_phase`
**Fields to fix:** rename `end_state` → `end_date`

---

### 5C. MODIFIED: SH Student

**Fields to REMOVE:**
- `current_phase` (Link → SkillsHub Phases)
- `total_sessions`, `sessions_present`, `sessions_absent`, `attendance_pct` (move to Enrolment)
- `programme_history` (Table → SkillsHub Programme-Student Link) — replaced by SH Student Enrolment
- Mindset Camp Tab entirely: `mindset_camp_attendance`, `mindset_camp_date`, `mindset_camp_notes`
- `occupation_post_completion`, `employer` (standalone employment fields — data migrated to employment_history)

**Fields to ADD:**
| fieldname | label | fieldtype | notes |
|---|---|---|---|
| `programme_path` | Programme Path | Select: — / Path A / Path B | read-only, fetched from latest active Enrolment |
| `exit_reason` | Exit Reason | Small Text | shown if status = Alumni (or Dropped if we add that state) |

**Fields to KEEP (key ones):**
- `status` Select: Student / Alumni — keep as-is, add `Dropped` option
- `current_schedule` Link → SH Programme Schedule — keep as the quick pointer to active programme
- `skillshub_programme`, `current_course`, `current_cohort` — keep as fetched read-only from current_schedule
- `enrolment_date`, `graduation_completion_date` — keep
- `portal_enabled`, `portal_user_account` — keep (used for frontend auth)
- `employment_history` Table → SH Employment History — keep, enrich with fields below

**SH Employment History child table — enrich with:**
| fieldname | label | fieldtype | notes |
|---|---|---|---|
| `employer_name` | Employer Name | Data | rename from `employer` if exists |
| `employer_type` | Employer Type | Select: Formal / Informal / Self-Employed | new |
| `role` | Role / Position | Data | new |
| `start_date` | Start Date | Date | |
| `end_date` | End Date | Date | blank = current job |
| `monthly_salary_zmw` | Monthly Salary (ZMW) | Currency | new |
| `is_current` | Current Job | Check | new |
| `notes` | Notes | Small Text | new |

---

### 5D. MODIFIED: All Feedback Forms

Apply the same cleanup to all 6 feedback forms and SH Student Baseline Form:

**Remove from General tab:**
- `portal_user_account` (Link → User)
- `pestalozzi_student_id` (Data)
- `feedback_phase` (Link → SkillsHub Phases)
- Whichever of `student_name` / `sh_student` is the duplicate — consolidate to `sh_student` (Link → SH Student, reqd)

**Add/Replace in General tab:**
- `sh_student` Link → SH Student (reqd, in list view) — the single student link
- `student_full_name` Data (fetch from sh_student.student_name, read-only)
- `milestone` Link → SkillsHub Programme (fetch from programme_schedule.skillshub_programme, read-only, in list view)
- `programme_schedule` Link → SH Programme Schedule (reqd)
- Fetched read-only: `academic_year`, `cohort`, `course` — keep as-is

**For SH Student Baseline Form specifically:**
- Add `milestone` Link → SkillsHub Programme (reqd — user selects which programme they are currently in)
- This is the only form where milestone is NOT auto-fetched (it can be filled without a programme_schedule link)

---

### 5E. REMOVE: SkillsHub Phases

After migrating all `feedback_phase` references to `milestone` and removing `current_phase` from Programme Schedule and SH Student:
- Delete all SkillsHub Phases records
- Delete SkillsHub Phases DocType

---

## 6. Data Migration Steps

Perform in this order:

1. **Create SH Student Enrolment doctype** (new)
2. **Migrate programme_history rows** → create one SH Student Enrolment record per row, mapping: student, programme (→ find/create matching programme_schedule), status=Completed for past, Enrolled for current
3. **Add enrolled_students roster** to each SH Programme Schedule from current enrolment data
4. **Migrate feedback_phase → milestone** on all feedback forms: for each existing record, set `milestone` = the SkillsHub Programme that matches the old phase value
5. **Migrate employment data**: copy `occupation_post_completion` and `employer` values from SH Student into a new SH Employment History row per student
6. **Migrate Mindset Camp tab data**: if `mindset_camp_attendance` = true, note it in a comment on the student record or a one-time data export; then remove the tab
7. **Remove deprecated fields** from SH Student, Programme Schedule, and all feedback forms
8. **Delete SkillsHub Phases** doctype

---

## 7. Frontend Portal Architecture

**Technology:** Vanilla HTML + CSS + vanilla JavaScript. No framework, no build step.
**Theme:** Use existing Skillshub Portal app CSS variables and styles (already deployed on the instance).
**Auth:** Frappe token-based API auth (`Authorization: token api_key:api_secret` header). Each logged-in user has a Frappe User account linked via `portal_user_account` on SH Student.
**API base:** `/api/resource/` and `/api/method/` — standard Frappe REST endpoints.
**Backend:** All business logic in Frappe Python controllers and whitelisted methods. The HTML frontend only reads and writes via the API.

### Pages

#### Student-Facing

| Page | URL | Description |
|---|---|---|
| Login | `/skillshub/login` | Token auth; sets localStorage token |
| Profile | `/skillshub/profile` | Student's own record: name, photo, cohort, path, current programme, programme timeline, attendance rate per programme, feedback checklist |
| Feedback: Mindset Camp | `/skillshub/feedback/mindset-camp` | Form — pre-fills student + schedule |
| Feedback: Soft Skills | `/skillshub/feedback/soft-skills` | Form |
| Feedback: Edulution | `/skillshub/feedback/edulution` | Form — only shown if Path A |
| Feedback: Vocational Training | `/skillshub/feedback/vocational-training` | Form |
| Feedback: Attachment | `/skillshub/feedback/attachment` | Form |
| Baseline | `/skillshub/baseline` | Baseline form — student selects milestone |

#### Instructor-Facing

| Page | URL | Description |
|---|---|---|
| Attendance | `/skillshub/attendance` | Select today's Programme Schedule → pre-loaded student roster → mark Present/Absent/Leave/Late per student → submit |

Attendance must be **offline-tolerant**: marks stored in localStorage queue, flushed to API on reconnect.

#### Admin-Facing

| Page | URL | Description |
|---|---|---|
| Student Overview | `/skillshub/admin/students` | Filterable table: all students, status, cohort, path, current programme, attendance rate, feedback completeness indicator |
| Student Detail | `/skillshub/admin/student/{id}` | Full student view: demographics, programme timeline (all enrolments), feedback submissions, attendance summary, baseline trend, employment history |
| Cohort Overview | `/skillshub/admin/cohort/{cohort}` | All students in a cohort, their stage, attendance summary |
| Programme Schedule | `/skillshub/admin/schedule/{id}` | Roster, attendance history, feedback submission status |

### API Patterns

```javascript
// Auth header for all calls
const headers = {
  'Authorization': `token ${localStorage.getItem('api_key')}:${localStorage.getItem('api_secret')}`,
  'Content-Type': 'application/json'
};

// Get student profile
GET /api/resource/SH Student/{student_id}

// Get student's enrolments
GET /api/resource/SH Student Enrolment?filters=[["student","=","{id}"]]&fields=["milestone","status","attendance_rate","feedback_submitted"]

// Get roster for a schedule
GET /api/resource/SH Programme Schedule/{schedule_id}?fields=["enrolled_students"]

// Submit student attendance
POST /api/resource/SH Student Attendance

// Get feedback completeness for admin
GET /api/method/skillshub_core.api.get_student_summary?student={id}
```

---

## 8. Roles

| Role | Frappe Role Name | Permissions |
|---|---|---|
| System Manager | System Manager | Full access everything |
| Programme Admin | PI Admin | Full access all SkillsHub doctypes |
| Instructor | (TBC — create `SH Instructor` role) | Create/edit SH Attendance + SH Student Attendance for assigned schedules only. Read SH Student, SH Programme Schedule |
| Student | Student | Read own SH Student record. Create own feedback forms. Read own SH Student Attendance |
| M&E / Data | (TBC — create `SH Data` role) | Read all SkillsHub records, no write. Export. |

---

## 9. Build Sequence

### Phase 1 — Data Model (Frappe backend)
1. Create `SH Student Enrolment` doctype
2. Create `SH Schedule Student` child doctype
3. Add `enrolled_students`, `max_strength`, `status` to SH Programme Schedule; remove `current_phase`; fix `end_state` → `end_date`
4. Remove deprecated fields from SH Student; add `programme_path`, `exit_reason`; enrich SH Employment History
5. Migrate all 7 feedback forms + baseline form (remove portal_user_account, pestalozzi_student_id, feedback_phase; add milestone)
6. Run data migration scripts (programme_history → Enrolment records, employment, roster population)
7. Delete SkillsHub Phases doctype

### Phase 2 — Backend API & Controllers
8. Python controller on SH Student Enrolment: auto-populate `enrolled_students` on Programme Schedule when enrolment created
9. Controller: compute `attendance_rate`, `sessions_total`, `sessions_present`, `sessions_absent` on Enrolment from SH Student Attendance records
10. Controller: set `feedback_submitted` and `baseline_submitted` on Enrolment when relevant form saved
11. Whitelisted API method: `skillshub_core.api.get_student_summary` — returns full student dashboard data in one call
12. Whitelisted API method: `skillshub_core.api.mark_attendance` — accepts roster array, creates SH Attendance + SH Student Attendance records atomically
13. Whitelisted API method: `skillshub_core.api.enrol_cohort` — bulk enrols a cohort into a Programme Schedule

### Phase 3 — HTML Frontend
14. Auth layer (login page, token storage, route guard)
15. Student profile page
16. Attendance marking page (instructor)
17. Feedback forms (one page per form, conditional visibility by path)
18. Admin student overview table
19. Admin student detail page

### Phase 4 — Polish
20. Offline attendance queue (localStorage → sync)
21. Print formats: attendance register, student programme summary, completion certificate
22. Early warning: flag students with 3+ consecutive absences (server-side script + admin dashboard indicator)
23. Data completeness dashboard: feedback/baseline gaps per cohort

---

## 10. Invariants (never break these)

- The Student ID (`SH.YY.####`) is the universal key. Every linked record uses it. Never use NRC as a foreign key.
- One SH Student Enrolment per student per programme_schedule (enforce unique constraint).
- A student cannot be marked Completed on an Enrolment if `feedback_submitted = 0`.
- Path B students must not be enrolled in an Edulution Programme Schedule.
- SH Attendance is always linked to a Programme Schedule. SH Student Attendance is always linked to both a Programme Schedule AND an SH Attendance session header.
- `milestone` on feedback forms is always read-only and auto-fetched from the programme_schedule link — the user never sets it manually (except on Baseline Form where it is required and user-selected).
- SkillsHub Cohort is an intake batch (not programme-specific). The same cohort appears across multiple Programme Schedules.
- The `Skillshub Portal` Frappe module stays empty. The frontend is pure HTML/JS, not Frappe web views.
- Guardian fields remain embedded on SH Student. No Guardian doctype required.

---

## 11. Reference: Existing Lookup / Reference Doctypes (keep as-is)

| Doctype | Purpose |
|---|---|
| SH Academic Year | Year reference (e.g. 2025) |
| SH Holiday List | Holidays linked to a Programme Schedule |
| SH Holidays | Child table for SH Holiday List |
| SH Instructor | Instructor records |
| SH Teaching Partner | Partner organisations |
| SH Employment Institution | Attachment host organisations |
| SkillsHub Course | Trade/course catalogue |
| SH Mindset Camp Aspect | MC feedback options (child table source) |
| SH Attachment Challenge | Attachment challenge options |
| SH VT Attachment Challenge | VT-specific attachment challenge options |
| SH VT Beneficial Programme Aspect | VT beneficial aspects options |
| SH VT Course Expectation | VT course expectation options |
| SkillsHub Soft Skills | Soft skills catalogue |
| SH Student Motivation | Motivation options |
| SH Student Resilience | Resilience options |
| SH Beneficiary | Beneficiary type options |
| SH Student Community Challenge | Community challenge options |

---

*Last updated: 2026-04-30. Generated from live PI Portal schema inspection.*


To ensure your **SKILLSHUB_CLAUDE.md** remains the definitive "ground truth" for the rebuild, you can append or integrate these specific technical refinements into the relevant sections.

---

## Refinements to add to SKILLSHUB_CLAUDE.md

### Add to Section 6. Data Migration Steps
> **6.1 Formalization via Patches**
> * All migration steps (moving `programme_history` to `SH Student Enrolment`, migrating employment data, and Phase removal) must be implemented as formal Python patch scripts[cite: 2].
> * These scripts must be registered in `patches.txt` under the `[post_model_sync]` section to ensure they execute automatically after the database schema has been updated via `bench migrate`[cite: 2].

### Add to Section 9. Build Sequence (Phase 2 — Backend)
> **9.1 Scheduled Task Refactoring**
> * **Update `daily_attendance_alerts`**: Rewrite the SQL query in `tasks.py` to target `tabSH Student Enrolment` instead of `tabSH Student`[cite: 2]. The logic must now filter for at-risk students based on their specific active schedule enrollment records[cite: 2].
> * **Update `weekly_attendance_summary`**: Ensure the summary uses the new enrollment junction to calculate unique student counts and average rates per schedule[cite: 2].
> * **Update `check_post_skillshub_followups`**: Modify the query to look for missing data in the `tabSH Employment History` child table instead of the deprecated standalone fields on the student record[cite: 1, 2].

### Add to Section 7. Frontend Portal Architecture
> **7.1 Security and CI Compliance**
> * **CORS Configuration**: Ensure `allow_cors` is configured in `site_config.json` if the vanilla HTML portal is hosted on a separate domain or port from the Frappe instance[cite: 1].
> * **Linting Exceptions**: Maintain existing `.pre-commit-config.yaml` exclusions for any frontend templates or vendor libraries (e.g., `public/dist/`, `templates/includes/`) that contain Jinja2 syntax to prevent ESLint or Prettier failures during CI[cite: 2].

### Add to Section 10. Invariants
> * **Attendance Source of Truth**: Lifetime attendance stats are deprecated on the `SH Student` record; all attendance calculations must be derived from `SH Student Attendance` records linked to the specific `SH Student Enrolment`[cite: 1].