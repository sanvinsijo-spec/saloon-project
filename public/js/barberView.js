/**
 * THE NOBLE CUT - BARBER PORTAL VIEW CONTROLLER
 */

const BarberView = {
  currentBarber: null,

  async init() {
    this.populateBarberSwitcher();
    await this.loadBarberProfile();
  },

  populateBarberSwitcher() {
    const switcher = document.getElementById('barberSelectDropdown');
    if (!switcher) return;

    switcher.innerHTML = State.barbers.map(b => `
      <option value="${b.id}" ${b.id === State.activeBarberId ? 'selected' : ''}>
        💈 ${b.name} (${b.title.split('&')[0]})
      </option>
    `).join('');

    switcher.onchange = (e) => {
      State.setActiveBarber(e.target.value);
      this.loadBarberProfile();
    };
  },

  async loadBarberProfile() {
    try {
      const res = await API.getBarberStats(State.activeBarberId);
      const { barber, todayAppointments, stats } = res.data;
      this.currentBarber = barber;

      // Update Barber Profile Header
      const nameEl = document.getElementById('barberHeroName');
      const titleEl = document.getElementById('barberHeroTitle');
      const photoEl = document.getElementById('barberHeroPhoto');
      const ratingEl = document.getElementById('barberHeroRating');

      if (nameEl) nameEl.textContent = barber.name;
      if (titleEl) titleEl.textContent = barber.title;
      if (photoEl) photoEl.src = barber.photo_url;
      if (ratingEl) ratingEl.textContent = `★ ${barber.rating} (${barber.review_count} client reviews)`;

      // Update Barber Stats Cards
      document.getElementById('barberTodayClients').textContent = stats.todayAppointmentsCount;
      document.getElementById('barberTodayEarnings').textContent = `₹${stats.todayEarnings}`;
      document.getElementById('barberTotalCompleted').textContent = stats.completedAppointments;
      document.getElementById('barberCommissionRate').textContent = `${barber.commission_pct}%`;

      // Render Today's Queue
      this.renderTodayQueue(todayAppointments);

      // Render Working Hours & Breaks
      this.renderBarberAvailability(barber);
    } catch (e) {
      console.error('Failed to load barber portal:', e);
    }
  },

  renderTodayQueue(appts) {
    const container = document.getElementById('barberTodayQueueList');
    if (!container) return;

    if (!appts || appts.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-surface); border-radius: 8px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 32px; margin-bottom: 8px;">💈</div>
          <h4>No Appointments Today</h4>
          <p style="margin-top: 4px;">You have no bookings queued for today. Enjoy the downtime!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = appts.map(a => `
      <div class="queue-card status-${a.status}">
        <div class="queue-time-badge">
          <div class="queue-time">${SlotHelper.formatTime12(a.start_time)}</div>
          <div class="queue-dur">${a.duration} mins</div>
        </div>

        <div class="queue-client-info">
          <div class="queue-client-name">${a.customer_name} <span class="badge badge-${a.status}">${a.status.replace('_', ' ')}</span></div>
          <div class="queue-client-service">${a.service_name} • <strong>₹${a.final_price}</strong> (${a.payment_status.toUpperCase()})</div>
          <div class="queue-client-notes">${a.notes ? `Note: "${a.notes}"` : 'No special requests'}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 4px;">Phone: ${a.customer_phone} • Ref: #${a.booking_code}</div>
        </div>

        <div class="queue-status-actions">
          ${a.status !== 'in_progress' && a.status !== 'completed' && a.status !== 'cancelled' ? `
            <button class="btn btn-sm btn-primary" onclick="BarberView.updateStatus(${a.id}, 'in_progress')">
              Start ✂️
            </button>
          ` : ''}

          ${a.status === 'in_progress' ? `
            <button class="btn btn-sm btn-success" onclick="BarberView.updateStatus(${a.id}, 'completed')">
              Complete ✅
            </button>
          ` : ''}

          ${a.status === 'confirmed' ? `
            <button class="btn btn-sm btn-danger" onclick="BarberView.updateStatus(${a.id}, 'no_show')">
              No-Show ⚠️
            </button>
            <button class="btn btn-sm btn-secondary" onclick="BarberView.updateStatus(${a.id}, 'cancelled')">
              Cancel ❌
            </button>
          ` : ''}

          <button class="btn btn-sm btn-secondary" onclick="CustomerView.viewAppointmentDetails(${a.id})">
            Details
          </button>
        </div>
      </div>
    `).join('');
  },

  async updateStatus(apptId, newStatus) {
    try {
      await API.updateAppointmentStatus(apptId, newStatus);
      Notifications.showToast('success', 'Status Updated', `Appointment marked as ${newStatus.replace('_', ' ')}.`);
      await this.loadBarberProfile();
      Notifications.refreshDrawer();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  async renderBarberAvailability(barber) {
    const container = document.getElementById('barberAvailabilityContainer');
    if (!container) return;

    try {
      const res = await API.getBarberById(barber.id);
      const bData = res.data;
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      container.innerHTML = `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Working Hours</th>
                <th>Breaks</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${days.map((dayName, idx) => {
                const wh = (bData.workingHours || []).find(w => w.day_of_week === idx);
                const brk = (bData.breaks || []).find(b => b.day_of_week === idx);
                const isWorking = wh ? wh.is_working : (idx !== 0);

                return `
                  <tr>
                    <td><strong>${dayName}</strong></td>
                    <td>${isWorking && wh ? `${SlotHelper.formatTime12(wh.start_time)} – ${SlotHelper.formatTime12(wh.end_time)}` : 'Off Duty'}</td>
                    <td>${isWorking && brk ? `${brk.label} (${SlotHelper.formatTime12(brk.start_time)} – ${SlotHelper.formatTime12(brk.end_time)})` : '—'}</td>
                    <td><span class="badge ${isWorking ? 'badge-completed' : 'badge-cancelled'}">${isWorking ? 'Available' : 'Day Off'}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<p style="color: #ef4444;">${e.message}</p>`;
    }
  }
};
