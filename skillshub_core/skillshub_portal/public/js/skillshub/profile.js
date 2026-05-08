(function () {
  'use strict';

  function esc(value) {
    if (value === null || value === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function fmtDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB');
  }

  function headers() {
    return (window.SHPortal && window.SHPortal.getHeaders && window.SHPortal.getHeaders()) || {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  function api(path, options) {
    return fetch(path, Object.assign({ credentials: 'include', headers: headers() }, options || {}))
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (json) { return json.message || json; });
  }

  function renderStudentCard(student) {
    var html = '';
    html += '<h3 style="margin-top:0;">' + esc(student.student_name || student.full_name || student.name) + '</h3>';
    html += '<div style="font-size:0.84rem;color:var(--muted-text-color);margin-bottom:0.8rem;">' + esc(student.name || '—') + '</div>';
    html += '<div style="display:grid;gap:0.5rem;font-size:0.9rem;">';
    html += '<div><strong>Status:</strong> ' + esc(student.status || '—') + '</div>';
    html += '<div><strong>Path:</strong> ' + esc(student.programme_path || '—') + '</div>';
    html += '<div><strong>Intake Cohort:</strong> ' + esc(student.current_cohort || '—') + '</div>';
    html += '<div><strong>Current Course:</strong> ' + esc(student.current_course || '—') + '</div>';
    html += '<div><strong>Current Class:</strong> ' + esc(student.current_schedule || '—') + '</div>';
    html += '<div><strong>Mobile:</strong> ' + esc(student.mobile || '—') + '</div>';
    html += '<div><strong>Email:</strong> ' + esc(student.personal_email || student.user_login_email || '—') + '</div>';
    html += '</div>';
    document.getElementById('student-card').innerHTML = html;
  }

  function renderEnrolments(enrolments) {
    var container = document.getElementById('enrolments-list');
    if (!enrolments || !enrolments.length) {
      container.innerHTML = '<div style="color:var(--muted-text-color);">No enrolment records yet.</div>';
      return;
    }

    container.innerHTML = enrolments.map(function (row) {
      return '' +
        '<article style="border:1px solid var(--color-slate-100);border-radius:0.85rem;padding:0.75rem;margin-bottom:0.65rem;">' +
          '<div style="display:flex;justify-content:space-between;gap:0.6rem;flex-wrap:wrap;">' +
            '<div>' +
              '<div style="font-weight:600;">' + esc(row.class || '—') + '</div>' +
              '<div style="font-size:0.82rem;color:var(--muted-text-color);">' + esc(row.course || '—') + ' · ' + esc(row.milestone || '—') + '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
              '<div><span class="sh-badge sh-badge-info">' + esc(row.status || '—') + '</span></div>' +
              '<div style="font-size:0.8rem;color:var(--muted-text-color);margin-top:0.2rem;">' + esc(fmtDate(row.enrolment_date)) + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:0.55rem;font-size:0.82rem;">Attendance: <strong>' + esc(row.attendance_rate ? Math.round(row.attendance_rate) + '%' : '—') + '</strong></div>' +
        '</article>';
    }).join('');
  }

  function renderFeedbackLinks(summary, feedbackForms) {
    var container = document.getElementById('feedback-links');
    var enrolments = summary.enrolments || [];
    var activeEnrolment = enrolments.find(function (row) { return row.status === 'Enrolled'; }) || enrolments[0] || null;
    var student = summary.student || {};

    if (!feedbackForms || !feedbackForms.length) {
      container.innerHTML = '<div style="color:var(--muted-text-color);">No forms configured.</div>';
      return;
    }

    container.innerHTML = feedbackForms.map(function (form) {
      var href = form.route +
        '?student=' + encodeURIComponent(student.name || '') +
        '&schedule=' + encodeURIComponent((activeEnrolment && activeEnrolment.class) || student.current_schedule || '') +
        '&enrolment_ticket=' + encodeURIComponent((activeEnrolment && activeEnrolment.name) || student.current_enrolment || '');
      var status = summary.feedback_status && summary.feedback_status[form.doctype] ? 'Submitted' : 'Pending';
      return '' +
        '<a class="feedback-link" href="' + href + '">' +
          '<strong>' + esc(form.label) + '</strong>' +
          '<span style="display:flex;justify-content:space-between;gap:0.5rem;align-items:center;">' +
            '<span>' + esc(form.doctype) + '</span>' +
            '<span class="sh-badge ' + (status === 'Submitted' ? 'sh-badge-success' : 'sh-badge-info') + '">' + status + '</span>' +
          '</span>' +
        '</a>';
    }).join('');
  }

  function renderSubmittedForms(rows) {
    var container = document.getElementById('submitted-forms-list');
    if (!rows || !rows.length) {
      container.innerHTML = '<div style="font-size:0.84rem;color:var(--muted-text-color);">No submitted forms.</div>';
      return;
    }

    container.innerHTML = rows.map(function (row) {
      var link = '/skillshub/form-view?doctype=' + encodeURIComponent(row.doctype) + '&name=' + encodeURIComponent(row.name);
      return '' +
        '<a href="' + link + '" style="text-decoration:none;border:1px solid var(--color-slate-100);border-radius:0.65rem;padding:0.52rem 0.6rem;color:inherit;">' +
          '<div style="font-size:0.78rem;color:var(--muted-text-color);">' + esc(row.label || row.doctype) + '</div>' +
          '<div style="font-weight:600;font-size:0.84rem;">' + esc(row.name) + '</div>' +
          '<div style="font-size:0.74rem;color:var(--muted-text-color);">' + esc(fmtDate(row.creation)) + '</div>' +
        '</a>';
    }).join('');
  }

  function render(summary, submitted) {
    var student = summary.student || {};
    document.getElementById('profile-title').textContent = student.student_name ? ('My Profile · ' + student.student_name) : 'My Profile';
    document.getElementById('profile-subtitle').textContent = (student.programme_path || 'Student') + ' · ' + (student.current_course || 'No current course');
    renderStudentCard(student);
    renderEnrolments(summary.enrolments || []);
    renderFeedbackLinks(summary, summary.feedback_forms || []);
    renderSubmittedForms(submitted || []);
  }

  function init() {
    Promise.all([
      api('/api/method/skillshub_core.skillshub_core.api.get_portal_student_context'),
      api('/api/method/skillshub_core.skillshub_portal.api.get_portal_bootstrap')
    ])
      .then(function (results) {
        var summary = results[0] || {};
        var bootstrap = results[1] || {};
        var studentName = bootstrap && bootstrap.student ? bootstrap.student.name : (summary.student && summary.student.name);
        if (!studentName) throw new Error('No student account is linked to this login.');
        return Promise.all([
          Promise.resolve(summary),
          api('/api/method/skillshub_core.skillshub_portal.api.get_feedback_records?student=' + encodeURIComponent(studentName))
        ]);
      })
      .then(function (payload) {
        render(payload[0], payload[1] || []);
      })
      .catch(function (error) {
        document.getElementById('student-card').innerHTML = '<div style="color:var(--color-red-700)">Unable to load profile: ' + esc(error.message) + '</div>';
      });
  }

  document.addEventListener('DOMContentLoaded', init);
}());
