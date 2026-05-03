import { applyPortalSettings } from '/skillshub/portal-settings.js';
applyPortalSettings();

function clearAndRedirect() {
  localStorage.removeItem('sh_student_id');
  localStorage.removeItem('sh_role');
  localStorage.removeItem('sh_user');
  localStorage.removeItem('sh_display_user');
  window.location.replace('/skillshub/login');
}

var userEmail = localStorage.getItem('sh_user');
var userRole  = localStorage.getItem('sh_role');
  window.location.replace('/skillshub/login');
}

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

  // Set today's date using local time (valueAsDate uses UTC which shows
  // yesterday in UTC+2 timezones like Zambia)
  var today = new Date();
  var yyyy  = today.getFullYear();
  var mm    = String(today.getMonth() + 1).padStart(2, '0');
  var dd    = String(today.getDate()).padStart(2, '0');
  dateInput.value = yyyy + '-' + mm + '-' + dd;

  var attendanceQueue = JSON.parse(localStorage.getItem('sh_attendance_queue') || '[]');
  updateSyncBanner();

  // 1. Load active schedules
  fetch('/api/resource/SH Programme Schedule?filters=[["status","=","Active"]]' +
        '&fields=["name","skillshub_programme","skillshub_course","cohort"]&limit=200',
    { headers: { 'Accept': 'application/json' }, credentials: 'include' })
  .then(function (r) {
    if (r.status === 401 || r.status === 403) { clearAndRedirect(); return null; }
    return r.json();
  })
  .then(function (data) {
    if (!data) return;
    var schedules = data.data || [];
    if (schedules.length === 0) {
      var opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = 'No active schedules found';
      scheduleSelect.appendChild(opt);
      return;
    }
    schedules.forEach(function (sch) {
      var opt = document.createElement('option');
      opt.value = sch.name;
      opt.textContent = [
        sch.skillshub_programme,
        sch.skillshub_course ? '- ' + sch.skillshub_course : '',
        sch.cohort ? '(' + sch.cohort + ')' : ''
      ].filter(Boolean).join(' ');
      scheduleSelect.appendChild(opt);
    });
  })
  .catch(function () {
    var opt = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'Error loading schedules';
    scheduleSelect.appendChild(opt);
  });

  // 2. Load roster on schedule change
  // Primary: SH Student Enrolment (status=Enrolled)
  // Fallback: SH Schedule Student child table on the schedule doc
  scheduleSelect.addEventListener('change', function () {
    var scheduleId = this.value;
    if (!scheduleId) { attendanceArea.style.display = 'none'; return; }
    studentList.innerHTML = '<p style="color:var(--color-slate-500)">Loading students...</p>';
    attendanceArea.style.display = 'block';
    submitBtn.disabled = true;

    fetch('/api/resource/SH Student Enrolment?filters=' + encodeURIComponent(
        JSON.stringify([['programme_schedule', '=', scheduleId], ['status', '=', 'Enrolled']])
      ) + '&fields=' + encodeURIComponent(JSON.stringify(['student', 'student_name'])) + '&limit=300',
      { headers: { 'Accept': 'application/json' }, credentials: 'include' })
    .then(function (r) {
      if (r.status === 401 || r.status === 403) { clearAndRedirect(); return null; }
      return r.json();
    })
    .then(function (data) {
      if (!data) return;
      var students = data.data || [];

      if (students.length > 0) {
        renderRoster(students);
        return;
      }

      // Fallback: fetch the schedule doc and read its enrolled_students child table
      return fetch('/api/resource/SH Programme Schedule/' + encodeURIComponent(scheduleId) +
          '?fields=["enrolled_students"]',
        { headers: { 'Accept': 'application/json' }, credentials: 'include' })
        .then(function (r2) {
          if (!r2.ok) return null;
          return r2.json();
        })
        .then(function (sData) {
          if (!sData || !sData.data) {
            studentList.innerHTML = '<p style="color:var(--color-slate-500)">No students enrolled in this schedule.</p>';
            return;
          }
          var roster = (sData.data.enrolled_students || []).filter(function (r) { return r.active !== 0; });
          if (roster.length > 0) {
            renderRoster(roster);
          } else {
            studentList.innerHTML = '<p style="color:var(--color-slate-500)">No students enrolled in this schedule.</p>';
          }
        });
    })
    .catch(function () {
      studentList.innerHTML = '<p class="sh-alert-error">Error loading roster. Check your connection.</p>';
    });
  });

  // 3. Render roster
  function renderRoster(students) {
    studentList.innerHTML = '';
    submitBtn.disabled = false;
    students.forEach(function (s) {
      var sid   = s.student || s.name;
      var sname = s.student_name || sid;
      var row = document.createElement('div');
      row.className = 'student-row';
      row.innerHTML =
        '<div><div class="student-info">' + sname + '</div>' +
        '<div class="student-id">' + sid + '</div></div>' +
        '<div class="toggle-group" data-student="' + sid + '">' +
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

  // 4. Submit attendance
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

    if (records.length === 0) { alert('No students to mark.'); return; }
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
      if (!r.ok) throw new Error('API error ' + r.status);
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
        var ok = 0, remaining = [];
        results.forEach(function (r, i) {
          if (r.status === 'fulfilled' && r.value) { ok++; }
          else { remaining.push(attendanceQueue[i]); }
        });
        attendanceQueue = remaining;
        localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
        updateSyncBanner();
        syncBtn.disabled = false;
        if (ok > 0) alert('Synced ' + ok + ' session' + (ok !== 1 ? 's' : '') + ' successfully.');
        else        alert('Sync failed. Still offline.');
      });
  }

  window.addEventListener('online', flushQueue);
});
