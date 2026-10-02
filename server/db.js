const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'barber.sqlite');
const db = new Database(dbPath);

// Enable foreign keys & WAL mode for performance and reliability
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'barber', 'admin')),
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      notes TEXT,
      is_blocked INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      bio TEXT,
      photo_url TEXT,
      phone TEXT,
      email TEXT,
      specialization TEXT,
      commission_pct REAL DEFAULT 40.0,
      is_active INTEGER DEFAULT 1,
      rating REAL DEFAULT 5.0,
      review_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      duration INTEGER NOT NULL, -- minutes
      category TEXT NOT NULL,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS barber_services (
      barber_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      PRIMARY KEY (barber_id, service_id),
      FOREIGN KEY(barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
      FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS working_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barber_id INTEGER, -- NULL means default shop hours
      day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ... 6=Saturday
      start_time TEXT NOT NULL, -- "09:00"
      end_time TEXT NOT NULL,   -- "19:00"
      is_working INTEGER DEFAULT 1,
      FOREIGN KEY(barber_id) REFERENCES barbers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS breaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barber_id INTEGER, -- NULL for all barbers
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      label TEXT DEFAULT 'Lunch Break',
      FOREIGN KEY(barber_id) REFERENCES barbers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holiday_date TEXT NOT NULL UNIQUE, -- "YYYY-MM-DD"
      description TEXT NOT NULL,
      is_closed INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      barber_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      appointment_date TEXT NOT NULL, -- "YYYY-MM-DD"
      start_time TEXT NOT NULL,      -- "HH:MM"
      end_time TEXT NOT NULL,        -- "HH:MM"
      duration INTEGER NOT NULL,     -- minutes
      buffer_minutes INTEGER DEFAULT 5,
      total_price REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      final_price REAL NOT NULL,
      status TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('paid', 'pending', 'partial', 'refunded')),
      payment_method TEXT DEFAULT 'shop' CHECK(payment_method IN ('shop', 'online_card', 'online_upi', 'advance_token')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(barber_id) REFERENCES barbers(id),
      FOREIGN KEY(service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT DEFAULT 'paid' CHECK(status IN ('paid', 'pending', 'refunded')),
      transaction_id TEXT UNIQUE,
      refund_status TEXT DEFAULT 'none',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER UNIQUE,
      customer_id INTEGER NOT NULL,
      barber_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      is_approved INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(appointment_id) REFERENCES appointments(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(barber_id) REFERENCES barbers(id),
      FOREIGN KEY(service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('percent', 'fixed')),
      discount_value REAL NOT NULL,
      min_spend REAL DEFAULT 0,
      expiry_date TEXT,
      usage_limit INTEGER DEFAULT 100,
      times_used INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_role TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT,
      channel TEXT NOT NULL CHECK(channel IN ('sms', 'whatsapp', 'email', 'system')),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      appointment_id INTEGER,
      is_read INTEGER DEFAULT 0,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shop_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_appointments_date_barber ON appointments(appointment_date, barber_id, status);
    CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_working_hours_barber ON working_hours(barber_id, day_of_week);
  `);

  try {
    db.exec('ALTER TABLE customers ADD COLUMN total_spent REAL DEFAULT 0;');
  } catch (e) {
    // column already exists
  }
}

function seedDatabase() {
  const barberCount = db.prepare('SELECT COUNT(*) as count FROM barbers').get().count;
  if (barberCount > 0) return; // already seeded

  console.log('Seeding initial data into SQLite database...');

  const insertSetting = db.prepare('INSERT OR REPLACE INTO shop_settings (key, value) VALUES (?, ?)');
  insertSetting.run('shop_name', 'GlamourX Luxury Salon & Barbershop');
  insertSetting.run('shop_phone', '+91 98765 43210');
  insertSetting.run('shop_email', 'concierge@glamourx.com');
  insertSetting.run('shop_address', 'Suite 104, Royal Crest Galleria, MG Road, Bangalore');
  insertSetting.run('slot_interval', '30'); // minutes: 15, 30, 45, 60
  insertSetting.run('buffer_time', '5');    // minutes between appointments
  insertSetting.run('opening_time', '09:00');
  insertSetting.run('closing_time', '20:00');
  insertSetting.run('currency_symbol', '₹');
  insertSetting.run('allow_advance_payment', 'true');
  insertSetting.run('advance_percentage', '20');

  // Insert Services
  const insertService = db.prepare(`
    INSERT INTO services (name, description, price, duration, category, image_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const servicesData = [
    {
      name: 'Signature Executive Haircut',
      desc: 'Precision scissor & clipper cut, consultation, invigorating scalp massage, and hot towel finish.',
      price: 450,
      duration: 30,
      category: 'Haircut',
      img: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&auto=format&fit=crop&q=80'
    },
    {
      name: 'Haircut + Signature Beard Sculpting',
      desc: 'Our supreme combo: precision haircut, hot lather beard contouring, nourishing beard balm, and steam treatment.',
      price: 750,
      duration: 45,
      category: 'Combos',
      img: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=500&auto=format&fit=crop&q=80'
    },
    {
      name: 'Royal Hot Towel Straight Razor Shave',
      desc: 'Traditional straight razor shave with pre-shave aromatic oils, steaming towels, badger brush lather, and cold stone soothe.',
      price: 400,
      duration: 25,
      category: 'Shave',
      img: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=500&auto=format&fit=crop&q=80'
    },
    {
      name: 'Beard Trim & Precision Line-Up',
      desc: 'Length shaping, cheek and neckline definition with detailer trimmers, and organic argan oil application.',
      price: 300,
      duration: 20,
      category: 'Beard',
      img: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=500&auto=format&fit=crop&q=80'
    },
    {
      name: 'Executive Hair Styling & Blowout',
      desc: 'Deep clarifying wash, styling with matte clay/pomade, and texture blow-dry for events or meetings.',
      price: 500,
      duration: 30,
      category: 'Styling',
      img: 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=500&auto=format&fit=crop&q=80'
    },
    {
      name: 'Young Gentleman’s Cut (Under 14)',
      desc: 'Gentle, patience-focused modern styling for younger clients with gentle hair wax and lollipop.',
      price: 350,
      duration: 30,
      category: 'Haircut',
      img: 'https://images.unsplash.com/photo-1517832606589-7629c339590a?w=500&auto=format&fit=crop&q=80'
    },
    {
      name: 'Imperial 360° Grooming Ritual',
      desc: 'The complete transformation: Master haircut, beard styling, charcoal face detox, ear/nose waxing, and head-neck-shoulder massage.',
      price: 1200,
      duration: 60,
      category: 'Combos',
      img: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=500&auto=format&fit=crop&q=80'
    },
    {
      name: 'Charcoal Detox Facial & Scalp Therapy',
      desc: 'Activated charcoal mask, deep pore extraction, exfoliation, cold steam rinse, and restorative tea tree scalp tonic.',
      price: 900,
      duration: 45,
      category: 'Treatments',
      img: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=500&auto=format&fit=crop&q=80'
    }
  ];

  for (const s of servicesData) {
    insertService.run(s.name, s.desc, s.price, s.duration, s.category, s.img);
  }

  // Insert Barbers
  const insertUser = db.prepare(`
    INSERT INTO users (email, phone, name, role, avatar_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertBarber = db.prepare(`
    INSERT INTO barbers (user_id, name, title, bio, photo_url, phone, email, specialization, commission_pct, is_active, rating, review_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const barbersData = [
    {
      name: 'Alex "The Blade" Vance',
      title: 'Master Craftsman & Head Barber',
      bio: 'Over 12 years of London and Mumbai barbering experience. Specialist in classic skin fades, scissor work, and traditional straight razor shaves.',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
      phone: '+91 98111 22334',
      email: 'alex@thenoblecut.com',
      spec: 'Skin Fades, Scissor Architecture & Hot Razor Shaves',
      commission: 45,
      rating: 4.95,
      reviews: 142
    },
    {
      name: 'Marco Rossi',
      title: 'Senior Styling & Beard Virtuoso',
      bio: 'Trained in Milan, Marco brings European precision and tailored beard architecture suited to your unique face structure.',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80',
      phone: '+91 98222 33445',
      email: 'marco@thenoblecut.com',
      spec: 'Beard Sculpting, Italian Classic Cuts & Texture Blowouts',
      commission: 40,
      rating: 4.88,
      reviews: 98
    },
    {
      name: 'David Chen',
      title: 'Contemporary Texture & Fade Stylist',
      bio: 'Known for razor-sharp tapers, modern textured crops, modern pompadours, and gentle touch for younger gentlemen.',
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=80',
      phone: '+91 98333 44556',
      email: 'david@thenoblecut.com',
      spec: 'Modern Street Fades, Textured Crops & Kids Haircuts',
      commission: 40,
      rating: 4.92,
      reviews: 116
    },
    {
      name: 'Tariq Al-Mansoor',
      title: 'Luxury Grooming & Spa Specialist',
      bio: 'Master of therapeutic scalp care, facial detox therapies, and regal hot towel rituals designed for the distinguished executive.',
      photo: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&auto=format&fit=crop&q=80',
      phone: '+91 98444 55667',
      email: 'tariq@thenoblecut.com',
      spec: 'Imperial Grooming Rituals, Scalp Massage & Hot Towel Shave',
      commission: 42,
      rating: 4.90,
      reviews: 84
    }
  ];

  const barberIds = [];
  for (const b of barbersData) {
    const userRes = insertUser.run(b.email, b.phone, b.name, 'barber', b.photo);
    const barberRes = insertBarber.run(userRes.lastInsertRowid, b.name, b.title, b.bio, b.photo, b.phone, b.email, b.spec, b.commission, b.rating, b.reviews);
    barberIds.push(barberRes.lastInsertRowid);
  }

  // Link barbers with all services
  const insertBarberService = db.prepare('INSERT INTO barber_services (barber_id, service_id) VALUES (?, ?)');
  for (const bId of barberIds) {
    for (let sId = 1; sId <= 8; sId++) {
      insertBarberService.run(bId, sId);
    }
  }

  // Default Working Hours (Mon to Sat: 09:00 - 20:00, Sun: 10:00 - 18:00)
  const insertWorkingHours = db.prepare(`
    INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, is_working)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertBreak = db.prepare(`
    INSERT INTO breaks (barber_id, day_of_week, start_time, end_time, label)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const bId of barberIds) {
    for (let day = 0; day <= 6; day++) {
      if (day === 0) { // Sunday
        insertWorkingHours.run(bId, day, '10:00', '18:00', 1);
        insertBreak.run(bId, day, '13:30', '14:30', 'Afternoon Break');
      } else if (day === 2 && bId === 2) { // Marco off on Tuesday
        insertWorkingHours.run(bId, day, '09:00', '20:00', 0);
      } else if (day === 3 && bId === 3) { // David off on Wednesday
        insertWorkingHours.run(bId, day, '09:00', '20:00', 0);
      } else {
        insertWorkingHours.run(bId, day, '09:00', '20:00', 1);
        insertBreak.run(bId, day, '13:00', '14:00', 'Lunch Break');
        // Add evening tea break for Alex & Tariq
        if (bId === 1 || bId === 4) {
          insertBreak.run(bId, day, '17:00', '17:30', 'Tea Break');
        }
      }
    }
  }

  // Admin User
  insertUser.run('owner@thenoblecut.com', '+91 99999 88888', 'Arthur Pendelton (Proprietor)', 'admin', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500&auto=format&fit=crop&q=80');

  // Insert 20 Customers
  const customersData = [
    { name: 'Vikram Malhotra', phone: '+91 98201 11223', email: 'vikram.m@gmail.com', notes: 'Prefers matte clay, sensitive skin on neck' },
    { name: 'Rohan Sharma', phone: '+91 98202 22334', email: 'rohan.s@outlook.com', notes: 'Always orders tea during haircut' },
    { name: 'Kabir Singhania', phone: '+91 98203 33445', email: 'kabir.singh@gmail.com', notes: 'VIP client, CEO at TechVentures' },
    { name: 'Aditya Verma', phone: '+91 98204 44556', email: 'aditya.v@yahoo.com', notes: 'Likes low taper fade' },
    { name: 'Siddharth Rao', phone: '+91 98205 55667', email: 'sid.rao@gmail.com', notes: 'Regular weekly beard trim' },
    { name: 'Arjun Kapoor', phone: '+91 98206 66778', email: 'arjun.k@gmail.com', notes: 'Brings son for junior haircut' },
    { name: 'Farhan Akhtar', phone: '+91 98207 77889', email: 'farhan.creative@gmail.com', notes: 'Classic pompadour' },
    { name: 'Devendra Patel', phone: '+91 98208 88990', email: 'dev.patel@rediffmail.com', notes: 'Prefers hot towel straight razor' },
    { name: 'Nikhil Mehta', phone: '+91 98209 99001', email: 'nikhil.m@gmail.com', notes: 'Saturday morning regular' },
    { name: 'Sameer Joshi', phone: '+91 98210 00112', email: 'sam.joshi@corp.com', notes: 'Corporate client' },
    { name: 'Karan Mehra', phone: '+91 98211 11223', email: 'karan.m@gmail.com', notes: '' },
    { name: 'Aman Deep Singh', phone: '+91 98212 22334', email: 'aman.singh@gmail.com', notes: 'Full beard grooming' },
    { name: 'Gaurav Sen', phone: '+91 98213 33445', email: 'gaurav.sen@tech.in', notes: '' },
    { name: 'Rahul Bose', phone: '+91 98214 44556', email: 'rahul.bose@gmail.com', notes: 'Prefers Alex Vance' },
    { name: 'Kunal Deshmukh', phone: '+91 98215 55667', email: 'kunal.d@gmail.com', notes: 'Prefers Marco Rossi' },
    { name: 'Varun Dhawan', phone: '+91 98216 66778', email: 'varun.d@gmail.com', notes: '' },
    { name: 'Manish Pandey', phone: '+91 98217 77889', email: 'manish.p@sports.in', notes: '' },
    { name: 'Tarun Tahiliani', phone: '+91 98218 88990', email: 'tarun.t@fashion.com', notes: 'Imperial ritual regular' },
    { name: 'Zeeshan Ali', phone: '+91 98219 99001', email: 'zeeshan.ali@gmail.com', notes: '' },
    { name: 'Pranav Bajaj', phone: '+91 98220 00112', email: 'pranav.b@gmail.com', notes: 'Skin sensitive to alcohol aftershaves' }
  ];

  const insertCust = db.prepare(`
    INSERT INTO customers (user_id, name, phone, email, notes, is_blocked, avatar_url)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `);

  const customerIds = [];
  for (let i = 0; i < customersData.length; i++) {
    const c = customersData[i];
    const avatar = `https://images.unsplash.com/photo-${1500000000000 + i * 154321}?w=150&auto=format&fit=crop&q=80`;
    const uRes = insertUser.run(c.email, c.phone, c.name, 'customer', avatar);
    const cRes = insertCust.run(uRes.lastInsertRowid, c.name, c.phone, c.email, c.notes, avatar);
    customerIds.push(cRes.lastInsertRowid);
  }

  // Insert Coupons
  const insertCoupon = db.prepare(`
    INSERT INTO coupons (code, discount_type, discount_value, min_spend, expiry_date, usage_limit, times_used, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertCoupon.run('FIRST15', 'percent', 15, 300, '2026-12-31', 200, 18);
  insertCoupon.run('ROYAL100', 'fixed', 100, 700, '2026-11-30', 50, 12);
  insertCoupon.run('GENTLEMAN20', 'percent', 20, 500, '2026-12-31', 100, 25);
  insertCoupon.run('FESTIVE50', 'fixed', 50, 400, '2026-10-31', 150, 4);

  // Insert Holidays
  const insertHoliday = db.prepare(`
    INSERT INTO holidays (holiday_date, description, is_closed)
    VALUES (?, ?, 1)
  `);
  insertHoliday.run('2026-10-24', 'Diwali Festival of Lights');
  insertHoliday.run('2026-11-01', 'State Foundation Day');
  insertHoliday.run('2026-12-25', 'Christmas Day');

  // Insert Realistic Appointments across Past, Today, and Upcoming
  const insertAppt = db.prepare(`
    INSERT INTO appointments (
      booking_code, customer_id, barber_id, service_id,
      appointment_date, start_time, end_time, duration, buffer_minutes,
      total_price, discount_amount, final_price, status, payment_status,
      payment_method, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPayment = db.prepare(`
    INSERT INTO payments (appointment_id, amount, payment_method, status, transaction_id, refund_status)
    VALUES (?, ?, ?, ?, ?, 'none')
  `);

  const insertReview = db.prepare(`
    INSERT INTO reviews (appointment_id, customer_id, barber_id, service_id, rating, comment, is_approved)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  // Dates: Today is approx 2026-10-02
  const today = '2026-10-02';
  const yesterday = '2026-10-01';
  const tomorrow = '2026-10-03';
  const dayAfter = '2026-10-04';

  const sampleAppointments = [
    // Today's appointments
    {
      code: 'NC-2601', cust: 1, barber: 1, srv: 2, date: today, start: '09:30', end: '10:15', dur: 45,
      tot: 750, disc: 0, final: 750, status: 'completed', payStatus: 'paid', payMeth: 'online_upi', notes: 'Wants sharp neckline'
    },
    {
      code: 'NC-2602', cust: 2, barber: 1, srv: 1, date: today, start: '10:30', end: '11:00', dur: 30,
      tot: 450, disc: 50, final: 400, status: 'in_progress', payStatus: 'paid', payMeth: 'shop', notes: 'Short on sides'
    },
    {
      code: 'NC-2603', cust: 3, barber: 2, srv: 4, date: today, start: '11:00', end: '11:20', dur: 20,
      tot: 300, disc: 0, final: 300, status: 'confirmed', payStatus: 'partial', payMeth: 'advance_token', notes: 'Italian beard shape'
    },
    {
      code: 'NC-2604', cust: 4, barber: 2, srv: 7, date: today, start: '14:30', end: '15:30', dur: 60,
      tot: 1200, disc: 100, final: 1100, status: 'confirmed', payStatus: 'pending', payMeth: 'shop', notes: 'First time trying Imperial Ritual'
    },
    {
      code: 'NC-2605', cust: 5, barber: 3, srv: 1, date: today, start: '11:30', end: '12:00', dur: 30,
      tot: 450, disc: 0, final: 450, status: 'confirmed', payStatus: 'paid', payMeth: 'online_card', notes: ''
    },
    {
      code: 'NC-2606', cust: 6, barber: 3, srv: 6, date: today, start: '16:00', end: '16:30', dur: 30,
      tot: 350, disc: 0, final: 350, status: 'confirmed', payStatus: 'pending', payMeth: 'shop', notes: 'Junior cut for 8-yr-old son'
    },
    {
      code: 'NC-2607', cust: 7, barber: 4, srv: 8, date: today, start: '15:00', end: '15:45', dur: 45,
      tot: 900, disc: 135, final: 765, status: 'confirmed', payStatus: 'paid', payMeth: 'online_upi', notes: 'Charcoal detox & tea tree oil'
    },
    {
      code: 'NC-2608', cust: 8, barber: 1, srv: 3, date: today, start: '17:45', end: '18:10', dur: 25,
      tot: 400, disc: 0, final: 400, status: 'confirmed', payStatus: 'pending', payMeth: 'shop', notes: 'Straight razor shave'
    },
    // Past completed & cancelled appointments with reviews
    {
      code: 'NC-2501', cust: 9, barber: 1, srv: 1, date: yesterday, start: '10:00', end: '10:30', dur: 30,
      tot: 450, disc: 0, final: 450, status: 'completed', payStatus: 'paid', payMeth: 'online_upi', notes: 'Flawless fade'
    },
    {
      code: 'NC-2502', cust: 10, barber: 2, srv: 2, date: yesterday, start: '11:00', end: '11:45', dur: 45,
      tot: 750, disc: 75, final: 675, status: 'completed', payStatus: 'paid', payMeth: 'online_card', notes: 'Beard balm purchase'
    },
    {
      code: 'NC-2503', cust: 11, barber: 3, srv: 4, date: yesterday, start: '14:00', end: '14:20', dur: 20,
      tot: 300, disc: 0, final: 300, status: 'cancelled', payStatus: 'refunded', payMeth: 'online_upi', notes: 'Customer had flight delay'
    },
    {
      code: 'NC-2504', cust: 12, barber: 4, srv: 7, date: yesterday, start: '16:00', end: '17:00', dur: 60,
      tot: 1200, disc: 120, final: 1080, status: 'completed', payStatus: 'paid', payMeth: 'shop', notes: 'Imperial service'
    },
    {
      code: 'NC-2505', cust: 13, barber: 1, srv: 3, date: yesterday, start: '18:30', end: '18:55', dur: 25,
      tot: 400, disc: 0, final: 400, status: 'no_show', payStatus: 'pending', payMeth: 'shop', notes: 'Did not arrive'
    },
    // Tomorrow & future appointments
    {
      code: 'NC-2701', cust: 14, barber: 1, srv: 2, date: tomorrow, start: '10:00', end: '10:45', dur: 45,
      tot: 750, disc: 0, final: 750, status: 'confirmed', payStatus: 'paid', payMeth: 'online_upi', notes: ''
    },
    {
      code: 'NC-2702', cust: 15, barber: 2, srv: 1, date: tomorrow, start: '11:00', end: '11:30', dur: 30,
      tot: 450, disc: 0, final: 450, status: 'confirmed', payStatus: 'partial', payMeth: 'advance_token', notes: ''
    },
    {
      code: 'NC-2703', cust: 16, barber: 3, srv: 5, date: tomorrow, start: '15:00', end: '15:30', dur: 30,
      tot: 500, disc: 0, final: 500, status: 'confirmed', payStatus: 'pending', payMeth: 'shop', notes: ''
    },
    {
      code: 'NC-2704', cust: 17, barber: 4, srv: 8, date: dayAfter, start: '11:30', end: '12:15', dur: 45,
      tot: 900, disc: 100, final: 800, status: 'confirmed', payStatus: 'paid', payMeth: 'online_card', notes: ''
    }
  ];

  for (let i = 0; i < sampleAppointments.length; i++) {
    const a = sampleAppointments[i];
    const apptRes = insertAppt.run(
      a.code, a.cust, a.barber, a.srv, a.date, a.start, a.end, a.dur,
      a.tot, a.disc, a.final, a.status, a.payStatus, a.payMeth, a.notes
    );
    const apptId = apptRes.lastInsertRowid;

    if (a.payStatus === 'paid' || a.payStatus === 'partial') {
      const payAmount = a.payStatus === 'partial' ? 150 : a.final;
      insertPayment.run(apptId, payAmount, a.payMeth, 'paid', `TXN_${Date.now()}_${i + 100}`);
    }

    // Insert reviews for completed appointments
    if (a.status === 'completed') {
      const comments = [
        'Best haircut experience in the city! Alex is a master of scissor precision and the hot towel finish is pure luxury.',
        'Marco shaped my beard to absolute perfection. Compliments everywhere at work today. Highly recommended!',
        'The Imperial ritual was worth every single rupee. Unbelievable relaxation, head massage and fresh sharp look.',
        'Top notch ambiance, jazz music, complimentary espresso and zero wait time. My new regular barber.'
      ];
      insertReview.run(apptId, a.cust, a.barber, a.srv, 5, comments[i % comments.length]);
    }
  }

  // Insert sample notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (recipient_role, recipient_name, recipient_phone, channel, type, title, message, appointment_id, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertNotif.run('customer', 'Vikram Malhotra', '+91 98201 11223', 'whatsapp', 'booking_confirmed', 'Appointment Confirmed! 💈', 'Hi Vikram, your appointment for Haircut + Beard with Alex Vance is confirmed for Oct 2 at 09:30 AM.', 1, 1);
  insertNotif.run('customer', 'Vikram Malhotra', '+91 98201 11223', 'sms', 'reminder_2h', 'Gentle Reminder: Barber Appointment in 2 Hours', 'Reminder: You have an appointment at The Noble Cut at 09:30 AM today. See you soon!', 1, 1);
  insertNotif.run('admin', 'Admin Team', '+91 99999 88888', 'system', 'new_booking', 'New Online Booking #NC-2601', 'Vikram Malhotra booked Haircut + Beard (₹750) with Alex Vance.', 1, 1);
  insertNotif.run('barber', 'Alex Vance', '+91 98111 22334', 'whatsapp', 'barber_assigned', 'New Client Assigned', 'Alex, you have a client Vikram Malhotra booked for 09:30 AM today.', 1, 1);

  console.log('Database initialized and seeded successfully with rich realistic data!');
}

initSchema();
seedDatabase();

module.exports = db;
