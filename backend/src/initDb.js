const bcrypt = require('bcryptjs');
const { query } = require('./db');

async function initializeDatabase() {
  const createSql = `
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE')),
      shift_start TIME NOT NULL DEFAULT '09:00'
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id BIGSERIAL PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      check_in_at TIMESTAMPTZ,
      check_out_at TIMESTAMPTZ,
      status TEXT NOT NULL CHECK (status IN ('PRESENT', 'LATE', 'ABSENT')),
      first_distance_meters NUMERIC(10, 2),
      UNIQUE (employee_id, day)
    );

    CREATE TABLE IF NOT EXISTS live_locations (
      employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      speed_kph NUMERIC(8, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await query(createSql);

  const existingEmployees = await query('SELECT COUNT(*)::int AS count FROM employees');
  if (existingEmployees.rows[0].count > 0) return;

  const password = 'Password@123';
  const hash = await bcrypt.hash(password, 10);

  await query(
    `INSERT INTO employees (id, name, email, password_hash, role, shift_start)
     VALUES
       ('admin-1', 'HR Admin', 'admin@company.com', $1, 'ADMIN', '09:00'),
       ('emp-1', 'Ravi Kumar', 'ravi@company.com', $1, 'EMPLOYEE', '09:00'),
       ('emp-2', 'Anita Singh', 'anita@company.com', $1, 'EMPLOYEE', '09:00')`,
    [hash]
  );
}

module.exports = {
  initializeDatabase
};
