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

	var SKIP_TYPES = {
		"Column Break": 1,
		"Tab Break": 1,
		Fold: 1,
		HTML: 1,
		Button: 1,
		Attach: 1,
	};

	function fmtDate(val) {
		if (!val) return "";
		try {
			return new Date(val).toLocaleDateString("en-GB");
		} catch (_e) {
			return String(val);
		}
	}

	/* ---- depends_on evaluation ---- */
	function evalDependsOn(expr, doc) {
		if (!expr) return true;
		try {
			if (expr.indexOf("eval:") === 0) {
				// eslint-disable-next-line no-new-func
				return !!new Function("doc", "return (" + expr.slice(5) + ")")(doc);
			}
			return !!doc[expr];
		} catch (_e) {
			return true;
		}
	}

	function gatherCurrentDoc(body) {
		var doc = {};
		body.querySelectorAll("[data-fieldname]").forEach(function (el) {
			var fn = el.getAttribute("data-fieldname");
			if (el.classList.contains("pi-link-search")) return;
			var ft = el.getAttribute("data-fieldtype");
			if (ft === "Check") {
				doc[fn] = el.checked ? 1 : 0;
			} else if (ft === "Table") {
				try {
					doc[fn] = JSON.parse(el.value);
				} catch (_e) {
					doc[fn] = [];
				}
			} else {
				doc[fn] = el.value || "";
			}
		});
		return doc;
	}

	function applyDependsOn(body) {
		var doc = gatherCurrentDoc(body);
		body.querySelectorAll("[data-depends-on]").forEach(function (wrap) {
			var expr = wrap.getAttribute("data-depends-on");
			wrap.style.display = evalDependsOn(expr, doc) ? "" : "none";
		});
	}

	/* ---- Link options cache ---- */
	var linkCache = {};
	function fetchLinkOpts(doctype) {
		if (!doctype) return Promise.resolve([]);
		if (linkCache[doctype]) return Promise.resolve(linkCache[doctype]);
		return api(
			"/api/method/skillshub_core.skillshub_portal.api.get_public_link_options?doctype=" +
				encodeURIComponent(doctype)
		)
			.then(function (r) {
				linkCache[doctype] = r || [];
				return linkCache[doctype];
			})
			.catch(function () {
				linkCache[doctype] = [];
				return [];
			});
	}

	/* ---- Section grouping ---- */
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

	/* ---- Star rating (read-only display) ---- */
	function renderStars(fn, value, label, ro) {
		var val = parseInt(value) || 0;
		var html =
			'<div class="pi-field pi-field-full"><label class="pi-label">' +
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

	/* ---- Link combobox (sync, uses pre-fetched opts) ---- */
	function renderLink(fn, value, opts, label, ro) {
		if (ro) {
			return (
				'<div class="pi-field"><label class="pi-label">' +
				esc(label) +
				"</label>" +
				'<div style="padding:0.55rem 0;font-size:0.9rem;color:var(--pi-black);">' +
				esc(value || "—") +
				"</div></div>"
			);
		}
		var dd = opts
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
			.join("");
		return (
			'<div class="pi-field"><label class="pi-label">' +
			esc(label) +
			"</label>" +
			'<div class="pi-link-wrap" data-fn="' +
			esc(fn) +
			'">' +
			'<input type="text" class="pi-input pi-link-search" placeholder="Search…" autocomplete="off" value="' +
			esc(value || "") +
			'">' +
			'<div class="pi-link-dropdown" id="ld-' +
			esc(fn) +
			'" hidden>' +
			dd +
			"</div>" +
			'<input type="hidden" class="pi-link-value" data-fieldname="' +
			esc(fn) +
			'" data-fieldtype="Link" value="' +
			esc(value || "") +
			'">' +
			"</div></div>"
		);
	}

	/* ---- Attach Image field with upload button ---- */
	function renderImageField(fn, value, label, ro) {
		var iid = "pf-img-" + fn;
		var hasImg = !!value;
		var html =
			'<div class="pi-field pi-field-full">' +
			'<label class="pi-label">' +
			esc(label) +
			"</label>" +
			'<div class="pi-img-wrap" data-fn="' +
			esc(fn) +
			'" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:0.4rem;">' +
			'<img id="' +
			esc(iid) +
			'-preview" src="' +
			esc(value || "") +
			'" alt="Photo" style="width:80px;height:80px;border-radius:50%;object-fit:cover;background:#eee;' +
			(hasImg ? "" : "display:none;") +
			'">' +
			'<div id="' +
			esc(iid) +
			'-placeholder" style="width:80px;height:80px;border-radius:50%;background:#eee;display:' +
			(hasImg ? "none" : "flex") +
			';align-items:center;justify-content:center;font-size:2rem;">👤</div>';
		if (!ro) {
			html +=
				'<div style="display:flex;flex-direction:column;gap:0.4rem;">' +
				'<input type="file" id="' +
				esc(iid) +
				'-file" accept="image/*" style="display:none;">' +
				'<button type="button" class="pi-btn pi-btn-secondary pi-img-upload-btn" ' +
				'data-fn="' +
				esc(fn) +
				'" data-iid="' +
				esc(iid) +
				'" style="font-size:0.85rem;">Change Photo</button>' +
				'<span id="' +
				esc(iid) +
				'-status" style="font-size:0.75rem;color:var(--pi-muted);"></span>' +
				"</div>";
		}
		html +=
			'<input type="hidden" data-fieldname="' +
			esc(fn) +
			'" data-fieldtype="Attach Image" value="' +
			esc(value || "") +
			'">' +
			"</div></div>";
		return html;
	}

	/* ---- Single field renderer (sync — link opts pre-fetched) ---- */
	function renderField(f, value, childTables, linkOpts) {
		var id = "pf-" + f.fieldname;
		var label = f.label || f.fieldname;
		var desc = f.description
			? '<div style="font-size:0.75rem;color:var(--pi-muted);margin-top:0.2rem;">' +
			  esc(f.description) +
			  "</div>"
			: "";
		var req = f.reqd ? ' <span style="color:var(--pi-red)">*</span>' : "";

		if (f.fieldtype === "Attach Image")
			return renderImageField(f.fieldname, value, label, f.read_only);

		if (f.fieldtype === "Rating") return renderStars(f.fieldname, value, label, f.read_only);

		if (f.fieldtype === "Link") {
			var opts = linkOpts[f.options] || [];
			return renderLink(f.fieldname, value, opts, label, f.read_only) + desc;
		}

		var labelHtml =
			'<label class="pi-label" for="' + esc(id) + '">' + esc(label) + req + "</label>";

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
				labelHtml +
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
			f.fieldtype === "Long Text" ||
			f.fieldtype === "Text Editor"
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
			var selopts = String(f.options || "")
				.split("\n")
				.filter(Boolean);
			input =
				'<select id="' +
				esc(id) +
				'" class="pi-input" data-fieldname="' +
				esc(f.fieldname) +
				'">';
			input += '<option value=""></option>';
			selopts.forEach(function (o) {
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
			return (
				'<div class="pi-field">' +
				'<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">' +
				'<input type="checkbox" id="' +
				esc(id) +
				'" data-fieldname="' +
				esc(f.fieldname) +
				'" data-fieldtype="Check"' +
				(value ? " checked" : "") +
				">" +
				'<span class="pi-label" style="margin:0;">' +
				esc(label) +
				"</span></label>" +
				desc +
				"</div>"
			);
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
			var tableOpts =
				vf.fieldtype === "Link"
					? linkOpts[vf.options] || []
					: String(vf.options || "")
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
			tableOpts.forEach(function (o) {
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
			return '<div class="pi-field pi-field-full">' + labelHtml + chips + desc + "</div>";
		} else {
			/* Data, Phone, Email, Password, etc. */
			var itype =
				f.fieldtype === "Password"
					? "password"
					: f.fieldtype === "Int" || f.fieldtype === "Float"
					? "number"
					: "text";
			input =
				'<input type="' +
				itype +
				'" id="' +
				esc(id) +
				'" class="pi-input" data-fieldname="' +
				esc(f.fieldname) +
				'" value="' +
				esc(value || "") +
				'">';
		}

		return '<div class="pi-field">' + labelHtml + input + desc + "</div>";
	}

	/* ---- Wire interactive events on the profile body ---- */
	function wireEvents(body) {
		/* Star rating */
		body.addEventListener("click", function (e) {
			var star = e.target.closest(".pi-stars .pi-star");
			if (!star) return;
			var wrap = star.closest(".pi-stars");
			var fn = wrap && wrap.getAttribute("data-fn");
			if (!fn) return;
			var val = parseInt(star.getAttribute("data-v")) || 0;
			wrap.querySelectorAll(".pi-star").forEach(function (s, i) {
				s.classList.toggle("lit", i < val);
			});
			var hidden = body.querySelector(
				'[data-fieldname="' + fn + '"][data-fieldtype="Rating"]'
			);
			if (hidden) hidden.value = val;
			var lbl = body.querySelector("#fsl-" + fn);
			if (lbl) lbl.textContent = val + " / 5";
		});

		/* Chip toggles */
		body.addEventListener("click", function (e) {
			var btn = e.target.closest(".pi-chip-opt[data-table-fn]");
			if (!btn) return;
			btn.classList.toggle("selected");
			var fn = btn.getAttribute("data-table-fn");
			var vfn = btn.getAttribute("data-vfn");
			var hidden = body.querySelector(
				'[data-fieldname="' + fn + '"][data-fieldtype="Table"]'
			);
			if (!hidden) return;
			var rows = Array.prototype.map.call(
				body.querySelectorAll('.pi-chip-opt[data-table-fn="' + fn + '"].selected'),
				function (b) {
					var r = {};
					r[vfn] = b.getAttribute("data-val");
					return r;
				}
			);
			hidden.value = JSON.stringify(rows);
		});

		/* Photo upload button → trigger file input */
		body.addEventListener("click", function (e) {
			var btn = e.target.closest(".pi-img-upload-btn");
			if (!btn) return;
			var iid = btn.getAttribute("data-iid");
			var fi = iid && document.getElementById(iid + "-file");
			if (fi) fi.click();
		});

		/* File selected → read + upload */
		body.addEventListener("change", function (e) {
			var fi = e.target;
			if (!fi || fi.type !== "file" || !fi.id || !fi.id.endsWith("-file")) return;
			var file = fi.files && fi.files[0];
			if (!file) return;
			var iid = fi.id.slice(0, -5); // strip "-file"
			var fn = iid.replace("pf-img-", "");
			var status = document.getElementById(iid + "-status");
			var preview = document.getElementById(iid + "-preview");
			var placeholder = document.getElementById(iid + "-placeholder");
			var hidden = body.querySelector(
				'[data-fieldname="' + fn + '"][data-fieldtype="Attach Image"]'
			);
			if (status) status.textContent = "Uploading…";
			var reader = new FileReader();
			reader.onload = function (ev) {
				var dataUrl = ev.target.result;
				api(
					"/api/method/skillshub_core.skillshub_portal.api.upload_public_profile_image",
					{
						method: "POST",
						body: JSON.stringify({
							student_id: state.session && state.session.sid,
							token: state.session && state.session.token,
							filename: file.name,
							filedata: dataUrl,
						}),
					}
				)
					.then(function (res) {
						var url = res && res.file_url;
						if (!url) throw new Error("No file URL returned");
						if (preview) {
							preview.src = url;
							preview.style.display = "";
						}
						if (placeholder) placeholder.style.display = "none";
						if (hidden) hidden.value = url;
						if (status) status.textContent = "Photo updated.";
						var avatar = document.getElementById("pi-profile-avatar");
						var avatarPh = document.getElementById("pi-profile-avatar-placeholder");
						if (avatar) {
							avatar.src = url;
							avatar.style.display = "";
						}
						if (avatarPh) avatarPh.style.display = "none";
					})
					.catch(function (err) {
						if (status)
							status.textContent = "Upload failed: " + (err.message || "error");
					});
			};
			reader.readAsDataURL(file);
		});

		/* Show link dropdown on focus/click — reveal all options */
		body.addEventListener(
			"focus",
			function (e) {
				var inp = e.target.closest(".pi-link-search");
				if (!inp) return;
				var wrap = inp.closest(".pi-link-wrap");
				var fn = wrap && wrap.getAttribute("data-fn");
				var dd = fn && body.querySelector("#ld-" + fn);
				if (!dd) return;
				dd.hidden = false;
				dd.querySelectorAll(".pi-link-option").forEach(function (opt) {
					opt.hidden = false;
				});
			},
			true /* capture so non-bubbling focus reaches here */
		);

		/* Filter link options while typing */
		body.addEventListener("input", function (e) {
			var inp = e.target.closest(".pi-link-search");
			if (!inp) return;
			var wrap = inp.closest(".pi-link-wrap");
			var fn = wrap && wrap.getAttribute("data-fn");
			var dd = fn && body.querySelector("#ld-" + fn);
			if (!dd) return;
			dd.hidden = false;
			var q = inp.value.toLowerCase();
			dd.querySelectorAll(".pi-link-option").forEach(function (opt) {
				opt.hidden = !opt.textContent.toLowerCase().includes(q);
			});
			var hv = wrap.querySelector(".pi-link-value");
			if (hv) hv.value = "";
		});

		/* Link option select */
		body.addEventListener("click", function (e) {
			var opt = e.target.closest(".pi-link-option");
			if (!opt) return;
			var fn = opt.getAttribute("data-fn");
			var val = opt.getAttribute("data-val");
			var wrap = body.querySelector('.pi-link-wrap[data-fn="' + fn + '"]');
			if (!wrap) return;
			var inp = wrap.querySelector(".pi-link-search");
			var hv = wrap.querySelector(".pi-link-value");
			var dd = body.querySelector("#ld-" + fn);
			if (inp) inp.value = val;
			if (hv) hv.value = val;
			if (dd) dd.hidden = true;
		});

		/* Close dropdowns on outside click */
		document.addEventListener("click", function (e) {
			if (!e.target.closest(".pi-link-wrap")) {
				body.querySelectorAll(".pi-link-dropdown").forEach(function (d) {
					d.hidden = true;
				});
			}
		});

		/* Re-evaluate depends_on when any value changes */
		body.addEventListener("change", function () {
			applyDependsOn(body);
		});
	}

	/* ---- Render full profile ---- */
	function renderProfile(data) {
		var fields = data.fields || [];
		var student = data.student || {};
		var childTables = data.child_tables || {};
		var sections = buildSections(fields);

		/* Collect all unique Link doctypes (editable only) */
		var linkDoctypes = [];
		fields.forEach(function (f) {
			if (f.read_only || f.hidden) return;
			var dt = null;
			if (f.fieldtype === "Link" && f.options) dt = f.options;
			if (f.fieldtype === "Table" && childTables[f.fieldname]) {
				var vf = (childTables[f.fieldname].fields || []).find(function (cf) {
					return cf.fieldtype === "Link";
				});
				if (vf && vf.options) dt = vf.options;
			}
			if (dt && linkDoctypes.indexOf(dt) === -1) linkDoctypes.push(dt);
		});

		/* Fetch all link options in parallel, then render */
		Promise.all(linkDoctypes.map(fetchLinkOpts)).then(function (allOpts) {
			var linkOptsMap = {};
			linkDoctypes.forEach(function (dt, i) {
				linkOptsMap[dt] = allOpts[i];
			});

			/* Update heading and hero avatar */
			var heading = document.getElementById("pi-profile-heading");
			if (heading && student.student_name) heading.textContent = student.student_name;
			var avatar = document.getElementById("pi-profile-avatar");
			var avatarPh = document.getElementById("pi-profile-avatar-placeholder");
			if (student.student_image) {
				if (avatar) {
					avatar.src = student.student_image;
					avatar.style.display = "";
				}
				if (avatarPh) avatarPh.style.display = "none";
			} else {
				if (avatar) avatar.style.display = "none";
				if (avatarPh) avatarPh.style.display = "";
			}

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
					var fieldHtml = renderField(f, student[f.fieldname], childTables, linkOptsMap);
					if (!fieldHtml) return;
					var attrs = 'data-field-wrap="' + esc(f.fieldname) + '"';
					if (f.depends_on) attrs += ' data-depends-on="' + esc(f.depends_on) + '"';
					html += "<div " + attrs + ">" + fieldHtml + "</div>";
				});
				html += "</div>";
			});

			var body = document.getElementById("pi-profile-body");
			body.innerHTML = html;
			wireEvents(body);
			applyDependsOn(body);

			document.getElementById("pi-profile-loading").style.display = "none";
			body.style.display = "";
			var actions = document.getElementById("pi-profile-actions");
			if (actions) actions.style.display = "flex";
		});
	}

	/* ---- Collect payload for save ---- */
	function gatherPayload() {
		var payload = {};
		document.querySelectorAll("#pi-profile-body [data-fieldname]").forEach(function (el) {
			var fn = el.getAttribute("data-fieldname");
			var ft = el.getAttribute("data-fieldtype");
			/* Skip the visible search input — only read the hidden value */
			if (el.classList.contains("pi-link-search")) return;
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
