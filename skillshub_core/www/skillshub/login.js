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

            // 1. Explicitly grab the text values (ensure you are using .value)
            const emailVal = document.getElementById('usr').value.trim();
            const pwdVal = document.getElementById('pwd').value;

            // 2. Package as standard Form Data
            const formData = new FormData();
            formData.append('usr', emailVal);
            formData.append('pwd', pwdVal);

            // 3. Fetch without manual JSON headers (fetch handles FormData headers automatically)
            fetch('/api/method/login', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === "Logged In" || data.message === "No App" || data.full_name) {
                    // Save user to localStorage
                    localStorage.setItem('sh_user', emailVal);
                    
                    // 2. Fetch SH Student to determine RBAC routing
                    return fetch(`/api/resource/SH Student?filters=[["portal_user_account","=","${emailVal}"]]&fields=["name"]`, {
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
