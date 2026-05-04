(function () {
  'use strict';

  function getFrappeHeaders() {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    if (window.frappe && frappe.csrf_token && frappe.csrf_token !== 'None' && !frappe.csrf_token.includes('{{')) {
        headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
}

  // No synchronous localStorage redirect — users who navigate to /login
  // should always see the login form. Stale localStorage keys are unreliable.

  function resolveLoginEmail(raw) {
    var trimmed = raw.trim();
    if (trimmed.indexOf('@') === -1 && /^SH[\d.]+$/i.test(trimmed)) {
      return trimmed + '@pestalozzi.education';
    }
    return trimmed;
  }

  function clearSession() {
    // Do not persist session state in localStorage anymore.
    // Rely on server-side session (frappe.session.user) and role checks.
  }

  function autoRedirect() {
    // Query server to determine whether current user is linked to a student or has admin/teacher roles.
    fetch('/api/method/skillshub_core.skillshub_core.api.get_portal_student_context', { headers: getFrappeHeaders(), credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.message && data.message.student) {
          // User is a student with a linked profile
          window.location.replace('/skillshub/profile');
          return;
        }
        // Fallback: check roles
        return fetch('/api/resource/Has Role?filters=' + encodeURIComponent(JSON.stringify([
          ['parent','=',frappe && frappe.session && frappe.session.user || ''],
          ['role','in',['System Manager','PI Admin','SH Admin','SH Teacher','SH Student']]
        ])) + '&fields=' + encodeURIComponent(JSON.stringify(['role'])) + '&limit=10', { headers: getFrappeHeaders(), credentials: 'include' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (roleData) {
            var roles = (roleData && roleData.data || []).map(function (r) { return r.role; });
            if (roles.indexOf('SH Admin') !== -1 || roles.indexOf('PI Admin') !== -1 || roles.indexOf('System Manager') !== -1) {
              window.location.replace('/skillshub/admin/students');
            } else if (roles.indexOf('SH Teacher') !== -1) {
              window.location.replace('/skillshub/attendance');
            }
          })
          .catch(function () { /* ignore */ });
      })
      .catch(function () { /* ignore */ });
  }

  function validateSessionAndRedirect() {
    fetch('/api/method/frappe.auth.get_logged_user', { headers: getFrappeHeaders(), credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.message || data.message === 'Guest') {
          clearSession();
          return;
        }
        autoRedirect();
      })
      .catch(function () {
        clearSession();
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    validateSessionAndRedirect(); // Redirect only for real active sessions.

    var form     = document.getElementById('sh-login-form');
    var usrInput = document.getElementById('usr');
    var pwdInput = document.getElementById('pwd');
    var errorMsg = document.getElementById('login-error');
    var loginBtn = document.getElementById('login-btn');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorMsg.style.display = 'none';
      loginBtn.textContent = 'Signing in...';
      loginBtn.disabled    = true;

      var rawInput   = usrInput.value.trim();
      var loginEmail = resolveLoginEmail(rawInput);

      var payload = {
        usr: loginEmail,
        pwd: pwdInput.value
      };

      fetch('/api/method/login', { method: 'POST', headers: getFrappeHeaders(), body: JSON.stringify(payload), credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (loginData) {
        if (loginData.message !== 'Logged In' && loginData.message !== 'No App' && !loginData.full_name) {
          throw new Error(loginData.message || 'Login failed. Please check your credentials.');
        }
        clearSession();
        // Step 2: check server to see if current login maps to a student; rely on server-side context
        return fetch('/api/method/skillshub_core.skillshub_core.api.get_portal_student_context', { headers: getFrappeHeaders(), credentials: 'include' });
      })
      .then(function (r) { return r.json(); })
      .then(function (studentData) {
        return studentData.json();
      })
      .then(function (roleData) {
        // If get_portal_student_context returned a student, go to profile
        if (loginData && loginData.message) {
          try {
            var ctx = JSON.parse(loginData.message || '{}');
            if (ctx && ctx.student) { window.location.replace('/skillshub/profile'); return; }
          } catch (e) { /* ignore */ }
        }
        // Otherwise, run a role query (best-effort)
        return fetch('/api/resource/Has Role?filters=' + encodeURIComponent(JSON.stringify([
          ['parent','=',loginEmail],
          ['role','in',['System Manager','PI Admin','SH Admin','SH Teacher','SH Student']]
        ])) + '&fields=' + encodeURIComponent(JSON.stringify(['role'])) + '&limit=10', { headers: getFrappeHeaders(), credentials: 'include' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (roleData) {
            var roles = (roleData && roleData.data || []).map(function (r) { return r.role; });
            if (roles.indexOf('SH Admin') !== -1 || roles.indexOf('PI Admin') !== -1 || roles.indexOf('System Manager') !== -1) {
              window.location.replace('/skillshub/admin/students');
            } else if (roles.indexOf('SH Teacher') !== -1) {
              window.location.replace('/skillshub/attendance');
            } else {
              window.location.replace('/skillshub/profile');
            }
          });
      })
      .catch(function (err) {
        errorMsg.textContent = err.message || 'An error occurred during login.';
        errorMsg.style.display = 'block';
        loginBtn.textContent = 'Sign In';
        loginBtn.disabled    = false;
      });
    });
  });
}());
