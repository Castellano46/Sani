const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/analytics/track
// Lightweight, anonymous, non-blocking telemetry event recording
router.post('/track', (req, res) => {
  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) {
      try { body = JSON.parse(body.toString('utf-8')); } catch (e) { body = {}; }
    } else if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const eventType = body?.event_type || req.query?.event_type;
    const allowed = ['visit', 'whatsapp_contact', 'phone_call'];

    if (eventType && allowed.includes(eventType)) {
      const page = typeof (body?.page || req.query?.page) === 'string' 
        ? String(body?.page || req.query?.page).substring(0, 100) 
        : '/';
      db.prepare('INSERT INTO analytics_events (event_type, page) VALUES (?, ?)').run(eventType, page);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Analytics Error]:', err);
    return res.status(200).json({ ok: false });
  }
});

module.exports = router;
