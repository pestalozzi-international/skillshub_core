/* SkillsHub Public Portal — Gate (ID+DOB verification) widget
 * Shared across all /skillshub/s/ pages.
 * Fires 'sh-gate-open' CustomEvent when the session is valid.
 */
(function () {
	"use strict";

	var SK_TOKEN = "sh_pub_token";
	var SK_SID = "sh_pub_student_id";
	var SK_NAME = "sh_pub_student_name";
	var SK_PATH = "sh_pub_programme_path";

	/* ---- Storage helpers ---- */
	function store(token, sid, name, path) {
		try {
			sessionStorage.setItem(SK_TOKEN, token);
			sessionStorage.setItem(SK_SID, sid);
			sessionStorage.setItem(SK_NAME, name || "");
			sessionStorage.setItem(SK_PATH, path || "");
		} catch (_e) {
			/* sessionStorage unavailable */
		}
	}

	function getSession() {
		try {
			return {
				token: sessionStorage.getItem(SK_TOKEN),
				sid: sessionStorage.getItem(SK_SID),
				name: sessionStorage.getItem(SK_NAME),
				path: sessionStorage.getItem(SK_PATH),
			};
		} catch (e) {
			return { token: null, sid: null, name: null, path: null };
		}
	}

	function clearSession() {
		try {
			[SK_TOKEN, SK_SID, SK_NAME, SK_PATH].forEach(function (k) {
				sessionStorage.removeItem(k);
			});
		} catch (_e) {
			/* sessionStorage unavailable */
		}
	}

	/* ---- Misc ---- */
	function esc(v) {
		if (!v) return "";
		var d = document.createElement("div");
		d.textContent = String(v);
		return d.innerHTML;
	}

	function getCsrf() {
		try {
			var tok = window.frappe && window.frappe.csrf_token;
			if (tok && !String(tok).includes("{{") && tok !== "None") return tok;
		} catch (_e) {
			/* frappe not ready */
		}
		return null;
	}

	function api(path, opts) {
		var headers = { Accept: "application/json", "Content-Type": "application/json" };
		var csrf = getCsrf();
		if (csrf) headers["X-Frappe-CSRF-Token"] = csrf;
		return fetch(
			path,
			Object.assign({ credentials: "include", headers: headers }, opts || {})
		).then(function (r) {
			return r.json().then(function (d) {
				if (!r.ok) {
					var msg =
						(d && (d._server_messages || d.message || d.exc_type)) ||
						"HTTP " + r.status;
					if (d && d._server_messages) {
						try {
							msg = JSON.parse(d._server_messages)[0];
						} catch (_e) {
							/* keep raw string */
						}
						try {
							msg = JSON.parse(msg).message || msg;
						} catch (_e) {
							/* keep raw string */
						}
					}
					throw new Error(msg);
				}
				return d.message !== undefined ? d.message : d;
			});
		});
	}

	function fire(session) {
		window.__shGateSession = session;
		window.dispatchEvent(new CustomEvent("sh-gate-open", { detail: session }));
	}

	/* ---- Gate UI ---- */
	function buildOverlay(formTitle) {
		var div = document.createElement("div");
		div.id = "sh-gate-overlay";
		div.className = "pi-gate-overlay";
		div.innerHTML =
			'<div class="pi-gate-card">' +
			'<div class="pi-gate-lock">🔒</div>' +
			'<h2 class="pi-gate-title">' +
			esc(formTitle || "SkillsHub Portal") +
			"</h2>" +
			'<p class="pi-gate-sub">Enter your Student ID and Date of Birth to continue.</p>' +
			'<div class="pi-gate-form">' +
			'<div class="pi-field">' +
			'<label class="pi-label" for="sh-gate-id">Student ID</label>' +
			'<input id="sh-gate-id" class="pi-input" type="text" placeholder="e.g. SH260054" autocomplete="off" autocapitalize="characters">' +
			"</div>" +
			'<div class="pi-field">' +
			'<label class="pi-label" for="sh-gate-dob">Date of Birth</label>' +
			'<input id="sh-gate-dob" class="pi-input" type="date" max="' +
			new Date().toISOString().split("T")[0] +
			'">' +
			"</div>" +
			'<button id="sh-gate-btn" class="pi-btn pi-btn-primary pi-btn-full pi-btn-lg" style="margin-top:0.5rem;">Unlock</button>' +
			'<p id="sh-gate-error" class="pi-gate-error"></p>' +
			"</div>" +
			'<p style="margin-top:1.5rem;font-size:0.75rem;color:var(--pi-muted);text-align:center;">' +
			"Your details are used only to verify your identity." +
			"</p>" +
			"</div>";
		return div;
	}

	function showGateError(msg) {
		var el = document.getElementById("sh-gate-error");
		if (el) el.textContent = msg || "";
	}

	function setGateLoading(loading) {
		var btn = document.getElementById("sh-gate-btn");
		if (!btn) return;
		btn.disabled = loading;
		btn.textContent = loading ? "Verifying…" : "Unlock";
	}

	function dismissOverlay() {
		var overlay = document.getElementById("sh-gate-overlay");
		if (!overlay) return;
		overlay.style.transition = "opacity 0.3s";
		overlay.style.opacity = "0";
		setTimeout(function () {
			if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
		}, 320);
	}

	function handleVerify() {
		var sidEl = document.getElementById("sh-gate-id");
		var dobEl = document.getElementById("sh-gate-dob");
		var sid = sidEl ? sidEl.value.trim().toUpperCase() : "";
		var dob = dobEl ? dobEl.value.trim() : "";

		showGateError("");
		if (!sid) {
			showGateError("Please enter your Student ID.");
			if (sidEl) sidEl.focus();
			return;
		}
		if (!dob) {
			showGateError("Please enter your Date of Birth.");
			if (dobEl) dobEl.focus();
			return;
		}

		setGateLoading(true);

		api("/api/method/skillshub_core.skillshub_portal.api.verify_student_public", {
			method: "POST",
			body: JSON.stringify({ student_id: sid, date_of_birth: dob }),
		})
			.then(function (result) {
				store(result.token, result.student_id, result.student_name, result.programme_path);
				dismissOverlay();
				fire({
					token: result.token,
					sid: result.student_id,
					name: result.student_name,
					path: result.programme_path,
				});
			})
			.catch(function (err) {
				setGateLoading(false);
				showGateError(err.message || "Incorrect Student ID or Date of Birth.");
			});
	}

	/* ---- Init ---- */
	document.addEventListener("DOMContentLoaded", function () {
		var session = getSession();

		if (session.token && session.sid) {
			/* Already verified — fire immediately */
			fire(session);
			return;
		}

		/* Build overlay */
		var pageTitle = document.querySelector("[data-gate-title]");
		var overlay = buildOverlay(pageTitle ? pageTitle.textContent : null);
		document.body.appendChild(overlay);

		/* Bind verify button */
		document.addEventListener("click", function (e) {
			if (e.target && e.target.id === "sh-gate-btn") handleVerify();
		});

		/* Enter key in gate fields */
		document.addEventListener("keydown", function (e) {
			if (e.key !== "Enter") return;
			var overlay = document.getElementById("sh-gate-overlay");
			if (overlay) handleVerify();
		});
	});

	/* ---- Public API ---- */
	window.SHGate = {
		getSession: getSession,
		clearSession: clearSession,
		api: api,
		esc: esc,
	};
})();
