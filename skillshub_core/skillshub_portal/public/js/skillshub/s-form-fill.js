/* SkillsHub Public Portal — Individual form fill JS
 * Used by all /skillshub/s/<form-name>.html pages.
 * Reads data-doctype from <body>, uses s-gate.js for auth.
 */
(function () {
	"use strict";

	var state = { session: null, doctype: null, meta: null, ctx: null, linkCache: {} };

	var api =
		(window.SHGate && window.SHGate.api) ||
		function () {
			return Promise.reject(new Error("SHGate not loaded"));
		};
	var esc =
		(window.SHGate && window.SHGate.esc) ||
		function (v) {
			return String(v || "");
		};

	/* ---- Context helpers ---- */
	function enrolmentContext() {
		var e = state.ctx && state.ctx.enrolment;
		return {
			student: state.session && state.session.sid,
			schedule: e && (e["class"] || ""),
			enrolment_ticket: e && e.name,
			milestone: e && e.milestone,
			course: e && e.course,
			cohort: e && e.cohort,
			academic_year: e && e.academic_year,
			course_run: e && e.course_run,
		};
	}

	function contextDefault(fn) {
		var c = enrolmentContext();
		var ctx = {
			sh_student: c.student,
			student: c.student,
			programme_schedule: c.schedule,
			program_schedule: c.schedule,
			class: c.schedule,
			enrolment_ticket: c.enrolment_ticket,
			milestone: c.milestone,
			course: c.course,
			skillshub_course: c.course,
			cohort: c.cohort,
			skillshub_cohort: c.cohort,
			academic_year: c.academic_year,
			course_run: c.course_run,
		};
		return Object.prototype.hasOwnProperty.call(ctx, fn) ? ctx[fn] : null;
	}

	/* ---- Link options ---- */
	function fetchLinkOpts(doctype) {
		if (!doctype) return Promise.resolve([]);
		if (state.linkCache[doctype]) return Promise.resolve(state.linkCache[doctype]);
		return api(
			"/api/method/skillshub_core.skillshub_portal.api.get_public_link_options?doctype=" +
				encodeURIComponent(doctype)
		)
			.then(function (r) {
				state.linkCache[doctype] = r || [];
				return state.linkCache[doctype];
			})
			.catch(function () {
				return [];
			});
	}

	/* ---- Select options parser ---- */
	function parseOpts(options) {
		return String(options || "")
			.split("\n")
			.map(function (o) {
				return o.trim();
			})
			.filter(Boolean);
	}

	/* ---- Star rating ---- */
	function renderStars(fn, value, label, ro) {
		var val = parseInt(value) || 0;
		var html =
			'<div class="pi-field pi-field-full">' +
			'<label class="pi-label' +
			(ro ? "" : "") +
			'">' +
			esc(label) +
			"</label>";
		if (ro) {
			html += '<div class="pi-stars">';
			for (var i = 1; i <= 5; i++)
				html += '<span class="pi-star' + (i <= val ? " lit" : "") + '">★</span>';
			html += "</div>";
		} else {
			html += '<div class="pi-stars" data-fn="' + esc(fn) + '">';
			for (var j = 1; j <= 5; j++)
				html +=
					'<span class="pi-star' +
					(j <= val ? " lit" : "") +
					'" data-v="' +
					j +
					'">★</span>';
			html +=
				'</div><input type="hidden" data-fieldname="' +
				esc(fn) +
				'" data-fieldtype="Rating" value="' +
				val +
				'">' +
				'<span class="pi-star-label" id="fsl-' +
				esc(fn) +
				'">' +
				(val ? val + " / 5" : "Tap to rate") +
				"</span>";
		}
		return html + "</div>";
	}

	/* ---- Checkbox ---- */
	function renderCheck(fn, value, label, ro) {
		return (
			'<div class="pi-field pi-field-full"><label class="pi-check-wrap">' +
			'<input type="checkbox" data-fieldname="' +
			esc(fn) +
			'" data-fieldtype="Check" ' +
			(value ? "checked" : "") +
			(ro ? " disabled" : "") +
			">" +
			'<span class="pi-check-label">' +
			esc(label) +
			"</span>" +
			"</label></div>"
		);
	}

	/* ---- Table (chip multi-select) ---- */
	function renderTable(fn, childMeta, currentValue, label) {
		if (!childMeta || !childMeta.fields || !childMeta.fields.length)
			return Promise.resolve("");
		var vf =
			childMeta.fields.find(function (f) {
				return (
					f.fieldtype === "Link" || f.fieldtype === "Select" || f.fieldtype === "Data"
				);
			}) || childMeta.fields[0];
		if (!vf) return Promise.resolve("");
		var selected = Array.isArray(currentValue)
			? currentValue
					.map(function (r) {
						return r[vf.fieldname];
					})
					.filter(Boolean)
			: [];

		function getOpts() {
			if (vf.fieldtype === "Link") return fetchLinkOpts(vf.options);
			if (vf.fieldtype === "Select") return Promise.resolve(parseOpts(vf.options));
			return Promise.resolve([]);
		}

		return getOpts().then(function (opts) {
			if (!opts.length) return "";
			var html =
				'<div class="pi-field pi-field-full"><label class="pi-label">' +
				esc(label) +
				"</label>" +
				'<div class="pi-chip-options" id="fco-' +
				esc(fn) +
				'">';
			opts.forEach(function (o) {
				var isSel = selected.indexOf(o) > -1;
				html +=
					'<button type="button" class="pi-chip-opt' +
					(isSel ? " selected" : "") +
					'" data-fn="' +
					esc(fn) +
					'" data-vfn="' +
					esc(vf.fieldname) +
					'" data-val="' +
					esc(o) +
					'">' +
					esc(o) +
					"</button>";
			});
			html += "</div>";
			html +=
				'<input type="hidden" data-fieldname="' +
				esc(fn) +
				'" data-fieldtype="Table" data-vfn="' +
				esc(vf.fieldname) +
				'" value="' +
				esc(
					JSON.stringify(
						selected.map(function (s) {
							var r = {};
							r[vf.fieldname] = s;
							return r;
						})
					)
				) +
				'">';
			html += "</div>";
			return html;
		});
	}

	/* ---- Link combobox ---- */
	function renderLink(fn, value, doctype, label, ro) {
		if (ro) {
			return Promise.resolve(
				'<div class="pi-field"><label class="pi-label">' +
					esc(label) +
					"</label>" +
					'<input class="pi-input" type="text" value="' +
					esc(value) +
					'" readonly>' +
					"</div>"
			);
		}
		return fetchLinkOpts(doctype).then(function (opts) {
			var html =
				'<div class="pi-field"><label class="pi-label">' +
				esc(label) +
				"</label>" +
				'<div class="pi-link-wrap" data-fn="' +
				esc(fn) +
				'">' +
				'<input type="text" class="pi-input pi-link-search" placeholder="Search…" autocomplete="off" value="' +
				esc(value) +
				'">' +
				'<div class="pi-link-dropdown" id="ld-' +
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
				"</div></div>";
			return html;
		});
	}

	/* ---- Single field renderer ---- */
	function renderField(field, value, ro) {
		var fn = field.fieldname;
		var label = field.label || fn;
		var ft = field.fieldtype;
		var opts = field.options;
		var isRO = ro || field.read_only;
		var ctxVal = contextDefault(fn);
		var finalVal =
			ctxVal !== null && ctxVal !== undefined && ctxVal !== "" ? ctxVal : value || "";

		if (ft === "Rating") return Promise.resolve(renderStars(fn, finalVal, label, isRO));
		if (ft === "Check") return Promise.resolve(renderCheck(fn, finalVal, label, isRO));

		if (ft === "Small Text" || ft === "Text" || ft === "Long Text" || ft === "Text Editor") {
			return Promise.resolve(
				'<div class="pi-field pi-field-full"><label class="pi-label">' +
					esc(label) +
					"</label>" +
					'<textarea class="pi-textarea" data-fieldname="' +
					esc(fn) +
					'" data-fieldtype="' +
					esc(ft) +
					'"' +
					(isRO ? " disabled" : "") +
					">" +
					esc(finalVal) +
					"</textarea></div>"
			);
		}

		if (ft === "Select") {
			var selectOpts = parseOpts(opts);
			var sel =
				'<select class="pi-select" data-fieldname="' +
				esc(fn) +
				'" data-fieldtype="Select"' +
				(isRO ? " disabled" : "") +
				">" +
				'<option value=""></option>';
			selectOpts.forEach(function (o) {
				sel +=
					'<option value="' +
					esc(o) +
					'"' +
					(String(finalVal) === o ? " selected" : "") +
					">" +
					esc(o) +
					"</option>";
			});
			sel += "</select>";
			return Promise.resolve(
				'<div class="pi-field"><label class="pi-label">' +
					esc(label) +
					"</label>" +
					sel +
					"</div>"
			);
		}

		if (ft === "Date")
			return Promise.resolve(
				'<div class="pi-field"><label class="pi-label">' +
					esc(label) +
					'</label><input type="date" class="pi-input" data-fieldname="' +
					esc(fn) +
					'" data-fieldtype="Date" value="' +
					esc(finalVal) +
					'"' +
					(isRO ? " readonly" : "") +
					"></div>"
			);
		if (ft === "Datetime")
			return Promise.resolve(
				'<div class="pi-field"><label class="pi-label">' +
					esc(label) +
					'</label><input type="datetime-local" class="pi-input" data-fieldname="' +
					esc(fn) +
					'" data-fieldtype="Datetime" value="' +
					esc(String(finalVal).replace(" ", "T").slice(0, 16)) +
					'"' +
					(isRO ? " readonly" : "") +
					"></div>"
			);
		if (ft === "Phone")
			return Promise.resolve(
				'<div class="pi-field"><label class="pi-label">' +
					esc(label) +
					'</label><input type="tel" class="pi-input" data-fieldname="' +
					esc(fn) +
					'" data-fieldtype="Phone" value="' +
					esc(finalVal) +
					'"' +
					(isRO ? " readonly" : "") +
					"></div>"
			);
		if (ft === "Int" || ft === "Float" || ft === "Currency" || ft === "Percent")
			return Promise.resolve(
				'<div class="pi-field"><label class="pi-label">' +
					esc(label) +
					'</label><input type="number" class="pi-input" data-fieldname="' +
					esc(fn) +
					'" data-fieldtype="' +
					esc(ft) +
					'" value="' +
					esc(finalVal) +
					'"' +
					(isRO ? " readonly" : "") +
					"></div>"
			);

		if (ft === "Table") {
			var cm = state.meta && state.meta.child_tables && state.meta.child_tables[fn];
			return renderTable(fn, cm, finalVal, label);
		}

		if (ft === "Link") return renderLink(fn, finalVal, opts, label, isRO);

		if (ft === "Read Only" || ft === "Data") {
			return Promise.resolve(
				'<div class="pi-field"><label class="pi-label">' +
					esc(label) +
					"</label>" +
					'<input type="text" class="pi-input" data-fieldname="' +
					esc(fn) +
					'" data-fieldtype="' +
					esc(ft) +
					'" value="' +
					esc(finalVal) +
					'"' +
					(isRO ? " readonly" : "") +
					"></div>"
			);
		}

		return Promise.resolve(
			'<div class="pi-field"><label class="pi-label">' +
				esc(label) +
				"</label>" +
				'<input type="text" class="pi-input" data-fieldname="' +
				esc(fn) +
				'" data-fieldtype="Data" value="' +
				esc(finalVal) +
				'"' +
				(isRO ? " readonly" : "") +
				"></div>"
		);
	}

	/* ---- Render form body ---- */
	function renderForm() {
		var root = document.getElementById("pi-form-body");
		var ctx = enrolmentContext();
		var fields = (state.meta && state.meta.fields) || [];

		/* Context bar */
		var ctxBar = '<div class="pi-context-bar">';
		if (ctx.student)
			ctxBar +=
				'<span class="pi-context-item"><strong>Student:</strong> <span>' +
				esc(ctx.student) +
				"</span></span>";
		if (ctx.enrolment_ticket)
			ctxBar +=
				'<span class="pi-context-item"><strong>Enrolment:</strong> <span>' +
				esc(ctx.enrolment_ticket) +
				"</span></span>";
		if (ctx.schedule)
			ctxBar +=
				'<span class="pi-context-item"><strong>Class:</strong> <span>' +
				esc(ctx.schedule) +
				"</span></span>";
		if (ctx.course)
			ctxBar +=
				'<span class="pi-context-item"><strong>Course:</strong> <span>' +
				esc(ctx.course) +
				"</span></span>";
		ctxBar += "</div>";

		var promises = fields.map(function (field) {
			var fn = field.fieldname;
			if (!fn || field.hidden) return Promise.resolve("");
			if (
				[
					"name",
					"owner",
					"creation",
					"modified",
					"modified_by",
					"idx",
					"parent",
					"parentfield",
					"parenttype",
					"docstatus",
				].indexOf(fn) > -1
			)
				return Promise.resolve("");
			return renderField(field, null, false);
		});

		Promise.all(promises).then(function (parts) {
			var gridHtml =
				'<div class="pi-form-grid">' + parts.filter(Boolean).join("") + "</div>";
			root.innerHTML = ctxBar + gridHtml;
			bindFormInteractions(root);
		});
	}

	/* ---- Interactions (stars, chips, link dropdowns) ---- */
	function bindFormInteractions(root) {
		/* Stars */
		root.addEventListener("click", function (e) {
			var star = e.target.closest(".pi-star[data-v]");
			if (!star) return;
			var c = star.closest(".pi-stars[data-fn]");
			if (!c) return;
			var fn = c.getAttribute("data-fn");
			var val = parseInt(star.getAttribute("data-v"));
			c.querySelectorAll(".pi-star").forEach(function (s, i) {
				s.classList.toggle("lit", i + 1 <= val);
			});
			var h = root.querySelector(
				'input[data-fieldname="' + fn + '"][data-fieldtype="Rating"]'
			);
			if (h) h.value = val;
			var lbl = root.querySelector("#fsl-" + fn);
			if (lbl) lbl.textContent = val + " / 5";
		});

		/* Chip toggles */
		root.addEventListener("click", function (e) {
			var btn = e.target.closest(".pi-chip-opt");
			if (!btn) return;
			var fn = btn.getAttribute("data-fn");
			var vfn = btn.getAttribute("data-vfn");
			var val = btn.getAttribute("data-val");
			btn.classList.toggle("selected");
			updateTableHidden(root, fn, vfn);
		});

		/* Link combobox */
		root.addEventListener("input", function (e) {
			var inp = e.target.closest(".pi-link-search");
			if (!inp) return;
			var wrap = inp.closest(".pi-link-wrap");
			var fn = wrap && wrap.getAttribute("data-fn");
			var dd = fn && root.querySelector("#ld-" + fn);
			if (!dd) return;
			dd.hidden = false;
			var q = inp.value.toLowerCase();
			dd.querySelectorAll(".pi-link-option").forEach(function (opt) {
				opt.hidden = !opt.textContent.toLowerCase().includes(q);
			});
			var hv = wrap.querySelector(".pi-link-value");
			if (hv) hv.value = "";
		});

		root.addEventListener("click", function (e) {
			var opt = e.target.closest(".pi-link-option");
			if (!opt) return;
			var fn = opt.getAttribute("data-fn");
			var val = opt.getAttribute("data-val");
			var wrap = root.querySelector('.pi-link-wrap[data-fn="' + fn + '"]');
			if (!wrap) return;
			var inp = wrap.querySelector(".pi-link-search");
			var hv = wrap.querySelector(".pi-link-value");
			var dd = root.querySelector("#ld-" + fn);
			if (inp) inp.value = val;
			if (hv) hv.value = val;
			if (dd) dd.hidden = true;
		});

		document.addEventListener("click", function (e) {
			if (!e.target.closest(".pi-link-wrap")) {
				root.querySelectorAll(".pi-link-dropdown").forEach(function (d) {
					d.hidden = true;
				});
			}
		});
	}

	function updateTableHidden(root, fn, vfn) {
		var hidden = root.querySelector(
			'input[data-fieldname="' + fn + '"][data-fieldtype="Table"]'
		);
		if (!hidden) return;
		var rows = [];
		root.querySelectorAll('.pi-chip-opt.selected[data-fn="' + fn + '"]').forEach(function (
			btn
		) {
			var r = {};
			r[vfn] = btn.getAttribute("data-val");
			rows.push(r);
		});
		hidden.value = JSON.stringify(rows);
	}

	/* ---- Gather payload ---- */
	function gatherPayload() {
		var payload = {};
		document
			.querySelectorAll("#pi-form-body [data-fieldname][data-fieldtype]")
			.forEach(function (el) {
				var fn = el.getAttribute("data-fieldname");
				var ft = el.getAttribute("data-fieldtype");
				if (!fn) return;
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
				if (ft === "Int" || ft === "Float" || ft === "Currency" || ft === "Percent") {
					payload[fn] = el.value === "" ? null : Number(el.value);
					return;
				}
				if (ft === "Link" && el.classList.contains("pi-link-value")) {
					payload[fn] = el.value;
					return;
				}
				if (ft === "Link") return;
				if (el.disabled || el.readOnly) return;
				payload[fn] = el.value;
			});
		/* Merge in context (enrolment ticket etc.) */
		var ctx = enrolmentContext();
		Object.keys(ctx).forEach(function (k) {
			if (ctx[k] && !payload[k]) payload[k] = ctx[k];
		});
		return payload;
	}

	/* ---- Submit ---- */
	function submitForm() {
		var btn = document.getElementById("pi-form-submit");
		var msg = document.getElementById("pi-form-msg");
		if (btn) {
			btn.disabled = true;
			btn.textContent = "Submitting…";
		}
		if (msg) msg.innerHTML = "";

		var payload = gatherPayload();

		api("/api/method/skillshub_core.skillshub_portal.api.submit_public_form", {
			method: "POST",
			body: JSON.stringify({
				student_id: state.session.sid,
				token: state.session.token,
				doctype: state.doctype,
				values: payload,
			}),
		})
			.then(function (result) {
				window.SHGate && window.SHGate.clearSession();
				showSuccess(result.name);
			})
			.catch(function (err) {
				if (btn) {
					btn.disabled = false;
					btn.textContent = "Submit";
				}
				if (msg)
					msg.innerHTML =
						'<div class="pi-alert pi-alert-error"><span>⚠️</span><span>' +
						esc(err.message || "Submission failed.") +
						"</span></div>";
			});
	}

	/* ---- Success screen ---- */
	function showSuccess(refName) {
		var body = document.getElementById("pi-form-wrap");
		if (!body) return;
		var docLabel = document.body.getAttribute("data-title") || state.doctype;
		body.innerHTML =
			'<div class="pi-success-screen">' +
			'<div class="pi-success-icon">✅</div>' +
			'<h2 class="pi-success-title">Form Submitted!</h2>' +
			'<p class="pi-success-sub">' +
			esc(docLabel) +
			" has been recorded.<br>Reference: <strong>" +
			esc(refName) +
			"</strong></p>" +
			'<div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;">' +
			'<a href="/skillshub/s/" class="pi-btn pi-btn-secondary">← Back to Portal</a>' +
			'<a href="/skillshub/s/forms" class="pi-btn pi-btn-primary">Submit Another Form</a>' +
			"</div>" +
			"</div>";
	}

	/* ---- Load everything ---- */
	function loadForm() {
		var root = document.getElementById("pi-form-body");
		if (root)
			root.innerHTML =
				'<div style="text-align:center;padding:2rem;color:var(--pi-muted);">Loading form…</div>';

		Promise.all([
			api(
				"/api/method/skillshub_core.skillshub_portal.api.get_public_form_meta?doctype=" +
					encodeURIComponent(state.doctype)
			),
			api(
				"/api/method/skillshub_core.skillshub_portal.api.get_public_forms_context?student_id=" +
					encodeURIComponent(state.session.sid) +
					"&token=" +
					encodeURIComponent(state.session.token)
			),
		])
			.then(function (results) {
				state.meta = results[0];
				state.ctx = results[1];

				/* Check if once-only and already submitted */
				var forms = (state.ctx && state.ctx.forms) || [];
				var thisForm = forms.find(function (f) {
					return f.doctype === state.doctype;
				});
				if (thisForm && !thisForm.can_submit) {
					var root2 = document.getElementById("pi-form-wrap");
					if (root2)
						root2.innerHTML =
							'<div class="pi-alert pi-alert-info" style="margin:2rem auto;max-width:600px;">' +
							"<span>ℹ️</span><span>You have already submitted this form for your current enrolment. " +
							'<a href="/skillshub/s/forms" class="pi-text-red" style="font-weight:700;">View all forms →</a></span>' +
							"</div>";
					return;
				}

				renderForm();
			})
			.catch(function (err) {
				if (err.message && err.message.includes("expired")) {
					window.SHGate && window.SHGate.clearSession();
					location.reload();
					return;
				}
				if (root)
					root.innerHTML =
						'<div class="pi-alert pi-alert-error">' + esc(err.message) + "</div>";
			});
	}

	document.addEventListener("DOMContentLoaded", function () {
		state.doctype = document.body.getAttribute("data-doctype");
		var submitBtn = document.getElementById("pi-form-submit");
		if (submitBtn) submitBtn.addEventListener("click", submitForm);
	});

	window.addEventListener("sh-gate-open", function (e) {
		state.session = e.detail;
		loadForm();
	});
})();
