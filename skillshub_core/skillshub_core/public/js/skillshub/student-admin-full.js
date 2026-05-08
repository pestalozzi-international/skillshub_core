(function () {
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
    var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML;
  }

  function fmtDate(d) {
    if (!d) return '—';
    var dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function badge(text, type) {
    return '<span class="sh-badge sh-badge-' + (type || 'info') + '">' + esc(text) + '</span>';
  }

  function row(label, value) {
    return '<div class="data-row"><div class="data-label">' + esc(label) + '</div><div class="data-value">' + (value || '—') + '</div></div>';
  }

  var params = new URLSearchParams(window.location.search);
  var studentId = params.get('id') || params.get('student');

  async function fetchJson(url) {
    var r = await fetch(url, { headers: getFrappeHeaders(), credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url);
    return r.json();
  }

  async function postJson(url, body) {
    var r = await fetch(url, {
      method: 'POST',
      headers: getFrappeHeaders(),
      credentials: 'include',
      body: JSON.stringify(body)
    });
    var jr = await r.json();
    if (!r.ok) throw new Error((jr && jr.message) || 'HTTP ' + r.status);
    return jr;
  }

  async function getUserRoles() {
    try {
      var jr = await fetchJson('/api/method/skillshub_core.skillshub_core.api.get_current_user_roles');
      return jr.message || [];
    } catch (e) { return []; }
  }

  // Fetch all submitted feedback for a student across all feedback doctypes
  async function fetchSubmittedFeedback(studentId) {
    var doctypes = [
      { doctype: 'SH Baseline',                   label: 'Baseline Assessment',         route: '/skillshub/baseline',                       studentField: 'sh_student' },
      { doctype: 'SH Soft Skills Feedback',                    label: 'Soft Skills Feedback',         route: '/skillshub/feedback/soft-skills',            studentField: 'sh_student' },
      { doctype: 'SH Mindset Camp Feedback',                   label: 'Mindset Camp Feedback',        route: '/skillshub/feedback/mindset-camp',           studentField: 'sh_student' },
      { doctype: 'SkillsHub Edulution Feedback',               label: 'Edulution Feedback',           route: '/skillshub/feedback/edulution',              studentField: 'sh_student' },
      { doctype: 'SkillsHub Vocational Training Feedback',     label: 'Vocational Training Feedback', route: '/skillshub/feedback/vocational-training',    studentField: 'sh_student' },
      { doctype: 'ZM SkillsHub Attachment Feedback',           label: 'Attachment Feedback',          route: '/skillshub/feedback/attachment',             studentField: 'sh_student' },
    ];
    var results = [];
    await Promise.all(doctypes.map(async function (spec) {
      try {
        var filters = JSON.stringify([[spec.studentField, '=', studentId]]);
        var fields = JSON.stringify(['name', spec.studentField, 'programme_schedule', 'enrolment_ticket', 'creation']);
        var url = '/api/resource/' + encodeURIComponent(spec.doctype) +
          '?filters=' + encodeURIComponent(filters) +
          '&fields=' + encodeURIComponent(fields) +
          '&limit=50&order_by=creation desc';
        var jr = await fetch(url, { headers: getFrappeHeaders(), credentials: 'include' });
        if (!jr.ok) return;
        var data = await jr.json();
        (data.data || []).forEach(function (rec) {
          results.push(Object.assign({}, rec, { _label: spec.label, _route: spec.route, _doctype: spec.doctype }));
        });
      } catch (e) { /* skip doctype if not accessible */ }
    }));
    results.sort(function (a, b) { return (b.creation || '').localeCompare(a.creation || ''); });
    return results;
  }

  async function render() {
    var content = document.getElementById('content');
    if (!studentId) {
      content.innerHTML = '<div class="sh-container"><div class="glass-card" style="padding:2rem;text-align:center">Student ID missing from URL.</div></div>';
      return;
    }

    try {
      var [summaryRes, roles, submittedFeedback] = await Promise.all([
        fetchJson('/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=' + encodeURIComponent(studentId)),
        getUserRoles(),
        fetchSubmittedFeedback(studentId)
      ]);

      var msg = summaryRes.message || {};
      var student = msg.student;
      if (!student) throw new Error('Student not found or not accessible.');

      var enrolments = msg.enrolments || [];
      var employment = msg.employment_history || [];
      var feedback_forms = msg.feedback_forms || [];

      var ADMIN_ROLES = ['System Manager', 'Administrator', 'PI Admin', 'SH Admin', 'SkillsHub Admin'];
      var isAdmin = roles.some(function (r) { return ADMIN_ROLES.indexOf(r) !== -1; });

      // ── HEADER ───────────────────────────────────────────────────────────
      var html = '<div class="sh-page-header sh-animate-fade"><div class="sh-container">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">';
      html += '<div>';
      html += '<h1 style="margin:0">' + esc(student.student_name || student.full_name || student.name) + '</h1>';
      html += '<div style="color:var(--color-slate-200);margin-top:0.25rem">' +
        esc(student.skillshub_programme || '') + ' • Intake ' + esc(student.intake_year || '—') + '</div>';
      html += '</div>';
      html += '<div style="display:flex;gap:0.75rem;flex-wrap:wrap">';
      html += '<a href="/skillshub/admin/students" class="nav-btn">← Students</a>';
      if (isAdmin) html += '<button id="sh-edit-btn" class="nav-btn">Edit Student</button>';
      html += '<button id="sh-logout-btn" class="nav-btn logout-btn" onclick="fetch(\'/api/method/logout\',{method:\'POST\'}).finally(()=>{localStorage.clear();window.location.replace(\'/skillshub/login\');})">Sign Out</button>';
      html += '</div></div></div></div>';

      html += '<div class="sh-container" style="padding-top:1.5rem">';

      // ── ROW 1: Demographics + Status ─────────────────────────────────────
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">';

      html += '<div class="glass-card sh-animate-fade">';
      html += '<div class="section-title">Demographics</div>';
      html += row('Student ID', esc(student.name));
      html += row('Full Name', esc(student.student_name));
      html += row('Date of Birth', fmtDate(student.date_of_birth));
      html += row('Gender', esc(student.gender));
      html += row('NRC Number', esc(student.nrc_number));
      html += '</div>';

      html += '<div class="glass-card sh-animate-fade">';
      html += '<div class="section-title">Status & Programme</div>';
      html += '<div class="data-row"><div class="data-label">Status</div><div class="data-value">' + badge(student.status, student.status === 'Student' ? 'success' : 'info') + '</div></div>';
      html += row('Programme', esc(student.skillshub_programme));
      html += row('Path', esc(student.programme_path));
      html += row('Current Cohort', esc(student.current_cohort));
      html += row('Current Schedule', esc(student.current_schedule));
      if (isAdmin) {
        html += row('Login Email', esc(student.user_login_email || student.personal_email));
        html += row('Portal Account', esc(student.portal_user_account));
      }
      html += '</div>';

      html += '</div>'; // end row 1 grid

      // ── ROW 2: Contact ───────────────────────────────────────────────────
      html += '<div class="glass-card sh-animate-fade" style="margin-bottom:1rem">';
      html += '<div class="section-title">Contact Information</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">';
      html += row('Mobile', esc(student.mobile));
      html += row('Personal Email', esc(student.personal_email));
      html += row('Address', esc([student.address_line_1, student.address_line_2, student.pincode].filter(Boolean).join(', ')));
      html += row('Guardian', esc(student.guardian_name));
      html += row('Guardian Mobile', esc(student.guardian_mobile_number));
      html += '</div></div>';

      // ── ROW 3: Enrolment Journey ──────────────────────────────────────────
      html += '<div class="glass-card sh-animate-fade" style="margin-bottom:1rem">';
      html += '<div class="section-title">Enrolment Journey</div>';
      if (!enrolments.length) {
        html += '<div style="color:var(--color-slate-500);padding:1rem 0">No enrolment history.</div>';
      } else {
        enrolments.forEach(function (e) {
          var statusType = e.status === 'Completed' ? 'success' : e.status === 'Enrolled' ? 'enrolled' : 'info';
          html += '<div class="tl-item" style="padding:1rem 0;border-bottom:1px solid var(--color-slate-100)">';
          html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem">';
          html += '<div>';
          html += '<div style="font-weight:600">' + esc(e.programme_schedule || e.milestone || '—') + '</div>';
          if (e.course) html += '<div style="font-size:0.85rem;color:var(--color-slate-500)">' + esc(e.course) + '</div>';
          html += '<div style="font-size:0.8rem;color:var(--color-slate-400);margin-top:0.2rem">' + fmtDate(e.enrolment_date) + (e.completion_date ? ' → ' + fmtDate(e.completion_date) : '') + '</div>';
          html += '</div>';
          html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem">';
          html += badge(e.status || '—', statusType);
          if (e.attendance_rate != null) html += badge(Math.round(e.attendance_rate) + '% Att.', 'info');
          html += '</div></div>';

          // Submitted feedback for this enrolment
          var submittedForEnrolment = submittedFeedback.filter(function (f) {
            return f.programme_schedule === e.programme_schedule || f.enrolment_ticket === e.name;
          });
          if (submittedForEnrolment.length) {
            html += '<div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.4rem">';
            submittedForEnrolment.forEach(function (f) {
              var viewUrl = '/api/resource/' + encodeURIComponent(f._doctype) + '/' + encodeURIComponent(f.name);
              html += '<span class="sh-badge sh-badge-success" title="Submitted: ' + esc(f.creation) + '">✓ ' + esc(f._label) + '</span>';
            });
            html += '</div>';
          } else {
            html += '<div style="margin-top:0.4rem;font-size:0.8rem;color:var(--color-slate-400)">No feedback submitted for this schedule</div>';
          }

          // Links to add new feedback
          if (isAdmin && feedback_forms.length) {
            html += '<div style="margin-top:0.6rem;display:flex;flex-wrap:wrap;gap:0.4rem">';
            feedback_forms.forEach(function (ff) {
              var href = ff.route + '?student=' + encodeURIComponent(studentId) +
                '&schedule=' + encodeURIComponent(e.programme_schedule || '') +
                '&enrolment_ticket=' + encodeURIComponent(e.name || '');
              html += '<a class="sh-btn-secondary" style="font-size:0.8rem;padding:0.3rem 0.75rem" href="' + esc(href) + '">+ ' + esc(ff.label) + '</a>';
            });
            html += '</div>';
          }

          html += '</div>';
        });
      }
      html += '</div>';

      // ── ROW 4: All Submitted Feedback ────────────────────────────────────
      html += '<div class="glass-card sh-animate-fade" style="margin-bottom:1rem">';
      html += '<div class="section-title">Submitted Feedback Records</div>';
      if (!submittedFeedback.length) {
        html += '<div style="color:var(--color-slate-500);padding:0.5rem 0">No feedback records submitted yet.</div>';
      } else {
        html += '<table style="width:100%;border-collapse:collapse;font-size:0.9rem">';
        html += '<thead><tr style="text-align:left;border-bottom:2px solid var(--color-slate-200)">';
        html += '<th style="padding:0.5rem 0.75rem">Type</th><th style="padding:0.5rem 0.75rem">Schedule</th><th style="padding:0.5rem 0.75rem">Submitted</th>';
        if (isAdmin) html += '<th style="padding:0.5rem 0.75rem">Action</th>';
        html += '</tr></thead><tbody>';
        submittedFeedback.forEach(function (f) {
          html += '<tr style="border-bottom:1px solid var(--color-slate-100)">';
          html += '<td style="padding:0.5rem 0.75rem">' + badge(f._label, 'success') + '</td>';
          html += '<td style="padding:0.5rem 0.75rem">' + esc(f.programme_schedule || '—') + '</td>';
          html += '<td style="padding:0.5rem 0.75rem">' + fmtDate(f.creation) + '</td>';
          if (isAdmin) {
            html += '<td style="padding:0.5rem 0.75rem"><a class="sh-btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.6rem" href="/app/' +
              encodeURIComponent(f._doctype.toLowerCase().replace(/ /g, '-')) + '/' +
              encodeURIComponent(f.name) + '" target="_blank">View in Desk</a></td>';
          }
          html += '</tr>';
        });
        html += '</tbody></table>';
      }
      html += '</div>';

      // ── ROW 5: Employment History ─────────────────────────────────────────
      html += '<div class="glass-card sh-animate-fade" style="margin-bottom:1rem">';
      html += '<div class="section-title">Employment History</div>';
      if (!employment.length) {
        html += '<div style="color:var(--color-slate-500);padding:0.5rem 0">No employment history recorded.</div>';
      } else {
        employment.forEach(function (e) {
          html += '<div style="padding:0.75rem 0;border-bottom:1px solid var(--color-slate-100)">';
          html += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';
          html += '<div><div style="font-weight:600">' + esc(e.occupation || e.role || '—') + '</div>';
          html += '<div style="color:var(--color-slate-600);font-size:0.9rem">' + esc(e.institution || '') + '</div>';
          if (e.monthly_salary_zmw) html += '<div style="font-size:0.85rem;color:var(--color-slate-500)">ZMW ' + esc(e.monthly_salary_zmw) + '/mo</div>';
          html += '</div>';
          html += '<div style="text-align:right;font-size:0.8rem;color:var(--color-slate-400)">';
          html += fmtDate(e.start_date) + (e.end_date ? ' → ' + fmtDate(e.end_date) : ' → Present');
          if (e.is_current) html += '<br>' + badge('Current', 'success');
          html += '</div></div>';
          if (e.notes) html += '<div style="margin-top:0.4rem;font-size:0.8rem;color:var(--color-slate-500)">' + esc(e.notes) + '</div>';
          html += '</div>';
        });
      }
      html += '</div>';

      html += '</div>'; // end sh-container

      // ── EDIT MODAL ────────────────────────────────────────────────────────
      if (isAdmin) {
        html += '<div id="sh-edit-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;overflow:auto">';
        html += '<div style="background:white;max-width:700px;margin:2rem auto;border-radius:12px;padding:2rem">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">';
        html += '<h2 style="margin:0">Edit Student</h2>';
        html += '<button id="sh-modal-close" style="background:none;border:none;font-size:1.5rem;cursor:pointer">&times;</button>';
        html += '</div>';
        html += '<form id="sh-edit-form">';
        var editFields = [
          { name: 'student_name', label: 'Student Full Name', type: 'text' },
          { name: 'mobile', label: 'Mobile', type: 'tel' },
          { name: 'personal_email', label: 'Personal Email', type: 'email' },
          { name: 'address_line_1', label: 'Address Line 1', type: 'text' },
          { name: 'address_line_2', label: 'Address Line 2', type: 'text' },
          { name: 'pincode', label: 'Postcode', type: 'text' },
          { name: 'guardian_name', label: 'Guardian Name', type: 'text' },
          { name: 'guardian_mobile_number', label: 'Guardian Mobile', type: 'tel' },
          { name: 'nrc_number', label: 'NRC Number', type: 'text' },
          { name: 'gender', label: 'Gender', type: 'select', options: ['', 'Male', 'Female', 'Other', 'Prefer not to say'] },
          { name: 'status', label: 'Status', type: 'select', options: ['', 'Student', 'Graduated', 'Dropped Out', 'On Hold'] },
          { name: 'programme_path', label: 'Programme Path', type: 'select', options: ['', 'Path A', 'Path B'] },
          { name: 'portal_user_account', label: 'Portal User Account', type: 'text' },
          { name: 'user_login_email', label: 'Login Email', type: 'email' },
        ];
        editFields.forEach(function (f) {
          html += '<div class="sh-input-group" style="margin-bottom:1rem">';
          html += '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.3rem">' + esc(f.label) + '</label>';
          if (f.type === 'select') {
            html += '<select name="' + esc(f.name) + '" class="sh-input">';
            f.options.forEach(function (o) {
              html += '<option value="' + esc(o) + '"' + (student[f.name] === o ? ' selected' : '') + '>' + esc(o || '—') + '</option>';
            });
            html += '</select>';
          } else {
            html += '<input type="' + esc(f.type) + '" name="' + esc(f.name) + '" class="sh-input" value="' + esc(student[f.name] || '') + '">';
          }
          html += '</div>';
        });
        html += '<div style="margin-top:1.5rem;display:flex;gap:0.75rem">';
        html += '<button type="submit" class="sh-btn-primary" id="sh-save-btn">Save Changes</button>';
        html += '<button type="button" id="sh-modal-cancel" class="sh-btn-secondary">Cancel</button>';
        html += '<button type="button" id="sh-delete-btn" class="sh-btn-secondary" style="margin-left:auto;color:var(--color-red-600)">Delete Student</button>';
        html += '</div></form></div></div>';
      }

      content.innerHTML = html;

      // ── WIRE UP EVENTS ────────────────────────────────────────────────────
      if (isAdmin) {
        var modal = document.getElementById('sh-edit-modal');
        document.getElementById('sh-edit-btn').addEventListener('click', function () {
          modal.style.display = 'block';
        });
        document.getElementById('sh-modal-close').addEventListener('click', function () { modal.style.display = 'none'; });
        document.getElementById('sh-modal-cancel').addEventListener('click', function () { modal.style.display = 'none'; });
        modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });

        document.getElementById('sh-edit-form').addEventListener('submit', async function (ev) {
          ev.preventDefault();
          var btn = document.getElementById('sh-save-btn');
          btn.disabled = true; btn.textContent = 'Saving...';
          try {
            var fd = new FormData(ev.target);
            var payload = {};
            fd.forEach(function (v, k) { payload[k] = v; });
            await postJson('/api/method/skillshub_core.skillshub_core.api.update_student_admin?student=' + encodeURIComponent(studentId), payload);
            btn.textContent = 'Saved!';
            setTimeout(function () { window.location.reload(); }, 800);
          } catch (e) {
            btn.disabled = false; btn.textContent = 'Save Changes';
            alert('Save failed: ' + (e.message || e));
          }
        });

        document.getElementById('sh-delete-btn').addEventListener('click', async function () {
          if (!confirm('Permanently delete this student? This cannot be undone.')) return;
          try {
            await postJson('/api/method/skillshub_core.skillshub_core.api.delete_student_admin?student=' + encodeURIComponent(studentId), {});
            alert('Student deleted.');
            window.location.href = '/skillshub/admin/students';
          } catch (e) { alert('Delete failed: ' + (e.message || e)); }
        });
      }

    } catch (err) {
      console.error(err);
      content.innerHTML = '<div class="sh-container"><div class="glass-card" style="padding:2rem;color:var(--color-red-700)">' +
        '<h3>Unable to load student profile</h3><p>' + esc(err.message) + '</p>' +
        '<a href="/skillshub/admin/students" class="sh-btn-secondary">← Back to Students</a>' +
        '</div></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () { render(); });

})();
