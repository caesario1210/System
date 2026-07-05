const express = require('express');
const Layer = require('express/lib/router/layer');
Layer.prototype.handle_request = function (req, res, next) {
  var fn = this.handle;
  if (fn.length > 3) return next();
  try {
    var result = fn(req, res, next);
    if (result && result.catch) result.catch(next);
  } catch (err) { next(err); }
};
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const database = require('./database');
const { generateToken, authenticateToken } = require('./auth');
const { run, get, all, insert } = database;

async function logActivity(user, action, description) {
  try {
    await insert('INSERT INTO activity_log (user_id, username, action, description) VALUES (?, ?, ?, ?)',
      [user.id, user.username, action, description]);
  } catch (e) {
    console.error('Failed to log activity:', e.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = await get('SELECT * FROM users WHERE username = ?', [username]);
  console.error('LOGIN user object:', JSON.stringify(user));
  if (!user || !user.id || !bcrypt.compareSync(password, user.password)) {
    console.error('LOGIN failed - user:', !!user, 'id:', user && user.id);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (user.active !== 1) {
    return res.status(403).json({ error: 'Account is deactivated. Contact administrator.' });
  }

  const token = generateToken(user);
  await logActivity(user, 'login', `${user.full_name} logged in`);
  res.json({
    token,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role }
  });
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await logActivity(req.user, 'logout', `${req.user.full_name} logged out`);
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const user = await get('SELECT id, username, full_name, role, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user || !user.id) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  const totalProperties = await get('SELECT COUNT(*) as count FROM properties');
  const available = await get("SELECT COUNT(*) as count FROM properties WHERE status = 'available'");
  const sold = await get("SELECT COUNT(*) as count FROM properties WHERE status = 'sold'");
  const pending = await get("SELECT COUNT(*) as count FROM properties WHERE status = 'pending'");
  const totalRevenue = await get("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE status = 'completed'");
  const totalCustomers = await get('SELECT COUNT(*) as count FROM customers');
  const totalTransactions = await get('SELECT COUNT(*) as count FROM transactions');

  const recentTransactions = await all(`
    SELECT t.id, t.amount, t.type, t.payment_method, t.transaction_date,
           p.title as property_title, c.name as customer_name
    FROM transactions t
    JOIN properties p ON t.property_id = p.id
    JOIN customers c ON t.customer_id = c.id
    ORDER BY t.created_at DESC LIMIT 5
  `);

  const statusDistribution = await all('SELECT status, COUNT(*) as count FROM properties GROUP BY status');
  const monthlyRevenue = await all(`
    SELECT strftime('%Y-%m', transaction_date) as month, SUM(amount) as total
    FROM transactions WHERE status = 'completed'
    GROUP BY month ORDER BY month DESC LIMIT 6
  `);

  const salesTrend = await all(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM transactions
    WHERE created_at >= date('now', '-6 days')
    GROUP BY day ORDER BY day ASC
  `);

  res.json({
    totalProperties: totalProperties.count,
    available: available.count,
    sold: sold.count,
    pending: pending.count,
    totalRevenue: totalRevenue.total,
    totalCustomers: totalCustomers.count,
    totalTransactions: totalTransactions.count,
    recentTransactions,
    statusDistribution,
    monthlyRevenue,
    salesTrend
  });
});

app.get('/api/properties', authenticateToken, async (req, res) => {
  const { search, status, type, page = 1, limit = 20 } = req.query;
  let conditions = [];
  let params = [];

  if (search) {
    conditions.push('(title LIKE ? OR address LIKE ? OR city LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const properties = await all(`SELECT * FROM properties ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
  const countResult = await get(`SELECT COUNT(*) as count FROM properties ${where}`, params);

  res.json({ properties, total: countResult.count, page: Number(page) });
});

app.get('/api/properties/available', authenticateToken, async (req, res) => {
  const properties = await all("SELECT id, title, price FROM properties WHERE status = 'available' ORDER BY title ASC");
  res.json(properties);
});

app.get('/api/properties/:id', authenticateToken, async (req, res) => {
  const property = await get('SELECT * FROM properties WHERE id = ?', [req.params.id]);
  if (!property || !property.id) return res.status(404).json({ error: 'Property not found' });
  res.json(property);
});

app.post('/api/properties', authenticateToken, async (req, res) => {
  const { title, description, type, price, address, city, status, bedrooms, bathrooms, area, image_url } = req.body;
  if (!title || !type || !price) {
    return res.status(400).json({ error: 'Title, type, and price are required' });
  }

  const id = await insert(`
    INSERT INTO properties (title, description, type, price, address, city, status, bedrooms, bathrooms, area, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [title, description, type, price, address, city, status || 'available', bedrooms || 0, bathrooms || 0, area || 0, image_url || null]);

  const property = await get('SELECT * FROM properties WHERE id = ?', [id]);
  await logActivity(req.user, 'create', `Created property: ${title}`);
  res.status(201).json(property);
});

app.put('/api/properties/:id', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM properties WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'Property not found' });

  const { title, description, type, price, address, city, status, bedrooms, bathrooms, area, image_url } = req.body;
  await run(`
    UPDATE properties SET title=?, description=?, type=?, price=?, address=?, city=?, status=?, bedrooms=?, bathrooms=?, area=?, image_url=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `, [
    title || existing.title, description !== undefined ? description : existing.description,
    type || existing.type, price || existing.price,
    address !== undefined ? address : existing.address, city !== undefined ? city : existing.city,
    status || existing.status, bedrooms !== undefined ? bedrooms : existing.bedrooms,
    bathrooms !== undefined ? bathrooms : existing.bathrooms, area !== undefined ? area : existing.area,
    image_url !== undefined ? image_url : existing.image_url,
    req.params.id
  ]);

  const property = await get('SELECT * FROM properties WHERE id = ?', [req.params.id]);
  await logActivity(req.user, 'update', `Updated property: ${property.title}`);
  res.json(property);
});

app.delete('/api/properties/:id', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM properties WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'Property not found' });

  await run('DELETE FROM properties WHERE id = ?', [req.params.id]);
  await logActivity(req.user, 'delete', `Deleted property: ${existing.title}`);
  res.json({ message: 'Property deleted successfully' });
});

app.get('/api/customers', authenticateToken, async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  let conditions = [];
  let params = [];

  if (search) {
    conditions.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const customers = await all(`SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
  const countResult = await get(`SELECT COUNT(*) as count FROM customers ${where}`, params);

  res.json({ customers, total: countResult.count, page: Number(page) });
});

app.get('/api/customers/all', authenticateToken, async (req, res) => {
  const customers = await all('SELECT id, name, phone, email FROM customers ORDER BY name ASC');
  res.json(customers);
});

app.get('/api/customers/:id', authenticateToken, async (req, res) => {
  const customer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!customer || !customer.id) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

app.post('/api/customers', authenticateToken, async (req, res) => {
  const { name, phone, email, address } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  const id = await insert('INSERT INTO customers (name, phone, email, address) VALUES (?, ?, ?, ?)',
    [name.trim(), phone || null, email || null, address || null]);

  const customer = await get('SELECT * FROM customers WHERE id = ?', [id]);
  await logActivity(req.user, 'create', `Created customer: ${name.trim()}`);
  res.status(201).json(customer);
});

app.put('/api/customers/:id', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'Customer not found' });

  const { name, phone, email, address } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  await run('UPDATE customers SET name=?, phone=?, email=?, address=? WHERE id=?',
    [name.trim(), phone || existing.phone, email || existing.email, address !== undefined ? address : existing.address, req.params.id]);

  const customer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  await logActivity(req.user, 'update', `Updated customer: ${customer.name}`);
  res.json(customer);
});

app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'Customer not found' });

  await run('DELETE FROM customers WHERE id = ?', [req.params.id]);
  await logActivity(req.user, 'delete', `Deleted customer: ${existing.name}`);
  res.json({ message: 'Customer deleted successfully' });
});

