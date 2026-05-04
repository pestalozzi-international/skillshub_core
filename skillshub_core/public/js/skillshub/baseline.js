(function () {
  'use strict';

  function getFrappeHeaders() {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (window.frappe && frappe.csrf_token && frappe.csrf_token !== 'None' && !frappe.csrf_token.includes('{{')) {
        headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
}

  var studentId = localStorage.getItem('sh_student_id');

  var ctx = {};

  function showError(msg) {
    document.getElementById('sh-error').textContent = msg;
    document.getElementById('sh-error').style.display = 'block';
    document.getElementById('sh-loading').style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    Promise.all([
      fetch('/api/method/skillshub_core.skillshub_core.api.get_portal_student_context',
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); }),
      fetch('/api/resource/SkillsHub Programme?fields=["name"]&limit=20',
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); }),
      fetch('/api/resource/SH Student Motivation?fields=["name"]&limit=200',
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); }),
      fetch('/api/resource/SH Student Resilience?fields=["name"]&limit=200',
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); }),
      fetch('/api/resource/SH Student Community Challenge?fields=["name"]&limit=200',
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); })
    ])
    .then(function (results) {
      var s = results[0].message.student;
      studentId = s.name || s.id || studentId;
      ctx = s;
      document.getElementById('ctx-id').textContent   = studentId;
      document.getElementById('ctx-name').textContent = s.student_name || s.full_name || '-';
      var sel = document.getElementById('milestone');
      (results[1].data || []).forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.name; opt.textContent = p.name;
        if (p.name === s.skillshub_programme) opt.selected = true;
        sel.appendChild(opt);
      });

      populateMulti('motivation-multi', results[2].data || []);
      populateMulti('resilience-multi', results[3].data || []);
      populateMulti('challenge-multi', results[4].data || []);

      document.getElementById('sh-loading').style.display = 'none';
      document.getElementById('sh-baseline-form').style.display = 'block';
    })
    .catch(function () { showError('Error loading form. Please try again.'); });

    var form = document.getElementById('sh-baseline-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('sh-submit-btn');
      btn.disabled = true; btn.textContent = 'Submitting...';
      document.getElementById('sh-error').style.display = 'none';
      var fields = ['self_confidence','communication','teamwork','problem_solving','leadership','financial_literacy','employment_readiness'];
      var payload = {
        doctype: 'SH Student Baseline Form',
        sh_student: studentId,
          enrolment_ticket: ctx.current_enrolment || null,
        student_full_name: ctx.student_name || ctx.full_name,
        programme_schedule: ctx.current_schedule,
        milestone: document.getElementById('milestone').value,
        goals: document.getElementById('goals').value,
        challenges: document.getElementById('challenges').value,
        student_motivation_table: selectedValues('motivation-multi').map(function (name) { return { motivation: name }; }),
        resilience_table: selectedValues('resilience-multi').map(function (name) { return { resilience_statement: name }; }),
        community_challenge_table: selectedValues('challenge-multi').map(function (name) { return { challenge: name, milestone: document.getElementById('milestone').value }; })
      };
      fields.forEach(function (f) {
        var el = document.getElementById('r-' + f);
        payload[f] = el ? parseInt(el.value) || 0 : 0;
      });
      fetch('/api/resource/SH Student Baseline Form', {
        method: 'POST',
        headers: getFrappeHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      .then(function (r) {
        if (!r.ok) throw new Error('Failed');
        document.getElementById('sh-success').style.display = 'block';
        btn.textContent = 'Submitted';
      })
      .catch(function () {
        showError('Submission failed. Please try again.');
        btn.disabled = false; btn.textContent = 'Submit Baseline';
      });
    });
  });

  function populateMulti(id, rows) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    rows.forEach(function (row) {
      var opt = document.createElement('option');
      opt.value = row.name;
      opt.textContent = row.name;
      el.appendChild(opt);
    });
  }

  function selectedValues(id) {
    var el = document.getElementById(id);
    if (!el) return [];
    return Array.from(el.selectedOptions || []).map(function (o) { return o.value; }).filter(Boolean);
  }
}());
