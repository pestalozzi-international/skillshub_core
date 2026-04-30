document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('sh-login-form');
    const errorDiv = document.getElementById('login-error');
    const loginBtn = document.getElementById('login-btn');

    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            errorDiv.style.display = 'none';
            loginBtn.textContent = 'Signing in...';
            loginBtn.disabled = true;

            const usr = document.getElementById('usr').value;
            const pwd = document.getElementById('pwd').value;

            // 1. Post to standard Frappe login
            fetch('/api/method/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ usr: usr, pwd: pwd })
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === "Logged In") {
                    // 2. Fetch logged in user
                    return fetch('/api/method/frappe.auth.get_logged_user');
                } else {
                    throw new Error(data.message || "Login failed");
                }
            })
            .then(response => response.json())
            .then(userData => {
                const userEmail = userData.message;
                localStorage.setItem('sh_user', userEmail);
                
                // 3. Find if this user is linked to an SH Student
                return fetch(`/api/resource/SH Student?filters=[["portal_user_account","=","${userEmail}"]]&fields=["name"]`);
            })
            .then(response => response.json())
            .then(studentData => {
                if (studentData.data && studentData.data.length > 0) {
                    // Student login -> Profile
                    localStorage.setItem('sh_student_id', studentData.data[0].name);
                    window.location.href = '/skillshub/profile';
                } else {
                    // Instructor or Admin login -> Attendance
                    localStorage.removeItem('sh_student_id');
                    window.location.href = '/skillshub/attendance'; 
                }
            })
            .catch(error => {
                console.error('Authentication Error:', error);
                errorDiv.textContent = 'Invalid credentials. Please try again.';
                errorDiv.style.display = 'block';
                loginBtn.textContent = 'Sign In';
                loginBtn.disabled = false;
            });
        });
    }
});
