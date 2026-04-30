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

            const emailInput = document.getElementById('usr').value;
            const passwordInput = document.getElementById('pwd').value;

            // 1. Post to standard Frappe login
            fetch('/api/method/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ usr: emailInput, pwd: passwordInput })
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === "Logged In") {
                    // Save user to localStorage
                    localStorage.setItem('sh_user', emailInput);
                    
                    // 2. Fetch SH Student to determine RBAC routing
                    return fetch(`/api/resource/SH Student?filters=[["portal_user_account","=","${emailInput}"]]&fields=["name"]`, {
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                } else {
                    throw new Error(data.message || "Login failed");
                }
            })
            .then(response => response.json())
            .then(studentData => {
                if (studentData.data && studentData.data.length > 0) {
                    // User is a Student
                    localStorage.setItem('sh_student_id', studentData.data[0].name);
                    window.location.href = '/skillshub/profile';
                } else {
                    // User is an Instructor/Admin
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
