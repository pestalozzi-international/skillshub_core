/* SkillsHub Public Portal — Forms Hub page JS */
(function () {
  'use strict';

  var state = { session: null, ctx: null };

  var api = (window.SHGate && window.SHGate.api) || function () { return Promise.reject(new Error('SHGate not loaded')); };
  var esc = (window.SHGate && window.SHGate.esc) || function (v) { return String(v || ''); };

  var SECTION_META = {
    assessment: { title: 'Assessment Forms',    icon: '📋', hint: 'These can be submitted multiple times.' },
    programme:  { title: 'Programme Feedback',  icon: '🎓', hint: 'Once per enrolment.' },
    other:      { title: 'Other Feedback',       icon: '💬', hint: 'Once per enrolment.' },
  };

  function buildStudentCard(student, enrolment) {
    var cohort = student.intake_cohort ? ('<span class="pi-badge pi-badge-sky" style="margin-left:0.5rem;">' + esc(student.intake_cohort) + '</span>') : '';
    var path   = student.programme_path ? ('<span class="pi-badge pi-badge-red" style="margin-left:0.25rem;">Path ' + esc(student.programme_path.replace('Path ','')) + '</span>') : '';
    var status = student.status ? ('<span class="pi-badge pi-badge-sand">' + esc(student.status) + '</span>') : '';
    var enrolInfo = enrolment
      ? '<div class="pi-text-xs pi-text-muted" style="margin-top:0.25rem;">Current class: <strong>' + esc(enrolment['class'] || enrolment.course || 'N/A') + '</strong></div>'
      : '<div class="pi-text-xs pi-text-muted" style="margin-top:0.25rem;">No active enrolment found.</div>';

    return '<div class="pi-card" style="margin-bottom:1.5rem;">' +
      '<div style="display:flex;align-items:center;gap:1rem;">' +
        '<div class="pi-student-avatar" style="width:3.5rem;height:3.5rem;font-size:1.2rem;">' + esc(initials(student.student_name || student.name)) + '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-size:1.1rem;font-weight:800;">' + esc(student.student_name || student.name) + '</div>' +
          '<div style="font-size:0.82rem;color:var(--pi-muted);font-family:monospace;">' + esc(student.name) + '</div>' +
          '<div style="margin-top:0.35rem;">' + status + path + cohort + '</div>' +
          enrolInfo +
        '</div>' +
        '<a href="/skillshub/s/profile?token=' + encodeURIComponent(state.session.token) + '" class="pi-btn pi-btn-ghost pi-btn-sm">Edit Profile</a>' +
      '</div>' +
    '</div>';
  }

  function buildFormItem(form) {
    var done   = !form.can_submit && form.submitted;
    var multi  = form.multi_allowed;
    var icon   = done ? '✅' : (multi ? '📝' : '📋');
    var badge  = done
      ? '<span class="pi-badge pi-badge-green">Submitted</span>'
      : (multi ? '<span class="pi-badge pi-badge-sky">Multiple allowed</span>' : '<span class="pi-badge pi-badge-sand">Once per enrolment</span>');

    var actionBtn = done
      ? '<span class="pi-badge pi-badge-green" style="padding:0.45rem 1rem;">✓ Done</span>'
      : ('<a href="' + esc(form.route) + '" class="pi-btn pi-btn-primary pi-btn-sm" style="white-space:nowrap;">' +
          (multi ? '+ Submit New' : 'Submit →') + '</a>');

    return '<div class="pi-form-item' + (done ? ' done' : '') + '">' +
      '<div class="pi-form-item-icon">' + icon + '</div>' +
      '<div class="pi-form-item-info">' +
        '<div class="pi-form-item-name">' + esc(form.label) + '</div>' +
        '<div class="pi-form-item-hint">' + badge + '</div>' +
      '</div>' +
      '<div>' + actionBtn + '</div>' +
    '</div>';
  }

  function groupBySection(forms) {
    var sections = {};
    forms.forEach(function (f) {
      if (!sections[f.section]) sections[f.section] = [];
      sections[f.section].push(f);
    });
    return sections;
  }

  function renderHub() {
    var root = document.getElementById('pi-forms-body');
    if (!root) return;
    var ctx = state.ctx;

    var html = buildStudentCard(ctx.student, ctx.enrolment);

    var sections = groupBySection(ctx.forms);
    Object.keys(sections).forEach(function (key) {
      var meta = SECTION_META[key] || { title: key, icon: '📄', hint: '' };
      html += '<div class="pi-section-label">' + meta.icon + ' ' + esc(meta.title) + '</div>';
      if (meta.hint) html += '<p class="pi-text-xs pi-text-muted" style="margin:-0.75rem 0 0.75rem;">' + esc(meta.hint) + '</p>';
      sections[key].forEach(function (f) { html += buildFormItem(f); });
    });

    if (!ctx.enrolment) {
      html += '<div class="pi-alert pi-alert-info" style="margin-top:1rem;">' +
        '<span>ℹ️</span><span>No active enrolment found. Form submission requires an active class enrolment. Please contact your programme administrator.</span>' +
      '</div>';
    }

    root.innerHTML = html;
  }

  function initials(name) {
    return (name || '?').split(' ').slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase();
  }

  function load() {
    var root = document.getElementById('pi-forms-body');
    if (root) root.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--pi-muted);">Loading your forms…</div>';

    api('/api/method/skillshub_core.skillshub_portal.api.get_public_forms_context?student_id=' +
        encodeURIComponent(state.session.sid) + '&token=' + encodeURIComponent(state.session.token))
      .then(function (ctx) {
        state.ctx = ctx;
        renderHub();
      })
      .catch(function (err) {
        if (err.message && err.message.includes('expired')) {
          window.SHGate && window.SHGate.clearSession();
          location.reload();
          return;
        }
        if (root) root.innerHTML = '<div class="pi-alert pi-alert-error">' + esc(err.message) + '</div>';
      });
  }

  window.addEventListener('sh-gate-open', function (e) {
    state.session = e.detail;
    load();
  });
}());
