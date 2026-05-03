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

  function clearAndRedirect() {
    localStorage.removeItem('sh_student_id');
    localStorage.removeItem('sh_role');
    localStorage.removeItem('sh_user');
    localStorage.removeItem('sh_display_user');
    window.location.replace('/skillshub/login');
  }

  var studentId = localStorage.getItem('sh_student_id');
  if (!studentId) { window.location.replace('/skillshub/login'); return; }

  document.addEventListener('DOMContentLoaded', function () {
    fetchStudentSummary();

    document.getElementById('logout-btn').addEventListener('click', function () {
      fetch('/api/method/logout', { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' })
        .finally(function () { localStorage.clear(); window.location.replace('/skillshub/login'); });
    });

    document.getElementById('edit-contact-btn').addEventListener('click', function () {
      document.getElementById('contact-form').classList.add('show');
    });

    document.getElementById('cancel-contact-btn').addEventListener('click', function (e) {
      e.preventDefault();
      document.getElementById('contact-form').classList.remove('show');
      document.getElementById('contact-message').style.display = 'none';
    });

    document.getElementById('contact-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var msgDiv  = document.getElementById('contact-message');
      var saveBtn = document.querySelector('#contact-form [type="submit"]');
      msgDiv.style.display = 'none';
      saveBtn.disabled     = true;
      saveBtn.textContent  = 'Saving...';

      var payload = {
        address_line_1: document.getElementById('contact-address-1').value.trim(),
        address_line_2: document.getElementById('contact-address-2').value.trim(),
        pincode:        document.getElementById('contact-pincode').value.trim()
      };

      fetch('/api/resource/SH Student/' + encodeURIComponent(studentId), {
        method: 'PUT',
        headers: getFrappeHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) { clearAndRedirect(); return null; }
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.exception || d.message || 'Update failed'); });
        msgDiv.className     = 'contact-message success';
        msgDiv.textContent   = 'Address updated successfully.';
        msgDiv.style.display = 'block';
        setTimeout(function () {
          document.getElementById('contact-form').classList.remove('show');
          fetchStudentSummary();
        }, 1400);
      })
      .catch(function (err) {
        msgDiv.className     = 'contact-message error';
        msgDiv.textContent   = 'Could not save: ' + err.message;
        msgDiv.style.display = 'block';
      })
      .finally(function () {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save';
      });
    });
  });

  function fetchStudentSummary() {
    fetch(
      '/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=' + encodeURIComponent(studentId),
      { headers: getFrappeHeaders(), credentials: 'include' }
    )
    .then(function (r) {
      if (r.status === 401) { clearAndRedirect(); return null; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data) return;
      renderProfile(data.message.student, data.message.enrolments || []);
    })
    .catch(function () {
      var el = document.getElementById('timeline-container');
      if (el) el.innerHTML = '<p style="color:var(--color-slate-500);">Error loading profile. Please refresh.</p>';
    });
  }

  function renderProfile(s, enrolments) {
    document.getElementById('ph-name').textContent        = s.student_name || s.full_name || '—';
    document.getElementById('ph-cohort-path').textContent =
      (s.current_cohort || 'No Cohort') + ' • ' + (s.programme_path || 'No Path') + ' • ' + (s.skillshub_programme || '');
    document.getElementById('ps-student-id').textContent  = s.id || s.name || '—';
    document.getElementById('ps-dob').textContent         = s.date_of_birth ? formatDate(s.date_of_birth) : '—';
    document.getElementById('ps-gender').textContent      = s.gender || '—';
    document.getElementById('ps-location').textContent    = s.status || '—';
    document.getElementById('ps-address-1').textContent   = s.address_line_1 || '—';
    document.getElementById('ps-address-2').textContent   = s.address_line_2 || '—';
    document.getElementById('ps-pincode').textContent     = s.pincode || '—';
    document.getElementById('contact-address-1').value    = s.address_line_1 || '';
    document.getElementById('contact-address-2').value    = s.address_line_2 || '';
    document.getElementById('contact-pincode').value      = s.pincode || '';
    renderTimeline(enrolments, s);
  }

  function renderTimeline(enrolments, student) {
    var container = document.getElementById('timeline-container');
    if (!enrolments || enrolments.length === 0) {
      container.innerHTML = '<div class="timeline-item"><div class="timeline-title">Welcome to SkillsHub</div>' +
        '<div class="timeline-description">You are enrolled in ' + (student.skillshub_programme || 'the programme') +
        '. Your milestones will appear here.</div></div>';
      return;
    }
    container.innerHTML = enrolments.map(function (e) {
      var attRate  = e.attendance_rate != null ? ' · ' + Math.round(e.attendance_rate) + '% attendance' : '';
      var feedback = e.feedback_submitted ? ' · <span style="color:var(--color-emerald-700)">✓ Feedback</span>' : '';
      var baseline = e.baseline_submitted ? ' · <span style="color:var(--color-emerald-700)">✓ Baseline</span>' : '';
      var dates    = formatDate(e.enrolment_date) + (e.completion_date ? ' → ' + formatDate(e.completion_date) : '');
      var title    = (e.milestone || 'Programme') + (e.course ? ' · ' + e.course : '');
      return '<div class="timeline-item">' +
        '<div class="timeline-date">' + dates + '</div>' +
        '<div class="timeline-title">' + title + '</div>' +
        '<div class="timeline-description">' + (e.status || 'Enrolled') + attRate + feedback + baseline + '</div>' +
        '</div>';
    }).join('');
  }

  function formatDate(d) {
    if (!d) return '—';
    var dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

}());
