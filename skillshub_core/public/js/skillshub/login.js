(function () {
  'use strict';

  // Route guard
  var role      = localStorage.getItem('sh_role');
  var studentId = localStorage.getItem('sh_student_id');
  if (role === 'admin')   { window.location.replace('/skillshub/admin/students'); return; }
  if (role === 'teacher') { window.location.replace('/skillshub/attendance');     return; }
  if (studentId)          { window.location.replace('/skillshub/profile');        return; }

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

  document.addEventListener('DOMContentLoaded', function () {
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

      var fd = new FormData();
      fd.append('usr', loginEmail);
      fd.append('pwd', pwdInput.value);

      fetch('/api/method/login', { method: 'POST', body: fd, credentials: 'include' })
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
          { headers: { 'Accept': 'application/json' }, credentials: 'include' }
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
            ['role','in',['System Manager','PI Admin','SH Admin','SH Teacher']]
          ])) +
          '&fields=' + encodeURIComponent(JSON.stringify(['role'])) + '&limit=10',
          { headers: { 'Accept': 'application/json' }, credentials: 'include' }
        ).then(function (r) { return r.json(); });
      })
      .then(function (roleData) {
        if (!roleData) return;
        var roles = (roleData.data || []).map(function (r) { return r.role; });
        if (roles.indexOf('SH Admin') !== -1 || roles.indexOf('PI Admin') !== -1 || roles.indexOf('System Manager') !== -1) {
          localStorage.setItem('sh_role', 'admin');
          window.location.href = '/skillshub/admin/students';
        } else if (roles.indexOf('SH Teacher') !== -1) {
          localStorage.setItem('sh_role', 'teacher');
          window.location.href = '/skillshub/attendance';
        } else {
          localStorage.setItem('sh_role', 'teacher');
          window.location.href = '/skillshub/attendance';
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
