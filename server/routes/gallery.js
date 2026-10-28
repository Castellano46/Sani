const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Configure Cloudinary if credentials are present
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

if (isCloudinaryConfigured) {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config();
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
  }
}

// Helper to upload image to Cloudinary (or keep on disk if not configured)
async function processUploadedImage(file) {
  if (!file) return '';

  if (isCloudinaryConfigured) {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'sani-instalaciones/galeria',
        resource_type: 'image',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }
        ]
      });
      // Clean up local temp file after cloud upload
      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
      }
      return result.secure_url;
    } catch (uploadErr) {
      console.error('Error uploading to Cloudinary, falling back to local file:', uploadErr);
      return `/uploads/${file.filename}`;
    }
  }

  return `/uploads/${file.filename}`;
}

// Configure Multer storage
const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomHex = crypto.randomBytes(8).toString('hex');
    const safeName = `obra-${Date.now()}-${randomHex}${ext}`;
    cb(null, safeName);
  }
});

// File filter: JPG, PNG, WEBP, GIF
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se admiten imágenes JPG, PNG, WEBP o GIF.'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB limit
  },
  fileFilter
});

// GET /api/gallery (Public: only approved items)
router.get('/', (req, res) => {
  const { category } = req.query;
  try {
    let query = `
      SELECT id, title, category, description, image_url, display_order, created_at, status
      FROM gallery
      WHERE (status = 'approved' OR status IS NULL)
    `;
    const params = [];

    if (category && category !== 'todos') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY display_order ASC, id DESC';

    const items = db.prepare(query).all(...params);
    res.json({ gallery: items });
  } catch (err) {
    console.error('Error fetching gallery:', err);
    res.status(500).json({ error: 'Error al consultar la galería de trabajos.' });
  }
});

// GET /api/gallery/all (Admin only: view all works with filters)
router.get('/all', requireAuth, (req, res) => {
  const { status, category } = req.query;
  try {
    let query = 'SELECT id, title, category, description, image_url, display_order, status, created_at FROM gallery WHERE 1=1';
    const params = [];

    if (status && ['approved', 'hidden', 'pending'].includes(status)) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (category && category !== 'todos') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY display_order ASC, id DESC';

    const items = db.prepare(query).all(...params);

    const counts = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' OR status IS NULL THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) as hidden_count
      FROM gallery
    `).get();

    res.json({
      gallery: items,
      counts: {
        total: counts.total || 0,
        approved: counts.approved_count || 0,
        hidden: counts.hidden_count || 0
      }
    });
  } catch (err) {
    console.error('Error fetching admin gallery:', err);
    res.status(500).json({ error: 'Error al consultar trabajos para administración.' });
  }
});

// POST /api/gallery (Admin only: upload and create work)
router.post('/', requireAuth, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error al procesar la imagen.' });
    }

    const { title, category, description, display_order, status, image_url } = req.body;

    if (!title || !title.trim()) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      }
      return res.status(400).json({ error: 'El título del trabajo es obligatorio.' });
    }

    let finalImageUrl = '';
    if (req.file) {
      finalImageUrl = await processUploadedImage(req.file);
    } else if (image_url && image_url.trim()) {
      finalImageUrl = image_url.trim();
    } else {
      return res.status(400).json({ error: 'Debes seleccionar una fotografía para subir o indicar una URL.' });
    }

    try {
      const categoryVal = (category && category.trim()) || 'electricidad';
      const descVal = (description && description.trim()) || '';
      const orderVal = Number(display_order) || 0;
      const statusVal = status === 'hidden' ? 'hidden' : 'approved';

      const result = db.prepare(`
        INSERT INTO gallery (title, category, description, image_url, display_order, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(title.trim(), categoryVal, descVal, finalImageUrl, orderVal, statusVal);

      // Force WAL flush
      db.pragma('wal_checkpoint(PASSIVE)');

      res.status(201).json({
        success: true,
        message: 'Fotografía publicada con éxito en la galería.',
        item: {
          id: result.lastInsertRowid,
          title: title.trim(),
          category: categoryVal,
          description: descVal,
          image_url: finalImageUrl,
          display_order: orderVal,
          status: statusVal
        }
      });
    } catch (dbErr) {
      console.error('Error saving gallery item:', dbErr);
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      }
      res.status(500).json({ error: 'Error al guardar el trabajo en la base de datos.' });
    }
  });
});

