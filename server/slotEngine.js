const db = require('./db');

// Convert "HH:MM" string to minutes from midnight
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Convert minutes from midnight to "HH:MM" (24h)
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Format "HH:MM" to "09:30 AM"
function formatDisplayTime(timeStr) {
  if (!timeStr) return '';
  const [hours24, minutes] = timeStr.split(':').map(Number);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Check if two time ranges [start1, end1) and [start2, end2) overlap
 */
function intervalsOverlap(start1, end1, start2, end2) {
  return Math.max(start1, start2) < Math.min(end1, end2);
}

/**
 * Get shop settings as a key-value object
 */
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM shop_settings').all();
  const settings = {};
  for (const r of rows) {
    settings[r.key] = r.value;
  }
  return {
    slotInterval: parseInt(settings.slot_interval || '30', 10),
    bufferTime: parseInt(settings.buffer_time || '5', 10),
    openingTime: settings.opening_time || '09:00',
    closingTime: settings.closing_time || '20:00',
    shopName: settings.shop_name || 'GlamourX',
    ...settings
  };
}

/**
 * Calculate available slots for a given date, barber, and service duration
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {number|string} barberId - barber ID or "any"
 * @param {number} duration - service duration in minutes
 * @param {number|null} excludeAppointmentId - for rescheduling an existing appointment
 */
