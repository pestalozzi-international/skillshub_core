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
  if (!studentId) { window.location.replace('/skillshub/login'); return; }

  var ctx = {};

  function showError(msg) {
    document.getElementById('sh-error').textContent = msg;
    document.getElementById('sh-error').style.display = 'block';
    document.getElementById('sh-loading').style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    Promise.all([
      fetch('/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=' + encodeURIComponent(studentId),
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); }),
      fetch('/api/resource/SkillsHub Programme?fields=["name"]&limit=20',
        { headers: getFrappeHeaders(), credentials: 'include' }).then(function (r) { return r.json(); })
    ])
    .then(function (results) {
      var s = results[0].message.student;
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
        student_full_name: ctx.student_name || ctx.full_name,
        programme_schedule: ctx.current_schedule,
        milestone: document.getElementById('milestone').value,
        goals: document.getElementById('goals').value,
        challenges: document.getElementById('challenges').value
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
}());
