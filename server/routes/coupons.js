const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/coupons
router.get('/', (req, res) => {
  try {
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
    res.json({ success: true, data: coupons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/coupons/validate
router.post('/validate', (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'Promo code is required' });
    }

    const cleanCode = code.toUpperCase().trim();
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(cleanCode);

    if (!coupon) {
      return res.status(404).json({ success: false, error: 'Invalid or expired coupon code' });
    }

    // Check expiry
    if (coupon.expiry_date) {
      const today = new Date().toISOString().split('T')[0];
      if (today > coupon.expiry_date) {
        return res.status(400).json({ success: false, error: `Coupon expired on ${coupon.expiry_date}` });
      }
    }

    // Check usage limit
    if (coupon.usage_limit && coupon.times_used >= coupon.usage_limit) {
      return res.status(400).json({ success: false, error: 'Coupon usage limit has been reached' });
    }

    // Check minimum spend
    const amount = parseFloat(subtotal || '0');
    if (coupon.min_spend && amount < coupon.min_spend) {
      return res.status(400).json({
        success: false,
        error: `Minimum order amount of ₹${coupon.min_spend} required for this coupon`
      });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discount_type === 'percent') {
      discount = Math.round((amount * coupon.discount_value) / 100);
    } else {
      discount = Math.min(coupon.discount_value, amount);
    }

    const finalAmount = Math.max(0, amount - discount);

    res.json({
      success: true,
      data: {
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        discountAmount: discount,
        subtotal: amount,
        finalAmount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/coupons
router.post('/', (req, res) => {
  try {
    const { code, discount_type, discount_value, min_spend, expiry_date, usage_limit } = req.body;
    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ success: false, error: 'Code, type, and value are required' });
    }

    const stmt = db.prepare(`
      INSERT INTO coupons (code, discount_type, discount_value, min_spend, expiry_date, usage_limit, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const result = stmt.run(
      code.toUpperCase().trim(),
      discount_type,
      parseFloat(discount_value),
      parseFloat(min_spend || 0),
      expiry_date || null,
      parseInt(usage_limit || 100, 10)
    );

    const newCoupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newCoupon });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/coupons/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const coupon = db.prepare('SELECT is_active FROM coupons WHERE id = ?').get(id);
    if (!coupon) {
      return res.status(404).json({ success: false, error: 'Coupon not found' });
    }

    const nextState = coupon.is_active ? 0 : 1;
    db.prepare('UPDATE coupons SET is_active = ? WHERE id = ?').run(nextState, id);

    res.json({ success: true, is_active: nextState });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
