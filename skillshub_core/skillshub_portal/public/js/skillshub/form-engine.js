(function () {
  'use strict';

  var state = {
    doctype: null,
    meta: null,
    summary: null,
    context: {},
    linkCache: {}
  };

  var ROUTES = {
    'SH Baseline': '/skillshub/baseline',
    'SH Soft Skills Feedback': '/skillshub/feedback/soft-skills',
    'SH Mindset Camp Feedback': '/skillshub/feedback/mindset-camp',
    'SH VT Feedback': '/skillshub/feedback/vocational-training',
    'SH Edulution Feedback': '/skillshub/feedback/edulution',
    'SH Attachment Feedback': '/skillshub/feedback/attachment',
    'SH Parent Feedback': '/skillshub/feedback/parent'
  };

  function esc(value) {
    if (value === null || value === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function parseSelectOptions(options) {
    return String(options || '')
      .split('\n')
      .map(function (value) { return value.trim(); })
      .filter(Boolean);
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
        if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + path);
        return response.json();
      })
      .then(function (json) { return json.message || json; });
  }

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function resolveBackLink() {
    var backLink = document.getElementById('portal-form-back');
    if (!backLink) return;
    var params = getParams();
    var student = params.get('student');
    var returnTo = params.get('return_to');
    if (returnTo && returnTo.charAt(0) === '/') {
      backLink.href = returnTo;
      return;
    }
    if (params.get('from') === 'admin' && student) {
      backLink.href = '/skillshub/admin/student?id=' + encodeURIComponent(student);
      return;
    }
    if (student) {
      var isAdmin = !!(window.SHPortal && window.SHPortal.bootstrap && window.SHPortal.bootstrap.is_admin);
      var referrer = document.referrer || '';
      if (isAdmin || referrer.indexOf('/skillshub/admin/student') > -1 || referrer.indexOf('/skillshub/admin/') > -1) {
        backLink.href = '/skillshub/admin/student?id=' + encodeURIComponent(student);
        return;
      }
    }
    backLink.href = '/skillshub/profile';
  }

  function inferStudentField() {
    var names = ['sh_student', 'student'];
    var fields = (state.meta && state.meta.fields) || [];
    for (var index = 0; index < names.length; index += 1) {
      if (fields.some(function (field) { return field.fieldname === names[index]; })) return names[index];
    }
    return null;
  }

  function inferScheduleField() {
    var names = ['programme_schedule', 'program_schedule', 'sh_programme_schedule', 'class'];
    var fields = (state.meta && state.meta.fields) || [];
    for (var index = 0; index < names.length; index += 1) {
      if (fields.some(function (field) { return field.fieldname === names[index]; })) return names[index];
    }
    return null;
  }

  function inferEnrolmentField() {
    var fields = (state.meta && state.meta.fields) || [];
    return fields.some(function (field) { return field.fieldname === 'enrolment_ticket'; }) ? 'enrolment_ticket' : null;
  }

  function chosenEnrolment() {
    var params = getParams();
    var ticket = params.get('enrolment_ticket');
    var schedule = params.get('schedule');
    var enrolments = (state.summary && state.summary.enrolments) || [];

    if (ticket) {
      var direct = enrolments.find(function (row) { return row.name === ticket; });
      if (direct) return direct;
    }
    if (schedule) {
      var byClass = enrolments.find(function (row) { return row.class === schedule; });
      if (byClass) return byClass;
    }
    return enrolments.find(function (row) { return row.status === 'Enrolled'; }) || enrolments[0] || null;
  }

  function contextDefaults() {
    var params = getParams();
    var summaryStudent = state.summary && state.summary.student ? state.summary.student : {};
    var enrolment = chosenEnrolment();
    var schedule = params.get('schedule') || (enrolment && enrolment.class) || summaryStudent.current_schedule || '';
    var ticket = params.get('enrolment_ticket') || (enrolment && enrolment.name) || summaryStudent.current_enrolment || '';

    var defaults = {
      student: params.get('student') || summaryStudent.name || '',
      schedule: schedule,
      enrolment_ticket: ticket,
      milestone: (enrolment && enrolment.milestone) || '',
      course: (enrolment && enrolment.course) || '',
      programme_path: summaryStudent.programme_path || '',
      academic_year: (enrolment && enrolment.academic_year) || '',
      cohort: (enrolment && enrolment.cohort) || summaryStudent.current_cohort || '',
      course_run: (enrolment && enrolment.course_run) || ''
    };
    return defaults;
  }

  function setContextCard() {
    var card = document.getElementById('portal-form-context');
    if (!card) return;
    var summaryStudent = state.summary && state.summary.student ? state.summary.student : {};
    var data = contextDefaults();
    var html = '' +
      '<div class="kv-item"><strong>Student</strong><div>' + esc(summaryStudent.student_name || data.student || '—') + '</div></div>' +
      '<div class="kv-item"><strong>Student ID</strong><div>' + esc(data.student || '—') + '</div></div>' +
      '<div class="kv-item"><strong>Class</strong><div>' + esc(data.schedule || '—') + '</div></div>' +
      '<div class="kv-item"><strong>Enrolment Ticket</strong><div>' + esc(data.enrolment_ticket || '—') + '</div></div>' +
      '<div class="kv-item"><strong>Programme Path</strong><div>' + esc(data.programme_path || '—') + '</div></div>' +
      '<div class="kv-item"><strong>Course Run</strong><div>' + esc(data.course_run || '—') + '</div></div>';
    card.innerHTML = html;
  }

  function setFieldContext(field) {
    var defaults = contextDefaults();
    var studentField = inferStudentField();
    var scheduleField = inferScheduleField();
    var enrolmentField = inferEnrolmentField();

    if (field.fieldname === studentField) return defaults.student;
    if (field.fieldname === scheduleField) return defaults.schedule;
    if (field.fieldname === enrolmentField) return defaults.enrolment_ticket;

    if (field.fieldname === 'milestone') return defaults.milestone;
    if (field.fieldname === 'course' || field.fieldname === 'skillshub_course') return defaults.course;
    if (field.fieldname === 'cohort' || field.fieldname === 'skillshub_cohort') return defaults.cohort;
    if (field.fieldname === 'academic_year') return defaults.academic_year;
    if (field.fieldname === 'course_run') return defaults.course_run;
    return null;
  }

  function getLinkOptions(doctype) {
    if (!doctype) return Promise.resolve([]);
    if (state.linkCache[doctype]) return Promise.resolve(state.linkCache[doctype]);
    return api('/api/method/skillshub_core.skillshub_portal.api.get_link_options?doctype=' + encodeURIComponent(doctype))
      .then(function (rows) {
        state.linkCache[doctype] = rows || [];
        return state.linkCache[doctype];
      })
      .catch(function () { return []; });
  }

  function renderLinkField(field, value) {
    return getLinkOptions(field.options).then(function (options) {
      var html = '<option value=""></option>';
      options.forEach(function (option) {
        html += '<option value="' + esc(option) + '"' + (String(value || '') === String(option) ? ' selected' : '') + '>' + esc(option) + '</option>';
      });
      return '<select class="sh-input" data-fieldname="' + esc(field.fieldname) + '" data-fieldtype="Link">' + html + '</select>';
    });
  }

  function renderSimpleField(field, value) {
    var fieldname = esc(field.fieldname);
    var current = value === null || value === undefined ? '' : value;
    if (field.fieldtype === 'Check') {
      return Promise.resolve('<input type="checkbox" class="sh-input" data-fieldname="' + fieldname + '" data-fieldtype="Check" ' + (current ? 'checked' : '') + '>');
    }
    if (field.fieldtype === 'Select') {
      var select = '<select class="sh-input" data-fieldname="' + fieldname + '" data-fieldtype="Select"><option value=""></option>';
      parseSelectOptions(field.options).forEach(function (option) {
        select += '<option value="' + esc(option) + '"' + (String(current) === option ? ' selected' : '') + '>' + esc(option) + '</option>';
      });
      select += '</select>';
      return Promise.resolve(select);
    }
    if (field.fieldtype === 'Date') {
      return Promise.resolve('<input type="date" class="sh-input" data-fieldname="' + fieldname + '" data-fieldtype="Date" value="' + esc(current) + '">');
    }
    if (field.fieldtype === 'Datetime') {
      return Promise.resolve('<input type="datetime-local" class="sh-input" data-fieldname="' + fieldname + '" data-fieldtype="Datetime" value="' + esc(current) + '">');
    }
    if (field.fieldtype === 'Int' || field.fieldtype === 'Float' || field.fieldtype === 'Currency' || field.fieldtype === 'Percent') {
      return Promise.resolve('<input type="number" class="sh-input" data-fieldname="' + fieldname + '" data-fieldtype="' + esc(field.fieldtype) + '" value="' + esc(current) + '">');
    }
    if (field.fieldtype === 'Rating') {
      return Promise.resolve('<input type="range" min="1" max="5" class="sh-input" data-fieldname="' + fieldname + '" data-fieldtype="Rating" value="' + esc(current || 3) + '">');
    }
    if (field.fieldtype === 'Small Text' || field.fieldtype === 'Text' || field.fieldtype === 'Long Text' || field.fieldtype === 'Text Editor') {
      return Promise.resolve('<textarea class="sh-input" rows="4" data-fieldname="' + fieldname + '" data-fieldtype="' + esc(field.fieldtype) + '">' + esc(current) + '</textarea>');
    }
    if (field.fieldtype === 'Link') {
      return renderLinkField(field, current);
    }
    return Promise.resolve('<input type="text" class="sh-input" data-fieldname="' + fieldname + '" data-fieldtype="' + esc(field.fieldtype) + '" value="' + esc(current) + '">');
  }

  function tableValueField(meta) {
    if (!meta || !meta.fields || !meta.fields.length) return null;
    var preferred = meta.fields.find(function (field) { return field.fieldtype === 'Link'; });
    if (preferred) return preferred;
    preferred = meta.fields.find(function (field) { return field.fieldtype === 'Select'; });
    if (preferred) return preferred;
    preferred = meta.fields.find(function (field) { return ['Data', 'Small Text', 'Text'].indexOf(field.fieldtype) > -1; });
    return preferred || meta.fields[0];
  }

  function renderTableField(field, meta, value) {
    var rowField = tableValueField(meta);
    if (!rowField) {
      return Promise.resolve('<div style="font-size:0.8rem;color:var(--muted-text-color);">No editable child fields.</div>');
    }
    var selected = (value || []).map(function (row) { return row[rowField.fieldname]; }).filter(Boolean);
    var promise = Promise.resolve([]);
    if (rowField.fieldtype === 'Link') promise = getLinkOptions(rowField.options);
    if (rowField.fieldtype === 'Select') promise = Promise.resolve(parseSelectOptions(rowField.options));

    return promise.then(function (options) {
      if (!options.length) return '<div style="font-size:0.8rem;color:var(--muted-text-color);">No options configured for ' + esc(rowField.label || rowField.fieldname) + '.</div>';
      var html = '<div class="table-matrix" data-fieldname="' + esc(field.fieldname) + '" data-row-field="' + esc(rowField.fieldname) + '">';
      options.forEach(function (option) {
        var checked = selected.indexOf(option) > -1;
        html += '<label style="display:flex;gap:0.5rem;align-items:flex-start;margin-bottom:0.35rem;">' +
          '<input type="checkbox" value="' + esc(option) + '"' + (checked ? ' checked' : '') + '>' +
          '<span>' + esc(option) + '</span>' +
          '</label>';
      });
      html += '</div>';
      return html;
    });
  }

  function renderCreateForm(existingDoc) {
    var root = document.getElementById('portal-form-body');
    var fields = (state.meta && state.meta.fields) || [];
    var context = contextDefaults();

    var renderPromises = fields.map(function (field) {
      if (!field.fieldname) return Promise.resolve('');
      if (field.hidden) return Promise.resolve('');
      if (!existingDoc && field.fieldname === 'course_run') return Promise.resolve('');
      if (['name', 'owner', 'creation', 'modified', 'modified_by', 'idx', 'parent', 'parentfield', 'parenttype', 'docstatus'].indexOf(field.fieldname) > -1) return Promise.resolve('');

      var existingValue = existingDoc ? existingDoc[field.fieldname] : null;
      var contextualValue = setFieldContext(field);
      var initialValue = contextualValue !== null && contextualValue !== undefined && contextualValue !== '' ? contextualValue : existingValue;

      if (field.read_only && !existingDoc) {
        return Promise.resolve(
          '<div class="sh-input-group"><label class="sh-label">' + esc(field.label || field.fieldname) + '</label>' +
          '<input class="sh-input" data-fieldname="' + esc(field.fieldname) + '" data-fieldtype="' + esc(field.fieldtype) + '" value="' + esc(initialValue || '') + '" readonly></div>'
        );
      }

      if (field.fieldtype === 'Table') {
        var childMeta = state.meta.child_tables ? state.meta.child_tables[field.fieldname] : null;
        return renderTableField(field, childMeta, initialValue).then(function (control) {
          return '<div class="sh-input-group"><label class="sh-label">' + esc(field.label || field.fieldname) + '</label>' + control + '</div>';
        });
      }

      return renderSimpleField(field, initialValue).then(function (control) {
        return '<div class="sh-input-group"><label class="sh-label">' + esc(field.label || field.fieldname) + (field.reqd ? ' *' : '') + '</label>' + control + '</div>';
      });
    });

    Promise.all(renderPromises).then(function (controls) {
      root.innerHTML = controls.filter(Boolean).join('');
      setContextCard();
    });
  }

  function gatherPayload() {
    var payload = {};
    document.querySelectorAll('#portal-form-body [data-fieldname][data-fieldtype]').forEach(function (input) {
      var fieldname = input.getAttribute('data-fieldname');
      var fieldtype = input.getAttribute('data-fieldtype');
      if (!fieldname) return;
      if (fieldtype === 'Check') payload[fieldname] = input.checked ? 1 : 0;
      else if (fieldtype === 'Int' || fieldtype === 'Float' || fieldtype === 'Currency' || fieldtype === 'Percent' || fieldtype === 'Rating') payload[fieldname] = input.value === '' ? null : Number(input.value);
      else payload[fieldname] = input.value;
    });

    document.querySelectorAll('#portal-form-body .table-matrix[data-fieldname][data-row-field]').forEach(function (block) {
      var fieldname = block.getAttribute('data-fieldname');
      var rowField = block.getAttribute('data-row-field');
      var rows = [];
      block.querySelectorAll('input[type=checkbox]:checked').forEach(function (checkbox) {
        var row = {};
        row[rowField] = checkbox.value;
        rows.push(row);
      });
      payload[fieldname] = rows;
    });
    return payload;
  }

  function renderReadOnly(doc) {
    var root = document.getElementById('portal-form-body');
    var fields = (state.meta && state.meta.fields) || [];
    var html = '<div class="kv-grid">';
    fields.forEach(function (field) {
      if (!field.fieldname || field.hidden) return;
      if (['name', 'owner', 'creation', 'modified', 'modified_by', 'idx', 'parent', 'parentfield', 'parenttype', 'docstatus'].indexOf(field.fieldname) > -1) return;
      var value = doc[field.fieldname];
      if (field.fieldtype === 'Table') {
        var rows = Array.isArray(value) ? value : [];
        var preview = rows.map(function (row) {
          var keys = Object.keys(row).filter(function (key) { return ['name', 'idx', 'owner', 'creation', 'modified', 'modified_by', 'doctype', 'parent', 'parentfield', 'parenttype'].indexOf(key) === -1; });
          return keys.map(function (key) { return key + ': ' + row[key]; }).join(' · ');
        }).join('<br>');
        html += '<div class="kv-item"><strong>' + esc(field.label || field.fieldname) + '</strong><div>' + (preview || '—') + '</div></div>';
      } else {
        html += '<div class="kv-item"><strong>' + esc(field.label || field.fieldname) + '</strong><div>' + esc(value || '—') + '</div></div>';
      }
    });
    html += '</div>';
    root.innerHTML = html;
  }

  function submitForm() {
    var button = document.getElementById('portal-form-submit');
    button.disabled = true;
    button.textContent = 'Submitting...';
    var payload = gatherPayload();
    api('/api/method/skillshub_core.skillshub_portal.api.submit_portal_form', {
      method: 'POST',
      body: JSON.stringify({ doctype: state.doctype, values: payload })
    })
      .then(function (result) {
        button.textContent = 'Submitted';
        document.getElementById('portal-form-message').innerHTML =
          '<div class="sh-alert-success">Submitted successfully. Reference: <strong>' + esc(result.name) + '</strong></div>';
      })
      .catch(function (error) {
        button.disabled = false;
        button.textContent = 'Submit Form';
        document.getElementById('portal-form-message').innerHTML =
          '<div class="sh-alert-error">Submission failed: ' + esc(error.message) + '</div>';
      });
  }

  function bootstrap() {
    var body = document.body;
    state.doctype = body.getAttribute('data-doctype');
    var title = body.getAttribute('data-title') || state.doctype;
    var params = getParams();
    var readName = params.get('name');

    document.getElementById('portal-form-title').textContent = title;
    resolveBackLink();

    var summaryPromise = api('/api/method/skillshub_core.skillshub_core.api.get_portal_student_context' + (params.get('student') ? '?student=' + encodeURIComponent(params.get('student')) : ''))
      .catch(function () { return {}; });

    Promise.all([
      api('/api/method/skillshub_core.skillshub_portal.api.get_form_meta?doctype=' + encodeURIComponent(state.doctype)),
      summaryPromise
    ])
      .then(function (results) {
        state.meta = results[0] || {};
        state.summary = results[1] || {};
        state.context = contextDefaults();
        resolveBackLink();

        if (readName) {
          return api('/api/method/skillshub_core.skillshub_portal.api.get_portal_form_doc?doctype=' + encodeURIComponent(state.doctype) + '&name=' + encodeURIComponent(readName))
            .then(function (doc) {
              renderReadOnly(doc || {});
              setContextCard();
              document.getElementById('portal-form-submit').style.display = 'none';
            });
        }
        renderCreateForm();
        return null;
      })
      .catch(function (error) {
        document.getElementById('portal-form-body').innerHTML = '<div class="sh-alert-error">Unable to load form: ' + esc(error.message) + '</div>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var submit = document.getElementById('portal-form-submit');
    if (submit) submit.addEventListener('click', submitForm);
    bootstrap();
  });
}());
