const studentId = localStorage.getItem('sh_student_id');
if (!studentId) window.location.href = '/skillshub/login';

let studentData = {};
async function sf(url) {
  const r = await fetch(url, { headers:{'Accept':'application/json'}, credentials:'include' });
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
    const summary = await sf(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${studentId}`);
    const student = summary.message.student;
    studentData = student;
    document.getElementById('ctx-id').textContent = studentId;
    document.getElementById('ctx-name').textContent = student.student_name || '—';
    document.getElementById('ctx-schedule').textContent = student.current_schedule || '—';
    try {
      const skills = await sf('/api/resource/SkillsHub Soft Skills?fields=["name"]&limit=50');
      const group = document.getElementById('skills-group');
      group.innerHTML = '';
      (skills.data || []).forEach(s => {
        const d = document.createElement('div'); d.className='checkbox-item';
        d.innerHTML = `<input type="checkbox" id="sk-${s.name}" value="${s.name}" class="skill-cb"><label for="sk-${s.name}">${s.name}</label>`;
        group.appendChild(d);
      });
      if (!skills.data || skills.data.length===0) group.innerHTML='<p style="color:var(--color-slate-500)">No skills found.</p>';
    } catch { document.getElementById('skills-group').innerHTML='<p style="color:var(--color-slate-500)">Could not load skills.</p>'; }
    document.getElementById('sh-loading').style.display='none';
    document.getElementById('sh-feedback-form').style.display='block';
  } catch { showError('Error loading form. Please try again.'); }
});

document.getElementById('overall_rating').addEventListener('input', e =>
  document.getElementById('overall_rating_val').textContent = e.target.value);

document.getElementById('sh-feedback-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('sh-submit-btn');
  btn.disabled = true;
  try {
    const soft_skills = Array.from(document.querySelectorAll('.skill-cb:checked'))
      .map(cb => ({ soft_skill: cb.value, doctype: 'SkillsHub Soft Skills Link' }));
    const res = await fetch('/api/resource/SH Soft Skills Feedback', {
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, credentials:'include',
      body: JSON.stringify({
        doctype:'SH Soft Skills Feedback', sh_student:studentId,
        student_full_name:studentData.student_name, programme_schedule:studentData.current_schedule,
        soft_skills, met_expectations:document.getElementById('met_expectations').value,
        overall_rating:+document.getElementById('overall_rating').value,
        most_valuable:document.getElementById('most_valuable').value,
        key_learning:document.getElementById('key_learning').value,
        suggestions:document.getElementById('suggestions').value
      })
    });
    if (!res.ok) throw new Error();
    document.getElementById('sh-success').style.display='block';
    btn.textContent='Submitted ✓';
  } catch { showError('Submission failed. Please try again.'); btn.disabled=false; }
});
