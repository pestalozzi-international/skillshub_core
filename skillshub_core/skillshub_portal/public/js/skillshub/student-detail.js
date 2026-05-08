(function () {
  'use strict';

  function getFrappeHeaders() {
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (window.frappe && frappe.csrf_token && frappe.csrf_token !== 'None' && !frappe.csrf_token.includes('{{')) {
      headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
  }

  function clearAndRedirect() {
    localStorage.clear();
    window.location.replace('/skillshub/login');
  }

  var params = new URLSearchParams(window.location.search);
  var studentId = params.get('id');

  function sf(url) {
    return fetch(url, { headers: getFrappeHeaders(), credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { clearAndRedirect(); return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text().then(function (text) {
          if (!text) return {};
          try {
            return JSON.parse(text);
          } catch (parseErr) {
            console.error('[SkillsHub] Malformed JSON response from:', url, parseErr);
            return { data: null, _parse_error: true };
          }
        });
      });
  }

  function getSafeArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        var parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch (e) {
        console.error('[SkillsHub] Invalid child-table JSON:', e);
        return [];
      }
    }
    return [];
  }

  function getSafeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!studentId) {
      document.getElementById('content').innerHTML = '<div style="text-align:center; padding:5rem;">Student ID missing.</div>';
      return;
    }

    fetchData();
  });

  function fetchData() {
    console.log('[SkillsHub] Loading student detail:', studentId);
    Promise.allSettled([
      sf('/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=' + encodeURIComponent(studentId))
    ])
    .then(function (results) {
      var summaryRes = results[0];

      if (summaryRes.status === 'rejected') {
        throw new Error('Failed to fetch student record: ' + (summaryRes.reason.message || 'Unknown error'));
      }

      var payload = summaryRes.value && summaryRes.value.message ? summaryRes.value.message : null;
      var s = payload && payload.student ? payload.student : null;
      
      if (!s || !s.name) {
        throw new Error('Student record not found or data is invalid.');
      }

      var enrolments = payload && Array.isArray(payload.enrolments) ? payload.enrolments : [];
      render(s, enrolments);
    })
    .catch(function (err) {
      console.error('[SkillsHub] Profile load error:', err);
      document.getElementById('content').innerHTML =
        '<div class="sh-container"><div class="glass-card sh-animate-fade" style="margin-top:2rem; text-align:center; padding:5rem; color:var(--color-red-700)">' +
        '<h2 style="color:var(--color-red-700)">Unable to load profile</h2>' +
        '<p>' + err.message + '</p>' +
        '<button onclick="location.reload()" class="sh-btn-secondary" style="margin-top:1rem">Try Again</button>' +
        '</div></div>';
    });
  }

  function fmt(d) {
    if (!d) return '—';
    var dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function render(s, enrolments) {
    var content = document.getElementById('content');
    var motivations = getSafeArray(s && s.motivations);
    var resilienceLinks = getSafeArray(s && s.resilience_links);
    
    // Header with navigation
    var headerHtml = '<div class="sh-page-header sh-animate-fade"><div class="sh-container">' +
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">' +
        '<div>' +
          '<a href="/skillshub/admin/students" class="sh-back-link" style="color:rgba(255,255,255,0.7); text-decoration:none; font-size:0.875rem; display:block; margin-bottom:0.5rem;">← Back to Directory</a>' +
          '<h1>' + (s.student_name || '—') + '</h1>' +
          '<p>' + (s.intake_year || 'No Intake Year') + ' • ' + (s.skillshub_programme || 'No Programme') + '</p>' +
          '<p style="font-size:0.875rem; opacity:0.85; margin-top:0.35rem; max-width:36rem;">' + (s.path_definition || '') + '</p>' +
        '</div>' +
        '<div class="sh-admin-nav" style="display:flex; gap:1.25rem; align-items:center; margin-top:0.75rem;">' +
          '<a href="/app" id="nav-desk" style="color:white; text-decoration:none; font-size:0.875rem; opacity:0.8;">Desk</a>' +
          '<a href="/skillshub/admin/students" id="nav-students" style="color:white; text-decoration:none; font-size:0.875rem; opacity:0.8; font-weight:600;">Students</a>' +
          '<a href="/skillshub/attendance" id="nav-attendance" style="color:white; text-decoration:none; font-size:0.875rem; opacity:0.8;">Attendance</a>' +
          '<button id="logout-btn" style="background:none; border:none; color:white; opacity:0.8; font-weight:600; cursor:pointer; font-size:0.875rem;">Sign Out</button>' +
        '</div>' +
      '</div></div></div>';

    // Sidebar
    var sidebarHtml = '<div class="sidebar-col">' +
      '<div class="glass-card sh-animate-fade">' +
        '<div class="section-title">Demographics</div>' +
        row('Student ID', s.name) +
        row('Birth Date', fmt(s.date_of_birth)) +
        row('Gender', s.gender) +
        row('NRC Number', s.nrc_number) +
        '<div class="data-row"><div class="data-label">Status</div><div class="data-value"><span class="sh-badge ' + (s.status === 'Active' ? 'sh-badge-success' : 'sh-badge-info') + '">' + (s.status || 'Unknown') + '</span></div></div>' +
      '</div>' +
      '<div class="glass-card sh-animate-fade" style="animation-delay: 0.1s;">' +
        '<div class="section-title">Growth & Motivation</div>' +
        pillsSection('Motivations', motivations, 'motivation') +
        pillsSection('Resilience', resilienceLinks, 'resilience_statement') +
      '</div></div>';

    // Main Content
    var mainHtml = '<div class="content-col">' +
      '<div class="glass-card sh-animate-fade" style="animation-delay: 0.2s;">' +
        '<div class="section-title">Contact Information</div>' +
        '<div class="sh-grid sh-grid-2">' +
          row('Address', [s.address_line_1, s.address_line_2, s.pincode].filter(Boolean).join(', ') || '—') +
          row('Mobile', s.mobile || '—') +
          row('Email', s.personal_email || '—') +
          row('Guardian', s.guardian_name || '—') +
        '</div>' +
      '</div>' +
      '<div class="glass-card sh-animate-fade" style="animation-delay: 0.3s;">' +
        '<div class="section-title">Enrolment Journey</div>' +
        '<div class="timeline">' + (renderTimeline(enrolments) || '<div class="tl-item">No history found</div>') + '</div>' +
      '</div></div>';

    content.parentElement.innerHTML = headerHtml + '<div class="sh-container" style="margin-top:-1.75rem;"><div class="sh-main-container">' + sidebarHtml + mainHtml + '</div></div>';

    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        fetch('/api/method/logout', { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' })
          .finally(function () { clearAndRedirect(); });
      });
    }
  }

  function renderTimeline(enrolments) {
    return enrolments.map(function (e) {
      var submittedForms = Array.isArray(e.feedback_forms_submitted) ? e.feedback_forms_submitted : [];
      var formsHtml = submittedForms.length
        ? '<div style="margin-top:0.5rem; display:flex; flex-wrap:wrap; gap:0.4rem;">' + submittedForms.map(function (name) {
            return '<span class="sh-badge sh-badge-success" style="text-transform:none; letter-spacing:0;">✓ ' + name + '</span>';
          }).join('') + '</div>'
        : '<div style="margin-top:0.5rem; font-size:0.78rem; color:var(--color-slate-500)">No submitted feedback for this schedule yet.</div>';
      return '<div class="tl-item ' + (e.status === 'Completed' ? 'completed' : '') + '">' +
        '<div class="tl-date">' + fmt(e.enrolment_date) + (e.completion_date ? ' — ' + fmt(e.completion_date) : '') + '</div>' +
        '<div class="tl-title">' + (e.milestone || e.course || e.class || 'Programme Milestone') + (e.course && e.milestone ? ' · ' + e.course : '') + '</div>' +
        '<div class="tl-meta">' +
          '<span class="sh-badge ' + (e.status === 'Completed' ? 'sh-badge-success' : 'sh-badge-info') + '">' + e.status + '</span>' +
          (e.attendance_rate ? '<span class="sh-badge sh-badge-info">' + Math.round(e.attendance_rate) + '% Att.</span>' : '') +
          (e.feedback_submitted ? '<span class="sh-badge sh-badge-success">✓ Feedback</span>' : '') +
        '</div>' + formsHtml + '</div>';
    }).join('');
  }

  function row(label, value) {
    return '<div class="data-row"><div class="data-label">' + label + '</div><div class="data-value">' + (value || '—') + '</div></div>';
  }

  function pillsSection(label, data, field) {
    var pills = '';
    if (Array.isArray(data)) {
      pills = data.map(function (item) {
        var safeItem = (item && typeof item === 'object') ? item : {};
        var text = getSafeText(safeItem[field]);
        return '<div class="sh-pill">' + (text || '—') + '</div>';
      }).join('');
    }
    return '<div class="data-label" style="margin-top: 1rem; margin-bottom: 0.5rem;">' + label + '</div>' +
      '<div class="sh-pill-container">' + (pills || '<span style="font-size:0.875rem; color:var(--color-slate-400)">None</span>') + '</div>';
  }

}());
