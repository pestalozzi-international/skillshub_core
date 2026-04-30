// Route guard
if (localStorage.getItem('sh_role') !== 'admin') window.location.href = '/skillshub/login';

const urlParams = new URLSearchParams(window.location.search);
const studentId = urlParams.get('id');
if (!studentId) window.location.href = '/skillshub/admin/students';

const sf = (url) => fetch(url,{headers:{'Accept':'application/json'},credentials:'include'}).then(r=>r.json());

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('logout-btn').addEventListener('click', ()=>{
    fetch('/api/method/logout',{method:'POST',credentials:'include'}).finally(()=>{
      localStorage.clear(); window.location.href='/skillshub/login';
    });
  });

  Promise.all([
    sf(`/api/resource/SH Student/${encodeURIComponent(studentId)}`),
    sf(`/api/resource/SH Student Enrolment?filters=[["student","=","${studentId}"]]&fields=["name","milestone","course","status","attendance_rate","feedback_submitted","baseline_submitted","enrolment_date","completion_date","programme_path"]&orderby=enrolment_date+asc`)
  ])
  .then(([sRes, eRes]) => render(sRes.data, eRes.data || []))
  .catch(() => {
    document.getElementById('content').innerHTML = '<div class="sh-card state-box" style="color:var(--color-red-700)">Error loading student. Please try again.</div>';
  });
});

function fmt(d){ if(!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }
function age(dob){ if(!dob) return '—'; const d=new Date(dob),t=new Date(); let a=t.getFullYear()-d.getFullYear(); if(t.getMonth()<d.getMonth()||(t.getMonth()===d.getMonth()&&t.getDate()<d.getDate())) a--; return a; }

function render(s, enrolments){
  if(!s){ document.getElementById('content').innerHTML='<div class="sh-card state-box">Student not found.</div>'; return; }

  const badgeClass = s.status==='Student' ? 'badge-student' : 'badge-alumni';

  // Timeline
  const timelineHtml = enrolments.length===0
    ? '<p style="color:var(--color-slate-500)">No enrolments found.</p>'
    : '<div class="timeline">' + enrolments.map(e=>{
        const statusClass = e.status==='Completed'?'completed':e.status==='Dropped'?'dropped':'';
        const att = e.attendance_rate!=null ? Math.round(e.attendance_rate) : 0;
        return `<div class="tl-item ${statusClass}">
          <div class="tl-title">${e.milestone||'Milestone'}${e.course?' · '+e.course:''}</div>
          <div class="tl-meta">${fmt(e.enrolment_date)}${e.completion_date?' → '+fmt(e.completion_date):''}</div>
          <div class="tl-pills">
            <span class="pill pill-att">${e.status||'Enrolled'}</span>
            <span class="pill pill-att">${att}% attendance</span>
            <span class="pill ${e.feedback_submitted?'pill-fb-ok':'pill-fb-no'}">${e.feedback_submitted?'✓ Feedback':'Feedback pending'}</span>
            ${e.baseline_submitted?'<span class="pill pill-fb-ok">✓ Baseline</span>':''}
          </div>
        </div>`;
      }).join('') + '</div>';

  // Employment
  const emp = s.employment_history || [];
  const empHtml = emp.length===0 ? '<p style="color:var(--color-slate-500)">No employment history recorded.</p>' :
    `<table class="emp-table"><thead><tr><th>Employer</th><th>Role</th><th>Start</th><th>End</th><th>Type</th></tr></thead><tbody>`+
    emp.map(r=>`<tr><td>${r.employer_name||r.employer||'—'}</td><td>${r.role||'—'}</td><td>${fmt(r.start_date)}</td><td>${r.end_date?fmt(r.end_date):'Current'}</td><td>${r.employer_type||'—'}</td></tr>`).join('')+
    '</tbody></table>';

  document.getElementById('content').innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${s.student_name||'—'}</h2>
        <div class="sid">${s.name}</div>
      </div>
      <span class="status-badge ${badgeClass}">${s.status||'—'}</span>
    </div>
    <div class="detail-grid">
      <div class="sidebar">
        <div class="sh-card">
          <h3 style="margin-top:0;font-size:.9rem;border-bottom:1px solid var(--color-slate-200);padding-bottom:.75rem;margin-bottom:1rem;">Demographics</h3>
          <div class="card-label">Student ID</div><div class="card-value">${s.name}</div>
          <div class="card-label">Date of Birth</div><div class="card-value">${fmt(s.date_of_birth)}</div>
          <div class="card-label">Age</div><div class="card-value">${age(s.date_of_birth)}</div>
          <div class="card-label">Gender</div><div class="card-value">${s.gender||'—'}</div>
          <div class="card-label">NRC</div><div class="card-value">${s.nrc_number||'—'}</div>
          <div class="card-label">Address</div>
          <div class="card-value">${[s.address_line_1,s.address_line_2,s.pincode].filter(Boolean).join(', ')||'—'}</div>
          <div class="card-label">Guardian</div><div class="card-value">${s.guardian_name||'—'}</div>
          <div class="card-label">Guardian Mobile</div><div class="card-value">${s.guardian_mobile_number||'—'}</div>
        </div>
        <div class="sh-card">
          <h3 style="margin-top:0;font-size:.9rem;border-bottom:1px solid var(--color-slate-200);padding-bottom:.75rem;margin-bottom:1rem;">Current Status</h3>
          <div class="card-label">Cohort</div><div class="card-value">${s.current_cohort||'—'}</div>
          <div class="card-label">Programme</div><div class="card-value">${s.skillshub_programme||'—'}</div>
          <div class="card-label">Path</div><div class="card-value">${s.programme_path||'—'}</div>
          <div class="card-label">Enrolment Date</div><div class="card-value">${fmt(s.enrolment_date)}</div>
        </div>
      </div>
      <div class="right-col">
        <div class="sh-card">
          <h3 style="margin-top:0;border-bottom:1px solid var(--color-slate-200);padding-bottom:.75rem;margin-bottom:1.25rem;">Programme Timeline</h3>
          ${timelineHtml}
        </div>
        <div class="sh-card">
          <h3 style="margin-top:0;border-bottom:1px solid var(--color-slate-200);padding-bottom:.75rem;margin-bottom:1.25rem;">Employment History</h3>
          ${empHtml}
        </div>
      </div>
    </div>
  `;
}
