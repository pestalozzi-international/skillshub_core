(function () {
	"use strict";

	var state = {
		roster: [],
		recordsByStudent: {},
		recordNameByStudent: {},
	};

	var STATUS_OPTIONS = ["Present", "Late", "Absent", "Leave"];

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
			Object.assign({ credentials: "include", headers: headers() }, options || {}),
		)
			.then(function (response) {
				if (!response.ok) throw new Error("HTTP " + response.status);
				return response.json();
			})
			.then(function (json) {
				return json.message || json;
			});
	}

	function setStatus(message, isError) {
		var el = document.getElementById("att-status");
		el.textContent = message;
		el.style.color = isError ? "var(--color-red-700)" : "var(--muted-text-color)";
	}

	function getSelection() {
		return {
			schedule: document.getElementById("att-class").value,
			date: document.getElementById("att-date").value,
		};
	}

	function deskUrl(doctype, name) {
		if (!doctype || !name) return "/app";
		return (
			"/app/" +
			String(doctype).toLowerCase().replace(/\s+/g, "-") +
			"/" +
			encodeURIComponent(name)
		);
	}

	function renderRoster() {
		var container = document.getElementById("att-roster");
		if (!state.roster.length) {
			container.innerHTML =
				'<div class="sh-empty-cell">No enrolled students in this class.</div>';
			return;
		}

		container.innerHTML = state.roster
			.map(function (row) {
				var selected = state.recordsByStudent[row.student] || "Absent";
				var recordName = state.recordNameByStudent[row.student] || "";
				var buttons = STATUS_OPTIONS.map(function (status) {
					return (
						'<button class="' +
						(selected === status ? "active" : "") +
						'" data-student="' +
						esc(row.student) +
						'" data-status="' +
						esc(status) +
						'">' +
						esc(status) +
						"</button>"
					);
				}).join("");

				return (
					"" +
					'<div class="att-row">' +
					"<div>" +
					'<div style="font-weight:600;">' +
					esc(row.student_name || row.student) +
					"</div>" +
					'<div style="font-size:0.78rem;color:var(--muted-text-color);">' +
					esc(row.student) +
					(recordName
						? ' · <a href="' +
							deskUrl("SH Attendance", recordName) +
							'" target="_blank" style="text-decoration:none;">Desk ↗</a>'
						: "") +
					"</div>" +
					"</div>" +
					'<div class="att-status">' +
					buttons +
					"</div>" +
					"</div>"
				);
			})
			.join("");
	}

	function loadClassOptions() {
		api(
			'/api/resource/SH Class?fields=["name","skillshub_course","course_run","class_no"]&limit_page_length=1000',
		)
			.then(function (response) {
				var classes = (response && response.data) || [];
				var select = document.getElementById("att-class");
				classes.forEach(function (item) {
					var option = document.createElement("option");
					option.value = item.name;
					option.textContent =
						item.name +
						" · " +
						(item.skillshub_course || "Course") +
						" · " +
						(item.course_run || "");
					select.appendChild(option);
				});
			})
			.catch(function () {
				setStatus("Failed to load classes.", true);
			});
	}

	function loadRosterAndRecords() {
		var selection = getSelection();
		if (!selection.schedule || !selection.date) {
			setStatus("Choose class and date first.", true);
			return;
		}

		setStatus("Loading roster...");
		Promise.all([
			api(
				"/api/method/skillshub_core.skillshub_portal.api.get_attendance_roster?schedule=" +
					encodeURIComponent(selection.schedule),
			),
			api(
				"/api/method/skillshub_core.skillshub_portal.api.get_attendance_records?schedule=" +
					encodeURIComponent(selection.schedule) +
					"&date=" +
					encodeURIComponent(selection.date),
			),
		])
			.then(function (results) {
				var roster = results[0] || [];
				var records = results[1] || [];
				state.roster = roster;
				state.recordsByStudent = {};
				state.recordNameByStudent = {};
				records.forEach(function (record) {
					state.recordsByStudent[record.sh_student] = record.status || "Absent";
					state.recordNameByStudent[record.sh_student] = record.name || "";
				});
				roster.forEach(function (row) {
					if (!state.recordsByStudent[row.student])
						state.recordsByStudent[row.student] = "Absent";
				});
				renderRoster();
				setStatus("Loaded " + roster.length + " students for " + selection.date + ".");
			})
			.catch(function (error) {
				setStatus("Failed to load attendance: " + error.message, true);
			});
	}

	function saveAttendance() {
		var selection = getSelection();
		if (!selection.schedule || !selection.date) {
			setStatus("Choose class and date first.", true);
			return;
		}
		if (!state.roster.length) {
			setStatus("No roster loaded.", true);
			return;
		}
		var payload = state.roster.map(function (row) {
			return {
				student: row.student,
				status: state.recordsByStudent[row.student] || "Absent",
			};
		});

		var button = document.getElementById("btn-save-att");
		button.disabled = true;
		button.textContent = "Saving...";

		api("/api/method/skillshub_core.skillshub_portal.api.save_attendance", {
			method: "POST",
			body: JSON.stringify({
				schedule: selection.schedule,
				date: selection.date,
				attendance_records: payload,
			}),
		})
			.then(function (result) {
				setStatus(
					"Saved attendance. Created: " +
						(result.created || 0) +
						", updated: " +
						(result.updated || 0) +
						".",
				);
			})
			.catch(function (error) {
				setStatus("Save failed: " + error.message, true);
			})
			.finally(function () {
				button.disabled = false;
				button.textContent = "Save";
			});
	}

	function bindEvents() {
		document.getElementById("btn-load-att").addEventListener("click", loadRosterAndRecords);
		document.getElementById("btn-save-att").addEventListener("click", saveAttendance);

		document.getElementById("att-roster").addEventListener("click", function (event) {
			var button = event.target.closest("button[data-student][data-status]");
			if (!button) return;
			var student = button.getAttribute("data-student");
			var status = button.getAttribute("data-status");
			state.recordsByStudent[student] = status;
			renderRoster();
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		var today = new Date();
		document.getElementById("att-date").value = today.toISOString().slice(0, 10);
		bindEvents();
		loadClassOptions();
	});
})();
