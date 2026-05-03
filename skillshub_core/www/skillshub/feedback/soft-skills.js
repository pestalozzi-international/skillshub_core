import { applyPortalSettings } from '/skillshub/portal-settings.js';
applyPortalSettings();

const studentId = localStorage.getItem('sh_student_id');

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

    // Load soft skills options
    try {
      const skills = await sf('/api/resource/SkillsHub Soft Skills?fields=["name"]&limit=100');
      const group  = document.getElementById('skills-group');
      group.innerHTML = '';
      (skills.data || []).forEach(sk => {
        const d = document.createElement('div');
        d.className = 'checkbox-item';
        d.innerHTML = `<input type="checkbox" id="sk-${sk.name}" value="${sk.name}" class="skill-cb">
                       <label for="sk-${sk.name}">${sk.name}</label>`;
        group.appendChild(d);
      });
    } catch { document.getElementById('skills-group').innerHTML = '<p style="color:var(--color-slate-500)">Could not load skills list.</p>'; }

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
  try {
    const skills = Array.from(document.querySelectorAll('.skill-cb:checked'))
      .map(cb => ({ skill: cb.value }));
    const res = await fetch('/api/resource/SH Soft Skills Feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        doctype:            'SH Soft Skills Feedback',
        sh_student:         studentId,
        student_full_name:  ctx.student_name || ctx.full_name,
        programme_schedule: ctx.current_schedule,
        skills_covered:     skills,
        enjoyed_most:       document.getElementById('enjoyed_most').value,
        key_learning:       document.getElementById('key_learning').value,
        apply_learning:     document.getElementById('apply_learning').value,
        trainer_feedback:   document.getElementById('trainer_feedback').value,
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
