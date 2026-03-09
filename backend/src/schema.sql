-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS employee_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE')),
  shift_start TIME NOT NULL DEFAULT '09:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'LATE', 'ABSENT')),
  first_distance_meters NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, day)
);

CREATE TABLE IF NOT EXISTS live_locations (
  employee_id UUID PRIMARY KEY REFERENCES employee_profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed_kph NUMERIC(8, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self_or_admin" ON employee_profiles;
CREATE POLICY "profiles_self_or_admin"
ON employee_profiles
FOR SELECT
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM employee_profiles ep WHERE ep.id = auth.uid() AND ep.role = 'ADMIN'
  )
);

DROP POLICY IF EXISTS "attendance_self_or_admin" ON attendance;
CREATE POLICY "attendance_self_or_admin"
ON attendance
FOR SELECT
USING (
  auth.uid() = employee_id
  OR EXISTS (
    SELECT 1 FROM employee_profiles ep WHERE ep.id = auth.uid() AND ep.role = 'ADMIN'
  )
);

DROP POLICY IF EXISTS "live_self_or_admin" ON live_locations;
CREATE POLICY "live_self_or_admin"
ON live_locations
FOR SELECT
USING (
  auth.uid() = employee_id
  OR EXISTS (
    SELECT 1 FROM employee_profiles ep WHERE ep.id = auth.uid() AND ep.role = 'ADMIN'
  )
);
