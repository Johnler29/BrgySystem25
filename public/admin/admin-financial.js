// ========================================
// FINANCIAL & BUDGET MANAGEMENT - CLIENT
// ========================================

let currentTab = 'budget-planning';
let currentPage = 1;
const rowsPerPage = 10;
let allData = [];
let currentUser = null;
let approvers = [];
let budgets = [];

// ========================================
// INITIALIZATION
// ========================================

// Check if running in SPA mode (router.js is present)
const isSPAMode = typeof window !== 'undefined' && window.location.pathname.includes('/admin/');

const MAX_INIT_RETRIES = 5;
let initRetryCount = 0;
let initTimeoutId = null;

async function initFinancial() {
  // Clear any pending retries
  if (initTimeoutId) {
    clearTimeout(initTimeoutId);
    initTimeoutId = null;
  }
  
  try {
    // Check if content area exists
    const contentArea = document.querySelector('.content-area');
    if (!contentArea || !contentArea.innerHTML.trim()) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Financial page: Content area not ready, retrying...', initRetryCount);
        initTimeoutId = setTimeout(initFinancial, 150);
        return;
      } else {
        console.error('Financial page: Content area not found after max retries');
        return;
      }
    }
    
    // Check if critical buttons exist
    const btnNewBudget = contentArea.querySelector('#btnNewBudget') || document.getElementById('btnNewBudget');
    const btnAdd = contentArea.querySelector('#btnAdd') || document.getElementById('btnAdd');
    
    if (!btnNewBudget || !btnAdd) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Financial page: Critical buttons not found, retrying...', initRetryCount);
        initTimeoutId = setTimeout(initFinancial, 150);
        return;
      } else {
        console.error('Financial page: Critical buttons not found after max retries');
        // Continue anyway - might work with fallback queries
      }
    }
    
    // Reset retry count on success
    initRetryCount = 0;
    initTimeoutId = null;
    
    // Attach event listeners IMMEDIATELY - don't wait for data to load
    // This ensures buttons work right away
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setupEventListeners();
      });
    });
    
    // Load data in parallel (non-blocking)
    // This allows buttons to work while data is loading
    (async () => {
      try {
        // Try to check auth, but don't block if it fails
        const authOk = await checkAuth();
        
        // If auth check failed, still try to load data (might work if session is valid)
        // The API endpoints will handle auth themselves
        if (!authOk) {
          console.warn('Auth check returned false, but continuing anyway - API will handle auth');
          // Don't redirect immediately - let the API calls fail first
          // This prevents redirect loops when session is actually valid but checkAuth had a temporary issue
        }
        
        // Load data in parallel for faster initialization
        // These will fail gracefully if auth is actually invalid
        await Promise.all([
          loadFinancialSummary().catch(e => console.warn('Summary load failed:', e)),
          loadCharts().catch(e => console.warn('Charts load failed:', e)),
          loadApprovers().catch(e => console.warn('Approvers load failed:', e)),
          loadBudgets().catch(e => console.warn('Budgets load failed:', e))
        ]);
        
        // Load table data after listeners are attached
        loadTabData().catch(e => console.warn('Table data load failed:', e));
      } catch (err) {
        console.error('Financial data loading error:', err);
        // Still try to load table data even if other data fails
        loadTabData().catch(e => console.warn('Table data load failed (fallback):', e));
      }
    })();
  } catch (err) {
    console.error('Financial init error:', err);
  }
}

// Auto-initialize if not in SPA mode
if (!isSPAMode) {
  document.addEventListener('DOMContentLoaded', initFinancial);
}

// Export for router
window.initFinancial = initFinancial;

// ========================================
// AUTH & USER
// ========================================

// Track if we've already checked auth to prevent multiple redirects
let authCheckInProgress = false;
let lastAuthCheck = null;
const AUTH_CHECK_CACHE_MS = 5000; // Cache auth check for 5 seconds

