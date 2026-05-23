/* SkillsHub Public Portal — Student profile / enrolment data page */
(function () {
	"use strict";

	var state = { session: null, data: null, isSaving: false };

	var api =
		(window.SHGate && window.SHGate.api) ||
		function (path, opts) {
			return fetch(
				path,
				Object.assign(
					{
						credentials: "include",
						headers: {
							Accept: "application/json",
							"Content-Type": "application/json",
						},
					},
					opts || {}
				)
			)
				.then(function (r) {
					return r.json();
				})
				.then(function (r) {
					return r && r.message !== undefined ? r.message : r;
				});
		};

	var esc =
		(window.SHGate && window.SHGate.esc) ||
		function (v) {
			var d = document.createElement("div");
			d.textContent = String(v || "");
			return d.innerHTML;
		};

	var SKIP_TYPES = { "Column Break": 1, "Tab Break": 1, Fold: 1, HTML: 1, Button: 1 };

	function fmtDate(val) {
		if (!val) return "";
		try {
			return new Date(val).toLocaleDateString("en-GB");
		} catch (_e) {
			return String(val);
		}
	}

	/* Build section groups from flat field list */
	function buildSections(fields) {
		var sections = [];
		var cur = { label: null, fields: [] };
		fields.forEach(function (f) {
			if (f.hidden) return;
			if (SKIP_TYPES[f.fieldtype]) return;
			if (f.fieldtype === "Section Break") {
				if (cur.fields.length) sections.push(cur);
				cur = { label: f.label || null, fields: [] };
			} else {
				cur.fields.push(f);
			}
		});
		if (cur.fields.length) sections.push(cur);
		return sections;
	}

	/* Render a single editable field as HTML */
	function renderField(f, value, childTables) {
		var id = "pf-" + f.fieldname;
		var label =
			'<label class="pi-label" for="' +
			esc(id) +
			'">' +
			esc(f.label || f.fieldname) +
			(f.reqd ? ' <span style="color:var(--pi-red)">*</span>' : "") +
			"</label>";
		var desc = f.description
			? '<div style="font-size:0.75rem;color:var(--pi-muted);margin-top:0.2rem;">' +
			  esc(f.description) +
			  "</div>"
			: "";

		if (f.read_only) {
			var disp = value;
			if (f.fieldtype === "Date") disp = fmtDate(value);
			else if (f.fieldtype === "Check") disp = value ? "Yes" : "No";
			else if (Array.isArray(value))
				disp = value
					.map(function (r) {
						return Object.values(r || {}).join(" ");
					})
					.join(", ");
			return (
				'<div class="pi-field">' +
				label +
				'<div style="padding:0.55rem 0;font-size:0.9rem;color:var(--pi-black);">' +
				esc(disp || "—") +
				"</div>" +
				desc +
				"</div>"
			);
		}

		var input = "";
		if (
			f.fieldtype === "Small Text" ||
			f.fieldtype === "Text" ||
			f.fieldtype === "Long Text"
		) {
			input =
				'<textarea id="' +
				esc(id) +
				'" class="pi-input" data-fieldname="' +
				esc(f.fieldname) +
				'" rows="3" style="resize:vertical;">' +
				esc(value || "") +
				"</textarea>";
		} else if (f.fieldtype === "Select") {
			var opts = String(f.options || "")
				.split("\n")
				.filter(Boolean);
			input =
				'<select id="' +
				esc(id) +
				'" class="pi-input" data-fieldname="' +
				esc(f.fieldname) +
				'">';
			input += '<option value=""></option>';
			opts.forEach(function (o) {
				input +=
					'<option value="' +
					esc(o) +
					'"' +
					(o === value ? " selected" : "") +
					">" +
					esc(o) +
					"</option>";
			});
			input += "</select>";
		} else if (f.fieldtype === "Check") {
			input =
				'<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">' +
				'<input type="checkbox" id="' +
				esc(id) +
				'" data-fieldname="' +
				esc(f.fieldname) +
				'" data-fieldtype="Check"' +
				(value ? " checked" : "") +
				">" +
				'<span style="font-size:0.9rem;">' +
				esc(f.label || f.fieldname) +
				"</span></label>";
			/* checkbox already shows its own label — skip the outer label */
			return '<div class="pi-field">' + input + desc + "</div>";
		} else if (f.fieldtype === "Date") {
			var dateVal = value ? String(value).slice(0, 10) : "";
			input =
				'<input type="date" id="' +
				esc(id) +
				'" class="pi-input" data-fieldname="' +
				esc(f.fieldname) +
				'" value="' +
				esc(dateVal) +
				'">';
		} else if (
			f.fieldtype === "Int" ||
			f.fieldtype === "Float" ||
			f.fieldtype === "Currency" ||
			f.fieldtype === "Percent"
		) {
			input =
				'<input type="number" id="' +
				esc(id) +
				'" class="pi-input" data-fieldname="' +
				esc(f.fieldname) +
				'" value="' +
				esc(value || "") +
				'">';
		} else if (f.fieldtype === "Table") {
			var childMeta = childTables && childTables[f.fieldname];
			if (!childMeta || !childMeta.fields || !childMeta.fields.length) return "";
			var vf =
				childMeta.fields.find(function (cf) {
					return (
						cf.fieldtype === "Data" ||
						cf.fieldtype === "Select" ||
						cf.fieldtype === "Link"
					);
				}) || childMeta.fields[0];
			if (!vf) return "";
			var opts2 = String(vf.options || "")
				.split("\n")
				.filter(Boolean);
			var selected = Array.isArray(value)
				? value
						.map(function (r) {
							return r[vf.fieldname];
						})
						.filter(Boolean)
				: [];
			var chips = '<div class="pi-chip-options" id="' + esc(id) + '-chips">';
			opts2.forEach(function (o) {
				chips +=
					'<button type="button" class="pi-chip-opt' +
					(selected.indexOf(o) > -1 ? " selected" : "") +
					'" data-table-fn="' +
					esc(f.fieldname) +
					'" data-vfn="' +
					esc(vf.fieldname) +
					'" data-val="' +
					esc(o) +
					'">' +
					esc(o) +
					"</button>";
			});
			chips += "</div>";
			chips +=
				'<input type="hidden" id="' +
				esc(id) +
				'" data-fieldname="' +
				esc(f.fieldname) +
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
			return '<div class="pi-field pi-field-full">' + label + chips + desc + "</div>";
		} else {
			/* Data, Link, Phone, Email, etc. */
			input =
				'<input type="text" id="' +
				esc(id) +
				'" class="pi-input" data-fieldname="' +
				esc(f.fieldname) +
				'" value="' +
				esc(value || "") +
				'">';
		}

		return '<div class="pi-field">' + label + input + desc + "</div>";
	}

	function renderProfile(data) {
		var fields = data.fields || [];
		var student = data.student || {};
		var childTables = data.child_tables || {};
		var sections = buildSections(fields);

		/* Update page heading */
		var heading = document.getElementById("pi-profile-heading");
		if (heading && student.student_name) heading.textContent = student.student_name;

		var html = "";
		sections.forEach(function (sec) {
			if (!sec.fields.length) return;
			if (sec.label) {
				html +=
					'<h3 style="font-size:0.9rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--pi-muted);margin:1.5rem 0 0.75rem;padding-bottom:0.4rem;border-bottom:1px solid var(--pi-border);">' +
					esc(sec.label) +
					"</h3>";
			}
			html += '<div class="pi-form-grid">';
			sec.fields.forEach(function (f) {
				html += renderField(f, student[f.fieldname], childTables);
			});
			html += "</div>";
		});

		var body = document.getElementById("pi-profile-body");
		body.innerHTML = html;

		/* Wire up chip-option toggles */
		body.addEventListener("click", function (e) {
			var btn = e.target.closest(".pi-chip-opt[data-table-fn]");
			if (!btn) return;
			btn.classList.toggle("selected");
			var fn = btn.getAttribute("data-table-fn");
			var vfn = btn.getAttribute("data-vfn");
			var hidden = document.querySelector(
				'[data-fieldname="' + fn + '"][data-fieldtype="Table"]'
			);
			if (!hidden) return;
			var selected = Array.prototype.map.call(
				body.querySelectorAll('.pi-chip-opt[data-table-fn="' + fn + '"].selected'),
				function (b) {
					var r = {};
					r[vfn] = b.getAttribute("data-val");
					return r;
				}
			);
			hidden.value = JSON.stringify(selected);
		});

		document.getElementById("pi-profile-loading").style.display = "none";
		body.style.display = "";
		var actions = document.getElementById("pi-profile-actions");
		actions.style.display = "flex";
	}

	function gatherPayload() {
		var payload = {};
		document.querySelectorAll("#pi-profile-body [data-fieldname]").forEach(function (el) {
			var fn = el.getAttribute("data-fieldname");
			var ft = el.getAttribute("data-fieldtype");
			if (ft === "Table") {
				try {
					payload[fn] = JSON.parse(el.value);
				} catch (_e) {
					payload[fn] = [];
				}
			} else if (ft === "Check") {
				payload[fn] = el.checked ? 1 : 0;
			} else {
				payload[fn] = el.value;
			}
		});
		return payload;
	}

	function showMsg(msg, isError) {
		var el = document.getElementById("pi-profile-msg");
		if (!el) return;
		el.innerHTML = msg
			? '<div class="pi-alert ' +
			  (isError ? "pi-alert-error" : "pi-alert-success") +
			  '">' +
			  esc(msg) +
			  "</div>"
			: "";
	}

	function saveProfile() {
		if (!state.session || state.isSaving) return;
		state.isSaving = true;
		var btn = document.getElementById("pi-profile-save");
		if (btn) {
			btn.disabled = true;
			btn.textContent = "Saving…";
		}
		showMsg("", false);

		api("/api/method/skillshub_core.skillshub_portal.api.update_public_profile", {
			method: "POST",
			body: JSON.stringify({
				student_id: state.session.sid,
				token: state.session.token,
				payload: JSON.stringify(gatherPayload()),
			}),
		})
			.then(function () {
				showMsg("Profile saved successfully.", false);
			})
			.catch(function (err) {
				showMsg("Could not save: " + (err.message || "Unknown error"), true);
			})
			.finally(function () {
				state.isSaving = false;
				if (btn) {
					btn.disabled = false;
					btn.textContent = "Save Profile";
				}
			});
	}

	function loadProfile(session) {
		api(
			"/api/method/skillshub_core.skillshub_portal.api.get_public_profile" +
				"?student_id=" +
				encodeURIComponent(session.sid) +
				"&token=" +
				encodeURIComponent(session.token)
		)
			.then(function (data) {
				state.data = data;
				renderProfile(data);
			})
			.catch(function (err) {
				document.getElementById("pi-profile-loading").style.display = "none";
				showMsg("Could not load profile: " + (err.message || "Unknown error"), true);
			});
	}

	document.addEventListener("DOMContentLoaded", function () {
		var saveBtn = document.getElementById("pi-profile-save");
		if (saveBtn) saveBtn.addEventListener("click", saveProfile);
	});

	window.addEventListener("sh-gate-open", function (e) {
		state.session = e.detail;
		loadProfile(state.session);
	});
})();
