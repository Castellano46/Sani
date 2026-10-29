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

    const recentContacts = db.prepare(`
      SELECT id, event_type, page, created_at
      FROM analytics_events
      WHERE event_type IN ('whatsapp_contact', 'phone_call')
      ORDER BY id DESC
      LIMIT 5
    `).all();

    // Real-Time Analytics Calculation from SQLite table 'analytics_events'
    // 1. Weekly (Last 7 days ending with today)
    const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weeklyLabels = [];
    const weeklyVisits = [];
    const weeklyContacts = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const dayLabel = daysOfWeek[d.getDay()];
      weeklyLabels.push(dayLabel);

      const visitsCount = db.prepare(`
        SELECT COUNT(*) as count FROM analytics_events 
        WHERE event_type = 'visit' AND date(created_at, 'localtime') = ?
      `).get(dateStr).count;

      const contactsCount = db.prepare(`
        SELECT COUNT(*) as count FROM analytics_events 
        WHERE (event_type = 'whatsapp_contact' OR event_type = 'phone_call') AND date(created_at, 'localtime') = ?
      `).get(dateStr).count;

      weeklyVisits.push(visitsCount);
      weeklyContacts.push(contactsCount);
    }

    // 2. Monthly (Last 6 months ending with current month)
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthlyLabels = [];
    const monthlyVisits = [];
    const monthlyContacts = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1); // Prevent 31st overflow
      d.setMonth(d.getMonth() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yearMonth = `${yyyy}-${mm}`;

      monthlyLabels.push(monthNames[d.getMonth()]);

      const visitsCount = db.prepare(`
        SELECT COUNT(*) as count FROM analytics_events 
        WHERE event_type = 'visit' AND strftime('%Y-%m', created_at, 'localtime') = ?
      `).get(yearMonth).count;

      const contactsCount = db.prepare(`
        SELECT COUNT(*) as count FROM analytics_events 
        WHERE (event_type = 'whatsapp_contact' OR event_type = 'phone_call') AND strftime('%Y-%m', created_at, 'localtime') = ?
      `).get(yearMonth).count;

      monthlyVisits.push(visitsCount);
      monthlyContacts.push(contactsCount);
    }

    // 3. Yearly (Last 3 years ending with current year)
    const currentYear = new Date().getFullYear();
    const yearlyLabels = [String(currentYear - 2), String(currentYear - 1), `${currentYear} (Actual)`];
    const yearlyVisits = [];
    const yearlyContacts = [];

    [currentYear - 2, currentYear - 1, currentYear].forEach(yr => {
      const visitsCount = db.prepare(`
        SELECT COUNT(*) as count FROM analytics_events 
        WHERE event_type = 'visit' AND strftime('%Y', created_at, 'localtime') = ?
      `).get(String(yr)).count;

      const contactsCount = db.prepare(`
        SELECT COUNT(*) as count FROM analytics_events 
        WHERE (event_type = 'whatsapp_contact' OR event_type = 'phone_call') AND strftime('%Y', created_at, 'localtime') = ?
      `).get(String(yr)).count;

      yearlyVisits.push(visitsCount);
      yearlyContacts.push(contactsCount);
    });

    const activityTrends = {
      weekly: {
        labels: weeklyLabels,
        visits: weeklyVisits,
        whatsappContacts: weeklyContacts
      },
      monthly: {
        labels: monthlyLabels,
        visits: monthlyVisits,
        whatsappContacts: monthlyContacts
      },
      yearly: {
        labels: yearlyLabels,
        visits: yearlyVisits,
        whatsappContacts: yearlyContacts
      }
    };

    // Overall analytics totals
    const totalVisits = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'visit'").get().count;
    const totalContacts = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_type IN ('whatsapp_contact', 'phone_call')").get().count;

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
        totalVisits,
        totalContacts,
        recentActivity: {
          reviews: recentReviews,
          works: recentWorks,
          contacts: recentContacts
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
