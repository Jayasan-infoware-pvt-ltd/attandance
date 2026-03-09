# Attendance Suite (Mobile + Web + Backend)

This project now includes:

- `backend`: Express + PostgreSQL + JWT auth + role access control + Socket.IO live tracking
- `web`: Admin dashboard with login, calendar, and live location monitoring
- `mobile`: Employee app with login, check-in/out, and live location updates

## 1) Backend Setup

1. Create PostgreSQL database:

```sql
CREATE DATABASE attendance_db;
```

2. Start backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs at `http://localhost:4000`.

Database schema auto-initializes on startup. You can also review SQL at `backend/src/schema.sql`.

## Default Seeded Accounts

Password for all accounts: `Password@123`

- Admin: `admin@company.com`
- Employee 1: `ravi@company.com`
- Employee 2: `anita@company.com`

## 2) Web Admin Setup

```bash
cd web
npm run start
```

Open: `http://localhost:5173`

Login using admin account.

## 3) Mobile Setup (Expo)

```bash
cd mobile
npm install
npm start
```

Important for Android emulator:

- `API_BASE` in `mobile/App.js` is set to `http://10.0.2.2:4000`

For real device, set `API_BASE` to your PC LAN IP, for example:

- `http://192.168.1.10:4000`

Login on mobile using an employee account.

## Auth + Roles

- `ADMIN`: can list employees, view all live locations, view employee attendance calendars
- `EMPLOYEE`: can only check in/out and push own live location

## Main API Endpoints

Public:

- `POST /auth/login`
- `GET /health`

Protected (Bearer token required):

- `GET /auth/me`
- `GET /employees` (ADMIN)
- `POST /attendance/check-in`
- `POST /attendance/check-out`
- `GET /attendance/today/:employeeId`
- `GET /attendance/calendar/:employeeId?month=YYYY-MM`
- `POST /locations/live`
- `GET /locations/live` (ADMIN)

## Attendance Rules

- Check-in is allowed only inside configured geofence radius
- Status is `PRESENT` or `LATE` based on shift start + grace minutes
- Calendar endpoint returns per-day status map for the requested month

## Security Notes

Before production:

- Change `JWT_SECRET` in `.env`
- Use HTTPS everywhere
- Rotate passwords and disable default seed credentials
- Add refresh tokens and audit logs
- Add anti-spoof checks for mock GPS / rooted or jailbroken devices
