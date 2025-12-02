// ========================================
// FINANCIAL & BUDGET MANAGEMENT - CLIENT
// ========================================

let currentTab = 'budget-planning';
let currentPage = 1;
const rowsPerPage = 10;
let allData = [];
let currentUser = null;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadFinancialSummary();
  await loadCharts();
  setupEventListeners();
  await loadTabData();
});

// ========================================
// AUTH & USER
// ========================================

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    
    if (!data.user) {
      window.location.href = '/login';
      return;
    }
    
    currentUser = data.user;
    
    // Check if user has access to financial page
    if (currentUser.role !== 'admin') {
      alert('Access Denied: You do not have permission to access Financial & Budget Management.');
      window.location.href = '/dashboard';
      return;
    }
    
    // Update UI with user info
    document.getElementById('username').textContent = currentUser.name;
    const avatar = document.getElementById('avatar');
    avatar.textContent = currentUser.name.charAt(0).toUpperCase();
  } catch (err) {
    console.error('Auth check failed:', err);
    window.location.href = '/login';
  }
}

function logout() {
  if (confirm('Are you sure you want to log out?')) {
    fetch('/api/logout', { method: 'POST' })
      .then(() => window.location.href = '/login')
      .catch(err => console.error('Logout failed:', err));
  }
}

// ========================================
// FINANCIAL SUMMARY
// ========================================

async function loadFinancialSummary() {
  try {
    const res = await fetch('/api/financial/summary');
    const data = await res.json();
    
    if (data.ok) {
      const s = data.summary;
      document.getElementById('totalBudget').textContent = formatCurrency(s.totalBudget);
      document.getElementById('budgetAllocated').textContent = formatCurrency(s.budgetAllocated);
      document.getElementById('budgetUsed').textContent = formatCurrency(s.budgetUsed);
      document.getElementById('budgetRemaining').textContent = formatCurrency(s.budgetRemaining);
      document.getElementById('pendingApprovals').textContent = s.pendingApprovals;
    }
  } catch (err) {
    console.error('Failed to load summary:', err);
  }
}

// ========================================
// CHARTS (Placeholder)
// ========================================

async function loadCharts() {
  try {
    const res = await fetch('/api/financial/charts');
    const data = await res.json();
    
    if (data.ok) {
      // For now, just display placeholder text
      // In production, use Chart.js or similar library
      const pieChart = document.getElementById('pieChart');
      pieChart.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Budget Distribution</div>
          ${data.distribution.map(d => `
            <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 6px;">
              <strong>${d.category}:</strong> ${formatCurrency(d.amount)} (${d.percentage}%)
            </div>
          `).join('')}
        </div>
      `;
      
      const barChart = document.getElementById('barChart');
      barChart.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Monthly Expenditure</div>
          ${data.monthlyExpenses.map(m => `
            <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 6px;">
              <strong>${m.month}:</strong> ${formatCurrency(m.amount)}
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (err) {
    console.error('Failed to load charts:', err);
  }
}

// ========================================
// TAB MANAGEMENT
// ========================================

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      currentPage = 1;
      loadTabData();
    });
  });
  
  // Quick action buttons
  document.getElementById('btnNewBudget').addEventListener('click', () => {
    switchTab('budget-planning');
    openAddModal();
  });
  
  document.getElementById('btnAllocate').addEventListener('click', () => {
    switchTab('fund-allocation');
    openAddModal();
  });
  
  document.getElementById('btnExpense').addEventListener('click', () => {
    switchTab('expense-management');
    openAddModal();
  });
  
  document.getElementById('btnAssistance').addEventListener('click', () => {
    switchTab('cash-assistance');
    openAddModal();
  });
  
  document.getElementById('btnReport').addEventListener('click', () => {
    switchTab('reports');
  });
  
  // Add button
  document.getElementById('btnAdd').addEventListener('click', openAddModal);
  
  // Filter button
  document.getElementById('btnFilter').addEventListener('click', applyFilters);
  
  // Export button
  document.getElementById('btnExport').addEventListener('click', exportToCSV);
  
  // Modal controls
  document.getElementById('btnCancel').addEventListener('click', closeModal);
  document.getElementById('btnSave').addEventListener('click', saveRecord);
  
  // Drawer controls
  document.getElementById('dClose').addEventListener('click', closeDrawer);
  document.querySelector('.drawer .overlay').addEventListener('click', closeDrawer);
  
  // Form submission
  document.getElementById('frm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveRecord();
  });
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab) {
    tab.classList.add('active');
    currentTab = tabName;
    currentPage = 1;
    loadTabData();
  }
}

