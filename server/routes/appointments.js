const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const db = require('../db');
const { validateSlotAvailability, minutesToTime, timeToMinutes } = require('../slotEngine');
const { triggerAppointmentNotification } = require('../notificationEngine');

// Generate unique booking code like "NC-9428"
function generateBookingCode() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `NC-${num}`;
}

// GET /api/appointments
router.get('/', (req, res) => {
  try {
    const { date, barberId, customerId, status, search, limit = 100 } = req.query;

    let query = `
      SELECT
        a.*,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        c.avatar_url as customer_avatar,
        b.name as barber_name,
        b.photo_url as barber_photo,
        s.name as service_name,
        s.category as service_category
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN barbers b ON a.barber_id = b.id
      JOIN services s ON a.service_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      query += ' AND a.appointment_date = ?';
      params.push(date);
    }

    if (barberId && barberId !== 'all') {
      query += ' AND a.barber_id = ?';
      params.push(parseInt(barberId, 10));
    }

    if (customerId) {
      query += ' AND a.customer_id = ?';
      params.push(parseInt(customerId, 10));
    }

    if (status && status !== 'all') {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (c.name LIKE ? OR c.phone LIKE ? OR a.booking_code LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY a.appointment_date DESC, a.start_time DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const appointments = db.prepare(query).all(...params);
    res.json({ success: true, data: appointments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/appointments/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let appointment;
    if (isNaN(id)) {
      // Find by booking code
      appointment = db.prepare(`
        SELECT
          a.*,
          c.name as customer_name,
          c.phone as customer_phone,
          c.email as customer_email,
          b.name as barber_name,
          b.photo_url as barber_photo,
          b.title as barber_title,
          s.name as service_name,
          s.description as service_description,
          s.category as service_category
        FROM appointments a
        JOIN customers c ON a.customer_id = c.id
        JOIN barbers b ON a.barber_id = b.id
        JOIN services s ON a.service_id = s.id
        WHERE a.booking_code = ?
      `).get(id);
    } else {
      appointment = db.prepare(`
        SELECT
          a.*,
          c.name as customer_name,
          c.phone as customer_phone,
          c.email as customer_email,
          b.name as barber_name,
          b.photo_url as barber_photo,
          b.title as barber_title,
          s.name as service_name,
          s.description as service_description,
          s.category as service_category
        FROM appointments a
        JOIN customers c ON a.customer_id = c.id
        JOIN barbers b ON a.barber_id = b.id
        JOIN services s ON a.service_id = s.id
        WHERE a.id = ?
      `).get(parseInt(id, 10));
    }

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    // Generate dynamic QR Code Data URL
    const qrPayload = JSON.stringify({
      code: appointment.booking_code,
      client: appointment.customer_name,
      service: appointment.service_name,
      barber: appointment.barber_name,
      date: appointment.appointment_date,
      time: appointment.start_time,
      status: appointment.status
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      color: { dark: '#0b0c10', light: '#fbfbfb' }
    });

    const payments = db.prepare('SELECT * FROM payments WHERE appointment_id = ?').all(appointment.id);
    const review = db.prepare('SELECT * FROM reviews WHERE appointment_id = ?').get(appointment.id);

    res.json({
      success: true,
      data: {
        ...appointment,
        qrCodeUrl: qrDataUrl,
        payments,
        review
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/appointments
// Atomic double-booking protection using SQLite transaction and concurrency checks
router.post('/', async (req, res) => {
  try {
    const {
      serviceId,
      barberId, // specific ID or "any"
      appointmentDate,
      startTime,
      customerName,
      customerPhone,
      customerEmail,
      notes,
      couponCode,
      paymentMethod = 'shop', // 'shop', 'online_card', 'online_upi', 'advance_token'
      isAdvancePayment = false
    } = req.body;

    if (!serviceId || !appointmentDate || !startTime || !customerName || !customerPhone) {
      return res.status(400).json({
        success: false,
        error: 'Service, Date, Start Time, Customer Name, and Customer Phone are required.'
      });
    }

    // 1. Fetch Service
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND is_active = 1').get(parseInt(serviceId, 10));
    if (!service) {
      return res.status(400).json({ success: false, error: 'Selected service does not exist or is inactive.' });
    }

    const duration = service.duration;
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = startMinutes + duration;
    const endTime = minutesToTime(endMinutes);

    // 2. Validate Slot Availability & Concurrency Guard
    const slotCheck = validateSlotAvailability(appointmentDate, barberId, startTime, duration);
    if (!slotCheck.valid) {
      return res.status(409).json({
        success: false,
        error: slotCheck.error || 'Conflict: This slot is no longer available. Please select another slot.'
      });
    }

    // Pick barber
    let assignedBarberId;
    if (barberId === 'any' || !barberId) {
      assignedBarberId = slotCheck.availableBarbers[0]; // assign first free barber
    } else {
      assignedBarberId = parseInt(barberId, 10);
      if (!slotCheck.availableBarbers.includes(assignedBarberId)) {
        return res.status(409).json({
          success: false,
          error: 'The chosen barber has just become unavailable for this slot.'
        });
      }
    }

    // 3. Discount & Coupon Calculation
    let discountAmount = 0;
    if (couponCode) {
      const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(couponCode.toUpperCase().trim());
      if (coupon && service.price >= (coupon.min_spend || 0)) {
        if (coupon.discount_type === 'percent') {
          discountAmount = Math.round((service.price * coupon.discount_value) / 100);
        } else {
          discountAmount = Math.min(coupon.discount_value, service.price);
        }
        // Increment coupon times_used
        db.prepare('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?').run(coupon.id);
      }
    }

    const totalPrice = service.price;
    const finalPrice = Math.max(0, totalPrice - discountAmount);

    // Payment status
    let paymentStatus = 'pending';
    let paidAmount = 0;
    if (paymentMethod === 'online_card' || paymentMethod === 'online_upi') {
      paymentStatus = 'paid';
      paidAmount = finalPrice;
    } else if (isAdvancePayment || paymentMethod === 'advance_token') {
      paymentStatus = 'partial';
      paidAmount = Math.round(finalPrice * 0.25); // 25% deposit
    }

    // 4. ATOMIC TRANSACTION: Check-then-insert inside transaction
    const bookingCode = generateBookingCode();
    let newAppointmentId;

    const createBookingTransaction = db.transaction(() => {
      // Find or create customer
      let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(customerPhone);
      let customerId;
      if (!customer) {
        const cRes = db.prepare(`
          INSERT INTO customers (name, phone, email, notes, total_spent)
          VALUES (?, ?, ?, ?, ?)
        `).run(customerName, customerPhone, customerEmail || '', notes || '', paidAmount);
        customerId = cRes.lastInsertRowid;
      } else {
        customerId = customer.id;
        db.prepare('UPDATE customers SET name = ?, email = COALESCE(?, email), total_spent = total_spent + ? WHERE id = ?')
          .run(customerName, customerEmail, paidAmount, customerId);
      }

      // Re-verify no simultaneous collision inside transaction
      const bufferMinutes = 5;
      const bufferedEndTime = minutesToTime(endMinutes + bufferMinutes);
      const collision = db.prepare(`
        SELECT id FROM appointments
        WHERE barber_id = ?
          AND appointment_date = ?
          AND status IN ('confirmed', 'in_progress')
          AND NOT (end_time <= ? OR start_time >= ?)
      `).get(assignedBarberId, appointmentDate, startTime, bufferedEndTime);

      if (collision) {
        throw new Error('SLOT_COLLISION');
      }

      // Insert appointment
      const apptRes = db.prepare(`
        INSERT INTO appointments (
          booking_code, customer_id, barber_id, service_id,
          appointment_date, start_time, end_time, duration, buffer_minutes,
          total_price, discount_amount, final_price, status, payment_status,
          payment_method, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)
      `).run(
        bookingCode,
        customerId,
        assignedBarberId,
        service.id,
        appointmentDate,
        startTime,
        endTime,
        duration,
        bufferMinutes,
        totalPrice,
        discountAmount,
        finalPrice,
        paymentStatus,
        paymentMethod,
        notes || ''
      );

      newAppointmentId = apptRes.lastInsertRowid;

      // Record payment transaction if any payment was made
      if (paidAmount > 0) {
        db.prepare(`
          INSERT INTO payments (appointment_id, amount, payment_method, status, transaction_id)
          VALUES (?, ?, ?, 'paid', ?)
        `).run(
          newAppointmentId,
          paidAmount,
          paymentMethod,
          `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`
        );
      }
    });

    try {
      createBookingTransaction();
    } catch (txErr) {
      if (txErr.message === 'SLOT_COLLISION') {
        return res.status(409).json({
          success: false,
          error: 'Double-booking prevention: Another customer just finalized this exact slot. Please choose another slot.'
        });
      }
      throw txErr;
    }

    // 5. Retrieve full appointment details
    const fullAppt = db.prepare(`
      SELECT
        a.*,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        b.name as barber_name,
        b.photo_url as barber_photo,
        b.title as barber_title,
        s.name as service_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN barbers b ON a.barber_id = b.id
      JOIN services s ON a.service_id = s.id
      WHERE a.id = ?
    `).get(newAppointmentId);

    // Generate dynamic QR Code
    const qrPayload = JSON.stringify({
      code: fullAppt.booking_code,
      client: fullAppt.customer_name,
      service: fullAppt.service_name,
      barber: fullAppt.barber_name,
      date: fullAppt.appointment_date,
      time: fullAppt.start_time,
      price: fullAppt.final_price
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      color: { dark: '#0b0c10', light: '#ffffff' }
    });

    // 6. Trigger Multi-Channel Notifications
    triggerAppointmentNotification('booking_confirmed', {
      id: fullAppt.id,
      bookingCode: fullAppt.booking_code,
      customerName: fullAppt.customer_name,
      customerPhone: fullAppt.customer_phone,
      serviceName: fullAppt.service_name,
      barberName: fullAppt.barber_name,
      date: fullAppt.appointment_date,
      time: fullAppt.start_time,
      finalPrice: fullAppt.final_price,
      paymentStatus: fullAppt.payment_status
    });

    res.status(201).json({
      success: true,
      data: {
        ...fullAppt,
        qrCodeUrl: qrDataUrl
      }
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/appointments/:id/status
router.patch('/:id/status', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, paymentStatus } = req.body;

    const validStatuses = ['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    if (!appt) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    db.prepare(`
      UPDATE appointments
      SET status = COALESCE(?, status),
          payment_status = COALESCE(?, payment_status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, paymentStatus, id);

    const updated = db.prepare(`
      SELECT a.*, c.name as customer_name, c.phone as customer_phone, s.name as service_name, b.name as barber_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN services s ON a.service_id = s.id
      JOIN barbers b ON a.barber_id = b.id
      WHERE a.id = ?
    `).get(id);

    if (status === 'cancelled') {
      triggerAppointmentNotification('cancelled', {
        id: updated.id,
        bookingCode: updated.booking_code,
        customerName: updated.customer_name,
        customerPhone: updated.customer_phone,
        serviceName: updated.service_name,
        barberName: updated.barber_name,
        date: updated.appointment_date,
        time: updated.start_time
      });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/appointments/:id/reschedule
router.post('/:id/reschedule', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { newDate, newStartTime, barberId } = req.body;

    if (!newDate || !newStartTime) {
      return res.status(400).json({ success: false, error: 'New Date and Start Time are required.' });
    }

    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    if (!appt) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    const targetBarberId = barberId ? parseInt(barberId, 10) : appt.barber_id;
    const duration = appt.duration;

    // Validate new slot
    const slotCheck = validateSlotAvailability(newDate, targetBarberId, newStartTime, duration, id);
    if (!slotCheck.valid) {
      return res.status(409).json({ success: false, error: slotCheck.error || 'The requested new slot is not available.' });
    }

    const startMinutes = timeToMinutes(newStartTime);
    const endMinutes = startMinutes + duration;
    const newEndTime = minutesToTime(endMinutes);

    db.prepare(`
      UPDATE appointments
      SET appointment_date = ?,
          start_time = ?,
          end_time = ?,
          barber_id = ?,
          status = 'confirmed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newDate, newStartTime, newEndTime, targetBarberId, id);

    const updated = db.prepare(`
      SELECT a.*, c.name as customer_name, c.phone as customer_phone, s.name as service_name, b.name as barber_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN services s ON a.service_id = s.id
      JOIN barbers b ON a.barber_id = b.id
      WHERE a.id = ?
    `).get(id);

    triggerAppointmentNotification('rescheduled', {
      id: updated.id,
      bookingCode: updated.booking_code,
      customerName: updated.customer_name,
      customerPhone: updated.customer_phone,
      serviceName: updated.service_name,
      barberName: updated.barber_name,
      date: updated.appointment_date,
      time: updated.start_time
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/appointments/:id/cancel
router.post('/:id/cancel', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    if (!appt) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    const updated = db.prepare(`
      SELECT a.*, c.name as customer_name, c.phone as customer_phone, s.name as service_name, b.name as barber_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN services s ON a.service_id = s.id
      JOIN barbers b ON a.barber_id = b.id
      WHERE a.id = ?
    `).get(id);

    triggerAppointmentNotification('cancelled', {
      id: updated.id,
      bookingCode: updated.booking_code,
      customerName: updated.customer_name,
      customerPhone: updated.customer_phone,
      serviceName: updated.service_name,
      barberName: updated.barber_name,
      date: updated.appointment_date,
      time: updated.start_time
    });

    res.json({ success: true, message: 'Appointment cancelled and slot released.', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/appointments/:id/trigger-reminder (simulate 24h or 2h reminder)
router.post('/:id/trigger-reminder', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reminderType = 'reminder_2h' } = req.body;

    const updated = db.prepare(`
      SELECT a.*, c.name as customer_name, c.phone as customer_phone, s.name as service_name, b.name as barber_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN services s ON a.service_id = s.id
      JOIN barbers b ON a.barber_id = b.id
      WHERE a.id = ?
    `).get(id);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    const notifs = triggerAppointmentNotification(reminderType, {
      id: updated.id,
      bookingCode: updated.booking_code,
      customerName: updated.customer_name,
      customerPhone: updated.customer_phone,
      serviceName: updated.service_name,
      barberName: updated.barber_name,
      date: updated.appointment_date,
      time: updated.start_time
    });

    res.json({ success: true, message: `Simulated ${reminderType} sent!`, data: notifs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
