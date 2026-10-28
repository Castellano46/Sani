const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/settings (Public: returns company & contact settings)
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => {
      settings[r.key] = r.value;
    });
    res.json({ settings });
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Error al consultar la configuración.' });
  }
});

// PUT /api/settings (Admin only: update settings)
router.put('/', requireAuth, (req, res) => {
  const updates = req.body;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Datos de configuración no válidos.' });
  }

  // Allowed keys whitelist
  const allowedKeys = [
    'company_name',
    'phone',
    'phone_raw',
    'whatsapp',
    'email',
    'city',
    'province',
    'country',
    'address',
    'map_lat',
    'map_lng',
    'hero_title',
    'hero_subtitle',
    'about_intro',
    'about_text',
    'social_facebook',
    'social_instagram',
    'social_facebook_active',
    'social_instagram_active',
    'schedule_notice'
  ];

  try {
    const updateStmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const updateTx = db.transaction((data) => {
      for (const [k, v] of Object.entries(data)) {
        if (allowedKeys.includes(k)) {
          updateStmt.run(k, String(v).trim());
        }
      }
    });

    updateTx(updates);

    res.json({
      success: true,
      message: 'Configuración actualizada correctamente.'
    });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Error al guardar la configuración.' });
  }
});

// GET /api/settings/stats (Admin only: dashboard statistics summary)
router.get('/stats', requireAuth, (req, res) => {
  try {
    const pendingReviews = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE status = 'pending'").get().count;
    const totalReviews = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE status = 'approved'").get().count;
    const totalWorks = db.prepare("SELECT COUNT(*) as count FROM gallery").get().count;
    const activeServices = db.prepare("SELECT COUNT(*) as count FROM services WHERE is_active = 1").get().count;

    res.json({
      stats: {
        pendingReviews,
        totalReviews,
        totalWorks,
        activeServices
      }
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas del panel.' });
  }
});

module.exports = router;