// ========================================
// DATA LOADING
// ========================================

async function loadTabData() {
  try {
    const res = await fetch(`/api/financial/${currentTab}`);
    const data = await res.json();
    
    if (data.ok) {
      allData = data.records || [];
      renderTable();
      renderPagination();
    }
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

function renderTable() {
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');
  
  const headers = getTableHeaders();
  thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}<th>Actions</th></tr>`;
  
  const filtered = getFilteredData();
  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const pageData = filtered.slice(start, end);
  
  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${headers.length + 1}" style="text-align:center;padding:40px;color:#7f8c8d">No records found</td></tr>`;
    return;
  }
  
  tbody.innerHTML = pageData.map(record => {
    const cells = getTableCells(record);
    return `
      <tr>
        ${cells.map(c => `<td>${c}</td>`).join('')}
        <td>
          <div class="actions">
            <button class="table-action-btn view" onclick="viewDetails('${record._id}')">
              <i class="fas fa-eye"></i>
              <span>View</span>
            </button>
            <button class="table-action-btn edit" onclick="editRecord('${record._id}')">
              <i class="fas fa-edit"></i>
              <span>Edit</span>
            </button>
            <button class="table-action-btn delete" onclick="deleteRecord('${record._id}')">
              <i class="fas fa-trash"></i>
              <span>Delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getTableHeaders() {
  switch (currentTab) {
    case 'budget-planning':
      return ['Year', 'Annual Budget', 'Carry Over', 'Total Budget', 'Categories', 'Status'];
    case 'fund-allocation':
      return ['Category', 'Amount Allocated', 'Period', 'Date Created', 'Status'];
    case 'expense-management':
      return ['Date', 'Description', 'Amount', 'Category', 'Receipt', 'Approved By'];
    case 'cash-assistance':
      return ['Recipient Name', 'Amount', 'Type', 'Date Requested', 'Status', 'Disbursed Date'];
    case 'reports':
      return ['Report Type', 'Period', 'Generated By', 'Date Generated', 'Status'];
    case 'audit-log':
      return ['Date/Time', 'User', 'Action', 'Module', 'Details'];
    default:
      return [];
  }
}

function getTableCells(record) {
  switch (currentTab) {
    case 'budget-planning':
      return [
        record.year,
        formatCurrency(record.annualBudget),
        formatCurrency(record.carryOver || 0),
        formatCurrency(record.totalBudget),
        record.categories?.length || 0,
        `<span class="badge s-${record.status}">${record.status}</span>`
      ];
    case 'fund-allocation':
      return [
        record.category,
        formatCurrency(record.amount),
        record.period,
        formatDate(record.dateCreated),
        `<span class="badge s-${record.status}">${record.status}</span>`
      ];
    case 'expense-management':
      return [
        formatDate(record.date),
        record.description,
        formatCurrency(record.amount),
        record.category,
        record.receipt ? '✓ Yes' : '✗ No',
        record.approvedBy || 'Pending'
      ];
    case 'cash-assistance':
      return [
        record.recipientName,
        formatCurrency(record.amount),
        record.type,
        formatDate(record.dateRequested),
        `<span class="badge s-${record.status}">${record.status}</span>`,
        record.disbursedDate ? formatDate(record.disbursedDate) : 'N/A'
      ];
    case 'reports':
      return [
        record.reportType,
        record.period,
        record.generatedBy,
        formatDate(record.dateGenerated),
        `<span class="badge s-${record.status}">${record.status}</span>`
      ];
    case 'audit-log':
      return [
        formatDateTime(record.timestamp),
        record.user,
        record.action,
        record.module,
        record.details
      ];
    default:
      return [];
  }
}

// ========================================
// FILTERING
// ========================================

function getFilteredData() {
  let filtered = [...allData];
  
  const query = document.getElementById('fQ').value.toLowerCase();
  if (query) {
    filtered = filtered.filter(record => {
      return JSON.stringify(record).toLowerCase().includes(query);
    });
  }
  
  const status = document.getElementById('fStatus').value;
  if (status) {
    filtered = filtered.filter(record => record.status === status);
  }
  
  const category = document.getElementById('fCategory').value;
  if (category) {
    filtered = filtered.filter(record => record.category === category);
  }
  
  const from = document.getElementById('fFrom').value;
  const to = document.getElementById('fTo').value;
  if (from && to) {
    filtered = filtered.filter(record => {
      const date = new Date(record.date || record.dateCreated || record.dateRequested);
      return date >= new Date(from) && date <= new Date(to);
    });
  }
  
  return filtered;
}

function applyFilters() {
  currentPage = 1;
  renderTable();
  renderPagination();
}

// ========================================
// PAGINATION
// ========================================

function renderPagination() {
  const filtered = getFilteredData();
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const pager = document.getElementById('pager');
  
  if (totalPages <= 1) {
    pager.innerHTML = '';
    return;
  }
  
  pager.innerHTML = `
    <button class="btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">‹ Prev</button>
    <span style="padding:0 10px">Page ${currentPage} of ${totalPages}</span>
    <button class="btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next ›</button>
  `;
}

function changePage(page) {
  currentPage = page;
  renderTable();
  renderPagination();
}

// ========================================
// MODAL OPERATIONS
// ========================================

function openAddModal() {
  document.getElementById('dlgTitle').textContent = `Add ${getModuleName()}`;
  document.getElementById('msg').textContent = '';
  document.getElementById('frm').reset();
  document.getElementById('frm').dataset.mode = 'add';
  delete document.getElementById('frm').dataset.id;
  
  renderForm();
  document.getElementById('modal').classList.add('active');
}

async function editRecord(id) {
  const record = allData.find(r => r._id === id);
  if (!record) return;
  
  document.getElementById('dlgTitle').textContent = `Edit ${getModuleName()}`;
  document.getElementById('msg').textContent = '';
  document.getElementById('frm').dataset.mode = 'edit';
  document.getElementById('frm').dataset.id = id;
  
  renderForm(record);
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

async function saveRecord() {
  const form = document.getElementById('frm');
  const mode = form.dataset.mode;
  const id = form.dataset.id;
  
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  
  // Validation
  if (!validateForm(data)) {
    return;
  }
  
  try {
    const url = mode === 'add' 
      ? `/api/financial/${currentTab}`
      : `/api/financial/${currentTab}/${id}`;
    
    const method = mode === 'add' ? 'POST' : 'PUT';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (result.ok) {
      closeModal();
      await loadTabData();
      await loadFinancialSummary();
      showMessage('success', `Record ${mode === 'add' ? 'added' : 'updated'} successfully!`);
    } else {
      document.getElementById('msg').textContent = result.message || 'Failed to save record';
    }
  } catch (err) {
    console.error('Save failed:', err);
    document.getElementById('msg').textContent = 'An error occurred while saving';
  }
}

async function deleteRecord(id) {
  if (!confirm('Are you sure you want to delete this record?')) return;
  
  try {
    const res = await fetch(`/api/financial/${currentTab}/${id}`, {
      method: 'DELETE'
    });
    
    const result = await res.json();
    
    if (result.ok) {
      await loadTabData();
      await loadFinancialSummary();
      showMessage('success', 'Record deleted successfully!');
    } else {
      alert(result.message || 'Failed to delete record');
    }
  } catch (err) {
    console.error('Delete failed:', err);
    alert('An error occurred while deleting');
  }
}

// ========================================
// DRAWER (DETAILS VIEW)
// ========================================

async function viewDetails(id) {
  const record = allData.find(r => r._id === id);
  if (!record) return;
  
  document.getElementById('dRecordId').textContent = `${getModuleName()} #${id.substring(id.length - 6)}`;
  document.getElementById('dStatus').textContent = record.status || 'N/A';
  document.getElementById('dStatus').className = `badge s-${record.status || 'Pending'}`;
  
  const body = document.getElementById('dBody');
  body.innerHTML = renderDetailsContent(record);
  
  document.getElementById('drawer').classList.add('active');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('active');
}

function renderDetailsContent(record) {
  const entries = Object.entries(record)
    .filter(([key]) => key !== '_id' && key !== '__v')
    .map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      let displayValue = value;
      
      if (typeof value === 'number' && key.toLowerCase().includes('amount')) {
        displayValue = formatCurrency(value);
      } else if (value instanceof Date || key.toLowerCase().includes('date')) {
        displayValue = formatDate(value);
      } else if (typeof value === 'boolean') {
        displayValue = value ? 'Yes' : 'No';
      } else if (Array.isArray(value)) {
        displayValue = value.join(', ');
      }
      
      return `
        <div class="kv">
          <div><strong>${label}:</strong></div>
          <div>${displayValue}</div>
        </div>
      `;
    }).join('');
  
  return entries;
}

