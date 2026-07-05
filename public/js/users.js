let currentPage = 1;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!API.isAuthenticated()) {
    window.location.href = 'login.html';
    return;
  }

  loadSidebar();
  loadUsers();
  setupEventListeners();
});

function loadSidebar() {
  document.getElementById('userAvatar').textContent = API.getUser().full_name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = API.getUser().full_name;
  document.getElementById('userRole').textContent = API.getUser().role;
}

async function loadUsers() {
  const search = document.getElementById('searchInput').value;
  let url = `/api/users?page=${currentPage}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const result = await API.get(url);
    renderTable(result.users);
    renderPagination(result.total);
  } catch (err) {
    document.getElementById('tableBody').innerHTML =
      `<tr><td colspan="6"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

function renderTable(users) {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');

  if (!users || users.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
  const currentUser = API.getUser();

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.full_name)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-available' : 'badge-pending'}">${u.role}</span></td>
      <td>${u.active ? '<span class="badge badge-available">Active</span>' : '<span class="badge badge-pending">Inactive</span>'}</td>
      <td>${formatDate(u.created_at)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-primary btn-sm" onclick="editUser(${u.id})">Edit</button>
          <button class="btn btn-gold btn-sm" onclick="resetPassword(${u.id}, '${escapeHtml(u.full_name)}')">Reset Pass</button>
          <button class="btn btn-sm ${u.active ? 'btn-danger' : 'btn-success'}" onclick="toggleActive(${u.id}, ${u.active})">${u.active ? 'Deactivate' : 'Activate'}</button>
          ${u.id !== currentUser.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>` : ''}
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
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

function goToPage(page) { currentPage = page; loadUsers(); }

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; loadUsers(); }, 400);
  });

  document.getElementById('addUserBtn').addEventListener('click', () => openAddModal());
  document.getElementById('modalForm').addEventListener('submit', async (e) => { e.preventDefault(); await saveUser(); });
  document.getElementById('resetForm').addEventListener('submit', async (e) => { e.preventDefault(); await doResetPassword(); });

  document.querySelectorAll('.modal-close, .modal-cancel').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('modalOverlay').classList.remove('active');
      document.getElementById('resetModalOverlay').classList.remove('active');
    });
  });

  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('modalOverlay').classList.remove('active'); });
  document.getElementById('resetModalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('resetModalOverlay').classList.remove('active'); });
}

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add New User';
  document.getElementById('userId').value = '';
  document.getElementById('modalForm').reset();
  document.getElementById('password').required = true;
  document.getElementById('passwordGroup').querySelector('small').textContent = 'Min. 4 characters.';
  document.getElementById('modalOverlay').classList.add('active');
}

async function editUser(id) {
  try {
    const allUsers = await API.get(`/api/users?limit=100`);
    const target = allUsers.users.find(u => u.id === id);
    if (!target) { alert('User not found'); return; }

    document.getElementById('modalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = target.id;
    document.getElementById('username').value = target.username;
    document.getElementById('fullName').value = target.full_name;
    document.getElementById('role').value = target.role;
    document.getElementById('password').value = '';
    document.getElementById('password').required = false;
    document.getElementById('passwordGroup').querySelector('small').textContent = 'Leave blank to keep current password.';
    document.getElementById('modalOverlay').classList.add('active');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function saveUser() {
  const id = document.getElementById('userId').value;
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const full_name = document.getElementById('fullName').value.trim();
  const role = document.getElementById('role').value;

  if (!username || !full_name) { alert('Username and full name are required'); return; }

  const submitBtn = document.querySelector('#modalForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    if (id) {
      await API.put(`/api/users/${id}`, { username, full_name, role });
    } else {
      if (!password || password.length < 4) { alert('Password must be at least 4 characters'); submitBtn.disabled = false; submitBtn.textContent = 'Save User'; return; }
      await API.post('/api/users', { username, password, full_name, role });
    }
    document.getElementById('modalOverlay').classList.remove('active');
    loadUsers();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save User';
  }
}

function resetPassword(id, name) {
  document.getElementById('resetUserId').value = id;
  document.getElementById('resetUserName').textContent = name;
  document.getElementById('resetPassword').value = '';
  document.getElementById('resetModalOverlay').classList.add('active');
}

async function doResetPassword() {
  const id = document.getElementById('resetUserId').value;
  const new_password = document.getElementById('resetPassword').value;
  if (!new_password || new_password.length < 4) { alert('Password must be at least 4 characters'); return; }

  const submitBtn = document.querySelector('#resetForm button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Resetting...';

  try {
    await API.put(`/api/users/${id}/reset-password`, { new_password });
    alert('Password reset successfully');
    document.getElementById('resetModalOverlay').classList.remove('active');
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Reset';
  }
}

async function toggleActive(id, currentActive) {
  try {
    await API.put(`/api/users/${id}`, { active: currentActive ? 0 : 1 });
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

function deleteUser(id) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  API.del(`/api/users/${id}`).then(() => loadUsers()).catch(err => alert(err.message));
}

function logout() {
  API.logout().then(() => window.location.href = 'login.html');
}
