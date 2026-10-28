const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Helper to escape HTML tags to prevent XSS
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// In-memory rate limiting map for review submissions (max 3 reviews per IP hash per 10 mins)
const submissionRateMap = new Map();

// GET /api/reviews (Public: only approved reviews + aggregate stats)
router.get('/', (req, res) => {
  try {
    const reviews = db.prepare(`
      SELECT id, author_name, rating, comment, created_at
      FROM reviews
      WHERE status = 'approved'
      ORDER BY created_at DESC
    `).all();

    const statsRow = db.prepare(`
      SELECT 
        COUNT(*) as total,
        AVG(rating) as avg_rating
      FROM reviews
      WHERE status = 'approved'
    `).get();

    const distribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };

    reviews.forEach(r => {
      if (distribution[r.rating] !== undefined) {
        distribution[r.rating]++;
      }
    });

    const totalCount = statsRow.total || 0;
    const average = totalCount > 0 ? Number(statsRow.avg_rating.toFixed(1)) : 0;

    res.json({
      reviews,
      stats: {
        total: totalCount,
        averageRating: average,
        distribution
      }
    });
  } catch (err) {
    console.error('Error fetching public reviews:', err);
    res.status(500).json({ error: 'Error al consultar las valoraciones.' });
  }
});

// POST /api/reviews (Public: submit review, defaults to 'pending')
router.post('/', (req, res) => {
  const { author_name, rating, comment, honeypot, rgpd_accepted } = req.body;

  // Spam protection: honeypot check
  if (honeypot) {
    // Bot detected; reply with success to fool bot without saving
    return res.json({
      success: true,
      message: 'Tu opinión ha sido recibida correctamente.'
    });
  }

  // RGPD validation
  if (!rgpd_accepted) {
    return res.status(400).json({ error: 'Debes aceptar la política de privacidad para publicar tu opinión.' });
  }

  // Name validation
  if (!author_name || !author_name.trim()) {
    return res.status(400).json({ error: 'El nombre o alias es obligatorio.' });
  }
  const cleanName = escapeHtml(author_name.trim());
  if (cleanName.length > 60) {
    return res.status(400).json({ error: 'El nombre no puede superar los 60 caracteres.' });
  }

  // Rating validation
  const numRating = parseInt(rating, 10);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'La valoración debe ser entre 1 y 5 estrellas.' });
  }

  // Comment validation
  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'El comentario es obligatorio.' });
  }
  const cleanComment = escapeHtml(comment.trim());
  if (cleanComment.length < 5) {
    return res.status(400).json({ error: 'El comentario debe contener al menos 5 caracteres.' });
  }
  if (cleanComment.length > 600) {
    return res.status(400).json({ error: 'El comentario no puede exceder los 600 caracteres.' });
  }

  // Rate limiting per IP hash
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ipHash = crypto.createHash('sha256').update(clientIp + 'sani_salt').digest('hex').slice(0, 16);

  const now = Date.now();
  const userSubmissions = submissionRateMap.get(ipHash) || [];
  const recentSubmissions = userSubmissions.filter(ts => now - ts < 10 * 60 * 1000);

  if (recentSubmissions.length >= 3) {
    return res.status(429).json({ error: 'Has enviado varias opiniones recientemente. Por favor, inténtalo más tarde.' });
  }

  recentSubmissions.push(now);
  submissionRateMap.set(ipHash, recentSubmissions);

  try {
    const result = db.prepare(`
      INSERT INTO reviews (author_name, rating, comment, status, ip_hash)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(cleanName, numRating, cleanComment, ipHash);

    res.status(201).json({
      success: true,
      message: '¡Muchas gracias por tu valoración! Tu opinión ha sido enviada y se publicará tras su revisión.',
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Error inserting review:', err);
    res.status(500).json({ error: 'Error al enviar tu opinión. Inténtalo de nuevo.' });
  }
});

// GET /api/reviews/all (Admin only: view all reviews with status filter)
router.get('/all', requireAuth, (req, res) => {
  const { status } = req.query;
  try {
    let query = 'SELECT id, author_name, rating, comment, status, created_at FROM reviews';
    const params = [];

    if (status && ['pending', 'approved', 'hidden'].includes(status)) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const reviews = db.prepare(query).all(...params);

    const counts = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) as hidden_count
      FROM reviews
    `).get();

    res.json({
      reviews,
      counts: {
        total: counts.total || 0,
        pending: counts.pending_count || 0,
        approved: counts.approved_count || 0,
        hidden: counts.hidden_count || 0
      }
    });
  } catch (err) {
    console.error('Error fetching admin reviews:', err);
    res.status(500).json({ error: 'Error al consultar las opiniones.' });
  }
});

// PUT /api/reviews/:id/status (Admin only: approve, hide, reset)
router.put('/:id/status', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'approved', 'hidden'].includes(status)) {
    return res.status(400).json({ error: 'Estado no válido. Debe ser pending, approved u hidden.' });
  }

  try {
    const result = db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Opinión no encontrada.' });
    }

    res.json({ success: true, message: `Opinión marcada como ${status}.` });
  } catch (err) {
    console.error('Error updating review status:', err);
    res.status(500).json({ error: 'Error al actualizar la opinión.' });
  }
});

// DELETE /api/reviews/:id (Admin only: delete)
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  try {
    const result = db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Opinión no encontrada.' });
    }
    res.json({ success: true, message: 'Opinión eliminada permanentemente.' });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ error: 'Error al eliminar la opinión.' });
  }
});

module.exports = router;
