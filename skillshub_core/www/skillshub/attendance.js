document.addEventListener('DOMContentLoaded', function() {
    const userEmail = localStorage.getItem('sh_user');
    if (!userEmail) {
        window.location.href = '/skillshub/login';
        return;
    }

    const scheduleSelect = document.getElementById('schedule-select');
    const dateInput = document.getElementById('attendance-date');
    const attendanceArea = document.getElementById('sh-attendance-area');
    const studentList = document.getElementById('student-list');
    const submitBtn = document.getElementById('submit-att-btn');
    const offlineBadge = document.getElementById('offline-badge');
    const syncBtn = document.getElementById('sync-btn');

    // Set today's date
    dateInput.valueAsDate = new Date();

    let currentStudents = [];
    let attendanceQueue = JSON.parse(localStorage.getItem('sh_attendance_queue') || '[]');

    updateSyncUI();

    // 1. Fetch available schedules (Instructors typically see active schedules)
    fetch('/api/resource/SH Programme Schedule?filters=[["status","=","Active"]]&fields=["name","skillshub_programme","skillshub_course","cohort"]')
    .then(res => res.json())
    .then(data => {
        if(data.data) {
            data.data.forEach(sch => {
                const opt = document.createElement('option');
                opt.value = sch.name;
                opt.textContent = `${sch.skillshub_programme} ${sch.skillshub_course ? '- ' + sch.skillshub_course : ''} (${sch.cohort})`;
                scheduleSelect.appendChild(opt);
            });
        }
    })
    .catch(err => console.error("Could not load schedules", err));

    // 2. On Schedule Select -> Load Roster
    scheduleSelect.addEventListener('change', function() {
        if(!this.value) {
            attendanceArea.style.display = 'none';
            return;
        }

        fetch(`/api/resource/SH Programme Schedule/${this.value}?fields=["enrolled_students"]`)
        .then(res => res.json())
        .then(data => {
            const doc = data.data;
            if(doc && doc.enrolled_students && doc.enrolled_students.length > 0) {
                currentStudents = doc.enrolled_students;
                renderRoster(currentStudents);
                attendanceArea.style.display = 'block';
            } else {
                studentList.innerHTML = '<p>No students enrolled in this schedule.</p>';
                submitBtn.disabled = true;
                attendanceArea.style.display = 'block';
            }
        });
    });

    function renderRoster(students) {
        studentList.innerHTML = '';
        submitBtn.disabled = false;

        students.forEach(s => {
            const row = document.createElement('div');
            row.className = 'sh-student-row';
            row.innerHTML = `
                <div>
                    <div class="sh-student-info">${s.student_name}</div>
                    <div class="sh-student-id">${s.student}</div>
                </div>
                <div class="sh-toggle-group" data-student="${s.student}">
                    <button class="sh-toggle-btn present">Present</button>
                    <button class="sh-toggle-btn absent">Absent</button>
                </div>
            `;
            studentList.appendChild(row);

            // Toggle logic
            const btns = row.querySelectorAll('.sh-toggle-btn');
            btns.forEach(btn => {
                btn.addEventListener('click', function() {
                    btns.forEach(b => b.classList.remove('present', 'absent'));
                    if(this.textContent === 'Present') {
                        this.classList.add('present');
                    } else {
                        this.classList.add('absent');
                    }
                });
            });
        });
    }

    // 3. Submit Attendance
    submitBtn.addEventListener('click', function() {
        const date = dateInput.value;
        const schedule = scheduleSelect.value;
        if(!schedule || !date) return alert("Select schedule and date.");

        const records = [];
        const rows = studentList.querySelectorAll('.sh-toggle-group');
        let allMarked = true;

        rows.forEach(row => {
            const studentId = row.getAttribute('data-student');
            const activeBtn = row.querySelector('.sh-toggle-btn.present, .sh-toggle-btn.absent');
            if(!activeBtn) allMarked = false;
            
            const status = activeBtn ? activeBtn.textContent : 'Absent'; // default fallback
            records.push({
                student: studentId,
                status: status
            });
        });

        if(!allMarked) {
            if(!confirm("Some students are unmarked and will default to Absent. Continue?")) return;
        }

        const payload = {
            schedule: schedule,
            date: date,
            records: records
        };

        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        // Try API
        fetch('/api/method/skillshub_core.skillshub_core.api.mark_attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if(!response.ok) throw new Error("Network response was not ok");
            return response.json();
        })
        .then(data => {
            alert("Attendance submitted successfully!");
            resetForm();
        })
        .catch(err => {
            console.warn("Offline or API failure. Saving locally.", err);
            saveToQueue(payload);
            resetForm();
        });
    });

    function resetForm() {
        submitBtn.textContent = 'Submit Attendance';
        submitBtn.disabled = false;
        scheduleSelect.value = '';
        attendanceArea.style.display = 'none';
        studentList.innerHTML = '';
    }

    function saveToQueue(payload) {
        attendanceQueue.push(payload);
        localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
        updateSyncUI();
        offlineBadge.style.display = 'inline-block';
        setTimeout(() => offlineBadge.style.display = 'none', 3000);
    }

    function updateSyncUI() {
        if (attendanceQueue.length > 0) {
            syncBtn.style.display = 'inline-block';
            syncBtn.textContent = `Sync Now (${attendanceQueue.length})`;
        } else {
            syncBtn.style.display = 'none';
        }
    }

    // 4. Sync Function
    syncBtn.addEventListener('click', function() {
        if(attendanceQueue.length === 0) return;
        
        syncBtn.textContent = 'Syncing...';
        syncBtn.disabled = true;

        const syncPromises = attendanceQueue.map(payload => {
            return fetch('/api/method/skillshub_core.skillshub_core.api.mark_attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            }).then(res => {
                if(!res.ok) throw new Error("Sync failed");
                return res.json();
            });
        });

        Promise.allSettled(syncPromises).then(results => {
            let successCount = 0;
            const newQueue = [];
            
            results.forEach((result, idx) => {
                if(result.status === 'fulfilled') {
                    successCount++;
                } else {
                    newQueue.push(attendanceQueue[idx]);
                }
            });

            attendanceQueue = newQueue;
            localStorage.setItem('sh_attendance_queue', JSON.stringify(attendanceQueue));
            updateSyncUI();
            
            syncBtn.disabled = false;
            if(successCount > 0) {
                alert(`Successfully synced ${successCount} attendance records!`);
            } else {
                alert("Sync failed. You are still offline.");
            }
        });
    });
});