async function checkAuth() {
  // Prevent multiple simultaneous auth checks
  if (authCheckInProgress) {
    console.log('Auth check already in progress, waiting...');
    // Wait for the in-progress check to complete
    while (authCheckInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return lastAuthCheck !== null ? lastAuthCheck : false;
  }
  
  // Use cached result if recent
  if (lastAuthCheck !== null && Date.now() - (lastAuthCheck.timestamp || 0) < AUTH_CHECK_CACHE_MS) {
    return lastAuthCheck.result;
  }
  
  authCheckInProgress = true;
  try {
    const res = await fetch('/api/me', {
      credentials: 'include', // Ensure session cookies are sent (critical for Vercel)
      cache: 'no-store' // Prevent caching issues
    });
    
    // Don't redirect immediately on network errors - might be temporary
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // Only redirect if we're sure it's an auth issue, not a network error
        console.warn('Auth check failed:', res.status);
        // Try one more time after a short delay
        await new Promise(resolve => setTimeout(resolve, 500));
        const retryRes = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
        if (!retryRes.ok && (retryRes.status === 401 || retryRes.status === 403)) {
          window.location.href = '/login';
          return false;
        }
        // If retry succeeded, continue
      } else {
        // Network or server error - don't redirect, just log
        console.warn('Auth check network error:', res.status);
        return false;
      }
    }
    
    const data = await res.json();
    
    if (!data || !data.user) {
      console.warn('No user data in response');
      // Don't redirect immediately - might be a temporary issue
      // The page should still work if user was authenticated on previous page
      return false;
    }
    
    currentUser = data.user;
    
    // Check if user has access to financial page
    const isAdmin = /^(admin)$/i.test(currentUser.role || '') || 
                    currentUser.isAdmin === true || 
                    currentUser.type === 'admin' || 
                    currentUser.accountType === 'admin';
    
    if (!isAdmin) {
      alert('Access Denied: You do not have permission to access Financial & Budget Management.');
      window.location.href = '/admin/dashboard';
      return false;
    }
    
    // Update UI with user info
    const usernameEl = document.getElementById('adminUsername') || document.getElementById('username');
    if (usernameEl) usernameEl.textContent = currentUser.name;
    const avatar = document.getElementById('avatar');
    if (avatar) avatar.textContent = (currentUser.name || 'A').charAt(0).toUpperCase();
    
    // Cache successful result
    lastAuthCheck = { result: true, timestamp: Date.now() };
    authCheckInProgress = false;
    return true;
  } catch (err) {
    console.error('Auth check error:', err);
    authCheckInProgress = false;
    
    // Don't redirect on network errors - might be temporary
    // Only redirect if it's clearly an auth error
    if (err.message && err.message.includes('UNAUTH')) {
      // Only redirect if we're sure we're not authenticated
      // Check one more time after a delay
      setTimeout(async () => {
        try {
          const finalCheck = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
          if (!finalCheck.ok || !(await finalCheck.json()).user) {
            window.location.href = '/login';
          }
        } catch {
          // If final check also fails, assume network issue and don't redirect
        }
      }, 1000);
      lastAuthCheck = { result: false, timestamp: Date.now() };
      return false;
    }
    lastAuthCheck = { result: false, timestamp: Date.now() };
    return false;
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
  // Show skeleton loading for summary cards
  showSummarySkeleton();
  
  try {
    const res = await fetch('/api/financial/summary', {
      credentials: 'include' // Ensure session cookies are sent (critical for Vercel)
    });
    const data = await res.json();
    
    if (data.ok) {
      const s = data.summary;
      document.getElementById('totalBudget').textContent = formatCurrency(s.totalBudget);
      document.getElementById('budgetAllocated').textContent = formatCurrency(s.budgetAllocated);
      document.getElementById('budgetUsed').textContent = formatCurrency(s.budgetUsed);
      document.getElementById('budgetRemaining').textContent = formatCurrency(s.budgetRemaining);
      document.getElementById('pendingApprovals').textContent = s.pendingApprovals;
      
      // Remove skeleton
      hideSummarySkeleton();
    } else {
      hideSummarySkeleton();
    }
  } catch (err) {
    console.error('Failed to load summary:', err);
    hideSummarySkeleton();
  }
}

// Show skeleton for summary cards
function showSummarySkeleton() {
  const cards = [
    { id: 'totalBudget', parent: 'totalBudget' },
    { id: 'budgetAllocated', parent: 'budgetAllocated' },
    { id: 'budgetUsed', parent: 'budgetUsed' },
    { id: 'budgetRemaining', parent: 'budgetRemaining' },
    { id: 'pendingApprovals', parent: 'pendingApprovals' }
  ];
  
  cards.forEach(card => {
    const el = document.getElementById(card.id);
    if (el) {
      el.dataset.originalContent = el.textContent;
      el.innerHTML = '<div class="skeleton-amount"></div>';
      el.closest('.summary-card')?.classList.add('summary-skeleton');
    }
  });
}

// Hide skeleton for summary cards
function hideSummarySkeleton() {
  const cards = ['totalBudget', 'budgetAllocated', 'budgetUsed', 'budgetRemaining', 'pendingApprovals'];
  
  cards.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.dataset.originalContent) {
      // Content is already set by loadFinancialSummary, just remove skeleton class
      el.closest('.summary-card')?.classList.remove('summary-skeleton');
    }
  });
}

// ========================================
// CHARTS (Placeholder)
// ========================================

async function loadCharts() {
  // Show skeleton for charts
  showChartsSkeleton();
  
  try {
    const res = await fetch('/api/financial/charts', {
      credentials: 'include' // Ensure session cookies are sent (critical for Vercel)
    });
    const data = await res.json();
    
    if (data.ok) {
      // For now, just display placeholder text
      // In production, use Chart.js or similar library
      const pieChart = document.getElementById('pieChart');
      if (pieChart) {
        pieChart.innerHTML = `
          <div style="padding: 20px; text-align: center;">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Budget Distribution</div>
            ${data.distribution && data.distribution.length > 0 ? data.distribution.map(d => `
              <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 6px;">
                <strong>${d.category}:</strong> ${formatCurrency(d.amount)} (${d.percentage}%)
              </div>
            `).join('') : '<div style="color: #7f8c8d;">No data available</div>'}
          </div>
        `;
      }
      
      const barChart = document.getElementById('barChart');
      if (barChart) {
        barChart.innerHTML = `
          <div style="padding: 20px; text-align: center;">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Monthly Expenditure</div>
            ${data.monthlyExpenses && data.monthlyExpenses.length > 0 ? data.monthlyExpenses.map(m => `
              <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 6px;">
                <strong>${m.month}:</strong> ${formatCurrency(m.amount)}
              </div>
            `).join('') : '<div style="color: #7f8c8d;">No data available</div>'}
          </div>
        `;
      }
    } else {
      hideChartsSkeleton();
    }
  } catch (err) {
    console.error('Failed to load charts:', err);
    hideChartsSkeleton();
  }
}

