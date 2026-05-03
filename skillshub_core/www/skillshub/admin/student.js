import { applyPortalSettings } from '/skillshub/portal-settings.js';
applyPortalSettings();

// Route guard
if (localStorage.getItem('sh_role') !== 'admin') window.location.href = '/skillshub/login';

const params    = new URLSearchParams(window.location.search);
const studentId = params.get('id');
if (!studentId) window.location.href = '/skillshub/admin/students';

const sf = url =>
  fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logout-btn').addEventListener('click', () => {
    fetch('/api/method/logout', { method: 'POST', credentials: 'include' })
      .finally(() => { localStorage.clear(); window.location.href = '/skillshub/login'; });
  });

  Promise.all([
    sf(`/api/resource/SH Student/${encodeURIComponent(studentId)}`),
    sf(`/api/resource/SH Student Enrolment?filters=${encodeURIComponent(
      JSON.stringify([['student','=',studentId]])
    )}&fields=${encodeURIComponent(JSON.stringify([
      'name','milestone','course','status','attendance_rate',
      'feedback_submitted','baseline_submitted',
      'enrolment_date','completion_date','programme_path','programme_schedule'
    ]))}&order_by=enrolment_date+asc&limit=50`),
  ])
  .then(([sRes, eRes]) => render(sRes.data, eRes.data || []))
  .catch(() => {
    document.getElementById('content').innerHTML =
      '<div class="sh-card state-box" style="color:var(--color-red-700)">Error loading student. Please try again.</div>';
  });
});

function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function age(dob) {
  if (!dob) return '—';
  const d = new Date(dob), t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a;
}

function render(s, enrolments) {
  if (!s) {
    document.getElementById('content').innerHTML = '<div class="sh-card state-box">Student not found.</div>';
    return;
  }

  // ── Vertical Milestone Timeline ──────────────────────────────────────────
  const MILESTONE_ORDER = [
    'Mindset Camp', 'Soft Skills', 'Edulution',
    'Vocational Training', 'Attachment'
  ];

  // Merge enrolments into the canonical milestone order
  const enrolMap = {};
  enrolments.forEach(e => { enrolMap[e.milestone] = e; });

  // Determine reached milestones
  const reached = new Set(enrolments.map(e => e.milestone));
  // Path B skips Edulution
  const skipEd = (s.programme_path === 'Path B');

  const timelineItems = MILESTONE_ORDER
    .filter(m => !(skipEd && m === 'Edulution'))
    .map(m => {
      const e = enrolMap[m];
      if (!e) {
        // Not yet reached
        return `<div class="tl-item tl-future">
          <div class="tl-dot tl-dot-future"></div>
          <div class="tl-body">
            <div class="tl-title">${m}</div>
            <div class="tl-meta">Not yet started</div>
          </div>
        </div>`;
      }
      const att      = e.attendance_rate != null ? Math.round(e.attendance_rate) : null;
      const statusCls = e.status === 'Completed' ? 'tl-dot-done'
                      : e.status === 'Dropped'   ? 'tl-dot-drop'
                      : 'tl-dot-active';
      return `<div class="tl-item">
        <div class="tl-dot ${statusCls}"></div>
        <div class="tl-body">
          <div class="tl-title">${m}${e.course ? ' <span class="tl-course">· ' + e.course + '</span>' : ''}</div>
          <div class="tl-meta">${fmt(e.enrolment_date)}${e.completion_date ? ' → ' + fmt(e.completion_date) : ''}</div>
          <div class="tl-pills">
            <span class="pill pill-status pill-${(e.status||'').toLowerCase()}">${e.status || 'Enrolled'}</span>
            ${att !== null ? `<span class="pill pill-att">${att}% att.</span>` : ''}
            <span class="pill ${e.feedback_submitted ? 'pill-ok' : 'pill-pend'}">${e.feedback_submitted ? '✓ Feedback' : 'Feedback pending'}</span>
            ${e.baseline_submitted ? '<span class="pill pill-ok">✓ Baseline</span>' : ''}
          </div>
        </div>
      </div>`;
    }).join('');

  // ── Employment table ─────────────────────────────────────────────────────
  const emp = s.employment_history || [];
  const empHtml = emp.length === 0
    ? '<p style="color:var(--color-slate-500)">No employment history recorded.</p>'
    : `<table class="emp-table">
        <thead><tr><th>Employer</th><th>Role</th><th>Type</th><th>Start</th><th>End</th></tr></thead>
        <tbody>${emp.map(r => `<tr>
          <td>${r.employer_name || r.institution || '—'}</td>
          <td>${r.role || r.occupation || '—'}</td>
          <td>${r.employer_type || '—'}</td>
          <td>${fmt(r.start_date)}</td>
          <td>${r.end_date ? fmt(r.end_date) : 'Current'}</td>
        </tr>`).join('')}</tbody>
      </table>`;

  const badgeCls = s.status === 'Student' ? 'badge-student' : 'badge-alumni';

  document.getElementById('content').innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${s.student_name || '—'}</h2>
        <div class="sid">${s.name}</div>
        <div style="margin-top:.5rem">
          <span class="status-badge ${badgeCls}">${s.status || '—'}</span>
          ${s.programme_path ? `<span class="status-badge badge-path" style="margin-left:.5rem">${s.programme_path}</span>` : ''}
        </div>
      </div>
      <a href="/skillshub/admin/students" class="back-link">← All Students</a>
    </div>

    <div class="detail-grid">
      <div class="sidebar">
        <div class="sh-card">
          <h3 class="card-section-title">Demographics</h3>
          <div class="card-label">Student ID</div>  <div class="card-value">${s.name}</div>
          <div class="card-label">Date of Birth</div><div class="card-value">${fmt(s.date_of_birth)}</div>
          <div class="card-label">Age</div>          <div class="card-value">${age(s.date_of_birth)}</div>
          <div class="card-label">Gender</div>       <div class="card-value">${s.gender || '—'}</div>
          <div class="card-label">NRC</div>           <div class="card-value">${s.nrc_number || '—'}</div>
          <div class="card-label">Address</div>
          <div class="card-value">${[s.address_line_1, s.address_line_2, s.pincode].filter(Boolean).join(', ') || '—'}</div>
          <div class="card-label">Guardian</div>     <div class="card-value">${s.guardian_name || '—'}</div>
          <div class="card-label">Guardian Mobile</div><div class="card-value">${s.guardian_mobile_number || '—'}</div>
        </div>
        <div class="sh-card">
          <h3 class="card-section-title">Enrolment Status</h3>
          <div class="card-label">Cohort</div>      <div class="card-value">${s.current_cohort || '—'}</div>
          <div class="card-label">Programme</div>   <div class="card-value">${s.skillshub_programme || '—'}</div>
          <div class="card-label">Path</div>         <div class="card-value">${s.programme_path || '—'}</div>
          <div class="card-label">Enrolled</div>    <div class="card-value">${fmt(s.enrolment_date)}</div>
        </div>
      </div>

      <div class="right-col">
        <div class="sh-card">
          <h3 style="margin-top:0;border-bottom:1px solid var(--color-slate-200);padding-bottom:.75rem;margin-bottom:1.5rem">Milestone Timeline</h3>
          <div class="tl-container">${timelineItems}</div>
        </div>
        <div class="sh-card">
          <h3 style="margin-top:0;border-bottom:1px solid var(--color-slate-200);padding-bottom:.75rem;margin-bottom:1.25rem">Employment History</h3>
          ${empHtml}
        </div>
      </div>
    </div>
  `;
}
