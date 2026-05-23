(function () {
	"use strict";

	var state = {
		page: 1,
		totalPages: 1,
		total: 0,
	};

	function esc(value) {
		if (value === null || value === undefined) return "";
		var div = document.createElement("div");
		div.textContent = String(value);
		return div.innerHTML;
	}

	function getHeaders() {
		return (
			(window.SHPortal && window.SHPortal.getHeaders && window.SHPortal.getHeaders()) || {
				Accept: "application/json",
				"Content-Type": "application/json",
			}
		);
	}

	function api(path, options) {
		return fetch(
			path,
			Object.assign({ credentials: "include", headers: getHeaders() }, options || {})
		)
			.then(function (response) {
				if (!response.ok) throw new Error("HTTP " + response.status);
				return response.json();
			})
			.then(function (json) {
				return json.message || json;
			});
	}

	function currentFilters() {
		return {
			search: document.getElementById("f-search").value.trim(),
			status: document.getElementById("f-status").value,
			programme_path: document.getElementById("f-programme-path").value,
			intake_cohort: document.getElementById("f-intake-cohort").value,
		};
	}

	function pageSize() {
		return parseInt(document.getElementById("f-page-size").value, 10) || 25;
	}

	function initials(name) {
		return (name || "?")
			.split(" ")
			.slice(0, 2)
			.map(function (w) {
				return (w[0] || "").toUpperCase();
			})
			.join("");
	}

	function statusBadge(status) {
		var colorMap = {
			Student: "background:#dcfce7;color:#166534;",
			Alumni: "background:#dbeafe;color:#1e40af;",
			Dropped: "background:#fee2e2;color:#991b1b;",
		};
		var style = colorMap[status] || "background:#f1f5f9;color:#64748b;";
		return (
			'<span style="' +
			style +
			'display:inline-block;border-radius:999px;padding:0.18rem 0.65rem;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">' +
			esc(status || "—") +
			"</span>"
		);
	}

	function pathBadge(path) {
		if (!path) return '<span style="color:var(--pi-muted);font-size:0.8rem;">—</span>';
		var style = path.includes("A")
			? "background:var(--pi-red-light);color:var(--pi-red);"
			: "background:var(--pi-sky);color:#0369a1;";
		return (
			'<span style="' +
			style +
			'display:inline-block;border-radius:999px;padding:0.18rem 0.65rem;font-size:0.68rem;font-weight:700;">' +
			esc(path) +
			"</span>"
		);
	}

	function hasPortalAccess(row) {
		return !!(row.portal_user_account || row.user_login_email || row.pestalozzi_student_email);
	}

	function renderRows(items) {
		var body = document.getElementById("students-body");
		if (!items.length) {
			body.innerHTML =
				'<tr><td colspan="8" class="sh-empty-cell" style="padding:2rem;text-align:center;color:var(--pi-muted);">No students found for current filters.</td></tr>';
			return;
		}

		body.innerHTML = items
			.map(function (row) {
				var attendance = row.avg_attendance ? Math.round(row.avg_attendance) + "%" : "—";
				var hasAccess = hasPortalAccess(row);
				var loginDot = hasAccess
					? '<span title="Has portal login" style="display:inline-block;width:0.5rem;height:0.5rem;border-radius:50%;background:#22c55e;vertical-align:middle;margin-left:0.3rem;"></span>'
					: '<span title="No portal login set" style="display:inline-block;width:0.5rem;height:0.5rem;border-radius:50%;background:#e2e8f0;border:1px solid #cbd5e1;vertical-align:middle;margin-left:0.3rem;"></span>';
				var ini = initials(row.student_name || row.name);

				return (
					"<tr>" +
					"<td>" +
					'<div style="display:flex;align-items:center;gap:0.65rem;">' +
					'<div style="width:2.2rem;height:2.2rem;border-radius:50%;background:var(--pi-red);color:white;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0;">' +
					esc(ini) +
					"</div>" +
					"<div>" +
					'<div style="font-weight:600;font-size:0.9rem;">' +
					esc(row.student_name || row.name) +
					loginDot +
					"</div>" +
					'<div style="font-size:0.72rem;color:var(--pi-muted);font-family:monospace;">' +
					esc(row.name) +
					"</div>" +
					"</div></div></td>" +
					"<td>" +
					statusBadge(row.status) +
					"</td>" +
					"<td>" +
					pathBadge(row.programme_path) +
					"</td>" +
					"<td style='font-size:0.82rem;'>" +
					esc(row.intake_cohort || "—") +
					"</td>" +
					"<td>" +
					'<div style="font-size:0.8rem;font-weight:600;">' +
					esc(row.current_course || "—") +
					"</div>" +
					'<div style="font-size:0.72rem;color:var(--pi-muted);">' +
					esc(row.current_schedule || "—") +
					"</div>" +
					"</td>" +
					"<td style='text-align:center;'>" +
					'<span style="font-weight:700;font-size:0.9rem;color:var(--pi-black);">' +
					esc(row.enrolment_count || 0) +
					"</span>" +
					'<div style="font-size:0.72rem;color:var(--pi-muted);">' +
					esc(row.active_enrolments || 0) +
					" active</div>" +
					"</td>" +
					"<td style='text-align:center;font-weight:700;font-size:0.9rem;'>" +
					esc(attendance) +
					"</td>" +
					'<td><a class="sh-btn-secondary" style="padding:0.42rem 0.85rem;font-size:0.8rem;text-decoration:none;white-space:nowrap;" href="/skillshub/admin/student?id=' +
					encodeURIComponent(row.name) +
					'">Open →</a></td>' +
					"</tr>"
				);
			})
			.join("");
	}

	function updatePaginationMeta() {
		var from = state.total === 0 ? 0 : (state.page - 1) * pageSize() + 1;
		var to = Math.min(state.page * pageSize(), state.total);
		document.getElementById("pagination-info").textContent =
			from && to
				? "Showing " + from + "–" + to + " of " + state.total + " students"
				: "No records";
		document.getElementById("page-label").textContent =
			"Page " + state.page + " / " + state.totalPages;
		document.getElementById("page-prev").disabled = state.page <= 1;
		document.getElementById("page-next").disabled = state.page >= state.totalPages;
	}

	function loadStudents() {
		var meta = document.getElementById("students-meta");
		if (meta) meta.textContent = "Loading…";
		var payload = {
			filters: currentFilters(),
			page: state.page,
			page_size: pageSize(),
		};
		return api("/api/method/skillshub_core.skillshub_portal.api.get_admin_students", {
			method: "POST",
			body: JSON.stringify(payload),
		})
			.then(function (data) {
				state.total = data.total || 0;
				state.totalPages = data.total_pages || 1;
				renderRows(data.items || []);
				updatePaginationMeta();
				if (meta) meta.textContent = state.total + " students";
			})
			.catch(function (error) {
				document.getElementById("students-body").innerHTML =
					'<tr><td colspan="8" class="sh-empty-cell" style="color:var(--pi-red);padding:2rem;text-align:center;">Failed to load students: ' +
					esc(error.message) +
					"</td></tr>";
				if (meta) meta.textContent = "Load failed";
			});
	}

	function loadCohortOptions() {
		var cohortSelect = document.getElementById("f-intake-cohort");
		return api("/api/method/skillshub_core.skillshub_portal.api.get_intake_cohort_options")
			.then(function (rows) {
				var options = ['<option value="">All</option>'];
				(rows || []).forEach(function (name) {
					options.push('<option value="' + esc(name) + '">' + esc(name) + "</option>");
				});
				cohortSelect.innerHTML = options.join("");
			})
			.catch(function () {
				cohortSelect.innerHTML = '<option value="">All</option>';
			});
	}

	function bindEvents() {
		document.getElementById("btn-apply").addEventListener("click", function () {
			state.page = 1;
			loadStudents();
		});
		document.getElementById("btn-reset").addEventListener("click", function () {
			document.getElementById("f-search").value = "";
			document.getElementById("f-status").value = "";
			document.getElementById("f-programme-path").value = "";
			document.getElementById("f-intake-cohort").value = "";
			document.getElementById("f-page-size").value = "25";
			state.page = 1;
			loadStudents();
		});
		document.getElementById("f-page-size").addEventListener("change", function () {
			state.page = 1;
			loadStudents();
		});
		document.getElementById("f-search").addEventListener("keydown", function (event) {
			if (event.key === "Enter") {
				state.page = 1;
				loadStudents();
			}
		});
		document.getElementById("page-prev").addEventListener("click", function () {
			if (state.page <= 1) return;
			state.page -= 1;
			loadStudents();
		});
		document.getElementById("page-next").addEventListener("click", function () {
			if (state.page >= state.totalPages) return;
			state.page += 1;
			loadStudents();
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		bindEvents();
		loadCohortOptions().then(loadStudents);
	});
})();
