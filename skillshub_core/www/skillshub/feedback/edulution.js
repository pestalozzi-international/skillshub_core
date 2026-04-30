const studentId = localStorage.getItem('sh_student_id');
if (!studentId) window.location.href = '/skillshub/login';

let studentData = {};
async function sf(url) {
  const r = await fetch(url, { headers:{'Accept':'application/json'}, credentials:'include' });
  if (!r.ok) throw new Error();
  return r.json();
}
function showError(msg) {
  document.getElementById('sh-error').textContent=msg;
  document.getElementById('sh-error').style.display='block';
  document.getElementById('sh-loading').style.display='none';
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const summary = await sf(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${studentId}`);
    const student = summary.message.student;
    studentData = student;
    document.getElementById('sh-loading').style.display='none';

    if (student.programme_path !== 'Path A') {
      document.getElementById('path-notice').style.display='block';
      return;
    }

    document.getElementById('ctx-id').textContent = studentId;
    document.getElementById('ctx-name').textContent = student.student_name||'—';
    document.getElementById('ctx-schedule').textContent = student.current_schedule||'—';
    document.getElementById('ctx-path').textContent = student.programme_path||'—';
    document.getElementById('sh-feedback-form').style.display='block';
  } catch { showError('Error loading form. Please try again.'); }
});

[['confidence_rating','cr_v'],['literacy_rating','lr_v'],['numeracy_rating','nr_v'],
 ['resilience_rating','rr_v'],['problem_solving_rating','psr_v']].forEach(([id,valId]) => {
  document.getElementById(id).addEventListener('input', e =>
    document.getElementById(valId).textContent = e.target.value);
});

document.getElementById('sh-feedback-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('sh-submit-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/resource/SkillsHub Edulution Feedback', {
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, credentials:'include',
      body: JSON.stringify({
        doctype:'SkillsHub Edulution Feedback', sh_student:studentId,
        student_full_name:studentData.student_name, programme_schedule:studentData.current_schedule,
        achieved_goals: document.getElementById('achieved_goals').checked ? 1 : 0,
        confidence_rating:+document.getElementById('confidence_rating').value,
        literacy_rating:+document.getElementById('literacy_rating').value,
        numeracy_rating:+document.getElementById('numeracy_rating').value,
        resilience_rating:+document.getElementById('resilience_rating').value,
        problem_solving_rating:+document.getElementById('problem_solving_rating').value,
        key_skills_learned:document.getElementById('key_skills_learned').value,
        impact_statement:document.getElementById('impact_statement').value,
        opt_in_coaching: document.getElementById('opt_in_coaching').checked ? 1 : 0,
        suggestions:document.getElementById('suggestions').value
      })
    });
    if (!res.ok) throw new Error();
    document.getElementById('sh-success').style.display='block';
    btn.textContent='Submitted ✓';
  } catch { showError('Submission failed. Please try again.'); btn.disabled=false; }
});
