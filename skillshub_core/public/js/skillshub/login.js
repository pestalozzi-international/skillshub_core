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
    localStorage.removeItem('sh_student_id');
    localStorage.removeItem('sh_role');
    localStorage.removeItem('sh_user');
    localStorage.removeItem('sh_display_user');
  }

  function autoRedirect() {
    const role = localStorage.getItem('sh_role');
    const sid = localStorage.getItem('sh_student_id');
    if (role === 'admin') window.location.replace('/skillshub/admin/students');
    else if (role === 'teacher') window.location.replace('/skillshub/attendance');
    else if (sid) window.location.replace('/skillshub/profile');
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
        localStorage.setItem('sh_user', loginEmail);
        localStorage.setItem('sh_display_user', rawInput);

        // Step 2: student record check
        return fetch(
          '/api/resource/SH Student?filters=' + encodeURIComponent(JSON.stringify([['portal_user_account','=',loginEmail]])) +
          '&fields=' + encodeURIComponent(JSON.stringify(['name'])) + '&limit=1',
          { headers: getFrappeHeaders(), credentials: 'include' }
        );
      })
      .then(function (r) { return r.json(); })
      .then(function (studentData) {
        if (studentData.data && studentData.data.length > 0) {
          localStorage.setItem('sh_student_id', studentData.data[0].name);
          window.location.href = '/skillshub/profile';
          return null;
        }
        // Step 3: role check
        return fetch(
          '/api/resource/Has Role?filters=' + encodeURIComponent(JSON.stringify([
            ['parent','=',localStorage.getItem('sh_user')],
            ['role','in',['System Manager','PI Admin','SH Admin','SH Teacher','SH Student']]
          ])) +
          '&fields=' + encodeURIComponent(JSON.stringify(['role'])) + '&limit=10',
          { headers: getFrappeHeaders(), credentials: 'include' }
        ).then(function (r) { return r.json(); });
      })
      .then(function (roleData) {
        if (!roleData) return;
        var roles = (roleData.data || []).map(function (r) { return r.role; });
        if (roles.indexOf('SH Admin') !== -1 || roles.indexOf('PI Admin') !== -1 || roles.indexOf('System Manager') !== -1) {
          localStorage.setItem('sh_role', 'admin');
          window.location.replace('/skillshub/admin/students');
        } else if (roles.indexOf('SH Teacher') !== -1) {
          localStorage.setItem('sh_role', 'teacher');
          window.location.replace('/skillshub/attendance');
        } else {
          // Fallback to profile for potential students
          localStorage.setItem('sh_role', 'student');
          window.location.replace('/skillshub/profile');
        }
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
