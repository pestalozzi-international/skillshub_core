import { applyPortalSettings } from '/skillshub/portal-settings.js';
applyPortalSettings();

const studentId = localStorage.getItem('sh_student_id');
if (!studentId) window.location.href = '/skillshub/login';

let ctx = {};

async function sf(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function showError(msg) {
  document.getElementById('sh-error').textContent = msg;
  document.getElementById('sh-error').style.display = 'block';
  document.getElementById('sh-loading').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const summary = await sf(
      `/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${encodeURIComponent(studentId)}`
    );
    const s = summary.message.student;
    ctx = s;
    document.getElementById('ctx-id').textContent       = studentId;
    document.getElementById('ctx-name').textContent     = s.student_name || s.full_name || '—';
    document.getElementById('ctx-schedule').textContent = s.current_schedule || '—';
    document.getElementById('ctx-path').textContent     = s.programme_path || '—';

    // Load VT course expectations
    try {
      const exps = await sf('/api/resource/SH VT Course Expectation?fields=["name"]&limit=50');
      const group = document.getElementById('expectations-group');
      group.innerHTML = '';
      (exps.data || []).forEach(ex => {
        const d = document.createElement('div');
        d.className = 'checkbox-item';
        d.innerHTML = `<input type="checkbox" id="exp-${ex.name}" value="${ex.name}" class="exp-cb">
                       <label for="exp-${ex.name}">${ex.name}</label>`;
        group.appendChild(d);
      });
    } catch { }

    document.getElementById('sh-loading').style.display  = 'none';
    document.getElementById('sh-feedback-form').style.display = 'block';
  } catch {
    showError('Error loading form. Please try again.');
  }
});

document.getElementById('sh-feedback-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('sh-submit-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  document.getElementById('sh-error').style.display = 'none';

  const skillFields = ['problem_solving','time_management','teamwork','mental_resilience'];
  const skills = {};
  skillFields.forEach(f => {
    const el = document.getElementById('r-' + f);
    skills[f] = el ? parseInt(el.value) || 0 : 0;
  });

  const expectations = Array.from(document.querySelectorAll('.exp-cb:checked')).map(cb => ({ expectation: cb.value }));

  try {
    const res = await fetch('/api/resource/SkillsHub Vocational Training Feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        doctype:             'SkillsHub Vocational Training Feedback',
        sh_student:          studentId,
        student_full_name:   ctx.student_name || ctx.full_name,
        programme_schedule:  ctx.current_schedule,
        course_expectations: expectations,
        course_met_expectations: document.getElementById('met_expectations').value,
        objective_comms_rating:  parseInt(document.getElementById('r-objective_comms').value) || 3,
        trainer_comms_rating:    parseInt(document.getElementById('r-trainer_comms').value) || 3,
        goals:               document.getElementById('goals').value,
        volunteering:        document.getElementById('volunteering').checked ? 1 : 0,
        ...skills,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    document.getElementById('sh-success').style.display = 'block';
    btn.textContent = 'Submitted ✓';
  } catch {
    showError('Submission failed. Please try again.');
    btn.disabled = false; btn.textContent = 'Submit Feedback';
  }
});
