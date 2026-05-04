(function(){'use strict';
function getFrappeHeaders(){var h={'Accept':'application/json','Content-Type':'application/json'}; if(window.frappe && frappe.csrf_token && frappe.csrf_token!=='None' && !frappe.csrf_token.includes('{{')) h['X-Frappe-CSRF-Token']=frappe.csrf_token; return h;}
function esc(s){if(s===null||s===undefined) return ''; var d=document.createElement('div'); d.textContent=s; return d.innerHTML;}

var params=new URLSearchParams(window.location.search); var studentId=params.get('id');
if(!studentId){document.getElementById('content').innerHTML='<div style="text-align:center;padding:4rem">Student ID missing.</div>';}

async function fetchJson(url){var r=await fetch(url,{headers:getFrappeHeaders(),credentials:'include'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json();}

async function getDocType(){ // fetch DocType metadata
  var url='/api/resource/DocType/SH Student?fields='+encodeURIComponent(JSON.stringify(['fields','field_order','title_field','image_field','permissions','name']));
  var res=await fetch(url,{headers:getFrappeHeaders(),credentials:'include'});
  if(!res.ok) throw new Error('Unable to fetch DocType');
  return res.json();
}

async function getUserRoles(){ try{ var u=await fetch('/api/method/frappe.auth.get_logged_user',{headers:getFrappeHeaders(),credentials:'include'}); var ud=await u.json(); if(!ud || !ud.message || ud.message==='Guest') return []; var user=ud.message; var q='/api/resource/Has Role?filters='+encodeURIComponent(JSON.stringify([['parent','=',user]]))+'&fields='+encodeURIComponent(JSON.stringify(['role']))+'&limit=50'; var r=await fetch(q,{headers:getFrappeHeaders(),credentials:'include'}); var rd=await r.json(); return (rd.data||[]).map(function(x){return x.role;}); }catch(e){return [];} }

function buildFieldInput(field, value, readOnly){ var html=''; var id='f-'+field.fieldname; var v=value===undefined? (field.default||'') : value;
  switch(field.fieldtype){
    case 'Data': html='<input id="'+id+'" class="sh-input" type="text" value="'+esc(v)+'" '+(readOnly?'disabled':'')+'>'; break;
    case 'Phone': html='<input id="'+id+'" class="sh-input" type="tel" value="'+esc(v)+'" '+(readOnly?'disabled':'')+'>'; break;
    case 'Date': html='<input id="'+id+'" class="sh-input" type="date" value="'+esc(v)+'" '+(readOnly?'disabled':'')+'>'; break;
    case 'Datetime': html='<input id="'+id+'" class="sh-input" type="datetime-local" value="'+esc(v)+'" '+(readOnly?'disabled':'')+'>'; break;
    case 'Text': case 'Small Text': html='<textarea id="'+id+'" class="sh-input" rows="3" '+(readOnly?'disabled':'')+'>'+esc(v)+'</textarea>'; break;
    case 'Select': var options=(field.options||'').split('\n').filter(Boolean); html='<select id="'+id+'" class="sh-input" '+(readOnly?'disabled':'')+'>'; html+='<option value=""></option>'; options.forEach(function(opt){html+='<option'+(opt===v?' selected':'')+'>'+esc(opt)+'</option>';}); html+='</select>'; break;
    case 'Link': html='<input id="'+id+'" class="sh-input" type="text" value="'+esc(v)+'" '+(readOnly?'disabled':'')+' placeholder="Link to '+esc(field.options||'')+'">'; break;
    case 'Attach Image': html=(v?'<img src="'+esc(v)+'" style="max-width:120px;border-radius:6px;margin-bottom:6px">':'')+'<input id="'+id+'" type="file" accept="image/*" '+(readOnly?'disabled':'')+'>'; break;
    case 'Table': html='<div id="'+id+'-table">(child table rendered below)</div>'; break;
    default: html='<input id="'+id+'" class="sh-input" type="text" value="'+esc(v)+'" '+(readOnly?'disabled':'')+'>';
  }
  return '<div class="form-row"><label class="form-label">'+esc(field.label||field.fieldname)+'</label><div>'+html+'</div></div>';
}

async function render(){
  try{
    var [dtRes, summaryRes, roles]=await Promise.all([getDocType(), fetchJson('/api/method/skillshub_core.skillshub_core.api.get_student_summary?student='+encodeURIComponent(studentId)), getUserRoles()]);
    var dt=dtRes.data || dtRes.message || dtRes; // sometimes returned under data or message
    var student=summaryRes.message && summaryRes.message.student? summaryRes.message.student : null;
    if(!student) throw new Error('Student data not accessible');
    var isAdmin = roles.some(function(r){return ['System Manager','Administrator','PI Admin','PI Admin','SH Admin'].indexOf(r)!==-1;});

    // Build form
    var fields = dt.fields || [];
    var container='';
    container += '<div class="sh-container"><div class="glass-card">';
    container += '<h2 style="margin-top:0">' + esc(student.student_name || student.full_name || student.name) + '</h2>';
    container += '<form id="sh-student-admin-form">';
    // iterate fields in order
    for(var i=0;i<fields.length;i++){
      var f = fields[i];
      // skip layout-only entries
      if(['Section Break','Column Break','Tab Break'].indexOf(f.fieldtype)!==-1){ if(f.fieldtype==='Section Break') container += '<div class="section-title">'+esc(f.label||'')+'</div>'; continue; }
      var val = student[f.fieldname]!==undefined? student[f.fieldname] : (student[f.fieldname]===undefined? student[f.fieldname] : '');
      // Decide readOnly for students
      var readOnly = false;
      if(!isAdmin){ // students cannot edit some fields
        // simple heuristic: if field is read_only in doc, make readOnly
        if(f.read_only) readOnly = true;
        // also if permission requires admin, we might need more granular logic but for now hide sensitive fields
        if(f.fieldname==='pestalozzi_student_id' || f.fieldname==='naming_series') readOnly = true;
      }
      container += buildFieldInput(f,val,readOnly);
    }
    container += '<div style="margin-top:1rem"><button id="sh-save-btn" class="sh-btn-primary">Save</button> ' + (isAdmin?'<button id="sh-delete-btn" class="sh-btn-secondary" style="margin-left:0.5rem">Delete</button>':'') + '</div>';
    container += '</form></div></div>';
    document.getElementById('content').innerHTML = container;

    // bind save
    document.getElementById('sh-student-admin-form').addEventListener('submit', async function(ev){ ev.preventDefault(); var btn=document.getElementById('sh-save-btn'); btn.disabled=true; btn.textContent='Saving...';
      var payload = {};
      fields.forEach(function(f){ if(['Section Break','Column Break','Tab Break'].indexOf(f.fieldtype)!==-1) return; var id='f-'+f.fieldname; var el=document.getElementById(id); if(!el) return; if(el.type==='file'){ /* skip for now */ return; } var val = el.value; if(f.fieldtype==='Date' && val==='') val=null; payload[f.fieldname]=val; });
      try{
        var res = await fetch('/api/method/skillshub_core.skillshub_core.api.update_student_admin?student='+encodeURIComponent(studentId),{method:'POST',headers:getFrappeHeaders(),credentials:'include',body:JSON.stringify(payload)});
        var jr = await res.json(); if(!res.ok) throw new Error(jr.message||'Save failed');
        btn.textContent='Saved'; setTimeout(function(){btn.textContent='Save'; btn.disabled=false;},1200);
      }catch(e){ btn.disabled=false; btn.textContent='Save'; alert('Save failed: '+e.message); }
    });

    if(isAdmin){ document.getElementById('sh-delete-btn').addEventListener('click',async function(){ if(!confirm('Delete this student? This is irreversible.')) return; try{ await fetch('/api/method/skillshub_core.skillshub_core.api.delete_student_admin?student='+encodeURIComponent(studentId),{method:'POST',headers:getFrappeHeaders(),credentials:'include'}); alert('Deleted'); window.location.href='/skillshub/admin/students'; }catch(e){ alert('Delete failed'); } }); }

  }catch(err){ console.error(err); document.getElementById('content').innerHTML='<div class="sh-container"><div class="glass-card" style="padding:2rem;color:var(--color-red-700)"><h3>Unable to render admin profile</h3><p>'+esc(err.message)+'</p></div></div>'; }
}

document.addEventListener('DOMContentLoaded', function(){ render(); });

})();
