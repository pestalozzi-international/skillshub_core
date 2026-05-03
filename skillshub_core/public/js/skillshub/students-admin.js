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
      return { color: '#dc2626', label: 'Dropped', cssClass: 'ind-red' };
    if (student.status === 'Alumni' && student.graduated)
      return { color: '#2563eb', label: 'Graduated', cssClass: 'ind-blue' };
    if (student.status === 'Alumni')
      return { color: '#2563eb', label: 'Alumni', cssClass: 'ind-blue' };
    var hasAttach = enrolments.some(function (e) {
      return e.milestone === 'Attachment' && e.status === 'Enrolled';
    });
    if (hasAttach)
      return { color: '#d97706', label: 'Attached', cssClass: 'ind-orange' };
    return { color: '#059669', label: 'Active', cssClass: 'ind-green' };
  }

  function deriveContext(enrolments, schedMap) {
    if (!enrolments.length) return { cohort: null, programme: null };
    var sorted = enrolments.slice().sort(function (a, b) {
      var aA = a.status === 'Enrolled' ? 0 : 1, bA = b.status === 'Enrolled' ? 0 : 1;
      if (aA !== bA) return aA - bA;
      return (b.enrolment_date || '').localeCompare(a.enrolment_date || '');
    });
    var latest = sorted[0];
    var sched = schedMap[latest.programme_schedule] || {};
    return { cohort: sched.cohort || null, programme: latest.milestone || sched.skillshub_programme || null };
  }

  var allStudents = [], allEnrolments = [], allCohorts = [], allProgrammes = [], scheduleMap = {};

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('logout-btn').addEventListener('click', function () {
      fetch('/api/method/logout', { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' })
        .finally(function () { localStorage.clear(); window.location.replace('/skillshub/login'); });
    });
    ['f-cohort','f-programme','f-status','f-search'].forEach(function (id) {
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
  });

  function loadData() {
    Promise.allSettled([
      sf('/api/resource/SkillsHub Cohort?fields=["name","cohort_name"]&limit=50').then(function (d) { if (d) allCohorts = d.data || []; }),
      sf('/api/resource/SkillsHub Programme?fields=["name"]&limit=20').then(function (d) { if (d) allProgrammes = d.data || []; }),
      sf('/api/resource/SH Student?fields=["name","student_name","programme_path","status","graduated"]&limit=1000').then(function (d) { if (d) allStudents = d.data || []; }),
      sf('/api/resource/SH Student Enrolment?fields=["name","student","milestone","programme_schedule","feedback_submitted","attendance_rate","status","enrolment_date"]&limit=5000').then(function (d) { if (d) allEnrolments = d.data || []; }),
      sf('/api/resource/SH Programme Schedule?fields=["name","cohort","skillshub_programme"]&limit=500').then(function (d) { if (d && d.data) d.data.forEach(function (s) { scheduleMap[s.name] = s; }); })
    ]).then(function () {
      var cs = document.getElementById('f-cohort');
      allCohorts.forEach(function (c) { var o = document.createElement('option'); o.value = c.name; o.textContent = c.cohort_name || c.name; cs.appendChild(o); });
      var ps = document.getElementById('f-programme');
      allProgrammes.forEach(function (p) { var o = document.createElement('option'); o.value = p.name; o.textContent = p.name; ps.appendChild(o); });
      if (!allStudents.length) { document.getElementById('content').innerHTML = '<div class="state-box">No student records found.</div>'; return; }
      applyFilters();
    });
  }

  function applyFilters() {
    var cohort = document.getElementById('f-cohort').value;
    var prog = document.getElementById('f-programme').value;
    var statusVal = document.getElementById('f-status').value;
    var search = document.getElementById('f-search').value.toLowerCase();
    var pb = document.querySelector('.path-btn.active');
    var path = pb ? pb.dataset.path : '';

    var filtered = allStudents.filter(function (s) {
      if (path && s.programme_path !== path) return false;
      if (search && s.name.toLowerCase().indexOf(search) === -1 && (s.student_name||'').toLowerCase().indexOf(search) === -1) return false;
      var enrols = allEnrolments.filter(function (e) { return e.student === s.name; });
      var ctx = deriveContext(enrols, scheduleMap);
      if (cohort && ctx.cohort !== cohort) return false;
      if (prog) { var hasProg = enrols.some(function (e) { return e.milestone === prog; }); if (!hasProg) return false; }
      if (statusVal) { var ind = getIndicator(s, enrols); if (statusVal !== ind.label) return false; }
      return true;
    });
    renderTable(filtered);
  }

  function renderTable(students) {
    var content = document.getElementById('content');
    var footer = document.getElementById('footer');
    if (!students.length) { content.innerHTML = '<div class="state-box">No students match the selected filters.</div>'; footer.style.display = 'none'; return; }
    var html = '<div class="table-wrap"><table><thead><tr><th>Student ID</th><th>Full Name</th><th>Status</th><th>Cohort</th><th>Programme</th><th>Path</th><th>Attendance</th><th>Feedback</th><th></th></tr></thead><tbody>';
    students.forEach(function (s) {
      var enrols = allEnrolments.filter(function (e) { return e.student === s.name; });
      var ind = getIndicator(s, enrols);
      var ctx = deriveContext(enrols, scheduleMap);
      var active = enrols.filter(function (e) { return e.status === 'Enrolled'; });
      if (!active.length) active = enrols;
      var rates = active.map(function (e) { return e.attendance_rate || 0; });
      var avgAtt = rates.length ? Math.round(rates.reduce(function (a,b) { return a+b; },0)/rates.length) : 0;
      var attCls = avgAtt >= 80 ? 'att-high' : avgAtt >= 60 ? 'att-med' : 'att-low';
      var fbOk = enrols.some(function (e) { return e.feedback_submitted; });
      html += '<tr><td><span class="sid">' + esc(s.name) + '</span></td><td>' + esc(s.student_name||'—') + '</td>' +
        '<td><span class="status-dot ' + ind.cssClass + '"></span>' + esc(ind.label) + '</td>' +
        '<td>' + esc(ctx.cohort||'—') + '</td><td>' + esc(ctx.programme||'—') + '</td><td>' + esc(s.programme_path||'—') + '</td>' +
        '<td><span class="' + attCls + '">' + avgAtt + '%</span></td>' +
        '<td><span class="' + (fbOk?'fb-yes':'fb-no') + '">' + (fbOk?'✓ Done':'⚠ Pending') + '</span></td>' +
        '<td><a href="/skillshub/admin/student?id=' + encodeURIComponent(s.name) + '" class="view-btn">View</a></td></tr>';
    });
    html += '</tbody></table></div>';
    content.innerHTML = html;
    footer.textContent = students.length + ' student' + (students.length !== 1 ? 's' : '') + ' shown';
    footer.style.display = 'block';
  }
}());
