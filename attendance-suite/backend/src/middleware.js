const { verifyAccessToken } = require('./auth');

function parseBearerToken(value) {
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

function requireAuth(req, res, next) {
  const token = parseBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ message: 'Authorization token is required' });
  }

  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden for current role' });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  parseBearerToken
};
