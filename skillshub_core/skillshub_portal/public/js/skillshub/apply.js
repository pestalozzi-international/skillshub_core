/* eslint-disable no-var */
(function () {
	"use strict";

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	function esc(s) {
		if (s == null) return "";
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	function $id(s) {
		return document.getElementById(s);
	}

	function showMsg(msg, isError) {
		var el = $id("pi-apply-msg");
		if (!el) return;
		if (!msg) {
			el.innerHTML = "";
			return;
		}
		var cls = isError ? "pi-alert pi-alert-error" : "pi-alert pi-alert-success";
		el.innerHTML = '<div class="' + cls + '">' + esc(msg) + "</div>";
	}

	// ---------------------------------------------------------------------------
	// Portal settings + vocational courses (populated at init)
	// ---------------------------------------------------------------------------

	var portalSettings = {};
	var vokalCourses = [];

	// Specific grade → broad schooling range (used to auto-fill highest_level_of_schooling)
	var YEAR_TO_SCHOOLING = {
		"Never attended school": "Never attended school",
		"Grade 1": "Grades 1 to 7",
		"Grade 2": "Grades 1 to 7",
		"Grade 3": "Grades 1 to 7",
		"Grade 4": "Grades 1 to 7",
		"Grade 5": "Grades 1 to 7",
		"Grade 6": "Grades 1 to 7",
		"Grade 7": "Grades 1 to 7",
		"Grade 8": "Grades 8 to 9",
		"Grade 9": "Grades 8 to 9",
		"Grade 10": "Grades 10 to 12",
		"Grade 11": "Grades 10 to 12",
		"Grade 12": "Grades 10 to 12",
		"Undergraduate/Bachelor's": "University or Diploma",
		"Graduate/Master's": "University or Diploma",
		"Doctoral/PhD": "University or Diploma",
	};

	function hasAttendedSchool(d) {
		return !!d.year_left_school && d.year_left_school !== "Never attended school";
	}

	// ---------------------------------------------------------------------------
	// Section / field definitions
	// ---------------------------------------------------------------------------

	var SECTIONS = [
		{
			title: "Personal Details",
			fields: [
				{ name: "full_name", label: "Full Name", type: "Data", reqd: true },
				{ name: "date_of_birth", label: "Date of Birth", type: "Date", reqd: true },
				{
					name: "gender",
					label: "Gender",
					type: "Select",
					reqd: true,
					options: ["Male", "Female"],
				},
				{
					name: "nationality",
					label: "Nationality",
					type: "Select",
					reqd: true,
					options: ["Zambian", "Other"],
				},
				{
					name: "nrc_number",
					label: "NRC Number",
					type: "Data",
					desc: "National Registration Card number (if available)",
				},
				{
					name: "marital_status",
					label: "Marital Status",
					type: "Select",
					options: ["Single", "Married", "Divorced", "Widowed", "Other"],
				},
			],
		},
		{
			title: "Contact & Address",
			fields: [
				{
					name: "mobile",
					label: "Phone Number (WhatsApp preferred)",
					type: "Phone",
					reqd: true,
					desc: "Start with +260",
				},
				{ name: "personal_email", label: "Email Address", type: "Email" },
				{
					name: "emergency_contact_name",
					label: "Emergency Contact Name",
					type: "Data",
					desc: "Full name of emergency contact",
				},
				{
					name: "emergency_contact_number",
					label: "Emergency Contact Number",
					type: "Phone",
					desc: "Phone number of emergency contact",
				},
				{
					name: "residential_area",
					label: "Residential Area / Community",
					type: "Data",
					reqd: true,
					desc: "e.g. Bauleni, Mutendere, Kalingalinga",
				},
				{ name: "address_line_1", label: "Address / Plot Number", type: "Data" },
				{ name: "city", label: "City", type: "Data" },
			],
		},
		{
			title: "Household & Guardian",
			fields: [
				{
					name: "guardian_name",
					label: "Parent / Guardian Name",
					type: "Data",
					reqd: true,
				},
				{
					name: "guardian_relationship",
					label: "Relationship to Applicant",
					type: "Select",
					reqd: true,
					options: [
						"Mother",
						"Father",
						"Stepmother",
						"Stepfather",
						"Grandmother",
						"Grandfather",
						"Grandparent",
						"Aunt",
						"Uncle",
						"Brother",
						"Sister",
						"Cousin",
						"Legal Guardian",
						"Foster Parent",
						"Adoptive Parent",
						"Spouse",
						"Other",
					],
				},
				{ name: "guardian_mobile", label: "Guardian Phone Number", type: "Phone" },
				{ name: "guardian_occupation", label: "Guardian Occupation", type: "Data" },
				{
					name: "household_income",
					label: "Total Household Income (ZMW/month)",
					type: "Select",
					reqd: true,
					options: [
						"Less than 500",
						"500 to 1000",
						"1000 to 1500",
						"1500 to 2000",
						"2000+",
					],
				},
				{
					name: "household_receives_financial_aid",
					label: "Does the Household Receive Financial Aid?",
					type: "Select",
					options: ["Yes", "No", "Maybe"],
				},
				{
					name: "housing_status",
					label: "Living Conditions",
					type: "Select",
					options: ["Rented Home", "Owned Home", "Government", "Other"],
				},
				{ name: "number_of_siblings", label: "Number of Siblings", type: "Int" },
				{
					name: "parents_marital_status",
					label: "Parents' Marital Status",
					type: "Select",
					options: ["Married", "Divorced", "Widowed", "Separated", "Single Parent"],
				},
				{ name: "is_parent", label: "Are you a parent or guardian?", type: "Check" },
				{
					name: "number_of_children",
					label: "Number of Children",
					type: "Int",
					showIf: function (d) {
						return !!d.is_parent;
					},
				},
			],
		},
		{
			title: "Education & Background",
			fields: [
				{
					name: "year_left_school",
					label: "What is the highest grade or qualification you completed?",
					type: "Select",
					reqd: true,
					options: [
						"Never attended school",
						"Grade 1",
						"Grade 2",
						"Grade 3",
						"Grade 4",
						"Grade 5",
						"Grade 6",
						"Grade 7",
						"Grade 8",
						"Grade 9",
						"Grade 10",
						"Grade 11",
						"Grade 12",
						"Undergraduate/Bachelor's",
						"Graduate/Master's",
						"Doctoral/PhD",
					],
				},
				{
					name: "last_school_attended",
					label: "Last School Attended",
					type: "Data",
					showIf: hasAttendedSchool,
				},
				{
					name: "reason_for_leaving_school",
					label: "Reason for Leaving School",
					type: "Select",
					showIf: hasAttendedSchool,
					options: [
						"Financial difficulties",
						"Early parenthood",
						"Family responsibilities",
						"Health issues",
						"Lack of access to education",
						"Graduated",
						"Other",
					],
				},
				{
					name: "can_read_and_write",
					label: "Can You Read and Write?",
					type: "Select",
					reqd: true,
					options: ["Yes", "No", "Basic (limited)"],
				},
				{
					name: "has_vocational_training_history",
					label: "Have you participated in any vocational training before?",
					type: "Check",
				},
				{
					name: "vocational_training_details",
					label: "Describe the training and where it was done",
					type: "Small Text",
					showIf: function (d) {
						return !!d.has_vocational_training_history;
					},
				},
				{
					name: "special_talents",
					label: "Special Talents or Abilities",
					type: "Small Text",
					desc: "e.g. singing, drawing, sports, technology skills",
				},
				{
					name: "community_participation",
					label: "Community Activities or Organisations",
					type: "Small Text",
				},
				{
					name: "has_volunteering_history",
					label: "Have you done any volunteering?",
					type: "Check",
				},
				{
					name: "details_of_volunteering",
					label: "Volunteering Details",
					type: "Small Text",
					showIf: function (d) {
						return !!d.has_volunteering_history;
					},
					desc: "Yes or No — if yes, please describe",
				},
				{
					name: "currently_employed",
					label: "Are you currently employed or engaged in any activity?",
					type: "Check",
				},
				{
					name: "employment_type",
					label: "Full-time or Part-time?",
					type: "Select",
					options: ["Full-time", "Part-time"],
					showIf: function (d) {
						return !!d.currently_employed;
					},
				},
				{
					name: "students_occupation",
					label: "Current Occupation / Activity",
					type: "Data",
					showIf: function (d) {
						return !!d.currently_employed;
					},
				},
			],
		},
		{
			title: "Course & Motivation",
			fields: [
				{
					name: "preferred_course",
					label: "First Course Preference",
					type: "Select",
					reqd: true,
					options: vokalCourses,
					desc: "Choose the course you are most interested in",
				},
				{
					name: "second_preference_course",
					label: "Second Course Preference (Optional)",
					type: "Select",
					options: vokalCourses,
				},
				{
					name: "why_join_skillshub",
					label: "Why do you want to join the Skills Hub Programme?",
					type: "Long Text",
					reqd: true,
				},
				{
					name: "career_goals",
					label: "What are your career goals after completing training?",
					type: "Long Text",
					reqd: true,
				},
				{
					name: "how_skill_benefits_community",
					label: "How will the skill benefit you, your family, and your community?",
					type: "Small Text",
				},
				{
					name: "how_skill_improves_livelihood",
					label: "How will the skill improve your livelihood?",
					type: "Small Text",
				},
				{
					name: "available_to_start",
					label: "I am available and ready to start training when selected",
					type: "Check",
				},
				{
					name: "fully_committed",
					label: "I will be fully committed to attend all sessions and participate actively",
					type: "Check",
				},
				{
					name: "participation_challenges",
					label: "Any challenges that may affect your participation?",
					type: "Small Text",
					desc: "e.g. childcare, transport, family support",
				},
			],
		},
		{
			title: "Health & Declaration",
			fields: [
				{
					name: "has_health_conditions",
					label: "Do you have any underlying health conditions?",
					type: "Select",
					reqd: true,
					options: ["No", "Yes"],
				},
				{
					name: "health_conditions_details",
					label: "If Yes, please explain your health condition",
					type: "Small Text",
					showIf: function (d) {
						return d.has_health_conditions === "Yes";
					},
				},
				{
					name: "contact_consent",
					label: "I give consent for Pestalozzi International and its partners to contact me regarding my application and for follow-up",
					type: "Check",
				},
				{
					name: "media_consent",
					label: "I give consent for Pestalozzi International to capture and share my stories and photos on their media platforms and with donors",
					type: "Check",
				},
				{
					name: "declaration_consent",
					label: "I declare that the information provided above is true and complete to the best of my knowledge. I understand that false information may lead to disqualification.",
					type: "Check",
					reqd: true,
				},
				{
					name: "declaration_name",
					label: "Write your full name below to confirm your declaration",
					type: "Data",
					reqd: true,
					desc: "This acts as your signature",
				},
			],
		},
	];

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------

	var current = 0;
	var formData = {};

	// ---------------------------------------------------------------------------
	// Render a single field
	// ---------------------------------------------------------------------------

	function renderField(f) {
		var id = "af-" + f.name;
		var stored = formData[f.name];
		var html = "";

		if (f.type === "Check") {
			var checked = stored ? " checked" : "";
			html +=
				'<div class="pi-field" style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.4rem 0;">';
			html +=
				'<input type="checkbox" id="' +
				esc(id) +
				'" data-fn="' +
				esc(f.name) +
				'" style="margin-top:0.2rem;flex-shrink:0;"' +
				checked +
				">";
			html +=
				'<label for="' +
				esc(id) +
				'" style="cursor:pointer;font-size:0.9rem;line-height:1.4;">' +
				esc(f.label);
			if (f.reqd) {
				html += ' <span style="color:#dc2626;">*</span>';
			}
			html += "</label>";
			html += "</div>";
			return html;
		}

		// Label
		html += '<div class="pi-field">';
		html += '<label class="pi-label" for="' + esc(id) + '">' + esc(f.label);
		if (f.reqd) {
			html += ' <span style="color:#dc2626;">*</span>';
		}
		html += "</label>";

		if (f.type === "Select") {
			var selVal = stored != null ? String(stored) : "";
			html += '<select class="pi-input" id="' + esc(id) + '" data-fn="' + esc(f.name) + '">';
			html += '<option value=""></option>';
			var opts = f.options || [];
			for (var i = 0; i < opts.length; i++) {
				var sel = selVal === opts[i] ? " selected" : "";
				html +=
					'<option value="' +
					esc(opts[i]) +
					'"' +
					sel +
					">" +
					esc(opts[i]) +
					"</option>";
			}
			html += "</select>";
		} else if (f.type === "Long Text") {
			var ltVal = stored != null ? String(stored) : "";
			html +=
				'<textarea class="pi-input" id="' +
				esc(id) +
				'" data-fn="' +
				esc(f.name) +
				'" rows="4" style="resize:vertical;">' +
				esc(ltVal) +
				"</textarea>";
		} else if (f.type === "Small Text") {
			var stVal = stored != null ? String(stored) : "";
			html +=
				'<textarea class="pi-input" id="' +
				esc(id) +
				'" data-fn="' +
				esc(f.name) +
				'" rows="2" style="resize:vertical;">' +
				esc(stVal) +
				"</textarea>";
		} else if (f.type === "Date") {
			var dateVal = stored != null ? String(stored) : "";
			html +=
				'<input type="date" class="pi-input" id="' +
				esc(id) +
				'" data-fn="' +
				esc(f.name) +
				'" value="' +
				esc(dateVal) +
				'">';
		} else if (f.type === "Int") {
			var intVal = stored != null && stored !== "" ? String(stored) : "";
			html +=
				'<input type="number" class="pi-input" id="' +
				esc(id) +
				'" data-fn="' +
				esc(f.name) +
				'" value="' +
				esc(intVal) +
				'" step="1" min="0">';
		} else {
			// Data, Phone, Email
			var inputType = f.type === "Email" ? "email" : f.type === "Phone" ? "tel" : "text";
			var dataVal = stored != null ? String(stored) : "";
			html +=
				'<input type="' +
				inputType +
				'" class="pi-input" id="' +
				esc(id) +
				'" data-fn="' +
				esc(f.name) +
				'" value="' +
				esc(dataVal) +
				'">';
		}

		if (f.desc) {
			html +=
				'<div style="font-size:0.78rem;color:var(--pi-muted);margin-top:0.25rem;">' +
				esc(f.desc) +
				"</div>";
		}

		html += "</div>";
		return html;
	}

	// ---------------------------------------------------------------------------
	// Render section — returns HTML string for all visible fields
	// ---------------------------------------------------------------------------

	function renderSection(idx) {
		var sec = SECTIONS[idx];
		var html = "";
		for (var i = 0; i < sec.fields.length; i++) {
			var f = sec.fields[i];
			if (f.showIf && !f.showIf(formData)) continue;
			html += renderField(f);
		}
		return html;
	}

	// ---------------------------------------------------------------------------
	// Collect field values from DOM into formData
	// ---------------------------------------------------------------------------

	function collectSection() {
		var body = $id("pi-apply-body");
		if (!body) return;
		var els = body.querySelectorAll("[data-fn]");
		for (var i = 0; i < els.length; i++) {
			var el = els[i];
			var fn = el.getAttribute("data-fn");
			if (!fn) continue;
			if (el.type === "checkbox") {
				formData[fn] = el.checked ? 1 : 0;
			} else if (el.type === "number") {
				formData[fn] = el.value !== "" ? parseInt(el.value, 10) : "";
			} else {
				formData[fn] = el.value;
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Validate required fields for a section
	// ---------------------------------------------------------------------------

	function validateSection(idx) {
		var sec = SECTIONS[idx];
		var errs = [];
		for (var i = 0; i < sec.fields.length; i++) {
			var f = sec.fields[i];
			if (!f.reqd) continue;
			if (f.showIf && !f.showIf(formData)) continue;
			var val = formData[f.name];
			if (f.type === "Check") {
				if (!val) {
					errs.push("Please tick the required checkbox: " + f.label);
				}
			} else {
				if (val === undefined || val === null || val === "") {
					errs.push("Please fill in: " + f.label);
				}
			}
		}
		return errs;
	}

	// ---------------------------------------------------------------------------
	// Show a section and update progress UI
	// ---------------------------------------------------------------------------

	function showSection(idx) {
		current = idx;
		var body = $id("pi-apply-body");
		if (body) {
			body.innerHTML = renderSection(idx);
		}

		// Progress
		var titleEl = $id("pi-section-title");
		var counterEl = $id("pi-section-counter");
		var barEl = $id("pi-progress-bar");
		if (titleEl) titleEl.textContent = SECTIONS[idx].title;
		if (counterEl) counterEl.textContent = "Step " + (idx + 1) + " of " + SECTIONS.length;
		if (barEl) {
			var pct = ((idx + 1) / SECTIONS.length) * 100;
			barEl.style.width = pct + "%";
		}

		// Button visibility
		var prevBtn = $id("pi-nav-prev");
		var nextBtn = $id("pi-nav-next");
		var submitBtn = $id("pi-nav-submit");
		var isLast = idx === SECTIONS.length - 1;

		if (prevBtn) prevBtn.style.display = idx === 0 ? "none" : "";
		if (nextBtn) nextBtn.style.display = isLast ? "none" : "";
		if (submitBtn) submitBtn.style.display = isLast ? "" : "none";

		showMsg("");
		wireBody();
	}

	// ---------------------------------------------------------------------------
	// Event delegation on the body div for change events
	// Re-renders conditional fields without losing the listener
	// ---------------------------------------------------------------------------

	var _bodyWired = false;

	function wireBody() {
		if (_bodyWired) return;
		_bodyWired = true;

		var body = $id("pi-apply-body");
		if (!body) return;

		body.addEventListener("change", function (e) {
			var el = e.target;
			var fn = el.getAttribute("data-fn");
			if (!fn) return;

			if (el.type === "checkbox") {
				formData[fn] = el.checked ? 1 : 0;
			} else if (el.type === "number") {
				formData[fn] = el.value !== "" ? parseInt(el.value, 10) : "";
			} else {
				formData[fn] = el.value;
			}

			// Auto-fill highest_level_of_schooling from year_left_school
			if (fn === "year_left_school") {
				formData.highest_level_of_schooling = YEAR_TO_SCHOOLING[el.value] || "";
			}

			// Re-render section if it has any conditional fields
			var sec = SECTIONS[current];
			var hasConditional = sec.fields.some(function (f) {
				return !!f.showIf;
			});
			if (hasConditional) {
				body.innerHTML = renderSection(current);
				// _bodyWired stays true — the listener is on the body element itself,
				// which persists across innerHTML replacement of its children.
			}
		});
	}

	// ---------------------------------------------------------------------------
	// Navigation
	// ---------------------------------------------------------------------------

	function goNext() {
		collectSection();
		var errs = validateSection(current);
		if (errs.length) {
			showMsg(errs[0], true);
			return;
		}
		if (current < SECTIONS.length - 1) {
			showSection(current + 1);
			window.scrollTo(0, 0);
		}
	}

	function goPrev() {
		collectSection();
		if (current > 0) {
			showSection(current - 1);
			window.scrollTo(0, 0);
		}
	}

	// ---------------------------------------------------------------------------
	// Submit
	// ---------------------------------------------------------------------------

	function doSubmit() {
		collectSection();
		var errs = validateSection(current);
		if (errs.length) {
			showMsg(errs[0], true);
			return;
		}

		var nextBtn = $id("pi-nav-next");
		var submitBtn = $id("pi-nav-submit");
		var prevBtn = $id("pi-nav-prev");
		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = "Submitting…";
		}
		if (nextBtn) nextBtn.disabled = true;
		if (prevBtn) prevBtn.disabled = true;

		var url = "/api/method/skillshub_core.skillshub_portal.api.submit_application";
		var body = JSON.stringify({ payload: JSON.stringify(formData) });

		fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Frappe-CSRF-Token": (window.frappe && window.frappe.csrf_token) || "",
			},
			body: body,
		})
			.then(function (res) {
				return res.json().then(function (data) {
					return { ok: res.ok, data: data };
				});
			})
			.then(function (result) {
				var data = result.data;
				if (data && data.message && data.message.ok) {
					showSuccess(data.message.name);
					return;
				}
				// Extract error message
				var msg = "Submission failed. Please try again.";
				if (data && data._server_messages) {
					try {
						var msgs = JSON.parse(data._server_messages);
						if (Array.isArray(msgs) && msgs.length) {
							var first = JSON.parse(msgs[0]);
							msg = first.message || msg;
						}
					} catch (err) {
						// ignore parse error, use default
					}
				} else if (data && data.exc) {
					msg = "Server error. Please try again.";
				} else if (data && data.message && typeof data.message === "string") {
					msg = data.message;
				}
				showMsg(msg, true);
				// Re-enable buttons
				if (submitBtn) {
					submitBtn.disabled = false;
					submitBtn.textContent = "Submit Application";
				}
				if (nextBtn) nextBtn.disabled = false;
				if (prevBtn) prevBtn.disabled = false;
			})
			.catch(function () {
				showMsg("Network error. Please check your connection and try again.", true);
				if (submitBtn) {
					submitBtn.disabled = false;
					submitBtn.textContent = "Submit Application";
				}
				if (nextBtn) nextBtn.disabled = false;
				if (prevBtn) prevBtn.disabled = false;
			});
	}

	// ---------------------------------------------------------------------------
	// Success screen
	// ---------------------------------------------------------------------------

	function showSuccess(refName) {
		var wrap = $id("pi-apply-wrap");
		var success = $id("pi-apply-success");
		var refEl = $id("pi-success-ref");
		if (wrap) wrap.style.display = "none";
		if (success) success.style.display = "";
		if (refEl) refEl.textContent = "Reference: " + refName;
		window.scrollTo(0, 0);
	}

	// ---------------------------------------------------------------------------
	// Application portal checks
	// ---------------------------------------------------------------------------

	function fetchPortalSettings() {
		var url =
			"/api/method/skillshub_core.skillshub_portal.doctype" +
			".skillshub_portal_settings.skillshub_portal_settings.get_portal_settings";
		return fetch(url, { credentials: "include" })
			.then(function (r) {
				return r.json();
			})
			.then(function (d) {
				return (d && d.message) || {};
			});
	}

	function fetchVocalCourses() {
		var url =
			"/api/resource/SkillsHub%20Course" +
			'?filters=[["program_category","=","Vocational Training"]]&fields=["name"]&limit=100&order_by=name+asc';
		return fetch(url, { credentials: "include" })
			.then(function (r) {
				return r.json();
			})
			.then(function (d) {
				var docs = (d && d.data) || [];
				return docs.map(function (c) {
					return c.name;
				});
			})
			.catch(function () {
				return [];
			});
	}

	function isApplicationOpen(settings) {
		if (!settings.application_portal_enabled) return false;
		var today = new Date().toISOString().slice(0, 10);
		if (settings.application_open_from && settings.application_open_from > today) return false;
		if (settings.application_open_until && settings.application_open_until < today)
			return false;
		return true;
	}

	function showClosed(settings) {
		var wrap = $id("pi-apply-wrap");
		var prog = $id("pi-apply-progress");
		var closed = $id("pi-apply-closed");
		var msgEl = $id("pi-closed-message");
		if (wrap) wrap.style.display = "none";
		if (prog) prog.style.display = "none";
		if (closed) closed.style.display = "";
		if (msgEl) {
			msgEl.textContent =
				settings.application_closed_message ||
				"Applications are currently closed. Please check back later.";
		}
		window.scrollTo(0, 0);
	}

	function showApplicationBanner(settings) {
		var banner = $id("pi-apply-banner");
		if (!banner) return;
		var parts = [];
		if (settings.application_default_cohort) parts.push(settings.application_default_cohort);
		if (settings.application_default_year) parts.push(settings.application_default_year);
		if (settings.application_open_until) {
			parts.push("Closes: " + settings.application_open_until);
		}
		if (parts.length) {
			banner.innerHTML =
				'<div class="pi-context-bar" style="margin-bottom:1rem;">' +
				parts
					.map(function (p) {
						return "<span><strong>" + esc(p) + "</strong></span>";
					})
					.join('<span style="color:var(--pi-muted);">·</span>') +
				"</div>";
		}
	}

	// ---------------------------------------------------------------------------
	// Init
	// ---------------------------------------------------------------------------

	document.addEventListener("DOMContentLoaded", function () {
		var nextBtn = $id("pi-nav-next");
		var prevBtn = $id("pi-nav-prev");
		var submitBtn = $id("pi-nav-submit");

		if (nextBtn) nextBtn.addEventListener("click", goNext);
		if (prevBtn) prevBtn.addEventListener("click", goPrev);
		if (submitBtn) submitBtn.addEventListener("click", doSubmit);

		// Show skeleton loader while fetching
		var body = $id("pi-apply-body");
		if (body) {
			body.innerHTML =
				'<div class="pi-skeleton" style="height:2.5rem;border-radius:0.5rem;margin-bottom:0.75rem;"></div>' +
				'<div class="pi-skeleton" style="height:2.5rem;border-radius:0.5rem;margin-bottom:0.75rem;"></div>' +
				'<div class="pi-skeleton" style="height:2.5rem;border-radius:0.5rem;"></div>';
		}

		Promise.all([fetchPortalSettings(), fetchVocalCourses()]).then(function (results) {
			var settings = results[0];
			var courses = results[1];

			portalSettings = settings;

			if (!isApplicationOpen(settings)) {
				showClosed(settings);
				return;
			}

			// Store fetched courses in the SECTIONS options arrays so renderField uses them
			vokalCourses.length = 0;
			courses.forEach(function (c) {
				vokalCourses.push(c);
			});
			// Fallback: if no courses configured yet, show a generic message
			if (!vokalCourses.length) {
				vokalCourses.push("No courses available — contact the office");
			}

			showApplicationBanner(settings);
			showSection(0);
		});
	});
})();
