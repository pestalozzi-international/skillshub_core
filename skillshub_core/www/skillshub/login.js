// ---------------------------------------------------------------------------
// portal-settings: apply branding before the page is interactive
// Logo injection is handled here (not in an inline script) to avoid
// Frappe's Jinja renderer throwing a 417 on { } chars in login.html.
// ---------------------------------------------------------------------------
import { applyPortalSettings } from '/skillshub/portal-settings.js';

applyPortalSettings().then(() => {
  if (window.__shLogoUrl) {
    const img = document.getElementById('portal-logo');
    const box = document.getElementById('logo-container');
    if (img && box) {
      img.src = window.__shLogoUrl;
      box.style.display = 'block';
    }
  }
});

// ---------------------------------------------------------------------------
// Route guard — redirect already-authenticated users immediately
// ---------------------------------------------------------------------------
(function () {
  const role      = localStorage.getItem('sh_role');
  const studentId = localStorage.getItem('sh_student_id');
  if (role === 'admin')   { window.location.href = '/skillshub/admin/students'; return; }
  if (role === 'teacher') { window.location.href = '/skillshub/attendance';     return; }
  if (studentId)          { window.location.href = '/skillshub/profile';        return; }
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * If the user typed a bare Student ID (e.g. SH260043 or SH.26.0043),
 * append the portal email domain before submitting to Frappe.
 */
function resolveLoginEmail(raw) {
  const trimmed = raw.trim();
  if (!trimmed.includes('@') && /^SH[\d.]+$/i.test(trimmed)) {
    return trimmed + '@pestalozzi.education';
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function () {
  const form     = document.getElementById('sh-login-form');
  const usrInput = document.getElementById('usr');
  const pwdInput = document.getElementById('pwd');
  const errorMsg = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorMsg.style.display = 'none';
    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled    = true;

    const rawInput   = usrInput.value.trim();
    const loginEmail = resolveLoginEmail(rawInput);

    try {
      // Step 1: Frappe session login
      const fd = new FormData();
      fd.append('usr', loginEmail);
      fd.append('pwd', pwdInput.value);

      const loginRes  = await fetch('/api/method/login', {
        method: 'POST', body: fd, credentials: 'include'
      });
      const loginData = await loginRes.json();

      // Frappe returns 'Logged In' for full users or 'No App' when no
      // default desk app is configured — both indicate success.
      if (
        loginData.message !== 'Logged In' &&
        loginData.message !== 'No App'    &&
        !loginData.full_name
      ) {
        throw new Error(loginData.message || 'Login failed. Please check your credentials.');
      }

      localStorage.setItem('sh_user', loginEmail);
      localStorage.setItem('sh_display_user', rawInput);

      // Step 2: Is this user linked to an SH Student record?
      const studentRes = await fetch(
        '/api/resource/SH Student?filters=' + encodeURIComponent(
          JSON.stringify([['portal_user_account', '=', loginEmail]])
        ) + '&fields=' + encodeURIComponent(JSON.stringify(['name'])) + '&limit=1',
        { headers: { 'Accept': 'application/json' }, credentials: 'include' }
      );
      if (!studentRes.ok) throw new Error('Unable to verify student record.');
      const studentData = await studentRes.json();

      if (studentData.data && studentData.data.length > 0) {
        localStorage.setItem('sh_student_id', studentData.data[0].name);
        localStorage.removeItem('sh_role');
        window.location.href = '/skillshub/profile';
        return;
      }

      // Step 3: Check role for admin / teacher routing
      const roleRes = await fetch(
        '/api/resource/Has Role?filters=' + encodeURIComponent(
          JSON.stringify([
            ['parent', '=', loginEmail],
            ['role', 'in', ['System Manager', 'PI Admin', 'SH Admin', 'SH Teacher']],
          ])
        ) + '&fields=' + encodeURIComponent(JSON.stringify(['role'])) + '&limit=10',
        { headers: { 'Accept': 'application/json' }, credentials: 'include' }
      );
      if (!roleRes.ok) throw new Error('Unable to verify user roles.');
      const roleData = await roleRes.json();
      const roles    = (roleData.data || []).map(function (r) { return r.role; });

      localStorage.removeItem('sh_student_id');

      // SH Admin → admin dashboard
      if (roles.indexOf('SH Admin') !== -1 || roles.indexOf('PI Admin') !== -1 || roles.indexOf('System Manager') !== -1) {
        localStorage.setItem('sh_role', 'admin');
        window.location.href = '/skillshub/admin/students';
        return;
      }

      // SH Teacher → attendance
      if (roles.indexOf('SH Teacher') !== -1) {
        localStorage.setItem('sh_role', 'teacher');
        window.location.href = '/skillshub/attendance';
        return;
      }

      // Fallback for any other authenticated staff
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