app.get('/api/transactions', authenticateToken, async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  let conditions = [];
  let params = [];

  if (search) {
    conditions.push('(p.title LIKE ? OR c.name LIKE ? OR t.type LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const transactions = await all(`
    SELECT t.*, p.title as property_title, c.name as customer_name
    FROM transactions t
    JOIN properties p ON t.property_id = p.id
    JOIN customers c ON t.customer_id = c.id
    ${where}
    ORDER BY t.created_at DESC LIMIT ? OFFSET ?
  `, [...params, Number(limit), Number(offset)]);

  const countResult = await get(`
    SELECT COUNT(*) as count
    FROM transactions t
    JOIN properties p ON t.property_id = p.id
    JOIN customers c ON t.customer_id = c.id
    ${where}
  `, params);

  res.json({ transactions, total: countResult.count, page: Number(page) });
});

app.get('/api/transactions/:id', authenticateToken, async (req, res) => {
  const transaction = await get(`
    SELECT t.*, p.title as property_title, c.name as customer_name
    FROM transactions t
    JOIN properties p ON t.property_id = p.id
    JOIN customers c ON t.customer_id = c.id
    WHERE t.id = ?
  `, [req.params.id]);
  if (!transaction || !transaction.id) return res.status(404).json({ error: 'Transaction not found' });
  res.json(transaction);
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  const { property_id, customer_id, type, amount, payment_method, notes } = req.body;
  if (!property_id || !customer_id || !type || !amount) {
    return res.status(400).json({ error: 'property_id, customer_id, type, and amount are required' });
  }

  const property = await get('SELECT * FROM properties WHERE id = ?', [property_id]);
  if (!property || !property.id) {
    return res.status(404).json({ error: 'Property not found' });
  }
  if (property.status !== 'available') {
    return res.status(400).json({ error: `Cannot create transaction. Property status is "${property.status}", only "available" properties can be sold.` });
  }

  const id = await insert(`
    INSERT INTO transactions (property_id, customer_id, type, amount, payment_method, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `, [property_id, customer_id, type, amount, payment_method || 'cash', notes || null]);

  await run("UPDATE properties SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [property_id]);

  const transaction = await get(`
    SELECT t.*, p.title as property_title, c.name as customer_name
    FROM transactions t
    JOIN properties p ON t.property_id = p.id
    JOIN customers c ON t.customer_id = c.id
    WHERE t.id = ?
  `, [id]);

  await logActivity(req.user, 'create', `Created transaction for property: ${transaction.property_title}`);
  res.status(201).json(transaction);
});

app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'Transaction not found' });

  const { property_id, customer_id, type, amount, payment_method, notes } = req.body;

  if (property_id && property_id !== existing.property_id) {
    const newProperty = await get('SELECT * FROM properties WHERE id = ?', [property_id]);
    if (!newProperty || !newProperty.id) {
      return res.status(404).json({ error: 'New property not found' });
    }
    if (newProperty.status !== 'available') {
      return res.status(400).json({ error: 'New property must be available' });
    }
    await run("UPDATE properties SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [existing.property_id]);
    await run("UPDATE properties SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [property_id]);
  }

  await run(`
    UPDATE transactions SET property_id=?, customer_id=?, type=?, amount=?, payment_method=?, notes=?
    WHERE id=?
  `, [
    property_id || existing.property_id,
    customer_id || existing.customer_id,
    type || existing.type,
    amount || existing.amount,
    payment_method || existing.payment_method,
    notes !== undefined ? notes : existing.notes,
    req.params.id
  ]);

  const transaction = await get(`
    SELECT t.*, p.title as property_title, c.name as customer_name
    FROM transactions t
    JOIN properties p ON t.property_id = p.id
    JOIN customers c ON t.customer_id = c.id
    WHERE t.id = ?
  `, [req.params.id]);

  await logActivity(req.user, 'update', `Updated transaction #${transaction.id}: ${transaction.property_title}`);
  res.json(transaction);
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'Transaction not found' });

  await run("UPDATE properties SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [existing.property_id]);
  await run('DELETE FROM transactions WHERE id = ?', [req.params.id]);

  await logActivity(req.user, 'delete', `Deleted transaction #${existing.id}`);
  res.json({ message: 'Transaction deleted and property status restored to available' });
});

app.get('/api/users', authenticateToken, async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  let conditions = [];
  let params = [];

  if (search) {
    conditions.push('(username LIKE ? OR full_name LIKE ? OR role LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const users = await all(`SELECT id, username, full_name, role, active, created_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
  const countResult = await get(`SELECT COUNT(*) as count FROM users ${where}`, params);

  res.json({ users, total: countResult.count, page: Number(page) });
});

app.post('/api/users', authenticateToken, async (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Username, password, and full name are required' });
  }

  const existing = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const id = await insert('INSERT INTO users (username, password, full_name, role, active) VALUES (?, ?, ?, ?, 1)',
    [username, bcrypt.hashSync(password, 10), full_name, role || 'staff']);

  const user = await get('SELECT id, username, full_name, role, active, created_at FROM users WHERE id = ?', [id]);
  await logActivity(req.user, 'create', `Created user: ${username}`);
  res.status(201).json(user);
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'User not found' });

  const { username, full_name, role, active } = req.body;

  if (username && username !== existing.username) {
    const dup = await get('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.params.id]);
    if (dup) return res.status(400).json({ error: 'Username already taken' });
  }

  await run('UPDATE users SET username=?, full_name=?, role=?, active=? WHERE id=?',
    [username || existing.username, full_name || existing.full_name, role || existing.role, active !== undefined ? active : existing.active, req.params.id]);

  const user = await get('SELECT id, username, full_name, role, active, created_at FROM users WHERE id = ?', [req.params.id]);
  await logActivity(req.user, 'update', `Updated user: ${user.username}`);
  res.json(user);
});