// Show skeleton for charts
function showChartsSkeleton() {
  const pieChart = document.getElementById('pieChart');
  const barChart = document.getElementById('barChart');
  
  if (pieChart) {
    pieChart.innerHTML = `
      <div style="padding: 20px;">
        <div class="skeleton-bar long" style="margin-bottom: 16px;"></div>
        <div class="skeleton-bar long" style="margin-bottom: 12px;"></div>
        <div class="skeleton-bar long" style="margin-bottom: 12px;"></div>
        <div class="skeleton-bar long" style="margin-bottom: 12px;"></div>
        <div class="skeleton-bar short"></div>
      </div>
    `;
  }
  
  if (barChart) {
    barChart.innerHTML = `
      <div style="padding: 20px;">
        <div class="skeleton-bar long" style="margin-bottom: 16px;"></div>
        <div class="skeleton-bar long" style="margin-bottom: 12px;"></div>
        <div class="skeleton-bar long" style="margin-bottom: 12px;"></div>
        <div class="skeleton-bar long" style="margin-bottom: 12px;"></div>
        <div class="skeleton-bar short"></div>
      </div>
    `;
  }
}

// Hide skeleton for charts
function hideChartsSkeleton() {
  // Charts are already populated by loadCharts, no need to hide
}

// ========================================
// LOAD APPROVERS AND BUDGETS
// ========================================

async function loadApprovers() {
  try {
    const res = await fetch('/api/financial/approvers', {
      credentials: 'include' // Ensure session cookies are sent (critical for Vercel)
    });
    const data = await res.json();
    if (data.ok) {
      approvers = data.approvers || [];
    }
  } catch (err) {
    console.error('Failed to load approvers:', err);
  }
}

async function loadBudgets() {
  try {
    const res = await fetch('/api/financial/budget-planning', {
      credentials: 'include' // Ensure session cookies are sent (critical for Vercel)
    });
    const data = await res.json();
    if (data.ok) {
      budgets = data.records || [];
    }
  } catch (err) {
    console.error('Failed to load budgets:', err);
  }
}

// ========================================
// TAB MANAGEMENT
// ========================================

function setupEventListeners() {
  const contentArea = document.querySelector('.content-area');
  
  if (!contentArea) {
    console.error('Financial page: Content area not found in setupEventListeners');
    return;
  }
  
  // Helper to clone and re-attach listeners (for SPA compatibility)
  function cloneAndAttach(id, handler, required = false) {
    // Try content area first, then document-wide
    let el = contentArea.querySelector(`#${id}`);
    if (!el) {
      el = document.getElementById(id);
    }
    
    if (el) {
      const newEl = el.cloneNode(true);
      el.parentNode.replaceChild(newEl, el);
      newEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
      });
      console.log(`Financial page: Attached listener to #${id}`);
      return newEl;
    } else {
      if (required) {
        console.error(`Financial page: Required element #${id} not found!`);
      } else {
        console.warn(`Financial page: Element #${id} not found (optional)`);
      }
      return null;
    }
  }
  
  // Tab switching
  const tabs = contentArea.querySelectorAll('.tab') || document.querySelectorAll('.tab');
  if (tabs.length === 0) {
    console.warn('Financial page: No tabs found');
  } else {
    tabs.forEach(tab => {
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);
      newTab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Financial page: Tab clicked:', newTab.dataset.tab);
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        newTab.classList.add('active');
        currentTab = newTab.dataset.tab;
        currentPage = 1;
        loadTabData();
      });
    });
    console.log(`Financial page: Attached listeners to ${tabs.length} tabs`);
  }
  
  // Quick action buttons (required - log error if not found)
  cloneAndAttach('btnNewBudget', () => {
    console.log('Financial page: btnNewBudget clicked');
    switchTab('budget-planning');
    openAddModal();
  }, true);
  
  cloneAndAttach('btnAllocate', () => {
    console.log('Financial page: btnAllocate clicked');
    switchTab('fund-allocation');
    openAddModal();
  }, true);
  
  cloneAndAttach('btnExpense', () => {
    console.log('Financial page: btnExpense clicked');
    switchTab('expense-management');
    openAddModal();
  }, true);
  
  cloneAndAttach('btnAssistance', () => {
    console.log('Financial page: btnAssistance clicked');
    switchTab('cash-assistance');
    openAddModal();
  }, true);
  
  cloneAndAttach('btnReport', () => {
    console.log('Financial page: btnReport clicked');
    switchTab('reports');
    openReportGenerator();
  }, true);
  
  // Add button (required)
  cloneAndAttach('btnAdd', () => {
    console.log('Financial page: btnAdd clicked');
    openAddModal();
  }, true);
  
  // Filter button
  cloneAndAttach('btnFilter', () => {
    console.log('Financial page: btnFilter clicked');
    applyFilters();
  });
  
  // Export button
  cloneAndAttach('btnExport', () => {
    console.log('Financial page: btnExport clicked');
    exportToCSV();
  });
  
  // Modal controls
  cloneAndAttach('btnCancel', () => {
    console.log('Financial page: btnCancel clicked');
    closeModal();
  });
  
  cloneAndAttach('btnSave', () => {
    console.log('Financial page: btnSave clicked');
    saveRecord();
  });
  
  // Drawer controls
  const dClose = document.getElementById('dClose');
  if (dClose) {
    const newDClose = dClose.cloneNode(true);
    dClose.parentNode.replaceChild(newDClose, dClose);
    newDClose.addEventListener('click', closeDrawer);
  }
  
  const drawerOverlay = document.querySelector('.drawer .overlay');
  if (drawerOverlay) {
    const newOverlay = drawerOverlay.cloneNode(true);
    drawerOverlay.parentNode.replaceChild(newOverlay, drawerOverlay);
    newOverlay.addEventListener('click', closeDrawer);
  }
  
  // Form submission
  const frm = document.getElementById('frm');
  if (frm) {
    const newFrm = frm.cloneNode(true);
    frm.parentNode.replaceChild(newFrm, frm);
    newFrm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveRecord();
    });
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab) {
    tab.classList.add('active');
    currentTab = tabName;
    currentPage = 1;
    // Show loading immediately when switching tabs
    showLoading();
    loadTabData();
  }
}

