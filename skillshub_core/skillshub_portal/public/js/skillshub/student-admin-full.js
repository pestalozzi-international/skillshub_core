(function () {
  'use strict';

  var FEEDBACK_FORMS = [
    { doctype: 'SH Baseline', label: 'Baseline', route: '/skillshub/baseline' },
    { doctype: 'SH Soft Skills Feedback', label: 'Soft Skills', route: '/skillshub/feedback/soft-skills' },
    { doctype: 'SH Mindset Camp Feedback', label: 'Mindset Camp', route: '/skillshub/feedback/mindset-camp' },
    { doctype: 'SH Edulution Feedback', label: 'Edulution', route: '/skillshub/feedback/edulution' },
    { doctype: 'SH VT Feedback', label: 'Vocational Training', route: '/skillshub/feedback/vocational-training' },
    { doctype: 'SH Attachment Feedback', label: 'Attachment', route: '/skillshub/feedback/attachment' },
    { doctype: 'SH Parent Feedback', label: 'Parent', route: '/skillshub/feedback/parent' }
  ];

  var state = {
    studentId: null,
    bundle: null,
    meta: null
  };

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

  function parseStudentId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('id') || params.get('student');
  }

  function setHeader() {
    var student = state.bundle && state.bundle.student ? state.bundle.student : {};
    document.getElementById('student-page-title').textContent = student.student_name || student.name || 'Student Profile';
    document.getElementById('student-page-subtitle').textContent =
      'ID: ' + (student.name || '—') + ' · Path: ' + (student.programme_path || '—') + ' · Status: ' + (student.status || '—');
  }

  function renderOverview() {
    var student = state.bundle.student || {};
    var content = '';
    var keys = [
      ['Student ID', student.name],
      ['Full Name', student.student_name],
      ['Status', student.status],
      ['Programme Path', student.programme_path],
      ['Intake Year', student.intake_year],
      ['Intake Cohort', student.intake_cohort],
      ['Current Course', student.current_course],
      ['Current Class', student.current_schedule],
      ['Current Milestone', student.current_milestone],
      ['Portal User', student.portal_user_account],
      ['Login Email', student.user_login_email],
      ['Mobile', student.mobile],
      ['Personal Email', student.personal_email],
      ['Date of Birth', student.date_of_birth],
      ['Gender', student.gender],
      ['Address', [student.address_line_1, student.address_line_2, student.pincode].filter(Boolean).join(', ') || '—']
    ];

    content += '<div class="kv-grid">';
    keys.forEach(function (pair) {
      content += '<div class="kv-item"><strong>' + esc(pair[0]) + '</strong><div>' + esc(pair[1] || '—') + '</div></div>';
    });
    content += '</div>';
    document.getElementById('tab-overview').innerHTML = content;
  }

  function renderEnrolments() {
    var rows = state.bundle.enrolments || [];
    if (!rows.length) {
      document.getElementById('tab-enrolments').innerHTML = '<div class="sh-empty-cell">No enrolments found.</div>';
      return;
    }

    var html = '<div class="table-wrap"><table class="sh-admin-table"><thead><tr>' +
      '<th>Class</th><th>Course</th><th>Milestone</th><th>Status</th><th>Dates</th><th>Attendance</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>' +
        '<td>' + esc(row.class || '—') + '<div style="font-size:0.76rem;color:var(--muted-text-color)">' + esc(row.course_run || '—') + '</div></td>' +
        '<td>' + esc(row.course || '—') + '</td>' +
        '<td>' + esc(row.milestone || '—') + '</td>' +
        '<td><span class="sh-badge sh-badge-info">' + esc(row.status || '—') + '</span></td>' +
        '<td>' + esc(fmtDate(row.enrolment_date)) + ' → ' + esc(fmtDate(row.completion_date)) + '</td>' +
        '<td>' + esc(row.attendance_rate ? Math.round(row.attendance_rate) + '%' : '—') +
        '<div style="font-size:0.76rem;color:var(--muted-text-color)">' +
        esc((row.sessions_present || 0) + '/' + (row.sessions_total || 0) + ' present') + '</div></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    document.getElementById('tab-enrolments').innerHTML = html;
  }

  function renderAttendance() {
    var rows = state.bundle.attendance || [];
    if (!rows.length) {
      document.getElementById('tab-attendance').innerHTML = '<div class="sh-empty-cell">No attendance records found.</div>';
      return;
    }
    var html = '<div class="table-wrap"><table class="sh-admin-table"><thead><tr>' +
      '<th>Date</th><th>Class</th><th>Status</th><th>Week/Day</th><th>Marked By</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>' +
        '<td>' + esc(fmtDate(row.date)) + '</td>' +
        '<td>' + esc(row.sh_programme_schedule || '—') + '</td>' +
        '<td><span class="sh-badge sh-badge-info">' + esc(row.status || '—') + '</span></td>' +
        '<td>' + esc((row.week || '—') + ' / ' + (row.day || '—')) + '</td>' +
        '<td>' + esc(row.marked_by || '—') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    document.getElementById('tab-attendance').innerHTML = html;
  }

  function renderFeedback() {
    var rows = state.bundle.feedback || [];
    var enrolments = state.bundle.enrolments || [];
    var current = enrolments.find(function (row) { return row.status === 'Enrolled'; }) || enrolments[0] || {};
    var links = FEEDBACK_FORMS.map(function (form) {
      var href = form.route +
        '?student=' + encodeURIComponent(state.studentId) +
        '&schedule=' + encodeURIComponent(current.class || '') +
        '&enrolment_ticket=' + encodeURIComponent(current.name || '');
      return '<a class="sh-btn-secondary" style="font-size:0.76rem;padding:0.35rem 0.65rem;text-decoration:none;" href="' + href + '">+ ' + esc(form.label) + '</a>';
    }).join('');

    var top = '<div style="display:flex;gap:0.45rem;flex-wrap:wrap;margin-bottom:0.7rem;">' + links + '</div>';
    if (!rows.length) {
      document.getElementById('tab-feedback').innerHTML = top + '<div class="sh-empty-cell">No submitted feedback records.</div>';
      return;
    }
    var html = top + '<div class="table-wrap"><table class="sh-admin-table"><thead><tr>' +
      '<th>Form</th><th>Doc</th><th>Class</th><th>Submitted</th><th>View</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (row) {
      var viewUrl = '/skillshub/form-view?doctype=' + encodeURIComponent(row.doctype) + '&name=' + encodeURIComponent(row.name) + '&student=' + encodeURIComponent(state.studentId);
      html += '<tr>' +
        '<td>' + esc(row.label || row.doctype) + '</td>' +
        '<td><code>' + esc(row.name) + '</code></td>' +
        '<td>' + esc(row.programme_schedule || '—') + '</td>' +
        '<td>' + esc(fmtDate(row.creation)) + '</td>' +
        '<td><a class="sh-btn-secondary" style="font-size:0.78rem;padding:0.38rem 0.7rem;text-decoration:none;" href="' + viewUrl + '">Open</a></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    document.getElementById('tab-feedback').innerHTML = html;
  }

  function buildEditField(field, value) {
    var editable = !field.read_only && !field.hidden;
    if (!editable) return '';
    if (!field.fieldname || ['name', 'owner', 'modified', 'modified_by', 'creation', 'doctype'].indexOf(field.fieldname) > -1) return '';
    if (['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Button', 'Attach', 'Attach Image', 'Table'].indexOf(field.fieldtype) > -1) return '';

    var html = '<div class="sh-input-group" style="margin-bottom:0.8rem;">';
    html += '<label class="sh-label" for="fld-' + esc(field.fieldname) + '">' + esc(field.label || field.fieldname) + '</label>';

    var current = value === null || value === undefined ? '' : value;
    if (field.fieldtype === 'Check') {
      html += '<input id="fld-' + esc(field.fieldname) + '" data-fieldname="' + esc(field.fieldname) + '" data-fieldtype="Check" class="sh-input" type="checkbox" ' + (current ? 'checked' : '') + '>';
    } else if (field.fieldtype === 'Select') {
      html += '<select id="fld-' + esc(field.fieldname) + '" data-fieldname="' + esc(field.fieldname) + '" data-fieldtype="Select" class="sh-input">';
      html += '<option value=""></option>';
      (field.options || '').split('\n').filter(Boolean).forEach(function (option) {
        html += '<option value="' + esc(option) + '"' + (String(current) === String(option) ? ' selected' : '') + '>' + esc(option) + '</option>';
      });
      html += '</select>';
    } else if (field.fieldtype === 'Small Text' || field.fieldtype === 'Text' || field.fieldtype === 'Long Text' || field.fieldtype === 'Text Editor') {
      html += '<textarea id="fld-' + esc(field.fieldname) + '" data-fieldname="' + esc(field.fieldname) + '" data-fieldtype="' + esc(field.fieldtype) + '" class="sh-input" rows="3">' + esc(current) + '</textarea>';
    } else if (field.fieldtype === 'Date') {
      html += '<input id="fld-' + esc(field.fieldname) + '" data-fieldname="' + esc(field.fieldname) + '" data-fieldtype="Date" class="sh-input" type="date" value="' + esc(current) + '">';
    } else if (field.fieldtype === 'Int' || field.fieldtype === 'Float' || field.fieldtype === 'Currency' || field.fieldtype === 'Percent') {
      html += '<input id="fld-' + esc(field.fieldname) + '" data-fieldname="' + esc(field.fieldname) + '" data-fieldtype="' + esc(field.fieldtype) + '" class="sh-input" type="number" value="' + esc(current) + '">';
    } else {
      html += '<input id="fld-' + esc(field.fieldname) + '" data-fieldname="' + esc(field.fieldname) + '" data-fieldtype="' + esc(field.fieldtype) + '" class="sh-input" type="text" value="' + esc(current) + '">';
    }

    html += '</div>';
    return html;
  }

  function renderEdit() {
    var student = state.bundle.student || {};
    var fields = (state.meta && state.meta.fields) || [];
    var html = '<div class="sh-form-grid">';
    fields.forEach(function (field) {
      html += buildEditField(field, student[field.fieldname]);
    });
    html += '</div>';
    document.getElementById('tab-edit').innerHTML = html;
  }

  function bindTabs() {
    var tabs = document.querySelectorAll('#student-tabs button[data-tab]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function (panel) { panel.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('tab-' + tab.getAttribute('data-tab')).classList.add('active');
      });
    });
  }

  function saveChanges() {
    var inputs = document.querySelectorAll('#tab-edit [data-fieldname]');
    var payload = {};
    inputs.forEach(function (input) {
      var fieldname = input.getAttribute('data-fieldname');
      var fieldtype = input.getAttribute('data-fieldtype');
      if (!fieldname) return;
      if (fieldtype === 'Check') payload[fieldname] = input.checked ? 1 : 0;
      else payload[fieldname] = input.value;
    });

    var saveBtn = document.getElementById('student-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    api('/api/method/skillshub_core.skillshub_core.api.update_student_admin?student=' + encodeURIComponent(state.studentId), {
      method: 'POST',
      body: JSON.stringify({ payload: payload })
    })
      .then(function () {
        saveBtn.textContent = 'Saved';
        load();
      })
      .catch(function (error) {
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
        alert('Save failed: ' + error.message);
      });
  }

  function load() {
    return Promise.all([
      api('/api/method/skillshub_core.skillshub_portal.api.get_student_admin_bundle?student=' + encodeURIComponent(state.studentId)),
      api('/api/method/skillshub_core.skillshub_portal.api.get_doctype_meta?doctype=' + encodeURIComponent('SH Student'))
    ])
      .then(function (results) {
        state.bundle = results[0];
        state.meta = results[1];
        setHeader();
        renderOverview();
        renderEnrolments();
        renderAttendance();
        renderFeedback();
        renderEdit();
      })
      .catch(function (error) {
        document.getElementById('tab-overview').innerHTML = '<div class="sh-empty-cell">Failed to load profile: ' + esc(error.message) + '</div>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    state.studentId = parseStudentId();
    if (!state.studentId) {
      document.getElementById('tab-overview').innerHTML = '<div class="sh-empty-cell">Student ID missing from URL.</div>';
      return;
    }

    bindTabs();
    document.getElementById('student-save-btn').addEventListener('click', saveChanges);
    load();
  });
}());
