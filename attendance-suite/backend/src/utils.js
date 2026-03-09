const dayjs = require('dayjs');

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function todayKey() {
  return dayjs().format('YYYY-MM-DD');
}

function getDayKey(date) {
  return dayjs(date).format('YYYY-MM-DD');
}

function shiftStartForDate(date, shiftStart = '09:00') {
  return dayjs(`${getDayKey(date)} ${shiftStart}`);
}

function isLateCheckIn(checkInDate, shiftStart, graceMinutes) {
  const threshold = shiftStart.add(graceMinutes, 'minute');
  return dayjs(checkInDate).isAfter(threshold);
}

module.exports = {
  distanceMeters,
  todayKey,
  getDayKey,
  shiftStartForDate,
  isLateCheckIn
};
