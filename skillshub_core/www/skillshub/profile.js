document.addEventListener('DOMContentLoaded', function() {
    const studentId = localStorage.getItem('sh_student_id');
    const userEmail = localStorage.getItem('sh_user');

    if (!studentId || !userEmail) {
        window.location.href = '/skillshub/login';
        return;
    }

    // Logout handler
    document.getElementById('sh-logout').addEventListener('click', function() {
        fetch('/api/method/logout', { method: 'POST' })
        .then(() => {
            localStorage.removeItem('sh_user');
            localStorage.removeItem('sh_student_id');
            window.location.href = '/skillshub/login';
        });
    });

    // Fetch Profile Data
    fetch(`/api/method/skillshub_core.skillshub_core.api.get_student_summary?student=${studentId}`, {
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if(data.message) {
            renderProfile(data.message);
        } else {
            // Fallback if API method is not fully implemented yet, fetch from resource
            fetchFallbackData(studentId);
        }
    })
    .catch(err => {
        console.error("API failed, using fallback resource fetch", err);
        fetchFallbackData(studentId);
    });

    function fetchFallbackData(id) {
        fetch(`/api/resource/SH Student/${id}`)
        .then(res => res.json())
        .then(resData => {
            if(resData.data) {
                const student = resData.data;
                // Fetch enrolments
                fetch(`/api/resource/SH Student Enrolment?filters=[["student","=","${id}"]]&fields=["name","milestone","course","status","enrolment_date","attendance_rate"]`)
                .then(er => er.json())
                .then(eData => {
                    renderProfile({
                        student: student,
                        enrolments: eData.data || []
                    });
                });
            }
        });
    }

    function renderProfile(summary) {
        document.getElementById('sh-loading').style.display = 'none';
        document.getElementById('sh-profile-content').style.display = 'block';

        const s = summary.student || {};
        
        // Header
        document.getElementById('ph-name').textContent = s.student_name || s.first_name + ' ' + s.last_name || 'Unknown Student';
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
            container.innerHTML = '<p style="color: #64748b;">No active or past programmes found.</p>';
            return;
        }

        enrolments.forEach(e => {
            const el = document.createElement('div');
            el.className = 'sh-timeline-item';
            
            const badgeClass = e.status === 'Completed' ? 'sh-status-completed' 
                             : e.status === 'Dropped' ? 'sh-status-dropped' 
                             : 'sh-status-enrolled';
            
            const attRate = e.attendance_rate !== undefined ? ` • ${e.attendance_rate}% Attendance` : '';

            el.innerHTML = `
                <div>
                    <div class="sh-programme-name">${e.milestone || e.skillshub_programme || 'Unknown Programme'} ${e.course ? '- ' + e.course : ''}</div>
                    <div class="sh-programme-meta">Enrolled: ${e.enrolment_date || '--'} ${attRate}</div>
                </div>
                <div class="sh-status-badge ${badgeClass}">${e.status || 'Enrolled'}</div>
            `;
            container.appendChild(el);
        });
    }
});