// ========================================
// DATA LOADING
// ========================================

async function loadTabData() {
  // Show loading skeleton
  showLoading();
  
  try {
    let endpoint = `/api/financial/${currentTab}`;
    
    // Reports tab uses different endpoint
    if (currentTab === 'reports') {
      endpoint = '/api/financial/reports';
    }
    
    const res = await fetch(endpoint, {
      credentials: 'include' // Ensure session cookies are sent (critical for Vercel)
    });
    
    // Check if response is OK before parsing JSON
    if (!res.ok) {
      // Handle authentication errors
      if (res.status === 401 || res.status === 403) {
        console.error('Authentication error:', res.status);
        // Don't redirect here - let checkAuth handle it
        // Just show error message
        const tbody = document.getElementById('tableBody');
        if (tbody) {
          const headers = getTableHeaders();
          tbody.innerHTML = `<tr><td colspan="${headers.length + 1}" style="text-align:center;padding:40px;color:#c0392b">Authentication required. Please refresh the page.</td></tr>`;
        }
        return;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    
    if (data.ok) {
      allData = data.records || [];
      renderTable();
      renderPagination();
    } else {
      // Show error state
      const tbody = document.getElementById('tableBody');
      if (tbody) {
        const headers = getTableHeaders();
        tbody.innerHTML = `<tr><td colspan="${headers.length + 1}" style="text-align:center;padding:40px;color:#7f8c8d">Failed to load data</td></tr>`;
      }
    }
  } catch (err) {
    console.error('Failed to load data:', err);
    const tbody = document.getElementById('tableBody');
    if (tbody) {
      const headers = getTableHeaders();
      tbody.innerHTML = `<tr><td colspan="${headers.length + 1}" style="text-align:center;padding:40px;color:#c0392b">Error loading data. Please try again.</td></tr>`;
    }
  }
}

// Show loading skeleton
function showLoading() {
  const tableBody = document.getElementById('tableBody');
  const tableHead = document.getElementById('tableHead');
  
  if (!tableBody) return;
  
  const headers = getTableHeaders();
  const colCount = headers.length + 1; // +1 for Actions column
  
  // Set table headers
  if (tableHead) {
    tableHead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}<th>Actions</th></tr>`;
  }
  
  // Add loading class to table wrapper
  const tableWrap = tableBody.closest('.table-wrap');
  if (tableWrap) {
    tableWrap.classList.add('table-loading');
  }
  
  // Clear existing rows
  tableBody.innerHTML = '';
  
  // Create 5 skeleton rows
  for (let i = 0; i < 5; i++) {
    const tr = document.createElement('tr');
    tr.className = 'table-skeleton';
    let skeletonCells = '';
    
    // Determine column widths based on tab
    const widths = getSkeletonWidths(currentTab, colCount);
    
    for (let j = 0; j < colCount; j++) {
      const width = widths[j] || 'long';
      skeletonCells += `<td><div class="skeleton-bar ${width}"></div></td>`;
    }
    
    tr.innerHTML = skeletonCells;
    tableBody.appendChild(tr);
  }
}

// Get skeleton bar widths based on tab
function getSkeletonWidths(tab, colCount) {
  const widthMaps = {
    'budget-planning': ['short', 'long', 'long', 'long', 'long', 'short', 'short'],
    'fund-allocation': ['long', 'long', 'short', 'long', 'short', 'short'],
    'expense-management': ['long', 'long', 'short', 'short', 'long', 'long', 'short', 'short'],
    'cash-assistance': ['long', 'short', 'short', 'short', 'long', 'short', 'long', 'short'],
    'reports': ['long', 'long', 'long', 'long', 'short', 'short', 'short'],
    'audit-log': ['long', 'short', 'short', 'short', 'long', 'short']
  };
  
  return widthMaps[tab] || Array(colCount).fill('long');
}

function renderTable() {
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');
  
  if (!thead || !tbody) {
    console.error('Financial page: Table elements not found');
    return;
  }
  
  const headers = getTableHeaders();
  thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}<th>Actions</th></tr>`;
  
  // Remove loading class
  const tableWrap = tbody.closest('.table-wrap');
  if (tableWrap) {
    tableWrap.classList.remove('table-loading');
  }
  
  const filtered = getFilteredData();
  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const pageData = filtered.slice(start, end);
  
  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${headers.length + 1}" style="text-align:center;padding:40px;color:#7f8c8d">No records found</td></tr>`;
    return;
  }
  
  // Use data attributes instead of inline onclick for better reliability
  tbody.innerHTML = pageData.map(record => {
    const cells = getTableCells(record);
    return `
      <tr>
        ${cells.map(c => `<td>${c}</td>`).join('')}
        <td>
          <div class="actions">
            <button class="table-action-btn view" data-action="view" data-id="${record._id}">
              <i class="fas fa-eye"></i>
              <span>View</span>
            </button>
            <button class="table-action-btn edit" data-action="edit" data-id="${record._id}">
              <i class="fas fa-edit"></i>
              <span>Edit</span>
            </button>
            <button class="table-action-btn delete" data-action="delete" data-id="${record._id}">
              <i class="fas fa-trash"></i>
              <span>Delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  // Attach event listeners to table buttons using event delegation
  setupTableEventListeners(tbody);
}

function setupTableEventListeners(tbody) {
  if (!tbody) return;
  
  // Remove old listeners by cloning
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);
  
  // Use event delegation for table actions
  newTbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    
    if (!id) {
      console.error('Financial page: Button missing data-id');
      return;
    }
    
    console.log(`Financial page: Table action clicked: ${action} for id: ${id}`);
    
    switch (action) {
      case 'view':
        viewDetails(id);
        break;
      case 'edit':
        editRecord(id);
        break;
      case 'delete':
        deleteRecord(id);
        break;
      default:
        console.warn('Financial page: Unknown table action:', action);
    }
  });
}

function getTableHeaders() {
  switch (currentTab) {
    case 'budget-planning':
      return ['Year', 'Annual Budget', 'Carry Over', 'Total Budget', 'Approved By', 'Status'];
    case 'fund-allocation':
      return ['Category', 'Amount Allocated', 'Period', 'Date Created', 'Status'];
    case 'expense-management':
      return ['Date', 'Description', 'Amount', 'Category', 'Noted By', 'Approved By', 'Receipt'];
    case 'cash-assistance':
      return ['Recipient Name', 'Amount', 'Min/Max', 'Type', 'Date Requested', 'Status', 'Disbursed Date'];
    case 'reports':
      return ['Report Type', 'Period', 'Generated By', 'Date Generated', 'Status', 'Actions'];
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
        record.approvedBy || 'N/A',
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
        record.notedBy || 'N/A',
        record.approvedBy || 'N/A',
        record.receiptUrl ? `<a href="${record.receiptUrl}" target="_blank" style="color: #3498db;">View Receipt</a>` : 'No Receipt'
      ];
    case 'cash-assistance':
      const minMax = record.minAmount || record.maxAmount 
        ? `₱${record.minAmount || 0} - ₱${record.maxAmount || '∞'}` 
        : 'N/A';
      return [
        record.recipientName,
        formatCurrency(record.amount),
        minMax,
        record.type,
        formatDate(record.dateRequested),
        `<span class="badge s-${record.status}">${record.status}</span>`,
        record.disbursedDate ? formatDate(record.disbursedDate) : 'N/A'
      ];
    case 'reports':
      return [
        record.reportType || record.data?.reportType || 'N/A',
        record.period || record.data?.period || 'N/A',
        record.generatedBy || record.data?.generatedBy || 'N/A',
        formatDate(record.dateGenerated || record.data?.generatedAt),
        `<span class="badge s-${record.status || 'Generated'}">${record.status || 'Generated'}</span>`,
        `<button class="table-action-btn view" onclick="viewReport('${record._id}')" style="margin-right: 4px;">View</button>
         <button class="table-action-btn edit" onclick="downloadPDF('${record._id}')" style="margin-right: 4px;">PDF</button>`
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
  // Show loading skeleton when filtering
  showLoading();
  // Small delay to show skeleton, then render
  setTimeout(() => {
    renderTable();
    renderPagination();
  }, 100);
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
  console.log('Financial page: openAddModal called');
  const modal = document.getElementById('modal');
  const dlgTitle = document.getElementById('dlgTitle');
  const msg = document.getElementById('msg');
  const frm = document.getElementById('frm');
  
  if (!modal) {
    console.error('Financial page: Modal element not found');
    return;
  }
  
  if (!dlgTitle) {
    console.error('Financial page: dlgTitle element not found');
    return;
  }
  
  if (!frm) {
    console.error('Financial page: Form element not found');
    return;
  }
  
  dlgTitle.textContent = `Add ${getModuleName()}`;
  if (msg) msg.textContent = '';
  frm.reset();
  frm.dataset.mode = 'add';
  delete frm.dataset.id;
  
  renderForm();
  
  // Ensure modal is visible and interactive
  modal.style.display = 'flex';
  modal.style.pointerEvents = 'auto';
  modal.style.zIndex = '10000';
  modal.style.visibility = 'visible';
  modal.style.opacity = '1';
  modal.classList.add('active');
  
  console.log('Financial page: Modal opened successfully');
}

async function editRecord(id) {
  const record = allData.find(r => r._id === id);
  if (!record) return;
  
  const modal = document.getElementById('modal');
  const dlgTitle = document.getElementById('dlgTitle');
  const msg = document.getElementById('msg');
  const frm = document.getElementById('frm');
  
  if (!modal || !dlgTitle || !frm) {
    console.error('Modal elements not found');
    return;
  }
  
  dlgTitle.textContent = `Edit ${getModuleName()}`;
  if (msg) msg.textContent = '';
  frm.dataset.mode = 'edit';
  frm.dataset.id = id;
  
  renderForm(record);
  
  // Ensure modal is visible and interactive
  modal.style.display = 'flex';
  modal.style.pointerEvents = 'auto';
  modal.style.zIndex = '10000';
  modal.style.visibility = 'visible';
  modal.style.opacity = '1';
  modal.classList.add('active');
}

// Make editRecord globally accessible
window.editRecord = editRecord;
window.viewDetails = viewDetails;
window.deleteRecord = deleteRecord;
window.changePage = changePage;

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.classList.remove('active');
    // Remove inline styles to avoid conflicts
    modal.style.removeProperty('display');
    modal.style.removeProperty('pointer-events');
    modal.style.removeProperty('z-index');
    modal.style.removeProperty('visibility');
    modal.style.removeProperty('opacity');
  }
}

async function saveRecord() {
  const form = document.getElementById('frm');
  const mode = form.dataset.mode;
  const id = form.dataset.id;
  
  // Handle report generation separately
  if (mode === 'report') {
    await generateReport();
    return;
  }
  
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  
  // Handle depends checkbox
  if (currentTab === 'cash-assistance') {
    data.depends = document.getElementById('dependsCheck')?.checked ? 'true' : 'false';
    if (data.depends === 'true' && !data.dependsDetails) {
      document.getElementById('msg').textContent = 'Details/explanation is required when "Depends" option is selected';
      return;
    }
  }
  
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
      credentials: 'include', // Ensure session cookies are sent (critical for Vercel)
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (result.ok) {
      closeModal();
      await loadTabData();
      await loadFinancialSummary();
      if (currentTab === 'budget-planning') {
        await loadBudgets(); // Reload budgets for expense form
      }
      showMessage('success', `Record ${mode === 'add' ? 'added' : 'updated'} successfully!`);
    } else {
      document.getElementById('msg').textContent = result.message || 'Failed to save record';
      document.getElementById('msg').style.color = '#c0392b';
    }
  } catch (err) {
    console.error('Save failed:', err);
    document.getElementById('msg').textContent = 'An error occurred while saving';
    document.getElementById('msg').style.color = '#c0392b';
  }
}

async function deleteRecord(id) {
  if (!confirm('Are you sure you want to delete this record?')) return;
  
  try {
    const res = await fetch(`/api/financial/${currentTab}/${id}`, {
      method: 'DELETE',
      credentials: 'include' // Ensure session cookies are sent (critical for Vercel)
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
            <div>
              <label>Who Approved the Budget</label>
              <input type="text" name="approvedBy" value="${record.approvedBy || ''}" placeholder="Enter approver name">
            </div>
            <div>
              <label>What Happened to Excess Budget</label>
              <select name="excessBudgetHandling">
                <option value="">Select Option</option>
                <option value="Carried Over to Next Year" ${record.excessBudgetHandling === 'Carried Over to Next Year' ? 'selected' : ''}>Carried Over to Next Year</option>
                <option value="Returned to Treasury" ${record.excessBudgetHandling === 'Returned to Treasury' ? 'selected' : ''}>Returned to Treasury</option>
                <option value="Reallocated" ${record.excessBudgetHandling === 'Reallocated' ? 'selected' : ''}>Reallocated</option>
                <option value="Other" ${record.excessBudgetHandling === 'Other' ? 'selected' : ''}>Other</option>
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
      const approversOptions = approvers.map(a => 
        `<option value="${a.value}" ${record.approvedBy === a.value ? 'selected' : ''}>${a.label}</option>`
      ).join('');
      
      const budgetsOptions = budgets.map(b => 
        `<option value="${b._id}" ${record.budgetId === b._id ? 'selected' : ''}>${b.year} - ${formatCurrency(b.totalBudget)}</option>`
      ).join('');
      
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
              <label>Budget Plan</label>
              <select name="budgetId">
                <option value="">Select Budget (Optional)</option>
                ${budgetsOptions}
              </select>
            </div>
            <div>
              <label>Who Approved the Expense</label>
              <select name="approvedBy">
                <option value="">Select Approver</option>
                ${approversOptions}
              </select>
            </div>
            <div>
              <label>Noted By</label>
              <input type="text" name="notedBy" value="${record.notedBy || ''}" placeholder="Enter name of person who noted">
            </div>
            <div class="full">
              <label>Description *</label>
              <textarea name="description" required>${record.description || ''}</textarea>
            </div>
            <div class="full">
              <label>Receipt Upload</label>
              <input type="file" id="receiptFile" name="receiptFile" accept="image/*,application/pdf">
              <div id="receiptPreview" style="margin-top: 10px;">
                ${record.receiptUrl ? `<div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-top: 8px;">
                  <a href="${record.receiptUrl}" target="_blank" style="color: #3498db; margin-right: 10px;">View Current Receipt</a>
                  <span style="color: #7f8c8d; font-size: 12px;">Upload new file to replace</span>
                </div>` : ''}
              </div>
              <input type="hidden" name="receiptUrl" id="receiptUrl" value="${record.receiptUrl || ''}">
            </div>
          </div>
        </div>
      `;
      
      // Setup receipt upload handler
      const receiptFile = document.getElementById('receiptFile');
      if (receiptFile) {
        receiptFile.addEventListener('change', handleReceiptUpload);
      }
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
              <label>Minimum Amount</label>
              <input type="number" name="minAmount" value="${record.minAmount || ''}" step="0.01" placeholder="Optional">
            </div>
            <div>
              <label>Maximum Amount</label>
              <input type="number" name="maxAmount" value="${record.maxAmount || ''}" step="0.01" placeholder="Optional">
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
                <option value="Depends" ${record.type === 'Depends' ? 'selected' : ''}>Depends</option>
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
              <label>
                <input type="checkbox" name="depends" id="dependsCheck" ${record.depends || record.type === 'Depends' ? 'checked' : ''} onchange="toggleDependsDetails()">
                Depends (Requires explanation)
              </label>
            </div>
            <div class="full" id="dependsDetailsSection" style="${record.depends || record.type === 'Depends' ? '' : 'display: none;'}">
              <label>Details/Explanation *</label>
              <textarea name="dependsDetails" id="dependsDetails" ${record.depends || record.type === 'Depends' ? 'required' : ''}>${record.dependsDetails || ''}</textarea>
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

// ========================================
// RECEIPT UPLOAD HANDLER
// ========================================

async function handleReceiptUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const preview = document.getElementById('receiptPreview');
  const receiptUrlInput = document.getElementById('receiptUrl');
  
  preview.innerHTML = '<div style="padding: 8px; color: #7f8c8d;">Uploading...</div>';

  const formData = new FormData();
  formData.append('receipt', file);

  try {
    const res = await fetch('/api/financial/expense-management/upload-receipt', {
      method: 'POST',
      credentials: 'include', // Ensure session cookies are sent (critical for Vercel)
      body: formData
    });

    const data = await res.json();
    
    if (data.ok) {
      receiptUrlInput.value = data.fileUrl;
      preview.innerHTML = `
        <div style="padding: 8px; background: #e9f9ef; border-radius: 4px; margin-top: 8px;">
          <span style="color: #239b56;">✓ Receipt uploaded successfully</span>
          ${file.type.startsWith('image/') ? `<img src="${data.fileUrl}" style="max-width: 200px; margin-top: 8px; border-radius: 4px;" />` : ''}
        </div>
      `;
    } else {
      preview.innerHTML = `<div style="padding: 8px; background: #fdecea; border-radius: 4px; color: #c0392b;">Upload failed: ${data.message}</div>`;
    }
  } catch (err) {
    console.error('Receipt upload error:', err);
    preview.innerHTML = `<div style="padding: 8px; background: #fdecea; border-radius: 4px; color: #c0392b;">Upload failed: ${err.message}</div>`;
  }
}

// ========================================
// DEPENDS TOGGLE
// ========================================

function toggleDependsDetails() {
  const dependsCheck = document.getElementById('dependsCheck');
  const dependsSection = document.getElementById('dependsDetailsSection');
  const dependsDetails = document.getElementById('dependsDetails');
  
  if (dependsCheck.checked) {
    dependsSection.style.display = 'block';
    dependsDetails.required = true;
  } else {
    dependsSection.style.display = 'none';
    dependsDetails.required = false;
    dependsDetails.value = '';
  }
}

// Make it globally accessible
window.toggleDependsDetails = toggleDependsDetails;

// ========================================
// REPORT GENERATION
// ========================================

function openReportGenerator() {
  const modal = document.getElementById('modal');
  const dlgTitle = document.getElementById('dlgTitle');
  const msg = document.getElementById('msg');
  const frm = document.getElementById('frm');
  
  if (!modal || !dlgTitle || !frm) {
    console.error('Modal elements not found');
    return;
  }
  
  dlgTitle.textContent = 'Generate Financial Report';
  if (msg) msg.textContent = '';
  frm.reset();
  frm.dataset.mode = 'report';
  delete frm.dataset.id;
  
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentQuarter = Math.floor((currentMonth + 2) / 3);
  
  document.getElementById('formContent').innerHTML = `
    <div class="form-section">
      <h4>Report Configuration</h4>
      <div class="form-grid">
        <div>
          <label>Report Type *</label>
          <select name="reportType" id="reportType" required onchange="updateReportPeriod()">
            <option value="">Select Type</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label>Year *</label>
          <input type="number" name="year" id="reportYear" value="${currentYear}" min="2020" max="2100" required onchange="updateReportPeriod()">
        </div>
        <div id="monthSection" style="display: none;">
          <label>Month *</label>
          <select name="month" id="reportMonth">
            ${Array.from({length: 12}, (_, i) => {
              const monthNum = i + 1;
              const monthName = new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' });
              return `<option value="${monthNum}" ${monthNum === currentMonth ? 'selected' : ''}>${monthName}</option>`;
            }).join('')}
          </select>
        </div>
        <div id="quarterSection" style="display: none;">
          <label>Quarter *</label>
          <select name="quarter" id="reportQuarter">
            <option value="1" ${currentQuarter === 1 ? 'selected' : ''}>Q1 (Jan-Mar)</option>
            <option value="2" ${currentQuarter === 2 ? 'selected' : ''}>Q2 (Apr-Jun)</option>
            <option value="3" ${currentQuarter === 3 ? 'selected' : ''}>Q3 (Jul-Sep)</option>
            <option value="4" ${currentQuarter === 4 ? 'selected' : ''}>Q4 (Oct-Dec)</option>
          </select>
        </div>
        <div class="full">
          <label>Period (Auto-generated)</label>
          <input type="text" name="period" id="reportPeriod" readonly style="background: #f8f9fa;">
        </div>
      </div>
    </div>
  `;
  
  // Ensure modal is visible and interactive
  modal.style.display = 'flex';
  modal.style.pointerEvents = 'auto';
  modal.style.zIndex = '10000';
  modal.style.visibility = 'visible';
  modal.style.opacity = '1';
  modal.classList.add('active');
  updateReportPeriod();
}

function updateReportPeriod() {
  const reportType = document.getElementById('reportType')?.value;
  const year = document.getElementById('reportYear')?.value || new Date().getFullYear();
  const monthSection = document.getElementById('monthSection');
  const quarterSection = document.getElementById('quarterSection');
  const periodInput = document.getElementById('reportPeriod');
  
  if (!reportType) {
    if (monthSection) monthSection.style.display = 'none';
    if (quarterSection) quarterSection.style.display = 'none';
    if (periodInput) periodInput.value = '';
    return;
  }
  
  if (reportType === 'monthly') {
    if (monthSection) monthSection.style.display = 'block';
    if (quarterSection) quarterSection.style.display = 'none';
    const month = document.getElementById('reportMonth')?.value || new Date().getMonth() + 1;
    const monthName = new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });
    if (periodInput) periodInput.value = `${monthName} ${year}`;
  } else if (reportType === 'quarterly') {
    if (monthSection) monthSection.style.display = 'none';
    if (quarterSection) quarterSection.style.display = 'block';
    const quarter = document.getElementById('reportQuarter')?.value || Math.floor((new Date().getMonth() + 3) / 3);
    if (periodInput) periodInput.value = `Q${quarter} ${year}`;
  } else if (reportType === 'yearly') {
    if (monthSection) monthSection.style.display = 'none';
    if (quarterSection) quarterSection.style.display = 'none';
    if (periodInput) periodInput.value = `Year ${year}`;
  }
}

window.updateReportPeriod = updateReportPeriod;

async function generateReport() {
  const form = document.getElementById('frm');
  const reportType = document.getElementById('reportType')?.value;
  const year = document.getElementById('reportYear')?.value;
  const month = document.getElementById('reportMonth')?.value;
  const quarter = document.getElementById('reportQuarter')?.value;
  const period = document.getElementById('reportPeriod')?.value;

  if (!reportType || !year || !period) {
    document.getElementById('msg').textContent = 'Please fill in all required fields';
    return;
  }

  try {
    const res = await fetch('/api/financial/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Ensure session cookies are sent (critical for Vercel)
      body: JSON.stringify({ reportType, year, month, quarter, period })
    });
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        alert('Authentication required. Please refresh the page and try again.');
        return;
      }
      const errorData = await res.json().catch(() => ({ message: 'Failed to generate report' }));
      document.getElementById('msg').textContent = errorData.message || 'Failed to generate report';
      return;
    }

    const result = await res.json();
    
    if (result.ok) {
      closeModal();
      await loadTabData();
      showMessage('success', 'Report generated successfully!');
      
      // Optionally open the report view
      if (result.reportData && result.reportData._id) {
        viewReport(result.reportData._id);
      }
    } else {
      document.getElementById('msg').textContent = result.message || 'Failed to generate report';
    }
  } catch (err) {
    console.error('Generate report error:', err);
    document.getElementById('msg').textContent = 'An error occurred while generating report';
  }
}

