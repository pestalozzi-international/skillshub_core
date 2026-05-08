(function () {
  'use strict';

  function parseMode() {
    var params = new URLSearchParams(window.location.search);
    var mode = (params.get('mode') || '').toLowerCase();
    if (mode !== 'student' && mode !== 'admin') return 'portal';
    return mode;
  }

  function updateUI(settings) {
    var mode = parseMode();
    var pill = document.getElementById('mode-pill');
    var primary = document.getElementById('primary-login-link');
    var notice = document.getElementById('login-notice');
    var tagline = document.getElementById('login-tagline');

    var studentRoute = (settings && settings.student_home_route) || '/skillshub/profile';
    var adminRoute = (settings && settings.admin_home_route) || '/skillshub/admin/students';

    if (mode === 'student') {
      if (pill) pill.textContent = 'Mode: Student';
      if (primary) primary.href = '/login?redirect-to=' + encodeURIComponent(studentRoute);
      if (tagline) tagline.textContent = 'Students sign in here using your official account.';
    } else if (mode === 'admin') {
      if (pill) pill.textContent = 'Mode: Administrator';
      if (primary) primary.href = '/login?redirect-to=' + encodeURIComponent(adminRoute);
      if (tagline) tagline.textContent = 'Administrators and teachers sign in with your staff account.';
    } else {
      if (pill) pill.textContent = 'Mode: Portal';
      if (primary) primary.href = '/login?redirect-to=' + encodeURIComponent('/skillshub');
    }

    if (notice) {
      notice.textContent = (settings && settings.login_notice) || '';
      notice.style.display = notice.textContent ? 'block' : 'none';
    }
  }

  window.addEventListener('sh-portal-ready', function (event) {
    var settings = event.detail && event.detail.settings ? event.detail.settings : {};
    var bootstrap = event.detail && event.detail.bootstrap ? event.detail.bootstrap : {};
    updateUI(settings);

    if (bootstrap && bootstrap.is_logged_in) {
      var target = bootstrap.is_admin
        ? ((settings && settings.admin_home_route) || '/skillshub/admin/students')
        : ((settings && settings.student_home_route) || '/skillshub/profile');
      window.location.replace(target);
    }
  });
}());
