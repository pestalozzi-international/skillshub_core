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
    const [summary, programmes] = await Promise.all([
      sf(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${encodeURIComponent(studentId)}`),
      sf('/api/resource/SkillsHub Programme?fields=["name"]&limit=20'),
    ]);

    const s = summary.message.student;
    ctx = s;
    document.getElementById('ctx-id').textContent   = studentId;
    document.getElementById('ctx-name').textContent = s.student_name || s.full_name || '—';

    // Populate milestone dropdown (user must select)
    const sel = document.getElementById('milestone');
    (programmes.data || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      if (p.name === s.skillshub_programme) opt.selected = true;
      sel.appendChild(opt);
    });

    document.getElementById('sh-loading').style.display = 'none';
    document.getElementById('sh-baseline-form').style.display = 'block';
  } catch {
    showError('Error loading form. Please try again.');
  }
});

document.getElementById('sh-baseline-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('sh-submit-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  document.getElementById('sh-error').style.display = 'none';

  const ratingFields = [
    'self_confidence','communication','teamwork','problem_solving',
    'leadership','financial_literacy','employment_readiness'
  ];
  const ratings = {};
  ratingFields.forEach(f => {
    const el = document.getElementById('r-' + f);
    ratings[f] = el ? parseInt(el.value) || 0 : 0;
  });

  try {
    const res = await fetch('/api/resource/SH Student Baseline Form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        doctype:            'SH Student Baseline Form',
        sh_student:         studentId,
        student_full_name:  ctx.student_name || ctx.full_name,
        programme_schedule: ctx.current_schedule,
        milestone:          document.getElementById('milestone').value,
        goals:              document.getElementById('goals').value,
        challenges:         document.getElementById('challenges').value,
        ...ratings,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    document.getElementById('sh-success').style.display = 'block';
    btn.textContent = 'Submitted ✓';
  } catch {
    showError('Submission failed. Please try again.');
    btn.disabled = false; btn.textContent = 'Submit Baseline';
  }
});
