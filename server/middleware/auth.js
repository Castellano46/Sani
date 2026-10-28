const crypto = require('crypto');
const db = require('../db');

const COOKIE_NAME = 'sani_admin_session';

// Helper to generate secure token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware to require admin authentication
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No autorizado. Se requiere iniciar sesión.' });
  }

  const now = Math.floor(Date.now() / 1000);
  const session = db.prepare(`
    SELECT s.id, s.admin_id, s.expires_at, a.username
    FROM sessions s
    JOIN admins a ON s.admin_id = a.id
    WHERE s.id = ? AND s.expires_at > ?
  `).get(token, now);

  if (!session) {
    // Clear invalid cookie
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Sesión expirada o inválida. Por favor, inicia sesión de nuevo.' });
  }

  req.admin = {
    id: session.admin_id,
    username: session.username,
    sessionId: session.id
  };

  next();
}

module.exports = {
  requireAuth,
  generateSessionToken,
  COOKIE_NAME
};
