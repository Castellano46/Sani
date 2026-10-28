const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, generateSessionToken, COOKIE_NAME } = require('../middleware/auth');

// Rate limiting can be applied in main index.js for this router

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña obligatorios.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim());
  if (!admin) {
    // Timing safe comparison to prevent user enumeration
    bcrypt.compareSync(password, '$2a$12$e80s0e0s0e0s0e0s0e0s0u1234567890123456789012345678901');
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const match = bcrypt.compareSync(password, admin.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  // Generate session valid for 7 days
  const token = generateSessionToken();
  const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

  // Clean old expired sessions
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);

  db.prepare('INSERT INTO sessions (id, admin_id, expires_at) VALUES (?, ?, ?)')
    .run(token, admin.id, expiresAt);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  return res.json({
    success: true,
    message: 'Sesión iniciada correctamente',
    username: admin.username,
    token: token
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
  }
  res.clearCookie(COOKIE_NAME);
  return res.json({ success: true, message: 'Sesión cerrada correctamente.' });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.json({ authenticated: false });
  }

  const now = Math.floor(Date.now() / 1000);
  const session = db.prepare(`
    SELECT a.username, s.id as token
    FROM sessions s
    JOIN admins a ON s.admin_id = a.id
    WHERE s.id = ? AND s.expires_at > ?
  `).get(token, now);

  if (!session) {
    res.clearCookie(COOKIE_NAME);
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    username: session.username,
    token: session.token
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'La contraseña actual y la nueva son requeridas.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  const match = bcrypt.compareSync(currentPassword, admin.password_hash);
  if (!match) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  }

  const salt = bcrypt.genSaltSync(12);
  const newHash = bcrypt.hashSync(newPassword, salt);

  db.prepare('UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newHash, req.admin.id);

  // Invalidate all other sessions except current
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND id != ?')
    .run(req.admin.id, req.admin.sessionId);

  return res.json({ success: true, message: 'Contraseña actualizada con éxito.' });
});

module.exports = router;
