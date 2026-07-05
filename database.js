const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const TURSO_DB_URL = process.env.TURSO_DB_URL;
const TURSO_DB_AUTH_TOKEN = process.env.TURSO_DB_AUTH_TOKEN;
const isTurso = !!TURSO_DB_URL;

let clientModule = null;
try { clientModule = require('@libsql/client'); } catch (e) { }

let client;

function getLocalClient() {
  if (!client) {
    if (!clientModule) throw new Error('@libsql/client not installed. Run: npm install @libsql/client');
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    client = clientModule.createClient({ url: `file:${path.join(dir, 'database.sqlite')}` });
  }
  return client;
}

const https = require('https');

let httpUrl = null;
if (isTurso) {
  httpUrl = TURSO_DB_URL.replace(/^libsql:/, 'https:');
  if (!httpUrl.startsWith('http')) httpUrl = 'https://' + httpUrl;
}

function mapArg(v) {
  if (v === null || v === undefined) return { type: 'null', value: null };
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'real', value: v };
  return { type: 'text', value: String(v) };
}

function extractResult(obj) {
  if (obj && obj.columns && obj.rows) return obj;
  if (!obj || typeof obj !== 'object') return null;
  const vals = Object.values(obj);
  for (let i = 0; i < vals.length; i++) {
    const found = extractResult(vals[i]);
    if (found) return found;
  }
  return null;
}

