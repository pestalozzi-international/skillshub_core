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
    console.log('[SkillsHub] Applying Portal Settings:', s);
    var root = document.documentElement;
    if (s.primary_color) {
      root.style.setProperty('--color-teal-700', s.primary_color);
      root.style.setProperty('--color-teal-800', darken(s.primary_color, 15));
    }
    if (s.secondary_color) {
      root.style.setProperty('--color-secondary', s.secondary_color);
    }
    if (s.header_gradient) {
      root.style.setProperty('--header-gradient', s.header_gradient);
    }
    if (s.favicon) {
      setFavicon(s.favicon);
    }
    if (s.logo) {
      root.style.setProperty('--portal-logo-url', "url('" + s.logo + "')");
      window.__shLogoUrl = s.logo;
      var img = document.getElementById('portal-logo');
      var box = document.getElementById('logo-container');
      if (img && box) { img.src = s.logo; box.style.display = 'block'; }
    }
  }

  console.log('[SkillsHub] Fetching Portal Settings & Syncing Role...');
  Promise.all([
    fetch('/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings', { headers: getFrappeHeaders(), credentials: 'include' }),
    fetch('/api/method/skillshub_core.skillshub_core.api.get_current_user_roles', { headers: getFrappeHeaders(), credentials: 'include' })
  ])
  .then(function (responses) {
    return Promise.all(responses.map(function(r) { return r.ok ? r.json() : null; }));
  })
  .then(function (results) {
    var settingsData = results[0];
    var rolesData = results[1];

    if (settingsData && settingsData.message) applySettings(settingsData.message);
    
    if (rolesData && rolesData.message) {
      var roles = rolesData.message;
      var role = 'student';
      if (roles.indexOf('System Manager') > -1 || roles.indexOf('SkillsHub Admin') > -1) role = 'admin';
      else if (roles.indexOf('SkillsHub Teacher') > -1) role = 'teacher';
      
      var oldRole = localStorage.getItem('sh_role');
      if (oldRole !== role) {
        console.log('[SkillsHub] Syncing role:', role);
        localStorage.setItem('sh_role', role);
        // Dispatch event so other scripts (like attendance.js) can react if they loaded early
        window.dispatchEvent(new CustomEvent('sh-role-synced', { detail: { role: role } }));
      }
    }
  })
  .catch(function (err) { 
    console.error('[SkillsHub] Init error:', err);
  });
}());
