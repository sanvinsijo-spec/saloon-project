const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

// Ensure database is initialized
require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/services', require('./routes/services'));
app.use('/api/barbers', require('./routes/barbers'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/notifications', require('./routes/notifications'));

// SPA fallback catch-all
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`💈 GlamourX Salon & Barber Management Server running at http://localhost:${PORT}`);
});
