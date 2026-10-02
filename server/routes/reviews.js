const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/reviews
router.get('/', (req, res) => {
  try {
    const { barberId, all } = req.query;
    let query = `
      SELECT
        r.*,
        c.name as customer_name,
        c.avatar_url as customer_avatar,
        b.name as barber_name,
        s.name as service_name
      FROM reviews r
      JOIN customers c ON r.customer_id = c.id
      JOIN barbers b ON r.barber_id = b.id
      JOIN services s ON r.service_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (!all) {
      query += ' AND r.is_approved = 1';
    }

    if (barberId) {
      query += ' AND r.barber_id = ?';
      params.push(parseInt(barberId, 10));
    }

    query += ' ORDER BY r.created_at DESC LIMIT 50';

    const reviews = db.prepare(query).all(...params);
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reviews
router.post('/', (req, res) => {
  try {
    const { appointmentId, rating, comment } = req.body;

    if (!appointmentId || !rating) {
      return res.status(400).json({ success: false, error: 'Appointment ID and rating (1-5) are required' });
    }

    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(parseInt(appointmentId, 10));
    if (!appt) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    if (appt.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Can only review completed appointments' });
    }

    const existingReview = db.prepare('SELECT id FROM reviews WHERE appointment_id = ?').get(appt.id);
    if (existingReview) {
      return res.status(409).json({ success: false, error: 'A review has already been submitted for this appointment' });
    }

    const stmt = db.prepare(`
      INSERT INTO reviews (appointment_id, customer_id, barber_id, service_id, rating, comment, is_approved)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const result = stmt.run(appt.id, appt.customer_id, appt.barber_id, appt.service_id, Math.min(5, Math.max(1, parseInt(rating, 10))), comment || '');

    // Recompute barber average rating
    const avgStats = db.prepare(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as count
      FROM reviews
      WHERE barber_id = ? AND is_approved = 1
    `).get(appt.barber_id);

    if (avgStats) {
      db.prepare('UPDATE barbers SET rating = ?, review_count = ? WHERE id = ?')
        .run(Math.round((avgStats.avg_rating || 5) * 10) / 10, avgStats.count || 0, appt.barber_id);
    }

    const newReview = db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newReview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/reviews/:id/moderate
router.patch('/:id/moderate', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { is_approved } = req.body;

    db.prepare('UPDATE reviews SET is_approved = ? WHERE id = ?').run(is_approved ? 1 : 0, id);
    const updated = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
