const express = require('express');
const router = express.Router();
const { getAvailableSlots } = require('../slotEngine');

// GET /api/availability/slots?date=YYYY-MM-DD&barberId=1&duration=30
router.get('/slots', (req, res) => {
  try {
    const { date, barberId, duration, excludeAppointmentId } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, error: 'Date is required' });
    }

    const durationMin = parseInt(duration || '30', 10);
    const excludeId = excludeAppointmentId ? parseInt(excludeAppointmentId, 10) : null;

    const result = getAvailableSlots(date, barberId || 'any', durationMin, excludeId);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
