const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/analytics/track
// Lightweight, anonymous, non-blocking telemetry event recording
router.post('/track', (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }

    const eventType = body?.event_type;
    const allowed = ['visit', 'whatsapp_contact', 'phone_call'];

    if (eventType && allowed.includes(eventType)) {
      const page = typeof body.page === 'string' ? body.page.substring(0, 100) : '/';
      db.prepare('INSERT INTO analytics_events (event_type, page) VALUES (?, ?)').run(eventType, page);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Analytics Error]:', err);
    // Always return 200 so analytics tracking never interrupts or breaks user experience
    return res.status(200).json({ ok: false });
  }
});

module.exports = router;
