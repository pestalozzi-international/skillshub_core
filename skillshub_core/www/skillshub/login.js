// ---------------------------------------------------------------------------
// Route guard — redirect already-authenticated users immediately
// ---------------------------------------------------------------------------
(function () {
  const role = localStorage.getItem('sh_role');
  const studentId = localStorage.getItem('sh_student_id');

  if (role === 'admin') {
    window.location.href = '/skillshub/admin/students';
  } else if (role === 'teacher') {
    window.location.href = '/skillshub/attendance';
  } else if (studentId) {
    window.location.href = '/skillshub/profile';
  }
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether the user typed a bare Student ID (e.g. "SH260043") rather
 * than a full email address and append the portal domain if so.
 * Pattern: starts with SH (case-insensitive), followed only by digits/dots.
 * Examples:  SH260043  →  SH260043@pestalozzi.education
 *            SH.26.0043 → SH.26.0043@pestalozzi.education
 *            jane@example.com → unchanged
 */
function resolveLoginEmail(input) {
  const bare = input.trim();
  if (!bare.includes('@') && /^SH[\d.]+$/i.test(bare)) {
    return bare + '@pestalozzi.education';
  }
  return bare;
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function () {
  const form        = document.getElementById('sh-login-form');
  const usrInput    = document.getElementById('usr');
  const pwdInput    = document.getElementById('pwd');
  const errorMsg    = document.getElementById('login-error');
  const loginBtn    = document.getElementById('login-btn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorMsg.style.display = 'none';
    loginBtn.textContent = 'Signing in…';
    loginBtn.disabled = true;

    const rawInput   = usrInput.value.trim();
    const loginEmail = resolveLoginEmail(rawInput);

    try {
      // ── Step 1: Frappe session login ──────────────────────────────────
      const formData = new FormData();
      formData.append('usr', loginEmail);
      formData.append('pwd', pwdInput.value);

      const loginRes  = await fetch('/api/method/login', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const loginData = await loginRes.json();

      // Frappe returns "Logged In" or "No App" (when no default desk app
      // is assigned) — both mean authentication succeeded.
      const loginOk =
        loginData.message === 'Logged In' ||
        loginData.message === 'No App'    ||
        !!loginData.full_name;

      if (!loginOk) {
        throw new Error(loginData.message || 'Login failed. Please check your credentials.');
      }

      // Store the display value (what the user typed) separately from the
      // Frappe account email so the UI shows "SH260043" not the full address.
      localStorage.setItem('sh_user', loginEmail);
      localStorage.setItem('sh_display_user', rawInput);

      // ── Step 2: Is this a Student? ────────────────────────────────────
      const studentRes = await fetch(
        `/api/resource/SH Student?filters=${encodeURIComponent(
          JSON.stringify([['portal_user_account', '=', loginEmail]])
        )}&fields=${encodeURIComponent(JSON.stringify(['name']))}&limit=1`,
        {
          headers: { 'Accept': 'application/json' },
          credentials: 'include',
        }
      );
      if (!studentRes.ok) throw new Error('Unable to verify student record.');
      const studentData = await studentRes.json();

      if (studentData.data && studentData.data.length > 0) {
        localStorage.setItem('sh_student_id', studentData.data[0].name);
        localStorage.removeItem('sh_role');
        window.location.href = '/skillshub/profile';
        return;
      }

      // ── Step 3: Check Frappe roles for admin / teacher routing ────────
      const roleRes = await fetch(
        `/api/resource/Has Role?filters=${encodeURIComponent(
          JSON.stringify([
            ['parent', '=', loginEmail],
            ['role', 'in', ['System Manager', 'PI Admin', 'SH Teacher']],
          ])
        )}&fields=${encodeURIComponent(JSON.stringify(['role']))}&limit=5`,
        {
          headers: { 'Accept': 'application/json' },
          credentials: 'include',
        }
      );
      if (!roleRes.ok) throw new Error('Unable to verify user roles.');
      const roleData = await roleRes.json();

      const roles = (roleData.data || []).map(r => r.role);

      localStorage.removeItem('sh_student_id');

      if (roles.includes('System Manager') || roles.includes('PI Admin')) {
        // SH Admin
        localStorage.setItem('sh_role', 'admin');
        window.location.href = '/skillshub/admin/students';
        return;
      }

      if (roles.includes('SH Teacher')) {
        // SH Teacher / Instructor
        localStorage.setItem('sh_role', 'teacher');
        window.location.href = '/skillshub/attendance';
        return;
      }

      // ── Step 4: Fallback — any authenticated staff goes to attendance ──
      localStorage.setItem('sh_role', 'teacher');
      window.location.href = '/skillshub/attendance';

    } catch (err) {
      errorMsg.textContent = err.message || 'An error occurred during login.';
      errorMsg.style.display = 'block';
      loginBtn.textContent = 'Sign In';
      loginBtn.disabled = false;
    }
  });
});
