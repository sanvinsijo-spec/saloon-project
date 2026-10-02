const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/services
router.get('/', (req, res) => {
  try {
    const { category, all } = req.query;
    let query = 'SELECT * FROM services';
    const params = [];

    if (!all) {
      query += ' WHERE is_active = 1';
    }

    if (category && category !== 'All') {
      query += all ? ' WHERE category = ?' : ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY id ASC';
    const services = db.prepare(query).all(...params);
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/services
router.post('/', (req, res) => {
  try {
    const { name, description, price, duration, category, image_url } = req.body;
    if (!name || !price || !duration || !category) {
      return res.status(400).json({ success: false, error: 'Name, price, duration, and category are required' });
    }

    const defaultImg = 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&auto=format&fit=crop&q=80';
    const stmt = db.prepare(`
      INSERT INTO services (name, description, price, duration, category, image_url, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const result = stmt.run(name, description || '', parseFloat(price), parseInt(duration, 10), category, image_url || defaultImg);
    
    // Also assign to all barbers by default
    const barbers = db.prepare('SELECT id FROM barbers').all();
    const linkStmt = db.prepare('INSERT OR IGNORE INTO barber_services (barber_id, service_id) VALUES (?, ?)');
    for (const b of barbers) {
      linkStmt.run(b.id, result.lastInsertRowid);
    }

    const newService = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newService });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/services/:id
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description, price, duration, category, image_url, is_active } = req.body;

    const stmt = db.prepare(`
      UPDATE services
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          price = COALESCE(?, price),
          duration = COALESCE(?, duration),
          category = COALESCE(?, category),
          image_url = COALESCE(?, image_url),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `);

    stmt.run(name, description, price, duration, category, image_url, is_active, id);
    const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/services/:id (soft delete toggle)
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(id);
    res.json({ success: true, message: 'Service deactivated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
