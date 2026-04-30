// Route Protection - Immediate Execution
const studentId = localStorage.getItem('sh_student_id');
const userEmail = localStorage.getItem('sh_user');

if (!studentId || !userEmail) {
    window.location.href = '/skillshub/login';
}

document.addEventListener('DOMContentLoaded', function() {
    // We already checked above, but safe to grab them again
    if (!studentId || !userEmail) return;

    // Logout handler
    document.getElementById('sh-logout').addEventListener('click', function() {
        fetch('/api/method/logout', { method: 'POST', credentials: 'include' })
        .then(() => {
            localStorage.clear();
            window.location.href = '/skillshub/login';
        });
    });

    // Elements
    const loadingState = document.getElementById('sh-loading');
    const errorState = document.getElementById('sh-error');
    const profileContent = document.getElementById('sh-profile-content');

    // Fetch Profile Data
    fetch(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${studentId}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        },
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data && data.message) {
            renderProfile(data.message);
        } else {
            throw new Error("Invalid data format returned");
        }
    })
    .catch(err => {
        console.error("Failed to load profile:", err);
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
    });

    function renderProfile(summary) {
        // Hide loading, show content
        loadingState.style.display = 'none';
        errorState.style.display = 'none';
        profileContent.style.display = 'block';

        const s = summary.student || {};
        
        // Header
        const fullName = s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : s.student_name;
        document.getElementById('ph-name').textContent = fullName || 'Student';
        const cohort = s.current_cohort || 'No Cohort';
        const path = s.programme_path || 'No Path Assigned';
        document.getElementById('ph-cohort-path').textContent = `${cohort} • ${path}`;

        // Sidebar
        document.getElementById('ps-id').textContent = s.name || '--';
        document.getElementById('ps-age').textContent = s.age || '--';
        document.getElementById('ps-gender').textContent = s.gender || '--';
        const location = [s.address_line_1, s.address_line_2, s.city].filter(Boolean).join(', ');
        document.getElementById('ps-location').textContent = location || '--';
        document.getElementById('ps-status').textContent = s.status || '--';

        // Timeline
        const container = document.getElementById('sh-timeline-container');
        container.innerHTML = '';
        const enrolments = summary.enrolments || [];

        if (enrolments.length === 0) {
            container.innerHTML = '<p style="color: var(--color-slate-500);">No active or past programmes found.</p>';
            return;
        }

        enrolments.forEach(e => {
            const el = document.createElement('div');
            el.className = 'timeline-item';
            
            let badgeClass = 'sh-badge-enrolled';
            if (e.status === 'Completed') badgeClass = 'sh-badge-completed';
            if (e.status === 'Dropped') badgeClass = 'sh-badge-dropped';
            
            const attRate = e.attendance_rate !== undefined ? ` • ${e.attendance_rate}% Attendance` : '';

            el.innerHTML = `
                <div>
                    <div class="timeline-name">${e.milestone || e.skillshub_programme || 'Unknown Programme'} ${e.course ? '- ' + e.course : ''}</div>
                    <div class="timeline-meta">Enrolled: ${e.enrolment_date || '--'} ${attRate}</div>
                </div>
                <div class="sh-badge ${badgeClass}">${e.status || 'Enrolled'}</div>
            `;
            container.appendChild(el);
        });
    }
});
