(function () {
  'use strict';

  function getHeaders() {
    var headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (
      window.frappe &&
      frappe.csrf_token &&
      frappe.csrf_token !== 'None' &&
      !String(frappe.csrf_token).includes('{{')
    ) {
      headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
  }

  function esc(value) {
    if (value === null || value === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function setFavicon(href) {
    if (!href) return;
    var icon = document.querySelector("link[rel~='icon']");
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = href + (href.indexOf('?') > -1 ? '&' : '?') + 'v=' + Date.now();
  }

  function applyBranding(settings) {
    if (!settings) return;
    var root = document.documentElement;
    root.style.setProperty('--color-teal-700', settings.primary_color || '#0f766e', 'important');
    root.style.setProperty('--color-teal-800', settings.secondary_color || '#115e59', 'important');
    root.style.setProperty('--color-accent-500', settings.accent_color || '#0ea5a4', 'important');
    root.style.setProperty('--color-slate-50', settings.background_color || '#f8fafc', 'important');
    root.style.setProperty('--surface-color', settings.surface_color || '#ffffff', 'important');
    root.style.setProperty('--text-color', settings.text_color || '#0f172a', 'important');
    root.style.setProperty('--muted-text-color', settings.muted_text_color || '#64748b', 'important');
    root.style.setProperty(
      '--header-gradient',
      settings.header_gradient || 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
      'important'
    );

    if (settings.favicon) setFavicon(settings.favicon);

    if (settings.logo) {
      document.querySelectorAll('.sh-logo').forEach(function (img) {
        img.src = settings.logo;
        img.style.display = 'block';
      });
    }

    var pageTitle = settings.portal_name || 'SkillsHub Portal';
    document.querySelectorAll('[data-portal-name]').forEach(function (el) {
      el.textContent = pageTitle;
    });
    document.querySelectorAll('[data-portal-tagline]').forEach(function (el) {
      el.textContent = settings.portal_tagline || '';
    });
    if (document.title && document.title.toLowerCase().indexOf('skillshub') > -1) {
      document.title = document.title.replace(/SkillsHub/gi, pageTitle);
    }
  }

  function api(path, options) {
    return fetch(path, Object.assign({ credentials: 'include', headers: getHeaders() }, options || {})).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' (' + path + ')');
      return r.json();
    });
  }

  var context = {
    settings: null,
    bootstrap: null,
    esc: esc,
    getHeaders: getHeaders,
    api: api
  };

  window.SHPortal = window.SHPortal || {};
  Object.assign(window.SHPortal, context);

  Promise.all([
    api('/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings').catch(function () { return { message: {} }; }),
    api('/api/method/skillshub_core.skillshub_portal.api.get_portal_bootstrap').catch(function () { return { message: {} }; })
  ])
    .then(function (results) {
      var settings = (results[0] && results[0].message) || {};
      var bootstrap = (results[1] && results[1].message) || {};
      window.SHPortal.settings = settings;
      window.SHPortal.bootstrap = bootstrap;
      applyBranding(settings);

      var roleClass = bootstrap && bootstrap.is_admin ? 'sh-role-admin' : bootstrap && bootstrap.is_logged_in ? 'sh-role-student' : 'sh-role-guest';
      document.body.classList.add(roleClass);
      window.dispatchEvent(new CustomEvent('sh-portal-ready', { detail: { settings: settings, bootstrap: bootstrap } }));
    })
    .catch(function (err) {
      console.warn('[SkillsHub] Portal bootstrap failed:', err);
    });
}());
