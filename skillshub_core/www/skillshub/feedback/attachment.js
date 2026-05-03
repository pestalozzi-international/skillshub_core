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

    // Load attachment challenges
    try {
      const chs = await sf('/api/resource/SH Attachment Challenge?fields=["name"]&limit=50');
      const group = document.getElementById('challenges-group');
      group.innerHTML = '';
      (chs.data || []).forEach(ch => {
        const d = document.createElement('div');
        d.className = 'checkbox-item';
        d.innerHTML = `<input type="checkbox" id="ch-${ch.name}" value="${ch.name}" class="ch-cb">
                       <label for="ch-${ch.name}">${ch.name}</label>`;
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

  const challenges = Array.from(document.querySelectorAll('.ch-cb:checked')).map(cb => ({ challenge: cb.value }));

  try {
    const res = await fetch('/api/resource/ZM SkillsHub Attachment Feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        doctype:             'ZM SkillsHub Attachment Feedback',
        sh_student:          studentId,
        student_full_name:   ctx.student_name || ctx.full_name,
        programme_schedule:  ctx.current_schedule,
        preparation_rating:  parseInt(document.getElementById('r-preparation').value) || 3,
        skills_use_example:  document.getElementById('skills_use').value,
        challenges,
        challenges_text:     document.getElementById('challenges_text').value,
        improvement_suggestions: document.getElementById('improvements').value,
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
