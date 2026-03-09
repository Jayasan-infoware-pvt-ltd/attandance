const API_BASE = 'http://localhost:4000';

const dashboard = document.getElementById('dashboard');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');

const employeeSelect = document.getElementById('employeeSelect');
const refreshBtn = document.getElementById('refreshBtn');
const todayStatus = document.getElementById('todayStatus');
const calendar = document.getElementById('calendar');
const liveLocationsBody = document.getElementById('liveLocationsBody');

let token = '';

async function fetchJson(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Failed request ${path}`);
  }

  return response.json();
}

function selectedEmployeeId() {
  return employeeSelect.value;
}

function dayCount(year, month) {
  return new Date(year, month, 0).getDate();
}

function renderCalendar(month, daysMap) {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr);
  const days = dayCount(year, monthIndex);

  const cells = [];
  for (let day = 1; day <= days; day += 1) {
    const key = `${month}-${String(day).padStart(2, '0')}`;
    const status = daysMap[key] || 'ABSENT';
    const statusClass = status === 'PRESENT' || status === 'LATE' ? status : '';

    cells.push(`
      <div class="calendar-cell">
        <div class="calendar-date">${day}</div>
        <div class="calendar-tag">
          <span class="status ${statusClass}">${status}</span>
        </div>
      </div>
    `);
  }

  calendar.innerHTML = `<div class="calendar-grid">${cells.join('')}</div>`;
}

function renderLiveLocations(rows) {
  if (!rows.length) {
    liveLocationsBody.innerHTML = '<tr><td colspan="5">No active live locations</td></tr>';
    return;
  }

  liveLocationsBody.innerHTML = rows
    .map(
      (row) => `
    <tr>
      <td>${row.employeeId}</td>
      <td>${row.latitude.toFixed(5)}</td>
      <td>${row.longitude.toFixed(5)}</td>
      <td>${row.speedKph}</td>
      <td>${new Date(row.updatedAt).toLocaleTimeString()}</td>
    </tr>
  `
    )
    .join('');
}

async function refreshEmployeeData() {
  const employeeId = selectedEmployeeId();
  if (!employeeId) return;

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [today, cal, live] = await Promise.all([
    fetchJson(`/attendance/today/${employeeId}`),
    fetchJson(`/attendance/calendar/${employeeId}?month=${month}`),
    fetchJson('/locations/live')
  ]);

  todayStatus.textContent = today ? JSON.stringify(today, null, 2) : 'No attendance record today';
  renderCalendar(month, cal.days || {});
  renderLiveLocations(live);
}

async function loadEmployees() {
  const employees = await fetchJson('/employees');
  employeeSelect.innerHTML = employees
    .filter((employee) => employee.role === 'EMPLOYEE')
    .map((employee) => `<option value="${employee.id}">${employee.name} (${employee.id})</option>`)
    .join('');
}

async function connectSocket() {
  const socket = io(API_BASE, {
    auth: {
      token
    }
  });

  socket.on('location:snapshot', renderLiveLocations);
  socket.on('location:update', async () => {
    const live = await fetchJson('/locations/live');
    renderLiveLocations(live);
  });
}

async function onLogin() {
  try {
    loginStatus.textContent = 'Logging in...';

    const payload = await fetchJson('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });

    token = payload.token;
    loginStatus.textContent = `Logged in as ${payload.user.name}`;
    dashboard.classList.remove('hidden');

    await loadEmployees();
    await refreshEmployeeData();

    refreshBtn.addEventListener('click', refreshEmployeeData);
    employeeSelect.addEventListener('change', refreshEmployeeData);

    await connectSocket();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

loginBtn.addEventListener('click', onLogin);
