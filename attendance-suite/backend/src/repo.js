const { query } = require('./db');

function mapEmployeeRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    shiftStart: row.shift_start
  };
}

function mapAttendanceRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    employeeId: row.employee_id,
    day: row.day,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    status: row.status,
    firstDistanceMeters: row.first_distance_meters == null ? null : Number(row.first_distance_meters)
  };
}

function mapLocationRow(row) {
  return {
    employeeId: row.employee_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    speedKph: Number(row.speed_kph),
    updatedAt: row.updated_at
  };
}

async function findEmployeeByEmail(email) {
  const result = await query('SELECT * FROM employees WHERE email = $1 LIMIT 1', [email]);
  return result.rows[0] || null;
}

async function findEmployeeById(id) {
  const result = await query('SELECT * FROM employees WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? mapEmployeeRow(result.rows[0]) : null;
}

async function listEmployees() {
  const result = await query(
    'SELECT id, name, email, role, shift_start FROM employees ORDER BY role DESC, name ASC'
  );
  return result.rows.map(mapEmployeeRow);
}

async function getAttendanceByDay(employeeId, day) {
  const result = await query(
    `SELECT id, employee_id, day, check_in_at, check_out_at, status, first_distance_meters
     FROM attendance
     WHERE employee_id = $1 AND day = $2
     LIMIT 1`,
    [employeeId, day]
  );

  return mapAttendanceRow(result.rows[0]);
}

async function createCheckIn({ employeeId, day, checkInAt, status, distanceMeters }) {
  const result = await query(
    `INSERT INTO attendance (employee_id, day, check_in_at, check_out_at, status, first_distance_meters)
     VALUES ($1, $2, $3, NULL, $4, $5)
     ON CONFLICT (employee_id, day)
     DO UPDATE SET
       check_in_at = EXCLUDED.check_in_at,
       status = EXCLUDED.status,
       first_distance_meters = EXCLUDED.first_distance_meters
     RETURNING id, employee_id, day, check_in_at, check_out_at, status, first_distance_meters`,
    [employeeId, day, checkInAt, status, distanceMeters]
  );

  return mapAttendanceRow(result.rows[0]);
}

async function updateCheckOut({ employeeId, day, checkOutAt }) {
  const result = await query(
    `UPDATE attendance
     SET check_out_at = $3
     WHERE employee_id = $1 AND day = $2
     RETURNING id, employee_id, day, check_in_at, check_out_at, status, first_distance_meters`,
    [employeeId, day, checkOutAt]
  );

  return mapAttendanceRow(result.rows[0]);
}

async function getMonthAttendance(employeeId, month) {
  const result = await query(
    `SELECT day, status
     FROM attendance
     WHERE employee_id = $1
       AND TO_CHAR(day, 'YYYY-MM') = $2
     ORDER BY day ASC`,
    [employeeId, month]
  );

  return result.rows.map((row) => ({
    day: row.day,
    status: row.status
  }));
}

async function upsertLiveLocation({ employeeId, latitude, longitude, speedKph }) {
  const result = await query(
    `INSERT INTO live_locations (employee_id, latitude, longitude, speed_kph, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (employee_id)
     DO UPDATE SET
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       speed_kph = EXCLUDED.speed_kph,
       updated_at = NOW()
     RETURNING employee_id, latitude, longitude, speed_kph, updated_at`,
    [employeeId, latitude, longitude, speedKph]
  );

  return mapLocationRow(result.rows[0]);
}

async function listLiveLocations() {
  const result = await query(
    `SELECT employee_id, latitude, longitude, speed_kph, updated_at
     FROM live_locations
     ORDER BY updated_at DESC`
  );

  return result.rows.map(mapLocationRow);
}

module.exports = {
  findEmployeeByEmail,
  findEmployeeById,
  listEmployees,
  getAttendanceByDay,
  createCheckIn,
  updateCheckOut,
  getMonthAttendance,
  upsertLiveLocation,
  listLiveLocations
};
