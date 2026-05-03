(function () {
  'use strict';

  function getFrappeHeaders() {
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (window.frappe && frappe.csrf_token && frappe.csrf_token !== 'None' && !frappe.csrf_token.includes('{{')) {
      headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
  }

  function clearAndRedirect() {
    localStorage.removeItem('sh_student_id'); localStorage.removeItem('sh_role');
    localStorage.removeItem('sh_user'); localStorage.removeItem('sh_display_user');
    window.location.replace('/skillshub/login');
  }

  function sf(url) {
    return fetch(url, { headers: getFrappeHeaders(), credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { clearAndRedirect(); return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div'); d.textContent = s; return d.innerHTML;
  }

  function getIndicator(student, enrolments) {
    if (student.status === 'Dropped')
      return { label: 'Dropped', cssClass: 'sh-badge-dropped' };
    if (student.status === 'Alumni' && student.graduated)
      return { label: 'Graduated', cssClass: 'sh-badge-completed' };
    if (student.status === 'Alumni')
      return { label: 'Alumni', cssClass: 'sh-badge-info' };
    var hasAttach = enrolments.some(function (e) {
      return e.milestone === 'Attachment' && e.status === 'Enrolled';
    });
    if (hasAttach)
      return { label: 'Attached', cssClass: 'sh-badge-warning' };
    return { label: 'Active', cssClass: 'sh-badge-success' };
  }

  function deriveContext(enrolments, schedMap) {
    if (!enrolments.length) return { cohort: null, milestone: null, academic_year: null, course: null };
    var sorted = enrolments.slice().sort(function (a, b) {
      var aA = a.status === 'Enrolled' ? 0 : 1, bA = b.status === 'Enrolled' ? 0 : 1;
      if (aA !== bA) return aA - bA;
      return (b.enrolment_date || '').localeCompare(a.enrolment_date || '');
    });
    var latest = sorted[0];
    var sched = schedMap[latest.programme_schedule] || {};
    return { 
      cohort: sched.cohort || latest.cohort || null, 
      milestone: latest.milestone || null,
      academic_year: latest.academic_year || sched.academic_year || null,
      course: latest.course || sched.skillshub_course || null
    };
  }

  var allStudents = [], allEnrolments = [], allYears = [], allCourses = [], scheduleMap = {};

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('logout-btn').addEventListener('click', function () {
      fetch('/api/method/logout', { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' })
        .finally(function () { localStorage.clear(); window.location.replace('/skillshub/login'); });
    });
    ['f-academic-year','f-course','f-status','f-search'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener(id === 'f-search' ? 'input' : 'change', applyFilters);
    });
    document.querySelectorAll('.path-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.path-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active'); applyFilters();
      });
    });
    loadData();

    // Global toggle handler
    document.addEventListener('click', function(e) {
      if (e.target.closest('.toggle-history')) {
        var btn = e.target.closest('.toggle-history');
        var studentId = btn.dataset.student;
        var historyRow = document.getElementById('history-' + studentId);
        if (historyRow) {
          var isHidden = historyRow.style.display === 'none';
          historyRow.style.display = isHidden ? 'table-row' : 'none';
          btn.textContent = isHidden ? 'Hide History' : 'Show History';
        }
      }
    });
  });

  function loadData() {
    console.log('[SkillsHub] Loading admin directory data...');
    Promise.allSettled([
      sf('/api/resource/SH Academic Year?fields=["name"]&limit=50').then(function (d) { if (d) allYears = d.data || []; }),
      sf('/api/resource/SkillsHub Course?fields=["name"]&limit=100').then(function (d) { if (d) allCourses = d.data || []; }),
      sf('/api/resource/SH Student?fields=["name","student_name","programme_path","status","graduated"]&limit=1000').then(function (d) { if (d) allStudents = d.data || []; }),
      sf('/api/resource/SH Student Enrolment?fields=["name","student","milestone","programme_schedule","feedback_submitted","attendance_rate","status","enrolment_date","academic_year","course"]&limit=5000').then(function (d) { if (d) allEnrolments = d.data || []; }),
      sf('/api/resource/SH Programme Schedule?fields=["name","cohort","skillshub_programme","academic_year","skillshub_course"]&limit=500').then(function (d) { if (d && d.data) d.data.forEach(function (s) { scheduleMap[s.name] = s; }); })
    ]).then(function (results) {
      results.forEach(function(r, i) {
        if (r.status === 'rejected') console.warn('[SkillsHub] Data fetch #' + i + ' failed:', r.reason);
      });
      
      var ay = document.getElementById('f-academic-year');
      if (ay) allYears.forEach(function (y) { var o = document.createElement('option'); o.value = y.name; o.textContent = y.name; ay.appendChild(o); });
      var crs = document.getElementById('f-course');
      if (crs) allCourses.forEach(function (c) { var o = document.createElement('option'); o.value = c.name; o.textContent = c.name; crs.appendChild(o); });
      
      console.log('[SkillsHub] Data loaded. Students:', allStudents.length);
      if (!allStudents.length) { 
        document.getElementById('content').innerHTML = '<div class="state-box">No student records found.</div>'; 
        return; 
      }
      applyFilters();
    });
  }

  function applyFilters() {
    var ayEl = document.getElementById('f-academic-year');
    var courseEl = document.getElementById('f-course');
    var statusEl = document.getElementById('f-status');
    var searchEl = document.getElementById('f-search');
    
    var statusVal = statusEl ? statusEl.value : '';
    var search = searchEl ? searchEl.value.toLowerCase() : '';
    
    var pb = document.querySelector('.path-btn.active');
    var path = pb ? pb.dataset.path : '';

    var filtered = allStudents.filter(function (s) {
      if (path && s.programme_path !== path) return false;
      if (search && s.name.toLowerCase().indexOf(search) === -1 && (s.student_name||'').toLowerCase().indexOf(search) === -1) return false;
      
      var enrols = allEnrolments.filter(function (e) { return e.student === s.name; });
      var ctx = deriveContext(enrols, scheduleMap);
      
      var yearVal = ayEl ? ayEl.value : '';
      var courseVal = courseEl ? courseEl.value : '';

      if (yearVal && ctx.academic_year !== yearVal) return false;
      if (courseVal && ctx.course !== courseVal) return false;
      
      if (statusVal) { var ind = getIndicator(s, enrols); if (statusVal !== ind.label) return false; }
      return true;
    });
    renderTable(filtered);
  }

  function renderTable(students) {
    var content = document.getElementById('content');
    var footer = document.getElementById('footer');
    if (!students.length) { content.innerHTML = '<div class="state-box">No students match the selected filters.</div>'; footer.style.display = 'none'; return; }
    
    var html = '<div class="table-wrap"><table class="student-table"><thead><tr><th>Student</th><th>Status</th><th>Latest Context</th><th>Path</th><th>Stats</th><th>Actions</th></tr></thead><tbody>';
    
    students.forEach(function (s) {
      var enrols = allEnrolments.filter(function (e) { return e.student === s.name; });
      var ind = getIndicator(s, enrols);
      var ctx = deriveContext(enrols, scheduleMap);
      
      var active = enrols.filter(function (e) { return e.status === 'Enrolled'; });
      if (!active.length) active = enrols;
      var avgAtt = active.length ? Math.round(active.reduce(function (a,b) { return a + (b.attendance_rate||0); }, 0) / active.length) : 0;
      var fbCount = enrols.filter(function (e) { return e.feedback_submitted; }).length;

      html += '<tr class="student-row">' +
        '<td>' +
          '<div style="font-weight:600;color:var(--color-slate-900)">' + esc(s.student_name||'—') + '</div>' +
          '<div class="sid" style="font-size:0.75rem">' + esc(s.name) + '</div>' +
        '</td>' +
        '<td><span class="sh-badge ' + ind.cssClass + '">' + esc(ind.label) + '</span></td>' +
        '<td>' +
          '<div style="font-size:0.875rem; font-weight:600; color:var(--color-teal-700)">' + esc(ctx.course||'No Course') + '</div>' +
          '<div style="font-size:0.75rem; color:var(--color-slate-500)">' + esc(ctx.academic_year||'No Year') + '</div>' +
        '</td>' +
        '<td><span class="sh-badge sh-badge-info">' + esc(s.programme_path||'—') + '</span></td>' +
        '<td>' +
          '<div style="font-size:0.875rem">' + avgAtt + '% Att.</div>' +
          '<div style="font-size:0.75rem;color:' + (fbCount === enrols.length ? 'var(--color-emerald-700)' : 'var(--color-amber-700)') + '">' + fbCount + '/' + enrols.length + ' Feedback</div>' +
        '</td>' +
        '<td>' +
          '<div style="display:flex;gap:0.5rem">' +
            '<a href="/skillshub/admin/student?id=' + encodeURIComponent(s.name) + '" class="sh-btn-secondary" style="padding:0.4rem 0.8rem;font-size:0.875rem">Profile</a>' +
            '<button class="sh-btn-secondary toggle-history" data-student="' + s.name + '" style="padding:0.4rem 0.8rem;font-size:0.875rem">History</button>' +
          '</div>' +
        '</td>' +
      '</tr>';

      // History Row (Hidden by default)
      html += '<tr id="history-' + s.name + '" class="history-row" style="display:none;background:var(--color-slate-50)">' +
        '<td colspan="6" style="padding:1.5rem">' +
          '<div style="font-weight:600;margin-bottom:1rem;font-size:0.875rem;color:var(--color-slate-700)">Enrolment History</div>' +
          '<table style="width:100%;background:white;border-radius:0.75rem;border-collapse:collapse;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">' +
            '<thead style="background:var(--color-slate-100)">' +
              '<tr><th style="padding:0.75rem;text-align:left;font-size:0.75rem">Milestone</th><th style="padding:0.75rem;text-align:left;font-size:0.75rem">Status</th><th style="padding:0.75rem;text-align:left;font-size:0.75rem">Date</th><th style="padding:0.75rem;text-align:left;font-size:0.75rem">Feedback</th></tr>' +
            '</thead>' +
            '<tbody>' +
              enrols.map(function(e) {
                return '<tr>' +
                  '<td style="padding:0.75rem;border-top:1px solid var(--color-slate-100)">' + esc(e.milestone) + '</td>' +
                  '<td style="padding:0.75rem;border-top:1px solid var(--color-slate-100)"><span class="sh-badge ' + (e.status === 'Completed' ? 'sh-badge-success' : e.status === 'Dropped' ? 'sh-badge-dropped' : 'sh-badge-enrolled') + '" style="font-size:0.7rem">' + (e.status||'Enrolled') + '</span></td>' +
                  '<td style="padding:0.75rem;border-top:1px solid var(--color-slate-100);font-size:0.75rem">' + (e.enrolment_date||'—') + '</td>' +
                  '<td style="padding:0.75rem;border-top:1px solid var(--color-slate-100)">' +
                    (e.feedback_submitted ? '<span style="color:var(--color-emerald-700);font-size:0.75rem">✓ Submitted</span>' : '<span style="color:var(--color-amber-700);font-size:0.75rem">⚠ Pending</span>') +
                  '</td>' +
                '</tr>';
              }).join('') +
              (!enrols.length ? '<tr><td colspan="4" style="padding:1rem;text-align:center;color:var(--color-slate-500)">No enrolment history found.</td></tr>' : '') +
            '</tbody>' +
          '</table>' +
        '</td>' +
      '</tr>';
    });
    
    html += '</tbody></table></div>';
    content.innerHTML = html;
    if (footer) {
      footer.textContent = students.length + ' student' + (students.length !== 1 ? 's' : '') + ' shown';
      footer.style.display = 'block';
    }
  }
}());
