/**
 * THE NOBLE CUT - MAIN APPLICATION ENTRYPOINT & ROUTER
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize notification system
  Notifications.init();

  // Role Switcher handling
  const roleButtons = document.querySelectorAll('.role-btn');
  roleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedRole = btn.dataset.role;
      switchRole(selectedRole);
    });
  });

  function switchRole(role) {
    State.setRole(role);

    // Update active button
    roleButtons.forEach(b => {
      b.classList.toggle('active', b.dataset.role === role);
    });

    // Update views
    document.querySelectorAll('.view-portal').forEach(p => p.classList.remove('active'));

    if (role === 'customer') {
      document.getElementById('customerPortal').classList.add('active');
    } else if (role === 'barber') {
      document.getElementById('barberPortal').classList.add('active');
      BarberView.init();
    } else if (role === 'admin') {
      document.getElementById('adminPortal').classList.add('active');
      AdminView.init();
    }
  }

  // Close modals on overlay click or close button
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('close-modal-btn')) {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    }
  });

  // Global Review Star hover & click
  const starContainer = document.getElementById('reviewStarsContainer');
  if (starContainer) {
    starContainer.addEventListener('click', (e) => {
      const star = e.target.closest('.star');
      if (star) {
        const rating = parseInt(star.dataset.val, 10);
        document.getElementById('reviewRatingVal').value = rating;
        CustomerView.updateStarRatingDisplay(rating);
      }
    });
  }

  // Load Customer View by default
  await CustomerView.init();

  // Initial check of unread notifications
  Notifications.refreshDrawer();
});
