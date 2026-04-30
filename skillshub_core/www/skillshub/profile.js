// Route guard
const studentId = localStorage.getItem('sh_student_id');
const userEmail = localStorage.getItem('sh_user');
if (!studentId || !userEmail) window.location.href = '/skillshub/login';

document.addEventListener('DOMContentLoaded', function() {
  fetchStudentSummary();

  document.getElementById('logout-btn').addEventListener('click', function() {
    fetch('/api/method/logout', { method: 'POST', credentials: 'include', headers: { 'Accept': 'application/json' } })
      .finally(() => { localStorage.clear(); window.location.href = '/skillshub/login'; });
  });

  document.getElementById('edit-contact-btn').addEventListener('click', function() {
    document.getElementById('contact-form').classList.add('show');
  });

  document.getElementById('cancel-contact-btn').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('contact-form').classList.remove('show');
    document.getElementById('contact-message').style.display = 'none';
  });

  document.getElementById('contact-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const msgDiv = document.getElementById('contact-message');
    msgDiv.style.display = 'none';
    try {
      const res = await fetch(`/api/resource/SH Student/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          address_line_1: document.getElementById('contact-address-1').value.trim(),
          address_line_2: document.getElementById('contact-address-2').value.trim(),
          pincode: document.getElementById('contact-pincode').value.trim()
        })
      });
      if (!res.ok) throw new Error('Update failed');
      msgDiv.className = 'contact-message success';
      msgDiv.textContent = 'Address updated successfully.';
      msgDiv.style.display = 'block';
      setTimeout(() => {
        document.getElementById('contact-form').classList.remove('show');
        fetchStudentSummary();
      }, 1500);
    } catch (err) {
      msgDiv.className = 'contact-message error';
      msgDiv.textContent = 'Could not save. Please try again.';
      msgDiv.style.display = 'block';
    }
  });
});

function fetchStudentSummary() {
  fetch(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${studentId}`, {
    headers: { 'Accept': 'application/json' }, credentials: 'include'
  })
  .then(r => { if (!r.ok) throw new Error(); return r.json(); })
  .then(data => {
    if (data && data.message) renderProfile(data.message.student, data.message.enrolments || []);
  })
  .catch(() => {
    document.getElementById('timeline-container').innerHTML = '<p style="color:var(--color-slate-500);">Error loading profile. Please refresh.</p>';
  });
}

function renderProfile(s, enrolments) {
  document.getElementById('ph-name').textContent = s.student_name || '—';
  document.getElementById('ph-cohort-path').textContent =
    `${s.current_cohort || 'No Cohort'} • ${s.programme_path || 'No Path'} • ${s.skillshub_programme || ''}`;
  document.getElementById('ps-student-id').textContent = s.name || '—';
  document.getElementById('ps-dob').textContent = s.date_of_birth ? formatDate(s.date_of_birth) : '—';
  document.getElementById('ps-gender').textContent = s.gender || '—';
  document.getElementById('ps-location').textContent = s.status || '—';
  document.getElementById('ps-address-1').textContent = s.address_line_1 || '—';
  document.getElementById('ps-address-2').textContent = s.address_line_2 || '—';
  document.getElementById('ps-pincode').textContent = s.pincode || '—';
  document.getElementById('contact-address-1').value = s.address_line_1 || '';
  document.getElementById('contact-address-2').value = s.address_line_2 || '';
  document.getElementById('contact-pincode').value = s.pincode || '';
  renderTimeline(enrolments, s);
}

function renderTimeline(enrolments, student) {
  const container = document.getElementById('timeline-container');
  if (!enrolments || enrolments.length === 0) {
    container.innerHTML = `<div class="timeline-item"><div class="timeline-title">Welcome to SkillsHub</div><div class="timeline-description">You are enrolled in ${student.skillshub_programme || 'the programme'}. Your milestones will appear here.</div></div>`;
    return;
  }
  container.innerHTML = enrolments.map(e => {
    const attRate = e.attendance_rate != null ? ` · ${Math.round(e.attendance_rate)}% attendance` : '';
    const feedback = e.feedback_submitted ? ' · <span style="color:var(--color-emerald-700)">✓ Feedback</span>' : '';
    return `<div class="timeline-item">
      <div class="timeline-date">${formatDate(e.enrolment_date)}${e.completion_date ? ' → ' + formatDate(e.completion_date) : ''}</div>
      <div class="timeline-title">${e.milestone || 'Programme'}${e.course ? ' · ' + e.course : ''}</div>
      <div class="timeline-description">${e.status || 'Enrolled'}${attRate}${feedback}</div>
    </div>`;
  }).join('');
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
