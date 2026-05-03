frappe.ready(function() {
	// Lock student and enrolment fields after pre-fill
	const fields_to_lock = ['student_name', 'program_schedule', 'sh_student', 'programme_schedule'];
	
	fields_to_lock.forEach(fieldname => {
		if (frappe.web_form.get_value(fieldname)) {
			frappe.web_form.set_df_property(fieldname, 'read_only', 1);
		}
	});
})