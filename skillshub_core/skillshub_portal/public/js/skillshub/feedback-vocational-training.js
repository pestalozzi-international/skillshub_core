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
      try { document.getElementById('ctx-path').textContent      = s.programme_path || '-'; } catch(e){}

      var form = document.getElementById('sh-feedback-form');
      if (form) { form.dataset.schedule = schedule; form.dataset.enrolmentTicket = enrolmentTicket; }

      return fetch('/api/resource/SH VT Course Expectation?fields=["name"]&limit=50',
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); });
    })
    .then(function (exps) {
      var group = document.getElementById('expectations-group');
      if (group) {
        group.innerHTML = '';
        (exps.data || []).forEach(function (ex) {
          var d = document.createElement('div'); d.className = 'checkbox-item';
          var inp = document.createElement('input'); inp.type = 'checkbox'; inp.id = 'exp-' + ex.name; inp.value = ex.name; inp.className = 'exp-cb';
          var lbl = document.createElement('label'); lbl.htmlFor = 'exp-' + ex.name; lbl.textContent = ex.name;
          d.appendChild(inp); d.appendChild(lbl); group.appendChild(d);
        });
      }
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

      var exps = [];
      document.querySelectorAll('.exp-cb:checked').forEach(function (cb) { exps.push({ expectation: cb.value }); });

      var sFields = ['problem_solving', 'time_management', 'teamwork', 'mental_resilience'];
      var payload = {
        doctype:                  'SH VT Feedback',
        sh_student:               studentId,
        enrolment_ticket:         enrolmentTicket || null,
        student_full_name:        ctx.student_name || ctx.full_name,
        programme_schedule:       schedule,
        course_expectations:      exps,
        course_met_expectations:  document.getElementById('met_expectations').value,
        objective_comms_rating:   parseInt(document.getElementById('r-objective_comms').value) || 3,
        trainer_comms_rating:     parseInt(document.getElementById('r-trainer_comms').value) || 3,
        goals:                    document.getElementById('goals').value,
        volunteering:             document.getElementById('volunteering').checked ? 1 : 0
      };
      sFields.forEach(function (f) {
        var el = document.getElementById('r-' + f);
        payload[f] = el ? parseInt(el.value) || 0 : 0;
      });

      fetch('/api/resource/SH VT Feedback', {
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
