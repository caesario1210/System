const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
let db = null;

async function initialize() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'staff',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      price REAL NOT NULL,
      address TEXT,
      city TEXT,
      status TEXT DEFAULT 'available',
      bedrooms INTEGER DEFAULT 0,
      bathrooms INTEGER DEFAULT 0,
      area REAL DEFAULT 0,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      status TEXT DEFAULT 'completed',
      notes TEXT,
      transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const row = db.exec('SELECT COUNT(*) as count FROM users');
  const count = row.length > 0 ? row[0].values[0][0] : 0;

  if (count === 0) {
    seedData();
  }

  saveDatabase();
  return db;
}

function seedData() {
  const insertUser = db.prepare('INSERT INTO users (username, password, full_name, role, active) VALUES (?, ?, ?, ?, ?)');
  insertUser.bind(['admin', bcrypt.hashSync('admin123', 10), 'Administrator', 'admin', 1]);
  insertUser.run();
  insertUser.free();

  const insertUser2 = db.prepare('INSERT INTO users (username, password, full_name, role, active) VALUES (?, ?, ?, ?, ?)');
  insertUser2.bind(['staff', bcrypt.hashSync('staff123', 10), 'Staff Member', 'staff', 1]);
  insertUser2.run();
  insertUser2.free();

  const properties = [
    ['Modern Minimalist Villa', 'Villa modern 2 lantai dengan kolam renang pribadi dan taman luas. Lokasi strategis di pusat kota.', 'house', 2500000000, 'Jl. Merdeka No. 45', 'Jakarta', 'available', 5, 4, 350],
    ['Apartment Mewah Sudirman', 'Apartment 3 BR dengan view kota. Full furnished, akses mudah ke CBD.', 'apartment', 1200000000, 'Jl. Sudirman Kav. 28', 'Jakarta', 'available', 3, 2, 120],
    ['Tanah Kavling Strategis', 'Tanah kavling 500m2 cocok untuk ruko atau perumahan. Dekat jalan tol.', 'land', 800000000, 'Kavling Bumi Indah Blok A5', 'Bandung', 'available', 0, 0, 500],
    ['Ruko 3 Lantai Pusat Bisnis', 'Ruko strategis di pusat bisnis. Cocok untuk kantor atau showroom.', 'office', 3500000000, 'Jl. Gatot Subroto No. 120', 'Jakarta', 'sold', 0, 3, 280],
    ['Rumah Cluster Taman Sari', 'Rumah cluster 2 lantai dengan security 24 jam. Lingkungan asri dan nyaman.', 'house', 950000000, 'Perumahan Taman Sari Blok C12', 'Depok', 'sold', 4, 3, 150],
    ['Apartemen Studio SCBD', 'Studio unit cocok untuk investasi. Harga terbaik di kawasan SCBD.', 'apartment', 650000000, 'SCBD Lot 14', 'Jakarta', 'available', 1, 1, 35],
    ['Villa Puncak Mountain View', 'Villa dengan pemandangan pegunungan. Udara sejuk, cocok untuk weekend getaway.', 'house', 1800000000, 'Jl. Raya Puncak KM 83', 'Bogor', 'pending', 4, 3, 200],
    ['Gedung Perkantoran 4 Lantai', 'Gedung perkantoran lengkap dengan basement parkir. Lokasi premium.', 'office', 15000000000, 'Jl. Thamrin No. 8', 'Jakarta', 'available', 0, 8, 1200]
  ];

  const insertProp = db.prepare('INSERT INTO properties (title, description, type, price, address, city, status, bedrooms, bathrooms, area) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const p of properties) {
    insertProp.bind(p);
    insertProp.run();
  }
  insertProp.free();

  const customers = [
    ['Budi Santoso', '081234567890', 'budi@email.com', 'Jl. Anggrek No. 10, Jakarta'],
    ['Siti Rahmawati', '082345678901', 'siti@email.com', 'Jl. Mawar No. 25, Bandung'],
    ['Ahmad Hidayat', '083456789012', 'ahmad@email.com', 'Perumahan Permata Blok B2, Depok'],
    ['Dewi Lestari', '084567890123', 'dewi@email.com', 'Jl. Kenanga No. 5, Bogor'],
    ['Rudi Hermawan', '085678901234', 'rudi@email.com', 'Apartemen Gateway Tower B, Jakarta']
  ];

  const insertCust = db.prepare('INSERT INTO customers (name, phone, email, address) VALUES (?, ?, ?, ?)');
  for (const c of customers) {
    insertCust.bind(c);
    insertCust.run();
  }
  insertCust.free();

  const transactions = [
    [4, 1, 'sale', 3500000000, 'transfer', 'Pembelian tunai - Lunas'],
    [5, 2, 'sale', 950000000, 'kpr', 'KPR Bank Mandiri - DP 20%'],
    [1, 3, 'down_payment', 500000000, 'transfer', 'DP 20% dari harga 2.5M'],
    [7, 4, 'sale', 1800000000, 'cash', 'Pembelian tunai bertahap'],
    [2, 5, 'installment', 50000000, 'transfer', 'Cicilan bulan ke-3 dari 24 bulan'],
    [3, 1, 'down_payment', 160000000, 'transfer', 'DP 20%'],
    [6, 2, 'sale', 650000000, 'cash', 'Lunas'],
    [4, 3, 'installment', 25000000, 'transfer', 'Biaya notaris dan administrasi'],
    [8, 4, 'down_payment', 3000000000, 'transfer', 'DP 20% dari harga 15M'],
    [5, 5, 'installment', 15000000, 'transfer', 'Cicilan bulan ke-12 dari 24 bulan']
  ];

  const insertTx = db.prepare('INSERT INTO transactions (property_id, customer_id, type, amount, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)');
  for (const t of transactions) {
    insertTx.bind(t);
    insertTx.run();
  }
  insertTx.free();

  const logCount = db.exec('SELECT COUNT(*) as count FROM activity_log');
  if (logCount[0].values[0][0] === 0) {
    const insertLog = db.prepare('INSERT INTO activity_log (user_id, username, action, description, created_at) VALUES (?, ?, ?, ?, ?)');
    insertLog.bind([1, 'admin', 'login', 'Administrator logged in', '2026-07-01 08:00:00']);
    insertLog.run();
    insertLog.bind([1, 'admin', 'create', 'Created property: Modern Minimalist Villa', '2026-07-01 08:30:00']);
    insertLog.run();
    insertLog.bind([2, 'staff', 'login', 'Staff Member logged in', '2026-07-02 09:00:00']);
    insertLog.run();
    insertLog.bind([1, 'admin', 'create', 'Created customer: Budi Santoso', '2026-07-02 10:00:00']);
    insertLog.run();
    insertLog.bind([1, 'admin', 'update', 'Updated property: Ruko 3 Lantai Pusat Bisnis', '2026-07-03 11:00:00']);
    insertLog.run();
    insertLog.free();
  }

  console.log('Database seeded with sample data');
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  return db;
}

function prepare(sql) {
  return db.prepare(sql);
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.run();
  stmt.free();
  saveDatabase();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const hasRow = stmt.step();
  const result = hasRow ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function insert(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.run();
  stmt.free();
  const idResult = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  return idResult[0].values[0][0];
}

module.exports = { initialize, getDb, prepare, run, get, all, insert };