// ========================================
// FORM RENDERING
// ========================================

function renderForm(record = {}) {
  const formContent = document.getElementById('formContent');
  
  switch (currentTab) {
    case 'budget-planning':
      formContent.innerHTML = `
        <div class="form-section">
          <h4>Budget Information</h4>
          <div class="form-grid">
            <div>
              <label>Year *</label>
              <input type="number" name="year" value="${record.year || new Date().getFullYear()}" min="2020" max="2100" required>
            </div>
            <div>
              <label>Annual Budget *</label>
              <input type="number" name="annualBudget" value="${record.annualBudget || ''}" step="0.01" required>
            </div>
            <div>
              <label>Carry Over</label>
              <input type="number" name="carryOver" value="${record.carryOver || 0}" step="0.01">
            </div>
            <div>
              <label>Status</label>
              <select name="status">
                <option value="Pending" ${record.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Reviewed" ${record.status === 'Reviewed' ? 'selected' : ''}>Reviewed</option>
                <option value="Approved" ${record.status === 'Approved' ? 'selected' : ''}>Approved</option>
                <option value="Finalized" ${record.status === 'Finalized' ? 'selected' : ''}>Finalized</option>
              </select>
            </div>
            <div class="full">
              <label>Notes</label>
              <textarea name="notes">${record.notes || ''}</textarea>
            </div>
          </div>
        </div>
      `;
      break;
      
    case 'fund-allocation':
      formContent.innerHTML = `
        <div class="form-section">
          <h4>Allocation Details</h4>
          <div class="form-grid">
            <div>
              <label>Category *</label>
              <select name="category" required>
                <option value="">Select Category</option>
                <option value="Health" ${record.category === 'Health' ? 'selected' : ''}>Health</option>
                <option value="Infrastructure" ${record.category === 'Infrastructure' ? 'selected' : ''}>Infrastructure</option>
                <option value="Education" ${record.category === 'Education' ? 'selected' : ''}>Education</option>
                <option value="Emergency" ${record.category === 'Emergency' ? 'selected' : ''}>Emergency Services</option>
                <option value="Social" ${record.category === 'Social' ? 'selected' : ''}>Social Services</option>
              </select>
            </div>
            <div>
              <label>Amount *</label>
              <input type="number" name="amount" value="${record.amount || ''}" step="0.01" required>
            </div>
            <div>
              <label>Period *</label>
              <select name="period" required>
                <option value="Monthly" ${record.period === 'Monthly' ? 'selected' : ''}>Monthly</option>
                <option value="Quarterly" ${record.period === 'Quarterly' ? 'selected' : ''}>Quarterly</option>
                <option value="Annual" ${record.period === 'Annual' ? 'selected' : ''}>Annual</option>
              </select>
            </div>
            <div>
              <label>Status</label>
              <select name="status">
                <option value="Pending" ${record.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Reviewed" ${record.status === 'Reviewed' ? 'selected' : ''}>Reviewed</option>
                <option value="Approved" ${record.status === 'Approved' ? 'selected' : ''}>Approved</option>
              </select>
            </div>
            <div class="full">
              <label>Description</label>
              <textarea name="description">${record.description || ''}</textarea>
            </div>
          </div>
        </div>
      `;
      break;
      
    case 'expense-management':
      formContent.innerHTML = `
        <div class="form-section">
          <h4>Expense Details</h4>
          <div class="form-grid">
            <div>
              <label>Date *</label>
              <input type="date" name="date" value="${record.date ? formatDateInput(record.date) : ''}" required>
            </div>
            <div>
              <label>Amount *</label>
              <input type="number" name="amount" value="${record.amount || ''}" step="0.01" required>
            </div>
            <div>
              <label>Category *</label>
              <select name="category" required>
                <option value="">Select Category</option>
                <option value="Health" ${record.category === 'Health' ? 'selected' : ''}>Health</option>
                <option value="Infrastructure" ${record.category === 'Infrastructure' ? 'selected' : ''}>Infrastructure</option>
                <option value="Education" ${record.category === 'Education' ? 'selected' : ''}>Education</option>
                <option value="Emergency" ${record.category === 'Emergency' ? 'selected' : ''}>Emergency Services</option>
                <option value="Social" ${record.category === 'Social' ? 'selected' : ''}>Social Services</option>
              </select>
            </div>
            <div>
              <label>Approved By</label>
              <input type="text" name="approvedBy" value="${record.approvedBy || ''}">
            </div>
            <div class="full">
              <label>Description *</label>
              <textarea name="description" required>${record.description || ''}</textarea>
            </div>
            <div class="full">
              <label><input type="checkbox" name="receipt" ${record.receipt ? 'checked' : ''}> Receipt Available</label>
            </div>
          </div>
        </div>
      `;
      break;
      
    case 'cash-assistance':
      formContent.innerHTML = `
        <div class="form-section">
          <h4>Cash Assistance Details</h4>
          <div class="form-grid">
            <div>
              <label>Recipient Name *</label>
              <input type="text" name="recipientName" value="${record.recipientName || ''}" required>
            </div>
            <div>
              <label>Amount *</label>
              <input type="number" name="amount" value="${record.amount || ''}" step="0.01" required>
            </div>
            <div>
              <label>Type *</label>
              <select name="type" required>
                <option value="">Select Type</option>
                <option value="LGU Assistance" ${record.type === 'LGU Assistance' ? 'selected' : ''}>LGU Assistance</option>
                <option value="DSWD" ${record.type === 'DSWD' ? 'selected' : ''}>DSWD</option>
                <option value="Emergency Aid" ${record.type === 'Emergency Aid' ? 'selected' : ''}>Emergency Aid</option>
                <option value="Educational" ${record.type === 'Educational' ? 'selected' : ''}>Educational</option>
                <option value="Medical" ${record.type === 'Medical' ? 'selected' : ''}>Medical</option>
              </select>
            </div>
            <div>
              <label>Date Requested</label>
              <input type="date" name="dateRequested" value="${record.dateRequested ? formatDateInput(record.dateRequested) : ''}">
            </div>
            <div>
              <label>Status</label>
              <select name="status">
                <option value="Pending" ${record.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Approved" ${record.status === 'Approved' ? 'selected' : ''}>Approved</option>
                <option value="Disbursed" ${record.status === 'Disbursed' ? 'selected' : ''}>Disbursed</option>
                <option value="Rejected" ${record.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
              </select>
            </div>
            <div>
              <label>Disbursed Date</label>
              <input type="date" name="disbursedDate" value="${record.disbursedDate ? formatDateInput(record.disbursedDate) : ''}">
            </div>
            <div class="full">
              <label>Purpose *</label>
              <textarea name="purpose" required>${record.purpose || ''}</textarea>
            </div>
          </div>
        </div>
      `;
      break;
      
    case 'reports':
      formContent.innerHTML = `
        <div class="form-section">
          <h4>Report Information</h4>
          <div class="form-grid">
            <div>
              <label>Report Type *</label>
              <select name="reportType" required>
                <option value="">Select Type</option>
                <option value="Monthly Financial" ${record.reportType === 'Monthly Financial' ? 'selected' : ''}>Monthly Financial</option>
                <option value="Quarterly Summary" ${record.reportType === 'Quarterly Summary' ? 'selected' : ''}>Quarterly Summary</option>
                <option value="Annual Report" ${record.reportType === 'Annual Report' ? 'selected' : ''}>Annual Report</option>
                <option value="Category Analysis" ${record.reportType === 'Category Analysis' ? 'selected' : ''}>Category Analysis</option>
                <option value="Audit Report" ${record.reportType === 'Audit Report' ? 'selected' : ''}>Audit Report</option>
              </select>
            </div>
            <div>
              <label>Period *</label>
              <input type="text" name="period" value="${record.period || ''}" placeholder="e.g., Q1 2025" required>
            </div>
            <div>
              <label>Generated By</label>
              <input type="text" name="generatedBy" value="${record.generatedBy || currentUser.name}">
            </div>
            <div>
              <label>Status</label>
              <select name="status">
                <option value="Draft" ${record.status === 'Draft' ? 'selected' : ''}>Draft</option>
                <option value="Finalized" ${record.status === 'Finalized' ? 'selected' : ''}>Finalized</option>
              </select>
            </div>
            <div class="full">
              <label>Notes</label>
              <textarea name="notes">${record.notes || ''}</textarea>
            </div>
          </div>
        </div>
      `;
      break;
  }
}

