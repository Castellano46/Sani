require('dotenv').config();
process.env.TZ = process.env.TZ || 'Europe/Madrid';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Database initialization
require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.tile.openstreetmap.org", "https://*.openstreetmap.org", "https://unpkg.com", "https://maps.gstatic.com", "https://*.google.com"],
      connectSrc: ["'self'", "https://*.openstreetmap.org", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["'self'", "https://www.google.com", "https://maps.google.com", "https://www.openstreetmap.org", "https://*.openstreetmap.org"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS setup
app.use(cors({
  origin: true,
  credentials: true
}));

// Parsing middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: ['text/plain', 'text/*'], limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'sani_instalaciones_secure_cookie_secret_2026'));

// Rate limiting for auth endpoints (brute-force defense)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso fallidos. Por favor, espera 15 minutos.' }
});

// Static files from public/ with zero-cache policy for instant updates
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }
}));

// Disable caching for all API endpoints to guarantee instant updates
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// API Routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/services', require('./routes/services'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/analytics', require('./routes/analytics'));

// Clean URL Page Routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/aviso-legal', (req, res) => {
  res.sendFile(path.join(publicDir, 'aviso-legal.html'));
});

app.get('/politica-privacidad', (req, res) => {
  res.sendFile(path.join(publicDir, 'privacidad.html'));
});

app.get('/politica-cookies', (req, res) => {
  res.sendFile(path.join(publicDir, 'cookies.html'));
});

// Centralized 404 handler for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

// Fallback to index.html for general frontend navigation
app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]:', err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Ha ocurrido un error interno en el servidor.' 
    : (err.message || 'Error del servidor.');
  res.status(status).json({ error: message });
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Sani Instalaciones - Servidor en marcha`);
    console.log(`📍 Web pública: http://localhost:${PORT}`);
    console.log(`🔐 Panel Admin: http://localhost:${PORT}/admin`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
