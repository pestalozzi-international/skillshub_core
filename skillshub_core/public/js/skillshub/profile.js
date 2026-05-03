(function () {
  'use strict';

  // --- Constants & State ---
  const studentId = localStorage.getItem('sh_student_id');
  let currentStudentDoc = null;

  function getFrappeHeaders() {
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (window.frappe && frappe.csrf_token && frappe.csrf_token !== 'None' && !frappe.csrf_token.includes('{{')) {
      headers['X-Frappe-CSRF-Token'] = frappe.csrf_token;
    }
    return headers;
  }

  function clearAndRedirect() {
    localStorage.clear();
    window.location.replace('/skillshub/login');
  }

  // --- Core Lifecycle ---
  document.addEventListener('DOMContentLoaded', async () => {
    // Rescue: If studentId is missing but we're at /profile, try to fetch it from session
    if (!studentId) {
      await attemptRescue();
    }
    
    if (!localStorage.getItem('sh_student_id')) { 
      clearAndRedirect(); 
      return; 
    }
    
    fetchStudentSummary();
    setupEventListeners();
  });

  async function attemptRescue() {
    try {
      // In Frappe, we can usually hit /api/method/frappe.auth.get_logged_user 
      // but let's just try to fetch the student record using the session's 'user' if available
      // Or better, just fetch /api/resource/SH Student with no filters to see if any matches our session
      // (Frappe's REST API will respect session user permissions)
      const res = await fetch('/api/resource/SH Student?limit=1', { headers: getFrappeHeaders(), credentials: 'include' });
      const data = await res.json();
      if (data && data.data && data.data.length > 0) {
        localStorage.setItem('sh_student_id', data.data[0].name);
        localStorage.setItem('sh_role', 'student');
      }
    } catch (err) {
      console.error('Rescue failed:', err);
    }
  }

  function setupEventListeners() {
    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        fetch('/api/method/logout', { method: 'POST', headers: getFrappeHeaders(), credentials: 'include' })
          .finally(() => clearAndRedirect());
      });
    }

    // Form Toggles
    document.querySelectorAll('.edit-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const formId = btn.getAttribute('data-form');
        const form = document.getElementById(formId);
        if (form) {
          form.classList.toggle('active');
          btn.textContent = form.classList.contains('active') ? 'Cancel' : 'Edit Contact';
        }
      });
    });

    document.querySelectorAll('.cancel-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const form = btn.closest('form');
        if (form) {
          form.classList.remove('active');
          const toggle = document.querySelector(`.edit-toggle[data-form="${form.id}"]`);
          if (toggle) toggle.textContent = 'Edit Contact';
        }
      });
    });

    // Contact Form Submit
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', handleProfileUpdate);
    }

    // Pill Add Buttons
    const addMotivationBtn = document.getElementById('add-motivation-btn');
    if (addMotivationBtn) {
      addMotivationBtn.addEventListener('click', () => showOptionsModal('SH Student Motivation', 'motivation', 'motivations'));
    }

    const addResilienceBtn = document.getElementById('add-resilience-btn');
    if (addResilienceBtn) {
      addResilienceBtn.addEventListener('click', () => showOptionsModal('SH Student Resilience', 'resilience_statement', 'resilience_links'));
    }
  }

  // --- API Methods ---
  async function fetchStudentSummary() {
    try {
      const res = await fetch(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${encodeURIComponent(studentId)}`, {
        headers: getFrappeHeaders(),
        credentials: 'include'
      });
      if (res.status === 401) { clearAndRedirect(); return; }
      const data = await res.json();
      if (data && data.message) {
        renderProfile(data.message.student);
        renderTimeline(data.message.enrolments || [], data.message.student);
        // Also fetch the full doc for CRUD/Tables
        fetchFullStudentDoc();
      }
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  }

  async function fetchFullStudentDoc() {
    try {
      const res = await fetch(`/api/resource/SH Student/${encodeURIComponent(studentId)}`, {
        headers: getFrappeHeaders(),
        credentials: 'include'
      });
      const data = await res.json();
      if (data && data.data) {
        currentStudentDoc = data.data;
        populateForms(currentStudentDoc);
        renderGrowthPills(currentStudentDoc);
      }
    } catch (err) {
      console.error('Failed to fetch full doc:', err);
    }
  }

  async function handleProfileUpdate(e) {
    e.preventDefault();
    const form = e.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    const originalText = saveBtn.textContent;
    
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const formData = new FormData(form);
    const payload = {};
    formData.forEach((value, key) => { payload[key] = value.trim(); });

    try {
      const res = await fetch(`/api/resource/SH Student/${encodeURIComponent(studentId)}`, {
        method: 'PUT',
        headers: getFrappeHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Update failed');
      
      form.classList.remove('active');
      const toggle = document.querySelector(`.edit-toggle[data-form="${form.id}"]`);
      if (toggle) toggle.textContent = 'Edit Contact';
      
      fetchStudentSummary();
    } catch (err) {
      alert('Error updating profile: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }

  // --- Growth/Pill Management ---
  function renderGrowthPills(doc) {
    renderPills('motivation-pills', doc.motivations || [], 'motivation', 'motivations');
    renderPills('resilience-pills', doc.resilience_links || [], 'resilience_statement', 'resilience_links');
  }

  function renderPills(containerId, data, fieldname, tableField) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const addBtn = container.querySelector('.sh-pill-add-btn');
    container.innerHTML = '';
    
    data.forEach(item => {
      const pill = document.createElement('div');
      pill.className = 'sh-pill';
      pill.innerHTML = `${item[fieldname]} <span class="sh-pill-remove" data-name="${item.name}" data-table="${tableField}">&times;</span>`;
      container.appendChild(pill);
    });
    
    if (addBtn) container.appendChild(addBtn);

    // Listen for removes
    container.querySelectorAll('.sh-pill-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = btn.getAttribute('data-name');
        const table = btn.getAttribute('data-table');
        removePill(table, name);
      });
    });
  }

  async function removePill(tableField, rowName) {
    if (!currentStudentDoc) return;
    const updatedTable = currentStudentDoc[tableField].filter(row => row.name !== rowName);
    
    try {
      const res = await fetch(`/api/resource/SH Student/${encodeURIComponent(studentId)}`, {
        method: 'PUT',
        headers: getFrappeHeaders(),
        credentials: 'include',
        body: JSON.stringify({ [tableField]: updatedTable })
      });
      if (res.ok) fetchFullStudentDoc();
    } catch (err) {
      console.error('Failed to remove pill:', err);
    }
  }

  async function addPill(tableField, valueField, value) {
    if (!currentStudentDoc) return;
    const newRow = { [valueField]: value };
    const updatedTable = [...(currentStudentDoc[tableField] || []), newRow];
    
    try {
      const res = await fetch(`/api/resource/SH Student/${encodeURIComponent(studentId)}`, {
        method: 'PUT',
        headers: getFrappeHeaders(),
        credentials: 'include',
        body: JSON.stringify({ [tableField]: updatedTable })
      });
      if (res.ok) {
        hideModal();
        fetchFullStudentDoc();
      }
    } catch (err) {
      console.error('Failed to add pill:', err);
    }
  }

  // --- Options Modal ---
  async function showOptionsModal(doctype, valueField, tableField) {
    let overlay = document.querySelector('.sh-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sh-modal-overlay';
      overlay.innerHTML = `
        <div class="sh-modal">
          <div class="sh-modal-header">
            <div class="sh-modal-title">Select Option</div>
            <button class="sh-modal-close" style="background:none; border:none; cursor:pointer; font-size:1.5rem;">&times;</button>
          </div>
          <div class="sh-modal-body" id="modal-list">Loading...</div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('.sh-modal-close').addEventListener('click', hideModal);
    }
    
    overlay.classList.add('active');
    const listContainer = document.getElementById('modal-list');
    listContainer.innerHTML = 'Loading...';

    try {
      const res = await fetch(`/api/resource/${doctype}?fields=["name"]&limit_page_length=100`, {
        headers: getFrappeHeaders(),
        credentials: 'include'
      });
      const data = await res.json();
      if (data && data.data) {
        listContainer.innerHTML = '';
        data.data.forEach(opt => {
          const item = document.createElement('div');
          item.className = 'sh-list-item';
          item.textContent = opt.name;
          item.addEventListener('click', () => addPill(tableField, valueField, opt.name));
          listContainer.appendChild(item);
        });
      }
    } catch (err) {
      listContainer.innerHTML = 'Error loading options.';
    }
  }

  function hideModal() {
    const overlay = document.querySelector('.sh-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  // --- Rendering Helpers ---
  function renderProfile(s) {
    var content = document.getElementById('content');
    
    // Banner
    var bannerHtml = '<div class="sh-page-header sh-animate-fade"><div class="sh-container"><div style="display:flex; justify-content:space-between; align-items:center;">' +
      '<div><h1>' + (s.student_name || '—') + '</h1><p>' + (s.current_cohort || '—') + ' • ' + (s.skillshub_programme || '—') + '</p></div>' +
      '<div style="display:flex; gap:1rem;">' +
        '<a href="/skillshub/baseline" class="nav-btn">Baseline</a>' +
        '<a href="/skillshub/feedback/soft-skills" class="nav-btn">Feedback</a>' +
        '<button id="logout-btn" class="nav-btn logout-btn">Sign Out</button>' +
      '</div>' +
      '</div></div></div>';

    // Sidebar
    var sidebarHtml = '<div class="sidebar-col">' +
      '<div class="glass-card sh-animate-fade">' +
        '<div class="section-title">Demographics</div>' +
        row('Student ID', s.name) +
        row('Birth Date', formatDate(s.date_of_birth)) +
        row('Gender', s.gender) +
        '<div class="data-row"><div class="data-label">Status</div><div class="data-value"><span class="sh-badge sh-badge-info">' + s.status + '</span></div></div>' +
      '</div>' +
      '<div class="glass-card sh-animate-fade" style="animation-delay: 0.1s;">' +
        '<div class="section-title">Growth & Motivation</div>' +
        '<div class="data-label" style="margin-bottom:0.5rem">Motivations</div>' +
        '<div id="motivation-pills" class="sh-pill-container"><button class="sh-pill-add-btn" id="add-motivation-btn">+ Add</button></div>' +
        '<div class="data-label" style="margin-top:1.5rem; margin-bottom:0.5rem">Resilience</div>' +
        '<div id="resilience-pills" class="sh-pill-container"><button class="sh-pill-add-btn" id="add-resilience-btn">+ Add</button></div>' +
      '</div></div>';

    // Main Content
    var mainHtml = '<div class="content-col">' +
      '<div class="glass-card sh-animate-fade editable-card" style="animation-delay: 0.2s;">' +
        '<div class="edit-toggle" data-form="contact-form">Edit Contact</div>' +
        '<div class="section-title">Contact Information</div>' +
        '<div class="sh-grid sh-grid-2" id="contact-display-grid">' +
          row('Address', [s.address_line_1, s.address_line_2, s.pincode].filter(Boolean).join(', ') || '—') +
          row('Mobile', s.mobile || '—') +
        '</div>' +
        '<form id="contact-form" class="sh-form">' +
          '<div class="sh-form-grid">' +
            '<div class="sh-input-group"><label>Address Line 1</label><input type="text" name="address_line_1" class="sh-input"></div>' +
            '<div class="sh-input-group"><label>Address Line 2</label><input type="text" name="address_line_2" class="sh-input"></div>' +
            '<div class="sh-input-group"><label>Postcode</label><input type="text" name="pincode" class="sh-input"></div>' +
            '<div class="sh-input-group"><label>Mobile</label><input type="text" name="mobile" class="sh-input"></div>' +
          '</div>' +
          '<div style="margin-top:1.5rem; display:flex; gap:0.75rem;">' +
            '<button type="submit" class="sh-btn-primary">Save</button>' +
            '<button type="button" class="sh-btn-secondary cancel-edit">Cancel</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
      '<div class="glass-card sh-animate-fade" style="animation-delay: 0.3s;">' +
        '<div class="section-title">Enrolment Journey</div>' +
        '<div id="timeline-container" class="timeline">Loading timeline...</div>' +
      '</div></div>';

    content.innerHTML = bannerHtml + '<div class="sh-container"><div class="sh-main-container">' + sidebarHtml + mainHtml + '</div></div>';
    
    // Re-bind events after render
    setupEventListeners();
  }

  function row(label, value) {
    return '<div class="data-row"><div class="data-label">' + label + '</div><div class="data-value">' + (value || '—') + '</div></div>';
  }

  function renderTimeline(enrolments, student) {
    var container = document.getElementById('timeline-container');
    if (!container) return;
    if (!enrolments.length) {
      container.innerHTML = '<div class="tl-item"><div class="tl-title">Started Journey</div></div>';
      return;
    }
    container.innerHTML = enrolments.map(function (e) {
      return '<div class="tl-item ' + (e.status === 'Completed' ? 'completed' : '') + '">' +
        '<div class="tl-date">' + formatDate(e.enrolment_date) + (e.completion_date ? ' — ' + formatDate(e.completion_date) : '') + '</div>' +
        '<div class="tl-title">' + (e.milestone || 'Milestone') + '</div>' +
        '<div class="tl-meta">' +
          '<span class="sh-badge ' + (e.status === 'Completed' ? 'sh-badge-success' : 'sh-badge-info') + '">' + e.status + '</span>' +
          (e.attendance_rate ? '<span class="sh-badge sh-badge-info">' + Math.round(e.attendance_rate) + '% Att.</span>' : '') +
          (e.feedback_submitted ? '<span class="sh-badge sh-badge-success">✓ Feedback</span>' : '') +
        '</div></div>';
    }).join('');
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '—';
  }

  function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

})();
