// Copyright (c) 2026, PI Dev and contributors
// For license information, please see license.txt

frappe.query_reports["SH Programme Overview"] = {
	filters: [
		{
			fieldname: "view",
			label: __("View"),
			fieldtype: "Select",
			options: "Class Summary\nStudent Detail",
			default: "Class Summary",
			reqd: 1,
			on_change: function () {
				frappe.query_report.refresh();
			},
		},
		{
			fieldname: "academic_year",
			label: __("Academic Year"),
			fieldtype: "Link",
			options: "SH Academic Year",
		},
		{
			fieldname: "cohort",
			label: __("Cohort"),
			fieldtype: "Link",
			options: "SH Cohort",
		},
		{
			fieldname: "intake_year",
			label: __("Intake Year (Student)"),
			fieldtype: "Data",
			description: "e.g. 2024",
		},
		{
			fieldname: "programme",
			label: __("Programme"),
			fieldtype: "Select",
			options:
				"\nMindset Camp\nSoft Skills Programme\nVocational Training\nRemedial Programme: Literacy and Numeracy",
		},
		{
			fieldname: "course",
			label: __("Course"),
			fieldtype: "Link",
			options: "SkillsHub Course",
		},
		{
			fieldname: "course_run",
			label: __("Course Run"),
			fieldtype: "Data",
		},
		{
			fieldname: "programme_path",
			label: __("Programme Path"),
			fieldtype: "Data",
			description: "e.g. Path A",
		},
		{
			fieldname: "enrolment_status",
			label: __("Enrolment Status"),
			fieldtype: "Select",
			options: "\nEnrolled\nCompleted\nDropped",
		},
		{
			fieldname: "student",
			label: __("Student"),
			fieldtype: "Link",
			options: "SH Student",
		},
	],

	formatter: function (value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		// Total row: data is null — suppress meaningless averaged percentages
		if (!data) {
			if (column.fieldname === "baseline_pct" || column.fieldname === "feedback_pct") {
				return "";
			}
			return value;
		}

		// Detect total row when data object exists but has no primary key
		const isTotalRow = !data.class_name && !data.student;

		if (
			[
				"fb_mindset_camp",
				"fb_soft_skills",
				"fb_vocational",
				"fb_edulution",
				"fb_attachment",
			].includes(column.fieldname) &&
			(data[column.fieldname] === null || data[column.fieldname] === undefined)
		) {
			return '<span style="color:#cbd5e1;">—</span>';
		}
		if (column.fieldname === "baseline_pct" || column.fieldname === "feedback_pct") {
			// Suppress averaged total-row percentage — it's mathematically meaningless
			if (isTotalRow) return "";
			const v = parseFloat(value);
			if (!isNaN(v)) {
				const color = v >= 90 ? "#15803d" : v >= 60 ? "#d97706" : "#dc2626";
				return `<span style="color:${color};font-weight:600">${value}</span>`;
			}
		}
		if (column.fieldname === "status") {
			const colors = { Enrolled: "#1d4ed8", Completed: "#15803d", Dropped: "#dc2626" };
			const c = colors[data.status];
			if (c)
				return `<span style="color:${c};font-weight:600">${frappe.utils.escape_html(
					data.status || "",
				)}</span>`;
		}
		return value;
	},

	get_datatable_options: function (options) {
		return Object.assign(options, { showTotalRow: true, frozenColumnsNumber: 1 });
	},
};
