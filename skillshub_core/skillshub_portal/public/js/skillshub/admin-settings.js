/* SkillsHub Admin — Portal Settings (beautiful sectioned editor) */
(function () {
	"use strict";

	var SECTIONS = [
		{
			id: "identity",
			title: "Portal Identity",
			icon: "🏷️",
			desc: "Name, tagline and support contact displayed across all portal pages.",
			fields: [
				{
					key: "portal_name",
					label: "Portal Name",
					type: "text",
					placeholder: "SkillsHub Portal",
				},
				{
					key: "portal_tagline",
					label: "Tagline",
					type: "text",
					placeholder: "Pestalozzi International",
				},
				{
					key: "landing_title",
					label: "Landing Title",
					type: "text",
					placeholder: "Welcome to SkillsHub",
				},
				{
					key: "landing_subtitle",
					label: "Landing Subtitle",
					type: "text",
					placeholder: "",
				},
				{
					key: "login_notice",
					label: "Login Notice",
					type: "textarea",
					placeholder: "Shown on the login page.",
				},
				{
					key: "support_email",
					label: "Support Email",
					type: "email",
					placeholder: "support@example.org",
				},
			],
		},
		{
			id: "branding",
			title: "Branding & Appearance",
			icon: "🎨",
			desc: "Logo, favicon and colour palette. Upload images or paste a URL.",
			fields: [
				{ key: "logo", label: "Logo", type: "image", placeholder: "Upload or paste URL" },
				{
					key: "favicon",
					label: "Favicon",
					type: "image",
					placeholder: "Upload or paste URL (.ico, .png)",
				},
				{ key: "primary_color", label: "Primary Colour", type: "color" },
				{ key: "secondary_color", label: "Secondary / Dark Colour", type: "color" },
				{ key: "accent_color", label: "Accent Colour", type: "color" },
				{ key: "background_color", label: "Background Colour", type: "color" },
				{ key: "surface_color", label: "Surface / Card Colour", type: "color" },
				{ key: "text_color", label: "Text Colour", type: "color" },
				{ key: "muted_text_color", label: "Muted Text Colour", type: "color" },
				{
					key: "header_gradient",
					label: "Header Gradient (CSS)",
					type: "text",
					placeholder: "linear-gradient(135deg, #CA0733 0%, #a3052a 100%)",
				},
			],
		},
		{
			id: "application",
			title: "Application Portal",
			icon: "📝",
			desc: "Control the public application form at /skillshub/apply. Set the active cohort and year — these are auto-filled on every submitted application.",
			fields: [
				{
					key: "application_portal_enabled",
					label: "Applications Open",
					type: "check",
				},
				{
					key: "application_open_from",
					label: "Open From (optional)",
					type: "date",
				},
				{
					key: "application_open_until",
					label: "Open Until (optional)",
					type: "date",
				},
				{
					key: "application_default_cohort",
					label: "Application Cohort",
					type: "link",
					doctype: "SH Cohort",
				},
				{
					key: "application_default_year",
					label: "Application Academic Year",
					type: "link",
					doctype: "SH Academic Year",
				},
				{
					key: "application_closed_message",
					label: "Applications Closed Message",
					type: "textarea",
					placeholder: "Applications are currently closed. Please check back later.",
				},
			],
		},
		{
			id: "routes",
			title: "Navigation Routes",
			icon: "🗺️",
			desc: "Where users land after logging in. These values are set by the system — do not change them.",
			fields: [
				{
					key: "admin_home_route",
					label: "Admin Home Route",
					type: "text",
					placeholder: "/skillshub/admin/students",
					readonly: true,
				},
				{
					key: "student_home_route",
					label: "Student Home Route",
					type: "text",
					placeholder: "/skillshub/s/",
					readonly: true,
				},
			],
		},
		{
			id: "defaults",
			title: "Programme Defaults",
			icon: "⚙️",
			desc: "Current cohort shown on student profile cards and used as the default in enrolment forms.",
			fields: [
				{
					key: "current_cohort",
					label: "Current Cohort",
					type: "link",
					doctype: "SH Cohort",
				},
				{
					key: "default_academic_year",
					label: "Default Academic Year",
					type: "link",
					doctype: "SH Academic Year",
				},
			],
		},
	];

	var currentSettings = {};

	function esc(value) {
		if (value === null || value === undefined) return "";
		var div = document.createElement("div");
		div.textContent = String(value);
		return div.innerHTML;
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

	function uploadFile(file, onSuccess, onError) {
		var csrf = window.frappe && window.frappe.csrf_token;
		var formData = new FormData();
		formData.append("file", file);
		formData.append("is_private", "0");
		formData.append("folder", "Home/Attachments");
		fetch("/api/method/upload_file", {
			method: "POST",
			credentials: "include",
			headers: csrf && !String(csrf).includes("{{") ? { "X-Frappe-CSRF-Token": csrf } : {},
			body: formData,
		})
			.then(function (r) {
				return r.json();
			})
			.then(function (data) {
				var url = data && data.message && data.message.file_url;
				if (url) onSuccess(url);
				else onError(new Error("Upload failed — no URL returned"));
			})
			.catch(onError);
	}

	function buildColorSwatch(key, value) {
		return (
			'<div class="s-field s-field-color">' +
			'<label class="s-label">' +
			esc(
				(
					SECTIONS.reduce(function (a, s) {
						return a.concat(s.fields);
					}, []).find(function (f) {
						return f.key === key;
					}) || { label: key }
				).label
			) +
			"</label>" +
			'<div class="s-color-row">' +
			'<input type="color" class="s-color-pick" data-key="' +
			esc(key) +
			'" value="' +
			esc(value || "#000000") +
			'">' +
			'<input type="text" class="s-input s-color-text" data-key-text="' +
			esc(key) +
			'" value="' +
			esc(value || "") +
			'" placeholder="#rrggbb">' +
			"</div></div>"
		);
	}

	function buildImageField(key, label, value, placeholder) {
		var preview = value
			? '<img id="prev-' +
			  esc(key) +
			  '" src="' +
			  esc(value) +
			  '" alt="" style="max-height:56px;max-width:120px;border-radius:0.4rem;object-fit:contain;border:1px solid var(--pi-border);padding:2px;background:#fff;">'
			: '<span id="prev-' + esc(key) + '" style="display:none;"></span>';
		return (
			'<div class="s-field">' +
			'<label class="s-label">' +
			esc(label) +
			"</label>" +
			'<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">' +
			preview +
			'<div style="flex:1;min-width:160px;">' +
			'<input type="text" class="s-input" data-key="' +
			esc(key) +
			'" value="' +
			esc(value || "") +
			'" placeholder="' +
			esc(placeholder || "") +
			'">' +
			'<label class="s-upload-btn" style="margin-top:0.35rem;display:inline-flex;align-items:center;gap:0.35rem;cursor:pointer;font-size:0.78rem;color:var(--pi-red);font-weight:600;">' +
			'<input type="file" accept="image/*" data-upload-for="' +
			esc(key) +
			'" style="display:none;">' +
			"⬆ Upload image" +
			"</label>" +
			"</div>" +
			"</div></div>"
		);
	}

	function buildTextField(key, label, type, value, placeholder, readonly) {
		if (type === "textarea") {
			return (
				'<div class="s-field s-field-full">' +
				'<label class="s-label">' +
				esc(label) +
				"</label>" +
				'<textarea class="s-input s-textarea" data-key="' +
				esc(key) +
				'" placeholder="' +
				esc(placeholder || "") +
				'">' +
				esc(value || "") +
				"</textarea>" +
				"</div>"
			);
		}
		var readonlyAttr = readonly
			? ' readonly style="opacity:0.6;cursor:default;background:var(--pi-sand,#F1E8DA);"'
			: "";
		return (
			'<div class="s-field">' +
			'<label class="s-label">' +
			esc(label) +
			"</label>" +
			'<input type="' +
			esc(type || "text") +
			'" class="s-input" data-key="' +
			esc(key) +
			'" value="' +
			esc(value || "") +
			'" placeholder="' +
			esc(placeholder || "") +
			'"' +
			readonlyAttr +
			">" +
			"</div>"
		);
	}

	function buildCheckField(key, label, value) {
		return (
			'<div class="s-field">' +
			'<label class="s-label" style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">' +
			'<input type="checkbox" data-key="' +
			esc(key) +
			'" style="width:1.1rem;height:1.1rem;accent-color:var(--pi-red,#CA0733);"' +
			(value ? " checked" : "") +
			">" +
			esc(label) +
			"</label></div>"
		);
	}

	function buildLinkField(key, label, doctype, value) {
		return (
			'<div class="s-field">' +
			'<label class="s-label">' +
			esc(label) +
			"</label>" +
			'<select class="s-input" data-key="' +
			esc(key) +
			'" data-doctype="' +
			esc(doctype) +
			'">' +
			'<option value="">— Loading… —</option>' +
			(value
				? '<option value="' + esc(value) + '" selected>' + esc(value) + "</option>"
				: "") +
			"</select>" +
			"</div>"
		);
	}

	function populateLinkFields() {
		document.querySelectorAll("select[data-doctype]").forEach(function (sel) {
			var doctype = sel.getAttribute("data-doctype");
			var key = sel.getAttribute("data-key");
			var currentVal = (key && currentSettings[key]) || "";
			fetch(
				"/api/resource/" +
					encodeURIComponent(doctype) +
					'?fields=["name"]&limit=100&order_by=name+asc',
				{ credentials: "include", headers: headers() }
			)
				.then(function (r) {
					return r.json();
				})
				.then(function (data) {
					var docs = (data && data.data) || [];
					var html = '<option value="">— Select —</option>';
					docs.forEach(function (d) {
						html +=
							'<option value="' +
							esc(d.name) +
							'"' +
							(d.name === currentVal ? " selected" : "") +
							">" +
							esc(d.name) +
							"</option>";
					});
					sel.innerHTML = html;
				})
				.catch(function () {
					sel.innerHTML =
						'<option value="' +
						esc(currentVal) +
						'">' +
						esc(currentVal || "— unable to load —") +
						"</option>";
				});
		});
	}

	function renderSettings(settings) {
		currentSettings = settings || {};
		var container = document.getElementById("settings-sections");
		if (!container) return;

		var html = "";
		SECTIONS.forEach(function (section) {
			html += '<div class="s-section">';
			html += '<div class="s-section-head">';
			html += '<span class="s-section-icon">' + section.icon + "</span>";
			html += '<div><div class="s-section-title">' + esc(section.title) + "</div>";
			html += '<div class="s-section-desc">' + esc(section.desc) + "</div></div>";
			html += "</div>";
			html += '<div class="s-section-body">';

			section.fields.forEach(function (field) {
				var val = settings[field.key];
				if (val === undefined || val === null) val = "";
				if (field.type === "color") {
					html += buildColorSwatch(field.key, val);
				} else if (field.type === "image") {
					html += buildImageField(field.key, field.label, val, field.placeholder);
				} else if (field.type === "link") {
					html += buildLinkField(field.key, field.label, field.doctype, val);
				} else if (field.type === "check") {
					html += buildCheckField(field.key, field.label, val);
				} else {
					html += buildTextField(
						field.key,
						field.label,
						field.type,
						val,
						field.placeholder,
						field.readonly
					);
				}
			});

			html += "</div></div>";
		});

		container.innerHTML = html;
		bindColorSync();
		bindFileUploads();
		populateLinkFields();
	}

	function bindColorSync() {
		/* Keep hex text and color picker in sync */
		document.querySelectorAll(".s-color-pick").forEach(function (picker) {
			var key = picker.getAttribute("data-key");
			var text = document.querySelector('[data-key-text="' + key + '"]');
			picker.addEventListener("input", function () {
				if (text) text.value = picker.value;
			});
			if (text) {
				text.addEventListener("input", function () {
					var v = text.value.trim();
					if (/^#[0-9a-fA-F]{6}$/.test(v)) picker.value = v;
				});
			}
		});
	}

	function bindFileUploads() {
		document.querySelectorAll('input[type="file"][data-upload-for]').forEach(function (input) {
			input.addEventListener("change", function () {
				var file = input.files && input.files[0];
				if (!file) return;
				var key = input.getAttribute("data-upload-for");
				var urlInput = document.querySelector('[data-key="' + key + '"]');
				var preview = document.getElementById("prev-" + key);
				var label = input.closest("label");
				if (label) label.textContent = "⬆ Uploading…";

				uploadFile(
					file,
					function (url) {
						if (urlInput) urlInput.value = url;
						if (preview) {
							preview.src = url;
							preview.style.display = "";
						}
						if (label)
							label.innerHTML =
								'<input type="file" accept="image/*" data-upload-for="' +
								esc(key) +
								'" style="display:none;">⬆ Upload image';
						bindFileUploads();
					},
					function (err) {
						if (label)
							label.innerHTML =
								'<input type="file" accept="image/*" data-upload-for="' +
								esc(key) +
								'" style="display:none;">⬆ Upload image';
						alert("Upload failed: " + (err && err.message));
						bindFileUploads();
					}
				);
			});
		});
	}

	function collectPayload() {
		var payload = {};
		document.querySelectorAll("[data-key]").forEach(function (input) {
			var key = input.getAttribute("data-key");
			if (!key) return;
			if (input.type === "checkbox") {
				payload[key] = input.checked ? 1 : 0;
			} else {
				payload[key] = input.value;
			}
		});
		return payload;
	}

	function setMessage(html, type) {
		var el = document.getElementById("settings-message");
		if (!el) return;
		el.innerHTML = html
			? '<div class="pi-alert pi-alert-' + (type || "info") + '">' + html + "</div>"
			: "";
	}

	function setButtonState(saving) {
		var btn = document.getElementById("settings-save");
		if (!btn) return;
		btn.disabled = saving;
		btn.textContent = saving ? "Saving…" : "Save Settings";
	}

	function loadSettings() {
		setMessage("");
		api(
			"/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings"
		)
			.then(function (settings) {
				renderSettings(settings || {});
			})
			.catch(function (error) {
				setMessage("Unable to load settings: " + esc(error.message), "error");
			});
	}

	function saveSettings() {
		setButtonState(true);
		setMessage("");
		api("/api/method/skillshub_core.skillshub_portal.api.update_portal_settings", {
			method: "POST",
			body: JSON.stringify({ values: collectPayload() }),
		})
			.then(function () {
				setMessage("✓ Settings saved successfully.", "success");
				loadSettings();
			})
			.catch(function (error) {
				setMessage("Save failed: " + esc(error.message), "error");
			})
			.finally(function () {
				setButtonState(false);
			});
	}

	document.addEventListener("DOMContentLoaded", function () {
		var saveBtn = document.getElementById("settings-save");
		var reloadBtn = document.getElementById("settings-reload");
		if (saveBtn) saveBtn.addEventListener("click", saveSettings);
		if (reloadBtn) reloadBtn.addEventListener("click", loadSettings);
		loadSettings();
	});
})();
