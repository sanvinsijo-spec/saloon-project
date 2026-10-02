const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM shop_settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }

    const holidays = db.prepare('SELECT * FROM holidays ORDER BY holiday_date ASC').all();

    res.json({
      success: true,
      data: {
        settings,
        holidays
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const settings = req.body;
    const upsertStmt = db.prepare(`
      INSERT INTO shop_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const updateTx = db.transaction(() => {
      for (const [key, val] of Object.entries(settings)) {
        upsertStmt.run(key, String(val));
      }
    });

    updateTx();

    const rows = db.prepare('SELECT key, value FROM shop_settings').all();
    const result = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }

    res.json({ success: true, data: result, message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/holidays
router.post('/holidays', (req, res) => {
  try {
    const { holiday_date, description, is_closed = 1 } = req.body;
    if (!holiday_date || !description) {
      return res.status(400).json({ success: false, error: 'Date and description are required' });
    }

    const stmt = db.prepare(`
      INSERT INTO holidays (holiday_date, description, is_closed)
      VALUES (?, ?, ?)
      ON CONFLICT(holiday_date) DO UPDATE SET
        description = excluded.description,
        is_closed = excluded.is_closed
    `);
    stmt.run(holiday_date, description, is_closed ? 1 : 0);

    const holidays = db.prepare('SELECT * FROM holidays ORDER BY holiday_date ASC').all();
    res.status(201).json({ success: true, data: holidays });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/settings/holidays/:id
router.delete('/holidays/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM holidays WHERE id = ?').run(id);
    const holidays = db.prepare('SELECT * FROM holidays ORDER BY holiday_date ASC').all();
    res.json({ success: true, data: holidays, message: 'Holiday deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
