// ---------------------------------------------------------------------------
// Portal branding — runs before anything else
// ---------------------------------------------------------------------------
import { applyPortalSettings } from '/skillshub/portal-settings.js';

applyPortalSettings().then(() => {
  if (window.__shLogoUrl) {
    var img = document.getElementById('portal-logo');
    var box = document.getElementById('logo-container');
    if (img && box) { img.src = window.__shLogoUrl; box.style.display = 'block'; }
  }
});

// ---------------------------------------------------------------------------
// Route guard — only redirect if we are NOT already on the login page
// (prevents a loop if a destination page sends the user back here while
//  a stale localStorage key is still present)
// ---------------------------------------------------------------------------
(function () {
  // If a previous session left stale keys but the Frappe session has
  // expired, hitting any protected page will 401 → clear+redirect here.
  // We must NOT loop back out from here.
  var role      = localStorage.getItem('sh_role');
  var studentId = localStorage.getItem('sh_student_id');
  if (role === 'admin')   { window.location.replace('/skillshub/admin/students'); return; }
  if (role === 'teacher') { window.location.replace('/skillshub/attendance');     return; }
  if (studentId)          { window.location.replace('/skillshub/profile');        return; }
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resolveLoginEmail(raw) {
  var trimmed = raw.trim();
  if (!trimmed.includes('@') && /^SH[\d.]+$/i.test(trimmed)) {
    return trimmed + '@pestalozzi.education';
  }
  return trimmed;
}

function clearSession() {
  localStorage.removeItem('sh_student_id');
  localStorage.removeItem('sh_role');
  localStorage.removeItem('sh_user');
  localStorage.removeItem('sh_display_user');
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
  var form     = document.getElementById('sh-login-form');
  var usrInput = document.getElementById('usr');
  var pwdInput = document.getElementById('pwd');
  var errorMsg = document.getElementById('login-error');
  var loginBtn = document.getElementById('login-btn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorMsg.style.display = 'none';
    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled    = true;

    var rawInput   = usrInput.value.trim();
    var loginEmail = resolveLoginEmail(rawInput);

    try {
      // Step 1: Frappe session login
      var fd = new FormData();
      fd.append('usr', loginEmail);
      fd.append('pwd', pwdInput.value);

      var loginRes  = await fetch('/api/method/login', {
        method: 'POST', body: fd, credentials: 'include'
      });
      var loginData = await loginRes.json();

      if (
        loginData.message !== 'Logged In' &&
        loginData.message !== 'No App'    &&
        !loginData.full_name
      ) {
        throw new Error(loginData.message || 'Login failed. Please check your credentials.');
      }

      // Clear any previous session keys before setting new ones
      clearSession();
      localStorage.setItem('sh_user', loginEmail);
      localStorage.setItem('sh_display_user', rawInput);

      // Step 2: Is this user linked to an SH Student record?
      var studentRes = await fetch(
        '/api/resource/SH Student?filters=' + encodeURIComponent(
          JSON.stringify([['portal_user_account', '=', loginEmail]])
        ) + '&fields=' + encodeURIComponent(JSON.stringify(['name'])) + '&limit=1',
        { headers: { 'Accept': 'application/json' }, credentials: 'include' }
      );
      if (!studentRes.ok) throw new Error('Unable to verify student record.');
      var studentData = await studentRes.json();

      if (studentData.data && studentData.data.length > 0) {
        localStorage.setItem('sh_student_id', studentData.data[0].name);
        window.location.href = '/skillshub/profile';
        return;
      }

      // Step 3: Check roles
      var roleRes = await fetch(
        '/api/resource/Has Role?filters=' + encodeURIComponent(
          JSON.stringify([
            ['parent', '=', loginEmail],
            ['role', 'in', ['System Manager', 'PI Admin', 'SH Admin', 'SH Teacher']],
          ])
        ) + '&fields=' + encodeURIComponent(JSON.stringify(['role'])) + '&limit=10',
        { headers: { 'Accept': 'application/json' }, credentials: 'include' }
      );
      if (!roleRes.ok) throw new Error('Unable to verify user roles.');
      var roleData = await roleRes.json();
      var roles    = (roleData.data || []).map(function (r) { return r.role; });

      if (roles.indexOf('SH Admin') !== -1 || roles.indexOf('PI Admin') !== -1 || roles.indexOf('System Manager') !== -1) {
        localStorage.setItem('sh_role', 'admin');
        window.location.href = '/skillshub/admin/students';
        return;
      }
      if (roles.indexOf('SH Teacher') !== -1) {
        localStorage.setItem('sh_role', 'teacher');
        window.location.href = '/skillshub/attendance';
        return;
      }
      // Fallback
      localStorage.setItem('sh_role', 'teacher');
      window.location.href = '/skillshub/attendance';

    } catch (err) {
      errorMsg.textContent = err.message || 'An error occurred during login.';
      errorMsg.style.display = 'block';
      loginBtn.textContent = 'Sign In';
      loginBtn.disabled    = false;
    }
  });
});