function tursoFetch(body, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(httpUrl);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: (url.pathname.replace(/\/+$/, '') || '') + path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_DB_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let msg = data;
          try { msg = JSON.parse(data).error || data; } catch (e) { /* use raw */ }
          reject(new Error(`Turso API error (${res.statusCode}): ${String(msg).slice(0, 200)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error));
          const result = extractResult(parsed);
          if (result) {
            if (result.last_insert_rowid === undefined) result.last_insert_rowid = null;
            resolve(result);
            return;
          }
          if (parsed.results && parsed.results[0] && (parsed.results[0].error || parsed.results[0].type === 'error')) {
            const first = parsed.results[0];
            const msg = typeof first.error === 'string' ? first.error :
              (first.error ? first.error.message || JSON.stringify(first.error) : JSON.stringify(first));
            return reject(new Error(msg));
          }
          resolve({ columns: [], rows: [], last_insert_rowid: null });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function tursoRequest(sql, params = []) {
  const body = JSON.stringify({
    requests: [{
      type: 'execute',
      stmt: { sql, args: params.map(mapArg) }
    }]
  });
  return tursoFetch(body, '/v2/pipeline');
}

function tursoRequestStatements(sql, params = []) {
  const stmt = params.length ? { q: sql, params } : { q: sql };
  const body = JSON.stringify({ statements: [stmt] });
  return tursoFetch(body, '/');
}

function rowsToObjs(columns, rows) {
  if (!columns || !rows) return [];
  return rows.map(r => {
    const o = {};
    columns.forEach((c, i) => o[c] = r[i]);
    return o;
  });
}

let initialized = false;

async function exec(sql) {
  try {
    if (isTurso) { await tursoGet(sql); return; }
    await getLocalClient().execute({ sql });
  } catch (e) { /* ignore multi-stmt errors */ }
}

async function run(sql, params = []) {
  if (isTurso) { await tursoGet(sql, params); return; }
  await getLocalClient().execute({ sql, args: params });
}

async function tursoGet(sql, params = []) {
  let r;
  let pipelineErr;
  try {
    r = await tursoRequest(sql, params);
    if (r && r.columns && r.rows) return r;
    pipelineErr = 'Pipeline response missing columns/rows';
  } catch (e) { pipelineErr = 'Pipeline: ' + e.message; }

  try {
    r = await tursoRequestStatements(sql, params);
    if (r && r.columns && r.rows) return r;
    pipelineErr += '; Statements also missing columns/rows';
  } catch (e2) { throw new Error(pipelineErr + '; Statements: ' + e2.message); }

  return { columns: [], rows: [], last_insert_rowid: null };
}

async function get(sql, params = []) {
  if (isTurso) {
    const r = await tursoGet(sql, params);
    if (!r.rows || !r.rows.length) return null;
    return rowsToObjs(r.columns, r.rows)[0];
  }
  const r = await getLocalClient().execute({ sql, args: params });
  return r.rows[0] || null;
}

async function all(sql, params = []) {
  if (isTurso) {
    const r = await tursoGet(sql, params);
    if (!r.rows || !r.rows.length) return [];
    return rowsToObjs(r.columns, r.rows);
  }
  const r = await getLocalClient().execute({ sql, args: params });
  return r.rows;
}

async function insert(sql, params = []) {
  if (isTurso) {
    const r = await tursoGet(sql, params);
    return Number(r.last_insert_rowid || 0);
  }
  const r = await getLocalClient().execute({ sql, args: params });
  return Number(r.lastInsertRowid);
}

async function initialize() {
  if (initialized) return;
  initialized = true;

  if (!isTurso) {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  await exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS properties (
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
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS transactions (
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
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const row = await get('SELECT COUNT(*) as count FROM users');
  if (!row) return;
  const count = Number(row.count);
  if (count === 0) {
    await seedData();
  }
}

async function seedData() {
  await run('INSERT INTO users (username, password, full_name, role, active) VALUES (?, ?, ?, ?, ?)',
    ['admin', bcrypt.hashSync('admin123', 10), 'Administrator', 'admin', 1]);
  await run('INSERT INTO users (username, password, full_name, role, active) VALUES (?, ?, ?, ?, ?)',
    ['staff', bcrypt.hashSync('staff123', 10), 'Staff Member', 'staff', 1]);

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
  for (const p of properties) {
    await run('INSERT INTO properties (title, description, type, price, address, city, status, bedrooms, bathrooms, area) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', p);
  }

  const customers = [
    ['Budi Santoso', '081234567890', 'budi@email.com', 'Jl. Anggrek No. 10, Jakarta'],
    ['Siti Rahmawati', '082345678901', 'siti@email.com', 'Jl. Mawar No. 25, Bandung'],
    ['Ahmad Hidayat', '083456789012', 'ahmad@email.com', 'Perumahan Permata Blok B2, Depok'],
    ['Dewi Lestari', '084567890123', 'dewi@email.com', 'Jl. Kenanga No. 5, Bogor'],
    ['Rudi Hermawan', '085678901234', 'rudi@email.com', 'Apartemen Gateway Tower B, Jakarta']
  ];
  for (const c of customers) {
    await run('INSERT INTO customers (name, phone, email, address) VALUES (?, ?, ?, ?)', c);
  }

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
  for (const t of transactions) {
    await run('INSERT INTO transactions (property_id, customer_id, type, amount, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)', t);
  }

  const logRow = await get('SELECT COUNT(*) as count FROM activity_log');
  if (Number(logRow.count) === 0) {
    const logs = [
      [1, 'admin', 'login', 'Administrator logged in', '2026-07-01 08:00:00'],
      [1, 'admin', 'create', 'Created property: Modern Minimalist Villa', '2026-07-01 08:30:00'],
      [2, 'staff', 'login', 'Staff Member logged in', '2026-07-02 09:00:00'],
      [1, 'admin', 'create', 'Created customer: Budi Santoso', '2026-07-02 10:00:00'],
      [1, 'admin', 'update', 'Updated property: Ruko 3 Lantai Pusat Bisnis', '2026-07-03 11:00:00'],
    ];
    for (const l of logs) {
      await run('INSERT INTO activity_log (user_id, username, action, description, created_at) VALUES (?, ?, ?, ?, ?)', l);
    }
  }

  console.log('Database seeded with sample data');
}

module.exports = { initialize, run, get, all, insert };