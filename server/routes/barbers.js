const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/barbers
router.get('/', (req, res) => {
  try {
    const { all } = req.query;
    let query = 'SELECT * FROM barbers';
    if (!all) {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY id ASC';
    const barbers = db.prepare(query).all();

    // Fetch working hours & breaks for each barber
    const barbersWithDetails = barbers.map(barber => {
      const workingHours = db.prepare('SELECT * FROM working_hours WHERE barber_id = ? ORDER BY day_of_week ASC').all(barber.id);
      const breaks = db.prepare('SELECT * FROM breaks WHERE barber_id = ? ORDER BY day_of_week ASC').all(barber.id);
      return {
        ...barber,
        workingHours,
        breaks
      };
    });

    res.json({ success: true, data: barbersWithDetails });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/barbers/:id
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const barber = db.prepare('SELECT * FROM barbers WHERE id = ?').get(id);
    if (!barber) {
      return res.status(404).json({ success: false, error: 'Barber not found' });
    }

    const workingHours = db.prepare('SELECT * FROM working_hours WHERE barber_id = ? ORDER BY day_of_week ASC').all(id);
    const breaks = db.prepare('SELECT * FROM breaks WHERE barber_id = ? ORDER BY day_of_week ASC').all(id);
    const services = db.prepare(`
      SELECT s.* FROM services s
      JOIN barber_services bs ON bs.service_id = s.id
      WHERE bs.barber_id = ?
    `).all(id);

    res.json({
      success: true,
      data: {
        ...barber,
        workingHours,
        breaks,
        services
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/barbers/:id/stats
router.get('/:id/stats', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const barber = db.prepare('SELECT * FROM barbers WHERE id = ?').get(id);
    if (!barber) {
      return res.status(404).json({ success: false, error: 'Barber not found' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Today's appointments
    const todayAppts = db.prepare(`
      SELECT a.*, c.name as customer_name, c.phone as customer_phone, s.name as service_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN services s ON a.service_id = s.id
      WHERE a.barber_id = ? AND a.appointment_date = ?
      ORDER BY a.start_time ASC
    `).all(id, today);

    // Total stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_appointments,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_appointments,
        SUM(CASE WHEN appointment_date = ? THEN 1 ELSE 0 END) as today_count,
        SUM(CASE WHEN status = 'completed' THEN final_price ELSE 0 END) as total_gross_revenue,
        SUM(CASE WHEN status = 'completed' AND appointment_date = ? THEN final_price ELSE 0 END) as today_gross_revenue
      FROM appointments
      WHERE barber_id = ?
    `).get(today, today, id);

    const commissionRate = (barber.commission_pct || 40) / 100;
    const totalEarnings = (stats.total_gross_revenue || 0) * commissionRate;
    const todayEarnings = (stats.today_gross_revenue || 0) * commissionRate;

    res.json({
      success: true,
      data: {
        barber,
        todayAppointments: todayAppts,
        stats: {
          totalAppointments: stats.total_appointments || 0,
          completedAppointments: stats.completed_appointments || 0,
          todayAppointmentsCount: stats.today_count || 0,
          totalRevenue: stats.total_gross_revenue || 0,
          todayRevenue: stats.today_gross_revenue || 0,
          totalEarnings: Math.round(totalEarnings),
          todayEarnings: Math.round(todayEarnings),
          commissionPct: barber.commission_pct
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/barbers
router.post('/', (req, res) => {
  try {
    const { name, title, bio, photo_url, phone, email, specialization, commission_pct } = req.body;
    if (!name || !title) {
      return res.status(400).json({ success: false, error: 'Name and title are required' });
    }

    const defaultPhoto = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80';
    
    // Insert user first
    const uStmt = db.prepare('INSERT INTO users (email, phone, name, role, avatar_url) VALUES (?, ?, ?, "barber", ?)');
    const uRes = uStmt.run(email || `barber_${Date.now()}@noblecut.com`, phone || '', name, photo_url || defaultPhoto);

    // Insert barber
    const bStmt = db.prepare(`
      INSERT INTO barbers (user_id, name, title, bio, photo_url, phone, email, specialization, commission_pct, is_active, rating, review_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 5.0, 0)
    `);
    const bRes = bStmt.run(uRes.lastInsertRowid, name, title, bio || '', photo_url || defaultPhoto, phone || '', email || '', specialization || 'Classic Grooming', commission_pct || 40);
    const newBarberId = bRes.lastInsertRowid;

    // Insert default working hours (Mon-Sat 09:00 - 20:00, Sun 10:00 - 18:00)
    const whStmt = db.prepare('INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, is_working) VALUES (?, ?, ?, ?, ?)');
    const brkStmt = db.prepare('INSERT INTO breaks (barber_id, day_of_week, start_time, end_time, label) VALUES (?, ?, ?, ?, ?)');

    for (let day = 0; day <= 6; day++) {
      if (day === 0) {
        whStmt.run(newBarberId, day, '10:00', '18:00', 1);
        brkStmt.run(newBarberId, day, '13:30', '14:30', 'Lunch Break');
      } else {
        whStmt.run(newBarberId, day, '09:00', '20:00', 1);
        brkStmt.run(newBarberId, day, '13:00', '14:00', 'Lunch Break');
      }
    }

    // Link to all active services
    const services = db.prepare('SELECT id FROM services WHERE is_active = 1').all();
    const linkStmt = db.prepare('INSERT INTO barber_services (barber_id, service_id) VALUES (?, ?)');
    for (const s of services) {
      linkStmt.run(newBarberId, s.id);
    }

    const newBarber = db.prepare('SELECT * FROM barbers WHERE id = ?').get(newBarberId);
    res.status(201).json({ success: true, data: newBarber });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/barbers/:id
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, title, bio, photo_url, phone, email, specialization, commission_pct, is_active } = req.body;

    const stmt = db.prepare(`
      UPDATE barbers
      SET name = COALESCE(?, name),
          title = COALESCE(?, title),
          bio = COALESCE(?, bio),
          photo_url = COALESCE(?, photo_url),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          specialization = COALESCE(?, specialization),
          commission_pct = COALESCE(?, commission_pct),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `);

    stmt.run(name, title, bio, photo_url, phone, email, specialization, commission_pct, is_active, id);
    const updated = db.prepare('SELECT * FROM barbers WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/barbers/:id/schedule (update working hours and breaks)
router.put('/:id/schedule', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { workingHours, breaks } = req.body;

    const updateTx = db.transaction(() => {
      if (Array.isArray(workingHours)) {
        const whStmt = db.prepare(`
          INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, is_working)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            is_working = excluded.is_working
        `);
        for (const wh of workingHours) {
          if (wh.id) {
            db.prepare('UPDATE working_hours SET start_time = ?, end_time = ?, is_working = ? WHERE id = ? AND barber_id = ?')
              .run(wh.start_time, wh.end_time, wh.is_working ? 1 : 0, wh.id, id);
          } else {
            whStmt.run(id, wh.day_of_week, wh.start_time, wh.end_time, wh.is_working ? 1 : 0);
          }
        }
      }

      if (Array.isArray(breaks)) {
        // delete and re-insert breaks for clean update
        db.prepare('DELETE FROM breaks WHERE barber_id = ?').run(id);
        const brkStmt = db.prepare('INSERT INTO breaks (barber_id, day_of_week, start_time, end_time, label) VALUES (?, ?, ?, ?, ?)');
        for (const b of breaks) {
          brkStmt.run(id, b.day_of_week, b.start_time, b.end_time, b.label || 'Break');
        }
      }
    });

    updateTx();
    res.json({ success: true, message: 'Schedule updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
