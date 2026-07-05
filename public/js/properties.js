let currentPage = 1;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!API.isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  loadSidebar();
  loadProperties();
  setupEventListeners();
});

function loadSidebar() {
  document.getElementById('userAvatar').textContent = API.getUser().full_name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = API.getUser().full_name;
  document.getElementById('userRole').textContent = API.getUser().role;
}

async function loadProperties() {
  const search = document.getElementById('searchInput').value;
  const status = document.getElementById('filterStatus').value;
  const type = document.getElementById('filterType').value;

  let url = `/api/properties?page=${currentPage}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (status) url += `&status=${status}`;
  if (type) url += `&type=${type}`;

  try {
    const result = await API.get(url);
    renderTable(result.properties);
    renderPagination(result.total);
  } catch (err) {
    document.getElementById('tableBody').innerHTML =
      `<tr><td colspan="7"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

function renderTable(properties) {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');

  if (!properties || properties.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const formatPrice = (num) => 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const statusClass = (s) => {
    const map = { available: 'badge-available', sold: 'badge-sold', pending: 'badge-pending' };
    return map[s] || 'badge-available';
  };
  const typeClass = (t) => {
    const map = { house: 'badge-house', apartment: 'badge-apartment', land: 'badge-land', office: 'badge-office' };
    return map[t] || 'badge-house';
  };

  tbody.innerHTML = properties.map(p => `
    <tr>
      <td><strong>${p.title}</strong></td>
      <td><span class="badge ${typeClass(p.type)}">${p.type}</span></td>
      <td class="amount amount-positive">${formatPrice(p.price)}</td>
      <td>${p.city || '-'}</td>
      <td><span class="badge ${statusClass(p.status)}">${p.status}</span></td>
      <td>${p.bedrooms} BR / ${p.bathrooms} BA</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-primary btn-sm" onclick="editProperty(${p.id})">Edit</button>
          <button class="btn btn-success btn-sm" onclick="recordTransaction(${p.id})">Sell</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProperty(${p.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
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
  loadProperties();
}

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadProperties();
    }, 400);
  });

  document.getElementById('filterStatus').addEventListener('change', () => {
    currentPage = 1;
    loadProperties();
  });

  document.getElementById('filterType').addEventListener('change', () => {
    currentPage = 1;
    loadProperties();
  });

  document.getElementById('addPropertyBtn').addEventListener('click', () => openAddModal());

  document.getElementById('modalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProperty();
  });

  document.querySelectorAll('.modal-close, .modal-cancel').forEach(el => {
    el.addEventListener('click', closeModal);
  });

  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add New Property';
  document.getElementById('modalForm').reset();
  document.getElementById('propertyId').value = '';
  document.getElementById('modalOverlay').classList.add('active');
}

async function editProperty(id) {
  try {
    const property = await API.get(`/api/properties/${id}`);
    document.getElementById('modalTitle').textContent = 'Edit Property';
    document.getElementById('propertyId').value = property.id;
    document.getElementById('title').value = property.title;
    document.getElementById('description').value = property.description || '';
    document.getElementById('type').value = property.type;
    document.getElementById('price').value = property.price;
    document.getElementById('address').value = property.address || '';
    document.getElementById('city').value = property.city || '';
    document.getElementById('status').value = property.status;
    document.getElementById('bedrooms').value = property.bedrooms;
    document.getElementById('bathrooms').value = property.bathrooms;
    document.getElementById('area').value = property.area;
    document.getElementById('modalOverlay').classList.add('active');
  } catch (err) {
    alert('Error loading property: ' + err.message);
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

async function saveProperty() {
  const id = document.getElementById('propertyId').value;
  const data = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    type: document.getElementById('type').value,
    price: Number(document.getElementById('price').value),
    address: document.getElementById('address').value.trim(),
    city: document.getElementById('city').value.trim(),
    status: document.getElementById('status').value,
    bedrooms: Number(document.getElementById('bedrooms').value) || 0,
    bathrooms: Number(document.getElementById('bathrooms').value) || 0,
    area: Number(document.getElementById('area').value) || 0,
  };

  if (!data.title || !data.type || !data.price) {
    alert('Title, type, and price are required');
    return;
  }

  const submitBtn = document.querySelector('#modalForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    if (id) {
      await API.put(`/api/properties/${id}`, data);
    } else {
      await API.post('/api/properties', data);
    }
    closeModal();
    loadProperties();
  } catch (err) {
    alert('Error saving property: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save';
  }
}

function deleteProperty(id) {
  if (!confirm('Are you sure you want to delete this property?')) return;

  API.del(`/api/properties/${id}`)
    .then(() => loadProperties())
    .catch(err => alert('Error deleting property: ' + err.message));
}

function closeTxModal() {
  document.getElementById('txModalOverlay').classList.remove('active');
}

async function recordTransaction(propertyId) {
  try {
    const property = await API.get(`/api/properties/${propertyId}`);
    document.getElementById('txPropertyId').value = property.id;
    document.getElementById('txPropertyTitle').value = `${property.title} (Rp ${property.price.toLocaleString('id-ID')})`;

    const customers = await API.get('/api/customers/all');
    const select = document.getElementById('txCustomerId');
    select.innerHTML = '<option value="">-- Select Customer --</option>' +
      customers.map(c => `<option value="${c.id}">${c.name} ${c.phone ? '- ' + c.phone : ''}</option>`).join('');

    document.getElementById('txAmount').value = property.price;
    document.getElementById('txType').value = 'sale';
    document.getElementById('txPaymentMethod').value = 'cash';
    document.getElementById('txNotes').value = '';
    document.getElementById('txModalOverlay').classList.add('active');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function saveTransaction(e) {
  e.preventDefault();

  const data = {
    property_id: Number(document.getElementById('txPropertyId').value),
    customer_id: Number(document.getElementById('txCustomerId').value),
    type: document.getElementById('txType').value,
    amount: Number(document.getElementById('txAmount').value),
    payment_method: document.getElementById('txPaymentMethod').value,
    notes: document.getElementById('txNotes').value.trim() || null,
  };

  if (!data.customer_id) {
    alert('Please select a customer');
    return;
  }
  if (!data.amount || data.amount <= 0) {
    alert('Please enter a valid amount');
    return;
  }

  const submitBtn = document.querySelector('#txModalForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';

  try {
    await API.post('/api/transactions', data);
    closeTxModal();
    loadProperties();
    alert('Transaction recorded successfully!');
  } catch (err) {
    alert('Error recording transaction: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Record Transaction';
  }
}

function setupTxEventListeners() {
  document.getElementById('txModalForm').addEventListener('submit', saveTransaction);

  document.querySelectorAll('#txModalOverlay .modal-close, #txModalOverlay .modal-cancel').forEach(el => {
    el.addEventListener('click', closeTxModal);
  });

  document.getElementById('txModalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTxModal();
  });
}

// Call after setupEventListeners
setupTxEventListeners();

function logout() {
  API.logout().then(() => window.location.href = 'login.html');
}