app.put('/api/users/:id/reset-password', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'User not found' });

  const { new_password } = req.body;
  if (!new_password || new_password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  await run('UPDATE users SET password=? WHERE id=?', [bcrypt.hashSync(new_password, 10), req.params.id]);
  await logActivity(req.user, 'update', `Reset password for user: ${existing.username}`);
  res.json({ message: 'Password reset successfully' });
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing || !existing.id) return res.status(404).json({ error: 'User not found' });
  if (existing.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });

  await run('DELETE FROM users WHERE id = ?', [req.params.id]);
  await logActivity(req.user, 'delete', `Deleted user: ${existing.username}`);
  res.json({ message: 'User deleted successfully' });
});

app.get('/api/reports', authenticateToken, async (req, res) => {
  const { start_date, end_date } = req.query;
  let conditions = [];
  let params = [];

  if (start_date) {
    conditions.push('t.created_at >= ?');
    params.push(start_date);
  }
  if (end_date) {
    conditions.push('t.created_at <= ?');
    params.push(end_date + ' 23:59:59');
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const transactions = await all(`
    SELECT t.*, p.title as property_title, c.name as customer_name
    FROM transactions t
    JOIN properties p ON t.property_id = p.id
    JOIN customers c ON t.customer_id = c.id
    ${where}
    ORDER BY t.created_at DESC
  `, params);

  const totalRevenue = await get(`SELECT COALESCE(SUM(t.amount), 0) as total FROM transactions t ${where}`, params);
  const totalTransactions = await get(`SELECT COUNT(*) as count FROM transactions t ${where}`, params);

  res.json({
    transactions,
    totalRevenue: totalRevenue.total,
    totalTransactions: totalTransactions.count
  });
});

app.get('/api/transactions/:id/payments', authenticateToken, async (req, res) => {
  const transaction = await get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
  if (!transaction || !transaction.id) return res.status(404).json({ error: 'Transaction not found' });

  const payments = await all('SELECT * FROM payments WHERE transaction_id = ? ORDER BY created_at ASC', [req.params.id]);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  res.json({ payments, totalPaid, transactionStatus: transaction.status });
});

app.post('/api/payments', authenticateToken, async (req, res) => {
  const { transaction_id, type, amount, notes } = req.body;
  if (!transaction_id || !type || !amount) {
    return res.status(400).json({ error: 'transaction_id, type, and amount are required' });
  }
  if (!['dp', 'pelunasan'].includes(type)) {
    return res.status(400).json({ error: 'Payment type must be "dp" or "pelunasan"' });
  }

  const transaction = await get('SELECT * FROM transactions WHERE id = ?', [transaction_id]);
  if (!transaction || !transaction.id) return res.status(404).json({ error: 'Transaction not found' });

  if (transaction.status === 'completed') {
    return res.status(400).json({ error: 'Transaction is already completed' });
  }

  if (type === 'pelunasan') {
    const existingPayments = await all('SELECT * FROM payments WHERE transaction_id = ?', [transaction_id]);
    const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
    if (totalPaid + Number(amount) < transaction.amount) {
      return res.status(400).json({ error: `Pelunasan amount must cover the remaining balance. Remaining: Rp ${(transaction.amount - totalPaid).toLocaleString('id-ID')}` });
    }
  }

  const id = await insert('INSERT INTO payments (transaction_id, type, amount, notes) VALUES (?, ?, ?, ?)',
    [transaction_id, type, amount, notes || null]);

  if (type === 'pelunasan') {
    await run("UPDATE transactions SET status = 'completed' WHERE id = ?", [transaction_id]);
    await run("UPDATE properties SET status = 'sold', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [transaction.property_id]);
  } else {
    await run("UPDATE transactions SET status = 'dp' WHERE id = ?", [transaction_id]);
  }

  const payment = await get('SELECT * FROM payments WHERE id = ?', [id]);
  await logActivity(req.user, 'create', `Payment ${type} for transaction #${transaction_id}: Rp ${Number(amount).toLocaleString('id-ID')}`);
  res.status(201).json(payment);
});

app.get('/api/activity-logs', authenticateToken, async (req, res) => {
  const { search, page = 1, limit = 30 } = req.query;
  let conditions = [];
  let params = [];

  if (search) {
    conditions.push('(al.username LIKE ? OR al.action LIKE ? OR al.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const logs = await all(`
    SELECT al.* FROM activity_log al ${where}
    ORDER BY al.created_at DESC LIMIT ? OFFSET ?
  `, [...params, Number(limit), Number(offset)]);

  const countResult = await get('SELECT COUNT(*) as count FROM activity_log ' + where, params);
  res.json({ logs, total: countResult.count, page: Number(page) });
});

app.use(express.static(path.join(__dirname, 'public')));

let initialized = false;
async function start() {
  if (initialized) return;
  initialized = true;
  await database.initialize();
}

async function handler(req, res) {
  try {
    await start();
    return app(req, res);
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
}

module.exports = handler;

if (require.main === module) {
  start().then(() => {
    app.listen(PORT, () => {
      console.log(`EstateOS Real Estate Management running on http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
