const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

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

// File filter: only JPG, PNG, WEBP allowed
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se admiten imágenes JPG, PNG o WEBP.'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter
});

// GET /api/gallery (Public)
router.get('/', (req, res) => {
  const { category } = req.query;
  try {
    let query = 'SELECT id, title, category, description, image_url, display_order, created_at FROM gallery';
    const params = [];

    if (category && category !== 'todos') {
      query += ' WHERE category = ?';
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

// POST /api/gallery (Admin only: upload and create work)
router.post('/', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error al procesar la imagen.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Debes seleccionar una fotografía para subir.' });
    }

    const { title, category, description, display_order } = req.body;
    if (!title || !title.trim()) {
      // Remove uploaded file if validation fails
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'El título del trabajo es obligatorio.' });
    }

    try {
      const imageUrl = `/uploads/${req.file.filename}`;
      const categoryVal = (category && category.trim()) || 'electricidad';
      const descVal = (description && description.trim()) || '';
      const orderVal = Number(display_order) || 0;

      const result = db.prepare(`
        INSERT INTO gallery (title, category, description, image_url, display_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(title.trim(), categoryVal, descVal, imageUrl, orderVal);

      res.status(201).json({
        success: true,
        message: 'Trabajo publicado con éxito en la galería.',
        item: {
          id: result.lastInsertRowid,
          title: title.trim(),
          category: categoryVal,
          description: descVal,
          image_url: imageUrl,
          display_order: orderVal
        }
      });
    } catch (dbErr) {
      console.error('Error saving gallery item:', dbErr);
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Error al guardar el trabajo en la base de datos.' });
    }
  });
});

// PUT /api/gallery/:id (Admin only: update info or replace photo)
router.put('/:id', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error al procesar la imagen.' });
    }

    const { id } = req.params;
    const { title, category, description, display_order } = req.body;

    if (!title || !title.trim()) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'El título del trabajo es obligatorio.' });
    }

    try {
      const existing = db.prepare('SELECT * FROM gallery WHERE id = ?').get(id);
      if (!existing) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(404).json({ error: 'Trabajo no encontrado.' });
      }

      let imageUrl = existing.image_url;
      if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
        // Optionally remove old file if in /uploads/
        if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
          const oldPath = path.join(__dirname, '..', '..', 'public', existing.image_url);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
          }
        }
      }

      const categoryVal = (category && category.trim()) || existing.category;
      const descVal = description !== undefined ? description.trim() : existing.description;
      const orderVal = display_order !== undefined ? Number(display_order) : existing.display_order;

      db.prepare(`
        UPDATE gallery
        SET title = ?, category = ?, description = ?, image_url = ?, display_order = ?
        WHERE id = ?
      `).run(title.trim(), categoryVal, descVal, imageUrl, orderVal, id);

      res.json({
        success: true,
        message: 'Trabajo actualizado correctamente.'
      });
    } catch (dbErr) {
      console.error('Error updating gallery item:', dbErr);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
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
      return res.status(404).json({ error: 'Trabajo no encontrado.' });
    }

    // Delete row
    db.prepare('DELETE FROM gallery WHERE id = ?').run(id);

    // Delete image file from disk if located in /uploads/
    if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', '..', 'public', existing.image_url);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      }
    }

    res.json({ success: true, message: 'Trabajo eliminado correctamente.' });
  } catch (err) {
    console.error('Error deleting gallery item:', err);
    res.status(500).json({ error: 'Error al eliminar el trabajo.' });
  }
});

module.exports = router;
