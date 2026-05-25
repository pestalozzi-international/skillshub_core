(function () {
	"use strict";

	var state = {
		studentName: null,
		editable: null,
		isSaving: false,
	};

	function esc(value) {
		if (value === null || value === undefined) return "";
		var div = document.createElement("div");
		div.textContent = String(value);
		return div.innerHTML;
	}

	function fmtDate(value) {
		if (!value) return "—";
		var date = new Date(value);
		return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-GB");
	}

	function headers() {
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
			Object.assign({ credentials: "include", headers: headers() }, options || {}),
		)
			.then(function (response) {
				if (!response.ok) throw new Error("HTTP " + response.status);
				return response.json();
			})
			.then(function (json) {
				return json.message || json;
			});
	}

	function selectedValues(rows, key) {
		return (rows || [])
			.map(function (row) {
				return row && row[key] ? String(row[key]).trim() : "";
			})
			.filter(Boolean);
	}

	function renderChecklist(containerId, values, selected, keyPrefix) {
		var container = document.getElementById(containerId);
		if (!container) return;
		var options = (values || []).slice();
		container.innerHTML = "";
		if (!options.length) {
			container.innerHTML =
				'<div style="font-size:0.8rem;color:var(--muted-text-color);">No options configured.</div>';
			return;
		}
		var selectedSet = new Set(selected || []);
		options.forEach(function (value, idx) {
			var id = keyPrefix + "-" + idx;
			var label = document.createElement("label");
			label.setAttribute("for", id);
			label.style.display = "flex";
			label.style.alignItems = "center";
			label.style.gap = "0.4rem";
			label.style.padding = "0.4rem 0.55rem";
			label.style.border = "1px solid var(--color-slate-200)";
			label.style.borderRadius = "0.55rem";
			label.style.fontSize = "0.84rem";
			label.style.cursor = "pointer";

			var input = document.createElement("input");
			input.type = "checkbox";
			input.id = id;
			input.value = value;
			input.checked = selectedSet.has(value);
			input.dataset.multiSelect = keyPrefix;

			var span = document.createElement("span");
			span.textContent = value;

			label.appendChild(input);
			label.appendChild(span);
			container.appendChild(label);
		});
	}

	function selectedFromChecklist(keyPrefix, keyName) {
		var nodes = document.querySelectorAll(
			'input[type="checkbox"][data-multi-select="' + keyPrefix + '"]:checked',
		);
		return Array.prototype.map.call(nodes, function (node) {
			var row = {};
			row[keyName] = String(node.value || "").trim();
			return row;
		});
	}

	function setEditStatus(message, isError) {
		var el = document.getElementById("student-edit-status");
		if (!el) return;
		el.textContent = message || "";
		el.style.color = isError ? "var(--color-red-700)" : "var(--muted-text-color)";
	}

	function setEditMode(isEditing) {
		var form = document.getElementById("student-edit-form");
		var editBtn = document.getElementById("btn-edit-profile");
		if (!form || !editBtn) return;
		form.style.display = isEditing ? "" : "none";
		editBtn.style.display = isEditing ? "none" : "";
		if (!isEditing && !state.isSaving) setEditStatus("", false);
	}

	function fillEditForm(editable) {
		editable = editable || {};
		var setVal = function (id, value) {
			var node = document.getElementById(id);
			if (node) node.value = value || "";
		};
		setVal("edit-mobile", editable.mobile);
		setVal("edit-pincode", editable.pincode);
		setVal("edit-address-line-1", editable.address_line_1);
		setVal("edit-address-line-2", editable.address_line_2);

		renderChecklist(
			"edit-motivations-options",
			editable.motivation_options || [],
			selectedValues(editable.motivations, "motivation"),
			"motivation",
		);
		renderChecklist(
			"edit-resilience-options",
			editable.resilience_options || [],
			selectedValues(editable.resilience_links, "resilience_statement"),
			"resilience",
		);
	}

	function collectEditPayload() {
		var value = function (id) {
			var node = document.getElementById(id);
			return node ? String(node.value || "").trim() : "";
		};
		return {
			mobile: value("edit-mobile"),
			pincode: value("edit-pincode"),
			address_line_1: value("edit-address-line-1"),
			address_line_2: value("edit-address-line-2"),
			motivations: selectedFromChecklist("motivation", "motivation"),
			resilience_links: selectedFromChecklist("resilience", "resilience_statement"),
		};
	}

	function renderStudentCard(student) {
		var html = "";
		if (student.image || student.student_image) {
			html +=
				'<div style="margin-bottom:0.7rem;"><img src="' +
				esc(student.image || student.student_image) +
				'" alt="Student photo" style="width:92px;height:92px;border-radius:999px;object-fit:cover;border:1px solid var(--color-slate-100);"></div>';
		}
		html +=
			'<h3 style="margin-top:0;">' +
			esc(student.student_name || student.full_name || student.name) +
			"</h3>";
		html +=
			'<div style="font-size:0.84rem;color:var(--muted-text-color);margin-bottom:0.8rem;">' +
			esc(student.name || "—") +
			"</div>";
		html += '<div style="display:grid;gap:0.5rem;font-size:0.9rem;">';
		html += "<div><strong>Status:</strong> " + esc(student.status || "—") + "</div>";
		html += "<div><strong>Path:</strong> " + esc(student.programme_path || "—") + "</div>";
		html +=
			"<div><strong>Intake Cohort:</strong> " +
			esc(student.current_cohort || "—") +
			"</div>";
		html +=
			"<div><strong>Current Course:</strong> " +
			esc(student.current_course || "—") +
			"</div>";
		html +=
			"<div><strong>Current Class:</strong> " +
			esc(student.current_schedule || "—") +
			"</div>";
		html += "<div><strong>Mobile:</strong> " + esc(student.mobile || "—") + "</div>";
		html +=
			"<div><strong>Email:</strong> " +
			esc(student.personal_email || student.user_login_email || "—") +
			"</div>";
		html += "</div>";
		document.getElementById("student-card").innerHTML = html;
	}

	function renderEnrolments(enrolments) {
		var container = document.getElementById("enrolments-list");
		if (!enrolments || !enrolments.length) {
			container.innerHTML =
				'<div style="color:var(--muted-text-color);">No enrolment records yet.</div>';
			return;
		}

		container.innerHTML = enrolments
			.map(function (row) {
				return (
					"" +
					'<article style="border:1px solid var(--color-slate-100);border-radius:0.85rem;padding:0.75rem;margin-bottom:0.65rem;">' +
					'<div style="display:flex;justify-content:space-between;gap:0.6rem;flex-wrap:wrap;">' +
					"<div>" +
					'<div style="font-weight:600;">' +
					esc(row.class || "—") +
					"</div>" +
					'<div style="font-size:0.82rem;color:var(--muted-text-color);">' +
					esc(row.course || "—") +
					" · " +
					esc(row.milestone || "—") +
					"</div>" +
					"</div>" +
					'<div style="text-align:right;">' +
					'<div><span class="sh-badge sh-badge-info">' +
					esc(row.status || "—") +
					"</span></div>" +
					'<div style="font-size:0.8rem;color:var(--muted-text-color);margin-top:0.2rem;">' +
					esc(fmtDate(row.enrolment_date)) +
					"</div>" +
					"</div>" +
					"</div>" +
					'<div style="margin-top:0.55rem;font-size:0.82rem;">Attendance: <strong>' +
					esc(row.attendance_rate ? Math.round(row.attendance_rate) + "%" : "—") +
					"</strong></div>" +
					"</article>"
				);
			})
			.join("");
	}

	function renderFeedbackLinks(summary, feedbackForms) {
		var container = document.getElementById("feedback-links");
		var enrolments = summary.enrolments || [];
		var activeEnrolment =
			enrolments.find(function (row) {
				return row.status === "Enrolled";
			}) ||
			enrolments[0] ||
			null;
		var student = summary.student || {};

		if (!feedbackForms || !feedbackForms.length) {
			container.innerHTML =
				'<div style="color:var(--muted-text-color);">No forms configured.</div>';
			return;
		}

		container.innerHTML = feedbackForms
			.map(function (form) {
				var href =
					form.route +
					"?student=" +
					encodeURIComponent(student.name || "") +
					"&schedule=" +
					encodeURIComponent(
						(activeEnrolment && activeEnrolment.class) ||
							student.current_schedule ||
							"",
					) +
					"&enrolment_ticket=" +
					encodeURIComponent(
						(activeEnrolment && activeEnrolment.name) ||
							student.current_enrolment ||
							"",
					);
				var status =
					summary.feedback_status && summary.feedback_status[form.doctype]
						? "Submitted"
						: "Pending";
				return (
					"" +
					'<a class="feedback-link" href="' +
					href +
					'">' +
					"<strong>" +
					esc(form.label) +
					"</strong>" +
					'<span style="display:flex;justify-content:space-between;gap:0.5rem;align-items:center;">' +
					"<span>" +
					esc(form.doctype) +
					"</span>" +
					'<span class="sh-badge ' +
					(status === "Submitted" ? "sh-badge-success" : "sh-badge-info") +
					'">' +
					status +
					"</span>" +
					"</span>" +
					"</a>"
				);
			})
			.join("");
	}

	function renderSubmittedForms(rows) {
		var container = document.getElementById("submitted-forms-list");
		if (!rows || !rows.length) {
			container.innerHTML =
				'<div style="font-size:0.84rem;color:var(--muted-text-color);">No submitted forms.</div>';
			return;
		}

		container.innerHTML = rows
			.map(function (row) {
				var link =
					"/skillshub/form-view?doctype=" +
					encodeURIComponent(row.doctype) +
					"&name=" +
					encodeURIComponent(row.name) +
					"&return_to=" +
					encodeURIComponent("/skillshub/profile");
				return (
					"" +
					'<a href="' +
					link +
					'" style="text-decoration:none;border:1px solid var(--color-slate-100);border-radius:0.65rem;padding:0.52rem 0.6rem;color:inherit;">' +
					'<div style="font-size:0.78rem;color:var(--muted-text-color);">' +
					esc(row.label || row.doctype) +
					"</div>" +
					'<div style="font-weight:600;font-size:0.84rem;">' +
					esc(row.name) +
					"</div>" +
					'<div style="font-size:0.74rem;color:var(--muted-text-color);">' +
					esc(fmtDate(row.creation)) +
					"</div>" +
					"</a>"
				);
			})
			.join("");
	}

	function render(summary, submitted, editable) {
		var student = summary.student || {};
		document.getElementById("profile-title").textContent = student.student_name
			? "My Profile · " + student.student_name
			: "My Profile";
		document.getElementById("profile-subtitle").textContent =
			(student.programme_path || "Student") +
			" · " +
			(student.current_course || "No current course");
		renderStudentCard(student);
		renderEnrolments(summary.enrolments || []);
		renderFeedbackLinks(summary, summary.feedback_forms || []);
		renderSubmittedForms(submitted || []);
		state.editable = editable || {};
		fillEditForm(state.editable);
	}

	function loadStudentData(studentName) {
		return Promise.all([
			api(
				"/api/method/skillshub_core.skillshub_core.api.get_portal_student_context?student=" +
					encodeURIComponent(studentName),
			),
			api(
				"/api/method/skillshub_core.skillshub_portal.api.get_feedback_records?student=" +
					encodeURIComponent(studentName),
			),
			api(
				"/api/method/skillshub_core.skillshub_core.api.get_student_editable?student=" +
					encodeURIComponent(studentName),
			).catch(function () {
				return {};
			}),
		]).then(function (payload) {
			render(payload[0], payload[1] || [], payload[2] || {});
		});
	}

	function saveProfileEdits(event) {
		event.preventDefault();
		if (!state.studentName || state.isSaving) return;

		state.isSaving = true;
		setEditStatus("Saving profile changes...", false);

		var payload = collectEditPayload();
		api("/api/method/skillshub_core.skillshub_core.api.update_student_profile", {
			method: "POST",
			body: JSON.stringify({
				student: state.studentName,
				payload: JSON.stringify(payload),
			}),
		})
			.then(function () {
				return loadStudentData(state.studentName);
			})
			.then(function () {
				setEditMode(false);
				setEditStatus("Profile updated successfully.", false);
			})
			.catch(function (error) {
				setEditStatus(
					"Failed to save profile: " +
						(error && error.message ? error.message : "Unknown error"),
					true,
				);
			})
			.finally(function () {
				state.isSaving = false;
			});
	}

	function bindProfileEditHandlers() {
		var editBtn = document.getElementById("btn-edit-profile");
		var cancelBtn = document.getElementById("btn-cancel-profile-edit");
		var form = document.getElementById("student-edit-form");

		if (editBtn) {
			editBtn.addEventListener("click", function () {
				fillEditForm(state.editable || {});
				setEditMode(true);
			});
		}
		if (cancelBtn) {
			cancelBtn.addEventListener("click", function () {
				fillEditForm(state.editable || {});
				setEditMode(false);
			});
		}
		if (form) {
			form.addEventListener("submit", saveProfileEdits);
		}
	}

	function init() {
		bindProfileEditHandlers();
		api("/api/method/skillshub_core.skillshub_portal.api.get_portal_bootstrap")
			.then(function (bootstrap) {
				var studentName = bootstrap && bootstrap.student ? bootstrap.student.name : null;
				if (!studentName) {
					var message =
						bootstrap && bootstrap.is_admin
							? "This page is for student accounts. Use the admin portal for student management."
							: "No student account is linked to this login.";
					throw new Error(message);
				}
				state.studentName = studentName;
				return loadStudentData(studentName);
			})
			.catch(function (error) {
				document.getElementById("student-card").innerHTML =
					'<div style="color:var(--color-red-700)">Unable to load profile: ' +
					esc(error.message) +
					"</div>";
				var editBtn = document.getElementById("btn-edit-profile");
				if (editBtn) editBtn.disabled = true;
			});
	}

	document.addEventListener("DOMContentLoaded", init);
})();
