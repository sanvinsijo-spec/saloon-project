/**
 * THE NOBLE CUT - APPLICATION STATE
 */

const State = {
  currentRole: 'customer', // 'customer' | 'barber' | 'admin'
  activeBarberId: 1,       // 1 = Alex Vance by default
  currentCustomer: {
    id: 1,
    name: 'Vikram Malhotra',
    phone: '+91 98201 11223',
    email: 'vikram.m@gmail.com'
  },
  bookingDraft: {
    step: 1,
    service: null,
    barber: { id: 'any', name: 'Any Available Barber' },
    date: new Date().toISOString().split('T')[0],
    time: null,
    customerName: 'Vikram Malhotra',
    customerPhone: '+91 98201 11223',
    customerEmail: 'vikram.m@gmail.com',
    notes: '',
    coupon: null,
    discountAmount: 0,
    paymentMethod: 'shop',
    isAdvance: false
  },
  services: [],
  barbers: [],
  settings: {},
  listeners: [],

  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify(event, payload) {
    for (const fn of this.listeners) {
      try {
        fn(event, payload);
      } catch (e) {
        console.error('State listener error:', e);
      }
    }
  },

  setRole(role) {
    this.currentRole = role;
    this.notify('ROLE_CHANGED', role);
  },

  setActiveBarber(barberId) {
    this.activeBarberId = parseInt(barberId, 10);
    this.notify('BARBER_CHANGED', this.activeBarberId);
  },

  updateBookingDraft(updates) {
    this.bookingDraft = { ...this.bookingDraft, ...updates };
    this.notify('BOOKING_UPDATED', this.bookingDraft);
  },

  resetBookingDraft() {
    this.bookingDraft = {
      step: 1,
      service: this.services[0] || null,
      barber: { id: 'any', name: 'Any Available Barber' },
      date: new Date().toISOString().split('T')[0],
      time: null,
      customerName: this.currentCustomer.name,
      customerPhone: this.currentCustomer.phone,
      customerEmail: this.currentCustomer.email,
      notes: '',
      coupon: null,
      discountAmount: 0,
      paymentMethod: 'shop',
      isAdvance: false
    };
    this.notify('BOOKING_RESET', this.bookingDraft);
  }
};
