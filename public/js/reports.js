document.addEventListener('DOMContentLoaded', () => {
  if (!API.isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  loadSidebar();
  loadReports();
  setupEventListeners();
});

function loadSidebar() {
  document.getElementById('userAvatar').textContent = API.getUser().full_name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = API.getUser().full_name;
  document.getElementById('userRole').textContent = API.getUser().role;
}

async function loadReports() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  let url = '/api/reports';
  const params = [];
  if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
  if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
  if (params.length) url += '?' + params.join('&');

  try {
    const data = await API.get(url);
    renderStats(data);
    renderTable(data.transactions);
    window._reportData = data;
  } catch (err) {
    document.getElementById('tableBody').innerHTML =
      `<tr><td colspan="7"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

function renderStats(data) {
  const formatPrice = (num) => 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  document.getElementById('statRevenue').textContent = formatPrice(data.totalRevenue);
  document.getElementById('statTransactions').textContent = data.totalTransactions;
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
    </tr>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupEventListeners() {
  document.getElementById('filterBtn').addEventListener('click', loadReports);
  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    loadReports();
  });
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
}

function exportCsv() {
  const data = window._reportData;
  if (!data || !data.transactions || data.transactions.length === 0) {
    alert('No data to export');
    return;
  }

  const formatPrice = (num) => num.toString();
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID') : '-';

  const rows = [['Property', 'Customer', 'Type', 'Amount', 'Payment', 'Status', 'Date']];

  data.transactions.forEach(t => {
    rows.push([
      t.property_title,
      t.customer_name,
      t.type,
      t.amount,
      t.payment_method,
      t.status,
      formatDate(t.transaction_date),
    ]);
  });

  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estateos_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function logout() {
  API.logout().then(() => window.location.href = 'login.html');
}
