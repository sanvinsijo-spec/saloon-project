const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard/stats
router.get('/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.substring(0, 7) + '-01';

    // 1. KPI Counts
    const todayStats = db.prepare(`
      SELECT
        COUNT(*) as today_total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as today_completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as today_in_progress,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as today_upcoming,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as today_cancelled,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as today_no_show,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN final_price ELSE 0 END), 0) as today_revenue
      FROM appointments
      WHERE appointment_date = ?
    `).get(today);

    const monthStats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN final_price ELSE 0 END), 0) as monthly_revenue,
        COUNT(*) as monthly_appointments
      FROM appointments
      WHERE appointment_date >= ?
    `).get(monthStart);

    const allTimeStats = db.prepare(`
      SELECT
        COUNT(*) as total_appointments,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as total_completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as total_cancelled,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as total_no_shows,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN final_price ELSE 0 END), 0) as total_revenue
      FROM appointments
    `).get();

    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;

    // 2. Most Popular Services
    const popularServices = db.prepare(`
      SELECT
        s.id,
        s.name,
        s.category,
        s.price,
        COUNT(a.id) as booking_count,
        COALESCE(SUM(a.final_price), 0) as total_generated
      FROM services s
      LEFT JOIN appointments a ON s.id = a.service_id
      GROUP BY s.id
      ORDER BY booking_count DESC
      LIMIT 5
    `).all();

    // 3. Barber Performance
    const barberPerformance = db.prepare(`
      SELECT
        b.id,
        b.name,
        b.title,
        b.photo_url,
        b.rating,
        b.commission_pct,
        COUNT(a.id) as total_served,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.final_price ELSE 0 END), 0) as gross_revenue,
        ROUND(COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.final_price ELSE 0 END), 0) * (b.commission_pct / 100.0), 2) as barber_commission
      FROM barbers b
      LEFT JOIN appointments a ON b.id = a.barber_id
      WHERE b.is_active = 1
      GROUP BY b.id
      ORDER BY gross_revenue DESC
    `).all();

    // 4. Past 7 Days Revenue Trend & Status Breakdown
    const past7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

      const dayRow = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'completed' THEN final_price ELSE 0 END), 0) as revenue,
          COUNT(*) as bookings,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM appointments
        WHERE appointment_date = ?
      `).get(dateStr);

      past7Days.push({
        date: dateStr,
        label: dayName,
        revenue: dayRow ? dayRow.revenue : 0,
        bookings: dayRow ? dayRow.bookings : 0,
        completed: dayRow ? dayRow.completed : 0,
        cancelled: dayRow ? dayRow.cancelled : 0
      });
    }

    // 5. Today's Appointments with Details
    const todayList = db.prepare(`
      SELECT
        a.*,
        c.name as customer_name,
        c.phone as customer_phone,
        b.name as barber_name,
        b.photo_url as barber_photo,
        s.name as service_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      JOIN barbers b ON a.barber_id = b.id
      JOIN services s ON a.service_id = s.id
      WHERE a.appointment_date = ?
      ORDER BY a.start_time ASC
    `).all(today);

    res.json({
      success: true,
      data: {
        kpis: {
          todayAppointments: todayStats.today_total || 0,
          todayUpcoming: todayStats.today_upcoming || 0,
          todayInProgress: todayStats.today_in_progress || 0,
          todayCompleted: todayStats.today_completed || 0,
          todayCancelled: todayStats.today_cancelled || 0,
          todayNoShow: todayStats.today_no_show || 0,
          todayRevenue: todayStats.today_revenue || 0,
          monthlyRevenue: monthStats.monthly_revenue || 0,
          totalCustomers,
          totalAppointments: allTimeStats.total_appointments || 0,
          totalRevenue: allTimeStats.total_revenue || 0,
          totalCompleted: allTimeStats.total_completed || 0,
          totalCancelled: allTimeStats.total_cancelled || 0,
          totalNoShows: allTimeStats.total_no_shows || 0
        },
        popularServices,
        barberPerformance,
        weeklyChart: past7Days,
        todayAppointments: todayList
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
