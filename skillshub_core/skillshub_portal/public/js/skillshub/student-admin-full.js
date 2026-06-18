(function () {
	"use strict";

	var FEEDBACK_FORMS = [
		{ doctype: "SH Baseline", label: "Baseline", route: "/skillshub/s/baseline" },
		{
			doctype: "SH Soft Skills Feedback",
			label: "Soft Skills",
			route: "/skillshub/s/soft-skills",
		},
		{
			doctype: "SH Mindset Camp Feedback",
			label: "Mindset Camp",
			route: "/skillshub/s/mindset-camp",
		},
		{
			doctype: "SH Edulution Feedback",
			label: "Edulution",
			route: "/skillshub/s/edulution",
		},
		{
			doctype: "SH VT Feedback",
			label: "Vocational Training",
			route: "/skillshub/s/vocational-training",
		},
		{
			doctype: "SH Attachment Feedback",
			label: "Attachment",
			route: "/skillshub/s/attachment",
		},
		{ doctype: "SH Parent Feedback", label: "Parent", route: "/skillshub/s/parent" },
	];

	var state = {
		studentId: null,
		bundle: null,
		meta: null,
		editable: null,
		linkCache: {},
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
			Object.assign({ credentials: "include", headers: headers() }, options || {})
		)
			.then(function (response) {
				if (!response.ok) throw new Error("HTTP " + response.status);
				return response.json();
			})
			.then(function (json) {
				return json.message || json;
			});
	}

	function getLinkOptions(doctype) {
		if (!doctype) return Promise.resolve([]);
		if (state.linkCache[doctype]) return Promise.resolve(state.linkCache[doctype]);
		return api(
			"/api/method/skillshub_core.skillshub_portal.api.get_link_options?doctype=" +
				encodeURIComponent(doctype) +
				"&limit=300"
		)
			.then(function (rows) {
				state.linkCache[doctype] = rows || [];
				return state.linkCache[doctype];
			})
			.catch(function () {
				return [];
			});
	}

	function hydrateLinkFields() {
		var fields = document.querySelectorAll(
			'#tab-edit select[data-fieldtype="Link"][data-link-doctype]'
		);
		Array.prototype.forEach.call(fields, function (select) {
			var doctype = select.getAttribute("data-link-doctype") || "";
			var current = select.getAttribute("data-current") || select.value || "";
			getLinkOptions(doctype).then(function (options) {
				var html = '<option value=""></option>';
				var seen = {};
				(options || []).forEach(function (value) {
					var v = String(value || "").trim();
					if (!v || seen[v]) return;
					seen[v] = true;
					html +=
						'<option value="' +
						esc(v) +
						'"' +
						(v === String(current) ? " selected" : "") +
						">" +
						esc(v) +
						"</option>";
				});
				if (current && !seen[current]) {
					html +=
						'<option value="' +
						esc(current) +
						'" selected>' +
						esc(current) +
						"</option>";
				}
				select.innerHTML = html;
			});
		});
	}

	function parseStudentId() {
		var params = new URLSearchParams(window.location.search);
		return params.get("id") || params.get("student");
	}

	function deskUrl(doctype, name) {
		if (!doctype || !name) return "/app";
		var route = String(doctype).toLowerCase().replace(/\s+/g, "-");
		return "/app/" + route + "/" + encodeURIComponent(name);
	}

	function adminReturnUrl() {
		return "/skillshub/admin/student?id=" + encodeURIComponent(state.studentId || "");
	}

	function setHeader() {
		var student = state.bundle && state.bundle.student ? state.bundle.student : {};
		document.getElementById("student-page-title").textContent =
			student.student_name || student.name || "Student Profile";
		document.getElementById("student-page-subtitle").textContent =
			"ID: " +
			(student.name || "—") +
			" · Path: " +
			(student.programme_path || "—") +
			" · Status: " +
			(student.status || "—");
		var deskLink = document.getElementById("open-student-desk");
		if (deskLink) {
			deskLink.href = deskUrl("SH Student", student.name || state.studentId);
		}
	}

	function renderOverview() {
		var student = state.bundle.student || {};
		var content = "";
		var keys = [
			["Student ID", student.name],
			["Full Name", student.student_name],
			["Status", student.status],
			["Programme Path", student.programme_path],
			["Intake Year", student.intake_year],
			["Intake Cohort", student.intake_cohort],
			["Current Course", student.current_course],
			["Current Class", student.current_schedule],
			["Current Milestone", student.current_milestone],
			["Portal User", student.portal_user_account],
			["Login Email", student.user_login_email],
			["Mobile", student.mobile],
			["Personal Email", student.personal_email],
			["Date of Birth", student.date_of_birth],
			["Gender", student.gender],
			[
				"Address",
				[student.address_line_1, student.address_line_2, student.pincode]
					.filter(Boolean)
					.join(", ") || "—",
			],
		];

		content += '<div class="kv-grid">';
		if (student.student_image) {
			content +=
				'<div class="kv-item"><strong>Profile Photo</strong><div><img src="' +
				esc(student.student_image) +
				'" alt="Student photo" style="width:88px;height:88px;border-radius:999px;object-fit:cover;border:1px solid var(--color-slate-100);"></div></div>';
		}
		keys.forEach(function (pair) {
			content +=
				'<div class="kv-item"><strong>' +
				esc(pair[0]) +
				"</strong><div>" +
				esc(pair[1] || "—") +
				"</div></div>";
		});
		content += "</div>";
		document.getElementById("tab-overview").innerHTML = content;
	}

	function renderEnrolments() {
		var rows = state.bundle.enrolments || [];
		if (!rows.length) {
			document.getElementById("tab-enrolments").innerHTML =
				'<div class="sh-empty-cell">No enrolments found.</div>';
			return;
		}

		var html =
			'<div class="table-wrap"><table class="sh-admin-table"><thead><tr>' +
			"<th>Class</th><th>Course</th><th>Milestone</th><th>Status</th><th>Dates</th><th>Attendance</th><th>Desk</th>" +
			"</tr></thead><tbody>";
		rows.forEach(function (row) {
			var classDesk = row.class ? deskUrl("SH Class", row.class) : "/app";
			var enrolmentDesk = row.name ? deskUrl("SH Enrolment", row.name) : "/app";
			html +=
				"<tr>" +
				"<td>" +
				esc(row.class || "—") +
				'<div style="font-size:0.76rem;color:var(--muted-text-color)">' +
				esc(row.course_run || "—") +
				"</div>" +
				(row.class
					? '<div style="margin-top:0.22rem;"><a href="' +
					  classDesk +
					  '" style="font-size:0.74rem;text-decoration:none;" target="_blank">Class ↗</a></div>'
					: "") +
				"</td>" +
				"<td>" +
				esc(row.course || "—") +
				"</td>" +
				"<td>" +
				esc(row.milestone || "—") +
				"</td>" +
				'<td><span class="sh-badge sh-badge-info">' +
				esc(row.status || "—") +
				"</span></td>" +
				"<td>" +
				esc(fmtDate(row.enrolment_date)) +
				" → " +
				esc(fmtDate(row.completion_date)) +
				"</td>" +
				"<td>" +
				esc(row.attendance_rate ? Math.round(row.attendance_rate) + "%" : "—") +
				'<div style="font-size:0.76rem;color:var(--muted-text-color)">' +
				esc((row.sessions_present || 0) + "/" + (row.sessions_total || 0) + " present") +
				"</div></td>" +
				"<td>" +
				(row.name
					? '<a class="sh-btn-secondary" style="font-size:0.76rem;padding:0.32rem 0.62rem;text-decoration:none;" href="' +
					  enrolmentDesk +
					  '" target="_blank">Enrolment</a>'
					: "—") +
				"</td>" +
				"</tr>";
		});
		html += "</tbody></table></div>";
		document.getElementById("tab-enrolments").innerHTML = html;
	}

	function renderAttendance() {
		var rows = state.bundle.attendance || [];
		if (!rows.length) {
			document.getElementById("tab-attendance").innerHTML =
				'<div class="sh-empty-cell">No attendance records found.</div>';
			return;
		}
		var html =
			'<div class="table-wrap"><table class="sh-admin-table"><thead><tr>' +
			"<th>Date</th><th>Class</th><th>Status</th><th>Week/Day</th><th>Marked By</th><th>Desk</th>" +
			"</tr></thead><tbody>";
		rows.forEach(function (row) {
			var attDesk = row.name ? deskUrl("SH Attendance", row.name) : "/app";
			html +=
				"<tr>" +
				"<td>" +
				esc(fmtDate(row.date)) +
				"</td>" +
				"<td>" +
				esc(row.sh_programme_schedule || "—") +
				"</td>" +
				'<td><span class="sh-badge sh-badge-info">' +
				esc(row.status || "—") +
				"</span></td>" +
				"<td>" +
				esc((row.week || "—") + " / " + (row.day || "—")) +
				"</td>" +
				"<td>" +
				esc(row.marked_by || "—") +
				"</td>" +
				"<td>" +
				(row.name
					? '<a class="sh-btn-secondary" style="font-size:0.76rem;padding:0.32rem 0.62rem;text-decoration:none;" href="' +
					  attDesk +
					  '" target="_blank">Attendance</a>'
					: "—") +
				"</td>" +
				"</tr>";
		});
		html += "</tbody></table></div>";
		document.getElementById("tab-attendance").innerHTML = html;
	}

	function renderFeedback() {
		var rows = state.bundle.feedback || [];
		var enrolments = state.bundle.enrolments || [];
		var current =
			enrolments.find(function (row) {
				return row.status === "Enrolled";
			}) ||
			enrolments[0] ||
			{};
		var links = FEEDBACK_FORMS.map(function (form) {
			var href =
				form.route +
				"?student=" +
				encodeURIComponent(state.studentId) +
				"&schedule=" +
				encodeURIComponent(current.class || "") +
				"&enrolment_ticket=" +
				encodeURIComponent(current.name || "") +
				"&return_to=" +
				encodeURIComponent(adminReturnUrl()) +
				"&from=admin";
			return (
				'<a class="sh-btn-secondary" style="font-size:0.76rem;padding:0.35rem 0.65rem;text-decoration:none;" href="' +
				href +
				'">+ ' +
				esc(form.label) +
				"</a>"
			);
		}).join("");

		var top =
			'<div style="display:flex;gap:0.45rem;flex-wrap:wrap;margin-bottom:0.7rem;">' +
			links +
			"</div>";
		if (!rows.length) {
			document.getElementById("tab-feedback").innerHTML =
				top + '<div class="sh-empty-cell">No submitted feedback records.</div>';
			return;
		}
		var html =
			top +
			'<div class="table-wrap"><table class="sh-admin-table"><thead><tr>' +
			"<th>Form</th><th>Doc</th><th>Class</th><th>Submitted</th><th>View</th>" +
			"</tr></thead><tbody>";
		rows.forEach(function (row) {
			var feedbackDesk = deskUrl(row.doctype, row.name);
			html +=
				"<tr>" +
				"<td>" +
				esc(row.label || row.doctype) +
				"</td>" +
				"<td><code>" +
				esc(row.name) +
				"</code></td>" +
				"<td>" +
				esc(row.programme_schedule || "—") +
				"</td>" +
				"<td>" +
				esc(fmtDate(row.creation)) +
				"</td>" +
				"<td>" +
				'<a class="sh-btn-secondary" style="font-size:0.78rem;padding:0.38rem 0.7rem;text-decoration:none;" target="_blank" href="' +
				feedbackDesk +
				'">View in Desk ↗</a>' +
				"</td>" +
				"</tr>";
		});
		html += "</tbody></table></div>";
		document.getElementById("tab-feedback").innerHTML = html;
	}

	function selectedValues(rows, key) {
		return (rows || [])
			.map(function (row) {
				return row && row[key] ? String(row[key]).trim() : "";
			})
			.filter(Boolean);
	}

	function uniqueStrings(values) {
		var out = [];
		var seen = {};
		(values || []).forEach(function (value) {
			var v = String(value || "").trim();
			if (!v || seen[v]) return;
			seen[v] = true;
			out.push(v);
		});
		return out;
	}

	function renderChecklist(containerId, values, selected, keyPrefix) {
		var container = document.getElementById(containerId);
		if (!container) return;
		container.innerHTML = "";

		var options = uniqueStrings(values || []);
		if (!options.length) {
			container.innerHTML = '<div class="sh-empty-cell">No options configured.</div>';
			return;
		}

		var selectedSet = {};
		(selected || []).forEach(function (value) {
			selectedSet[value] = true;
		});

		options.forEach(function (value, idx) {
			var id = keyPrefix + "-opt-" + idx;
			var row = document.createElement("label");
			row.setAttribute("for", id);
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.gap = "0.45rem";
			row.style.padding = "0.45rem 0.6rem";
			row.style.border = "1px solid var(--color-slate-100)";
			row.style.borderRadius = "0.6rem";
			row.style.fontSize = "0.84rem";
			row.style.cursor = "pointer";

			var checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = id;
			checkbox.value = value;
			checkbox.checked = !!selectedSet[value];
			checkbox.dataset.multiGroup = keyPrefix;

			var text = document.createElement("span");
			text.textContent = value;
			row.appendChild(checkbox);
			row.appendChild(text);
			container.appendChild(row);
		});
	}

	function selectedFromChecklist(keyPrefix, keyName) {
		var nodes = document.querySelectorAll(
			'input[type="checkbox"][data-multi-group="' + keyPrefix + '"]:checked'
		);
		return Array.prototype.map.call(nodes, function (node) {
			var row = {};
			row[keyName] = String(node.value || "").trim();
			return row;
		});
	}

	function buildEditField(field, value) {
		var editable = !field.read_only && !field.hidden;
		if (!editable) return "";
		if (
			!field.fieldname ||
			["name", "owner", "modified", "modified_by", "creation", "doctype"].indexOf(
				field.fieldname
			) > -1
		)
			return "";
		if (
			[
				"Section Break",
				"Column Break",
				"Tab Break",
				"HTML",
				"Button",
				"Attach",
				"Attach Image",
				"Table",
			].indexOf(field.fieldtype) > -1
		)
			return "";

		var html = '<div class="sh-input-group" style="margin-bottom:0.8rem;">';
		html +=
			'<label class="sh-label" for="fld-' +
			esc(field.fieldname) +
			'">' +
			esc(field.label || field.fieldname) +
			"</label>";

		var current = value === null || value === undefined ? "" : value;
		if (field.fieldtype === "Check") {
			html +=
				'<input id="fld-' +
				esc(field.fieldname) +
				'" data-fieldname="' +
				esc(field.fieldname) +
				'" data-fieldtype="Check" class="sh-input" type="checkbox" ' +
				(current ? "checked" : "") +
				">";
		} else if (field.fieldtype === "Link") {
			html +=
				'<select id="fld-' +
				esc(field.fieldname) +
				'" data-fieldname="' +
				esc(field.fieldname) +
				'" data-fieldtype="Link" data-link-doctype="' +
				esc(field.options || "") +
				'" data-current="' +
				esc(current) +
				'" class="sh-input">';
			html += '<option value="' + esc(current) + '">' + esc(current || "") + "</option>";
			html += "</select>";
		} else if (field.fieldtype === "Select") {
			html +=
				'<select id="fld-' +
				esc(field.fieldname) +
				'" data-fieldname="' +
				esc(field.fieldname) +
				'" data-fieldtype="Select" class="sh-input">';
			html += '<option value=""></option>';
			(field.options || "")
				.split("\n")
				.filter(Boolean)
				.forEach(function (option) {
					html +=
						'<option value="' +
						esc(option) +
						'"' +
						(String(current) === String(option) ? " selected" : "") +
						">" +
						esc(option) +
						"</option>";
				});
			html += "</select>";
		} else if (
			field.fieldtype === "Small Text" ||
			field.fieldtype === "Text" ||
			field.fieldtype === "Long Text" ||
			field.fieldtype === "Text Editor"
		) {
			html +=
				'<textarea id="fld-' +
				esc(field.fieldname) +
				'" data-fieldname="' +
				esc(field.fieldname) +
				'" data-fieldtype="' +
				esc(field.fieldtype) +
				'" class="sh-input" rows="3">' +
				esc(current) +
				"</textarea>";
		} else if (field.fieldtype === "Date") {
			html +=
				'<input id="fld-' +
				esc(field.fieldname) +
				'" data-fieldname="' +
				esc(field.fieldname) +
				'" data-fieldtype="Date" class="sh-input" type="date" value="' +
				esc(current) +
				'">';
		} else if (
			field.fieldtype === "Int" ||
			field.fieldtype === "Float" ||
			field.fieldtype === "Currency" ||
			field.fieldtype === "Percent"
		) {
			html +=
				'<input id="fld-' +
				esc(field.fieldname) +
				'" data-fieldname="' +
				esc(field.fieldname) +
				'" data-fieldtype="' +
				esc(field.fieldtype) +
				'" class="sh-input" type="number" value="' +
				esc(current) +
				'">';
		} else {
			html +=
				'<input id="fld-' +
				esc(field.fieldname) +
				'" data-fieldname="' +
				esc(field.fieldname) +
				'" data-fieldtype="' +
				esc(field.fieldtype) +
				'" class="sh-input" type="text" value="' +
				esc(current) +
				'">';
		}

		html += "</div>";
		return html;
	}

	function renderEdit() {
		var student = state.bundle.student || {};
		var fields = (state.meta && state.meta.fields) || [];
		var editable = state.editable || {};
		var byName = {};
		fields.forEach(function (field) {
			if (field && field.fieldname) byName[field.fieldname] = field;
		});

		var groups = [
			{
				title: "Personal Details",
				fields: [
					"first_name",
					"middle_name",
					"last_name",
					"student_name",
					"student_image",
					"date_of_birth",
					"age",
					"gender",
					"religion",
					"nationality",
				],
			},
			{
				title: "Address & Contact",
				fields: [
					"address_line_1",
					"address_line_2",
					"city",
					"stateprovince",
					"country",
					"pincode",
					"mobile",
					"personal_email",
					"portal_user_account",
					"user_login_email",
				],
			},
			{
				title: "ID & Application",
				fields: [
					"student_id",
					"student_full_name",
					"full_name_and_id",
					"nrc_number",
					"route",
					"published",
					"date_submitted_enrolment_form",
					"applicant_record",
				],
			},
			{
				title: "Enrolment & Grouping",
				fields: [
					"status",
					"programme_path",
					"intake_year",
					"intake_cohort",
					"current_enrolment_record",
					"current_schedule",
					"current_course",
					"current_milestone",
					"enrolment_date",
					"graduation_completion_date",
					"exit_reason",
				],
			},
			{
				title: "Household & Guardian",
				fields: [
					"household_income",
					"household_receives_financial_aid",
					"housing_status",
					"guardian_name",
					"guardian_email",
					"guardian_mobile_number",
					"guardian_address",
					"guardian_date_of_birth",
					"guardian_occupation",
					"relationship",
					"parents_marital_status",
					"number_of_siblings",
				],
			},
			{
				title: "Attachment & Work",
				fields: [
					"attachment_institution",
					"attachment_institution_niche",
					"attachment_institution_address",
					"course_at_time_of_attachment",
					"attachment_start_date",
					"attachment_end_date",
					"attachment_completed",
					"emp_start_date",
					"emp_end_date",
					"emp_is_current",
					"emp_institution",
					"emp_niche",
					"emp_address",
					"emp_occupation",
					"emp_role",
					"emp_salary",
					"emp_income_level",
					"emp_notes",
				],
			},
		];

		var used = {};
		var html = "";

		groups.forEach(function (group) {
			var controls = "";
			group.fields.forEach(function (fieldname) {
				var field = byName[fieldname];
				if (!field) return;
				var control = buildEditField(field, student[field.fieldname]);
				if (!control) return;
				controls += control;
				used[field.fieldname] = true;
			});

			if (controls) {
				html +=
					'<section class="sh-card" style="padding:1rem;margin-bottom:0.9rem;border:1px solid var(--color-slate-100);box-shadow:none;">' +
					'<h4 style="margin:0 0 0.85rem;font-size:0.92rem;color:var(--color-teal-700);">' +
					esc(group.title) +
					"</h4>" +
					'<div class="sh-form-grid">' +
					controls +
					"</div>" +
					"</section>";
			}
		});

		var remaining = "";
		fields.forEach(function (field) {
			if (!field || !field.fieldname || used[field.fieldname]) return;
			var control = buildEditField(field, student[field.fieldname]);
			if (!control) return;
			remaining += control;
		});

		if (remaining) {
			html +=
				'<section class="sh-card" style="padding:1rem;border:1px solid var(--color-slate-100);box-shadow:none;">' +
				'<h4 style="margin:0 0 0.85rem;font-size:0.92rem;color:var(--color-teal-700);">Additional Fields</h4>' +
				'<div class="sh-form-grid">' +
				remaining +
				"</div>" +
				"</section>";
		}

		html +=
			'<section class="sh-card" style="padding:1rem;margin-top:0.9rem;border:1px solid var(--color-slate-100);box-shadow:none;">' +
			'<h4 style="margin:0 0 0.85rem;font-size:0.92rem;color:var(--color-teal-700);">Growth & Motivation</h4>' +
			'<div class="sh-form-grid">' +
			"<div>" +
			'<label class="sh-label">Motivations</label>' +
			'<div id="admin-motivation-options" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0.45rem;"></div>' +
			"</div>" +
			"<div>" +
			'<label class="sh-label">Resilience Statements</label>' +
			'<div id="admin-resilience-options" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0.45rem;"></div>' +
			"</div>" +
			"</div>" +
			"</section>";

		document.getElementById("tab-edit").innerHTML = html;

		renderChecklist(
			"admin-motivation-options",
			editable.motivation_options || [],
			selectedValues(student.motivations, "motivation"),
			"admin-motivation"
		);
		renderChecklist(
			"admin-resilience-options",
			editable.resilience_options || [],
			selectedValues(student.resilience_links, "resilience_statement"),
			"admin-resilience"
		);
		hydrateLinkFields();
	}

	function bindTabs() {
		var tabs = document.querySelectorAll("#student-tabs button[data-tab]");
		tabs.forEach(function (tab) {
			tab.addEventListener("click", function () {
				tabs.forEach(function (b) {
					b.classList.remove("active");
				});
				document.querySelectorAll(".tab-panel").forEach(function (panel) {
					panel.classList.remove("active");
				});
				tab.classList.add("active");
				document
					.getElementById("tab-" + tab.getAttribute("data-tab"))
					.classList.add("active");
			});
		});
	}

	function saveChanges() {
		var inputs = document.querySelectorAll("#tab-edit [data-fieldname]");
		var payload = {};
		inputs.forEach(function (input) {
			var fieldname = input.getAttribute("data-fieldname");
			var fieldtype = input.getAttribute("data-fieldtype");
			if (!fieldname) return;
			if (fieldtype === "Check") payload[fieldname] = input.checked ? 1 : 0;
			else payload[fieldname] = input.value;
		});

		payload.motivations = selectedFromChecklist("admin-motivation", "motivation");
		payload.resilience_links = selectedFromChecklist(
			"admin-resilience",
			"resilience_statement"
		);

		var saveBtn = document.getElementById("student-save-btn");
		saveBtn.disabled = true;
		saveBtn.textContent = "Saving...";

		// FIX: include `student` in the JSON body alongside `payload`.
		// When Content-Type is application/json, Frappe does not populate
		// frappe.form_dict from the query string, so the endpoint's fallback
		// `student = frappe.form_dict.get("student")` always returned None.
		// Passing it in the body ensures it is always received correctly.
		api(
			"/api/method/skillshub_core.skillshub_core.api.update_student_admin",
			{
				method: "POST",
				body: JSON.stringify({ student: state.studentId, payload: payload }),
			}
		)
			.then(function () {
				saveBtn.textContent = "Saved";
				load();
			})
			.catch(function (error) {
				saveBtn.textContent = "Save Changes";
				saveBtn.disabled = false;
				alert("Save failed: " + error.message);
			});
	}

	function load() {
		return Promise.all([
			api(
				"/api/method/skillshub_core.skillshub_portal.api.get_student_admin_bundle?student=" +
					encodeURIComponent(state.studentId)
			),
			api(
				"/api/method/skillshub_core.skillshub_portal.api.get_doctype_meta?doctype=" +
					encodeURIComponent("SH Student")
			),
			api(
				"/api/method/skillshub_core.skillshub_core.api.get_student_editable?student=" +
					encodeURIComponent(state.studentId)
			).catch(function () {
				return {};
			}),
		])
			.then(function (results) {
				state.bundle = results[0];
				state.meta = results[1];
				state.editable = results[2] || {};
				setHeader();
				renderOverview();
				renderEnrolments();
				renderAttendance();
				renderFeedback();
				renderEdit();
			})
			.catch(function (error) {
				document.getElementById("tab-overview").innerHTML =
					'<div class="sh-empty-cell">Failed to load profile: ' +
					esc(error.message) +
					"</div>";
			});
	}

	document.addEventListener("DOMContentLoaded", function () {
		state.studentId = parseStudentId();
		if (!state.studentId) {
			document.getElementById("tab-overview").innerHTML =
				'<div class="sh-empty-cell">Student ID missing from URL.</div>';
			return;
		}

		bindTabs();
		document.getElementById("student-save-btn").addEventListener("click", saveChanges);
		load();
	});
})();
