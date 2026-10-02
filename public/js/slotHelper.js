/**
 * THE NOBLE CUT - SLOT & TIME UTILITIES
 */

const SlotHelper = {
  formatCurrency(amount) {
    return `₹${Math.round(amount || 0)}`;
  },

  formatTime12(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const p = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${p}`;
  },

  formatFriendlyDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  },

  getNext14Days() {
    const days = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNumber = d.getDate();
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });

      days.push({
        dateStr,
        dayName,
        dayNumber,
        monthName,
        isToday: i === 0
      });
    }

    return days;
  },

  /**
   * Generate an .ics calendar file content and trigger download
   */
  downloadIcsCalendar(appointment) {
    const { booking_code, service_name, barber_name, appointment_date, start_time, duration } = appointment;
    const [h, m] = start_time.split(':').map(Number);
    
    const startObj = new Date(`${appointment_date}T${start_time}:00`);
    const endObj = new Date(startObj.getTime() + (duration || 30) * 60000);

    const formatIcsTime = (d) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GlamourX Luxury Salon//Appointment Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${booking_code}@glamourx.com`,
      `SUMMARY:${service_name} with ${barber_name} - GlamourX`,
      `DESCRIPTION:Appointment Ref #${booking_code}. Service: ${service_name} (${duration} mins) with ${barber_name}. Shop Address: Royal Crest Galleria, MG Road, Bangalore.`,
      `LOCATION:Royal Crest Galleria, MG Road, Bangalore`,
      `DTSTART:${formatIcsTime(startObj)}`,
      `DTEND:${formatIcsTime(endObj)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `GlamourX_${booking_code}.ics`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  /**
   * Generate Google Calendar web redirect URL
   */
  getGoogleCalendarUrl(appointment) {
    const { booking_code, service_name, barber_name, appointment_date, start_time, duration } = appointment;
    const startObj = new Date(`${appointment_date}T${start_time}:00`);
    const endObj = new Date(startObj.getTime() + (duration || 30) * 60000);

    const formatGcalTime = (d) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const title = encodeURIComponent(`${service_name} with ${barber_name} - GlamourX`);
    const details = encodeURIComponent(`Appointment Ref #${booking_code}. Service: ${service_name} (${duration} mins) with ${barber_name}.`);
    const location = encodeURIComponent('GlamourX, Royal Crest Galleria, MG Road, Bangalore');
    const dates = `${formatGcalTime(startObj)}/${formatGcalTime(endObj)}`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
  }
};
