// SkillsHub Portal Settings loader
// Served from /assets/skillshub_core/js/skillshub/portal-settings.js
// Plain script tag (no ES module) — safe from Frappe Jinja processing.
(function () {
  'use strict';

  function getFrappeHeaders() {
      let csrfToken = '';
      if (window.frappe && frappe.csrf_token) {
          csrfToken = frappe.csrf_token;
      } else {
          const match = document.cookie.match(new RegExp('(^| )system_user=([^;]+)'));
          if (match) csrfToken = decodeURIComponent(match[2]);
      }
      return {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': csrfToken
      };
  }

  function setFavicon(href) {
    var link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
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

  fetch(
    '/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings',
    { headers: getFrappeHeaders(), credentials: 'include' }
  )
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (data) {
    if (data && data.message) applySettings(data.message);
  })
  .catch(function () { /* silently use CSS defaults */ });
}());
