// SkillsHub Portal Settings loader
// Served from /assets/skillshub_core/js/skillshub/portal-settings.js
// Plain script tag (no ES module) — safe from Frappe Jinja processing.
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

  function setFavicon(href) {
    var link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href + (href.indexOf('?') > -1 ? '&' : '?') + 'v=' + Date.now();
  }

  function darken(hex, amount) {
    var c = hex.replace('#', '');
    if (c.length === 3) {
      c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    }
    var num = parseInt(c, 16);
    var r = Math.max(0, (num >> 16) - amount);
    var g = Math.max(0, ((num >> 8) & 0xff) - amount);
    var b = Math.max(0, (num & 0xff) - amount);
    function h(n) { return n.toString(16).padStart(2,'0'); }
    return '#' + h(r) + h(g) + h(b);
  }

  function applySettings(s) {
    if (!s || typeof s !== 'object') {
      console.error('[SkillsHub] Invalid portal settings payload:', s);
      return;
    }
    console.log('[SkillsHub] Applying Portal Settings:', s);
    if (s.portal_name) {
      var title = document.querySelector('.sh-login-card h2'); if (title) title.textContent = s.portal_name;
      document.title = s.portal_name;
    }
    if (s.favicon) {
      var fav = document.getElementById('sh-favicon');
      if (fav) fav.href = s.favicon + '?v=' + Date.now();
    }
    if (s.primary_color) {
      console.log('[SkillsHub] Applying branding color:', s.primary_color);
      var root = document.documentElement;
      root.style.setProperty('--color-teal-700', s.primary_color, 'important');
      root.style.setProperty('--color-teal-600', s.primary_color, 'important'); // Also update 600 for buttons
      root.style.setProperty('--color-teal-800', darken(s.primary_color, 18), 'important');
      root.style.setProperty('--header-gradient', 'linear-gradient(135deg, ' + s.primary_color + ' 0%, ' + darken(s.primary_color, 18) + ' 100%)', 'important');
      root.style.setProperty('--sh-glass-border', 'rgba(255,255,255,0.32)', 'important');
      // Generate a darker version for gradients if possible, or just use the same
      root.style.setProperty('--color-teal-900', 'rgba(0,0,0,0.2)', 'important');
    }
    if (s.logo) {
      var logos = document.querySelectorAll('.sh-logo');
      logos.forEach(function (l) { l.src = s.logo; l.style.display = 'block'; });
    }
  }

  function syncNav() {
    var role = localStorage.getItem('sh_role');
    var isAdmin = (role === 'admin' || role === 'teacher');
    ['nav-desk', 'nav-students', 'nav-attendance'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = isAdmin ? 'block' : 'none';
    });
    var profile = document.getElementById('nav-profile');
    if (profile) profile.style.display = (role === 'student') ? 'block' : 'none';
  }

  syncNav();
  console.log('[SkillsHub] Fetching Portal Settings & Syncing Role...');
  Promise.all([
    fetch('/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings', { headers: getFrappeHeaders(), credentials: 'include' }),
    fetch('/api/method/skillshub_core.skillshub_core.api.get_current_user_roles', { headers: getFrappeHeaders(), credentials: 'include' })
  ])
  .then(function (responses) {
    if (!responses[0] || !responses[0].ok) {
      console.error('[SkillsHub] Failed to load portal branding settings. HTTP status:', responses[0] ? responses[0].status : 'No response');
    }
    if (!responses[1] || !responses[1].ok) {
      console.error('[SkillsHub] Failed to load user roles. HTTP status:', responses[1] ? responses[1].status : 'No response');
    }
    return Promise.all(responses.map(function(r) { return r.ok ? r.json() : null; }));
  })
  .then(function (results) {
    var settingsData = results[0];
    var rolesData = results[1];

    if (settingsData && settingsData.message) {
      applySettings(settingsData.message);
    } else {
      console.error('[SkillsHub] Branding settings response is empty or malformed:', settingsData);
    }
    
    if (rolesData && rolesData.message) {
      var roles = rolesData.message;
      var role = 'student';
      if (
        roles.indexOf('System Manager') > -1 ||
        roles.indexOf('PI Admin') > -1 ||
        roles.indexOf('SH Admin') > -1 ||
        roles.indexOf('SkillsHub Admin') > -1
      ) role = 'admin';
      else if (roles.indexOf('SH Teacher') > -1 || roles.indexOf('SkillsHub Teacher') > -1) role = 'teacher';
      
      var oldRole = localStorage.getItem('sh_role');
      if (oldRole !== role) {
        console.log('[SkillsHub] Syncing role:', role);
        localStorage.setItem('sh_role', role);
        // Dispatch event so other scripts (like attendance.js) can react if they loaded early
        window.dispatchEvent(new CustomEvent('sh-role-synced', { detail: { role: role } }));
      }
    }
    syncNav();
  })
  .catch(function (err) { 
    console.error('[SkillsHub] Init error:', err);
  });
}());
