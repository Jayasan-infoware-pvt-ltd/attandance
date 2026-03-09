require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const dayjs = require('dayjs');
const { Server } = require('socket.io');
const {
  distanceMeters,
  getDayKey,
  shiftStartForDate,
  isLateCheckIn
} = require('./utils');
const { supabaseAuth } = require('./supabase');
const {
  profileById,
  profiles,
  attendanceByDay,
  upsertCheckIn,
  updateCheckOut,
  monthAttendance,
  upsertLiveLocation,
  liveLocations
} = require('./repo');
const { requireAuth, requireRole, parseBearerToken, userFromToken } = require('./middleware');

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

  return req.user.id;
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

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const profile = await profileById(data.user.id);

    if (!profile) {
      return res.status(403).json({ message: 'Employee profile not found for this user' });
    }

    return res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', detail: error.message });
  }
});

app.get('/auth/me', requireAuth, async (req, res) => {
  res.json(req.user);
});

app.get('/employees', requireAuth, requireRole(['ADMIN']), async (_req, res) => {
  const rows = await profiles();
  res.json(rows);
});

app.get('/attendance/today/:employeeId', requireAuth, async (req, res) => {
  const employeeId = resolveTargetEmployeeId(req, req.params.employeeId);
  const day = getDayKey(new Date());
  const row = await attendanceByDay(employeeId, day);
  res.json(row || null);
});

app.post('/attendance/check-in', requireAuth, async (req, res) => {
  try {
    const requestedEmployeeId = req.body.employeeId || req.user.id;
    const employeeId = resolveTargetEmployeeId(req, requestedEmployeeId);
    const { latitude, longitude, timestamp } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude and longitude are required' });
    }

    const checkInAt = timestamp || new Date().toISOString();
    const day = getDayKey(checkInAt);

    const existing = await attendanceByDay(employeeId, day);
    if (existing && existing.checkInAt) {
      return res.status(409).json({ message: 'Already checked in', attendance: existing });
    }

    const employee = await profileById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
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

    const row = await upsertCheckIn({
      employeeId,
      day,
      checkInAt,
      status: late ? 'LATE' : 'PRESENT',
      firstDistanceMeters: Number(meters.toFixed(2))
    });

    return res.json(row);
  } catch (error) {
    return res.status(500).json({ message: 'Check-in failed', detail: error.message });
  }
});

app.post('/attendance/check-out', requireAuth, async (req, res) => {
  try {
    const requestedEmployeeId = req.body.employeeId || req.user.id;
    const employeeId = resolveTargetEmployeeId(req, requestedEmployeeId);
    const { timestamp } = req.body;

    const day = getDayKey(timestamp || new Date());
    const existing = await attendanceByDay(employeeId, day);

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
    const fromDay = `${month}-01`;
    const toDay = dayjs(fromDay).endOf('month').format('YYYY-MM-DD');

    const rows = await monthAttendance(employeeId, fromDay, toDay);
    const days = Object.fromEntries(rows.map((item) => [item.day, item.status]));

    return res.json({
      employeeId,
      month,
      days
    });
  } catch (error) {
    return res.status(500).json({ message: 'Calendar fetch failed', detail: error.message });
  }
});

app.get('/locations/live', requireAuth, requireRole(['ADMIN']), async (_req, res) => {
  const rows = await liveLocations();
  res.json(rows);
});

app.post('/locations/live', requireAuth, async (req, res) => {
  try {
    const requestedEmployeeId = req.body.employeeId || req.user.id;
    const employeeId = resolveTargetEmployeeId(req, requestedEmployeeId);
    const { latitude, longitude, speedKph } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude and longitude are required' });
    }

    const row = await upsertLiveLocation({
      employeeId,
      latitude,
      longitude,
      speedKph: speedKph || 0
    });

    io.to('admins').emit('location:update', row);
    io.to(`employee:${employeeId}`).emit('location:update', row);

    return res.json(row);
  } catch (error) {
    return res.status(500).json({ message: 'Location update failed', detail: error.message });
  }
});

io.use(async (socket, next) => {
  try {
    const tokenFromAuth = socket.handshake.auth ? socket.handshake.auth.token : null;
    const tokenFromHeader = parseBearerToken(socket.handshake.headers.authorization);
    const token = tokenFromAuth || tokenFromHeader;

    if (!token) {
      return next(new Error('Missing token'));
    }

    const user = await userFromToken(token);
    if (!user) {
      return next(new Error('Invalid token'));
    }

    socket.user = user;
    return next();
  } catch (_error) {
    return next(new Error('Authentication failed'));
  }
});

io.on('connection', async (socket) => {
  if (socket.user.role === 'ADMIN') {
    socket.join('admins');
    const snapshot = await liveLocations();
    socket.emit('location:snapshot', snapshot);
  } else {
    socket.join(`employee:${socket.user.id}`);
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Attendance backend running on http://localhost:${PORT}`);
});

