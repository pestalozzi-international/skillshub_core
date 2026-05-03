/**
 * portal-settings.js
 * Fetches SkillsHub Portal Settings from the Frappe backend and applies
 * CSS custom properties + favicon to the current page.
 *
 * Import at the top of every page JS file:
 *   import { applyPortalSettings } from '/skillshub/portal-settings.js';
 *   applyPortalSettings();
 *
 * Falls back gracefully to built-in theme.css defaults if the API is
 * unreachable or the settings doc is empty.
 */

export async function applyPortalSettings() {
  try {
    const res = await fetch(
      '/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings',
      { headers: { 'Accept': 'application/json' }, credentials: 'include' }
    );
    if (!res.ok) return;
    const data = await res.json();
    const s = data.message || {};

    const root = document.documentElement;

    if (s.primary_color) {
      root.style.setProperty('--color-teal-700', s.primary_color);
      // Darken primary by ~10% for the hover shade
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
      // Expose logo URL as a CSS variable so themed pages can use it
      root.style.setProperty('--portal-logo-url', `url('${s.logo}')`);
      // Also store in a global for JS consumption
      window.__shLogoUrl = s.logo;
    }
  } catch (_) {
    // Silently fail — built-in CSS variables remain in effect
  }
}

function setFavicon(href) {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Darken a hex colour by `amount` (0–255).
 * Used to compute --color-teal-800 from the primary colour.
 */
function darken(hex, amount) {
  const c = hex.replace('#', '');
  const num = parseInt(c.length === 3
    ? c.split('').map(x => x + x).join('')
    : c, 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