function validateForm(data) {
  // Basic validation
  const requiredFields = document.querySelectorAll('#frm [required]');
  for (const field of requiredFields) {
    if (!data[field.name]) {
      document.getElementById('msg').textContent = `Please fill in ${field.previousElementSibling.textContent}`;
      return false;
    }
  }
  return true;
}

// ========================================
// EXPORT TO CSV
// ========================================

function exportToCSV() {
  const filtered = getFilteredData();
  if (filtered.length === 0) {
    alert('No data to export');
    return;
  }
  
  const headers = getTableHeaders();
  const rows = filtered.map(record => getTableCells(record).map(cell => 
    typeof cell === 'string' ? cell.replace(/<[^>]*>/g, '') : cell
  ));
  
  let csv = headers.join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(cell => `"${cell}"`).join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentTab}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount || 0);
}

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateInput(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

function getModuleName() {
  const names = {
    'budget-planning': 'Budget Plan',
    'fund-allocation': 'Fund Allocation',
    'expense-management': 'Expense',
    'cash-assistance': 'Cash Assistance',
    'reports': 'Report',
    'audit-log': 'Audit Log'
  };
  return names[currentTab] || 'Record';
}

function showMessage(type, message) {
  // Simple alert for now - can be enhanced with toast notifications
  alert(message);
}