// PUT /api/gallery/:id/status (Admin only: approve or hide publication)
router.put('/:id/status', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'hidden', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Estado no válido. Debe ser approved u hidden.' });
  }

  try {
    const result = db.prepare('UPDATE gallery SET status = ? WHERE id = ?').run(status, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Fotografía no encontrada.' });
    }

    db.pragma('wal_checkpoint(PASSIVE)');

    res.json({
      success: true,
      message: status === 'approved' ? 'Publicación mostrada y aprobada.' : 'Publicación ocultada.'
    });
  } catch (err) {
    console.error('Error updating gallery status:', err);
    res.status(500).json({ error: 'Error al cambiar estado de la publicación.' });
  }
});

// PUT /api/gallery/:id (Admin only: update info or replace photo)
router.put('/:id', requireAuth, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error al procesar la imagen.' });
    }

    const { id } = req.params;
    const { title, category, description, display_order, status, image_url } = req.body;

    if (!title || !title.trim()) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      }
      return res.status(400).json({ error: 'El título del trabajo es obligatorio.' });
    }

    try {
      const existing = db.prepare('SELECT * FROM gallery WHERE id = ?').get(id);
      if (!existing) {
        if (req.file && fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        }
        return res.status(404).json({ error: 'Trabajo no encontrado.' });
      }

      let newImageUrl = existing.image_url;
      if (req.file) {
        newImageUrl = await processUploadedImage(req.file);
        // Optionally remove old file if uploaded previously locally
        if (existing.image_url && existing.image_url.startsWith('/uploads/obra-')) {
          const oldPath = path.join(__dirname, '..', '..', 'public', existing.image_url);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
          }
        }
      } else if (image_url && image_url.trim()) {
        newImageUrl = image_url.trim();
      }

      const categoryVal = (category && category.trim()) || existing.category;
      const descVal = description !== undefined ? description.trim() : existing.description;
      const orderVal = display_order !== undefined ? Number(display_order) : existing.display_order;
      const statusVal = status && ['approved', 'hidden'].includes(status) ? status : (existing.status || 'approved');

      db.prepare(`
        UPDATE gallery
        SET title = ?, category = ?, description = ?, image_url = ?, display_order = ?, status = ?
        WHERE id = ?
      `).run(title.trim(), categoryVal, descVal, newImageUrl, orderVal, statusVal, id);

      db.pragma('wal_checkpoint(PASSIVE)');

      res.json({
        success: true,
        message: 'Publicación de galería actualizada correctamente.'
      });
    } catch (dbErr) {
      console.error('Error updating gallery item:', dbErr);
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      }
      res.status(500).json({ error: 'Error al actualizar el trabajo.' });
    }
  });
});

// DELETE /api/gallery/:id (Admin only)
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  try {
    const existing = db.prepare('SELECT * FROM gallery WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Fotografía no encontrada.' });
    }

    // Delete row
    db.prepare('DELETE FROM gallery WHERE id = ?').run(id);
    db.pragma('wal_checkpoint(PASSIVE)');

    // Delete image file from disk if located in /uploads/
    if (existing.image_url && existing.image_url.startsWith('/uploads/obra-')) {
      const filePath = path.join(__dirname, '..', '..', 'public', existing.image_url);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      }
    }

    res.json({ success: true, message: 'Publicación eliminada correctamente de la galería.' });
  } catch (err) {
    console.error('Error deleting gallery item:', err);
    res.status(500).json({ error: 'No se pudo eliminar la publicación.' });
  }
});

module.exports = router;
