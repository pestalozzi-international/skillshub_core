(function () {
  'use strict';

  function getFrappeHeaders() {
      let csrfToken = '';
      if (window.frappe && frappe.csrf_token) {
          csrfToken = frappe.csrf_token;
      } else {
          const match = document.cookie.match(new RegExp('(^| )system_user=([^;]+)'));
          if (match) csrfToken = decodeURIComponent(match[2]);
      }
      return {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': csrfToken
      };
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
    fetch('/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=' + encodeURIComponent(studentId),
      { headers: getFrappeHeaders(), credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var s = data.message.student; ctx = s;
      document.getElementById('ctx-id').textContent       = studentId;
      document.getElementById('ctx-name').textContent     = s.student_name || s.full_name || '-';
      document.getElementById('ctx-schedule').textContent = s.current_schedule || '-';
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
    .catch(function () { showError('Error loading form.'); });

    var form = document.getElementById('sh-feedback-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('sh-submit-btn');
      btn.disabled = true; btn.textContent = 'Submitting...';
      document.getElementById('sh-error').style.display = 'none';
      var skills = [];
      document.querySelectorAll('.skill-cb:checked').forEach(function (cb) { skills.push({ skill: cb.value }); });
      fetch('/api/resource/SH Soft Skills Feedback', {
        method: 'POST', headers: getFrappeHeaders(), credentials: 'include',
        body: JSON.stringify({
          doctype: 'SH Soft Skills Feedback', sh_student: studentId,
          student_full_name: ctx.student_name || ctx.full_name,
          programme_schedule: ctx.current_schedule, skills_covered: skills,
          enjoyed_most:    document.getElementById('enjoyed_most').value,
          key_learning:    document.getElementById('key_learning').value,
          apply_learning:  document.getElementById('apply_learning').value,
          trainer_feedback: document.getElementById('trainer_feedback').value
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
