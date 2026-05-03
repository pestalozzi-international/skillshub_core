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
// Route guard
// ---------------------------------------------------------------------------
if (localStorage.getItem('sh_role') !== 'admin') {
  window.location.replace('/skillshub/login');
}

var allStudents = [], allEnrolments = [], allCohorts = [], allProgrammes = [];

function sf(url) {
  return fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' })
    .then(function (r) {
      if (r.status === 401 || r.status === 403) { clearAndRedirect(); return null; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('logout-btn').addEventListener('click', function () {
    fetch('/api/method/logout', { method: 'POST', credentials: 'include' })
      .finally(function () { localStorage.clear(); window.location.replace('/skillshub/login'); });
  });

  ['f-cohort', 'f-programme', 'f-search'].forEach(function (id) {
    document.getElementById(id).addEventListener(id === 'f-search' ? 'input' : 'change', applyFilters);
  });
  document.querySelectorAll('.path-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.path-btn').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      applyFilters();
    });
  });

  loadData();
});

function loadData() {
  Promise.all([
    sf('/api/resource/SkillsHub Cohort?fields=["name","cohort_name"]&limit=50').then(function (d) { if (d) allCohorts    = d.data || []; }),
    sf('/api/resource/SkillsHub Programme?fields=["name"]&limit=20').then(function (d)            { if (d) allProgrammes = d.data || []; }),
    sf('/api/resource/SH Student?fields=["name","student_name","current_cohort","skillshub_programme","programme_path","status"]&limit=500').then(function (d) { if (d) allStudents = d.data || []; }),
    sf('/api/resource/SH Student Enrolment?fields=["student","milestone","feedback_submitted","attendance_rate","status"]&limit=2000').then(function (d) { if (d) allEnrolments = d.data || []; })
  ])
  .then(function () {
    var cs = document.getElementById('f-cohort');
    allCohorts.forEach(function (c) { var o = document.createElement('option'); o.value = c.name; o.textContent = c.cohort_name || c.name; cs.appendChild(o); });
    var ps = document.getElementById('f-programme');
    allProgrammes.forEach(function (p) { var o = document.createElement('option'); o.value = p.name; o.textContent = p.name; ps.appendChild(o); });
    applyFilters();
  })
  .catch(function () {
    document.getElementById('content').innerHTML = '<div class="state-box" style="color:var(--color-red-700)">Error loading data. Please refresh.</div>';
  });
}

function applyFilters() {
  var cohort = document.getElementById('f-cohort').value;
  var prog   = document.getElementById('f-programme').value;
  var search = document.getElementById('f-search').value.toLowerCase();
  var path   = document.querySelector('.path-btn.active').dataset.path;
  var filtered = allStudents.filter(function (s) {
    if (cohort && s.current_cohort      !== cohort) return false;
    if (prog   && s.skillshub_programme !== prog)   return false;
    if (path   && s.programme_path      !== path)   return false;
    if (search && !s.name.toLowerCase().includes(search) && !(s.student_name || '').toLowerCase().includes(search)) return false;
    return true;
  });
  renderTable(filtered);
}

function renderTable(students) {
  var content = document.getElementById('content');
  var footer  = document.getElementById('footer');
  if (!students.length) {
    content.innerHTML    = '<div class="state-box">No students match the selected filters.</div>';
    footer.style.display = 'none';
    return;
  }
  var html = '<div class="table-wrap"><table><thead><tr>' +
    '<th>Student ID</th><th>Full Name</th><th>Cohort</th><th>Programme</th>' +
    '<th>Path</th><th>Attendance</th><th>Feedback</th><th></th></tr></thead><tbody>';
  students.forEach(function (s) {
    var enrols = allEnrolments.filter(function (e) { return e.student === s.name; });
    var active = enrols.filter(function (e) { return e.status === 'Enrolled'; });
    var rates  = active.map(function (e) { return e.attendance_rate || 0; });
    var avgAtt = rates.length ? Math.round(rates.reduce(function (a, b) { return a + b; }, 0) / rates.length) : 0;
    var attCls = avgAtt >= 80 ? 'att-high' : avgAtt >= 60 ? 'att-med' : 'att-low';
    var fbOk   = enrols.some(function (e) { return e.feedback_submitted; });
    html += '<tr>' +
      '<td><span class="sid">' + s.name + '</span></td>' +
      '<td>' + (s.student_name || '—') + '</td>' +
      '<td>' + (s.current_cohort || '—') + '</td>' +
      '<td>' + (s.skillshub_programme || '—') + '</td>' +
      '<td>' + (s.programme_path || '—') + '</td>' +
      '<td><span class="' + attCls + '">' + avgAtt + '%</span></td>' +
      '<td><span class="' + (fbOk ? 'fb-yes' : 'fb-no') + '">' + (fbOk ? '✓ Done' : '⚠ Pending') + '</span></td>' +
      '<td><a href="/skillshub/admin/student?id=' + encodeURIComponent(s.name) + '" class="view-btn">View</a></td>' +
      '</tr>';
  });
  html += '</tbody></table></div>';
  content.innerHTML    = html;
  footer.textContent   = students.length + ' student' + (students.length !== 1 ? 's' : '') + ' shown';
  footer.style.display = 'block';
}
