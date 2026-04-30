const studentId = localStorage.getItem('sh_student_id');
if (!studentId) window.location.href = '/skillshub/login';

let studentData = {};
async function sf(url) {
  const r = await fetch(url,{headers:{'Accept':'application/json'},credentials:'include'});
  if (!r.ok) throw new Error();
  return r.json();
}
function showError(msg){
  document.getElementById('sh-error').textContent=msg;
  document.getElementById('sh-error').style.display='block';
  document.getElementById('sh-loading').style.display='none';
}

document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    const summary = await sf(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${studentId}`);
    const student = summary.message.student;
    studentData = student;
    document.getElementById('ctx-id').textContent=studentId;
    document.getElementById('ctx-name').textContent=student.student_name||'—';
    document.getElementById('ctx-schedule').textContent=student.current_schedule||'—';
    try{
      const aspects = await sf('/api/resource/SH VT Beneficial Programme Aspect?fields=["name"]&limit=50');
      const group = document.getElementById('aspects-group');
      group.innerHTML='';
      (aspects.data||[]).forEach(a=>{
        const d=document.createElement('div');d.className='checkbox-item';
        d.innerHTML=`<input type="checkbox" id="ba-${a.name}" value="${a.name}" class="ba-cb"><label for="ba-${a.name}">${a.name}</label>`;
        group.appendChild(d);
      });
      if(!aspects.data||aspects.data.length===0) group.innerHTML='<p style="color:var(--color-slate-500)">No aspects found.</p>';
    } catch{ document.getElementById('aspects-group').innerHTML='<p style="color:var(--color-slate-500)">Could not load aspects.</p>'; }
    document.getElementById('sh-loading').style.display='none';
    document.getElementById('sh-feedback-form').style.display='block';
  } catch{ showError('Error loading form. Please try again.'); }
});

[['problem_solving_rating','psr_v'],['time_management_rating','tmr_v'],['teamwork_rating','tr_v'],
 ['mental_resilience_rating','mrr_v'],['trainer_communication_rating','tcr_v'],['objective_communication_rating','ocr_v']
].forEach(([id,valId])=>{
  document.getElementById(id).addEventListener('input',e=>document.getElementById(valId).textContent=e.target.value);
});

document.getElementById('sh-feedback-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const btn=document.getElementById('sh-submit-btn');
  btn.disabled=true;
  try{
    const beneficial_aspects=Array.from(document.querySelectorAll('.ba-cb:checked'))
      .map(cb=>({aspect:cb.value,doctype:'SH VT Beneficial Programme Aspect Link'}));
    const res=await fetch('/api/resource/SkillsHub Vocational Training Feedback',{
      method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'include',
      body:JSON.stringify({
        doctype:'SkillsHub Vocational Training Feedback',sh_student:studentId,
        student_full_name:studentData.student_name,programme_schedule:studentData.current_schedule,
        course_met_expectations:document.getElementById('course_met_expectations').value,
        problem_solving_rating:+document.getElementById('problem_solving_rating').value,
        time_management_rating:+document.getElementById('time_management_rating').value,
        teamwork_rating:+document.getElementById('teamwork_rating').value,
        mental_resilience_rating:+document.getElementById('mental_resilience_rating').value,
        trainer_communication_rating:+document.getElementById('trainer_communication_rating').value,
        objective_communication_rating:+document.getElementById('objective_communication_rating').value,
        beneficial_aspects,
        goals_achieved:document.getElementById('goals_achieved').value,
        volunteering_interest:document.getElementById('volunteering_interest').checked?1:0,
        suggestions:document.getElementById('suggestions').value
      })
    });
    if(!res.ok) throw new Error();
    document.getElementById('sh-success').style.display='block';
    btn.textContent='Submitted ✓';
  } catch{ showError('Submission failed. Please try again.'); btn.disabled=false; }
});
