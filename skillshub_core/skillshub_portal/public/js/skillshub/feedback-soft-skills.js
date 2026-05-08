(function () {
  'use strict';

  function getFrappeHeaders() {
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (window.frappe && frappe.csrf_token && frappe.csrf_token !== 'None' && !frappe.csrf_token.includes('{{')) {
      headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
  }

  var urlParams          = new URLSearchParams(window.location.search);
  var urlStudent         = urlParams.get('student');
  var urlSchedule        = urlParams.get('schedule');
  var urlEnrolmentTicket = urlParams.get('enrolment_ticket');

  var studentId = urlStudent || localStorage.getItem('sh_student_id');
  var ctx = {};

  function showError(msg) {
    document.getElementById('sh-error').textContent = msg;
    document.getElementById('sh-error').style.display = 'block';
    document.getElementById('sh-loading').style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/method/skillshub_core.skillshub_core.api.get_portal_student_context' +
      (urlStudent ? '?student=' + encodeURIComponent(urlStudent) : ''),
      { headers: getFrappeHeaders(), credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var s = data && data.message && data.message.student ? data.message.student : null;
      if (!s) throw new Error('Unable to fetch student context');
      ctx = s; studentId = s.name || s.id || studentId;

      var schedule        = urlSchedule        || s.current_schedule  || '';
      var enrolmentTicket = urlEnrolmentTicket || s.current_enrolment || '';

      try { document.getElementById('ctx-id').textContent        = studentId; }       catch(e){}
      try { document.getElementById('ctx-name').textContent      = s.student_name || s.full_name || '-'; } catch(e){}
      try { document.getElementById('ctx-schedule').textContent  = schedule; }        catch(e){}
      try { document.getElementById('ctx-enrolment').textContent = enrolmentTicket; } catch(e){}

      var form = document.getElementById('sh-feedback-form');
      if (form) {
        form.dataset.schedule        = schedule;
        form.dataset.enrolmentTicket = enrolmentTicket;
      }

      return fetch('/api/resource/SkillsHub Soft Skills?fields=["name"]&limit=100',
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); });
    })
    .then(function (skills) {
      var group = document.getElementById('skills-group');
      group.innerHTML = '';
      (skills.data || []).forEach(function (sk) {
        var d = document.createElement('div'); d.className = 'checkbox-item';
        var inp = document.createElement('input'); inp.type = 'checkbox'; inp.id = 'sk-' + sk.name; inp.value = sk.name; inp.className = 'skill-cb';
        var lbl = document.createElement('label'); lbl.htmlFor = 'sk-' + sk.name; lbl.textContent = sk.name;
        d.appendChild(inp); d.appendChild(lbl); group.appendChild(d);
      });
      document.getElementById('sh-loading').style.display = 'none';
      document.getElementById('sh-feedback-form').style.display = 'block';
    })
    .catch(function (err) { showError('Error loading form.'); console.error(err); });

    var form = document.getElementById('sh-feedback-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('sh-submit-btn');
      btn.disabled = true; btn.textContent = 'Submitting...';
      document.getElementById('sh-error').style.display = 'none';

      var schedule        = form.dataset.schedule        || ctx.current_schedule  || '';
      var enrolmentTicket = form.dataset.enrolmentTicket || ctx.current_enrolment || null;

      var skills = [];
      document.querySelectorAll('.skill-cb:checked').forEach(function (cb) { skills.push({ skill: cb.value }); });

      fetch('/api/resource/SH Soft Skills Feedback', {
        method: 'POST', headers: getFrappeHeaders(), credentials: 'include',
        body: JSON.stringify({
          doctype:            'SH Soft Skills Feedback',
          sh_student:         studentId,
          enrolment_ticket:   enrolmentTicket || null,
          student_full_name:  ctx.student_name || ctx.full_name,
          programme_schedule: schedule,
          skills_covered:     skills,
          enjoyed_most:       document.getElementById('enjoyed_most').value,
          key_learning:       document.getElementById('key_learning').value,
          apply_learning:     document.getElementById('apply_learning').value,
          trainer_feedback:   document.getElementById('trainer_feedback').value
        })
      })
      .then(function (r) {
        if (!r.ok) throw new Error('Failed');
        document.getElementById('sh-success').style.display = 'block'; btn.textContent = 'Submitted';
      })
      .catch(function () { showError('Submission failed.'); btn.disabled = false; btn.textContent = 'Submit Feedback'; });
    });
  });
}());
