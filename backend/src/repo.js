const { supabaseAdmin } = require('./supabase');

function mapProfile(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    shiftStart: row.shift_start
  };
}

function mapAttendance(row) {
  if (!row) return null;

  return {
    id: row.id,
    employeeId: row.employee_id,
    day: row.day,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    status: row.status,
    firstDistanceMeters: row.first_distance_meters
  };
}

function mapLive(row) {
  return {
    employeeId: row.employee_id,
    latitude: row.latitude,
    longitude: row.longitude,
    speedKph: row.speed_kph,
    updatedAt: row.updated_at
  };
}

async function profileById(id) {
  const { data, error } = await supabaseAdmin
    .from('employee_profiles')
    .select('id, name, email, role, shift_start')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProfile(data) : null;
}

async function profiles() {
  const { data, error } = await supabaseAdmin
    .from('employee_profiles')
    .select('id, name, email, role, shift_start')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapProfile);
}

async function attendanceByDay(employeeId, day) {
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .select('id, employee_id, day, check_in_at, check_out_at, status, first_distance_meters')
    .eq('employee_id', employeeId)
    .eq('day', day)
    .maybeSingle();

  if (error) throw error;
  return mapAttendance(data);
}

async function upsertCheckIn({ employeeId, day, checkInAt, status, firstDistanceMeters }) {
  const payload = {
    employee_id: employeeId,
    day,
    check_in_at: checkInAt,
    status,
    first_distance_meters: firstDistanceMeters
  };

  const { data, error } = await supabaseAdmin
    .from('attendance')
    .upsert(payload, { onConflict: 'employee_id,day' })
    .select('id, employee_id, day, check_in_at, check_out_at, status, first_distance_meters')
    .single();

  if (error) throw error;
  return mapAttendance(data);
}

async function updateCheckOut({ employeeId, day, checkOutAt }) {
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .update({ check_out_at: checkOutAt })
    .eq('employee_id', employeeId)
    .eq('day', day)
    .select('id, employee_id, day, check_in_at, check_out_at, status, first_distance_meters')
    .maybeSingle();

  if (error) throw error;
  return mapAttendance(data);
}

async function monthAttendance(employeeId, fromDay, toDay) {
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .select('day, status')
    .eq('employee_id', employeeId)
    .gte('day', fromDay)
    .lte('day', toDay)
    .order('day', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function upsertLiveLocation({ employeeId, latitude, longitude, speedKph }) {
  const payload = {
    employee_id: employeeId,
    latitude,
    longitude,
    speed_kph: speedKph,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('live_locations')
    .upsert(payload, { onConflict: 'employee_id' })
    .select('employee_id, latitude, longitude, speed_kph, updated_at')
    .single();

  if (error) throw error;
  return mapLive(data);
}

async function liveLocations() {
  const { data, error } = await supabaseAdmin
    .from('live_locations')
    .select('employee_id, latitude, longitude, speed_kph, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapLive);
}

module.exports = {
  profileById,
  profiles,
  attendanceByDay,
  upsertCheckIn,
  updateCheckOut,
  monthAttendance,
  upsertLiveLocation,
  liveLocations
};
