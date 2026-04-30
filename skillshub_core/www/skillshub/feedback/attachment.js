const studentId = localStorage.getItem('sh_student_id');
if (!studentId) window.location.href = '/skillshub/login';

let studentData = {};
async function sf(url){
  const r=await fetch(url,{headers:{'Accept':'application/json'},credentials:'include'});
  if(!r.ok) throw new Error();
  return r.json();
}
function showError(msg){
  document.getElementById('sh-error').textContent=msg;
  document.getElementById('sh-error').style.display='block';
  document.getElementById('sh-loading').style.display='none';
}

document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    const summary=await sf(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${studentId}`);
    const student=summary.message.student;
    studentData=student;
    document.getElementById('ctx-id').textContent=studentId;
    document.getElementById('ctx-name').textContent=student.student_name||'—';
    document.getElementById('ctx-schedule').textContent=student.current_schedule||'—';
    try{
      const challenges=await sf('/api/resource/SH Attachment Challenge?fields=["name"]&limit=50');
      const group=document.getElementById('challenges-group');
      group.innerHTML='';
      (challenges.data||[]).forEach(c=>{
        const d=document.createElement('div');d.className='checkbox-item';
        d.innerHTML=`<input type="checkbox" id="ch-${c.name}" value="${c.name}" class="ch-cb"><label for="ch-${c.name}">${c.name}</label>`;
        group.appendChild(d);
      });
      if(!challenges.data||challenges.data.length===0) group.innerHTML='<p style="color:var(--color-slate-500)">No challenges listed.</p>';
    } catch{ document.getElementById('challenges-group').innerHTML='<p style="color:var(--color-slate-500)">Could not load challenges.</p>'; }
    document.getElementById('sh-loading').style.display='none';
    document.getElementById('sh-feedback-form').style.display='block';
  } catch{ showError('Error loading form. Please try again.'); }
});

[['preparation_rating','pr_v'],['overall_experience','oe_v']].forEach(([id,valId])=>{
  document.getElementById(id).addEventListener('input',e=>document.getElementById(valId).textContent=e.target.value);
});

document.getElementById('sh-feedback-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const btn=document.getElementById('sh-submit-btn');
  btn.disabled=true;
  try{
    const challenges=Array.from(document.querySelectorAll('.ch-cb:checked'))
      .map(cb=>({challenge:cb.value,doctype:'SH Attachment Challenge Link'}));
    const res=await fetch('/api/resource/ZM SkillsHub Attachment Feedback',{
      method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'include',
      body:JSON.stringify({
        doctype:'ZM SkillsHub Attachment Feedback',sh_student:studentId,
        student_full_name:studentData.student_name,programme_schedule:studentData.current_schedule,
        preparation_rating:+document.getElementById('preparation_rating').value,
        skills_used_example:document.getElementById('skills_used_example').value,
        challenges,
        challenges_text:document.getElementById('challenges_text').value,
        improvement_suggestions:document.getElementById('improvement_suggestions').value,
        overall_experience:+document.getElementById('overall_experience').value
      })
    });
    if(!res.ok) throw new Error();
    document.getElementById('sh-success').style.display='block';
    btn.textContent='Submitted ✓';
  } catch{ showError('Submission failed. Please try again.'); btn.disabled=false; }
});