async function viewReport(reportId) {
  try {
    const res = await fetch(`/api/financial/reports`, {
      credentials: 'include' // Ensure session cookies are sent (critical for Vercel)
    });
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        alert('Authentication required. Please refresh the page and try again.');
        return;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    
    if (data.ok) {
      const report = data.records.find(r => r._id === reportId);
      if (!report) {
        alert('Report not found');
        return;
      }
      
      const reportData = report.data || report;
      
      document.getElementById('dRecordId').textContent = `${reportData.reportType || 'Financial'} Report - ${reportData.period || 'N/A'}`;
      document.getElementById('dStatus').textContent = report.status || 'Generated';
      document.getElementById('dStatus').className = `badge s-${report.status || 'Generated'}`;
      
      const body = document.getElementById('dBody');
      body.innerHTML = `
        <div class="kv">
          <div><strong>Report Type:</strong></div>
          <div>${reportData.reportType || 'N/A'}</div>
        </div>
        <div class="kv">
          <div><strong>Period:</strong></div>
          <div>${reportData.period || 'N/A'}</div>
        </div>
        <div class="kv">
          <div><strong>Year:</strong></div>
          <div>${reportData.year || 'N/A'}</div>
        </div>
        <hr>
        <h4>Budget Summary</h4>
        <div class="kv">
          <div><strong>Total Budget:</strong></div>
          <div>${formatCurrency(reportData.budget?.total || 0)}</div>
        </div>
        <div class="kv">
          <div><strong>Allocated:</strong></div>
          <div>${formatCurrency(reportData.budget?.allocated || 0)}</div>
        </div>
        <div class="kv">
          <div><strong>Used:</strong></div>
          <div>${formatCurrency(reportData.budget?.used || 0)}</div>
        </div>
        <div class="kv">
          <div><strong>Remaining:</strong></div>
          <div>${formatCurrency(reportData.budget?.remaining || 0)}</div>
        </div>
        <hr>
        <h4>Expenses Summary</h4>
        <div class="kv">
          <div><strong>Total Expenses:</strong></div>
          <div>${formatCurrency(reportData.expenses?.total || 0)}</div>
        </div>
        <div class="kv">
          <div><strong>Number of Expenses:</strong></div>
          <div>${reportData.expenses?.count || 0}</div>
        </div>
        ${Object.keys(reportData.expenses?.byCategory || {}).length > 0 ? `
          <h4>Expenses by Category</h4>
          ${Object.entries(reportData.expenses.byCategory).map(([cat, amt]) => `
            <div class="kv">
              <div><strong>${cat}:</strong></div>
              <div>${formatCurrency(amt)}</div>
            </div>
          `).join('')}
        ` : ''}
        <hr>
        <h4>Cash Assistance Summary</h4>
        <div class="kv">
          <div><strong>Total Assistance:</strong></div>
          <div>${formatCurrency(reportData.cashAssistance?.total || 0)}</div>
        </div>
        <div class="kv">
          <div><strong>Number of Recipients:</strong></div>
          <div>${reportData.cashAssistance?.count || 0}</div>
        </div>
        <hr>
        <div class="kv">
          <div><strong>Generated By:</strong></div>
          <div>${reportData.generatedBy || 'N/A'}</div>
        </div>
        <div class="kv">
          <div><strong>Generated At:</strong></div>
          <div>${formatDateTime(reportData.generatedAt)}</div>
        </div>
        <div style="margin-top: 20px; display: flex; gap: 10px;">
          <button class="btn btn-primary" onclick="downloadPDF('${reportId}')">Download PDF</button>
          <button class="btn btn-ghost" onclick="window.print()">Print</button>
        </div>
      `;
      
      document.getElementById('drawer').classList.add('active');
    }
  } catch (err) {
    console.error('View report error:', err);
    alert('Failed to load report');
  }
}

function downloadPDF(reportId) {
  window.open(`/api/financial/reports/pdf/${reportId}`, '_blank');
}

window.viewReport = viewReport;
window.downloadPDF = downloadPDF;