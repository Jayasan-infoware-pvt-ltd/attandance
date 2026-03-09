const { supabaseAdmin } = require('./supabase');
const { profileById } = require('./repo');

function parseBearerToken(value) {
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

async function userFromToken(token) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const profile = await profileById(data.user.id);
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    shiftStart: profile.shiftStart
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ message: 'Authorization token is required' });
    }

    const user = await userFromToken(token);
    if (!user) {
      return res.status(401).json({ message: 'Invalid token or missing employee profile' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication failed' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden for current role' });
    }

    return next();
  };
}

module.exports = {
  parseBearerToken,
  userFromToken,
  requireAuth,
  requireRole
};
