let currentPage = 1;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!API.isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  loadSidebar();
  loadLogs();
  setupEventListeners();
});

function loadSidebar() {
  document.getElementById('userAvatar').textContent = API.getUser().full_name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = API.getUser().full_name;
  document.getElementById('userRole').textContent = API.getUser().role;
}

async function loadLogs() {
  const search = document.getElementById('searchInput').value;
  let url = `/api/activity-logs?page=${currentPage}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const result = await API.get(url);
    renderTable(result.logs);
    renderPagination(result.total);
  } catch (err) {
    document.getElementById('tableBody').innerHTML =
      `<tr><td colspan="4"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

function renderTable(logs) {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const actionBadge = (a) => {
    const map = {
      login: 'badge-available',
      logout: 'badge-pending',
      create: 'badge-available',
      update: 'badge-pending',
      delete: 'badge-danger',
    };
    return `<span class="badge ${map[a] || 'badge-pending'}">${a}</span>`;
  };

  const formatDateTime = (d) => d ? new Date(d).toLocaleDateString('id-ID', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) : '-';

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td><strong>${l.username}</strong></td>
      <td>${actionBadge(l.action)}</td>
      <td>${l.description || '-'}</td>
      <td>${formatDateTime(l.created_at)}</td>
    </tr>
  `).join('');
}

function renderPagination(total) {
  const container = document.getElementById('pagination');
  const totalPages = Math.ceil(total / 30);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  loadLogs();
}

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; loadLogs(); }, 400);
  });
}

function logout() {
  API.logout().then(() => window.location.href = 'login.html');
}
