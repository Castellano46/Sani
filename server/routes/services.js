const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/services (Public: active services)
router.get('/', (req, res) => {
  try {
    const services = db.prepare(`
      SELECT id, title, category, description, icon, display_order
      FROM services
      WHERE is_active = 1
      ORDER BY display_order ASC, id ASC
    `).all();
    res.json({ services });
  } catch (err) {
    console.error('Error fetching public services:', err);
    res.status(500).json({ error: 'Error al consultar los servicios.' });
  }
});

// GET /api/services/all (Admin only: all services)
router.get('/all', requireAuth, (req, res) => {
  try {
    const services = db.prepare(`
      SELECT id, title, category, description, icon, is_active, display_order, created_at
      FROM services
      ORDER BY display_order ASC, id ASC
    `).all();
    res.json({ services });
  } catch (err) {
    console.error('Error fetching all services for admin:', err);
    res.status(500).json({ error: 'Error al consultar los servicios.' });
  }
});

// POST /api/services (Admin only)
router.post('/', requireAuth, (req, res) => {
  const { title, category, description, icon, is_active, display_order } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'El título del servicio es obligatorio.' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'La descripción del servicio es obligatoria.' });
  }

  try {
    const categoryVal = (category && category.trim()) || 'otro';
    const iconVal = (icon && icon.trim()) || 'wrench';
    const isActiveVal = is_active !== undefined ? (is_active ? 1 : 0) : 1;
    const orderVal = Number(display_order) || 0;

    const result = db.prepare(`
      INSERT INTO services (title, category, description, icon, is_active, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title.trim(), categoryVal, description.trim(), iconVal, isActiveVal, orderVal);

    res.status(201).json({
      success: true,
      id: result.lastInsertRowid,
      message: 'Servicio creado correctamente.'
    });
  } catch (err) {
    console.error('Error creating service:', err);
    res.status(500).json({ error: 'No se pudo crear el servicio.' });
  }
});

// PUT /api/services/:id (Admin only)
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { title, category, description, icon, is_active, display_order } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'El título del servicio es obligatorio.' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'La descripción del servicio es obligatoria.' });
  }

  try {
    const service = db.prepare('SELECT id FROM services WHERE id = ?').get(id);
    if (!service) {
      return res.status(404).json({ error: 'Servicio no encontrado.' });
    }

    const categoryVal = (category && category.trim()) || 'otro';
    const iconVal = (icon && icon.trim()) || 'wrench';
    const isActiveVal = is_active !== undefined ? (is_active ? 1 : 0) : 1;
    const orderVal = Number(display_order) || 0;

    db.prepare(`
      UPDATE services
      SET title = ?, category = ?, description = ?, icon = ?, is_active = ?, display_order = ?
      WHERE id = ?
    `).run(title.trim(), categoryVal, description.trim(), iconVal, isActiveVal, orderVal, id);

    res.json({ success: true, message: 'Servicio actualizado correctamente.' });
  } catch (err) {
    console.error('Error updating service:', err);
    res.status(500).json({ error: 'No se pudo actualizar el servicio.' });
  }
});

// DELETE /api/services/:id (Admin only)
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  try {
    const result = db.prepare('DELETE FROM services WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado.' });
    }
    res.json({ success: true, message: 'Servicio eliminado correctamente.' });
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ error: 'No se pudo eliminar el servicio.' });
  }
});

module.exports = router;
