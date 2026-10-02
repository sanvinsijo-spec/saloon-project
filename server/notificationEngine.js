const db = require('./db');

/**
 * Dispatch simulated multi-channel notifications (WhatsApp, SMS, Email, System)
 */
function sendNotification({
  recipientRole = 'customer',
  recipientName,
  recipientPhone,
  channels = ['whatsapp', 'sms', 'system'],
  type,
  title,
  message,
  appointmentId = null
}) {
  const insertStmt = db.prepare(`
    INSERT INTO notifications (recipient_role, recipient_name, recipient_phone, channel, type, title, message, appointment_id, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const createdNotifications = [];

  for (const ch of channels) {
    let tailoredMessage = message;
    if (ch === 'whatsapp') {
      tailoredMessage = `🟢 *GlamourX Luxury Salon*\n${message}\n\n📍 *Suite 104, MG Road, Bangalore*\n📞 Helpline: +91 98765 43210`;
    } else if (ch === 'sms') {
      tailoredMessage = `[GLAMOURX] ${message} - Pls arrive 5 min prior. Queries: 9876543210`;
    } else if (ch === 'email') {
      tailoredMessage = `Subject: ${title}\n\nDear ${recipientName},\n\n${message}\n\nWarm regards,\nGlamourX Concierge Team\nMG Road, Bangalore`;
    }

    const res = insertStmt.run(
      recipientRole,
      recipientName,
      recipientPhone || '',
      ch,
      type,
      title,
      tailoredMessage,
      appointmentId
    );

    createdNotifications.push({
      id: res.lastInsertRowid,
      channel: ch,
      recipientName,
      title,
      message: tailoredMessage,
      sentAt: new Date().toISOString()
    });
  }

  return createdNotifications;
}

/**
 * Generate standard notifications for appointment lifecycle events
 */
function triggerAppointmentNotification(event, appointmentDetails) {
  const {
    id,
    bookingCode,
    customerName,
    customerPhone,
    serviceName,
    barberName,
    date,
    time,
    finalPrice,
    paymentStatus
  } = appointmentDetails;

  const notifications = [];

  switch (event) {
    case 'booking_confirmed':
      // 1. Notify Customer via WhatsApp & SMS
      notifications.push(...sendNotification({
        recipientRole: 'customer',
        recipientName: customerName,
        recipientPhone: customerPhone,
        channels: ['whatsapp', 'sms'],
        type: 'booking_confirmed',
        title: `Appointment Confirmed #${bookingCode}`,
        message: `Greetings ${customerName}, your appointment for ${serviceName} with ${barberName} is confirmed for ${date} at ${time}. Total: ₹${finalPrice} (${paymentStatus}). Booking Ref: ${bookingCode}`,
        appointmentId: id
      }));

      // 2. Notify Barber via WhatsApp & System
      notifications.push(...sendNotification({
        recipientRole: 'barber',
        recipientName: barberName,
        channels: ['whatsapp', 'system'],
        type: 'new_client_booking',
        title: `New Client Booking: ${customerName}`,
        message: `Hello ${barberName}, you have a new appointment with ${customerName} for ${serviceName} on ${date} at ${time}.`,
        appointmentId: id
      }));

      // 3. Notify Admin Dashboard
      notifications.push(...sendNotification({
        recipientRole: 'admin',
        recipientName: 'Admin Team',
        channels: ['system'],
        type: 'admin_alert',
        title: `New Booking #${bookingCode}`,
        message: `${customerName} booked ${serviceName} with ${barberName} for ${date} at ${time}.`,
        appointmentId: id
      }));
      break;

    case 'rescheduled':
      notifications.push(...sendNotification({
        recipientRole: 'customer',
        recipientName: customerName,
        recipientPhone: customerPhone,
        channels: ['whatsapp', 'sms'],
        type: 'rescheduled',
        title: `Appointment Rescheduled #${bookingCode}`,
        message: `Your appointment #${bookingCode} has been successfully rescheduled to ${date} at ${time} with ${barberName}.`,
        appointmentId: id
      }));
      break;

    case 'cancelled':
      notifications.push(...sendNotification({
        recipientRole: 'customer',
        recipientName: customerName,
        recipientPhone: customerPhone,
        channels: ['whatsapp', 'sms'],
        type: 'cancelled',
        title: `Appointment Cancelled #${bookingCode}`,
        message: `Your appointment #${bookingCode} for ${serviceName} on ${date} has been cancelled. If any refund is due, it will process within 2-4 business days.`,
        appointmentId: id
      }));
      break;

    case 'reminder_24h':
      notifications.push(...sendNotification({
        recipientRole: 'customer',
        recipientName: customerName,
        recipientPhone: customerPhone,
        channels: ['whatsapp', 'email'],
        type: 'reminder_24h',
        title: `24-Hour Reminder: Grooming Appointment Tomorrow`,
        message: `Dear ${customerName}, gentle reminder: your appointment with ${barberName} is scheduled tomorrow (${date}) at ${time}. We look forward to welcoming you!`,
        appointmentId: id
      }));
      break;

    case 'reminder_2h':
      notifications.push(...sendNotification({
        recipientRole: 'customer',
        recipientName: customerName,
        recipientPhone: customerPhone,
        channels: ['sms', 'whatsapp'],
        type: 'reminder_2h',
        title: `2-Hour Reminder: See You Soon at GlamourX`,
        message: `Dear ${customerName}, your session for ${serviceName} with ${barberName} starts in 2 hours at ${time}. Complimentary valet parking is available at Royal Crest Galleria.`,
        appointmentId: id
      }));
      break;

    case 'payment_success':
      notifications.push(...sendNotification({
        recipientRole: 'customer',
        recipientName: customerName,
        recipientPhone: customerPhone,
        channels: ['whatsapp', 'sms'],
        type: 'payment_success',
        title: `Payment Receipt #${bookingCode}`,
        message: `Thank you ${customerName}! We received your payment of ₹${finalPrice} for appointment #${bookingCode}.`,
        appointmentId: id
      }));
      break;
  }

  return notifications;
}

module.exports = {
  sendNotification,
  triggerAppointmentNotification
};
