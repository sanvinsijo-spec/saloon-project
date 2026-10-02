# GlamourX — Salon & Barber Management System 💈✂️

A modern, full-featured web application and management system for luxury hair salons and barbershops. Built with Node.js, Express, SQLite, and vanilla HTML/CSS/JavaScript.

## Features

- **Client Appointment Booking**: Interactive slot selection, barber preference, dynamic service duration calculation, and token/online payments.
- **Barber & Staff Management**: Track barber profiles, commission rates, specialization, ratings, and active schedules.
- **Dynamic Slot Engine**: Real-time slot conflict prevention, operating hours, break detection, and buffer management.
- **Admin Dashboard & Analytics**: Revenue metrics, service popularity, barber performance, and booking statistics.
- **Notification Engine**: Simulated multi-channel alerts (SMS, WhatsApp, System) for booking confirmations and reminders.
- **Coupon & Loyalty System**: Promo code validation, percentage/flat discounts, and customer purchase histories.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (`better-sqlite3`) with WAL mode
- **Frontend**: Vanilla HTML5, Modern CSS3 (Glassmorphism & responsive layouts), JavaScript (ES6+)

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
Or run directly:
```bash
node server/index.js
```

### 3. Open in Browser
Visit [http://localhost:3000](http://localhost:3000) to view the application.

## API Overview

- `GET /api/services` - List available salon & barber services
- `GET /api/barbers` - Barber profiles, specializations, and ratings
- `GET /api/availability` - Real-time slot availability by barber & date
- `GET /api/appointments` - View scheduled appointments
- `POST /api/appointments` - Create a new booking
- `GET /api/dashboard/stats` - Management metrics & revenue analytics
- `GET /api/notifications` - Notification center logs
