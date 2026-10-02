/**
 * THE NOBLE CUT - TOASTS & MULTI-CHANNEL NOTIFICATION DRAWER
 */

const Notifications = {
  toastContainer: null,

  init() {
    this.toastContainer = document.getElementById('toastContainer');
    if (!this.toastContainer) {
      this.toastContainer = document.createElement('div');
      this.toastContainer.id = 'toastContainer';
      this.toastContainer.className = 'toast-container';
      document.body.appendChild(this.toastContainer);
    }
  },

  showToast(type = 'info', title, message, duration = 4000) {
    if (!this.toastContainer) this.init();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${message}</div>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => toast.remove(), 250);
      }
    }, duration);
  },

  async openDrawer() {
    const overlay = document.getElementById('notifDrawerOverlay');
    if (overlay) {
      overlay.classList.add('open');
      await this.refreshDrawer();
    }
  },

  closeDrawer() {
    const overlay = document.getElementById('notifDrawerOverlay');
    if (overlay) overlay.classList.remove('open');
  },

  async refreshDrawer() {
    try {
      const res = await API.getNotifications(State.currentRole);
      const list = document.getElementById('notifDrawerList');
      const badge = document.getElementById('unreadNotifBadge');

      if (badge) {
        if (res.unreadCount > 0) {
          badge.style.display = 'block';
          badge.textContent = res.unreadCount;
        } else {
          badge.style.display = 'none';
        }
      }

      if (!list) return;

      if (!res.data || res.data.length === 0) {
        list.innerHTML = `
          <div style="text-align: center; color: var(--text-dim); padding: 40px 20px;">
            <div style="font-size: 32px; margin-bottom: 10px;">🔔</div>
            <p>No notifications yet</p>
          </div>
        `;
        return;
      }

      list.innerHTML = res.data.map(n => `
        <div class="notif-card" onclick="Notifications.markAsRead(${n.id})">
          <div class="notif-channel-tag tag-${n.channel}">
            ${n.channel === 'whatsapp' ? '🟢 WhatsApp' : n.channel === 'sms' ? '💬 SMS' : n.channel === 'email' ? '✉️ Email' : '⚙️ System'}
          </div>
          <div class="notif-card-title">${n.title}</div>
          <div class="notif-card-msg">${n.message}</div>
          <div class="notif-card-time">${new Date(n.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${new Date(n.sent_at).toLocaleDateString()}</div>
        </div>
      `).join('');
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  },

  async markAsRead(id) {
    try {
      await API.markNotificationRead(id);
      this.refreshDrawer();
    } catch (e) {}
  },

  async simulateReminder(type = 'reminder_2h') {
    try {
      // Find a confirmed appointment to trigger reminder
      const appts = await API.getAppointments({ status: 'confirmed', limit: 1 });
      if (appts.data && appts.data.length > 0) {
        const appt = appts.data[0];
        await API.triggerReminder(appt.id, type);
        this.showToast('success', 'Simulated Notification Sent', `${type === 'reminder_2h' ? '2-Hour' : '24-Hour'} WhatsApp & SMS sent to ${appt.customer_name}!`);
        await this.refreshDrawer();
      } else {
        this.showToast('warning', 'No Active Appointment', 'Please book an appointment first to test reminder triggers.');
      }
    } catch (e) {
      this.showToast('error', 'Simulation Failed', e.message);
    }
  }
};
