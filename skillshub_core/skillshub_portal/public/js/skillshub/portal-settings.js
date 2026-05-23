(function () {
	"use strict";

	function getHeaders() {
		var headers = { Accept: "application/json", "Content-Type": "application/json" };
		if (
			window.frappe &&
			frappe.csrf_token &&
			frappe.csrf_token !== "None" &&
			!String(frappe.csrf_token).includes("{{")
		) {
			headers["X-Frappe-CSRF-Token"] = frappe.csrf_token;
		}
		return headers;
	}

	function esc(value) {
		if (value === null || value === undefined) return "";
		var div = document.createElement("div");
		div.textContent = String(value);
		return div.innerHTML;
	}

	function setFavicon(href) {
		if (!href) return;
		var icon = document.querySelector("link[rel~='icon']");
		if (!icon) {
			icon = document.createElement("link");
			icon.rel = "icon";
			document.head.appendChild(icon);
		}
		icon.href = href + (href.indexOf("?") > -1 ? "&" : "?") + "v=" + Date.now();
	}

	function applyBranding(settings) {
		if (!settings) return;
		var root = document.documentElement;
		root.style.setProperty(
			"--color-teal-700",
			settings.primary_color || "#CA0733",
			"important"
		);
		root.style.setProperty(
			"--color-teal-800",
			settings.secondary_color || "#a3052a",
			"important"
		);
		root.style.setProperty(
			"--color-accent-500",
			settings.accent_color || "#9de3eb",
			"important"
		);
		root.style.setProperty(
			"--color-slate-50",
			settings.background_color || "#F1E8DA",
			"important"
		);
		root.style.setProperty(
			"--surface-color",
			settings.surface_color || "#ffffff",
			"important"
		);
		root.style.setProperty("--text-color", settings.text_color || "#343837", "important");
		root.style.setProperty(
			"--muted-text-color",
			settings.muted_text_color || "#6b6f6e",
			"important"
		);
		root.style.setProperty(
			"--header-gradient",
			settings.header_gradient || "linear-gradient(135deg, #CA0733 0%, #a3052a 100%)",
			"important"
		);
		root.style.setProperty("--pi-red", settings.primary_color || "#CA0733", "important");

		if (settings.favicon) setFavicon(settings.favicon);

		if (settings.logo) {
			document.querySelectorAll(".sh-logo").forEach(function (img) {
				img.src = settings.logo;
				img.style.display = "block";
			});
		}

		var pageTitle = settings.portal_name || "SkillsHub Portal";
		document.querySelectorAll("[data-portal-name]").forEach(function (el) {
			el.textContent = pageTitle;
		});
		document.querySelectorAll("[data-portal-tagline]").forEach(function (el) {
			el.textContent = settings.portal_tagline || "";
		});
		if (document.title && document.title.toLowerCase().indexOf("skillshub") > -1) {
			document.title = document.title.replace(/SkillsHub/gi, pageTitle);
		}
	}

	function normalizePath(pathname) {
		var path = pathname || "/";
		if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
		return path;
	}

	function enforceAccess(bootstrap) {
		var path = normalizePath(window.location.pathname || "/");
		if (!path.startsWith("/skillshub")) return;

		var isLoggedIn = !!(bootstrap && bootstrap.is_logged_in);
		var isAdmin = !!(bootstrap && bootstrap.is_admin);

		var guestAllowed = path === "/skillshub" || path === "/skillshub/login";
		var protectedPath =
			path === "/skillshub/profile" ||
			path === "/skillshub/baseline" ||
			path === "/skillshub/attendance" ||
			path === "/skillshub/form-view" ||
			path.startsWith("/skillshub/feedback") ||
			path.startsWith("/skillshub/admin");

		if (protectedPath && !isLoggedIn) {
			window.location.replace("/skillshub");
			return;
		}

		if (path.startsWith("/skillshub/admin") && !isAdmin) {
			window.location.replace("/skillshub");
			return;
		}

		if (!guestAllowed && !protectedPath && !isLoggedIn) {
			window.location.replace("/skillshub");
		}
	}

	function clearClientSessionState() {
		var keys = [
			"sh_student_id",
			"sh_student_email",
			"sh_student_name",
			"sh_portal_bootstrap",
			"sh_portal_role",
		];
		keys.forEach(function (key) {
			try {
				window.localStorage.removeItem(key);
			} catch (_e) {
				/* storage unavailable */
			}
			try {
				window.sessionStorage.removeItem(key);
			} catch (_e) {
				/* storage unavailable */
			}
		});
	}

	function attemptLogoutRequest(url, options) {
		return fetch(
			url,
			Object.assign({ credentials: "include", cache: "no-store" }, options || {})
		).then(function (response) {
			if (!response.ok) throw new Error("HTTP " + response.status);
			return response;
		});
	}

	function portalLogoutUrl(target) {
		return (
			"/api/method/skillshub_core.skillshub_portal.api.portal_logout?redirect_to=" +
			encodeURIComponent(target || "/skillshub")
		);
	}

	function logout(redirectTo) {
		var target = normalizePath(redirectTo || "/skillshub");
		return attemptLogoutRequest(
			"/api/method/skillshub_core.skillshub_portal.api.portal_logout",
			{ method: "POST", headers: getHeaders() }
		)
			.then(function () {
				return fetch("/api/method/frappe.auth.get_logged_user", {
					method: "GET",
					credentials: "include",
					cache: "no-store",
					headers: { Accept: "application/json" },
				}).then(function (r) {
					if (!r.ok) throw new Error("HTTP " + r.status);
					return r.json();
				});
			})
			.then(function (payload) {
				var currentUser = payload && payload.message ? String(payload.message) : "";
				if (currentUser && currentUser !== "Guest") {
					window.location.assign(portalLogoutUrl(target));
					return;
				}
				window.location.replace(target);
			})
			.catch(function () {
				window.location.assign(portalLogoutUrl(target));
			})
			.finally(function () {
				clearClientSessionState();
			});
	}

	function bindLogoutLinks() {
		document.addEventListener("click", function (event) {
			var link = event.target && event.target.closest ? event.target.closest("a") : null;
			if (!link) return;
			var href = String(link.getAttribute("href") || "");
			if (
				link.dataset.shLogout === "1" ||
				href === "/logout" ||
				href.indexOf("/logout?") === 0 ||
				href.indexOf("/api/method/logout") === 0
			) {
				event.preventDefault();
				logout("/skillshub");
			}
		});
	}

	function api(path, options) {
		return fetch(
			path,
			Object.assign({ credentials: "include", headers: getHeaders() }, options || {})
		).then(function (r) {
			if (!r.ok) throw new Error("HTTP " + r.status + " (" + path + ")");
			return r.json();
		});
	}

	var context = {
		settings: null,
		bootstrap: null,
		esc: esc,
		getHeaders: getHeaders,
		api: api,
	};

	window.SHPortal = window.SHPortal || {};
	Object.assign(window.SHPortal, context);
	window.SHPortal.logout = logout;
	bindLogoutLinks();

	function updateAdminUserBadge(bootstrap) {
		var el = document.getElementById("sh-admin-user-name");
		if (el && bootstrap && bootstrap.user && bootstrap.user !== "Guest") {
			el.textContent = bootstrap.user.split("@")[0];
		}
		var wrap = document.getElementById("sh-admin-user-wrap");
		if (wrap && bootstrap && bootstrap.is_logged_in) {
			wrap.style.display = "";
		}
	}

	Promise.all([
		api(
			"/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings"
		).catch(function () {
			return { message: {} };
		}),
		api("/api/method/skillshub_core.skillshub_portal.api.get_portal_bootstrap").catch(
			function () {
				return { message: {} };
			}
		),
	])
		.then(function (results) {
			var settings = (results[0] && results[0].message) || {};
			var bootstrap = (results[1] && results[1].message) || {};
			window.SHPortal.settings = settings;
			window.SHPortal.bootstrap = bootstrap;
			applyBranding(settings);
			enforceAccess(bootstrap);
			updateAdminUserBadge(bootstrap);

			var roleClass =
				bootstrap && bootstrap.is_admin
					? "sh-role-admin"
					: bootstrap && bootstrap.is_logged_in
					? "sh-role-student"
					: "sh-role-guest";
			document.body.classList.add(roleClass);
			window.dispatchEvent(
				new CustomEvent("sh-portal-ready", {
					detail: { settings: settings, bootstrap: bootstrap },
				})
			);
		})
		.catch(function (err) {
			console.warn("[SkillsHub] Portal bootstrap failed:", err);
		});
})();
