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
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var s = data.message.student; ctx = s; studentId = s.name || s.id || studentId;

      if (s.programme_path === 'Path B') {
        document.getElementById('sh-loading').style.display = 'none';
        document.getElementById('sh-path-b-msg').style.display = 'block';
        return;
      }

      var schedule        = urlSchedule        || s.current_schedule  || '';
      var enrolmentTicket = urlEnrolmentTicket || s.current_enrolment || '';

      try { document.getElementById('ctx-id').textContent        = studentId; }       catch(e){}
      try { document.getElementById('ctx-name').textContent      = s.student_name || s.full_name || '-'; } catch(e){}
      try { document.getElementById('ctx-schedule').textContent  = schedule; }        catch(e){}
      try { document.getElementById('ctx-path').textContent      = s.programme_path || '-'; } catch(e){}
      try { document.getElementById('ctx-enrolment').textContent = enrolmentTicket; } catch(e){}

      var form = document.getElementById('sh-feedback-form');
      if (form) { form.dataset.schedule = schedule; form.dataset.enrolmentTicket = enrolmentTicket; }

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

      var rFields = ['confidence','literacy','numeracy','resilience','problem_solving'];
      var payload = {
        doctype:            'SkillsHub Edulution Feedback',
        sh_student:         studentId,
        enrolment_ticket:   enrolmentTicket || null,
        student_full_name:  ctx.student_name || ctx.full_name,
        programme_schedule: schedule,
        goals_achieved:     document.getElementById('goals_achieved').value,
        skills_learned:     document.getElementById('skills_learned').value,
        impact_statement:   document.getElementById('impact_statement').value,
        coaching_opt_in:    document.getElementById('coaching_opt_in').checked ? 1 : 0
      };
      rFields.forEach(function (f) {
        var el = document.getElementById('r-' + f);
        payload[f] = el ? parseInt(el.value) || 0 : 0;
      });

      fetch('/api/resource/SkillsHub Edulution Feedback', {
        method: 'POST', headers: getFrappeHeaders(), credentials: 'include',
        body: JSON.stringify(payload)
      })
      .then(function (r) {
        if (!r.ok) throw new Error('Failed');
        document.getElementById('sh-success').style.display = 'block'; btn.textContent = 'Submitted';
      })
      .catch(function () { showError('Submission failed.'); btn.disabled = false; btn.textContent = 'Submit Feedback'; });
    });
  });
}());
