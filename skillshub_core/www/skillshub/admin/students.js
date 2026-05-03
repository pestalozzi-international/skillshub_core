import { applyPortalSettings } from '/skillshub/portal-settings.js';
applyPortalSettings();

// Route guard
if (localStorage.getItem('sh_role') !== 'admin') window.location.href = '/skillshub/login';

let allStudents = [], allEnrolments = [], allCohorts = [], allProgrammes = [];

const sf = url =>
  fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logout-btn').addEventListener('click', () => {
    fetch('/api/method/logout', { method: 'POST', credentials: 'include' })
      .finally(() => { localStorage.clear(); window.location.href = '/skillshub/login'; });
  });

  ['f-cohort', 'f-programme', 'f-search'].forEach(id =>
    document.getElementById(id).addEventListener(
      id === 'f-search' ? 'input' : 'change', applyFilters
    )
  );
  document.querySelectorAll('.path-btn').forEach(btn =>
    btn.addEventListener('click', function () {
      document.querySelectorAll('.path-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      applyFilters();
    })
  );

  loadData();
});

function loadData() {
  Promise.all([
    sf('/api/resource/SkillsHub Cohort?fields=["name","cohort_name"]&limit=50').then(d => { allCohorts    = d.data || []; }),
    sf('/api/resource/SkillsHub Programme?fields=["name"]&limit=20').then(d          => { allProgrammes = d.data || []; }),
    sf('/api/resource/SH Student?fields=["name","student_name","current_cohort","skillshub_programme","programme_path","status"]&limit=500').then(d => { allStudents = d.data || []; }),
    sf('/api/resource/SH Student Enrolment?fields=["student","milestone","feedback_submitted","attendance_rate","status"]&limit=2000').then(d => { allEnrolments = d.data || []; }),
  ])
  .then(() => {
    const cs = document.getElementById('f-cohort');
    allCohorts.forEach(c => { const o = document.createElement('option'); o.value = c.name; o.textContent = c.cohort_name || c.name; cs.appendChild(o); });
    const ps = document.getElementById('f-programme');
    allProgrammes.forEach(p => { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; ps.appendChild(o); });
    applyFilters();
  })
  .catch(() => {
    document.getElementById('content').innerHTML = '<div class="state-box" style="color:var(--color-red-700)">Error loading data. Please refresh.</div>';
  });
}

function applyFilters() {
  const cohort  = document.getElementById('f-cohort').value;
  const prog    = document.getElementById('f-programme').value;
  const search  = document.getElementById('f-search').value.toLowerCase();
  const path    = document.querySelector('.path-btn.active').dataset.path;
  const filtered = allStudents.filter(s => {
    if (cohort  && s.current_cohort       !== cohort)  return false;
    if (prog    && s.skillshub_programme  !== prog)    return false;
    if (path    && s.programme_path       !== path)    return false;
    if (search  && !s.name.toLowerCase().includes(search) &&
                   !(s.student_name||'').toLowerCase().includes(search)) return false;
    return true;
  });
  renderTable(filtered);
}

function renderTable(students) {
  const content = document.getElementById('content');
  const footer  = document.getElementById('footer');
  if (!students.length) {
    content.innerHTML    = '<div class="state-box">No students match the selected filters.</div>';
    footer.style.display = 'none';
    return;
  }
  let html = '<div class="table-wrap"><table><thead><tr>' +
    '<th>Student ID</th><th>Full Name</th><th>Cohort</th><th>Programme</th>' +
    '<th>Path</th><th>Attendance</th><th>Feedback</th><th></th></tr></thead><tbody>';
  students.forEach(s => {
    const enrols  = allEnrolments.filter(e => e.student === s.name);
    const active  = enrols.filter(e => e.status === 'Enrolled');
    const rates   = active.map(e => e.attendance_rate || 0);
    const avgAtt  = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    const attCls  = avgAtt >= 80 ? 'att-high' : avgAtt >= 60 ? 'att-med' : 'att-low';
    const fbOk    = enrols.some(e => e.feedback_submitted);
    html += `<tr>
      <td><span class="sid">${s.name}</span></td>
      <td>${s.student_name || '—'}</td>
      <td>${s.current_cohort || '—'}</td>
      <td>${s.skillshub_programme || '—'}</td>
      <td>${s.programme_path || '—'}</td>
      <td><span class="${attCls}">${avgAtt}%</span></td>
      <td><span class="${fbOk ? 'fb-yes' : 'fb-no'}">${fbOk ? '✓ Done' : '⚠ Pending'}</span></td>
      <td><a href="/skillshub/admin/student?id=${encodeURIComponent(s.name)}" class="view-btn">View</a></td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  content.innerHTML    = html;
  footer.textContent   = `${students.length} student${students.length !== 1 ? 's' : ''} shown`;
  footer.style.display = 'block';
}
