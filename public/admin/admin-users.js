// Admin User Management
(() => {
  'use strict';

  const $id = (id) => document.getElementById(id);
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let currentEditUsername = null;

  // Show message
  function showMessage(message, type = 'success') {
    const msgEl = $id('message');
    if (!msgEl) return;
    
    if (!message) {
      msgEl.style.display = 'none';
      return;
    }
    
    msgEl.textContent = message;
    msgEl.style.display = 'block';
    msgEl.className = type === 'success' ? 'success' : 'error';
    
    setTimeout(() => {
      msgEl.style.display = 'none';
    }, 5000);
  }

  // Create user account
  async function createUser(e) {
    e.preventDefault();
    
    const btn = $id('createBtn');
    const form = $id('createUserForm');
    
    const userData = {
      firstName: $id('firstName').value.trim(),
      middleName: $id('middleName').value.trim() || '',
      lastName: $id('lastName').value.trim(),
      username: $id('username').value.trim(),
      email: $id('email').value.trim(),
      password: $id('password').value,
      address: $id('address').value.trim(),
      role: $id('role').value,
      verified: $id('verified').checked
    };

    // Validation
    if (!userData.firstName || !userData.lastName || !userData.username || 
        !userData.email || !userData.password || !userData.address) {
      showMessage('Please fill all required fields.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(userData)
      });

      const data = await response.json();

      if (data.ok) {
        showMessage(`✅ Account created successfully! Username: ${data.user.username}, Role: ${data.user.role}`, 'success');
        form.reset();
        loadUsers(); // Refresh user list
      } else {
        showMessage(`❌ Error: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`❌ Network error: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
    }
  }

  // Load users list
  async function loadUsers() {
    const tbody = $id('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #6b7280;">Loading users...</td></tr>';

    try {
      const filterVerified = $id('filterVerified')?.value || '';
      const searchUsers = $id('searchUsers')?.value.trim() || '';
      
      const params = new URLSearchParams();
      if (filterVerified) params.append('verified', filterVerified);
      if (searchUsers) params.append('search', searchUsers);
      
      const url = `/api/admin/users${params.toString() ? '?' + params.toString() : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || 'Failed to load users');
      }

      const users = data.users || [];

      if (users.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 40px; color: #6b7280;">
              <p>No users found.</p>
              <p style="font-size: 0.875rem; margin-top: 8px;">${filterVerified === 'false' ? 'No pending verifications.' : 'Use the form above to create new accounts.'}</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = users.map(user => {
        const verifiedBadge = user.verified 
          ? '<span class="badge-modern badge-verified">Verified</span>'
          : '<span class="badge-modern badge-unverified">Pending</span>';
        
        const roleBadge = `<span class="badge-modern badge-role">${(user.role || 'user').replace('_', ' ')}</span>`;
        
        const createdAt = user.createdAt 
          ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : 'N/A';
        
        const residentLink = user.linkedToResident && user.residentId
          ? `<span class="badge-modern" style="background: #e0f2fe; color: #0369a1; font-size: 0.7rem; margin-left: 4px;" title="Linked to Resident ${user.residentId}">
               <i class="fas fa-link"></i> Resident
             </span>`
          : '';
        
        const verifyBtn = !user.verified 
          ? `<button class="btn-action verify" data-username="${user.username}" title="Verify Account">
               <i class="fas fa-check-circle"></i> Verify
             </button>`
          : '';
        
        return `
          <tr>
            <td><strong>${user.username || 'N/A'}</strong></td>
            <td>${user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A'}</td>
            <td>${user.email || 'N/A'}</td>
            <td>${roleBadge}${residentLink}</td>
            <td>${verifiedBadge}</td>
            <td>${createdAt}</td>
            <td>
              <div class="table-actions-modern">
                ${verifyBtn}
                <button class="btn-action edit" data-username="${user.username}" data-role="${user.role || 'user'}" data-verified="${user.verified}" title="Edit Role">
                  <i class="fas fa-edit"></i> Edit
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Attach event listeners to action buttons
      tbody.querySelectorAll('.btn-action.verify').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const username = btn.dataset.username;
          if (confirm(`Verify account for ${username}?`)) {
            await verifyUser(username);
          }
        });
      });

      tbody.querySelectorAll('.btn-action.edit').forEach(btn => {
        btn.addEventListener('click', () => {
          openEditModal(
            btn.dataset.username,
            btn.dataset.role,
            btn.dataset.verified === 'true'
          );
        });
      });

    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #dc2626;">Error loading users: ${error.message}</td></tr>`;
    }
  }

  // Verify user account
  async function verifyUser(username) {
    try {
      // First, get the user's current role
      const usersResponse = await fetch(`/api/admin/users?search=${encodeURIComponent(username)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const usersData = await usersResponse.json();
      const user = usersData.users?.find(u => u.username === username);
      const currentRole = user?.role || 'user';

      // Update with current role and verify
      const response = await fetch(`/api/admin/users/${username}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ 
          role: currentRole, // Keep existing role
          verified: true 
        })
      });

      const data = await response.json();

      if (data.ok) {
        // Check if resident was created (for regular users)
        const userResponse = await fetch(`/api/admin/users?search=${encodeURIComponent(username)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        
        const userData = await userResponse.json();
        const user = userData.users?.find(u => u.username === username);
        
        if (user && user.role === 'user' && user.linkedToResident) {
          showMessage(`✅ Account verified and resident record created! Please complete resident details in Resident Management.`, 'success');
        } else {
          showMessage(`✅ Account verified successfully!`, 'success');
        }
        
        loadUsers(); // Refresh user list
      } else {
        showMessage(`❌ Error: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`❌ Network error: ${error.message}`, 'error');
    }
  }

  // Open edit role modal
  function openEditModal(username, currentRole, verified) {
    currentEditUsername = username;
    $id('editUsername').value = username;
    $id('editRole').value = currentRole || 'user';
    $id('editVerified').checked = verified === true;
    
    const modal = $id('editRoleModal');
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  // Close edit modal
  function closeEditModal() {
    const modal = $id('editRoleModal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
    currentEditUsername = null;
  }

  // Update user role
  async function updateRole(e) {
    e.preventDefault();

    if (!currentEditUsername) return;

    const btn = $id('saveEdit');
    const role = $id('editRole').value;
    const verified = $id('editVerified').checked;

    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      const response = await fetch(`/api/admin/users/${currentEditUsername}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ role, verified })
      });

      const data = await response.json();

      if (data.ok) {
        showMessage(`✅ User role updated successfully!`, 'success');
        closeEditModal();
        loadUsers(); // Refresh user list
      } else {
        showMessage(`❌ Error: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`❌ Network error: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Role';
    }
  }

  // Initialize
  function init() {
    // Form submission
    const form = $id('createUserForm');
    if (form) {
      form.addEventListener('submit', createUser);
    }

    // Reset button
    const resetBtn = $id('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        showMessage('', 'success'); // Clear message
      });
    }

    // Refresh button
    const refreshBtn = $id('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadUsers);
    }

    // Filter and search
    const filterVerified = $id('filterVerified');
    const searchUsers = $id('searchUsers');
    
    if (filterVerified) {
      filterVerified.addEventListener('change', loadUsers);
    }
    
    if (searchUsers) {
      let searchTimeout;
      searchUsers.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadUsers, 500); // Debounce search
      });
    }

    // Edit modal
    const closeEditBtn = $id('closeEditModal');
    const cancelEditBtn = $id('cancelEdit');
    const editForm = $id('editRoleForm');

    if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModal);
    if (editForm) editForm.addEventListener('submit', updateRole);

    // Close modal on outside click
    const editModal = $id('editRoleModal');
    if (editModal) {
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
          closeEditModal();
        }
      });
    }

    // Load users on page load
    loadUsers();
  }

  // Support both DOMContentLoaded and immediate execution
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }

  // Expose for router
  window.initUsers = init;
})();

