const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/customers
router.get('/', (req, res) => {
  try {
    const { search, limit = 50 } = req.query;
    let query = `
      SELECT
        c.*,
        COUNT(a.id) as total_appointments,
        MAX(a.appointment_date) as last_visit,
        COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.final_price ELSE 0 END), 0) as calculated_spend
      FROM customers c
      LEFT JOIN appointments a ON c.id = a.customer_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ' GROUP BY c.id ORDER BY c.id DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const customers = db.prepare(query).all(...params);
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/customers/:id
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    // Appointment history
    const appointments = db.prepare(`
      SELECT a.*, s.name as service_name, b.name as barber_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN barbers b ON a.barber_id = b.id
      WHERE a.customer_id = ?
      ORDER BY a.appointment_date DESC, a.start_time DESC
    `).all(id);

    // Favorite service calculation
    const favService = db.prepare(`
      SELECT s.name, COUNT(a.id) as count
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE a.customer_id = ?
      GROUP BY s.id
      ORDER BY count DESC
      LIMIT 1
    `).get(id);

    // Spending summary
    const spendStats = db.prepare(`
      SELECT
        COUNT(*) as total_bookings,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
        SUM(CASE WHEN status = 'completed' THEN final_price ELSE 0 END) as total_spent
      FROM appointments
      WHERE customer_id = ?
    `).get(id);

    res.json({
      success: true,
      data: {
        ...customer,
        favoriteService: favService ? favService.name : 'N/A',
        stats: {
          totalBookings: spendStats.total_bookings || 0,
          completedBookings: spendStats.completed_bookings || 0,
          totalSpent: spendStats.total_spent || 0
        },
        appointments
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/customers
router.post('/', (req, res) => {
  try {
    const { name, phone, email, notes, avatar_url } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and Phone are required' });
    }

    const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Customer with this phone number already exists' });
    }

    const stmt = db.prepare(`
      INSERT INTO customers (name, phone, email, notes, avatar_url, total_spent)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    const result = stmt.run(name, phone, email || '', notes || '', avatar_url || '');

    const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newCustomer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, phone, email, notes } = req.body;

    db.prepare(`
      UPDATE customers
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(name, phone, email, notes, id);

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/customers/:id/block
router.patch('/:id/block', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cust = db.prepare('SELECT is_blocked FROM customers WHERE id = ?').get(id);
    if (!cust) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const newStatus = cust.is_blocked ? 0 : 1;
    db.prepare('UPDATE customers SET is_blocked = ? WHERE id = ?').run(newStatus, id);

    res.json({
      success: true,
      message: newStatus ? 'Customer has been blocked' : 'Customer has been unblocked',
      is_blocked: newStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
