require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const dayjs = require('dayjs');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const {
  distanceMeters,
  getDayKey,
  shiftStartForDate,
  isLateCheckIn
} = require('./utils');
const { initializeDatabase } = require('./initDb');
const { signAccessToken, verifyAccessToken } = require('./auth');
const { requireAuth, requireRole, parseBearerToken } = require('./middleware');
const {
  findEmployeeByEmail,
  findEmployeeById,
  listEmployees,
  getAttendanceByDay,
  createCheckIn,
  updateCheckOut,
  getMonthAttendance,
  upsertLiveLocation,
  listLiveLocations
} = require('./repo');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const PORT = Number(process.env.PORT || 4000);
const OFFICE_LAT = Number(process.env.OFFICE_LAT || 28.6139);
const OFFICE_LNG = Number(process.env.OFFICE_LNG || 77.2090);
const GEOFENCE_RADIUS_METERS = Number(process.env.GEOFENCE_RADIUS_METERS || 150);
const LATE_GRACE_MINUTES = Number(process.env.LATE_GRACE_MINUTES || 10);

app.use(cors());
app.use(express.json());

function resolveTargetEmployeeId(req, fromBodyOrParams) {
  if (req.user.role === 'ADMIN') {
    return fromBodyOrParams;
  }

  return req.user.sub;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'attendance-backend' });
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await findEmployeeByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signAccessToken({
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', detail: error.message });
  }
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = await findEmployeeById(req.user.sub);
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(user);
});

app.get('/employees', requireAuth, requireRole(['ADMIN']), async (_req, res) => {
  const rows = await listEmployees();
  res.json(rows);
});

app.get('/attendance/today/:employeeId', requireAuth, async (req, res) => {
  const employeeId = resolveTargetEmployeeId(req, req.params.employeeId);
  const day = getDayKey(new Date());
  const row = await getAttendanceByDay(employeeId, day);
  res.json(row || null);
});

app.post('/attendance/check-in', requireAuth, async (req, res) => {
  try {
    const requestedEmployeeId = req.body.employeeId || req.user.sub;
    const employeeId = resolveTargetEmployeeId(req, requestedEmployeeId);
    const { latitude, longitude, timestamp } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude and longitude are required' });
    }

    const employee = await findEmployeeById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const checkInAt = timestamp || new Date().toISOString();
    const day = getDayKey(checkInAt);

    const existing = await getAttendanceByDay(employeeId, day);
    if (existing && existing.checkInAt) {
      return res.status(409).json({ message: 'Already checked in', attendance: existing });
    }

    const meters = distanceMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
    if (meters > GEOFENCE_RADIUS_METERS) {
      return res.status(403).json({
        message: 'Check-in denied. Employee is outside office geofence.',
        distanceMeters: Number(meters.toFixed(2))
      });
    }

    const shiftStart = shiftStartForDate(checkInAt, employee.shiftStart);
    const late = isLateCheckIn(checkInAt, shiftStart, LATE_GRACE_MINUTES);

    const record = await createCheckIn({
      employeeId,
      day,
      checkInAt,
      status: late ? 'LATE' : 'PRESENT',
      distanceMeters: Number(meters.toFixed(2))
    });

    return res.json(record);
  } catch (error) {
    return res.status(500).json({ message: 'Check-in failed', detail: error.message });
  }
});

app.post('/attendance/check-out', requireAuth, async (req, res) => {
  try {
    const requestedEmployeeId = req.body.employeeId || req.user.sub;
    const employeeId = resolveTargetEmployeeId(req, requestedEmployeeId);
    const { timestamp } = req.body;

    const day = getDayKey(timestamp || new Date());
    const existing = await getAttendanceByDay(employeeId, day);

    if (!existing || !existing.checkInAt) {
      return res.status(400).json({ message: 'Cannot check out before check in' });
    }

    const row = await updateCheckOut({
      employeeId,
      day,
      checkOutAt: timestamp || new Date().toISOString()
    });

    return res.json(row);
  } catch (error) {
    return res.status(500).json({ message: 'Check-out failed', detail: error.message });
  }
});

app.get('/attendance/calendar/:employeeId', requireAuth, async (req, res) => {
  try {
    const requestedEmployeeId = req.params.employeeId;
    const employeeId = resolveTargetEmployeeId(req, requestedEmployeeId);
    const month = req.query.month || dayjs().format('YYYY-MM');

    const records = await getMonthAttendance(employeeId, month);
    const byDate = Object.fromEntries(records.map((row) => [row.day, row.status]));

    return res.json({
      employeeId,
      month,
      days: byDate
    });
  } catch (error) {
    return res.status(500).json({ message: 'Calendar fetch failed', detail: error.message });
  }
});

app.get('/locations/live', requireAuth, requireRole(['ADMIN']), async (_req, res) => {
  const rows = await listLiveLocations();
  res.json(rows);
});

app.post('/locations/live', requireAuth, async (req, res) => {
  try {
    const requestedEmployeeId = req.body.employeeId || req.user.sub;
    const employeeId = resolveTargetEmployeeId(req, requestedEmployeeId);
    const { latitude, longitude, speedKph } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude and longitude are required' });
    }

    const location = await upsertLiveLocation({
      employeeId,
      latitude,
      longitude,
      speedKph: speedKph || 0
    });

    io.to('admins').emit('location:update', location);
    io.to(`employee:${employeeId}`).emit('location:update', location);

    return res.json(location);
  } catch (error) {
    return res.status(500).json({ message: 'Location update failed', detail: error.message });
  }
});

io.use((socket, next) => {
  const tokenFromAuth = socket.handshake.auth ? socket.handshake.auth.token : null;
  const tokenFromHeader = parseBearerToken(socket.handshake.headers.authorization);
  const token = tokenFromAuth || tokenFromHeader;

  if (!token) {
    return next(new Error('Missing token'));
  }

  try {
    socket.user = verifyAccessToken(token);
    return next();
  } catch (error) {
    return next(new Error('Invalid token'));
  }
});

io.on('connection', async (socket) => {
  const role = socket.user.role;

  if (role === 'ADMIN') {
    socket.join('admins');
    const snapshot = await listLiveLocations();
    socket.emit('location:snapshot', snapshot);
  } else {
    socket.join(`employee:${socket.user.sub}`);
  }
});

async function start() {
  await initializeDatabase();

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Attendance backend running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start backend', error);
  process.exit(1);
});
