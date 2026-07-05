document.addEventListener('DOMContentLoaded', () => {
  if (!API.isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  loadSidebar();
  loadStats();
});

function loadSidebar() {
  document.getElementById('userAvatar').textContent = API.getUser().full_name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = API.getUser().full_name;
  document.getElementById('userRole').textContent = API.getUser().role;
}

async function loadStats() {
  try {
    const stats = await API.get('/api/dashboard/stats');
    renderStatCards(stats);
    renderStatusChart(stats.statusDistribution);
    renderRevenueChart(stats.monthlyRevenue);
    renderSalesChart(stats.salesTrend);
    renderRecentTransactions(stats.recentTransactions);
  } catch (err) {
    document.getElementById('statsContainer').innerHTML = `<div class="alert alert-error">Failed to load dashboard data: ${err.message}</div>`;
  }
}

function renderStatCards(stats) {
  const formatPriceShort = (num) => {
    if (num >= 1000000000) return 'Rp ' + (num / 1000000000).toFixed(1).replace('.', ',') + ' M';
    if (num >= 1000000) return 'Rp ' + (num / 1000000).toFixed(1).replace('.', ',') + ' Jt';
    if (num >= 1000) return 'Rp ' + (num / 1000).toFixed(1).replace('.', ',') + ' Rb';
    return 'Rp ' + num;
  };

  document.getElementById('statProperties').textContent = stats.totalProperties;
  document.getElementById('statSold').textContent = stats.sold;
  document.getElementById('statPending').textContent = stats.pending;
  document.getElementById('statRevenue').textContent = formatPriceShort(stats.totalRevenue);
  document.getElementById('statCustomers').textContent = stats.totalCustomers;
  document.getElementById('statTransactions').textContent = stats.totalTransactions;
}

let statusChart = null;
function renderStatusChart(distribution) {
  const ctx = document.getElementById('statusChart').getContext('2d');
  const labels = distribution.map(d => d.status.charAt(0).toUpperCase() + d.status.slice(1));
  const data = distribution.map(d => d.count);
  const colors = {
    available: '#4caf50',
    sold: '#e53935',
    pending: '#ff9800',
  };

  if (statusChart) statusChart.destroy();

  statusChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Properties',
        data,
        backgroundColor: labels.map(l => colors[l.toLowerCase()] || '#2196f3'),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
        }
      }
    }
  });
}

let revenueChart = null;
function renderRevenueChart(monthlyData) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  const labels = monthlyData.reverse().map(d => {
    const [y, m] = d.month.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m)-1]} ${y}`;
  });
  const data = monthlyData.map(d => d.total);

  if (revenueChart) revenueChart.destroy();

  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data,
        borderColor: '#1a237e',
        backgroundColor: 'rgba(26, 35, 126, 0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#1a237e',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => 'Rp' + (v / 1000000).toFixed(0) + 'M',
          }
        }
      }
    }
  });
}

let salesChart = null;
function renderSalesChart(salesTrend) {
  const ctx = document.getElementById('salesChart').getContext('2d');
  const labels = salesTrend.map(d => d.day ? d.day.slice(5) : '-');
  const data = salesTrend.map(d => d.count);

  if (salesChart) salesChart.destroy();

  salesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Transactions',
        data,
        backgroundColor: '#f5a623',
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

function renderRecentTransactions(transactions) {
  const tbody = document.querySelector('#recentTransactions tbody');
  const emptyRow = document.getElementById('emptyTransactions');

  if (!transactions || transactions.length === 0) {
    emptyRow.style.display = 'table-row';
    return;
  }

  emptyRow.style.display = 'none';
  const formatPrice = (num) => 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatDate = (d) => new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });

  tbody.innerHTML = transactions.map(t => `
    <tr>
      <td>${t.property_title}</td>
      <td>${t.customer_name}</td>
      <td><span class="badge badge-${t.type === 'sale' ? 'available' : 'pending'}">${t.type.replace('_', ' ')}</span></td>
      <td class="amount amount-positive">${formatPrice(t.amount)}</td>
      <td>${t.payment_method}</td>
      <td>${formatDate(t.transaction_date)}</td>
    </tr>
  `).join('');
}
