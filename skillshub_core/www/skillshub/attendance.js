import { applyPortalSettings } from '/skillshub/portal-settings.js';
applyPortalSettings();

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------
function clearAndRedirect() {
  localStorage.removeItem('sh_student_id');
  localStorage.removeItem('sh_role');
  localStorage.removeItem('sh_user');
  localStorage.removeItem('sh_display_user');
  window.location.replace('/skillshub/login');
}

// ---------------------------------------------------------------------------
// Route guard — teacher needs sh_user OR sh_role=teacher set
// ---------------------------------------------------------------------------
var userEmail = localStorage.getItem('sh_user');
var userRole  = localStorage.getItem('sh_role');
if (!userEmail && userRole !== 'teacher') {
  window.location.replace('/skillshub/login');
}

// ---------------------------------------------------------------------------
// Page logic
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {

  document.getElementById('sh-logout').addEventListener('click', function () {
    fetch('/api/method/logout', { method: 'POST', credentials: 'include' })
      .finally(function () { localStorage.clear(); window.location.replace('/skillshub/login'); });
  });

  var scheduleSelect = document.getElementById('schedule-select');
  var dateInput      = document.getElementById('attendance-date');
  var attendanceArea = document.getElementById('sh-attendance-area');
  var studentList    = document.getElementById('student-list');
  var submitBtn      = document.getElementById('submit-att-btn');
  var syncBanner     = document.getElementById('sync-banner');
  var syncCount      = document.getElementById('sync-count');
  var syncBtn        = document.getElementById('sync-btn');

  dateInput.valueAsDate = new Date();

  var attendanceQueue = JSON.parse(localStorage.getItem('sh_attendance_queue') || '[]');
  updateSyncBanner();

  // 1. Load active schedules
  fetch('/api/resource/SH Programme Schedule?filters=[["status","=","Active"]]&fields=["name","skillshub_programme","skillshub_course","cohort"]&limit=100',
    { headers: { 'Accept': 'application/json' }, credentials: 'include' })
  .then(function (r) {
    if (r.status === 401 || r.status === 403) { clearAndRedirect(); return null; }
    return r.json();
  })
  .then(function (data) {
    if (!data) return;
    (data.data || []).forEach(function (sch) {
      var opt = document.createElement('option');
      opt.value = sch.name;
      opt.textContent = [sch.skillshub_programme, sch.skillshub_course ? '- ' + sch.skillshub_course : '', sch.cohort ? '(' + sch.cohort + ')' : ''].filter(Boolean).join(' ');
      scheduleSelect.appendChild(opt);
    });
  })
  .catch(function () { console.warn('Could not load schedules'); });

  // 2. Load roster on schedule change
  scheduleSelect.addEventListener('change', function () {
    if (!this.value) { attendanceArea.style.display = 'none'; return; }
    studentList.innerHTML = '<p style="color:var(--color-slate-500)">Loading students...</p>';
    attendanceArea.style.display = 'block';
    submitBtn.disabled = true;

    fetch('/api/resource/SH Student Enrolment?filters=' + encodeURIComponent(
        JSON.stringify([['programme_schedule', '=', this.value], ['status', '=', 'Enrolled']])
      ) + '&fields=' + encodeURIComponent(JSON.stringify(['student', 'student_name'])) + '&limit=200',
      { headers: { 'Accept': 'application/json' }, credentials: 'include' })
    .then(function (r) {
      if (r.status === 401 || r.status === 403) { clearAndRedirect(); return null; }
      return r.json();
    })
    .then(function (data) {
      if (!data) return;
      if (data.data && data.data.length > 0) {
        renderRoster(data.data);
      } else {
        studentList.innerHTML = '<p style="color:var(--color-slate-500)">No students enrolled in this schedule.</p>';
      }
    })
    .catch(function () {
      studentList.innerHTML = '<p class="sh-alert-error">Error loading roster. Check connection.</p>';
    });
  });

  // 3. Render roster
  function renderRoster(students) {
    studentList.innerHTML = '';
    submitBtn.disabled = false;
    students.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'student-row';
      row.innerHTML =
        '<div><div class="student-info">' + s.student_name + '</div>' +
        '<div class="student-id">' + s.student + '</div></div>' +
        '<div class="toggle-group" data-student="' + s.student + '">' +
        '<button class="toggle-btn" data-status="Present">Present</button>' +
        '<button class="toggle-btn" data-status="Absent">Absent</button>' +
        '<button class="toggle-btn" data-status="Late">Late</button>' +
        '<button class="toggle-btn" data-status="Leave">Leave</button>' +
        '</div>';
      studentList.appendChild(row);
      row.querySelectorAll('.toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          row.querySelectorAll('.toggle-btn').forEach(function (b) { b.className = 'toggle-btn'; });
          this.classList.add(this.dataset.status.toLowerCase());
        });
      });
    });
  }

  // 4. Submit
  submitBtn.addEventListener('click', function () {
    var date     = dateInput.value;
    var schedule = scheduleSelect.value;
    if (!schedule || !date) { alert('Select a schedule and date.'); return; }

    var records   = [];
    var allMarked = true;
    studentList.querySelectorAll('.toggle-group').forEach(function (group) {
      var activeBtn = group.querySelector('.toggle-btn.present, .toggle-btn.absent, .toggle-btn.late, .toggle-btn.leave');
      if (!activeBtn) allMarked = false;
      records.push({ student: group.dataset.student, status: activeBtn ? activeBtn.dataset.status : 'Absent' });
    });

    if (!allMarked && !confirm('Some students are unmarked and will default to Absent. Continue?')) return;

    var payload = { schedule: schedule, date: date, attendance_records: records };
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled    = true;

    submitToAPI(payload)
      .then(function () { alert('Attendance submitted!'); resetForm(); })
      .catch(function () { saveToQueue(payload); alert('Saved offline. Will sync when online.'); resetForm(); });
  });

  function submitToAPI(payload) {
    return fetch('/api/method/skillshub_core.skillshub_core.api.mark_attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) { clearAndRedirect(); return null; }
      if (!r.ok) throw new Error('API error');
      return r.json();
    });
  }

  function resetForm() {
    submitBtn.textContent = 'Submit Attendance';
    submitBtn.disabled    = false;
    scheduleSelect.value  = '';
    attendanceArea.style.display = 'none';
    studentList.innerHTML = '';
  }

  // 5. Offline queue
  function saveToQueue(payload) {
    attendanceQueue.push(Object.assign({}, payload, { _savedAt: new Date().toISOString() }));
    localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
    updateSyncBanner();
  }

  function updateSyncBanner() {
    var n = attendanceQueue.length;
    if (n > 0) {
      syncBanner.style.display = 'flex';
      syncCount.textContent    = n + ' session' + (n !== 1 ? 's' : '') + ' pending sync';
      syncBtn.textContent      = 'Sync Now';
      syncBtn.disabled         = false;
    } else {
      syncBanner.style.display = 'none';
    }
  }

  syncBtn.addEventListener('click', flushQueue);

  function flushQueue() {
    if (!attendanceQueue.length) return;
    syncBtn.textContent = 'Syncing...';
    syncBtn.disabled    = true;
    Promise.allSettled(attendanceQueue.map(function (p) { return submitToAPI(p); }))
      .then(function (results) {
        var ok = 0;
        var remaining = [];
        results.forEach(function (r, i) {
          if (r.status === 'fulfilled') { ok++; } else { remaining.push(attendanceQueue[i]); }
        });
        attendanceQueue = remaining;
        localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
        updateSyncBanner();
        if (ok > 0) alert('Synced ' + ok + ' session' + (ok !== 1 ? 's' : '') + ' successfully.');
        else alert('Sync failed. Still offline.');
      });
  }

  window.addEventListener('online', flushQueue);
});
