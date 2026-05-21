/* SkillsHub Public Portal — Profile page JS */
(function () {
	"use strict";

	var state = { session: null, profile: null, linkCache: {}, dirty: false };

	var SECTIONS = [
		{
			id: "personal",
			title: "Personal Details",
			icon: "👤",
			fields: [
				"first_name",
				"middle_name",
				"last_name",
				"student_image",
				"date_of_birth",
				"gender",
				"nationality",
				"religion",
				"nrc_number",
				"airtel_money_name",
				"english_language_proficiency",
			],
		},
		{
			id: "contact",
			title: "Contact & Address",
			icon: "📍",
			fields: [
				"mobile",
				"personal_email",
				"address_line_1",
				"address_line_2",
				"city",
				"stateprovince",
				"pincode",
				"country",
			],
		},
		{
			id: "family",
			title: "Family & Guardian",
			icon: "👨‍👩‍👧",
			fields: [
				"parents_marital_status",
				"number_of_siblings",
				"guardian_name",
				"guardian_email",
				"guardian_mobile_number",
				"guardian_date_of_birth",
				"guardian_occupation",
				"guardian_address",
				"relationship",
			],
		},
		{
			id: "education",
			title: "Education & Background",
			icon: "📚",
			fields: [
				"date_submitted_enrolment_form",
				"can_read_and_write",
				"last_school_attended",
				"last_year_of_schooling",
				"highest_level_of_schooling",
				"students_occupation",
				"highest_salary_in_zmw",
				"household_income",
				"household_receives_financial_aid",
				"housing_status",
				"has_vocational_training_history",
				"vocational_training_received",
				"has_volunteering_history",
				"details_of_volunteering",
			],
		},
		{
			id: "health",
			title: "Health & Wellbeing",
			icon: "❤️",
			fields: ["has_history_of_medical_conditions", "details_of_medical_conditions"],
		},
		{
			id: "growth",
			title: "Motivations & Resilience",
			icon: "🌱",
			fields: ["motivations", "resilience_links"],
		},
		{
			id: "programme",
			title: "Programme Information",
			icon: "🎓",
			readOnly: true,
			fields: [
				"pestalozzi_student_id",
				"pestalozzi_student_email",
				"status",
				"programme_path",
				"intake_year",
				"intake_cohort",
				"current_schedule",
				"current_course",
				"current_milestone",
				"enrolment_date",
				"graduation_completion_date",
				"graduated",
				"student_name",
			],
		},
		{
			id: "work",
			title: "Work & Employment",
			icon: "💼",
			fields: [
				"emp_institution",
				"emp_niche",
				"emp_address",
				"emp_employer_type",
				"emp_occupation",
				"emp_role",
				"emp_currency",
				"emp_salary",
				"emp_income_level",
				"emp_start_date",
				"emp_end_date",
				"emp_is_current",
				"emp_notes",
			],
		},
		{
			id: "attachment",
			title: "Attachment / Placement",
			icon: "🔗",
			fields: [
				"attachment_institution",
				"attachment_institution_niche",
				"attachment_institution_address",
				"course_at_time_of_attachment",
				"start_date",
				"end_date",
				"attachment_completed",
			],
		},
	];

	/* Full-width fields (don't go in 2-col grid) */
	var FULL_WIDTH = [
		"student_image",
		"motivations",
		"resilience_links",
		"vocational_training_received",
		"details_of_volunteering",
		"details_of_medical_conditions",
		"emp_notes",
		"guardian_address",
		"attachment_institution_address",
		"details_of_medical_conditions",
	];

	var api =
		(window.SHGate && window.SHGate.api) ||
		function () {
			return Promise.reject(new Error("SHGate not loaded"));
		};

	/* ---- depends_on evaluation ---- */
	function evalDependsOn(expr, doc) {
		if (!expr) return true;
		try {
			if (expr.indexOf("eval:") === 0) {
				return !!new Function("doc", "return (" + expr.slice(5) + ")")(doc); // eslint-disable-line no-new-func
			}
			return !!doc[expr];
		} catch (_e) {
			return true;
		}
	}

	function gatherCurrentDoc() {
		var doc =
			state.profile && state.profile.student ? Object.assign({}, state.profile.student) : {};
		document
			.querySelectorAll("#pi-profile-body [data-fieldname][data-fieldtype]")
			.forEach(function (el) {
				var fn = el.getAttribute("data-fieldname");
				var ft = el.getAttribute("data-fieldtype");
				if (!fn) return;
				if (ft === "Check") {
					doc[fn] = el.checked;
					return;
				}
				if (ft === "Rating" && el.type === "hidden") {
					doc[fn] = el.value ? Number(el.value) : null;
					return;
				}
				if (ft === "Link" && el.classList.contains("pi-link-value")) {
					doc[fn] = el.value;
					return;
				}
				if (ft === "Link" || ft === "Table") return;
				doc[fn] = el.value;
			});
		return doc;
	}

	function applyDependsOn(root) {
		if (!state.profile || !state.profile.fields) return;
		var doc = gatherCurrentDoc();
		state.profile.fields.forEach(function (field) {
			if (!field.depends_on) return;
			var el = root.querySelector('[data-fieldname="' + field.fieldname + '"]');
			if (!el) return;
			var wrapper = el.closest(".pi-field");
			if (!wrapper) return;
			wrapper.style.display = evalDependsOn(field.depends_on, doc) ? "" : "none";
		});
	}
	var esc =
		(window.SHGate && window.SHGate.esc) ||
		function (v) {
			return String(v || "");
		};

	/* ---- Field meta lookup ---- */
	function fieldMeta(fn) {
		return (
			((state.profile && state.profile.fields) || []).find(function (f) {
				return f.fieldname === fn;
			}) || null
		);
	}

	function isReadOnly(fn, sectionRO) {
		if (sectionRO) return true;
		var m = fieldMeta(fn);
		return m ? !!m.read_only : false;
	}

	/* ---- Link options (cached) ---- */
	function fetchLinkOptions(doctype) {
		if (!doctype) return Promise.resolve([]);
		if (state.linkCache[doctype]) return Promise.resolve(state.linkCache[doctype]);
		return api(
			"/api/method/skillshub_core.skillshub_portal.api.get_public_link_options?doctype=" +
				encodeURIComponent(doctype)
		)
			.then(function (rows) {
				state.linkCache[doctype] = rows || [];
				return state.linkCache[doctype];
			})
			.catch(function () {
				return [];
			});
	}

	/* ---- Render helpers ---- */
	function renderStars(fn, value) {
		var val = parseInt(value) || 0;
		var html =
			'<div class="pi-field pi-field-full"><label class="pi-label">' +
			esc((fieldMeta(fn) && fieldMeta(fn).label) || fn) +
			"</label>" +
			'<div class="pi-stars" data-fn="' +
			esc(fn) +
			'">';
		for (var i = 1; i <= 5; i++) {
			html +=
				'<span class="pi-star' +
				(i <= val ? " lit" : "") +
				'" data-v="' +
				i +
				'">★</span>';
		}
		html += "</div>";
		html +=
			'<input type="hidden" data-fieldname="' +
			esc(fn) +
			'" data-fieldtype="Rating" value="' +
			val +
			'">';
		html +=
			'<span class="pi-star-label" id="pi-star-label-' +
			esc(fn) +
			'">' +
			(val ? val + " / 5" : "Not rated") +
			"</span>";
		html += "</div>";
		return html;
	}

	function renderCheckbox(fn, value, label) {
		var checked = value ? "checked" : "";
		return (
			'<div class="pi-field pi-field-full">' +
			'<label class="pi-check-wrap">' +
			'<input type="checkbox" data-fieldname="' +
			esc(fn) +
			'" data-fieldtype="Check" ' +
			checked +
			">" +
			'<span class="pi-check-label">' +
			esc(label || fn) +
			"</span>" +
			"</label>" +
			"</div>"
		);
	}

	function renderTextarea(fn, value, label, ro) {
		return (
			'<div class="pi-field pi-field-full">' +
			'<label class="pi-label">' +
			esc(label) +
			"</label>" +
			'<textarea class="pi-textarea" data-fieldname="' +
			esc(fn) +
			'" data-fieldtype="Small Text"' +
			(ro ? " disabled" : "") +
			">" +
			esc(value) +
			"</textarea>" +
			"</div>"
		);
	}

	function renderSelect(fn, value, options, label, ro) {
		var opts =
			typeof options === "string"
				? options
						.split("\n")
						.map(function (o) {
							return o.trim();
						})
						.filter(Boolean)
				: options || [];
		var html =
			'<select class="pi-select" data-fieldname="' +
			esc(fn) +
			'" data-fieldtype="Select"' +
			(ro ? " disabled" : "") +
			">" +
			'<option value=""></option>';
		opts.forEach(function (o) {
			html +=
				'<option value="' +
				esc(o) +
				'"' +
				(String(value || "") === o ? " selected" : "") +
				">" +
				esc(o) +
				"</option>";
		});
		html += "</select>";
		return (
			'<div class="pi-field"><label class="pi-label">' +
			esc(label) +
			"</label>" +
			html +
			"</div>"
		);
	}

	function renderInput(fn, value, label, type, ro) {
		type = type || "text";
		return (
			'<div class="pi-field">' +
			'<label class="pi-label">' +
			esc(label) +
			"</label>" +
			'<input type="' +
			type +
			'" class="pi-input" data-fieldname="' +
			esc(fn) +
			'" data-fieldtype="Data" value="' +
			esc(value) +
			'"' +
			(ro ? " readonly" : "") +
			">" +
			"</div>"
		);
	}

	/* ---- Table (chip) renderer ---- */
	function renderChipField(fn, value, childMeta) {
		if (!childMeta || !childMeta.fields || !childMeta.fields.length)
			return Promise.resolve("");
		var valueField =
			childMeta.fields.find(function (f) {
				return (
					f.fieldtype === "Link" || f.fieldtype === "Select" || f.fieldtype === "Data"
				);
			}) || childMeta.fields[0];
		if (!valueField) return Promise.resolve("");
		var vfn = valueField.fieldname;
		var selected = Array.isArray(value)
			? value
					.map(function (r) {
						return r[vfn];
					})
					.filter(Boolean)
			: [];
		var label = (fieldMeta(fn) && fieldMeta(fn).label) || fn;

		function getOptions() {
			if (valueField.fieldtype === "Link") return fetchLinkOptions(valueField.options);
			if (valueField.fieldtype === "Select") {
				var opts = (valueField.options || "")
					.split("\n")
					.map(function (o) {
						return o.trim();
					})
					.filter(Boolean);
				return Promise.resolve(opts);
			}
			return Promise.resolve([]);
		}

		return getOptions().then(function (options) {
			var chipsHtml = '<div class="pi-chips" id="pi-chips-' + esc(fn) + '">';
			selected.forEach(function (s) {
				chipsHtml +=
					'<span class="pi-chip" data-val="' +
					esc(s) +
					'">' +
					esc(s) +
					'<button type="button" class="pi-chip-remove" data-fn="' +
					esc(fn) +
					'" data-vfn="' +
					esc(vfn) +
					'" data-val="' +
					esc(s) +
					'">×</button></span>';
			});
			chipsHtml += "</div>";

			var optsHtml = '<div class="pi-chip-options" id="pi-chip-opts-' + esc(fn) + '">';
			options.forEach(function (o) {
				var isSel = selected.indexOf(o) > -1;
				optsHtml +=
					'<button type="button" class="pi-chip-opt' +
					(isSel ? " selected" : "") +
					'" data-fn="' +
					esc(fn) +
					'" data-vfn="' +
					esc(vfn) +
					'" data-val="' +
					esc(o) +
					'">' +
					esc(o) +
					"</button>";
			});
			optsHtml += "</div>";

			/* Hidden JSON holder for gather */
			var jsonHidden =
				'<input type="hidden" data-fieldname="' +
				esc(fn) +
				'" data-fieldtype="Table" data-vfn="' +
				esc(vfn) +
				'" value="' +
				esc(
					JSON.stringify(
						selected.map(function (s) {
							var r = {};
							r[vfn] = s;
							return r;
						})
					)
				) +
				'">';

			return (
				'<div class="pi-field pi-field-full">' +
				'<label class="pi-label">' +
				esc(label) +
				"</label>" +
				chipsHtml +
				optsHtml +
				jsonHidden +
				"</div>"
			);
		});
	}

	/* ---- Link combobox ---- */
	function renderLinkCombobox(fn, value, doctype, label, ro) {
		if (ro) {
			return Promise.resolve(renderInput(fn, value, label, "text", true));
		}
		return fetchLinkOptions(doctype).then(function (opts) {
			var html =
				'<div class="pi-field">' +
				'<label class="pi-label">' +
				esc(label) +
				"</label>" +
				'<div class="pi-link-wrap" data-fn="' +
				esc(fn) +
				'">' +
				'<input type="text" class="pi-input pi-link-search" placeholder="Search…" autocomplete="off" value="' +
				esc(value) +
				'" data-doctype="' +
				esc(doctype) +
				'">' +
				'<div class="pi-link-dropdown" id="pi-ld-' +
				esc(fn) +
				'" hidden>' +
				opts
					.map(function (o) {
						return (
							'<div class="pi-link-option" data-fn="' +
							esc(fn) +
							'" data-val="' +
							esc(o) +
							'">' +
							esc(o) +
							"</div>"
						);
					})
					.join("") +
				"</div>" +
				'<input type="hidden" class="pi-link-value" data-fieldname="' +
				esc(fn) +
				'" data-fieldtype="Link" value="' +
				esc(value) +
				'">' +
				"</div>" +
				"</div>";
			return html;
		});
	}

	/* ---- Build one section ---- */
	function renderSection(section, student, childTables) {
		var promises = section.fields.map(function (fn) {
			var m = fieldMeta(fn);
			if (!m) return Promise.resolve("");
			var value = student[fn];
			var label = m.label || fn;
			var ro = isReadOnly(fn, section.readOnly);
			var ft = m.fieldtype;

			if (ft === "Rating") return Promise.resolve(renderStars(fn, value));
			if (ft === "Check") return Promise.resolve(renderCheckbox(fn, value, label));
			if (ft === "Small Text" || ft === "Text" || ft === "Long Text" || ft === "Text Editor")
				return Promise.resolve(renderTextarea(fn, value, label, ro));
			if (ft === "Select")
				return Promise.resolve(renderSelect(fn, value, m.options, label, ro));
			if (ft === "Date") return Promise.resolve(renderInput(fn, value, label, "date", ro));
			if (ft === "Int" || ft === "Float" || ft === "Currency")
				return Promise.resolve(renderInput(fn, value, label, "number", ro));
			if (ft === "Phone") return Promise.resolve(renderInput(fn, value, label, "tel", ro));
			if (ft === "Table") {
				var childMeta = childTables && childTables[fn];
				return renderChipField(fn, value, childMeta);
			}
			if (ft === "Link") return renderLinkCombobox(fn, value, m.options, label, ro);
			if (ft === "Attach Image") {
				var imgHtml =
					'<div class="pi-field pi-field-full"><label class="pi-label">' +
					esc(label) +
					"</label>";
				if (value) {
					imgHtml +=
						'<img src="' +
						esc(value) +
						'" style="max-width:120px;max-height:120px;border-radius:0.5rem;border:1px solid var(--pi-border);margin-bottom:0.4rem;display:block;">';
				}
				imgHtml +=
					'<span class="pi-text-xs pi-text-muted">Contact your programme administrator to update your photo.</span></div>';
				return Promise.resolve(imgHtml);
			}
			return Promise.resolve(renderInput(fn, value, label, "text", ro));
		});

		return Promise.all(promises).then(function (parts) {
			var content = parts.filter(Boolean);
			if (!content.length) return "";
			var gridHtml = '<div class="pi-form-grid">';
			content.forEach(function (c) {
				gridHtml += c;
			});
			gridHtml += "</div>";
			return (
				'<div class="pi-card" id="pi-sec-' +
				esc(section.id) +
				'" style="margin-bottom:1.25rem;">' +
				'<div class="pi-card-header">' +
				'<div class="pi-card-icon">' +
				section.icon +
				"</div>" +
				'<div><div class="pi-card-title">' +
				esc(section.title) +
				"</div>" +
				(section.readOnly
					? '<div class="pi-card-sub">Read-only — managed by programme staff</div>'
					: "") +
				"</div>" +
				"</div>" +
				gridHtml +
				"</div>"
			);
		});
	}

	/* ---- Render full profile ---- */
	function renderProfile() {
		var student = state.profile.student;
		var childTbls = state.profile.child_tables || {};
		var root = document.getElementById("pi-profile-body");
		if (!root) return;
		root.innerHTML =
			'<div class="pi-skeleton" style="height:3rem;border-radius:0.75rem;margin-bottom:1rem;"></div>'.repeat(
				4
			);

		var sectionPromises = SECTIONS.map(function (s) {
			return renderSection(s, student, childTbls);
		});

		Promise.all(sectionPromises).then(function (parts) {
			root.innerHTML = parts.filter(Boolean).join("");
			bindInteractions(root);
			applyDependsOn(root);
			updateSaveBar();
		});
	}

	/* ---- Interactions ---- */
	function bindInteractions(root) {
		/* Star rating */
		root.addEventListener("click", function (e) {
			var star = e.target.closest(".pi-star");
			if (!star) return;
			var container = star.closest(".pi-stars");
			if (!container) return;
			var fn = container.getAttribute("data-fn");
			var val = parseInt(star.getAttribute("data-v"));
			container.querySelectorAll(".pi-star").forEach(function (s, i) {
				s.classList.toggle("lit", i + 1 <= val);
			});
			var hidden = document.querySelector(
				'input[data-fieldname="' + fn + '"][data-fieldtype="Rating"]'
			);
			if (hidden) hidden.value = val;
			var lbl = document.getElementById("pi-star-label-" + fn);
			if (lbl) lbl.textContent = val + " / 5";
			markDirty();
		});

		/* Chip remove */
		root.addEventListener("click", function (e) {
			var btn = e.target.closest(".pi-chip-remove");
			if (!btn) return;
			var fn = btn.getAttribute("data-fn");
			var vfn = btn.getAttribute("data-vfn");
			var val = btn.getAttribute("data-val");
			var chip = btn.closest(".pi-chip");
			if (chip) chip.remove();
			var optBtn = root.querySelector(
				'.pi-chip-opt[data-fn="' + fn + '"][data-val="' + val + '"]'
			);
			if (optBtn) optBtn.classList.remove("selected");
			updateTableHidden(root, fn, vfn);
			markDirty();
		});

		/* Chip option toggle */
		root.addEventListener("click", function (e) {
			var btn = e.target.closest(".pi-chip-opt");
			if (!btn) return;
			var fn = btn.getAttribute("data-fn");
			var vfn = btn.getAttribute("data-vfn");
			var val = btn.getAttribute("data-val");
			var chipsEl = root.querySelector("#pi-chips-" + fn);
			if (btn.classList.contains("selected")) {
				btn.classList.remove("selected");
				var chip = chipsEl && chipsEl.querySelector('.pi-chip[data-val="' + val + '"]');
				if (chip) chip.remove();
			} else {
				btn.classList.add("selected");
				if (chipsEl) {
					var newChip = document.createElement("span");
					newChip.className = "pi-chip";
					newChip.setAttribute("data-val", val);
					newChip.innerHTML =
						esc(val) +
						'<button type="button" class="pi-chip-remove" data-fn="' +
						fn +
						'" data-vfn="' +
						vfn +
						'" data-val="' +
						esc(val) +
						'">×</button>';
					chipsEl.appendChild(newChip);
				}
			}
			updateTableHidden(root, fn, vfn);
			markDirty();
		});

		/* Link combobox */
		root.addEventListener("input", function (e) {
			var input = e.target.closest(".pi-link-search");
			if (!input) return;
			var wrap = input.closest(".pi-link-wrap");
			if (!wrap) return;
			var fn = wrap.getAttribute("data-fn");
			var dropdown = document.getElementById("pi-ld-" + fn);
			var q = input.value.toLowerCase();
			if (dropdown) {
				dropdown.hidden = false;
				dropdown.querySelectorAll(".pi-link-option").forEach(function (opt) {
					opt.hidden = !opt.textContent.toLowerCase().includes(q);
				});
			}
			/* clear the hidden value while typing */
			var hidden = wrap.querySelector(".pi-link-value");
			if (hidden) hidden.value = "";
			markDirty();
		});

		root.addEventListener("click", function (e) {
			var opt = e.target.closest(".pi-link-option");
			if (!opt) return;
			var fn = opt.getAttribute("data-fn");
			var val = opt.getAttribute("data-val");
			var wrap = root.querySelector('.pi-link-wrap[data-fn="' + fn + '"]');
			if (!wrap) return;
			var search = wrap.querySelector(".pi-link-search");
			var hidden = wrap.querySelector(".pi-link-value");
			var dropdown = document.getElementById("pi-ld-" + fn);
			if (search) search.value = val;
			if (hidden) hidden.value = val;
			if (dropdown) dropdown.hidden = true;
			markDirty();
			applyDependsOn(root);
		});

		/* Close dropdowns on outside click */
		document.addEventListener("click", function (e) {
			if (!e.target.closest(".pi-link-wrap")) {
				root.querySelectorAll(".pi-link-dropdown").forEach(function (d) {
					d.hidden = true;
				});
			}
		});

		/* Any plain input change */
		root.addEventListener("change", function (e) {
			if (e.target.matches(".pi-input, .pi-select, .pi-textarea")) markDirty();
			applyDependsOn(root);
		});
	}

	function updateTableHidden(root, fn, vfn) {
		var chipsEl = root.querySelector("#pi-chips-" + fn);
		var hidden = root.querySelector(
			'input[data-fieldname="' + fn + '"][data-fieldtype="Table"]'
		);
		if (!chipsEl || !hidden) return;
		var rows = [];
		chipsEl.querySelectorAll(".pi-chip[data-val]").forEach(function (chip) {
			var r = {};
			r[vfn] = chip.getAttribute("data-val");
			rows.push(r);
		});
		hidden.value = JSON.stringify(rows);
	}

	/* ---- Dirty state ---- */
	function markDirty() {
		state.dirty = true;
		updateSaveBar();
	}

	function updateSaveBar() {
		var bar = document.getElementById("pi-save-bar");
		if (bar) bar.style.display = state.dirty ? "flex" : "none";
	}

	/* ---- Gather payload ---- */
	function gatherPayload() {
		var payload = {};
		document
			.querySelectorAll("#pi-profile-body [data-fieldname][data-fieldtype]")
			.forEach(function (el) {
				var fn = el.getAttribute("data-fieldname");
				var ft = el.getAttribute("data-fieldtype");
				if (!fn || el.disabled || el.readOnly) return;
				if (el.tagName === "INPUT" && el.type === "hidden" && ft === "Table") {
					try {
						payload[fn] = JSON.parse(el.value || "[]");
					} catch (e) {
						payload[fn] = [];
					}
					return;
				}
				if (ft === "Check") {
					payload[fn] = el.checked ? 1 : 0;
					return;
				}
				if (ft === "Rating") {
					payload[fn] = el.value === "" ? null : Number(el.value);
					return;
				}
				if (ft === "Int" || ft === "Float" || ft === "Currency") {
					payload[fn] = el.value === "" ? null : Number(el.value);
					return;
				}
				if (ft === "Link" && el.classList.contains("pi-link-value")) {
					payload[fn] = el.value;
					return;
				}
				if (ft === "Link") return; /* skip search input */
				payload[fn] = el.value;
			});
		return payload;
	}

	/* ---- Save ---- */
	function saveProfile() {
		var btn = document.getElementById("pi-save-btn");
		var msg = document.getElementById("pi-save-msg");
		if (btn) {
			btn.disabled = true;
			btn.textContent = "Saving…";
		}
		if (msg) msg.innerHTML = "";

		var payload = gatherPayload();
		api("/api/method/skillshub_core.skillshub_portal.api.update_public_profile", {
			method: "POST",
			body: JSON.stringify({
				student_id: state.session.sid,
				token: state.session.token,
				payload: payload,
			}),
		})
			.then(function () {
				if (btn) {
					btn.disabled = false;
					btn.textContent = "Save Profile";
				}
				if (msg)
					msg.innerHTML =
						'<span class="pi-text-sm" style="color:#166534;font-weight:600;">✓ Saved successfully</span>';
				state.dirty = false;
				updateSaveBar();
				setTimeout(function () {
					if (msg) msg.innerHTML = "";
				}, 3000);
			})
			.catch(function (err) {
				if (btn) {
					btn.disabled = false;
					btn.textContent = "Save Profile";
				}
				if (msg)
					msg.innerHTML =
						'<span class="pi-text-sm pi-text-red">' +
						esc(err.message || "Save failed") +
						"</span>";
			});
	}

	/* ---- Load profile ---- */
	function loadProfile() {
		var root = document.getElementById("pi-profile-body");
		if (root)
			root.innerHTML =
				'<div style="padding:2rem;text-align:center;color:var(--pi-muted);">Loading your profile…</div>';

		api(
			"/api/method/skillshub_core.skillshub_portal.api.get_public_profile?student_id=" +
				encodeURIComponent(state.session.sid) +
				"&token=" +
				encodeURIComponent(state.session.token)
		)
			.then(function (result) {
				state.profile = result;
				/* Update header name */
				var nameEl = document.getElementById("pi-student-name");
				if (nameEl)
					nameEl.textContent = result.student.student_name || result.student.name;
				var idEl = document.getElementById("pi-student-id");
				if (idEl) idEl.textContent = result.student.name;
				renderProfile();
			})
			.catch(function (err) {
				if (err.message && err.message.includes("expired")) {
					window.SHGate && window.SHGate.clearSession();
					location.reload();
					return;
				}
				if (root)
					root.innerHTML =
						'<div class="pi-alert pi-alert-error">' +
						esc(err.message || "Failed to load profile.") +
						"</div>";
			});
	}

	/* ---- Init ---- */
	document.addEventListener("DOMContentLoaded", function () {
		var saveBtn = document.getElementById("pi-save-btn");
		if (saveBtn) saveBtn.addEventListener("click", saveProfile);
		updateSaveBar();
	});

	window.addEventListener("sh-gate-open", function (e) {
		state.session = e.detail;
		loadProfile();
	});
})();
