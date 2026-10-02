/**
 * THE NOBLE CUT - CUSTOMER VIEW CONTROLLER
 */

const CustomerView = {
  lastConfirmedAppointment: null,

  async init() {
    this.setupEventListeners();
    await this.loadInitialData();
    this.renderWizardStep(State.bookingDraft.step);
    this.updateLiveSummary();
    this.renderCustomerTabs();
  },

  async loadInitialData() {
    try {
      const [srvRes, brbRes] = await Promise.all([
        API.getServices(),
        API.getBarbers()
      ]);

      State.services = srvRes.data || [];
      State.barbers = brbRes.data || [];

      if (!State.bookingDraft.service && State.services.length > 0) {
        State.bookingDraft.service = State.services[0];
      }

      this.renderServicesGrid();
      this.renderBarbersGrid();
      this.renderDateChips();
    } catch (err) {
      console.error('Failed to load initial booking data:', err);
    }
  },

  setupEventListeners() {
    // Category filter buttons
    document.addEventListener('click', (e) => {
      const catBtn = e.target.closest('.cat-btn');
      if (catBtn) {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        catBtn.classList.add('active');
        this.renderServicesGrid(catBtn.dataset.category);
      }
    });

    // Date chips
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.date-chip');
      if (chip) {
        document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        const selectedDate = chip.dataset.date;
        State.updateBookingDraft({ date: selectedDate, time: null });
        this.loadAvailableSlots();
      }
    });

    // Customer sub-tab switches (Book Now, Services, Barbers, My Appointments, Reviews)
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.cust-tab-btn');
      if (tabBtn) {
        document.querySelectorAll('.cust-tab-btn').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        this.switchCustomerTab(tabBtn.dataset.tab);
      }
    });
  },

  switchCustomerTab(tab) {
    const bookSec = document.getElementById('custBookingSection');
    const myApptSec = document.getElementById('custMyApptsSection');
    const reviewsSec = document.getElementById('custReviewsSection');
    const servicesSec = document.getElementById('custServicesCatalogSection');

    if (bookSec) bookSec.style.display = tab === 'book' ? 'block' : 'none';
    if (myApptSec) {
      myApptSec.style.display = tab === 'my-appts' ? 'block' : 'none';
      if (tab === 'my-appts') this.loadMyAppointments();
    }
    if (reviewsSec) {
      reviewsSec.style.display = tab === 'reviews' ? 'block' : 'none';
      if (tab === 'reviews') this.loadReviewsCatalog();
    }
    if (servicesSec) {
      servicesSec.style.display = tab === 'services' ? 'block' : 'none';
      if (tab === 'services') this.loadServicesCatalog();
    }
  },

  renderCustomerTabs() {
    const container = document.getElementById('custTabsNav');
    if (!container) return;
    container.innerHTML = `
      <button class="cust-tab-btn active" data-tab="book">✂️ Book Appointment</button>
      <button class="cust-tab-btn" data-tab="my-appts">📅 My Appointments</button>
      <button class="cust-tab-btn" data-tab="services">💈 Service Menu</button>
      <button class="cust-tab-btn" data-tab="reviews">★ Client Reviews</button>
    `;
  },

  // 1. Render Services
  renderServicesGrid(filterCategory = 'All') {
    const container = document.getElementById('servicesListContainer');
    if (!container) return;

    let filtered = State.services;
    if (filterCategory && filterCategory !== 'All') {
      filtered = filtered.filter(s => s.category.toLowerCase() === filterCategory.toLowerCase());
    }

    container.innerHTML = filtered.map(s => {
      const isSelected = State.bookingDraft.service && State.bookingDraft.service.id === s.id;
      return `
        <div class="service-card ${isSelected ? 'selected' : ''}" onclick="CustomerView.selectService(${s.id})">
          <div class="service-img-wrap">
            <img class="service-img" src="${s.image_url}" alt="${s.name}" loading="lazy">
            <div class="service-duration-badge">⏱ ${s.duration} mins</div>
          </div>
          <div class="service-content">
            <div class="service-title">${s.name}</div>
            <div class="service-desc">${s.description}</div>
            <div class="service-footer">
              <div class="service-price">${SlotHelper.formatCurrency(s.price)}</div>
              <button class="btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline-gold'}">
                ${isSelected ? 'Selected ✓' : 'Select'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  selectService(serviceId) {
    const s = State.services.find(srv => srv.id === serviceId);
    if (!s) return;
    State.updateBookingDraft({ service: s, time: null });
    this.renderServicesGrid();
    this.updateLiveSummary();
    this.goToStep(2);
  },

  // 2. Render Barbers
  renderBarbersGrid() {
    const container = document.getElementById('barbersListContainer');
    if (!container) return;

    const isAnySelected = !State.bookingDraft.barber || State.bookingDraft.barber.id === 'any';

    let html = `
      <div class="barber-card ${isAnySelected ? 'selected' : ''}" onclick="CustomerView.selectBarber('any')">
        <div class="barber-avatar-wrap">
          <div class="any-barber-avatar">⚡</div>
        </div>
        <div class="barber-name">Any Available Barber</div>
        <div class="barber-title-tag">Fastest Slot Assignment</div>
        <div class="barber-rating">★ 4.9 (All Master Craftsmen)</div>
        <div class="barber-specialty">Matches you automatically with the first available skilled barber.</div>
        <button class="btn btn-sm ${isAnySelected ? 'btn-primary' : 'btn-outline-gold'}" style="margin-top: 14px; width: 100%;">
          ${isAnySelected ? 'Selected ✓' : 'Select'}
        </button>
      </div>
    `;

    html += State.barbers.map(b => {
      const isSelected = State.bookingDraft.barber && State.bookingDraft.barber.id === b.id;
      return `
        <div class="barber-card ${isSelected ? 'selected' : ''}" onclick="CustomerView.selectBarber(${b.id})">
          <div class="barber-avatar-wrap">
            <img class="barber-avatar" src="${b.photo_url}" alt="${b.name}">
          </div>
          <div class="barber-name">${b.name}</div>
          <div class="barber-title-tag">${b.title}</div>
          <div class="barber-rating">★ ${b.rating} (${b.review_count || 100}+ reviews)</div>
          <div class="barber-specialty">${b.specialization}</div>
          <button class="btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline-gold'}" style="margin-top: 14px; width: 100%;">
            ${isSelected ? 'Selected ✓' : 'Select'}
          </button>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  },

  selectBarber(barberId) {
    if (barberId === 'any') {
      State.updateBookingDraft({
        barber: { id: 'any', name: 'Any Available Barber' },
        time: null
      });
    } else {
      const b = State.barbers.find(barb => barb.id === barberId);
      if (!b) return;
      State.updateBookingDraft({ barber: b, time: null });
    }
    this.renderBarbersGrid();
    this.updateLiveSummary();
    this.goToStep(3);
  },

  // 3. Render Date Selector
  renderDateChips() {
    const container = document.getElementById('dateChipsContainer');
    if (!container) return;

    const days = SlotHelper.getNext14Days();
    container.innerHTML = days.map(d => {
      const isSelected = State.bookingDraft.date === d.dateStr;
      return `
        <div class="date-chip ${isSelected ? 'selected' : ''}" data-date="${d.dateStr}">
          <div class="date-chip-day">${d.dayName}</div>
          <div class="date-chip-date">${d.dayNumber}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${d.monthName}</div>
        </div>
      `;
    }).join('');

    const customDateInput = document.getElementById('customBookingDate');
    if (customDateInput) {
      customDateInput.value = State.bookingDraft.date;
      customDateInput.min = new Date().toISOString().split('T')[0];
      customDateInput.onchange = (e) => {
        State.updateBookingDraft({ date: e.target.value, time: null });
        this.renderDateChips();
        this.loadAvailableSlots();
      };
    }
  },

  // 4. Render Available Slots
  async loadAvailableSlots() {
    const container = document.getElementById('availableSlotsGrid');
    if (!container) return;

    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-muted);">
        <div style="font-size: 24px; animation: spin 1s infinite linear;">⏱</div>
        <p style="margin-top: 8px;">Calculating real-time barber availability...</p>
      </div>
    `;

    try {
      const duration = State.bookingDraft.service ? State.bookingDraft.service.duration : 30;
      const barberId = State.bookingDraft.barber ? State.bookingDraft.barber.id : 'any';
      const date = State.bookingDraft.date;

      const res = await API.getAvailableSlots(date, barberId, duration);
      const data = res.data;

      if (data.isShopClosed) {
        container.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3);">
            <div style="font-size: 32px; margin-bottom: 8px;">🛑</div>
            <h4 style="color: #f87171; margin-bottom: 4px;">Shop Closed</h4>
            <p style="color: var(--text-muted);">${data.reason}</p>
          </div>
        `;
        return;
      }

      if (!data.slots || data.slots.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
            <p>No available slots found for this date. Please select another date.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = data.slots.map(s => {
        const isSelected = State.bookingDraft.time === s.time;
        const isDisabled = !s.available;
        let statusLabel = 'Available';
        if (s.reason === 'booked') statusLabel = 'Booked';
        if (s.reason === 'break') statusLabel = 'Break';
        if (s.reason === 'past') statusLabel = 'Past';

        return `
          <button
            class="slot-btn ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}"
            ${isDisabled ? 'disabled' : ''}
            onclick="CustomerView.selectTimeSlot('${s.time}')"
          >
            <div class="slot-time">${s.displayTime}</div>
            <div class="slot-status ${s.reason}">${statusLabel}</div>
          </button>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 20px;">
          Failed to load slots: ${err.message}
        </div>
      `;
    }
  },

  selectTimeSlot(timeStr) {
    State.updateBookingDraft({ time: timeStr });
    this.loadAvailableSlots();
    this.updateLiveSummary();
    this.goToStep(5);
  },

  // 5. Customer Details Step
  syncCustomerInputs() {
    const nameEl = document.getElementById('custInputName');
    const phoneEl = document.getElementById('custInputPhone');
    const emailEl = document.getElementById('custInputEmail');
    const notesEl = document.getElementById('custInputNotes');

    if (nameEl) nameEl.value = State.bookingDraft.customerName || '';
    if (phoneEl) phoneEl.value = State.bookingDraft.customerPhone || '';
    if (emailEl) emailEl.value = State.bookingDraft.customerEmail || '';
    if (notesEl) notesEl.value = State.bookingDraft.notes || '';
  },

  saveCustomerInputs() {
    const name = document.getElementById('custInputName')?.value.trim();
    const phone = document.getElementById('custInputPhone')?.value.trim();
    const email = document.getElementById('custInputEmail')?.value.trim();
    const notes = document.getElementById('custInputNotes')?.value.trim();

    if (!name || !phone) {
      Notifications.showToast('warning', 'Details Required', 'Please enter your Full Name and Mobile Phone Number.');
      return false;
    }

    State.updateBookingDraft({
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      notes: notes
    });

    return true;
  },

  // 6. Review & Promo Code
  async applyCoupon() {
    const input = document.getElementById('promoCodeInput');
    if (!input || !input.value.trim()) {
      Notifications.showToast('warning', 'Coupon Code', 'Please enter a coupon code.');
      return;
    }

    const code = input.value.trim().toUpperCase();
    const subtotal = State.bookingDraft.service ? State.bookingDraft.service.price : 0;

    try {
      const res = await API.validateCoupon(code, subtotal);
      State.updateBookingDraft({
        coupon: res.data.code,
        discountAmount: res.data.discountAmount
      });
      Notifications.showToast('success', 'Promo Applied!', `You saved ₹${res.data.discountAmount} with code ${res.data.code}`);
      this.updateLiveSummary();
    } catch (err) {
      Notifications.showToast('error', 'Coupon Error', err.message);
    }
  },

  // 7. Payment & Booking Submission
  async processBooking(paymentMethod = 'shop', isAdvance = false) {
    if (!this.saveCustomerInputs()) {
      this.goToStep(5);
      return;
    }

    if (!State.bookingDraft.service || !State.bookingDraft.time || !State.bookingDraft.date) {
      Notifications.showToast('error', 'Incomplete Booking', 'Please select service, date, and available time slot.');
      return;
    }

    // If online payment selected, open mock Razorpay modal
    if (paymentMethod === 'online_card' || paymentMethod === 'online_upi') {
      this.openRazorpayModal(paymentMethod);
      return;
    }

    await this.submitFinalBooking(paymentMethod, isAdvance);
  },

  async submitFinalBooking(paymentMethod = 'shop', isAdvance = false) {
    const submitBtn = document.getElementById('confirmBookingFinalBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Securing Your Slot...';
    }

    try {
      const payload = {
        serviceId: State.bookingDraft.service.id,
        barberId: State.bookingDraft.barber ? State.bookingDraft.barber.id : 'any',
        appointmentDate: State.bookingDraft.date,
        startTime: State.bookingDraft.time,
        customerName: State.bookingDraft.customerName,
        customerPhone: State.bookingDraft.customerPhone,
        customerEmail: State.bookingDraft.customerEmail,
        notes: State.bookingDraft.notes,
        couponCode: State.bookingDraft.coupon,
        paymentMethod: paymentMethod,
        isAdvancePayment: isAdvance
      };

      const res = await API.createAppointment(payload);
      const appt = res.data;
      this.lastConfirmedAppointment = appt;

      Notifications.showToast('success', 'Booking Confirmed!', `Your appointment #${appt.booking_code} is confirmed.`);
      this.renderConfirmationScreen(appt);
      this.goToStep(7);
      Notifications.refreshDrawer();
    } catch (err) {
      Notifications.showToast('error', 'Booking Conflict', err.message);
      if (err.message.includes('slot') || err.message.includes('unavailable') || err.message.includes('booked')) {
        this.goToStep(4);
        this.loadAvailableSlots();
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking →';
      }
    }
  },

  openRazorpayModal(method = 'online_upi') {
    const modal = document.getElementById('razorpayModal');
    if (!modal) return;

    const subtotal = State.bookingDraft.service ? State.bookingDraft.service.price : 0;
    const finalPrice = Math.max(0, subtotal - (State.bookingDraft.discountAmount || 0));

    const amountDisplay = document.getElementById('rpAmountDisplay');
    if (amountDisplay) amountDisplay.textContent = `₹${finalPrice}`;

    modal.classList.add('open');
  },

  closeRazorpayModal() {
    const modal = document.getElementById('razorpayModal');
    if (modal) modal.classList.remove('open');
  },

  async simulateRazorpaySuccess() {
    this.closeRazorpayModal();
    Notifications.showToast('info', 'Processing Payment...', 'Authorizing secure transaction via Razorpay Test Gateway');
    setTimeout(async () => {
      await this.submitFinalBooking('online_upi', false);
    }, 600);
  },

  // Confirmation Screen
  renderConfirmationScreen(appt) {
    const container = document.getElementById('bookingConfirmationView');
    if (!container) return;

    container.innerHTML = `
      <div class="confirmation-container">
        <div class="conf-seal">✂️</div>
        <h2 class="conf-title font-serif">Appointment Confirmed</h2>
        <p class="conf-subtitle">Thank you, <strong>${appt.customer_name}</strong>. Your chair has been reserved at GlamourX.</p>

        <div class="conf-badge-id">REF: #${appt.booking_code}</div>

        <div class="qr-code-box">
          <img class="qr-img" src="${appt.qrCodeUrl}" alt="Booking QR Code">
        </div>
        <p style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 24px;">Show this QR code at reception for expedited check-in.</p>

        <div class="conf-details-table">
          <div class="conf-detail-row">
            <span class="summary-item-label">Service</span>
            <span class="summary-item-val">${appt.service_name} (${appt.duration} mins)</span>
          </div>
          <div class="conf-detail-row">
            <span class="summary-item-label">Master Craftsman</span>
            <span class="summary-item-val">${appt.barber_name}</span>
          </div>
          <div class="conf-detail-row">
            <span class="summary-item-label">Date & Time</span>
            <span class="summary-item-val" style="color: var(--gold-light);">${SlotHelper.formatFriendlyDate(appt.appointment_date)} at ${SlotHelper.formatTime12(appt.start_time)}</span>
          </div>
          <div class="conf-detail-row">
            <span class="summary-item-label">Shop Address</span>
            <span class="summary-item-val">Royal Crest Galleria, MG Road, Bangalore</span>
          </div>
          <div class="conf-detail-row">
            <span class="summary-item-label">Amount Paid / Total</span>
            <span class="summary-item-val font-display" style="color: var(--gold-light);">₹${appt.final_price} (${appt.payment_status.toUpperCase()})</span>
          </div>
        </div>

        <div class="conf-actions">
          <button class="btn btn-primary" onclick="SlotHelper.downloadIcsCalendar(CustomerView.lastConfirmedAppointment)">
            📅 Download .ICS Calendar
          </button>
          <a class="btn btn-secondary" target="_blank" href="${SlotHelper.getGoogleCalendarUrl(appt)}">
            Google Calendar ↗
          </a>
          <button class="btn btn-secondary" onclick="CustomerView.switchCustomerTab('my-appts')">
            View My Bookings
          </button>
          <button class="btn btn-outline-gold" onclick="CustomerView.rescheduleModal(${appt.id})">
            Reschedule
          </button>
          <button class="btn btn-danger" onclick="CustomerView.cancelAppointment(${appt.id})">
            Cancel
          </button>
        </div>
      </div>
    `;
  },

  // Live Summary Sticky Card
  updateLiveSummary() {
    const srv = State.bookingDraft.service;
    const brb = State.bookingDraft.barber;
    const date = State.bookingDraft.date;
    const time = State.bookingDraft.time;
    const discount = State.bookingDraft.discountAmount || 0;

    const srvNameEl = document.getElementById('liveSummaryService');
    const srvDurEl = document.getElementById('liveSummaryDuration');
    const brbNameEl = document.getElementById('liveSummaryBarber');
    const dateEl = document.getElementById('liveSummaryDate');
    const timeEl = document.getElementById('liveSummaryTime');
    const subtotalEl = document.getElementById('liveSummarySubtotal');
    const discountRow = document.getElementById('liveSummaryDiscountRow');
    const discountValEl = document.getElementById('liveSummaryDiscount');
    const totalEl = document.getElementById('liveSummaryTotal');

    if (srvNameEl) srvNameEl.textContent = srv ? srv.name : 'Select a service';
    if (srvDurEl) srvDurEl.textContent = srv ? `${srv.duration} minutes` : '—';
    if (brbNameEl) brbNameEl.textContent = brb ? brb.name : 'Any Available';
    if (dateEl) dateEl.textContent = date ? SlotHelper.formatFriendlyDate(date) : 'Choose date';
    if (timeEl) timeEl.textContent = time ? SlotHelper.formatTime12(time) : 'Choose slot';

    const subtotal = srv ? srv.price : 0;
    const total = Math.max(0, subtotal - discount);

    if (subtotalEl) subtotalEl.textContent = SlotHelper.formatCurrency(subtotal);
    if (totalEl) totalEl.textContent = SlotHelper.formatCurrency(total);

    if (discountRow) {
      if (discount > 0) {
        discountRow.style.display = 'flex';
        if (discountValEl) discountValEl.textContent = `-${SlotHelper.formatCurrency(discount)}`;
      } else {
        discountRow.style.display = 'none';
      }
    }

    const actionBtn = document.getElementById('liveSummaryActionBtn');
    if (actionBtn) {
      if (State.bookingDraft.step === 7) {
        actionBtn.style.display = 'none';
      } else {
        actionBtn.style.display = 'block';
        if (State.bookingDraft.step < 6) {
          actionBtn.textContent = 'Next Step →';
          actionBtn.onclick = () => this.goToNextStep();
        } else if (State.bookingDraft.step === 6) {
          actionBtn.textContent = 'Confirm Booking →';
          actionBtn.onclick = () => this.processBooking('shop');
        }
      }
    }
  },

  goToNextStep() {
    const cur = State.bookingDraft.step;
    if (cur === 1 && !State.bookingDraft.service) {
      Notifications.showToast('warning', 'Select Service', 'Please pick a grooming service.');
      return;
    }
    if (cur === 4 && !State.bookingDraft.time) {
      Notifications.showToast('warning', 'Select Time', 'Please pick an available time slot.');
      return;
    }
    if (cur === 5) {
      if (!this.saveCustomerInputs()) return;
    }
    this.goToStep(cur + 1);
  },

  goToStep(stepNumber) {
    State.bookingDraft.step = stepNumber;

    // Update wizard tracker pills
    document.querySelectorAll('.wizard-step').forEach(ws => {
      const stepVal = parseInt(ws.dataset.step, 10);
      ws.classList.remove('active', 'completed');
      if (stepVal === stepNumber) ws.classList.add('active');
      else if (stepVal < stepNumber) ws.classList.add('completed');
    });

    // Update panes
    document.querySelectorAll('.step-pane').forEach(p => p.classList.remove('active'));
    const targetPane = document.getElementById(`stepPane${stepNumber}`);
    if (targetPane) targetPane.classList.add('active');

    if (stepNumber === 4) {
      this.loadAvailableSlots();
    } else if (stepNumber === 5) {
      this.syncCustomerInputs();
    }

    this.updateLiveSummary();
    window.scrollTo({ top: 180, behavior: 'smooth' });
  },

  // My Appointments View
  async loadMyAppointments() {
    const container = document.getElementById('myAppointmentsGrid');
    if (!container) return;

    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p>Loading your appointments...</p>
      </div>
    `;

    try {
      const res = await API.getAppointments({ limit: 50 });
      const appts = res.data || [];

      if (appts.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted);">
            <div style="font-size: 36px; margin-bottom: 12px;">📅</div>
            <h3>No Appointments Found</h3>
            <p style="margin-top: 8px;">Book your first luxury grooming appointment today!</p>
            <button class="btn btn-primary" style="margin-top: 18px;" onclick="CustomerView.switchCustomerTab('book')">
              Book Appointment Now
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = appts.map(a => `
        <div class="appointment-ticket card">
          <div class="ticket-header">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-dim);">BOOKING ID</div>
              <strong style="color: var(--gold-light);">#${a.booking_code}</strong>
            </div>
            <span class="badge badge-${a.status}">${a.status.replace('_', ' ')}</span>
          </div>

          <div>
            <h4 style="font-size: 1.15rem; margin-bottom: 4px;">${a.service_name}</h4>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Barber: <strong>${a.barber_name}</strong></div>
          </div>

          <div style="background: rgba(255,255,255,0.02); padding: 10px; border-radius: 6px; font-size: 0.85rem;">
            <div>📅 <strong>${SlotHelper.formatFriendlyDate(a.appointment_date)}</strong></div>
            <div style="color: var(--gold-light); margin-top: 2px;">⏰ <strong>${SlotHelper.formatTime12(a.start_time)}</strong> (${a.duration} mins)</div>
            <div style="margin-top: 4px; color: var(--text-dim);">Total: ₹${a.final_price} • ${a.payment_status.toUpperCase()}</div>
          </div>

          <div class="ticket-actions">
            ${a.status === 'confirmed' ? `
              <button class="btn btn-sm btn-outline-gold" onclick="CustomerView.rescheduleModal(${a.id})">Reschedule</button>
              <button class="btn btn-sm btn-danger" onclick="CustomerView.cancelAppointment(${a.id})">Cancel</button>
            ` : ''}
            ${a.status === 'completed' ? `
              <button class="btn btn-sm btn-primary" onclick="CustomerView.openReviewModal(${a.id})">★ Leave Review</button>
            ` : ''}
            <button class="btn btn-sm btn-secondary" onclick="CustomerView.viewAppointmentDetails(${a.id})">Details & QR</button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<p style="color: #ef4444;">Error loading appointments: ${e.message}</p>`;
    }
  },

  async viewAppointmentDetails(id) {
    try {
      const res = await API.getAppointmentById(id);
      const appt = res.data;
      this.lastConfirmedAppointment = appt;
      this.renderConfirmationScreen(appt);
      this.switchCustomerTab('book');
      this.goToStep(7);
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  async rescheduleModal(id) {
    const modal = document.getElementById('rescheduleModal');
    if (!modal) return;

    try {
      const res = await API.getAppointmentById(id);
      const appt = res.data;

      document.getElementById('rescheduleApptId').value = appt.id;
      document.getElementById('rescheduleCurrentInfo').innerHTML = `
        <strong>#${appt.booking_code}</strong> — ${appt.service_name} with ${appt.barber_name}<br>
        Current: ${appt.appointment_date} at ${SlotHelper.formatTime12(appt.start_time)}
      `;

      const dateInput = document.getElementById('rescheduleNewDate');
      dateInput.value = appt.appointment_date;
      dateInput.min = new Date().toISOString().split('T')[0];

      await this.loadRescheduleSlots(appt.id, appt.barber_id, appt.appointment_date, appt.duration);

      dateInput.onchange = () => {
        this.loadRescheduleSlots(appt.id, appt.barber_id, dateInput.value, appt.duration);
      };

      modal.classList.add('open');
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  async loadRescheduleSlots(apptId, barberId, date, duration) {
    const container = document.getElementById('rescheduleSlotsGrid');
    if (!container) return;

    container.innerHTML = 'Loading available slots...';
    try {
      const res = await API.getAvailableSlots(date, barberId, duration, apptId);
      const slots = res.data.slots || [];

      if (slots.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">No slots available on this date.</p>';
        return;
      }

      container.innerHTML = slots.map(s => `
        <button
          type="button"
          class="slot-btn ${!s.available ? 'disabled' : ''}"
          ${!s.available ? 'disabled' : ''}
          onclick="document.getElementById('rescheduleNewTime').value='${s.time}'; this.parentElement.querySelectorAll('.slot-btn').forEach(b=>b.classList.remove('selected')); this.classList.add('selected');"
        >
          <div class="slot-time">${s.displayTime}</div>
          <div class="slot-status ${s.reason}">${s.available ? 'Available' : s.reason}</div>
        </button>
      `).join('');
    } catch (e) {
      container.innerHTML = `<p style="color: #ef4444;">${e.message}</p>`;
    }
  },

  async submitReschedule() {
    const apptId = document.getElementById('rescheduleApptId').value;
    const newDate = document.getElementById('rescheduleNewDate').value;
    const newTime = document.getElementById('rescheduleNewTime').value;

    if (!newDate || !newTime) {
      Notifications.showToast('warning', 'Slot Required', 'Please pick a new date and time slot.');
      return;
    }

    try {
      await API.rescheduleAppointment(apptId, newDate, newTime);
      Notifications.showToast('success', 'Rescheduled!', 'Your appointment has been successfully rescheduled.');
      document.getElementById('rescheduleModal').classList.remove('open');
      this.loadMyAppointments();
      Notifications.refreshDrawer();
    } catch (e) {
      Notifications.showToast('error', 'Reschedule Failed', e.message);
    }
  },

  async cancelAppointment(id) {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      await API.cancelAppointment(id);
      Notifications.showToast('info', 'Cancelled', 'Appointment cancelled and time slot released.');
      this.loadMyAppointments();
      Notifications.refreshDrawer();
    } catch (e) {
      Notifications.showToast('error', 'Cancellation Failed', e.message);
    }
  },

  // Review Modal
  openReviewModal(apptId) {
    const modal = document.getElementById('reviewModal');
    if (!modal) return;
    document.getElementById('reviewApptId').value = apptId;
    document.getElementById('reviewRatingVal').value = '5';
    document.getElementById('reviewCommentInput').value = '';
    this.updateStarRatingDisplay(5);
    modal.classList.add('open');
  },

  updateStarRatingDisplay(rating) {
    const stars = document.querySelectorAll('#reviewStarsContainer .star');
    stars.forEach((s, idx) => {
      s.textContent = idx < rating ? '★' : '☆';
    });
  },

  async submitReview() {
    const apptId = document.getElementById('reviewApptId').value;
    const rating = document.getElementById('reviewRatingVal').value;
    const comment = document.getElementById('reviewCommentInput').value.trim();

    try {
      await API.createReview({ appointmentId: apptId, rating, comment });
      Notifications.showToast('success', 'Thank You!', 'Your review has been submitted.');
      document.getElementById('reviewModal').classList.remove('open');
      this.loadMyAppointments();
    } catch (e) {
      Notifications.showToast('error', 'Review Failed', e.message);
    }
  },

  // Reviews Catalog
  async loadReviewsCatalog() {
    const container = document.getElementById('reviewsCatalogGrid');
    if (!container) return;
    container.innerHTML = '<p>Loading testimonials...</p>';

    try {
      const res = await API.getReviews(null, false);
      const reviews = res.data || [];

      if (reviews.length === 0) {
        container.innerHTML = '<p>No reviews yet. Be the first to share your experience!</p>';
        return;
      }

      container.innerHTML = reviews.map(r => `
        <div class="card" style="border-left: 3px solid var(--gold-primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="color: var(--gold-primary); font-size: 1.1rem;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${new Date(r.created_at).toLocaleDateString()}</div>
          </div>
          <p style="font-style: italic; color: var(--text-main); margin-bottom: 12px; font-size: 0.95rem;">"${r.comment}"</p>
          <div style="display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--text-muted);">
            <span><strong>${r.customer_name}</strong></span>
            <span>Craftsman: <em>${r.barber_name}</em></span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<p style="color: #ef4444;">${e.message}</p>`;
    }
  },

  // Services Catalog Tab
  loadServicesCatalog() {
    const container = document.getElementById('servicesCatalogGrid');
    if (!container) return;

    container.innerHTML = State.services.map(s => `
      <div class="service-card" onclick="CustomerView.switchCustomerTab('book'); CustomerView.selectService(${s.id});">
        <div class="service-img-wrap">
          <img class="service-img" src="${s.image_url}" alt="${s.name}">
          <div class="service-duration-badge">⏱ ${s.duration} mins</div>
        </div>
        <div class="service-content">
          <div class="service-title">${s.name}</div>
          <div class="service-desc">${s.description}</div>
          <div class="service-footer">
            <div class="service-price">${SlotHelper.formatCurrency(s.price)}</div>
            <button class="btn btn-sm btn-primary">Book This Service →</button>
          </div>
        </div>
      </div>
    `).join('');
  }
};
