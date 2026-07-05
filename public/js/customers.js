let currentPage = 1;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!API.isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  loadSidebar();
  loadCustomers();
  setupEventListeners();
});

function loadSidebar() {
  document.getElementById('userAvatar').textContent = API.getUser().full_name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = API.getUser().full_name;
  document.getElementById('userRole').textContent = API.getUser().role;
}

async function loadCustomers() {
  const search = document.getElementById('searchInput').value;
  let url = `/api/customers?page=${currentPage}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const result = await API.get(url);
    renderTable(result.customers);
    renderPagination(result.total);
  } catch (err) {
    document.getElementById('tableBody').innerHTML =
      `<tr><td colspan="6"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

function renderTable(customers) {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');

  if (!customers || customers.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${c.phone || '-'}</td>
      <td>${c.email || '-'}</td>
      <td>${escapeHtml(c.address || '-')}</td>
      <td>${formatDate(c.created_at)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-primary btn-sm" onclick="editCustomer(${c.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCustomer(${c.id})">Delete</button>
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
  loadCustomers();
}

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadCustomers();
    }, 400);
  });

  document.getElementById('addCustomerBtn').addEventListener('click', () => openAddModal());

  document.getElementById('modalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCustomer();
  });

  document.querySelectorAll('.modal-close, .modal-cancel').forEach(el => {
    el.addEventListener('click', closeModal);
  });

  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add New Customer';
  document.getElementById('modalForm').reset();
  document.getElementById('customerId').value = '';
  clearFieldErrors();
  document.getElementById('modalOverlay').classList.add('active');
}

async function editCustomer(id) {
  try {
    const customer = await API.get(`/api/customers/${id}`);
    document.getElementById('modalTitle').textContent = 'Edit Customer';
    document.getElementById('customerId').value = customer.id;
    document.getElementById('name').value = customer.name;
    document.getElementById('phone').value = customer.phone || '';
    document.getElementById('email').value = customer.email || '';
    document.getElementById('address').value = customer.address || '';
    clearFieldErrors();
    document.getElementById('modalOverlay').classList.add('active');
  } catch (err) {
    alert('Error loading customer: ' + err.message);
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error, .field-error-phone, .field-error-email').forEach(el => {
    el.style.display = 'none';
  });
}

function validateForm() {
  clearFieldErrors();
  let valid = true;

  const name = document.getElementById('name').value.trim();
  if (!name) {
    document.querySelector('.field-error').style.display = 'block';
    valid = false;
  }

  const phone = document.getElementById('phone').value.trim();
  if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
    document.querySelector('.field-error-phone').style.display = 'block';
    valid = false;
  }

  const email = document.getElementById('email').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.querySelector('.field-error-email').style.display = 'block';
    valid = false;
  }

  return valid;
}

async function saveCustomer() {
  if (!validateForm()) return;

  const id = document.getElementById('customerId').value;
  const data = {
    name: document.getElementById('name').value.trim(),
    phone: document.getElementById('phone').value.trim() || null,
    email: document.getElementById('email').value.trim() || null,
    address: document.getElementById('address').value.trim() || null,
  };

  const submitBtn = document.querySelector('#modalForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    if (id) {
      await API.put(`/api/customers/${id}`, data);
    } else {
      await API.post('/api/customers', data);
    }
    closeModal();
    loadCustomers();
  } catch (err) {
    alert('Error saving customer: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save';
  }
}

function deleteCustomer(id) {
  if (!confirm('Are you sure you want to delete this customer?')) return;

  API.del(`/api/customers/${id}`)
    .then(() => loadCustomers())
    .catch(err => alert('Error deleting customer: ' + err.message));
}

function logout() {
  API.logout().then(() => window.location.href = 'login.html');
}
