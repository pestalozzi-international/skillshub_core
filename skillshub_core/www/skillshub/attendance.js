import { applyPortalSettings } from '/skillshub/portal-settings.js';
applyPortalSettings();

// Route guard
const userEmail = localStorage.getItem('sh_user');
if (!userEmail) window.location.href = '/skillshub/login';

document.addEventListener('DOMContentLoaded', function () {
  if (!userEmail) return;

  // Sign-out
  document.getElementById('sh-logout').addEventListener('click', function () {
    fetch('/api/method/logout', { method: 'POST', credentials: 'include' })
      .finally(() => { localStorage.clear(); window.location.href = '/skillshub/login'; });
  });

  const scheduleSelect  = document.getElementById('schedule-select');
  const dateInput       = document.getElementById('attendance-date');
  const attendanceArea  = document.getElementById('sh-attendance-area');
  const studentList     = document.getElementById('student-list');
  const submitBtn       = document.getElementById('submit-att-btn');
  const syncBanner      = document.getElementById('sync-banner');
  const syncCount       = document.getElementById('sync-count');
  const syncBtn         = document.getElementById('sync-btn');

  // Set today's date
  dateInput.valueAsDate = new Date();

  // Queue persists across page reloads
  let attendanceQueue = JSON.parse(localStorage.getItem('sh_attendance_queue') || '[]');
  let currentStudents = [];

  updateSyncBanner();

  // ── 1. Load active schedules ────────────────────────────────────────────
  fetch('/api/resource/SH Programme Schedule?filters=[["status","=","Active"]]' +
        '&fields=["name","skillshub_programme","skillshub_course","cohort"]&limit=100',
    { headers: { 'Accept': 'application/json' }, credentials: 'include' })
  .then(r => r.json())
  .then(data => {
    (data.data || []).forEach(sch => {
      const opt = document.createElement('option');
      opt.value = sch.name;
      opt.textContent = [
        sch.skillshub_programme,
        sch.skillshub_course ? '— ' + sch.skillshub_course : '',
        sch.cohort ? '(' + sch.cohort + ')' : ''
      ].filter(Boolean).join(' ');
      scheduleSelect.appendChild(opt);
    });
  })
  .catch(() => console.warn('Could not load schedules'));

  // ── 2. Load roster on schedule change ──────────────────────────────────
  scheduleSelect.addEventListener('change', function () {
    if (!this.value) { attendanceArea.style.display = 'none'; return; }
    studentList.innerHTML = '<p style="color:var(--color-slate-500)">Loading students…</p>';
    attendanceArea.style.display = 'block';
    submitBtn.disabled = true;

    fetch(`/api/resource/SH Student Enrolment?filters=${encodeURIComponent(
      JSON.stringify([['programme_schedule','=',this.value],['status','=','Enrolled']])
    )}&fields=${encodeURIComponent(JSON.stringify(['student','student_name']))}&limit=200`,
      { headers: { 'Accept': 'application/json' }, credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if (data.data && data.data.length > 0) {
        currentStudents = data.data;
        renderRoster(currentStudents);
      } else {
        studentList.innerHTML = '<p style="color:var(--color-slate-500)">No students enrolled in this schedule.</p>';
      }
    })
    .catch(() => {
      studentList.innerHTML = '<p class="sh-alert-error">Error loading roster. Check connection.</p>';
    });
  });

  // ── 3. Render roster ───────────────────────────────────────────────────
  function renderRoster(students) {
    studentList.innerHTML = '';
    submitBtn.disabled = false;
    students.forEach(s => {
      const row = document.createElement('div');
      row.className = 'student-row';
      row.innerHTML = `
        <div>
          <div class="student-info">${s.student_name}</div>
          <div class="student-id">${s.student}</div>
        </div>
        <div class="toggle-group" data-student="${s.student}">
          <button class="toggle-btn" data-status="Present">Present</button>
          <button class="toggle-btn" data-status="Absent">Absent</button>
          <button class="toggle-btn" data-status="Late">Late</button>
          <button class="toggle-btn" data-status="Leave">Leave</button>
        </div>`;
      studentList.appendChild(row);

      row.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          row.querySelectorAll('.toggle-btn').forEach(b => b.className = 'toggle-btn');
          this.classList.add(this.dataset.status.toLowerCase());
        });
      });
    });
  }

  // ── 4. Submit attendance ───────────────────────────────────────────────
  submitBtn.addEventListener('click', function () {
    const date     = dateInput.value;
    const schedule = scheduleSelect.value;
    if (!schedule || !date) { alert('Select a schedule and date.'); return; }

    const records = [];
    let allMarked = true;
    studentList.querySelectorAll('.toggle-group').forEach(group => {
      const activeBtn = group.querySelector('.toggle-btn.present, .toggle-btn.absent, .toggle-btn.late, .toggle-btn.leave');
      if (!activeBtn) allMarked = false;
      records.push({
        student: group.dataset.student,
        status:  activeBtn ? activeBtn.dataset.status : 'Absent',
      });
    });

    if (!allMarked && !confirm('Some students are unmarked and will default to Absent. Continue?')) return;

    const payload = { schedule, date, attendance_records: records };
    submitBtn.textContent = 'Submitting…';
    submitBtn.disabled    = true;

    submitToAPI(payload)
      .then(() => { alert('Attendance submitted!'); resetForm(); })
      .catch(() => {
        saveToQueue(payload);
        alert('Saved offline. Will sync when online.');
        resetForm();
      });
  });

  function submitToAPI(payload) {
    return fetch('/api/method/skillshub_core.skillshub_core.api.mark_attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    }).then(r => { if (!r.ok) throw new Error('API error'); return r.json(); });
  }

  function resetForm() {
    submitBtn.textContent = 'Submit Attendance';
    submitBtn.disabled    = false;
    scheduleSelect.value  = '';
    attendanceArea.style.display = 'none';
    studentList.innerHTML = '';
  }

  // ── 5. Offline queue ───────────────────────────────────────────────────
  function saveToQueue(payload) {
    attendanceQueue.push({ ...payload, _savedAt: new Date().toISOString() });
    localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
    updateSyncBanner();
  }

  function updateSyncBanner() {
    const n = attendanceQueue.length;
    if (n > 0) {
      syncBanner.style.display = 'flex';
      syncCount.textContent    = `${n} session${n !== 1 ? 's' : ''} pending sync`;
      syncBtn.textContent      = 'Sync Now';
      syncBtn.disabled         = false;
    } else {
      syncBanner.style.display = 'none';
    }
  }

  syncBtn.addEventListener('click', flushQueue);

  function flushQueue() {
    if (!attendanceQueue.length) return;
    syncBtn.textContent = 'Syncing…';
    syncBtn.disabled    = true;

    Promise.allSettled(attendanceQueue.map(p => submitToAPI(p)))
      .then(results => {
        let ok = 0;
        const remaining = [];
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') { ok++; }
          else { remaining.push(attendanceQueue[i]); }
        });
        attendanceQueue = remaining;
        localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
        updateSyncBanner();
        if (ok > 0) alert(`Synced ${ok} session${ok !== 1 ? 's' : ''} successfully.`);
        else        alert('Sync failed. Still offline.');
      });
  }

  // Auto-flush when the browser comes back online
  window.addEventListener('online', flushQueue);
});
