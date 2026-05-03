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
    localStorage.clear();
    window.location.replace('/skillshub/login');
  }

  var params = new URLSearchParams(window.location.search);
  var studentId = params.get('id');

  function sf(url) {
    return fetch(url, { headers: getFrappeHeaders(), credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { clearAndRedirect(); return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!studentId) {
      document.getElementById('content').innerHTML = '<div style="text-align:center; padding:5rem;">Student ID missing.</div>';
      return;
    }

    document.getElementById('logout-btn').addEventListener('click', function () {
      fetch('/api/method/logout', { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' })
        .finally(function () { clearAndRedirect(); });
    });

    fetchData();
  });

  function fetchData() {
    Promise.all([
      sf('/api/resource/SH Student/' + encodeURIComponent(studentId)),
      sf('/api/resource/SH Student Enrolment?filters=' +
        encodeURIComponent(JSON.stringify([['student', '=', studentId]])) +
        '&fields=' + encodeURIComponent(JSON.stringify([
          'name','milestone','course','status','attendance_rate',
          'feedback_submitted','baseline_submitted',
          'enrolment_date','completion_date'
        ])) + '&order_by=enrolment_date+asc')
    ])
    .then(function (results) {
      if (!results[0]) return;
      render(results[0].data, results[1].data || []);
    })
    .catch(function (err) {
      document.getElementById('content').innerHTML =
        '<div style="text-align:center; padding:5rem; color:var(--color-red-600)">Error loading student: ' + err.message + '</div>';
    });
  }

  function fmt(d) {
    if (!d) return '—';
    var dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function render(s, enrolments) {
    var content = document.getElementById('content');
    
    // Banner
    var bannerHtml = '<div class="sh-page-header sh-animate-fade"><div class="sh-container"><div>' +
      '<h1>' + (s.student_name || '—') + '</h1>' +
      '<p>' + (s.current_cohort || 'No Cohort') + ' • ' + (s.skillshub_programme || 'No Programme') + '</p>' +
      '</div></div></div>';

    // Sidebar
    var sidebarHtml = '<div class="sidebar-col">' +
      '<div class="glass-card sh-animate-fade">' +
        '<div class="section-title">Demographics</div>' +
        row('Student ID', s.name) +
        row('Birth Date', fmt(s.date_of_birth)) +
        row('Gender', s.gender) +
        row('NRC Number', s.nrc_number) +
        '<div class="data-row"><div class="data-label">Status</div><div class="data-value"><span class="sh-badge sh-badge-info">' + s.status + '</span></div></div>' +
      '</div>' +
      '<div class="glass-card sh-animate-fade" style="animation-delay: 0.1s;">' +
        '<div class="section-title">Growth & Motivation</div>' +
        pillsSection('Motivations', s.motivations || [], 'motivation') +
        pillsSection('Resilience', s.resilience_links || [], 'resilience_statement') +
      '</div></div>';

    // Content
    var mainHtml = '<div class="content-col">' +
      '<div class="glass-card sh-animate-fade" style="animation-delay: 0.2s;">' +
        '<div class="section-title">Contact Information</div>' +
        '<div class="sh-grid sh-grid-2">' +
          row('Address', [s.address_line_1, s.address_line_2, s.pincode].filter(Boolean).join(', ') || '—') +
          row('Mobile', s.mobile || '—') +
          row('Email', s.personal_email || '—') +
          row('Guardian', s.guardian_name || '—') +
        '</div>' +
      '</div>' +
      '<div class="glass-card sh-animate-fade" style="animation-delay: 0.3s;">' +
        '<div class="section-title">Enrolment Journey</div>' +
        '<div class="timeline">' + (renderTimeline(enrolments) || '<div class="tl-item">No history found</div>') + '</div>' +
      '</div></div>';

    content.innerHTML = bannerHtml + '<div class="sh-container"><div class="sh-main-container">' + sidebarHtml + mainHtml + '</div></div>';
  }

  function renderTimeline(enrolments) {
    return enrolments.map(function (e) {
      return '<div class="tl-item ' + (e.status === 'Completed' ? 'completed' : '') + '">' +
        '<div class="tl-date">' + fmt(e.enrolment_date) + (e.completion_date ? ' — ' + fmt(e.completion_date) : '') + '</div>' +
        '<div class="tl-title">' + (e.milestone || 'Milestone') + (e.course ? ' · ' + e.course : '') + '</div>' +
        '<div class="tl-meta">' +
          '<span class="sh-badge ' + (e.status === 'Completed' ? 'sh-badge-success' : 'sh-badge-info') + '">' + e.status + '</span>' +
          (e.attendance_rate ? '<span class="sh-badge sh-badge-info">' + Math.round(e.attendance_rate) + '% Att.</span>' : '') +
          (e.feedback_submitted ? '<span class="sh-badge sh-badge-success">✓ Feedback</span>' : '') +
        '</div></div>';
    }).join('');
  }

  function row(label, value) {
    return '<div class="data-row"><div class="data-label">' + label + '</div><div class="data-value">' + (value || '—') + '</div></div>';
  }

  function pillsSection(label, data, field) {
    var pills = data.map(function (item) {
      return '<div class="sh-pill">' + item[field] + '</div>';
    }).join('');
    return '<div class="data-label" style="margin-top: 1rem; margin-bottom: 0.5rem;">' + label + '</div>' +
      '<div class="sh-pill-container">' + (pills || '<span style="font-size:0.875rem; color:var(--color-slate-400)">None</span>') + '</div>';
  }

}());
