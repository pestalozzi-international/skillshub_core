/* SkillsHub Admin — Student Cards grid JS */
(function () {
  'use strict';

  var state = { page: 1, pageSize: 24, total: 0, filters: {} };

  var api = (window.SHPortal && window.SHPortal.api) || function (path, opts) {
    return fetch(path, Object.assign({ credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }, opts || {}))
      .then(function (r) { return r.json(); }).then(function (d) { return d.message || d; });
  };
  var esc = (window.SHPortal && window.SHPortal.esc) || function (v) { var d = document.createElement('div'); d.textContent = String(v || ''); return d.innerHTML; };

  function initials(name) {
    return (name || '?').split(' ').slice(0, 2).map(function (w) { return (w[0] || '').toUpperCase(); }).join('');
  }

  function pathClass(path) {
    if (!path) return 'pi-badge-muted';
    return path.includes('A') ? 'pi-badge-red' : 'pi-badge-sky';
  }

  function statusClass(status) {
    if (status === 'Student') return 'pi-badge-green';
    if (status === 'Alumni')  return 'pi-badge-sky';
    if (status === 'Dropped') return 'pi-badge-muted';
    return 'pi-badge-sand';
  }

  function buildCard(s) {
    var avatar = s.student_image
      ? '<img src="' + esc(s.student_image) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : esc(initials(s.student_name));

    var dobRow = s.date_of_birth_display
      ? '<div style="margin:0.5rem 0;padding:0.5rem 0.65rem;background:var(--pi-sand);border-radius:0.5rem;border:1px dashed var(--pi-border);">' +
          '<div class="pi-card-dob-label">Date of Birth</div>' +
          '<div class="pi-card-dob-val">' + esc(s.date_of_birth_display) + '</div>' +
        '</div>'
      : '';

    var path   = s.programme_path ? '<span class="pi-badge ' + pathClass(s.programme_path) + '">' + esc(s.programme_path) + '</span> ' : '';
    var status = s.status ? '<span class="pi-badge ' + statusClass(s.status) + '">' + esc(s.status) + '</span>' : '';
    var cohort = s.intake_cohort ? '<div class="pi-text-xs pi-text-muted" style="margin-top:0.25rem;">Cohort: <strong>' + esc(s.intake_cohort) + '</strong></div>' : '';

    return '<div class="pi-student-card">' +
      '<div style="display:flex;gap:0.75rem;align-items:flex-start;">' +
        '<div class="pi-student-avatar">' + avatar + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<p class="pi-card-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(s.student_name || s.name) + '</p>' +
          '<div style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">' +
            '<p class="pi-card-id">' + esc(s.name) + '</p>' +
            '<button class="pi-copy-btn" data-copy="' + esc(s.name) + '" title="Copy ID">Copy</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      dobRow +
      '<div style="display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.25rem;">' + status + ' ' + path + '</div>' +
      cohort +
      '<div style="display:flex;gap:0.5rem;margin-top:0.75rem;">' +
        '<a href="/skillshub/admin/student?id=' + encodeURIComponent(s.name) + '" class="pi-btn pi-btn-secondary pi-btn-sm" style="flex:1;text-decoration:none;text-align:center;">View Profile</a>' +
      '</div>' +
    '</div>';
  }

  function renderCards(items) {
    var grid = document.getElementById('pi-cards-grid');
    if (!grid) return;
    if (!items || !items.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--pi-muted);">No students found.</div>';
      return;
    }
    grid.innerHTML = items.map(buildCard).join('');
  }

  function renderPagination() {
    var bar = document.getElementById('pi-cards-pager');
    if (!bar) return;
    var total  = state.total;
    var pages  = Math.max(Math.ceil(total / state.pageSize), 1);
    var current = state.page;
    var html = '<button class="pi-pager" id="pi-prev-btn"' + (current <= 1 ? ' disabled' : '') + '>‹</button>';
    var start = Math.max(1, current - 2);
    var end   = Math.min(pages, start + 4);
    for (var p = start; p <= end; p++) {
      html += '<button class="pi-pager' + (p === current ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }
    html += '<button class="pi-pager" id="pi-next-btn"' + (current >= pages ? ' disabled' : '') + '>›</button>';
    html += '<span class="pi-text-xs pi-text-muted" style="margin-left:0.5rem;">' + total + ' students</span>';
    bar.innerHTML = html;
  }

  function setLoading(loading) {
    var spinner = document.getElementById('pi-cards-spinner');
    if (spinner) spinner.style.display = loading ? 'block' : 'none';
  }

  function loadCards() {
    setLoading(true);
    var qs = '/api/method/skillshub_core.skillshub_portal.api.get_student_cards?' +
      'page=' + state.page + '&page_size=' + state.pageSize +
      '&filters=' + encodeURIComponent(JSON.stringify(state.filters));

    api(qs)
      .then(function (result) {
        setLoading(false);
        state.total = result.total || 0;
        renderCards(result.items || []);
        renderPagination();
      })
      .catch(function (err) {
        setLoading(false);
        var grid = document.getElementById('pi-cards-grid');
        if (grid) grid.innerHTML = '<div class="pi-alert pi-alert-error" style="grid-column:1/-1;">' + esc(err.message) + '</div>';
      });
  }

  function loadCohortOptions() {
    api('/api/method/skillshub_core.skillshub_portal.api.get_intake_cohort_options')
      .then(function (opts) {
        var sel = document.getElementById('pi-filter-cohort');
        if (!sel || !opts) return;
        (opts || []).forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o; opt.textContent = o;
          sel.appendChild(opt);
        });
      })
      .catch(function () {});
  }

  function applyFilters() {
    state.filters = {
      search:        (document.getElementById('pi-filter-search') || {}).value || '',
      status:        (document.getElementById('pi-filter-status') || {}).value || '',
      programme_path:(document.getElementById('pi-filter-path')   || {}).value || '',
      intake_cohort: (document.getElementById('pi-filter-cohort') || {}).value || '',
    };
    state.page = 1;
    loadCards();
  }

  function init() {
    loadCohortOptions();
    loadCards();

    /* Filter controls */
    var searchEl = document.getElementById('pi-filter-search');
    if (searchEl) {
      var debounce;
      searchEl.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(applyFilters, 350);
      });
    }
    ['pi-filter-status', 'pi-filter-path', 'pi-filter-cohort', 'pi-filter-size'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        if (id === 'pi-filter-size') { state.pageSize = parseInt(el.value) || 24; state.page = 1; }
        applyFilters();
      });
    });

    /* Pagination */
    document.addEventListener('click', function (e) {
      if (e.target.id === 'pi-prev-btn') { if (state.page > 1) { state.page--; loadCards(); } return; }
      if (e.target.id === 'pi-next-btn') { state.page++; loadCards(); return; }
      var pager = e.target.closest('.pi-pager[data-page]');
      if (pager) { state.page = parseInt(pager.getAttribute('data-page')); loadCards(); return; }

      /* Copy button */
      var copyBtn = e.target.closest('.pi-copy-btn');
      if (copyBtn) {
        var text = copyBtn.getAttribute('data-copy');
        navigator.clipboard && navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = '✓ Copied';
          copyBtn.classList.add('copied');
          setTimeout(function () { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1500);
        });
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.SHPortal) {
      window.addEventListener('sh-portal-ready', function (e) {
        if (!e.detail.bootstrap.is_admin) { window.location.replace('/skillshub'); return; }
        init();
      });
    } else {
      init();
    }
  });
}());
