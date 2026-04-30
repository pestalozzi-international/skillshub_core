const studentId = localStorage.getItem('sh_student_id');
if (!studentId) window.location.href = '/skillshub/login';

let studentData = {};

async function sf(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const summary = await sf(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${studentId}`);
    const student = summary.message.student;
    studentData = student;
    document.getElementById('ctx-id').textContent = studentId;
    document.getElementById('ctx-name').textContent = student.student_name || '—';

    const progs = await sf('/api/resource/SkillsHub Programme?fields=["name"]&limit=20');
    const sel = document.getElementById('milestone');
    (progs.data || []).forEach(p => {
      const o = document.createElement('option');
      o.value = p.name; o.textContent = p.name;
      sel.appendChild(o);
    });

    document.getElementById('sh-loading').style.display = 'none';
    document.getElementById('sh-baseline-form').style.display = 'block';
  } catch (e) {
    document.getElementById('sh-loading').style.display = 'none';
    document.getElementById('sh-error').textContent = 'Error loading form. Please refresh.';
    document.getElementById('sh-error').style.display = 'block';
  }
});

['confidence','communication','teamwork','problem_solving','resilience','financial_literacy'].forEach(id => {
  document.getElementById(id).addEventListener('input', e =>
    document.getElementById(id + '_val').textContent = e.target.value);
});

document.getElementById('sh-baseline-form').addEventListener('submit', async e => {
  e.preventDefault();
  const milestone = document.getElementById('milestone').value;
  if (!milestone) {
    document.getElementById('sh-error').textContent = 'Please select a programme.';
    document.getElementById('sh-error').style.display = 'block';
    return;
  }
  const btn = document.getElementById('sh-submit-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/resource/SH Student Baseline Form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        doctype: 'SH Student Baseline Form',
        sh_student: studentId,
        milestone,
        confidence: +document.getElementById('confidence').value,
        communication: +document.getElementById('communication').value,
        teamwork: +document.getElementById('teamwork').value,
        problem_solving: +document.getElementById('problem_solving').value,
        resilience: +document.getElementById('resilience').value,
        financial_literacy: +document.getElementById('financial_literacy').value,
        current_challenges: document.getElementById('current_challenges').value,
        goals_next_phase: document.getElementById('goals_next_phase').value,
        additional_support: document.getElementById('additional_support').value
      })
    });
    if (!res.ok) throw new Error();
    document.getElementById('sh-success').style.display = 'block';
    btn.textContent = 'Submitted ✓';
  } catch {
    document.getElementById('sh-error').textContent = 'Submission failed. Please try again.';
    document.getElementById('sh-error').style.display = 'block';
    btn.disabled = false;
  }
});
