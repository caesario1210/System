let currentPage = 1;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!API.isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  loadSidebar();
  loadTransactions();
  setupEventListeners();
});

function loadSidebar() {
  document.getElementById('userAvatar').textContent = API.getUser().full_name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = API.getUser().full_name;
  document.getElementById('userRole').textContent = API.getUser().role;
}

async function loadTransactions() {
  const search = document.getElementById('searchInput').value;
  let url = `/api/transactions?page=${currentPage}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const result = await API.get(url);
    renderTable(result.transactions);
    renderPagination(result.total);
  } catch (err) {
    document.getElementById('tableBody').innerHTML =
      `<tr><td colspan="8"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

function renderTable(transactions) {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');

  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const formatPrice = (num) => 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

  const statusBadge = (s) => {
    if (s === 'completed') return '<span class="badge badge-available">Completed</span>';
    if (s === 'dp') return '<span class="badge badge-pending">DP</span>';
    return '<span class="badge badge-pending">Pending</span>';
  };

  tbody.innerHTML = transactions.map(t => `
    <tr>
      <td><strong>${escapeHtml(t.property_title)}</strong></td>
      <td>${escapeHtml(t.customer_name)}</td>
      <td><span class="badge badge-${t.type === 'sale' ? 'available' : 'pending'}">${t.type.replace('_', ' ')}</span></td>
      <td class="amount amount-positive">${formatPrice(t.amount)}</td>
      <td>${t.payment_method}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${formatDate(t.transaction_date)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-primary btn-sm" onclick="editTransaction(${t.id})">Edit</button>
          <button class="btn btn-gold btn-sm" onclick="showPayments(${t.id})">Payments</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTransaction(${t.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderPagination(total) {
  const container = document.getElementById('pagination');
  const totalPages = Math.ceil(total / 20);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  loadTransactions();
}

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadTransactions();
    }, 400);
  });

  document.getElementById('addTransactionBtn').addEventListener('click', () => openAddModal());

  document.getElementById('modalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTransaction();
  });

  document.querySelectorAll('.modal-close, .modal-cancel').forEach(el => {
    el.addEventListener('click', closeModal);
  });

  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

async function openAddModal() {
  document.getElementById('modalTitle').textContent = 'New Transaction';
  document.getElementById('transactionId').value = '';
  document.getElementById('modalForm').reset();
  document.getElementById('amount').value = '';

  await Promise.all([
    loadAvailableProperties(),
    loadAllCustomers()
  ]);

  document.getElementById('modalOverlay').classList.add('active');
}

async function editTransaction(id) {
  try {
    const [transaction, customers] = await Promise.all([
      API.get(`/api/transactions/${id}`),
      API.get('/api/customers/all')
    ]);

    document.getElementById('modalTitle').textContent = 'Edit Transaction';
    document.getElementById('transactionId').value = transaction.id;
    document.getElementById('amount').value = transaction.amount;
    document.getElementById('type').value = transaction.type;
    document.getElementById('paymentMethod').value = transaction.payment_method;
    document.getElementById('notes').value = transaction.notes || '';

    const customerSelect = document.getElementById('customerId');
    customerSelect.innerHTML = '<option value="">-- Select Customer --</option>' +
      customers.map(c => `<option value="${c.id}" ${c.id === transaction.customer_id ? 'selected' : ''}>${escapeHtml(c.name)} ${c.phone ? '- ' + c.phone : ''}</option>`).join('');

    const propertySelect = document.getElementById('propertyId');
    const allProperties = await API.get('/api/properties?limit=100');
    propertySelect.innerHTML = '<option value="">-- Select Property --</option>' +
      allProperties.properties.map(p => `<option value="${p.id}" ${p.id === transaction.property_id ? 'selected' : ''}>${escapeHtml(p.title)} ${p.status !== 'available' ? '(status: ' + p.status + ')' : ''}</option>`).join('');

    document.getElementById('modalOverlay').classList.add('active');
  } catch (err) {
    alert('Error loading transaction: ' + err.message);
  }
}

async function loadAvailableProperties() {
  const propertySelect = document.getElementById('propertyId');
  try {
    const result = await API.get('/api/properties/available');
    propertySelect.innerHTML = '<option value="">-- Select Property --</option>' +
      result.map(p => `<option value="${p.id}">${escapeHtml(p.title)} - Rp ${p.price.toLocaleString('id-ID')}</option>`).join('');
  } catch (err) {
    propertySelect.innerHTML = '<option value="">Failed to load properties</option>';
  }
}

async function loadAllCustomers() {
  const customerSelect = document.getElementById('customerId');
  try {
    const customers = await API.get('/api/customers/all');
    customerSelect.innerHTML = '<option value="">-- Select Customer --</option>' +
      customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)} ${c.phone ? '- ' + c.phone : ''}</option>`).join('');
  } catch (err) {
    customerSelect.innerHTML = '<option value="">Failed to load customers</option>';
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

async function saveTransaction() {
  const id = document.getElementById('transactionId').value;

  if (!document.getElementById('propertyId').value) {
    alert('Please select a property');
    return;
  }
  if (!document.getElementById('customerId').value) {
    alert('Please select a customer');
    return;
  }
  if (!document.getElementById('amount').value || Number(document.getElementById('amount').value) <= 0) {
    alert('Please enter a valid amount');
    return;
  }

  const data = {
    property_id: Number(document.getElementById('propertyId').value),
    customer_id: Number(document.getElementById('customerId').value),
    type: document.getElementById('type').value,
    amount: Number(document.getElementById('amount').value),
    payment_method: document.getElementById('paymentMethod').value,
    notes: document.getElementById('notes').value.trim() || null,
  };

  const submitBtn = document.querySelector('#modalForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    if (id) {
      await API.put(`/api/transactions/${id}`, data);
    } else {
      await API.post('/api/transactions', data);
    }
    closeModal();
    loadTransactions();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Transaction';
  }
}

function deleteTransaction(id) {
  if (!confirm('Are you sure you want to delete this transaction?')) return;

  API.del(`/api/transactions/${id}`)
    .then(() => loadTransactions())
    .catch(err => alert('Error deleting transaction: ' + err.message));
}

let _payTransactionAmount = 0;
let _payTotalPaid = 0;

function updatePayAmount() {
  const type = document.getElementById('payType').value;
  const remaining = _payTransactionAmount - _payTotalPaid;
  if (type === 'pelunasan') {
    document.getElementById('payAmount').value = remaining;
  } else {
    const suggestedDp = Math.round(Math.min(_payTransactionAmount * 0.2, remaining));
    document.getElementById('payAmount').value = suggestedDp;
  }
}

async function showPayments(transactionId) {
  try {
    const data = await API.get(`/api/transactions/${transactionId}/payments`);
    const transaction = await API.get(`/api/transactions/${transactionId}`);

    _payTransactionAmount = transaction.amount;
    _payTotalPaid = data.totalPaid;

    document.getElementById('payTransactionId').value = transactionId;
    document.getElementById('payTxRef').textContent = `Transaction #${transactionId} - ${transaction.property_title}`;

    const statusMap = { completed: 'Completed', dp: 'DP', pending: 'Pending' };
    document.getElementById('payTxStatus').textContent = statusMap[data.transactionStatus] || data.transactionStatus;

    const formatPrice = (num) => 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    document.getElementById('payTotalPaid').textContent = formatPrice(data.totalPaid);

    const tbody = document.querySelector('#payHistoryTable tbody');
    const tableContainer = document.getElementById('payTableContainer');
    const empty = document.getElementById('payEmpty');

    if (!data.payments || data.payments.length === 0) {
      tableContainer.style.display = 'none';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      tableContainer.style.display = 'block';
      const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

      tbody.innerHTML = data.payments.map(p => `
        <tr>
          <td><span class="badge ${p.type === 'pelunasan' ? 'badge-available' : 'badge-pending'}">${p.type}</span></td>
          <td class="amount amount-positive">${formatPrice(p.amount)}</td>
          <td>${formatDate(p.payment_date)}</td>
          <td>${p.notes || '-'}</td>
        </tr>
      `).join('');
    }

    updatePayAmount();
    document.getElementById('paymentModalOverlay').classList.add('active');
  } catch (err) {
    alert('Error loading payments: ' + err.message);
  }
}

function setupPaymentListeners() {
  document.querySelectorAll('#paymentModalOverlay .modal-close').forEach(el => {
    el.addEventListener('click', closePaymentModal);
  });

  document.getElementById('paymentModalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePaymentModal();
  });

  document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await recordPayment();
  });

  document.getElementById('payType').addEventListener('change', updatePayAmount);
}

function closePaymentModal() {
  document.getElementById('paymentModalOverlay').classList.remove('active');
}

async function recordPayment() {
  const transactionId = Number(document.getElementById('payTransactionId').value);
  const type = document.getElementById('payType').value;
  const amount = Number(document.getElementById('payAmount').value);
  const notes = document.getElementById('payNotes').value.trim() || null;

  if (!amount || amount <= 0) {
    alert('Please enter a valid amount');
    return;
  }

  const submitBtn = document.querySelector('#paymentForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Recording...';

  try {
    await API.post('/api/payments', { transaction_id: transactionId, type, amount, notes });
    document.getElementById('paymentForm').reset();
    showPayments(transactionId);
    loadTransactions();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Record Payment';
  }
}

setupPaymentListeners();

function logout() {
  API.logout().then(() => window.location.href = 'login.html');
}
