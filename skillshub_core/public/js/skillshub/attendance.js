(function () {
  'use strict';

  function getFrappeHeaders() {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (window.frappe && frappe.csrf_token && frappe.csrf_token !== 'None' && !frappe.csrf_token.includes('{{')) {
        headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
}

  function clearAndRedirect() {
    localStorage.removeItem('sh_student_id');
    localStorage.removeItem('sh_role');
    localStorage.removeItem('sh_user');
    localStorage.removeItem('sh_display_user');
    window.location.replace('/skillshub/login');
  }

  // Session is validated server-side via Frappe cookies.
  // No synchronous localStorage guard — SSO users won't have these keys.

  document.addEventListener('DOMContentLoaded', function () {
    // Navigation & Role UI
    var role = localStorage.getItem('sh_role');
    if (role === 'admin' || role === 'teacher') {
      var desk = document.getElementById('nav-desk'); if (desk) desk.style.display = 'block';
      var students = document.getElementById('nav-students'); if (students) students.style.display = 'block';
    } else {
      var profile = document.getElementById('nav-profile'); if (profile) profile.style.display = 'block';
      // If student, change title/subtitle
      var title = document.querySelector('.sh-page-header h1'); if (title) title.textContent = 'My Attendance';
      var sub = document.getElementById('att-subtitle'); if (sub) sub.textContent = 'View your recent attendance history';
      // Hide marking controls for students
      var area = document.getElementById('sh-attendance-area'); if (area) area.style.display = 'none';
      var markCard = document.querySelector('.sh-card:not(#sh-attendance-area)'); if (markCard) markCard.style.display = 'none';
    }

    document.getElementById('sh-logout').addEventListener('click', function () {
      fetch('/api/method/logout', { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' })
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

    // Set today's date in local time
    var today = new Date();
    var yyyy  = today.getFullYear();
    var mm    = String(today.getMonth() + 1).padStart(2, '0');
    var dd    = String(today.getDate()).padStart(2, '0');
    dateInput.value = yyyy + '-' + mm + '-' + dd;

    var attendanceQueue = JSON.parse(localStorage.getItem('sh_attendance_queue') || '[]');
    updateSyncBanner();

    // Load schedules
    fetch('/api/resource/SH Programme Schedule?filters=[["status","=","Active"]]&fields=["name","skillshub_programme","skillshub_course","cohort"]&limit=200',
      { headers: getFrappeHeaders(), credentials: 'include' })
    .then(function (r) {
      if (r.status === 401) { clearAndRedirect(); return null; }
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
    .catch(function () {});

    scheduleSelect.addEventListener('change', function () {
      var scheduleId = this.value;
      if (!scheduleId) { attendanceArea.style.display = 'none'; return; }
      studentList.innerHTML = '<p style="color:var(--color-slate-500)">Loading students...</p>';
      attendanceArea.style.display = 'block';
      submitBtn.disabled = true;

      fetch('/api/resource/SH Student Enrolment?filters=' +
          encodeURIComponent(JSON.stringify([['programme_schedule','=',scheduleId],['status','=','Enrolled']])) +
          '&fields=' + encodeURIComponent(JSON.stringify(['student','student_name'])) + '&limit=300',
        { headers: getFrappeHeaders(), credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { clearAndRedirect(); return null; }
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        var students = data.data || [];
        if (students.length > 0) { renderRoster(students); return; }
        // Fallback: schedule doc's enrolled_students child table
        return fetch('/api/resource/SH Programme Schedule/' + encodeURIComponent(scheduleId) + '?fields=["enrolled_students"]',
          { headers: getFrappeHeaders(), credentials: 'include' })
          .then(function (r2) { return r2.ok ? r2.json() : null; })
          .then(function (sData) {
            if (!sData || !sData.data) { studentList.innerHTML = '<p style="color:var(--color-slate-500)">No students enrolled.</p>'; return; }
            var roster = (sData.data.enrolled_students || []).filter(function (r) { return r.active !== 0; });
            if (roster.length > 0) { renderRoster(roster); }
            else { studentList.innerHTML = '<p style="color:var(--color-slate-500)">No students enrolled in this schedule.</p>'; }
          });
      })
      .catch(function () {
        studentList.innerHTML = '<p class="sh-alert-error">Error loading roster.</p>';
      });
    });

    function renderRoster(students) {
      studentList.innerHTML = '';
      submitBtn.disabled = false;
      students.forEach(function (s) {
        var sid   = s.student || s.name;
        var sname = s.student_name || sid;
        var row   = document.createElement('div');
        row.className = 'student-row';
        row.innerHTML =
          '<div><div class="student-info">' + sname + '</div><div class="student-id">' + sid + '</div></div>' +
          '<div class="toggle-group" data-student="' + sid + '">' +
          '<button class="toggle-btn" data-status="Present">Present</button>' +
          '<button class="toggle-btn" data-status="Absent">Absent</button>' +
          '<button class="toggle-btn" data-status="Late">Late</button>' +
          '<button class="toggle-btn" data-status="Leave">Leave</button></div>';
        studentList.appendChild(row);
        row.querySelectorAll('.toggle-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            row.querySelectorAll('.toggle-btn').forEach(function (b) { b.className = 'toggle-btn'; });
            this.classList.add(this.dataset.status.toLowerCase());
          });
        });
      });
    }

    submitBtn.addEventListener('click', function () {
      var date     = dateInput.value;
      var schedule = scheduleSelect.value;
      if (!schedule || !date) { alert('Select a schedule and date.'); return; }
      var records = [], allMarked = true;
      studentList.querySelectorAll('.toggle-group').forEach(function (g) {
        var ab = g.querySelector('.toggle-btn.present,.toggle-btn.absent,.toggle-btn.late,.toggle-btn.leave');
        if (!ab) allMarked = false;
        records.push({ student: g.dataset.student, status: ab ? ab.dataset.status : 'Absent' });
      });
      if (records.length === 0) { alert('No students to mark.'); return; }
      if (!allMarked && !confirm('Some students are unmarked and will default to Absent. Continue?')) return;
      var payload = { schedule: schedule, date: date, attendance_records: records };
      submitBtn.textContent = 'Submitting...'; submitBtn.disabled = true;
      submitToAPI(payload)
        .then(function () { alert('Attendance submitted!'); resetForm(); })
        .catch(function () { saveToQueue(payload); alert('Saved offline.'); resetForm(); });
    });

    function submitToAPI(payload) {
      return fetch('/api/method/skillshub_core.skillshub_core.api.mark_attendance', {
        method: 'POST',
        headers: getFrappeHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (r.status === 401) { clearAndRedirect(); return null; }
        if (!r.ok) throw new Error('API error');
        return r.json();
      });
    }

    function resetForm() {
      submitBtn.textContent = 'Submit Attendance'; submitBtn.disabled = false;
      scheduleSelect.value = ''; attendanceArea.style.display = 'none'; studentList.innerHTML = '';
    }

    function saveToQueue(payload) {
      var p = JSON.parse(JSON.stringify(payload));
      p._savedAt = new Date().toISOString();
      attendanceQueue.push(p);
      localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
      updateSyncBanner();
    }

    function updateSyncBanner() {
      var n = attendanceQueue.length;
      if (n > 0) {
        syncBanner.style.display = 'flex';
        syncCount.textContent = n + ' session' + (n !== 1 ? 's' : '') + ' pending sync';
        syncBtn.textContent = 'Sync Now'; syncBtn.disabled = false;
      } else { syncBanner.style.display = 'none'; }
    }

    syncBtn.addEventListener('click', flushQueue);
    window.addEventListener('online', flushQueue);

    function flushQueue() {
      if (!attendanceQueue.length) return;
      syncBtn.textContent = 'Syncing...'; syncBtn.disabled = true;
      Promise.allSettled(attendanceQueue.map(submitToAPI)).then(function (results) {
        var ok = 0, remaining = [];
        results.forEach(function (r, i) { if (r.status === 'fulfilled' && r.value) ok++; else remaining.push(attendanceQueue[i]); });
        attendanceQueue = remaining;
        localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
        updateSyncBanner(); syncBtn.disabled = false;
        if (ok > 0) alert('Synced ' + ok + ' session' + (ok !== 1 ? 's' : '') + '.');
        else alert('Sync failed. Still offline.');
      });
    }
  });
}());
