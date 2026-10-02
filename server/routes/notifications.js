const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendNotification } = require('../notificationEngine');

// GET /api/notifications
router.get('/', (req, res) => {
  try {
    const { role, limit = 50 } = req.query;
    let query = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];

    if (role && role !== 'all') {
      query += " AND (recipient_role = ? OR recipient_role = 'all')";
      params.push(role);
    }

    query += ' ORDER BY sent_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const notifications = db.prepare(query).all(...params);
    const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get().count;

    res.json({
      success: true,
      unreadCount,
      data: notifications
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notifications/simulate (simulate sending a custom WhatsApp/SMS/Email reminder)
router.post('/simulate', (req, res) => {
  try {
    const { recipientRole, recipientName, recipientPhone, channels, type, title, message, appointmentId } = req.body;
    const notifs = sendNotification({
      recipientRole: recipientRole || 'customer',
      recipientName: recipientName || 'Valued Client',
      recipientPhone: recipientPhone || '+91 98765 00000',
      channels: channels || ['whatsapp', 'sms'],
      type: type || 'custom_alert',
      title: title || 'Appointment Alert',
      message: message || 'Notice regarding your scheduled grooming appointment at GlamourX.',
      appointmentId: appointmentId || null
    });

    res.json({ success: true, data: notifs, message: 'Simulated notifications sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
