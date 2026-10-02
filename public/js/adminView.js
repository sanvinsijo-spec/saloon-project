/**
 * THE NOBLE CUT - ADMIN & PROPRIETOR VIEW CONTROLLER
 */

const AdminView = {
  currentTab: 'dashboard',
  calendarMode: 'month', // 'day' | 'week' | 'month'
  calendarDate: new Date(),
  cachedAppointments: [],

  async init() {
    this.setupEventListeners();
    await this.loadDashboard();
  },

  setupEventListeners() {
    // Admin tab switching
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.admin-tab-btn');
      if (tabBtn) {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        this.switchTab(tabBtn.dataset.tab);
      }
    });
  },

  switchTab(tab) {
    this.currentTab = tab;
    const panes = ['dashOverviewPane', 'dashApptsPane', 'dashCalendarPane', 'dashCustomersPane', 'dashBarbersPane', 'dashServicesPane', 'dashCouponsPane', 'dashReviewsPane', 'dashSettingsPane'];
    panes.forEach(p => {
      const el = document.getElementById(p);
      if (el) el.style.display = 'none';
    });

    switch (tab) {
      case 'dashboard':
        document.getElementById('dashOverviewPane').style.display = 'block';
        this.loadDashboard();
        break;
      case 'appointments':
        document.getElementById('dashApptsPane').style.display = 'block';
        this.loadAppointmentsList();
        break;
      case 'calendar':
        document.getElementById('dashCalendarPane').style.display = 'block';
        this.loadCalendar();
        break;
      case 'customers':
        document.getElementById('dashCustomersPane').style.display = 'block';
        this.loadCustomers();
        break;
      case 'barbers':
        document.getElementById('dashBarbersPane').style.display = 'block';
        this.loadBarbersList();
        break;
      case 'services':
        document.getElementById('dashServicesPane').style.display = 'block';
        this.loadServicesList();
        break;
      case 'coupons':
        document.getElementById('dashCouponsPane').style.display = 'block';
        this.loadCoupons();
        break;
      case 'reviews':
        document.getElementById('dashReviewsPane').style.display = 'block';
        this.loadReviewsModeration();
        break;
      case 'settings':
        document.getElementById('dashSettingsPane').style.display = 'block';
        this.loadSettings();
        break;
    }
  },

  // 1. Dashboard Overview & Chart
  async loadDashboard() {
    try {
      const res = await API.getDashboardStats();
      const { kpis, popularServices, barberPerformance, weeklyChart, todayAppointments } = res.data;

      // KPIs
      document.getElementById('kpiTodayAppts').textContent = kpis.todayAppointments;
      document.getElementById('kpiTodayRevenue').textContent = SlotHelper.formatCurrency(kpis.todayRevenue);
      document.getElementById('kpiMonthlyRevenue').textContent = SlotHelper.formatCurrency(kpis.monthlyRevenue);
      document.getElementById('kpiTotalCustomers').textContent = kpis.totalCustomers;
      document.getElementById('kpiCompleted').textContent = kpis.totalCompleted;
      document.getElementById('kpiCancelled').textContent = kpis.totalCancelled;
      document.getElementById('kpiNoShows').textContent = kpis.totalNoShows;
      document.getElementById('kpiTotalBookings').textContent = kpis.totalAppointments;

      // Render 7-day revenue trend SVG chart
      this.renderRevenueChart(weeklyChart);

      // Render Popular Services
      const popContainer = document.getElementById('dashPopularServicesList');
      if (popContainer) {
        popContainer.innerHTML = popularServices.map(s => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-subtle);">
            <div>
              <strong style="color: var(--text-main);">${s.name}</strong>
              <div style="font-size: 0.75rem; color: var(--text-dim);">${s.category} • ${SlotHelper.formatCurrency(s.price)}</div>
            </div>
            <div style="text-align: right;">
              <span class="badge badge-confirmed">${s.booking_count} bookings</span>
              <div style="font-size: 0.8rem; font-weight: 700; color: var(--gold-light); margin-top: 2px;">${SlotHelper.formatCurrency(s.total_generated)}</div>
            </div>
          </div>
        `).join('');
      }

      // Render Barber Performance
      const perfContainer = document.getElementById('dashBarberPerfList');
      if (perfContainer) {
        perfContainer.innerHTML = barberPerformance.map(b => `
          <div class="barber-perf-row">
            <div class="barber-perf-info">
              <img class="barber-perf-avatar" src="${b.photo_url}" alt="${b.name}">
              <div>
                <strong>${b.name}</strong>
                <div style="font-size: 0.75rem; color: var(--gold-primary);">★ ${b.rating} • Comm: ${b.commission_pct}%</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 800; color: var(--gold-light);">${SlotHelper.formatCurrency(b.gross_revenue)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${b.completed_count} completed (${SlotHelper.formatCurrency(b.barber_commission)} payout)</div>
            </div>
          </div>
        `).join('');
      }

      // Render Today's Schedule Table on Dashboard
      const todayTable = document.getElementById('dashTodayApptsTable');
      if (todayTable) {
        if (todayAppointments.length === 0) {
          todayTable.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No appointments scheduled for today.</td></tr>';
        } else {
          todayTable.innerHTML = todayAppointments.map(a => `
            <tr>
              <td><strong>#${a.booking_code}</strong></td>
              <td>${SlotHelper.formatTime12(a.start_time)}</td>
              <td>
                <strong>${a.customer_name}</strong>
                <div style="font-size: 0.75rem; color: var(--text-dim);">${a.customer_phone}</div>
              </td>
              <td>${a.service_name}</td>
              <td>${a.barber_name}</td>
              <td><span class="badge badge-${a.status}">${a.status.replace('_', ' ')}</span></td>
            </tr>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    }
  },

  // Interactive SVG Revenue Chart
  renderRevenueChart(data) {
    const container = document.getElementById('revenueChartSvg');
    if (!container || !data || data.length === 0) return;

    const maxRev = Math.max(...data.map(d => d.revenue), 1000);
    const height = 180;
    const width = 500;
    const padX = 40;
    const padY = 20;

    const stepX = (width - 2 * padX) / (data.length - 1);

    const points = data.map((d, idx) => {
      const x = padX + idx * stepX;
      const y = height - padY - (d.revenue / maxRev) * (height - 2 * padY);
      return { x, y, ...d };
    });

    const pathD = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; overflow: visible;">
        <defs>
          <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d4af37" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#d4af37" stop-opacity="0.0" />
          </linearGradient>
        </defs>

        <!-- Grid Lines -->
        <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="rgba(255,255,255,0.08)" />
        <line x1="${padX}" y1="${height / 2}" x2="${width - padX}" y2="${height / 2}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4" />
        <line x1="${padX}" y1="${padY}" x2="${width - padX}" y2="${padY}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4" />

        <!-- Area & Line -->
        <path d="${areaD}" fill="url(#goldGrad)" />
        <path d="${pathD}" fill="none" stroke="#d4af37" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Data points & labels -->
        ${points.map(p => `
          <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#f3e5ab" stroke="#0a0b0e" stroke-width="2" />
          <text x="${p.x}" y="${height - 4}" font-size="11" fill="#9a9ba5" text-anchor="middle" font-family="sans-serif">${p.label}</text>
          <text x="${p.x}" y="${p.y - 10}" font-size="10" font-weight="700" fill="#fbfbfd" text-anchor="middle" font-family="sans-serif">₹${p.revenue}</text>
        `).join('')}
      </svg>
    `;
  },

  // 2. Appointments List with Filters & Quick Status Updates
  async loadAppointmentsList() {
    const statusFilter = document.getElementById('filterApptStatus')?.value || 'all';
    const dateFilter = document.getElementById('filterApptDate')?.value || '';
    const searchFilter = document.getElementById('filterApptSearch')?.value || '';

    const tbody = document.getElementById('adminApptsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Loading appointments...</td></tr>';

    try {
      const res = await API.getAppointments({
        status: statusFilter,
        date: dateFilter,
        search: searchFilter,
        limit: 100
      });

      const appts = res.data || [];
      this.cachedAppointments = appts;

      if (appts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">No appointments found matching filters.</td></tr>';
        return;
      }

      tbody.innerHTML = appts.map(a => `
        <tr>
          <td>
            <a href="javascript:void(0)" onclick="CustomerView.viewAppointmentDetails(${a.id})" style="color: var(--gold-light); font-weight: 700; text-decoration: none;">
              #${a.booking_code}
            </a>
          </td>
          <td>
            <strong>${a.customer_name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${a.customer_phone}</div>
          </td>
          <td>${a.service_name} (${a.duration}m)</td>
          <td>${a.barber_name}</td>
          <td>
            <div>${a.appointment_date}</div>
            <div style="font-size: 0.8rem; color: var(--gold-primary);">${SlotHelper.formatTime12(a.start_time)}</div>
          </td>
          <td>
            <strong>₹${a.final_price}</strong>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${a.payment_status.toUpperCase()}</div>
          </td>
          <td>
            <select class="form-control" style="padding: 4px 8px; font-size: 0.8rem; width: 130px;" onchange="AdminView.changeStatus(${a.id}, this.value)">
              <option value="confirmed" ${a.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="in_progress" ${a.status === 'in_progress' ? 'selected' : ''}>In-Progress</option>
              <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="cancelled" ${a.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
              <option value="no_show" ${a.status === 'no_show' ? 'selected' : ''}>No-Show</option>
            </select>
          </td>
          <td>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-sm btn-secondary" onclick="CustomerView.viewAppointmentDetails(${a.id})" title="View QR & Details">🔍</button>
              <button class="btn btn-sm btn-outline-gold" onclick="CustomerView.rescheduleModal(${a.id})" title="Reschedule">🔄</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="color: #ef4444; padding: 20px;">Error: ${e.message}</td></tr>`;
    }
  },

  async changeStatus(id, newStatus) {
    try {
      await API.updateAppointmentStatus(id, newStatus);
      Notifications.showToast('success', 'Status Updated', `Appointment marked as ${newStatus.replace('_', ' ')}.`);
      Notifications.refreshDrawer();
    } catch (e) {
      Notifications.showToast('error', 'Update Failed', e.message);
    }
  },

  // 3. Calendar View (Day, Week, Month)
  async loadCalendar() {
    const container = document.getElementById('adminCalendarContainer');
    if (!container) return;

    try {
      const res = await API.getAppointments({ limit: 200 });
      const appts = res.data || [];

      const mode = this.calendarMode;
      const curDate = this.calendarDate;
      const year = curDate.getFullYear();
      const month = curDate.getMonth();

      document.getElementById('calMonthYearLabel').textContent = curDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      // Month View
      if (mode === 'month') {
        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

        let daysHtml = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `
          <div class="cal-day-header">${d}</div>
        `).join('');

        // Empty cells before month starts
        for (let i = 0; i < firstDayIndex; i++) {
          daysHtml += '<div class="cal-day-cell" style="opacity: 0.3;"></div>';
        }

        const todayStr = new Date().toISOString().split('T')[0];

        for (let day = 1; day <= totalDaysInMonth; day++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const dayAppts = appts.filter(a => a.appointment_date === dateStr);

          daysHtml += `
            <div class="cal-day-cell ${isToday ? 'is-today' : ''}" onclick="AdminView.openDateAppointmentsModal('${dateStr}')">
              <div class="cal-day-number">${day} ${isToday ? '★' : ''}</div>
              ${dayAppts.slice(0, 3).map(a => `
                <div class="cal-appt-chip status-${a.status}" title="${a.customer_name} - ${a.service_name} (${a.barber_name})">
                  ${SlotHelper.formatTime12(a.start_time)} ${a.customer_name.split(' ')[0]}
                </div>
              `).join('')}
              ${dayAppts.length > 3 ? `<div style="font-size: 0.68rem; color: var(--gold-primary);">+${dayAppts.length - 3} more</div>` : ''}
            </div>
          `;
        }

        container.innerHTML = `<div class="calendar-grid-month">${daysHtml}</div>`;
      }
    } catch (e) {
      container.innerHTML = `<p style="color: #ef4444;">Calendar error: ${e.message}</p>`;
    }
  },

  calNav(delta) {
    this.calendarDate.setMonth(this.calendarDate.getMonth() + delta);
    this.loadCalendar();
  },

  openDateAppointmentsModal(dateStr) {
    document.getElementById('filterApptDate').value = dateStr;
    document.querySelector('[data-tab="appointments"]').click();
  },

  // 4. Customer Management
  async loadCustomers(search = '') {
    const tbody = document.getElementById('adminCustomersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Loading customers...</td></tr>';

    try {
      const res = await API.getCustomers(search);
      const custs = res.data || [];

      if (custs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">No customers found.</td></tr>';
        return;
      }

      tbody.innerHTML = custs.map(c => `
        <tr>
          <td>
            <strong>${c.name}</strong>
            ${c.is_blocked ? '<span class="badge badge-cancelled" style="margin-left: 6px;">BLOCKED</span>' : ''}
          </td>
          <td>${c.phone}</td>
          <td>${c.email || '—'}</td>
          <td><span class="badge badge-confirmed">${c.total_appointments} visits</span></td>
          <td><strong style="color: var(--gold-light);">₹${c.calculated_spend || c.total_spent}</strong></td>
          <td><span style="font-size: 0.8rem; color: var(--text-dim);">${c.notes || '—'}</span></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-secondary" onclick="AdminView.openCustomerDetailsModal(${c.id})">Profile</button>
              <button class="btn btn-sm ${c.is_blocked ? 'btn-success' : 'btn-danger'}" onclick="AdminView.toggleBlockCustomer(${c.id})">
                ${c.is_blocked ? 'Unblock' : 'Block'}
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; padding: 20px;">${e.message}</td></tr>`;
    }
  },

  async openCustomerDetailsModal(id) {
    const modal = document.getElementById('customerProfileModal');
    if (!modal) return;

    try {
      const res = await API.getCustomerById(id);
      const c = res.data;

      document.getElementById('custProfileName').textContent = c.name;
      document.getElementById('custProfilePhone').textContent = c.phone;
      document.getElementById('custProfileEmail').textContent = c.email || 'N/A';
      document.getElementById('custProfileFav').textContent = c.favoriteService;
      document.getElementById('custProfileSpend').textContent = `₹${c.stats.totalSpent} (${c.stats.completedBookings} completed visits)`;
      document.getElementById('custProfileNotesInput').value = c.notes || '';
      document.getElementById('custProfileId').value = c.id;

      const histTable = document.getElementById('custProfileHistoryTable');
      if (histTable) {
        histTable.innerHTML = (c.appointments || []).map(a => `
          <tr>
            <td><strong>#${a.booking_code}</strong></td>
            <td>${a.service_name}</td>
            <td>${a.barber_name}</td>
            <td>${a.appointment_date}</td>
            <td>₹${a.final_price}</td>
            <td><span class="badge badge-${a.status}">${a.status}</span></td>
          </tr>
        `).join('');
      }

      modal.classList.add('open');
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  async saveCustomerNotes() {
    const id = document.getElementById('custProfileId').value;
    const notes = document.getElementById('custProfileNotesInput').value;

    try {
      await API.request(`/api/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ notes })
      });
      Notifications.showToast('success', 'Saved', 'Customer notes updated.');
      document.getElementById('customerProfileModal').classList.remove('open');
      this.loadCustomers();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  async toggleBlockCustomer(id) {
    try {
      const res = await API.toggleBlockCustomer(id);
      Notifications.showToast('info', 'Customer Status', res.message);
      this.loadCustomers();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  // 5. Barber Management
  async loadBarbersList() {
    const container = document.getElementById('adminBarbersGrid');
    if (!container) return;

    try {
      const res = await API.getBarbers(true);
      const barbers = res.data || [];

      container.innerHTML = barbers.map(b => `
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
              <img src="${b.photo_url}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--gold-primary);" alt="${b.name}">
              <div>
                <h4 style="margin-bottom: 2px;">${b.name}</h4>
                <div style="color: var(--gold-primary); font-size: 0.82rem;">${b.title}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">${b.phone}</div>
              </div>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 14px;">${b.specialization}</p>
            <div style="background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; margin-bottom: 14px;">
              <div>Commission: <strong>${b.commission_pct}%</strong></div>
              <div>Rating: <strong>★ ${b.rating}</strong> (${b.review_count} reviews)</div>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-outline-gold" onclick="AdminView.openEditBarberModal(${b.id})">Edit Profile</button>
            <button class="btn btn-sm ${b.is_active ? 'btn-secondary' : 'btn-success'}" onclick="AdminView.toggleBarberActive(${b.id}, ${b.is_active})">
              ${b.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<p style="color: #ef4444;">${e.message}</p>`;
    }
  },

  openEditBarberModal(id) {
    const b = State.barbers.find(barb => barb.id === id);
    if (!b) return;

    document.getElementById('editBarberId').value = b.id;
    document.getElementById('editBarberName').value = b.name;
    document.getElementById('editBarberTitle').value = b.title;
    document.getElementById('editBarberSpec').value = b.specialization;
    document.getElementById('editBarberCommission').value = b.commission_pct;
    document.getElementById('editBarberPhoto').value = b.photo_url;
    document.getElementById('editBarberModal').classList.add('open');
  },

  async submitEditBarber() {
    const id = document.getElementById('editBarberId').value;
    const name = document.getElementById('editBarberName').value;
    const title = document.getElementById('editBarberTitle').value;
    const specialization = document.getElementById('editBarberSpec').value;
    const commission_pct = parseFloat(document.getElementById('editBarberCommission').value);
    const photo_url = document.getElementById('editBarberPhoto').value;

    try {
      await API.updateBarber(id, { name, title, specialization, commission_pct, photo_url });
      Notifications.showToast('success', 'Barber Updated', `${name} updated successfully.`);
      document.getElementById('editBarberModal').classList.remove('open');
      this.loadBarbersList();
      CustomerView.loadInitialData();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  async toggleBarberActive(id, curState) {
    try {
      await API.updateBarber(id, { is_active: curState ? 0 : 1 });
      Notifications.showToast('info', 'Status Changed', 'Barber status updated.');
      this.loadBarbersList();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  // 6. Services Management
  async loadServicesList() {
    const container = document.getElementById('adminServicesGrid');
    if (!container) return;

    try {
      const res = await API.getServices('', true);
      const services = res.data || [];

      container.innerHTML = services.map(s => `
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="height: 120px; border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
              <img src="${s.image_url}" style="width: 100%; height: 100%; object-fit: cover;" alt="${s.name}">
            </div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
              <h4 style="font-size: 1.05rem;">${s.name}</h4>
              <span class="badge ${s.is_active ? 'badge-completed' : 'badge-cancelled'}">${s.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div style="color: var(--gold-primary); font-size: 0.8rem; margin-bottom: 6px;">${s.category} • ⏱ ${s.duration} mins</div>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 14px;">${s.description}</p>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
            <strong style="font-size: 1.2rem; color: var(--gold-light);">${SlotHelper.formatCurrency(s.price)}</strong>
            <button class="btn btn-sm btn-outline-gold" onclick="AdminView.openEditServiceModal(${s.id})">Edit Service</button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<p style="color: #ef4444;">${e.message}</p>`;
    }
  },

  openEditServiceModal(id) {
    const s = State.services.find(srv => srv.id === id);
    if (!s) return;

    document.getElementById('editServiceId').value = s.id;
    document.getElementById('editServiceName').value = s.name;
    document.getElementById('editServiceDesc').value = s.description;
    document.getElementById('editServicePrice').value = s.price;
    document.getElementById('editServiceDuration').value = s.duration;
    document.getElementById('editServiceCategory').value = s.category;
    document.getElementById('editServiceImage').value = s.image_url;
    document.getElementById('editServiceModal').classList.add('open');
  },

  async submitEditService() {
    const id = document.getElementById('editServiceId').value;
    const name = document.getElementById('editServiceName').value;
    const description = document.getElementById('editServiceDesc').value;
    const price = parseFloat(document.getElementById('editServicePrice').value);
    const duration = parseInt(document.getElementById('editServiceDuration').value, 10);
    const category = document.getElementById('editServiceCategory').value;
    const image_url = document.getElementById('editServiceImage').value;

    try {
      await API.updateService(id, { name, description, price, duration, category, image_url });
      Notifications.showToast('success', 'Service Saved', `${name} updated successfully.`);
      document.getElementById('editServiceModal').classList.remove('open');
      this.loadServicesList();
      CustomerView.loadInitialData();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  // 7. Coupons Management
  async loadCoupons() {
    const tbody = document.getElementById('adminCouponsTableBody');
    if (!tbody) return;

    try {
      const res = await API.getCoupons();
      const coupons = res.data || [];

      tbody.innerHTML = coupons.map(c => `
        <tr>
          <td><strong style="color: var(--gold-light); font-family: monospace; font-size: 1rem;">${c.code}</strong></td>
          <td>${c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `₹${c.discount_value} FLAT`}</td>
          <td>₹${c.min_spend || 0}</td>
          <td>${c.expiry_date || 'No Expiry'}</td>
          <td>${c.times_used} / ${c.usage_limit}</td>
          <td><span class="badge ${c.is_active ? 'badge-completed' : 'badge-cancelled'}">${c.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button class="btn btn-sm ${c.is_active ? 'btn-danger' : 'btn-success'}" onclick="AdminView.toggleCoupon(${c.id})">
              ${c.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444;">${e.message}</td></tr>`;
    }
  },

  async toggleCoupon(id) {
    try {
      await API.toggleCoupon(id);
      this.loadCoupons();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  // 8. Reviews Moderation
  async loadReviewsModeration() {
    const tbody = document.getElementById('adminReviewsTableBody');
    if (!tbody) return;

    try {
      const res = await API.getReviews(null, true);
      const reviews = res.data || [];

      tbody.innerHTML = reviews.map(r => `
        <tr>
          <td><strong>${r.customer_name}</strong></td>
          <td>${r.barber_name}</td>
          <td>${r.service_name}</td>
          <td style="color: var(--gold-primary);">★ ${r.rating}</td>
          <td style="font-size: 0.85rem; max-width: 250px;">"${r.comment}"</td>
          <td><span class="badge ${r.is_approved ? 'badge-completed' : 'badge-cancelled'}">${r.is_approved ? 'Approved' : 'Hidden'}</span></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-success" onclick="AdminView.moderateReview(${r.id}, 1)">Approve</button>
              <button class="btn btn-sm btn-danger" onclick="AdminView.moderateReview(${r.id}, 0)">Reject</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444;">${e.message}</td></tr>`;
    }
  },

  async moderateReview(id, status) {
    try {
      await API.moderateReview(id, status);
      Notifications.showToast('success', 'Moderation Saved', status ? 'Review approved for public display.' : 'Review hidden from public.');
      this.loadReviewsModeration();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  // 9. Shop Settings & Holidays
  async loadSettings() {
    try {
      const res = await API.getSettings();
      const { settings, holidays } = res.data;

      document.getElementById('setShopName').value = settings.shop_name || '';
      document.getElementById('setShopPhone').value = settings.shop_phone || '';
      document.getElementById('setShopEmail').value = settings.shop_email || '';
      document.getElementById('setShopAddress').value = settings.shop_address || '';
      document.getElementById('setSlotInterval').value = settings.slot_interval || '30';
      document.getElementById('setBufferTime').value = settings.buffer_time || '5';
      document.getElementById('setOpeningTime').value = settings.opening_time || '09:00';
      document.getElementById('setClosingTime').value = settings.closing_time || '20:00';

      const holList = document.getElementById('adminHolidaysList');
      if (holList) {
        holList.innerHTML = holidays.map(h => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px; margin-bottom: 8px;">
            <div>
              <strong>${h.holiday_date}</strong> — ${h.description}
            </div>
            <button class="btn btn-sm btn-danger" onclick="AdminView.deleteHoliday(${h.id})">Delete</button>
          </div>
        `).join('');
      }
    } catch (e) {
      console.error('Settings load error:', e);
    }
  },

  async saveShopSettings() {
    const payload = {
      shop_name: document.getElementById('setShopName').value,
      shop_phone: document.getElementById('setShopPhone').value,
      shop_email: document.getElementById('setShopEmail').value,
      shop_address: document.getElementById('setShopAddress').value,
      slot_interval: document.getElementById('setSlotInterval').value,
      buffer_time: document.getElementById('setBufferTime').value,
      opening_time: document.getElementById('setOpeningTime').value,
      closing_time: document.getElementById('setClosingTime').value
    };

    try {
      await API.updateSettings(payload);
      Notifications.showToast('success', 'Settings Saved', 'Shop operating parameters updated successfully.');
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  async addHoliday() {
    const date = document.getElementById('newHolidayDate').value;
    const desc = document.getElementById('newHolidayDesc').value;

    if (!date || !desc) {
      Notifications.showToast('warning', 'Holiday Info', 'Please enter date and description.');
      return;
    }

    try {
      await API.addHoliday({ holiday_date: date, description: desc });
      Notifications.showToast('success', 'Holiday Added', `Shop closed on ${date}.`);
      document.getElementById('newHolidayDate').value = '';
      document.getElementById('newHolidayDesc').value = '';
      this.loadSettings();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  async deleteHoliday(id) {
    try {
      await API.deleteHoliday(id);
      this.loadSettings();
    } catch (e) {
      Notifications.showToast('error', 'Error', e.message);
    }
  },

  // Quick Action: + New Manual Appointment
  openManualBookingModal() {
    const modal = document.getElementById('manualBookingModal');
    if (!modal) return;

    // Populate services dropdown
    const srvSelect = document.getElementById('manualServiceSelect');
    srvSelect.innerHTML = State.services.map(s => `
      <option value="${s.id}">${s.name} (₹${s.price} • ${s.duration}m)</option>
    `).join('');

    // Populate barbers dropdown
    const brbSelect = document.getElementById('manualBarberSelect');
    brbSelect.innerHTML = State.barbers.map(b => `
      <option value="${b.id}">${b.name}</option>
    `).join('');

    document.getElementById('manualApptDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('manualApptTime').value = '10:00';
    modal.classList.add('open');
  },

  async submitManualBooking() {
    const serviceId = document.getElementById('manualServiceSelect').value;
    const barberId = document.getElementById('manualBarberSelect').value;
    const appointmentDate = document.getElementById('manualApptDate').value;
    const startTime = document.getElementById('manualApptTime').value;
    const customerName = document.getElementById('manualCustomerName').value.trim();
    const customerPhone = document.getElementById('manualCustomerPhone').value.trim();
    const notes = document.getElementById('manualNotes').value.trim();

    if (!customerName || !customerPhone) {
      Notifications.showToast('warning', 'Required', 'Enter customer name and phone.');
      return;
    }

    try {
      await API.createAppointment({
        serviceId,
        barberId,
        appointmentDate,
        startTime,
        customerName,
        customerPhone,
        notes,
        paymentMethod: 'shop'
      });

      Notifications.showToast('success', 'Appointment Created', 'Manual booking created successfully.');
      document.getElementById('manualBookingModal').classList.remove('open');
      this.loadAppointmentsList();
      this.loadDashboard();
    } catch (e) {
      Notifications.showToast('error', 'Booking Error', e.message);
    }
  }
};
