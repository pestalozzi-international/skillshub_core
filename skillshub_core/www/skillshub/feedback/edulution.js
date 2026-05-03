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

    // Edulution is Path A only
    if (s.programme_path === 'Path B') {
      document.getElementById('sh-loading').style.display = 'none';
      document.getElementById('sh-path-b-msg').style.display = 'block';
      return;
    }

    document.getElementById('ctx-id').textContent       = studentId;
    document.getElementById('ctx-name').textContent     = s.student_name || s.full_name || '—';
    document.getElementById('ctx-schedule').textContent = s.current_schedule || '—';
    document.getElementById('ctx-path').textContent     = s.programme_path || '—';

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

  const ratingFields = ['confidence','literacy','numeracy','resilience','problem_solving'];
  const ratings = {};
  ratingFields.forEach(f => {
    const el = document.getElementById('r-' + f);
    ratings[f] = el ? parseInt(el.value) || 0 : 0;
  });

  try {
    const res = await fetch('/api/resource/SkillsHub Edulution Feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        doctype:            'SkillsHub Edulution Feedback',
        sh_student:         studentId,
        student_full_name:  ctx.student_name || ctx.full_name,
        programme_schedule: ctx.current_schedule,
        goals_achieved:     document.getElementById('goals_achieved').value,
        skills_learned:     document.getElementById('skills_learned').value,
        coaching_opt_in:    document.getElementById('coaching_opt_in').checked ? 1 : 0,
        impact_statement:   document.getElementById('impact_statement').value,
        ...ratings,
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
