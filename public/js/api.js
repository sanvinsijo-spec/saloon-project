/**
 * THE NOBLE CUT - REST API CLIENT
 */

const API = {
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Server request failed');
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${url}:`, err);
      throw err;
    }
  },

  // Services
  getServices(category = '', all = false) {
    let q = `/api/services?all=${all}`;
    if (category && category !== 'All') q += `&category=${encodeURIComponent(category)}`;
    return this.request(q);
  },

  createService(payload) {
    return this.request('/api/services', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateService(id, payload) {
    return this.request(`/api/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  deleteService(id) {
    return this.request(`/api/services/${id}`, { method: 'DELETE' });
  },

  // Barbers
  getBarbers(all = false) {
    return this.request(`/api/barbers?all=${all}`);
  },

  getBarberById(id) {
    return this.request(`/api/barbers/${id}`);
  },

  getBarberStats(id) {
    return this.request(`/api/barbers/${id}/stats`);
  },

  createBarber(payload) {
    return this.request('/api/barbers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateBarber(id, payload) {
    return this.request(`/api/barbers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  updateBarberSchedule(id, payload) {
    return this.request(`/api/barbers/${id}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  // Availability
  getAvailableSlots(date, barberId = 'any', duration = 30, excludeId = null) {
    let q = `/api/availability/slots?date=${date}&barberId=${barberId}&duration=${duration}`;
    if (excludeId) q += `&excludeAppointmentId=${excludeId}`;
    return this.request(q);
  },

  // Appointments
  getAppointments(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/appointments?${query}`);
  },

  getAppointmentById(id) {
    return this.request(`/api/appointments/${id}`);
  },

  createAppointment(payload) {
    return this.request('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateAppointmentStatus(id, status, paymentStatus = null) {
    return this.request(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, paymentStatus })
    });
  },

  rescheduleAppointment(id, newDate, newStartTime, barberId = null) {
    return this.request(`/api/appointments/${id}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ newDate, newStartTime, barberId })
    });
  },

  cancelAppointment(id) {
    return this.request(`/api/appointments/${id}/cancel`, {
      method: 'POST'
    });
  },

  triggerReminder(id, reminderType = 'reminder_2h') {
    return this.request(`/api/appointments/${id}/trigger-reminder`, {
      method: 'POST',
      body: JSON.stringify({ reminderType })
    });
  },

  // Customers
  getCustomers(search = '') {
    let q = '/api/customers';
    if (search) q += `?search=${encodeURIComponent(search)}`;
    return this.request(q);
  },

  getCustomerById(id) {
    return this.request(`/api/customers/${id}`);
  },

  createCustomer(payload) {
    return this.request('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  toggleBlockCustomer(id) {
    return this.request(`/api/customers/${id}/block`, { method: 'PATCH' });
  },

  // Reviews
  getReviews(barberId = null, all = false) {
    let q = `/api/reviews?all=${all}`;
    if (barberId) q += `&barberId=${barberId}`;
    return this.request(q);
  },

  createReview(payload) {
    return this.request('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  moderateReview(id, isApproved) {
    return this.request(`/api/reviews/${id}/moderate`, {
      method: 'PATCH',
      body: JSON.stringify({ is_approved: isApproved })
    });
  },

  // Coupons
  getCoupons() {
    return this.request('/api/coupons');
  },

  validateCoupon(code, subtotal) {
    return this.request('/api/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ code, subtotal })
    });
  },

  createCoupon(payload) {
    return this.request('/api/coupons', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  toggleCoupon(id) {
    return this.request(`/api/coupons/${id}/toggle`, { method: 'PATCH' });
  },

  // Dashboard & Settings
  getDashboardStats() {
    return this.request('/api/dashboard/stats');
  },

  getSettings() {
    return this.request('/api/settings');
  },

  updateSettings(payload) {
    return this.request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  addHoliday(payload) {
    return this.request('/api/settings/holidays', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteHoliday(id) {
    return this.request(`/api/settings/holidays/${id}`, { method: 'DELETE' });
  },

  // Notifications
  getNotifications(role = 'all') {
    return this.request(`/api/notifications?role=${role}`);
  },

  markNotificationRead(id) {
    return this.request(`/api/notifications/${id}/read`, { method: 'PATCH' });
  },

  simulateNotification(payload) {
    return this.request('/api/notifications/simulate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
