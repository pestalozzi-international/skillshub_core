(function () {
  'use strict';

  var state = {
    page: 1,
    totalPages: 1,
    total: 0
  };

  function esc(value) {
    if (value === null || value === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function getHeaders() {
    return (window.SHPortal && window.SHPortal.getHeaders && window.SHPortal.getHeaders()) || {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  function api(path, options) {
    return fetch(path, Object.assign({ credentials: 'include', headers: getHeaders() }, options || {}))
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (json) { return json.message || json; });
  }

  function currentFilters() {
    return {
      search: document.getElementById('f-search').value.trim(),
      status: document.getElementById('f-status').value,
      programme_path: document.getElementById('f-programme-path').value,
      intake_cohort: document.getElementById('f-intake-cohort').value
    };
  }

  function pageSize() {
    return parseInt(document.getElementById('f-page-size').value, 10) || 25;
  }

  function renderRows(items) {
    var body = document.getElementById('students-body');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="8" class="sh-empty-cell">No students found for current filters.</td></tr>';
      return;
    }

    body.innerHTML = items
      .map(function (row) {
        var attendance = row.avg_attendance ? Math.round(row.avg_attendance) + '%' : '—';
        return (
          '<tr>' +
          '<td><div style="font-weight:600">' + esc(row.student_name || row.name) + '</div><div style="font-size:0.78rem;color:var(--muted-text-color)">' + esc(row.name) + '</div></td>' +
          '<td><span class="sh-badge sh-badge-info">' + esc(row.status || '—') + '</span></td>' +
          '<td>' + esc(row.programme_path || '—') + '</td>' +
          '<td>' + esc(row.intake_cohort || '—') + '</td>' +
          '<td>' +
            '<div style="font-size:0.82rem;">Course: ' + esc(row.current_course || '—') + '</div>' +
            '<div style="font-size:0.78rem;color:var(--muted-text-color);">Class: ' + esc(row.current_schedule || '—') + '</div>' +
          '</td>' +
          '<td><div>' + esc(row.enrolment_count || 0) + ' total</div><div style="font-size:0.78rem;color:var(--muted-text-color);">' + esc(row.active_enrolments || 0) + ' active</div></td>' +
          '<td>' + esc(attendance) + '</td>' +
          '<td><a class="sh-btn-secondary" style="padding:0.45rem 0.8rem;font-size:0.82rem;text-decoration:none;" href="/skillshub/admin/student?id=' + encodeURIComponent(row.name) + '">Open</a></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function updatePaginationMeta() {
    var from = state.total === 0 ? 0 : (state.page - 1) * pageSize() + 1;
    var to = Math.min(state.page * pageSize(), state.total);
    document.getElementById('pagination-info').textContent = from && to ? ('Showing ' + from + '–' + to + ' of ' + state.total) : 'No records';
    document.getElementById('page-label').textContent = 'Page ' + state.page + ' / ' + state.totalPages;
    document.getElementById('page-prev').disabled = state.page <= 1;
    document.getElementById('page-next').disabled = state.page >= state.totalPages;
  }

  function loadStudents() {
    var meta = document.getElementById('students-meta');
    meta.textContent = 'Loading...';
    var payload = {
      filters: currentFilters(),
      page: state.page,
      page_size: pageSize()
    };
    return api('/api/method/skillshub_core.skillshub_portal.api.get_admin_students', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
      .then(function (data) {
        state.total = data.total || 0;
        state.totalPages = data.total_pages || 1;
        renderRows(data.items || []);
        updatePaginationMeta();
        meta.textContent = 'Directory loaded';
      })
      .catch(function (error) {
        document.getElementById('students-body').innerHTML =
          '<tr><td colspan="8" class="sh-empty-cell">Failed to load students: ' + esc(error.message) + '</td></tr>';
        meta.textContent = 'Load failed';
      });
  }

  function loadCohortOptions() {
    var cohortSelect = document.getElementById('f-intake-cohort');
    return api('/api/method/skillshub_core.skillshub_portal.api.get_link_options?doctype=' + encodeURIComponent('SH Cohort'))
      .then(function (rows) {
        var options = ['<option value="">All</option>'];
        (rows || []).forEach(function (name) {
          options.push('<option value="' + esc(name) + '">' + esc(name) + '</option>');
        });
        cohortSelect.innerHTML = options.join('');
      })
      .catch(function () {
        cohortSelect.innerHTML = '<option value="">All</option>';
      });
  }

  function bindEvents() {
    document.getElementById('btn-apply').addEventListener('click', function () {
      state.page = 1;
      loadStudents();
    });
    document.getElementById('btn-reset').addEventListener('click', function () {
      document.getElementById('f-search').value = '';
      document.getElementById('f-status').value = '';
      document.getElementById('f-programme-path').value = '';
      document.getElementById('f-intake-cohort').value = '';
      document.getElementById('f-page-size').value = '25';
      state.page = 1;
      loadStudents();
    });
    document.getElementById('f-page-size').addEventListener('change', function () {
      state.page = 1;
      loadStudents();
    });
    document.getElementById('f-search').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        state.page = 1;
        loadStudents();
      }
    });
    document.getElementById('page-prev').addEventListener('click', function () {
      if (state.page <= 1) return;
      state.page -= 1;
      loadStudents();
    });
    document.getElementById('page-next').addEventListener('click', function () {
      if (state.page >= state.totalPages) return;
      state.page += 1;
      loadStudents();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    loadCohortOptions().then(loadStudents);
  });
}());
