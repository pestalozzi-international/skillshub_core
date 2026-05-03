(function () {
  'use strict';

  function getFrappeHeaders() {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (window.frappe && frappe.csrf_token) {
        headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
}

  function clearAndRedirect() {
    localStorage.removeItem('sh_student_id'); localStorage.removeItem('sh_role');
    localStorage.removeItem('sh_user'); localStorage.removeItem('sh_display_user');
    window.location.replace('/skillshub/login');
  }

  if (localStorage.getItem('sh_role') !== 'admin') { window.location.replace('/skillshub/login'); return; }

  var params    = new URLSearchParams(window.location.search);
  var studentId = params.get('id');
  if (!studentId) { window.location.replace('/skillshub/admin/students'); return; }

  function sf(url) {
    return fetch(url, { headers: getFrappeHeaders(), credentials: 'include' })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) { clearAndRedirect(); return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('logout-btn').addEventListener('click', function () {
      fetch('/api/method/logout', { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' })
        .finally(function () { localStorage.clear(); window.location.replace('/skillshub/login'); });
    });

    Promise.all([
      sf('/api/resource/SH Student/' + encodeURIComponent(studentId)),
      sf('/api/resource/SH Student Enrolment?filters=' +
        encodeURIComponent(JSON.stringify([['student', '=', studentId]])) +
        '&fields=' + encodeURIComponent(JSON.stringify([
          'name','milestone','course','status','attendance_rate',
          'feedback_submitted','baseline_submitted',
          'enrolment_date','completion_date','programme_path','programme_schedule'
        ])) + '&order_by=enrolment_date+asc&limit=50')
    ])
    .then(function (results) {
      if (!results[0] || !results[1]) return;
      render(results[0].data, results[1].data || []);
    })
    .catch(function () {
      document.getElementById('content').innerHTML =
        '<div class="sh-card state-box" style="color:var(--color-red-700)">Error loading student. Please try again.</div>';
    });
  });

  function fmt(d) {
    if (!d) return '-';
    var dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function calcAge(dob) {
    if (!dob) return '-';
    var d = new Date(dob), t = new Date();
    var a = t.getFullYear() - d.getFullYear();
    if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
    return a;
  }

  function render(s, enrolments) {
    if (!s) { document.getElementById('content').innerHTML = '<div class="sh-card state-box">Student not found.</div>'; return; }

    var ORDER = ['Mindset Camp','Soft Skills','Edulution','Vocational Training','Attachment'];
    var enrolMap = {};
    enrolments.forEach(function (e) { if (e.milestone) enrolMap[e.milestone] = e; });
    var skipEd = (s.programme_path === 'Path B');

    var tlItems = ORDER.filter(function (m) { return !(skipEd && m === 'Edulution'); }).map(function (m) {
      var e = enrolMap[m];
      if (!e) {
        return '<div class="tl-item tl-future"><div class="tl-dot tl-dot-future"></div>' +
          '<div class="tl-body"><div class="tl-title">' + m + '</div><div class="tl-meta">Not yet started</div></div></div>';
      }
      var att  = e.attendance_rate != null ? Math.round(e.attendance_rate) : null;
      var dcls = e.status === 'Completed' ? 'tl-dot-done' : e.status === 'Dropped' ? 'tl-dot-drop' : 'tl-dot-active';
      var pills = '<span class="pill pill-' + (e.status||'enrolled').toLowerCase() + '">' + (e.status||'Enrolled') + '</span>';
      if (att !== null) pills += '<span class="pill pill-att">' + att + '% att.</span>';
      pills += '<span class="pill ' + (e.feedback_submitted ? 'pill-ok' : 'pill-pend') + '">' + (e.feedback_submitted ? 'Feedback' : 'Feedback pending') + '</span>';
      if (e.baseline_submitted) pills += '<span class="pill pill-ok">Baseline</span>';
      return '<div class="tl-item"><div class="tl-dot ' + dcls + '"></div><div class="tl-body">' +
        '<div class="tl-title">' + m + (e.course ? ' <span class="tl-course">- ' + e.course + '</span>' : '') + '</div>' +
        '<div class="tl-meta">' + fmt(e.enrolment_date) + (e.completion_date ? ' to ' + fmt(e.completion_date) : '') + '</div>' +
        '<div class="tl-pills">' + pills + '</div></div></div>';
    }).join('');

    var emp = s.employment_history || [];
    var empHtml = emp.length === 0
      ? '<p style="color:var(--color-slate-500)">No employment history recorded.</p>'
      : '<table class="emp-table"><thead><tr><th>Employer</th><th>Role</th><th>Type</th><th>Start</th><th>End</th></tr></thead><tbody>' +
        emp.map(function (r) {
          return '<tr><td>' + (r.employer_name||r.institution||'-') + '</td><td>' + (r.role||r.occupation||'-') + '</td>' +
            '<td>' + (r.employer_type||'-') + '</td><td>' + fmt(r.start_date) + '</td>' +
            '<td>' + (r.end_date ? fmt(r.end_date) : 'Current') + '</td></tr>';
        }).join('') + '</tbody></table>';

    var badgeCls = s.status === 'Student' ? 'badge-student' : 'badge-alumni';
    var addr = [s.address_line_1, s.address_line_2, s.pincode].filter(Boolean).join(', ') || '-';

    document.getElementById('content').innerHTML =
      '<div class="detail-header"><div>' +
        '<h2>' + (s.student_name||'-') + '</h2>' +
        '<div class="sid">' + s.name + '</div>' +
        '<div style="margin-top:.5rem"><span class="status-badge ' + badgeCls + '">' + (s.status||'-') + '</span>' +
        (s.programme_path ? '<span class="status-badge badge-path" style="margin-left:.5rem">' + s.programme_path + '</span>' : '') +
        '</div></div>' +
        '<a href="/skillshub/admin/students" class="back-link">Back to Students</a>' +
      '</div>' +
      '<div class="detail-grid"><div class="sidebar">' +
        '<div class="sh-card"><h3 class="card-section-title">Demographics</h3>' +
          '<div class="card-label">Student ID</div><div class="card-value">' + s.name + '</div>' +
          '<div class="card-label">Date of Birth</div><div class="card-value">' + fmt(s.date_of_birth) + '</div>' +
          '<div class="card-label">Age</div><div class="card-value">' + calcAge(s.date_of_birth) + '</div>' +
          '<div class="card-label">Gender</div><div class="card-value">' + (s.gender||'-') + '</div>' +
          '<div class="card-label">NRC</div><div class="card-value">' + (s.nrc_number||'-') + '</div>' +
          '<div class="card-label">Address</div><div class="card-value">' + addr + '</div>' +
          '<div class="card-label">Guardian</div><div class="card-value">' + (s.guardian_name||'-') + '</div>' +
          '<div class="card-label">Guardian Mobile</div><div class="card-value">' + (s.guardian_mobile_number||'-') + '</div>' +
        '</div>' +
        '<div class="sh-card"><h3 class="card-section-title">Enrolment Status</h3>' +
          '<div class="card-label">Cohort</div><div class="card-value">' + (s.current_cohort||'-') + '</div>' +
          '<div class="card-label">Programme</div><div class="card-value">' + (s.skillshub_programme||'-') + '</div>' +
          '<div class="card-label">Path</div><div class="card-value">' + (s.programme_path||'-') + '</div>' +
          '<div class="card-label">Enrolled</div><div class="card-value">' + fmt(s.enrolment_date) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="right-col">' +
        '<div class="sh-card"><h3 style="margin-top:0;border-bottom:1px solid var(--color-slate-200);padding-bottom:.75rem;margin-bottom:1.5rem">Milestone Timeline</h3>' +
          '<div class="tl-container">' + tlItems + '</div></div>' +
        '<div class="sh-card"><h3 style="margin-top:0;border-bottom:1px solid var(--color-slate-200);padding-bottom:.75rem;margin-bottom:1.25rem">Employment History</h3>' +
          empHtml + '</div>' +
      '</div></div>';
  }
}());