function getAvailableSlots(dateStr, barberId, duration, excludeAppointmentId = null) {
  const settings = getSettings();
  const slotInterval = settings.slotInterval;
  const bufferTime = settings.bufferTime;

  // 1. Check if the date is a holiday or closed
  const holiday = db.prepare('SELECT * FROM holidays WHERE holiday_date = ? AND is_closed = 1').get(dateStr);
  if (holiday) {
    return {
      date: dateStr,
      isShopClosed: true,
      reason: `Shop Closed for ${holiday.description}`,
      slots: []
    };
  }

  // Parse target date and day of week (0 = Sunday, 1 = Monday, ...)
  const targetDate = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = targetDate.getDay();

  // If "any" barber is requested, get all active barbers
  let targetBarberIds = [];
  if (barberId === 'any' || !barberId) {
    const barbers = db.prepare('SELECT id FROM barbers WHERE is_active = 1').all();
    targetBarberIds = barbers.map(b => b.id);
  } else {
    const bId = parseInt(barberId, 10);
    const barber = db.prepare('SELECT id, is_active FROM barbers WHERE id = ?').get(bId);
    if (!barber || !barber.is_active) {
      return { date: dateStr, isShopClosed: false, reason: 'Barber not active', slots: [] };
    }
    targetBarberIds = [bId];
  }

  if (targetBarberIds.length === 0) {
    return { date: dateStr, isShopClosed: false, reason: 'No active barbers available', slots: [] };
  }

  // Determine earliest start and latest end among barbers for that day
  let dayStartMin = timeToMinutes(settings.openingTime);
  let dayEndMin = timeToMinutes(settings.closingTime);

  // Barber schedules map
  const barberSchedules = {};
  for (const bId of targetBarberIds) {
    // Working hours
    const wh = db.prepare('SELECT * FROM working_hours WHERE barber_id = ? AND day_of_week = ?').get(bId, dayOfWeek);
    const isWorking = wh ? wh.is_working === 1 : (dayOfWeek !== 0); // default open Mon-Sat
    const bStart = wh ? timeToMinutes(wh.start_time) : timeToMinutes('09:00');
    const bEnd = wh ? timeToMinutes(wh.end_time) : timeToMinutes('20:00');

    // Breaks
    const breaks = db.prepare('SELECT * FROM breaks WHERE (barber_id = ? OR barber_id IS NULL) AND day_of_week = ?').all(bId, dayOfWeek);

    // Existing active appointments for this barber on this date
    let apptsQuery = `
      SELECT id, start_time, end_time, duration, buffer_minutes
      FROM appointments
      WHERE barber_id = ? AND appointment_date = ? AND status IN ('confirmed', 'in_progress')
    `;
    const params = [bId, dateStr];
    if (excludeAppointmentId) {
      apptsQuery += ' AND id != ?';
      params.push(excludeAppointmentId);
    }
    const appts = db.prepare(apptsQuery).all(...params);

    barberSchedules[bId] = {
      isWorking,
      workStart: bStart,
      workEnd: bEnd,
      breaks: breaks.map(b => ({
        start: timeToMinutes(b.start_time),
        end: timeToMinutes(b.end_time),
        label: b.label
      })),
      appointments: appts.map(a => ({
        id: a.id,
        start: timeToMinutes(a.start_time),
        end: timeToMinutes(a.end_time) + (a.buffer_minutes || bufferTime) // include buffer occupied
      }))
    };
  }

  // Check if today: slots in past should be marked unavailable
  const now = new Date();
  const todayYMD = now.toLocaleDateString('en-CA'); // "YYYY-MM-DD"
  const currentMinutesNow = now.getHours() * 60 + now.getMinutes();

  // Generate slots from dayStartMin to dayEndMin stepping by slotInterval
  const slots = [];
  for (let currentSlotStart = dayStartMin; currentSlotStart + duration <= dayEndMin; currentSlotStart += slotInterval) {
    const slotEnd = currentSlotStart + duration;
    const timeStr = minutesToTime(currentSlotStart);
    const endTimeStr = minutesToTime(slotEnd);
    const displayTime = formatDisplayTime(timeStr);

    // Check if slot is in the past
    if (dateStr === todayYMD && currentSlotStart < currentMinutesNow + 15) {
      slots.push({
        time: timeStr,
        endTime: endTimeStr,
        displayTime,
        available: false,
        reason: 'past',
        availableBarbers: []
      });
      continue;
    }

    // Check which barbers are available for this specific [currentSlotStart, slotEnd + bufferTime)
    const availableBarbersForSlot = [];
    let isBreakSlot = false;
    let isBookedSlot = false;

    for (const bId of targetBarberIds) {
      const schedule = barberSchedules[bId];
      if (!schedule.isWorking) continue;

      // Check within barber work hours
      if (currentSlotStart < schedule.workStart || slotEnd > schedule.workEnd) {
        continue;
      }

      // Check breaks
      const collidesBreak = schedule.breaks.some(b =>
        intervalsOverlap(currentSlotStart, slotEnd, b.start, b.end)
      );
      if (collidesBreak) {
        isBreakSlot = true;
        continue;
      }

      // Check existing appointments
      // New appointment requires [currentSlotStart, slotEnd + bufferTime)
      const collidesAppt = schedule.appointments.some(a =>
        intervalsOverlap(currentSlotStart, slotEnd + bufferTime, a.start, a.end)
      );
      if (collidesAppt) {
        isBookedSlot = true;
        continue;
      }

      // If passed all checks, this barber is free!
      availableBarbersForSlot.push(bId);
    }

    const isAvailable = availableBarbersForSlot.length > 0;
    let slotReason = 'available';
    if (!isAvailable) {
      if (isBreakSlot) slotReason = 'break';
      else if (isBookedSlot) slotReason = 'booked';
      else slotReason = 'unavailable';
    }

    slots.push({
      time: timeStr,
      endTime: endTimeStr,
      displayTime,
      available: isAvailable,
      reason: slotReason,
      availableBarbers: availableBarbersForSlot
    });
  }

  return {
    date: dateStr,
    barberId,
    duration,
    interval: slotInterval,
    bufferTime,
    isShopClosed: false,
    slots
  };
}

/**
 * Validate that a proposed appointment slot is valid and does not collide
 * Used at the database / transaction boundary to guarantee no double-booking
 */
function validateSlotAvailability(dateStr, barberId, startTimeStr, duration, excludeAppointmentId = null) {
  const result = getAvailableSlots(dateStr, barberId, duration, excludeAppointmentId);
  if (result.isShopClosed) {
    return { valid: false, error: result.reason };
  }

  const slot = result.slots.find(s => s.time === startTimeStr);
  if (!slot) {
    return { valid: false, error: 'Selected time slot does not fit within operating hours or intervals.' };
  }

  if (!slot.available) {
    let msg = 'The selected slot is no longer available.';
    if (slot.reason === 'booked') msg = 'This slot has already been booked by another client.';
    if (slot.reason === 'break') msg = 'This slot falls during a scheduled staff break.';
    if (slot.reason === 'past') msg = 'Cannot book a slot in the past.';
    return { valid: false, error: msg };
  }

  return { valid: true, slot, availableBarbers: slot.availableBarbers };
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  formatDisplayTime,
  getSettings,
  getAvailableSlots,
  validateSlotAvailability
};
