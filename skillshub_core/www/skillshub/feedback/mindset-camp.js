const studentId = localStorage.getItem('sh_student_id');
if (!studentId) window.location.href = '/skillshub/login';

let studentData = {};

async function sf(url) {
  const r = await fetch(url, { headers: {'Accept':'application/json'}, credentials:'include' });
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
      const aspects = await sf('/api/resource/SH Mindset Camp Aspect?fields=["name"]&limit=50');
      const group = document.getElementById('aspects-group');
      group.innerHTML = '';
      (aspects.data || []).forEach(a => {
        const d = document.createElement('div');
        d.className = 'checkbox-item';
        d.innerHTML = `<input type="checkbox" id="asp-${a.name}" value="${a.name}" class="aspect-cb"><label for="asp-${a.name}">${a.name}</label>`;
        group.appendChild(d);
      });
      if (!aspects.data || aspects.data.length === 0) group.innerHTML = '<p style="color:var(--color-slate-500)">No aspects found.</p>';
    } catch { document.getElementById('aspects-group').innerHTML = '<p style="color:var(--color-slate-500)">Could not load aspects.</p>'; }

    document.getElementById('sh-loading').style.display = 'none';
    document.getElementById('sh-feedback-form').style.display = 'block';
  } catch (e) {
    showError('Error loading form. Please try again.');
  }
});

document.getElementById('sh-feedback-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('sh-submit-btn');
  btn.disabled = true;
  try {
    const aspects = Array.from(document.querySelectorAll('.aspect-cb:checked'))
      .map(cb => ({ aspect: cb.value, doctype: 'SH Mindset Camp Aspect Link' }));
    const res = await fetch('/api/resource/SH Mindset Camp Feedback', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Accept':'application/json'},
      credentials: 'include',
      body: JSON.stringify({
        doctype: 'SH Mindset Camp Feedback',
        sh_student: studentId,
        student_full_name: studentData.student_name,
        programme_schedule: studentData.current_schedule,
        aspects,
        enjoyed_most: document.getElementById('enjoyed_most').value,
        key_learning: document.getElementById('key_learning').value,
        apply_learning: document.getElementById('apply_learning').value,
        suggestions: document.getElementById('suggestions').value
      })
    });
    if (!res.ok) throw new Error();
    document.getElementById('sh-success').style.display = 'block';
    btn.textContent = 'Submitted ✓';
  } catch {
    showError('Submission failed. Please try again.');
    btn.disabled = false;
  }
});
