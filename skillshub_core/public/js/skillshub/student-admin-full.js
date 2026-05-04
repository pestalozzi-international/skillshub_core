(function(){
  'use strict';

  function getFrappeHeaders() {
    var h = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (window.frappe && frappe.csrf_token && frappe.csrf_token !== 'None' && !frappe.csrf_token.includes('{{')) {
      h['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return h;
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div'); d.textContent = s; return d.innerHTML;
  }

  var params = new URLSearchParams(window.location.search);
  var studentId = params.get('id');
  if (!studentId) {
    document.getElementById('content').innerHTML = '<div style="text-align:center;padding:4rem">Student ID missing.</div>';
  }

  async function fetchJson(url) {
    var r = await fetch(url, { headers: getFrappeHeaders(), credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function getDocType() {
    var url = '/api/resource/DocType/SH Student?fields=' + encodeURIComponent(JSON.stringify(['fields', 'field_order', 'title_field', 'image_field', 'permissions', 'name']));
    var res = await fetch(url, { headers: getFrappeHeaders(), credentials: 'include' });
    if (!res.ok) throw new Error('Unable to fetch DocType');
    return res.json();
  }

  async function getUserRoles() {
      try {
        var r = await fetch('/api/method/skillshub_core.skillshub_core.api.get_user_roles', { headers: getFrappeHeaders(), credentials: 'include' });
        if (!r.ok) return [];
        var jd = await r.json();
        return jd.message || [];
      } catch (e) {
        return [];
    }
  }

  // cache for child doctype metadata and options
  var childMetaCache = {};
  var optionCache = {};

  async function getChildDoctypeMeta(name) {
    if (childMetaCache[name]) return childMetaCache[name];
    var url = '/api/resource/DocType/' + encodeURIComponent(name) + '?fields=' + encodeURIComponent(JSON.stringify(['fields', 'name']));
    var res = await fetch(url, { headers: getFrappeHeaders(), credentials: 'include' });
    if (!res.ok) throw new Error('Unable to fetch child doctype ' + name);
    var json = await res.json();
    var data = json.data || json.message || json;
    childMetaCache[name] = data;
    return data;
  }

  async function fetchOptionsForField(field) {
    var key = (field.options || '') + '::' + field.fieldname;
    if (optionCache[key]) return optionCache[key];
    if (field.fieldtype === 'Select') {
      var opts = (field.options || '').split('\n').filter(Boolean);
      optionCache[key] = opts;
      return opts;
    }
    if (field.fieldtype === 'Link') {
      var q = '/api/resource/' + encodeURIComponent(field.options) + '?fields=' + encodeURIComponent(JSON.stringify(['name'])) + '&limit=200';
      var r = await fetch(q, { headers: getFrappeHeaders(), credentials: 'include' });
      if (!r.ok) return [];
      var jd = await r.json();
      var arr = (jd.data || []).map(function (x) { return x.name; });
      optionCache[key] = arr;
      return arr;
    }
    return [];
  }

  function formatDateForInput(v) {
    if (!v) return '';
    try {
      var dt = new Date(v);
      if (isNaN(dt)) return v;
      var y = dt.getFullYear();
      var m = ('0' + (dt.getMonth() + 1)).slice(-2);
      var d = ('0' + dt.getDate()).slice(-2);
      return y + '-' + m + '-' + d;
    } catch (e) { return v; }
  }

  function buildFieldInput(field, value, readOnly, childRenderers) {
    var html = '';
    var id = 'f-' + field.fieldname;
    var v = value === undefined ? (field.default || '') : value;
    var ro = readOnly ? 'disabled' : '';

    switch (field.fieldtype) {
      case 'Data':
      case 'Currency':
      case 'Int':
      case 'Float':
        html = '<input id="' + id + '" class="sh-input" type="text" value="' + esc(v) + '" ' + ro + '>'; break;
      case 'Phone': html = '<input id="' + id + '" class="sh-input" type="tel" value="' + esc(v) + '" ' + ro + '>'; break;
      case 'Date': html = '<input id="' + id + '" class="sh-input" type="date" value="' + esc(formatDateForInput(v)) + '" ' + ro + '>'; break;
      case 'Datetime': html = '<input id="' + id + '" class="sh-input" type="datetime-local" value="' + esc(v) + '" ' + ro + '>'; break;
      case 'Text': case 'Small Text': html = '<textarea id="' + id + '" class="sh-input" rows="3" ' + ro + '>' + esc(v) + '</textarea>'; break;
      case 'Select':
        var opts = (field.options || '').split('\n').filter(Boolean);
        html = '<select id="' + id + '" class="sh-input" ' + ro + '>';
        html += '<option value=""></option>';
        opts.forEach(function (opt) { html += '<option' + (opt === v ? ' selected' : '') + '>' + esc(opt) + '</option>'; });
        html += '</select>';
        break;
      case 'Link': html = '<input id="' + id + '" class="sh-input" type="text" value="' + esc(v) + '" ' + ro + ' placeholder="Link to ' + esc(field.options || '') + '">'; break;
      case 'Attach':
      case 'Attach Image':
        html = (v ? '<div style="margin-bottom:6px"><a href="' + esc(v) + '" target="_blank">View file</a></div>' : '') + '<input id="' + id + '" type="file" ' + (field.fieldtype === 'Attach Image' ? 'accept="image/*"' : '') + ' ' + ro + '>';
        break;
      case 'Table':
        html = '<div id="' + id + '-table">';
        if (childRenderers && childRenderers[field.fieldname]) html += childRenderers[field.fieldname]();
        html += '</div>';
        break;
      default:
        html = '<input id="' + id + '" class="sh-input" type="text" value="' + esc(v) + '" ' + ro + '>';
    }

    return '<div class="form-row" data-field="' + esc(field.fieldname) + '"><label class="form-label">' + esc(field.label || field.fieldname) + '</label><div>' + html + '</div></div>';
  }

  function buildChildRenderers(dt, student) {
    var res = {};
    (dt.fields || []).forEach(function (f) {
      if (f.fieldtype !== 'Table') return;
      var childDoctype = f.options;
      res[f.fieldname] = function () {
        var existing = student[f.fieldname] || [];
        return '<div class="child-table" data-child-doctype="' + esc(childDoctype) + '" data-fieldname="' + esc(f.fieldname) + '">' +
          '<div class="ct-loading">Loading...</div>' +
          '</div>';
      };
    });
    return res;
  }

  async function enhanceChildTables(containerEl) {
    var childContainers = containerEl.querySelectorAll('.child-table');
    for (var i = 0; i < childContainers.length; i++) {
      var el = childContainers[i];
      var childDoctype = el.getAttribute('data-child-doctype');
      var fieldname = el.getAttribute('data-fieldname');
      try {
        var meta = await getChildDoctypeMeta(childDoctype);
        var nonLayout = (meta.fields || []).filter(function(ff){return ['Section Break','Column Break','Tab Break'].indexOf(ff.fieldtype)===-1;});
        var candidate = null;
        for (var k=0;k<nonLayout.length;k++){
          var ff=nonLayout[k];
          if (ff.fieldname && ff.fieldname.toLowerCase()!=='idx') { candidate = ff; break; }
        }
        var existingRows = (window._student_payload && window._student_payload[fieldname]) || [];
        if (candidate && (candidate.fieldtype === 'Link' || candidate.fieldtype === 'Select' || candidate.fieldtype === 'Data')) {
          var opts = await fetchOptionsForField(candidate);
          var selected = (existingRows || []).map(function(r){ return r[candidate.fieldname]; }).filter(Boolean);
          var html = '<div class="matrix-pills" data-child="' + esc(childDoctype) + '">';
          opts.forEach(function(o){ html += '<button type="button" class="pill ' + (selected.indexOf(o)!==-1 ? 'selected' : '') + '" data-value="' + esc(o) + '">' + esc(o) + '</button>'; });
          html += '</div>';
          el.innerHTML = '<div class="ct-title">' + esc(childDoctype) + '</div>' + html;
          el.querySelectorAll('.pill').forEach(function(btn){ btn.addEventListener('click', function(){ btn.classList.toggle('selected'); }); });
        } else {
          var rowsHtml = '<div class="ct-rows">';
          (existingRows || []).forEach(function(r, idx){ rowsHtml += '<div class="ct-row">' + Object.keys(r).map(function(k){ return '<input class="ct-input" data-key="'+esc(k)+'" value="'+esc(r[k])+'">'; }).join('') + '<button type="button" class="ct-remove">Remove</button></div>'; });
          rowsHtml += '</div>';
          rowsHtml += '<button type="button" class="ct-add">Add Row</button>';
          el.innerHTML = '<div class="ct-title">' + esc(childDoctype) + '</div>' + rowsHtml;
          el.querySelectorAll('.ct-remove').forEach(function(b){ b.addEventListener('click', function(){ b.closest('.ct-row').remove(); }); });
          el.querySelector('.ct-add') && el.querySelector('.ct-add').addEventListener('click', function(){ var r=document.createElement('div'); r.className='ct-row'; r.innerHTML = '<input class="ct-input" data-key="value" placeholder="value"> <button type="button" class="ct-remove">Remove</button>'; el.querySelector('.ct-rows').appendChild(r); r.querySelector('.ct-remove').addEventListener('click', function(){ r.remove(); }); });
        }
      } catch (e) {
        el.innerHTML = '<div class="ct-error">Unable to load child table</div>';
      }
    }
  }

  async function uploadFileForField(fileInput, doctype, docname, fieldname) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return null;
    var file = fileInput.files[0];
    var fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('doctype', doctype);
    fd.append('docname', docname);
    fd.append('fieldname', fieldname);
    fd.append('is_private', '0');
    var res = await fetch('/api/method/upload_file', { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) throw new Error('Upload failed');
    var jr = await res.json();
    var msg = jr.message || {};
    return msg.file_url || msg.file_name || null;
  }

  async function render() {
    try {
      var [dtRes, summaryRes, roles] = await Promise.all([
        getDocType(),
        fetchJson('/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=' + encodeURIComponent(studentId)),
        getUserRoles()
      ]);

      var dt = dtRes.data || dtRes.message || dtRes;
      var student = summaryRes.message && summaryRes.message.student ? summaryRes.message.student : null;
      window._student_payload = student || {};
      var enrolments = summaryRes.message && summaryRes.message.enrolments ? summaryRes.message.enrolments : [];
      var feedback_forms = summaryRes.message && summaryRes.message.feedback_forms ? summaryRes.message.feedback_forms : [];

      if (!student) throw new Error('Student data not accessible');

      var isAdmin = roles.some(function (r) { return ['System Manager', 'Administrator', 'PI Admin', 'SH Admin'].indexOf(r) !== -1; });

      var docWritable = false;
      if (isAdmin) docWritable = true;
      else if (dt.permissions && Array.isArray(dt.permissions)) {
        for (var p = 0; p < dt.permissions.length; p++) {
          var perm = dt.permissions[p];
          if (perm.write && roles.indexOf(perm.role) !== -1) { docWritable = true; break; }
        }
      }

      var childRenderers = buildChildRenderers(dt, student);

      var fields = dt.fields || [];
      var html = '<div class="sh-container">';
      html += '<div class="glass-card">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center">';
      html += '<div><h2 style="margin:0">' + esc(student.student_name || student.full_name || student.name) + '</h2>';
      html += '<div style="font-size:0.9rem;color:var(--color-slate-600)">' + esc(student.skillshub_programme || '') + ' • Intake ' + esc(student.intake_year || '') + '</div></div>';
      html += '<div style="text-align:right">';
      html += '</div></div>';
      html += '<form id="sh-student-admin-form">';

      fields.forEach(function (f) {
        if (['Section Break', 'Column Break', 'Tab Break'].indexOf(f.fieldtype) !== -1) {
          if (f.fieldtype === 'Section Break') html += '<div class="section-title">' + esc(f.label || '') + '</div>';
          return;
        }
        var hideForNonAdmin = ['portal_user_account', 'user_login_email', 'airtable_student_id', 'pestalozzi_student_id', 'naming_series'];
        if (!isAdmin && hideForNonAdmin.indexOf(f.fieldname) !== -1) return;

        var value = student[f.fieldname];
        var readOnly = !(docWritable);
        if (f.read_only) readOnly = true;

        html += buildFieldInput(f, value, readOnly, childRenderers);
      });

      html += '<div style="margin-top:1rem">';
      html += '<button id="sh-save-btn" class="sh-btn-primary" ' + (docWritable ? '' : 'disabled') + '>Save</button>';
      if (isAdmin) html += '<button id="sh-delete-btn" type="button" class="sh-btn-secondary" style="margin-left:0.5rem">Delete</button>';
      html += '</div>';
      html += '</form></div>';

      html += '<div class="glass-card" style="margin-top:1rem"><div class="section-title">Enrolment Journey</div>';
      if (!enrolments.length) {
        html += '<div class="tl-item">No enrolment history found.</div>';
      } else {
        enrolments.forEach(function (e) {
          html += '<div class="tl-item">';
          html += '<div style="display:flex;justify-content:space-between;align-items:center">';
          html += '<div><div style="font-weight:600">' + esc(e.programme_schedule || e.milestone || '') + '</div>';
          html += '<div style="font-size:0.9rem;color:var(--color-slate-600)">' + esc(e.course || '') + '</div></div>';
          html += '<div style="text-align:right">';
          html += '<div class="sh-badge ' + (e.status === 'Completed' ? 'sh-badge-success' : e.status === 'Enrolled' ? 'sh-badge-enrolled' : 'sh-badge-info') + '">' + esc(e.status || '') + '</div>';
          html += '</div></div>';
          var submitted = e.feedback_forms_submitted || [];
          if (submitted.length) html += '<div style="margin-top:0.5rem">' + submitted.map(function (s) { return '<span class="sh-badge sh-badge-success" style="margin-right:0.4rem">' + esc(s) + '</span>'; }).join('') + '</div>';
          else html += '<div style="margin-top:0.5rem;color:var(--color-slate-500)">No submitted feedback</div>';
          html += '<div style="margin-top:0.6rem">';
          feedback_forms.forEach(function (ff) {
            var route = ff.route || '#';
            var href = route + '?student=' + encodeURIComponent(studentId) + '&schedule=' + encodeURIComponent(e.programme_schedule || '') + '&enrolment_ticket=' + encodeURIComponent(e.name || '');
            html += '<a class="sh-btn-secondary" style="margin-right:0.4rem" href="' + href + '">' + esc('New ' + ff.label) + '</a>';
          });
          html += '</div>';

          html += '</div>';
        });
      }
      html += '</div>';

      html += '</div>';

      document.getElementById('content').innerHTML = html;

      await enhanceChildTables(document.getElementById('content'));

      document.getElementById('sh-student-admin-form').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var btn = document.getElementById('sh-save-btn'); btn.disabled = true; btn.textContent = 'Saving...';
        try {
          var payload = {};
          fields.forEach(function (f) {
            if (['Section Break', 'Column Break', 'Tab Break'].indexOf(f.fieldtype) !== -1) return;
            var el = document.getElementById('f-' + f.fieldname);
            if (!el) return;
            if (f.fieldtype === 'Attach' || f.fieldtype === 'Attach Image') {
              if (el.files && el.files.length > 0) {
                var p = uploadFileForField(el, 'SH Student', studentId, f.fieldname).then(function (fileUrl) { payload[f.fieldname] = fileUrl; });
                payload[f.fieldname] = p;
              } else if (el.previousElementSibling && el.previousElementSibling.querySelector('a')) {
                payload[f.fieldname] = (student[f.fieldname] || '');
              } else {
                payload[f.fieldname] = '';
              }
              return;
            }
            if (f.fieldtype === 'Table') {
              var ctn = document.querySelector('.child-table[data-fieldname="' + f.fieldname + '"]');
              if (!ctn) return;
              var pills = ctn.querySelectorAll('.pill');
              if (pills && pills.length) {
                var selected = [];
                pills.forEach(function (p) { if (p.classList.contains('selected')) selected.push(p.getAttribute('data-value')); });
                var childRows = selected.map(function (v) { var row = {}; row['value'] = v; return row; });
                payload[f.fieldname] = childRows;
              } else {
                var rows = [];
                var ctrows = ctn.querySelectorAll('.ct-row');
                ctrows.forEach(function (r) {
                  var obj = {};
                  r.querySelectorAll('.ct-input').forEach(function (inp) { var k = inp.getAttribute('data-key') || 'value'; obj[k] = inp.value; });
                  rows.push(obj);
                });
                payload[f.fieldname] = rows;
              }
              return;
            }
            var val = el.value;
            if (f.fieldtype === 'Date' && val === '') val = null;
            payload[f.fieldname] = val;
          });

          var uploadPromises = [];
          Object.keys(payload).forEach(function (k) { if (payload[k] && typeof payload[k].then === 'function') uploadPromises.push(payload[k].then(function (v) { payload[k] = v; })); });
          await Promise.all(uploadPromises);

          var res = await fetch('/api/method/skillshub_core.skillshub_core.api.update_student_admin?student=' + encodeURIComponent(studentId), { method: 'POST', headers: getFrappeHeaders(), credentials: 'include', body: JSON.stringify(payload) });
          var jr = await res.json(); if (!res.ok) throw new Error(jr.message || 'Save failed');
          btn.textContent = 'Saved'; setTimeout(function () { btn.textContent = 'Save'; btn.disabled = false; }, 1200);
        } catch (e) { btn.disabled = false; btn.textContent = 'Save'; alert('Save failed: ' + (e.message || e)); }
      });

      if (isAdmin) {
        var del = document.getElementById('sh-delete-btn');
        del && del.addEventListener('click', async function () { if (!confirm('Delete this student? This is irreversible.')) return; try { await fetch('/api/method/skillshub_core.skillshub_core.api.delete_student_admin?student=' + encodeURIComponent(studentId), { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' }); alert('Deleted'); window.location.href = '/skillshub/admin/students'; } catch (e) { alert('Delete failed'); } });
      }

    } catch (err) {
      console.error(err);
      document.getElementById('content').innerHTML = '<div class="sh-container"><div class="glass-card" style="padding:2rem;color:var(--color-red-700)"><h3>Unable to render admin profile</h3><p>' + esc(err.message) + '</p></div></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () { render(); });

})();