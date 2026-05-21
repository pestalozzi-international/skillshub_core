(function () {
	"use strict";

	var FIELDS = [
		{ key: "portal_name", label: "Portal Name", type: "text" },
		{ key: "portal_tagline", label: "Portal Tagline", type: "text" },
		{ key: "landing_title", label: "Landing Title", type: "text" },
		{ key: "landing_subtitle", label: "Landing Subtitle", type: "text" },
		{ key: "login_notice", label: "Login Notice", type: "textarea" },
		{ key: "support_email", label: "Support Email", type: "email" },
		{ key: "student_home_route", label: "Student Home Route", type: "text" },
		{ key: "admin_home_route", label: "Admin Home Route", type: "text" },
		{ key: "logo", label: "Logo URL", type: "text" },
		{ key: "favicon", label: "Favicon URL", type: "text" },
		{ key: "primary_color", label: "Primary Colour", type: "color" },
		{ key: "secondary_color", label: "Secondary Colour", type: "color" },
		{ key: "accent_color", label: "Accent Colour", type: "color" },
		{ key: "background_color", label: "Background Colour", type: "color" },
		{ key: "surface_color", label: "Surface Colour", type: "color" },
		{ key: "text_color", label: "Text Colour", type: "color" },
		{ key: "muted_text_color", label: "Muted Text Colour", type: "color" },
		{ key: "header_gradient", label: "Header Gradient", type: "text" },
	];

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

	function renderForm(settings) {
		var form = document.getElementById("settings-form");
		form.innerHTML = FIELDS.map(function (field) {
			var value = settings && settings[field.key] ? settings[field.key] : "";
			var control = "";
			if (field.type === "textarea") {
				control =
					'<textarea class="sh-input" rows="3" data-key="' +
					esc(field.key) +
					'">' +
					esc(value) +
					"</textarea>";
			} else {
				control =
					'<input class="sh-input" data-key="' +
					esc(field.key) +
					'" type="' +
					esc(field.type) +
					'" value="' +
					esc(value) +
					'">';
			}
			return (
				'<div class="sh-input-group"><label class="sh-label">' +
				esc(field.label) +
				"</label>" +
				control +
				"</div>"
			);
		}).join("");
	}

	function collectPayload() {
		var payload = {};
		document.querySelectorAll("#settings-form [data-key]").forEach(function (input) {
			payload[input.getAttribute("data-key")] = input.value;
		});
		return payload;
	}

	function setMessage(html) {
		document.getElementById("settings-message").innerHTML = html || "";
	}

	function loadSettings() {
		setMessage("");
		api(
			"/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings"
		)
			.then(function (settings) {
				renderForm(settings || {});
			})
			.catch(function (error) {
				setMessage(
					'<div class="sh-alert-error">Unable to load settings: ' +
						esc(error.message) +
						"</div>"
				);
			});
	}

	function saveSettings() {
		var button = document.getElementById("settings-save");
		button.disabled = true;
		button.textContent = "Saving...";
		api("/api/method/skillshub_core.skillshub_portal.api.update_portal_settings", {
			method: "POST",
			body: JSON.stringify({ values: collectPayload() }),
		})
			.then(function () {
				setMessage('<div class="sh-alert-success">Settings saved.</div>');
			})
			.catch(function (error) {
				setMessage(
					'<div class="sh-alert-error">Save failed: ' + esc(error.message) + "</div>"
				);
			})
			.finally(function () {
				button.disabled = false;
				button.textContent = "Save Settings";
			});
	}

	document.addEventListener("DOMContentLoaded", function () {
		document.getElementById("settings-save").addEventListener("click", saveSettings);
		document.getElementById("settings-reload").addEventListener("click", loadSettings);
		loadSettings();
	});
})();
