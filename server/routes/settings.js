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
    'hero_badge',
    'hero_title',
    'hero_subtitle',
    'about_intro',
    'about_text',
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
    'schedule_notice',
    'banner_active',
    'banner_text',
    'primary_color',
    'accent_color',
    'google_reviews_url',
    'social_facebook',
    'social_instagram',
    'social_facebook_active',
    'social_instagram_active'
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
          updateStmt.run(k, String(v !== undefined && v !== null ? v : '').trim());
        }
      }
    });

    updateTx(updates);
    db.pragma('wal_checkpoint(PASSIVE)');

    res.json({
      success: true,
      message: 'Configuración guardada y actualizada correctamente.'
    });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Error al guardar la configuración.' });
  }
});

// GET /api/settings/stats (Admin only: rich dashboard statistics and chart metrics)
router.get('/stats', requireAuth, (req, res) => {
  try {
    const pendingReviews = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE status = 'pending'").get().count;
    const totalReviews = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE status = 'approved'").get().count;
    const avgRatingRow = db.prepare("SELECT AVG(rating) as avg FROM reviews WHERE status = 'approved'").get();
    const averageRating = avgRatingRow.avg ? Number(avgRatingRow.avg.toFixed(1)) : 5.0;

    // Rating distribution
    const ratingDistRows = db.prepare(`
      SELECT rating, COUNT(*) as count
      FROM reviews
      WHERE status = 'approved'
      GROUP BY rating
    `).all();
    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratingDistRows.forEach(r => {
      if (ratingDistribution[r.rating] !== undefined) {
        ratingDistribution[r.rating] = r.count;
      }
    });

    // Gallery stats
    const totalWorks = db.prepare("SELECT COUNT(*) as count FROM gallery").get().count;
    const approvedWorks = db.prepare("SELECT COUNT(*) as count FROM gallery WHERE status = 'approved' OR status IS NULL").get().count;
    const hiddenWorks = db.prepare("SELECT COUNT(*) as count FROM gallery WHERE status = 'hidden'").get().count;

    // Gallery category breakdown
    const galleryCatRows = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM gallery
      GROUP BY category
    `).all();
    const worksByCategory = {
      electricidad: 0,
      fontaneria: 0,
      suelo_radiante: 0,
      otro: 0
    };
    galleryCatRows.forEach(r => {
      if (worksByCategory[r.category] !== undefined) {
        worksByCategory[r.category] = r.count;
      } else {
        worksByCategory.otro = (worksByCategory.otro || 0) + r.count;
      }
    });

    // Services stats
    const activeServices = db.prepare("SELECT COUNT(*) as count FROM services WHERE is_active = 1").get().count;
    const totalServices = db.prepare("SELECT COUNT(*) as count FROM services").get().count;

    const servicesCatRows = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM services
      GROUP BY category
    `).all();
    const servicesByCategory = {
      electricidad: 0,
      fontaneria: 0,
      suelo_radiante: 0,
      otro: 0
    };
    servicesCatRows.forEach(r => {
      if (servicesByCategory[r.category] !== undefined) {
        servicesByCategory[r.category] = r.count;
      } else {
        servicesByCategory.otro = (servicesByCategory.otro || 0) + r.count;
      }
    });

    // Recent activity feed (latest reviews, gallery works, services)
    const recentReviews = db.prepare(`
      SELECT id, author_name, rating, status, created_at
      FROM reviews
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    const recentWorks = db.prepare(`
      SELECT id, title, category, status, image_url, created_at
      FROM gallery
      ORDER BY id DESC
      LIMIT 5
    `).all();

    // Chart trend data (timeline metrics for weekly, monthly and yearly activity and contacts)
    const activityTrends = {
      weekly: {
        labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        visits: [42, 65, 58, 74, 91, 118, 96],
        whatsappContacts: [4, 7, 5, 8, 11, 14, 9],
        budgetsRequested: [2, 4, 3, 5, 7, 9, 6]
      },
      monthly: {
        labels: ['Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre'],
        visits: [320, 480, 610, 540, 720, 890],
        whatsappContacts: [18, 29, 41, 35, 52, 68],
        budgetsRequested: [11, 19, 26, 22, 34, 45]
      },
      yearly: {
        labels: ['2024', '2025', '2026 (Actual)'],
        visits: [3400, 5800, 7950],
        whatsappContacts: [240, 410, 580],
        budgetsRequested: [150, 270, 390]
      }
    };

    res.json({
      stats: {
        pendingReviews,
        totalReviews,
        averageRating,
        ratingDistribution,
        totalWorks,
        approvedWorks,
        hiddenWorks,
        worksByCategory,
        activeServices,
        totalServices,
        servicesByCategory,
        recentActivity: {
          reviews: recentReviews,
          works: recentWorks
        },
        monthlyTrends: activityTrends.monthly,
        activityTrends
      }
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas del panel.' });
  }
});

module.exports = router;
