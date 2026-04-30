// Route guard: check if already logged in
const existingStudentId = localStorage.getItem('sh_student_id');
const existingRole = localStorage.getItem('sh_role');
if (existingStudentId) {
  window.location.href = '/skillshub/profile';
} else if (existingRole === 'admin') {
  window.location.href = '/skillshub/admin/students';
}

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('sh-login-form');
  const usernameInput = document.getElementById('usr');
  const passwordInput = document.getElementById('pwd');
  const errorMsg = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    errorMsg.style.display = 'none';
    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled = true;

    const emailVal = usernameInput.value.trim();
    const passwordVal = passwordInput.value;

    try {
      // Step 1: POST /api/method/login via FormData
      const formData = new FormData();
      formData.append('usr', emailVal);
      formData.append('pwd', passwordVal);

      const loginResponse = await fetch('/api/method/login', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const loginData = await loginResponse.json();
      if (loginData.message !== 'Logged In' && loginData.message !== 'No App' && !loginData.full_name) {
        throw new Error(loginData.message || 'Login failed. Please check your credentials.');
      }

      // Step 2: Fetch SH Student by portal_user_account
      const studentResponse = await fetch(
        `/api/resource/SH Student?filters=[["portal_user_account","=","${emailVal}"]]&fields=["name"]&limit=1`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        }
      );

      if (!studentResponse.ok) throw new Error('Failed to fetch student record.');
      const studentData = await studentResponse.json();

      // Step 3a: Student found → profile
      if (studentData.data && studentData.data.length > 0) {
        localStorage.setItem('sh_student_id', studentData.data[0].name);
        localStorage.setItem('sh_user', emailVal);
        localStorage.removeItem('sh_role');
        window.location.href = '/skillshub/profile';
        return;
      }

      // Step 3b: Check for admin role
      const roleResponse = await fetch(
        `/api/resource/Has Role?filters=[["parent","=","${emailVal}"],["role","in",["System Manager","PI Admin"]]]&fields=["role"]&limit=1`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        }
      );

      if (!roleResponse.ok) throw new Error('Failed to check admin role.');
      const roleData = await roleResponse.json();

      if (roleData.data && roleData.data.length > 0) {
        localStorage.removeItem('sh_student_id');
        localStorage.setItem('sh_user', emailVal);
        localStorage.setItem('sh_role', 'admin');
        window.location.href = '/skillshub/admin/students';
        return;
      }

      // Step 3c: Instructor/staff → attendance
      localStorage.removeItem('sh_student_id');
      localStorage.removeItem('sh_role');
      localStorage.setItem('sh_user', emailVal);
      window.location.href = '/skillshub/attendance';

    } catch (error) {
      errorMsg.textContent = error.message || 'An error occurred during login.';
      errorMsg.style.display = 'block';
      loginBtn.textContent = 'Sign In';
      loginBtn.disabled = false;
    }
  });
});
