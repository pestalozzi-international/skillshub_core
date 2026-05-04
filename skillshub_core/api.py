@frappe.whitelist(allow_guest=True)
def find_student_by_email(email):
    """
    Return student name for a given login email (safe server-side lookup).
    Use this from frontend instead of calling client.get_list with filters that may be rejected.
    """
    if not email:
        return None
    found = frappe.get_all('SH Student', filters=[['user_login_email', '=', email]], fields=['name'], limit=1)
    return found[0]['name'] if found else None
