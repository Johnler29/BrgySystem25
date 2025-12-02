// public/health.js
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>p.querySelectorAll(s);
  
  // DOM element references - will be re-queried in init()
  let tableHead, tableBody, pager, modal, frm, msg, formContent, tabs;
  let drawer, dBody, dClose, dRecordId, dStatus;

  let user = null;
  let currentTab = 'patient-data';
  let isAdmin = false;

  // calendar state
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth(); // 0-based

  // Tab configurations
  const tabConfigs = {
    'patient-data': {
      title: 'Patient Data Records',
      headers: ['Coordinator', 'Program', 'Type', 'Location', 'Date & Time', 'Status'],
      apiEndpoint: '/api/health/patient-data'
    },
    'family-planning': {
      title: 'Family Planning Records', 
      headers: ['Name', 'Age', 'Address', 'Client Type', 'Method', 'Date'],
      apiEndpoint: '/api/health/family-planning'
    },
    'post-partum': {
      title: 'Post Partum Tracking',
      headers: ['Mother Name', 'Address', 'Age', 'Date/Time', 'Place', 'Gender', 'Tetanus'],
      apiEndpoint: '/api/health/post-partum'
    },
    'child-immunization': {
      title: 'Child Immunization Records',
      headers: ['Child Name', 'Birthday', 'Age', 'BCG', 'Hep B', 'Pentavalent', 'OPV', 'MMR'],
      apiEndpoint: '/api/health/child-immunization'
    },
    'individual-treatment': {
      title: 'Individual Treatment Records',
      headers: ['Name', 'Date', 'Age', 'Address', 'Chief Complaint', 'Status'],
      apiEndpoint: '/api/health/individual-treatment'
    },
    'patient-data-record': {
      title: 'Patient Data Records',
      headers: ['Patient Name', 'Age', 'Gender', 'Barangay', 'Contact', 'Status'],
      apiEndpoint: '/api/health/patient-records'
    },
    'pregnancy-tracking': {
      title: 'Pregnancy Tracking Master Listing',
      headers: ['Name', 'Address', 'Age', 'LMP', 'EDD', 'Prenatal', 'Health Facility'],
      apiEndpoint: '/api/health/pregnancy-tracking'
    },
    'pre-natal': {
      title: 'Pre-Natal Visits',
      headers: ['Patient Name', 'Age', 'Address', 'Visit Date', 'Trimester', 'Midwife', 'BP'],
      apiEndpoint: '/api/health/prenatal'
    },
    'medicine-list': {
      title: 'Medicine Inventory',
      headers: ['Medicine', 'Category', 'Stock', 'Min', 'Max', 'Status'],
      apiEndpoint: '/api/health/medicines'
    },
    'midwives': {
      title: 'Kumadronas / Midwives',
      headers: ['Name', 'Contact', 'Details'],
      apiEndpoint: '/api/health/midwives'
    },
    'schedules': {
      title: 'Health Schedules',
      headers: ['Type', 'Resident', 'Preferred Date', 'Time', 'Status'],
      apiEndpoint: '/api/health/schedules'
    }
  };

  let state = { 
    page: 1, 
    limit: 10, 
    status: '', 
    q: '', 
    from: '', 
    to: '', 
    sort: 'desc' 
  };

  const badge = s => {
    const map = {
      'Active': 'bg-active',
      'Completed': 'bg-completed',
      'Scheduled': 'bg-scheduled',
      'Pending': 'bg-pending',
      'Ongoing': 'bg-ongoing',
      'Due': 'bg-due',
      'Overdue': 'bg-overdue',
      'Resolved': 'bg-resolved',
      'Administered': 'bg-administered'
    };
    const cls = map[s] || 'bg-pending';
    return `<span class="badge ${cls}" style="padding: 4px 8px; border-radius: 14px; font-size: 12px; font-weight: 700; display: inline-block;">${s}</span>`;
  };
  const fmt = d => d ? new Date(d).toLocaleString() : '';

  // User authentication with role checking
  async function initUser(){
    try{
      const res = await fetch('/api/me'); 
      const j = await res.json();
      user = j.user || null;
      if(!user){ location.href='/login'; return; }
      
      isAdmin = user.role === 'admin' || user.role === 'Admin';
      
      $('#username').textContent = user.name || 'User';
      $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
      
      if (!isAdmin) {
        const roleIndicator = document.createElement('small');
        roleIndicator.textContent = ' (User)';
        roleIndicator.style.color = '#7f8c8d';
        $('#username').appendChild(roleIndicator);
      }
      
    }catch{ location.href='/login'; }
  }

  async function logout(){ 
    await fetch('/api/logout',{method:'POST'}); 
    location.href='/login'; 
  }
  window.logout = logout;

  // Summary statistics
  function setSummary(sum){
    const sTotalEl = $('#sTotal');
    const sActiveEl = $('#sActive');
    const sScheduledEl = $('#sScheduled');
    const sCompletedEl = $('#sCompleted');
    const sOverdueEl = $('#sOverdue');
    
    if (sTotalEl) {
      sTotalEl.textContent = sum.Total || 0;
    } else {
      console.warn('sTotal element not found');
    }
    if (sActiveEl) sActiveEl.textContent = sum.Active || 0;
    if (sScheduledEl) sScheduledEl.textContent = sum.Scheduled || 0;
    if (sCompletedEl) sCompletedEl.textContent = sum.Completed || 0;
    if (sOverdueEl) sOverdueEl.textContent = sum.Overdue || 0;
    
    console.log('Summary updated:', sum);
  }

  let summaryLoading = false;
  async function refreshSummary(){
    // Prevent multiple simultaneous calls
    if (summaryLoading) return;
    summaryLoading = true;
    
    try{
      const response = await fetch('/api/health/summary', {
        credentials: 'include'
      });
      const j = await response.json();
      if (j.ok) setSummary(j.summary || {});
    }catch(e){
      console.warn('Summary refresh error:', e);
    } finally {
      summaryLoading = false;
    }
  }

  // Tab switching
  function switchTab(tabName) {
    currentTab = tabName;
    
    // Reset loading state when switching tabs
    isLoading = false;
    
    $$('.health-tab').forEach(t => {
      t.classList.remove('active');
    });
    const activeTab = $(`.health-tab[data-tab="${tabName}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }
    
    const config = tabConfigs[tabName];
    if (config) {
      if (tableHead) {
        tableHead.innerHTML = `<tr>${config.headers.map(h => `<th>${h}</th>`).join('')}<th>Actions</th></tr>`;
      }
      const dlgTitle = $('#dlgTitle');
      if (dlgTitle) dlgTitle.textContent = `Add ${config.title}`;
      state.page = 1;
      load();
      updateFormContent();
    }
  }

  // Data loading with role-based filtering
  let isLoading = false;
  async function load(){
    // Prevent multiple simultaneous loads
    if (isLoading) {
      console.log('Load already in progress, skipping...');
      return;
    }
    
    const config = tabConfigs[currentTab];
    if (!config) return;

    isLoading = true;
    
    // Show loading skeleton
    showLoading();

    const params = {
      page: state.page, 
      limit: state.limit, 
      status: state.status,
      q: state.q, 
      from: state.from, 
      to: state.to, 
      sort: state.sort
    };
    
    if (!isAdmin && user) {
      params.userId = user._id || user.id;
    }

    const qs = new URLSearchParams(params).toString();

    try {
      // Add small delay for smooth transition (only if data loads too fast)
      const [response] = await Promise.all([
        fetch(`${config.apiEndpoint}?${qs}`, {
          credentials: 'include' // Ensure session cookies are sent
        }),
        new Promise(resolve => setTimeout(resolve, 150)) // Minimum 150ms for smooth transition
      ]);
      
      // Check HTTP status first
      if (!response.ok) {
        console.error(`HTTP ${response.status} error from`, config.apiEndpoint);
        const text = await response.text().catch(() => 'Unable to read response');
        console.error('Response:', text.substring(0, 200));
        const tableWrap = tableBody?.closest('.health-table-wrap');
        if (tableWrap) {
          tableWrap.classList.remove('table-loading');
        }
        renderRows([]);
        renderPager(1, 1, 0);
        isLoading = false;
        refreshSummary();
        return;
      }
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.error('Non-JSON response from', config.apiEndpoint);
        const text = await response.text();
        console.error('Response:', text.substring(0, 200));
        const tableWrap = tableBody?.closest('.health-table-wrap');
        if (tableWrap) {
          tableWrap.classList.remove('table-loading');
        }
        renderRows([]);
        renderPager(1, 1, 0);
        isLoading = false;
        refreshSummary();
        return;
      }
      
      const j = await response.json();
      
      if (j.ok && j.rows !== undefined) {
        // Log for debugging
        console.log(`[${currentTab}] Loaded ${j.rows.length} rows (total: ${j.total})`);
        // Render the data
        renderRows(j.rows || []);
        renderPager(j.page || 1, j.totalPages || 1, j.total || 0);
        isLoading = false;
      } else {
        // If API returns error, show empty table instead of sample data
        console.warn('API returned error:', j.message || 'Unknown error', j);
        const tableWrap = tableBody?.closest('.health-table-wrap');
        if (tableWrap) {
          tableWrap.classList.remove('table-loading');
        }
        renderRows([]);
        renderPager(1, 1, 0);
        isLoading = false;
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Remove loading class on error
      const tableWrap = tableBody?.closest('.health-table-wrap');
      if (tableWrap) {
        tableWrap.classList.remove('table-loading');
      }
      // Show empty table on error instead of sample data
      renderRows([]);
      renderPager(1, 1, 0);
      isLoading = false;
    }

    // Refresh summary after a short delay to avoid race conditions
    setTimeout(() => {
      refreshSummary();
    }, 100);
  }

  // Show loading skeleton
  function showLoading() {
    if (!tableBody || !tableHead) return;
    const config = tabConfigs[currentTab];
    if (!config) return;
    
    const colCount = config.headers.length + 1; // +1 for Actions column
    tableBody.innerHTML = '';
    
    // Add loading class to table wrapper
    const tableWrap = tableBody.closest('.health-table-wrap');
    if (tableWrap) {
      tableWrap.classList.add('table-loading');
    }
    
    // Create 5 skeleton rows
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement('tr');
      tr.className = 'table-skeleton';
      let skeletonCells = '';
      
      for (let j = 0; j < colCount; j++) {
        const width = j === 0 ? 'short' : j === colCount - 1 ? 'short' : 'long';
        skeletonCells += `<td><div class="skeleton-bar ${width}"></div></td>`;
      }
      
      tr.innerHTML = skeletonCells;
      tableBody.appendChild(tr);
    }
  }

  // Sample data with user filtering
  function showSampleData() {
    // Remove loading class
    const tableWrap = tableBody?.closest('.health-table-wrap');
    if (tableWrap) {
      tableWrap.classList.remove('table-loading');
    }
    
    const sampleData = getSampleDataForTab(currentTab);
    
    let filteredRows = sampleData.rows;
    if (!isAdmin && user) {
      const userSpecificRecords = sampleData.rows.slice(0, Math.ceil(sampleData.rows.length / 3));
      filteredRows = userSpecificRecords.map(record => ({
        ...record,
        createdBy: user._id || user.id,
        addedBy: user.name || user.username
      }));
    }
    
    renderRows(filteredRows);
    renderPager(1, 1, filteredRows.length);
  }

  function getSampleDataForTab(tab) {
    const samples = {
      'patient-data': {
        rows: [
          { _id: '1', coordinator: 'Nurse Ana Cruz', program: 'Newborn Screening', type: 'Patient Data', location: 'Barangay Health Center', createdAt: new Date(), status: 'Completed' },
          { _id: '2', coordinator: 'Midwife Karen', program: 'Monthly Check-up Day', type: 'Patient Data', location: 'Health Center Annex A', createdAt: new Date(), status: 'Ongoing' },
          { _id: '3', coordinator: 'Dr. Jose Ramirez', program: 'Senior Citizen Assessment', type: 'Patient Data', location: 'Barangay Hall', createdAt: new Date(), status: 'Pending' }
        ]
      },
      'family-planning': {
        rows: [
          { _id: '1', lastName: 'Cruz', givenName: 'Ana', age: 29, address: 'Cityhomes', clientType: 'Current User', fpMethod: 'Injectable', dateOfBirth: '1995-01-15' },
          { _id: '2', lastName: 'Dela Peña', givenName: 'Karen', age: 24, address: 'Greenbreeze', clientType: 'New Acceptor', fpMethod: 'Pills', dateOfBirth: '2000-03-20' },
          { _id: '3', lastName: 'Ramirez', givenName: 'Maria', age: 32, address: 'Cityhomes', clientType: 'Changing Method', fpMethod: 'IUD', dateOfBirth: '1992-07-10' }
        ]
      },
      'post-partum': {
        rows: [
          { _id: '1', motherName: 'Ana Cruz', address: 'Cityhomes', ageOfMother: 29, deliveryDateTime: new Date(), placeOfDelivery: 'Barangay Health Center', gender: 'F', tetanusStatus: 'BCG' },
          { _id: '2', motherName: 'Karen Dela Peña', address: 'Valle Verde', ageOfMother: 24, deliveryDateTime: new Date(), placeOfDelivery: 'Hospital', gender: 'M', tetanusStatus: 'Hep B' },
          { _id: '3', motherName: 'Maria Santos', address: 'Cityhomes', ageOfMother: 34, deliveryDateTime: new Date(), placeOfDelivery: 'Lying-in', gender: 'F', tetanusStatus: 'NBs' }
        ]
      },
      'child-immunization': {
        rows: [
          { _id: '1', childName: 'Juan Cruz', birthday: '2023-01-15', age: 24, bcgDate: '2023-01-15', hepBBirthDate: '2023-01-15', pentavalent1Date: '2023-03-15', opv1Date: '2023-03-15', mmr1Date: '2024-01-15' },
          { _id: '2', childName: 'Maria Dela Peña', birthday: '2023-05-20', age: 19, bcgDate: '2023-05-20', hepBBirthDate: '2023-05-20', pentavalent1Date: '2023-07-20', opv1Date: '2023-07-20', mmr1Date: null },
          { _id: '3', childName: 'Pedro Santos', birthday: '2022-10-10', age: 27, bcgDate: '2022-10-10', hepBBirthDate: '2022-10-10', pentavalent1Date: '2022-12-10', opv1Date: '2022-12-10', mmr1Date: '2023-10-10' }
        ]
      },
      'individual-treatment': {
        rows: [
          { _id: '1', patientName: 'Ana Cruz', consultationDate: new Date(), age: 29, address: 'Cityhomes', historyOfIllness: 'Fever and cough', status: 'Active' },
          { _id: '2', patientName: 'Karen Dela Peña', consultationDate: new Date(), age: 24, address: 'Greenbreeze', historyOfIllness: 'Hypertension follow-up', status: 'Completed' },
          { _id: '3', patientName: 'Jose Ramirez', consultationDate: new Date(), age: 45, address: 'Cityhomes', historyOfIllness: 'Diabetes checkup', status: 'Follow-up Required' }
        ]
      },
      'patient-data-record': {
        rows: [
          { _id: '1', surname: 'Cruz', givenName: 'Ana', middleName: 'Santos', age: 29, gender: 'FEMALE', barangay: 'Langkaan II', contactNumber: '09123456789', status: 'Active' },
          { _id: '2', surname: 'Dela Peña', givenName: 'Karen', middleName: 'Lopez', age: 24, gender: 'FEMALE', barangay: 'Langkaan II', contactNumber: '09987654321', status: 'Active' },
          { _id: '3', surname: 'Mercado', givenName: 'Liza', middleName: 'Garcia', age: 34, gender: 'FEMALE', barangay: 'Langkaan II', contactNumber: '09456789123', status: 'Active' }
        ]
      },
      'pregnancy-tracking': {
        rows: [
          { _id: '1', name: 'Ana Cruz', completeAddress: 'Cityhomes, Langkaan II', age: 23, lmp: '2024-08-01', edd: '2025-05-08', prenatalConsultation: 'Regular', healthFacility: 'Center' },
          { _id: '2', name: 'Karen Dela Peña', completeAddress: 'Greenbreeze, Langkaan II', age: 31, lmp: '2024-07-15', edd: '2025-04-22', prenatalConsultation: '2nd Trimester', healthFacility: 'Annex A' },
          { _id: '3', name: 'Liza Mercado', completeAddress: 'Valle Verde, Langkaan II', age: 34, lmp: '2024-09-10', edd: '2025-06-17', prenatalConsultation: '1st Trimester', healthFacility: 'Center' }
        ]
      }
    };
    return samples[tab] || { rows: [] };
  }

  function renderRows(rows){
    if (!tableBody) return;
    
    // Remove loading class
    const tableWrap = tableBody.closest('.health-table-wrap');
    if (tableWrap) {
      tableWrap.classList.remove('table-loading');
    }
    
    // Clear existing rows with fade out
    tableBody.style.opacity = '0';
    tableBody.style.transition = 'opacity 0.2s ease';
    
    // Use requestAnimationFrame for smooth transition
    requestAnimationFrame(() => {
      tableBody.innerHTML = '';
      
      // If no rows, show empty message
      if (!rows || rows.length === 0) {
        const tr = document.createElement('tr');
        const colCount = tableHead ? tableHead.querySelectorAll('th').length : 1;
        tr.innerHTML = `<td colspan="${colCount}" style="text-align: center; padding: 40px 20px; color: var(--muted);">No records found.</td>`;
        tableBody.appendChild(tr);
        tableBody.style.opacity = '1';
        return;
      }
      
      rows.forEach((r, index) => {
        const tr = document.createElement('tr');
        let cells = '';
        
        switch(currentTab) {
          case 'patient-data':
            cells = `
              <td>${r.coordinator || 'N/A'}</td>
              <td>${r.program || 'N/A'}</td>
              <td>${r.type || 'N/A'}</td>
              <td>${r.location || 'N/A'}</td>
              <td>${fmt(r.createdAt)}</td>
              <td>${badge(r.status || 'Pending')}</td>
            `;
            break;
          case 'family-planning':
            cells = `
              <td>${r.lastName && r.givenName ? r.lastName + ', ' + r.givenName : 'N/A'}</td>
              <td>${r.age || 'N/A'}</td>
              <td>${r.address || 'N/A'}</td>
              <td>${r.clientType || 'N/A'}</td>
              <td>${r.fpMethod || 'N/A'}</td>
              <td>${r.dateOfBirth ? new Date(r.dateOfBirth).toLocaleDateString() : 'N/A'}</td>
            `;
            break;
          case 'post-partum':
            cells = `
              <td>${r.motherName || 'N/A'}</td>
              <td>${r.address || 'N/A'}</td>
              <td>${r.ageOfMother || 'N/A'}</td>
              <td>${fmt(r.deliveryDateTime)}</td>
              <td>${r.placeOfDelivery || 'N/A'}</td>
              <td>${r.gender || 'N/A'}</td>
              <td>${badge(r.tetanusStatus || 'Pending')}</td>
            `;
            break;
          case 'child-immunization':
            cells = `
              <td>${r.childName || 'N/A'}</td>
              <td>${r.birthday ? new Date(r.birthday).toLocaleDateString() : 'N/A'}</td>
              <td>${r.age || 'N/A'}</td>
              <td>${r.bcgDate ? '✓' : '—'}</td>
              <td>${r.hepBBirthDate ? '✓' : '—'}</td>
              <td>${r.pentavalent1Date ? '✓' : '—'}</td>
              <td>${r.opv1Date ? '✓' : '—'}</td>
              <td>${r.mmr1Date ? '✓' : '—'}</td>
            `;
            break;
          case 'individual-treatment':
            cells = `
              <td>${r.patientName || 'N/A'}</td>
              <td>${fmt(r.consultationDate)}</td>
              <td>${r.age || 'N/A'}</td>
              <td>${r.address || 'N/A'}</td>
              <td>${r.historyOfIllness || 'N/A'}</td>
              <td>${badge(r.status || 'Pending')}</td>
            `;
            break;
          case 'patient-data-record':
            cells = `
              <td>${(r.surname && r.givenName) ? (r.surname + ', ' + r.givenName + ' ' + (r.middleName || '')).trim() : 'N/A'}</td>
              <td>${r.age || 'N/A'}</td>
              <td>${r.gender || 'N/A'}</td>
              <td>${r.barangay || 'N/A'}</td>
              <td>${r.contactNumber || 'N/A'}</td>
              <td>${badge(r.status || 'Pending')}</td>
            `;
            break;
          case 'pregnancy-tracking':
            cells = `
              <td>${r.name || 'N/A'}</td>
              <td>${r.completeAddress || 'N/A'}</td>
              <td>${r.age || 'N/A'}</td>
              <td>${r.lmp ? new Date(r.lmp).toLocaleDateString() : 'N/A'}</td>
              <td>${r.edd ? new Date(r.edd).toLocaleDateString() : 'N/A'}</td>
              <td>${r.prenatalConsultation || 'N/A'}</td>
              <td>${r.healthFacility || 'N/A'}</td>
            `;
            break;
          case 'pre-natal':
            cells = `
              <td>${r.patientName || 'N/A'}</td>
              <td>${r.age || 'N/A'}</td>
              <td>${r.address || 'N/A'}</td>
              <td>${r.visitDate ? new Date(r.visitDate).toLocaleString() : 'N/A'}</td>
              <td>${r.trimester || 'N/A'}</td>
              <td>${r.midwifeName || 'N/A'}</td>
              <td>${r.bloodPressure || 'N/A'}</td>
            `;
            break;
          case 'medicine-list':
            cells = `
              <td>${r.name || 'N/A'}</td>
              <td>${r.category || 'N/A'}</td>
              <td>${typeof r.stock === 'number' ? r.stock : '0'}</td>
              <td>${typeof r.minStock === 'number' ? r.minStock : '0'}</td>
              <td>${typeof r.maxStock === 'number' ? r.maxStock : '0'}</td>
              <td>${badge(r.status || 'Active')}</td>
            `;
            break;
          case 'midwives':
            cells = `
              <td>${r.name || 'N/A'}</td>
              <td>${r.contactNumber || 'N/A'}</td>
              <td>${r.details || 'N/A'}</td>
            `;
            break;
          case 'schedules':
            const typeMap = {
              'prenatal': { icon: '🤰', label: 'Pre-natal', color: '#8e44ad' },
              'infant': { icon: '👶', label: 'Infant', color: '#e67e22' },
              'health': { icon: '🏥', label: 'Health', color: '#27ae60' },
              'general': { icon: '👤', label: 'General', color: '#2980b9' }
            };
            const typeInfo = typeMap[(r.type || '').toLowerCase()] || { icon: '📋', label: (r.type || '').toString(), color: '#7f8c8d' };
            const formatDate = (date) => {
              if (!date) return 'N/A';
              const d = new Date(date);
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            };
            const formatTime = (date) => {
              if (!date) return 'N/A';
              const d = new Date(date);
              return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            };
            cells = `
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 1.2rem;">${typeInfo.icon}</span>
                  <span style="font-weight: 600; color: ${typeInfo.color}; text-transform: capitalize;">${typeInfo.label}</span>
                </div>
              </td>
              <td style="font-weight: 500;">${r.residentName || 'N/A'}</td>
              <td>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <span style="font-weight: 600; color: #2c3e50;">${formatDate(r.preferredDate)}</span>
                  <span style="font-size: 0.85rem; color: #7f8c8d;">${formatTime(r.preferredDate)}</span>
                </div>
              </td>
              <td style="font-weight: 500; color: #3498db;">${r.preferredTime || 'N/A'}</td>
              <td>${badge(r.status || 'Pending')}</td>
            `;
            break;
          default:
            cells = '<td colspan="7">No data</td>';
        }
        
        tr.innerHTML = `
          ${cells}
          <td class="t-actions">
            <div class="table-actions">
              <button class="table-action-btn view" data-act="view" data-id="${r._id}">
                <i class="fas fa-eye"></i>
                <span>View</span>
              </button>
              ${isAdmin || (user && r.createdBy === (user._id || user.id)) ? '<button class="table-action-btn edit" data-act="edit" data-id="' + r._id + '"><i class="fas fa-edit"></i><span>Edit</span></button>' : ''}
              ${isAdmin || (user && r.createdBy === (user._id || user.id)) ? '<button class="table-action-btn delete" data-act="del" data-id="' + r._id + '"><i class="fas fa-trash"></i><span>Delete</span></button>' : ''}
            </div>
          </td>
        `;
        tableBody.appendChild(tr);
      });
      
      // Fade in the new content smoothly
      requestAnimationFrame(() => {
        tableBody.style.opacity = '1';
      });
    });
  }

  function renderPager(page, totalPages, total){
    if (!pager) return;
    pager.innerHTML = '';
    const info = document.createElement('div');
    info.className = 'mr-auto text-sm text-[#2c3e50]';
    info.textContent = `Total: ${total}`;
    pager.appendChild(info);

    const mk = (t, cb, dis = false) => { 
      const b = document.createElement('button'); 
      b.className = 'px-2.5 py-1.5 rounded-lg border border-input bg-white text-primary-btn font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm'; 
      b.textContent = t; 
      b.disabled = dis; 
      b.onclick = cb; 
      pager.appendChild(b); 
    };
    
    mk('Prev', () => { if(state.page > 1){ state.page--; load(); }}, page <= 1);
    
    for(let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++){
      const b = document.createElement('button'); 
      b.className = `px-2.5 py-1.5 rounded-lg border text-sm font-medium hover:opacity-90 transition-opacity ${i === page ? 'bg-success-btn text-white border-success-btn' : 'border-input bg-white text-primary-btn'}`;
      b.textContent = i;
      b.onclick = () => { state.page = i; load(); };
      pager.appendChild(b);
    }
    
    mk('Next', () => { if(state.page < totalPages){ state.page++; load(); }}, page >= totalPages);
  }

  // Form content generation
  function updateFormContent() {
    if (!formContent) return;
    formContent.innerHTML = getFormHTML(currentTab);

    // Setup resident search after form content is updated
    setTimeout(() => setupResidentSearch(), 50);

    // special wiring per tab
    if (currentTab === 'post-partum') {
      wirePostPartumLogic();
    }
  }

  function getFormHTML(tab) {
    // Form HTML content continues in next message due to length
    const forms = {
      'patient-data': getPatientDataForm(),
      'family-planning': getFamilyPlanningForm(),
      'post-partum': getPostPartumForm(),
      'child-immunization': getChildImmunizationForm(),
      'individual-treatment': getIndividualTreatmentForm(),
      'patient-data-record': getPatientDataRecordForm(),
      'pregnancy-tracking': getPregnancyTrackingForm(),
      'pre-natal': getPreNatalForm(),
      'medicine-list': getMedicineListForm(),
      'midwives': getMidwivesForm(),
      'schedules': getSchedulesForm()
    };
    return forms[tab] || '<p>Form not available</p>';
  }

  // Setup event listeners - called from init()
  function setupEventListeners() {
    // Remove old event listeners by cloning elements (for tabs)
    if (tabs && tabs.parentNode) {
      const newTabs = tabs.cloneNode(true);
      tabs.parentNode.replaceChild(newTabs, tabs);
      tabs = newTabs;
      
      tabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.health-tab');
        if (!tab) return;
        const tabName = tab.getAttribute('data-tab');
        if (tabName) switchTab(tabName);
      });
    }

    // Filter button
    const btnFilter = $('#btnFilter');
    if (btnFilter) {
      btnFilter.onclick = () => {
        state.from = $('#fFrom')?.value || '';
        state.to = $('#fTo')?.value || '';
        state.q = $('#fQ')?.value.trim() || '';
        state.status = $('#fStatus')?.value || '';
        state.page = 1;
        load();
      };
    }

    // Export button
    const btnExport = $('#btnExport');
    if (btnExport) {
      btnExport.onclick = () => {
        const config = tabConfigs[currentTab];
        const qs = new URLSearchParams({ ...state, exportCsv: 'true' }).toString();
        window.location = config.apiEndpoint + '?' + qs;
      };
    }

    // Add button
    const btnAdd = $('#btnAdd');
    if (btnAdd) {
      btnAdd.onclick = () => {
        if (!modal) {
          console.error('Modal element not found');
          return;
        }
        if (!frm) {
          console.error('Form element not found');
          return;
        }
        
        frm.reset();
        delete frm.dataset.editId;
        if (msg) msg.textContent = '';
        const config = tabConfigs[currentTab];
        if (config) {
          const dlgTitle = $('#dlgTitle');
          if (dlgTitle) dlgTitle.textContent = 'Add ' + config.title;
        }
        updateFormContent();
        modal.classList.add('open');
        console.log('Modal opened for tab:', currentTab);
        // Setup resident search after form is loaded
        setTimeout(() => setupResidentSearch(), 100);
      };
    }

    // Cancel button
    const btnCancel = $('#btnCancel');
    if (btnCancel) {
      btnCancel.onclick = () => {
        if (modal) modal.classList.remove('open');
      };
    }

    // Save button
    const btnSave = $('#btnSave');
    if (btnSave) {
      btnSave.onclick = async () => {
    if (!user) {
      alert('User not authenticated. Please refresh the page.');
      return;
    }
    
    const formData = new FormData(frm);
    const body = Object.fromEntries(formData.entries());
    
    body.createdBy = user._id || user.id;
    body.addedBy = user.name || user.username;
    
    if (!frm) {
      if (msg) msg.textContent = 'Form not found.';
      return;
    }
    
    const requiredFields = $$('input[required], select[required], textarea[required]', frm);
    let hasError = false;
    
    requiredFields.forEach(field => {
      if (!body[field.name] || body[field.name].trim() === '') {
        hasError = true;
        field.style.borderColor = '#e74c3c';
      } else {
        field.style.borderColor = '#dfe6e9';
      }
    });
    
    if (hasError) {
      if (msg) msg.textContent = 'Please fill all required fields.';
      return;
    }

    try {
      const config = tabConfigs[currentTab];
      if (!config || !config.apiEndpoint) {
        msg.textContent = 'Error: No API endpoint configured for this tab.';
        console.error('No API endpoint for tab:', currentTab);
        return;
      }
      
      // Check if editing (for schedules, use PUT)
      const editId = frm.dataset.editId;
      const isEdit = !!editId;
      const method = (isEdit && currentTab === 'schedules') ? 'PUT' : 'POST';
      const url = (isEdit && currentTab === 'schedules') ? `${config.apiEndpoint}/${editId}` : config.apiEndpoint;
      
      console.log(`${isEdit ? 'Updating' : 'Creating'} record:`, url, body);
      
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', response.status, errorText);
        msg.textContent = `Error ${response.status}: ${errorText.substring(0, 100)}`;
        return;
      }
      
      const result = await response.json();
      console.log('Save response:', result);
      
      if (result.ok) {
        if (modal) modal.classList.remove('open');
        if (frm) {
          frm.reset();
          delete frm.dataset.editId;
        }
        load();
        refreshSummary();
        if (msg) msg.textContent = '';
      } else {
        if (msg) msg.textContent = result.message || 'Failed to save record.';
      }
    } catch (error) {
      console.error('Save error:', error);
      if (msg) msg.textContent = 'Error saving record: ' + error.message;
    }
      };
    }

    // Table actions with role-based permissions
    if (tableBody && tableBody.parentNode) {
      // Remove old listener by cloning
      const newTableBody = tableBody.cloneNode(true);
      tableBody.parentNode.replaceChild(newTableBody, tableBody);
      tableBody = newTableBody;
      
      tableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');

    if (act === 'view') {
      // Fetch record from API
      try {
        const config = tabConfigs[currentTab];
        if (!config || !config.apiEndpoint) {
          alert('Cannot view: No API endpoint configured.');
          return;
        }
        
        const response = await fetch(`${config.apiEndpoint}/${id}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          alert('Failed to load record.');
          return;
        }
        
        const result = await response.json();
        if (!result.ok || !result.row) {
          alert('Record not found.');
          return;
        }
        
        showRecordDetails(result.row);
      } catch (error) {
        console.error('View error:', error);
        alert('Error loading record: ' + error.message);
      }
    }

    if (act === 'edit') {
      if (!isAdmin && user) {
        const record = getSampleDataForTab(currentTab).rows.find(r => r._id === id);
        if (record && record.createdBy !== (user._id || user.id)) {
          alert('You can only edit records that you created.');
          return;
        }
      }
      
      // Load record for editing
      try {
        const config = tabConfigs[currentTab];
        if (!config || !config.apiEndpoint) {
          alert('Cannot edit: No API endpoint configured.');
          return;
        }
        
        const response = await fetch(`${config.apiEndpoint}/${id}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          alert('Failed to load record for editing.');
          return;
        }
        
        const result = await response.json();
        if (!result.ok || !result.row) {
          alert('Record not found.');
          return;
        }
        
        const record = result.row;
        
        // Store record ID for update BEFORE updating form content
        frm.dataset.editId = id;
        $('#dlgTitle').textContent = 'Edit ' + (config.title || 'Record');
        
        // First, update form content to generate the form HTML
        updateFormContent();
        
        // Then populate form with record data AFTER form is generated
        // Use setTimeout to ensure DOM is updated
        setTimeout(() => {
          frm.reset();
          
          // Field name mapping for cases where DB field names differ from form field names
          const fieldNameMap = {
            'dateTime': 'datetime', // patient-data uses 'datetime' in form but 'dateTime' in DB
            'method': 'fpMethod' // some records might use 'method' instead of 'fpMethod'
          };
          
          Object.keys(record).forEach(key => {
            // Check if there's a mapped field name
            const formFieldName = fieldNameMap[key] || key;
            let field = frm.querySelector(`[name="${formFieldName}"]`);
            
            // If not found, try the original key
            if (!field) {
              field = frm.querySelector(`[name="${key}"]`);
            }
            
            if (field) {
              if (field.type === 'date') {
                const dateValue = record[key];
                if (dateValue) {
                  const d = new Date(dateValue);
                  if (!isNaN(d.getTime())) {
                    field.value = d.toISOString().split('T')[0];
                  }
                }
              } else if (field.type === 'datetime-local') {
                const dateValue = record[key];
                if (dateValue) {
                  const d = new Date(dateValue);
                  if (!isNaN(d.getTime())) {
                    // Format for datetime-local: YYYY-MM-DDTHH:mm
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const hours = String(d.getHours()).padStart(2, '0');
                    const minutes = String(d.getMinutes()).padStart(2, '0');
                    field.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                  }
                }
              } else if (field.type === 'time') {
                const dateValue = record[key];
                if (dateValue) {
                  const d = new Date(dateValue);
                  if (!isNaN(d.getTime())) {
                    field.value = d.toTimeString().slice(0, 5);
                  }
                } else if (typeof record[key] === 'string' && record[key].includes(':')) {
                  field.value = record[key];
                }
              } else if (field.tagName === 'SELECT') {
                // For select dropdowns
                const value = String(record[key] || '').trim();
                field.value = value;
                // If value doesn't match, try to find by text
                if (!field.value && value) {
                  const options = Array.from(field.options);
                  const match = options.find(opt => 
                    opt.text.toLowerCase().includes(value.toLowerCase()) ||
                    opt.value.toLowerCase() === value.toLowerCase()
                  );
                  if (match) field.value = match.value;
                }
              } else if (field.type === 'checkbox') {
                field.checked = !!record[key];
              } else if (field.type === 'radio') {
                const radioGroup = frm.querySelectorAll(`[name="${formFieldName}"]`);
                radioGroup.forEach(radio => {
                  radio.checked = radio.value === String(record[key]);
                });
              } else {
                field.value = record[key] || '';
              }
            } else {
              // Debug: log fields that weren't found
              console.log(`Field not found: ${key} (tried ${formFieldName})`);
            }
          });
          
          console.log('Form populated with record:', record);
        }, 100); // Small delay to ensure DOM is ready
        
        modal.classList.add('open');
      } catch (error) {
        console.error('Edit error:', error);
        alert('Error loading record: ' + error.message);
      }
    }

    if (act === 'del') {
      if (!isAdmin && user) {
        // Check permission by fetching the record first
        try {
          const config = tabConfigs[currentTab];
          if (!config || !config.apiEndpoint) {
            alert('Cannot delete: No API endpoint configured.');
            return;
          }
          
          const response = await fetch(`${config.apiEndpoint}/${id}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.ok && result.row) {
              const record = result.row;
              if (record.createdBy !== (user._id || user.id)) {
                alert('You can only delete records that you created.');
                return;
              }
            }
          }
        } catch (error) {
          console.error('Permission check error:', error);
        }
      }
      
      if (!confirm('Delete this health record? This action cannot be undone.')) return;
      
      // Delete record via API
      try {
        const config = tabConfigs[currentTab];
        if (!config || !config.apiEndpoint) {
          alert('Cannot delete: No API endpoint configured.');
          return;
        }
        
        const response = await fetch(`${config.apiEndpoint}/${id}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          alert(result.message || 'Failed to delete record.');
          return;
        }
        
        const result = await response.json();
        if (result.ok) {
          alert('Record deleted successfully.');
          load();
          refreshSummary();
        } else {
          alert(result.message || 'Failed to delete record.');
        }
      } catch (error) {
        console.error('Delete error:', error);
        alert('Error deleting record: ' + error.message);
      }
    }
      });
    }

    // Drawer close button - re-query to get fresh reference
    const currentDClose = document.getElementById('dClose');
    if (currentDClose) {
      const newDClose = currentDClose.cloneNode(true);
      currentDClose.parentNode.replaceChild(newDClose, currentDClose);
      newDClose.onclick = () => {
        const currentDrawer = document.getElementById('drawer');
        if (currentDrawer) {
          currentDrawer.classList.add('hidden');
          currentDrawer.style.removeProperty('pointer-events');
          currentDrawer.style.removeProperty('display');
          currentDrawer.style.removeProperty('z-index');
        }
      };
    }
    
    // Drawer backdrop - re-query to get fresh reference
    const currentDrawer = document.getElementById('drawer');
    if (currentDrawer) {
      const backdrop = currentDrawer.querySelector('.drawer-backdrop');
      if (backdrop) {
        const newBackdrop = backdrop.cloneNode(true);
        backdrop.parentNode.replaceChild(newBackdrop, backdrop);
        newBackdrop.onclick = () => {
          const drawerEl = document.getElementById('drawer');
          if (drawerEl) {
            drawerEl.classList.add('hidden');
            drawerEl.style.removeProperty('pointer-events');
            drawerEl.style.removeProperty('display');
            drawerEl.style.removeProperty('z-index');
          }
        };
      }
    }
  }

  function showRecordDetails(record) {
    // Re-query drawer elements to ensure fresh references
    const currentDrawer = document.getElementById('drawer');
    const currentDBody = document.getElementById('dBody');
    const currentDRecordId = document.getElementById('dRecordId');
    const currentDStatus = document.getElementById('dStatus');
    
    if (!currentDrawer || !currentDBody || !currentDRecordId || !currentDStatus) {
      console.error('Health page: Drawer elements not found', {
        drawer: !!currentDrawer,
        dBody: !!currentDBody,
        dRecordId: !!currentDRecordId,
        dStatus: !!currentDStatus
      });
      return;
    }
    
    const config = tabConfigs[currentTab];
    const title = config ? config.title : 'Health Record';
    currentDRecordId.textContent = title + ' #' + (record._id || 'N/A');
    
    const statusMap = {
      'Active': 'bg-active',
      'Completed': 'bg-completed',
      'Scheduled': 'bg-scheduled',
      'Pending': 'bg-pending',
      'Ongoing': 'bg-ongoing',
      'Due': 'bg-due',
      'Overdue': 'bg-overdue',
      'Resolved': 'bg-resolved',
      'Administered': 'bg-administered'
    };
    const status = record.status || 'Active';
    currentDStatus.className = 'badge ' + (statusMap[status] || 'bg-pending');
    currentDStatus.textContent = status;
    
    // Helper to escape HTML
    const escape = (str) => {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };
    
    // Helper to format dates
    const formatDate = (dateValue) => {
      if (!dateValue) return '-';
      try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return String(dateValue);
        return d.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
      } catch (e) {
        return String(dateValue);
      }
    };
    
    const formatDateTime = (dateValue) => {
      if (!dateValue) return '-';
      try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return String(dateValue);
        return d.toLocaleString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        return String(dateValue);
      }
    };

    // Build details HTML based on record type
    let detailsHTML = '';
    
    // Tab-specific fields - organized into sections
    if (currentTab === 'patient-data') {
      detailsHTML += `
        <div class="drawer-section">
          <h4>Program Information</h4>
          <div class="kv"><div>Coordinator</div><div><strong>${escape(record.coordinator || '-')}</strong></div></div>
          <div class="kv"><div>Program</div><div>${escape(record.program || '-')}</div></div>
          <div class="kv"><div>Type</div><div>${escape(record.type || '-')}</div></div>
          <div class="kv"><div>Location</div><div>${escape(record.location || '-')}</div></div>
          <div class="kv"><div>Date & Time</div><div>${escape(formatDateTime(record.dateTime))}</div></div>
        </div>
      `;
    } else if (currentTab === 'family-planning') {
      const name = record.lastName && record.givenName ? `${record.lastName}, ${record.givenName}` : (record.name || '-');
      detailsHTML += `
        <div class="drawer-section">
          <h4>Client Information</h4>
          <div class="kv"><div>Name</div><div><strong>${escape(name)}</strong></div></div>
          <div class="kv"><div>Age</div><div>${escape(record.age || '-')}</div></div>
          <div class="kv"><div>Address</div><div>${escape(record.address || '-')}</div></div>
          <div class="kv"><div>Client Type</div><div>${escape(record.clientType || '-')}</div></div>
          <div class="kv"><div>Method</div><div>${escape(record.fpMethod || record.method || '-')}</div></div>
          <div class="kv"><div>Date of Birth</div><div>${escape(formatDate(record.dateOfBirth))}</div></div>
        </div>
      `;
    } else if (currentTab === 'post-partum') {
      detailsHTML += `
        <div class="drawer-section">
          <h4>Mother Information</h4>
          <div class="kv"><div>Mother Name</div><div><strong>${escape(record.motherName || '-')}</strong></div></div>
          <div class="kv"><div>Address</div><div>${escape(record.address || '-')}</div></div>
          <div class="kv"><div>Age</div><div>${escape(record.ageOfMother || '-')}</div></div>
        </div>
        <div class="drawer-section">
          <h4>Delivery Information</h4>
          <div class="kv"><div>Delivery Date/Time</div><div>${escape(formatDateTime(record.deliveryDateTime))}</div></div>
          <div class="kv"><div>Place of Delivery</div><div>${escape(record.placeOfDelivery || '-')}</div></div>
          <div class="kv"><div>Gender</div><div>${escape(record.gender || '-')}</div></div>
          <div class="kv"><div>Tetanus Status</div><div>${escape(record.tetanusStatus || '-')}</div></div>
          ${record.details30Min ? `<div class="kv"><div>30-Min Details</div><div>${escape(record.details30Min)}</div></div>` : ''}
        </div>
      `;
    } else if (currentTab === 'child-immunization') {
      detailsHTML += `
        <div class="drawer-section">
          <h4>Child Information</h4>
          <div class="kv"><div>Child Name</div><div><strong>${escape(record.childName || '-')}</strong></div></div>
          <div class="kv"><div>Birthday</div><div>${escape(formatDate(record.birthday))}</div></div>
          <div class="kv"><div>Age</div><div>${escape(record.age || '-')}</div></div>
        </div>
        <div class="drawer-section">
          <h4>Immunization Records</h4>
          <div class="kv"><div>BCG</div><div>${escape(record.bcgDate ? formatDate(record.bcgDate) : 'Not administered')}</div></div>
          <div class="kv"><div>Hep B</div><div>${escape(record.hepBBirthDate ? formatDate(record.hepBBirthDate) : 'Not administered')}</div></div>
          <div class="kv"><div>Pentavalent</div><div>${escape(record.pentavalent1Date ? formatDate(record.pentavalent1Date) : 'Not administered')}</div></div>
          <div class="kv"><div>OPV</div><div>${escape(record.opv1Date ? formatDate(record.opv1Date) : 'Not administered')}</div></div>
          <div class="kv"><div>MMR</div><div>${escape(record.mmr1Date ? formatDate(record.mmr1Date) : 'Not administered')}</div></div>
        </div>
      `;
    } else if (currentTab === 'individual-treatment') {
      detailsHTML += `
        <div class="drawer-section">
          <h4>Patient Information</h4>
          <div class="kv"><div>Patient Name</div><div><strong>${escape(record.patientName || record.name || '-')}</strong></div></div>
          <div class="kv"><div>Age</div><div>${escape(record.age || '-')}</div></div>
          <div class="kv"><div>Address</div><div>${escape(record.address || '-')}</div></div>
          <div class="kv"><div>Consultation Date</div><div>${escape(formatDate(record.consultationDate || record.date))}</div></div>
        </div>
        <div class="drawer-section">
          <h4>Medical Information</h4>
          <div class="kv"><div>Chief Complaint</div><div>${escape(record.historyOfIllness || record.chiefComplaint || '-')}</div></div>
          <div class="kv"><div>Diagnosis</div><div>${escape(record.diagnosis || '-')}</div></div>
          <div class="kv"><div>Treatment</div><div>${escape(record.treatment || '-')}</div></div>
        </div>
      `;
    } else if (currentTab === 'patient-data-record') {
      const name = record.surname && record.givenName ? `${record.surname}, ${record.givenName} ${(record.middleName || '')}`.trim() : (record.name || '-');
      detailsHTML += `
        <div class="drawer-section">
          <h4>Patient Information</h4>
          <div class="kv"><div>Patient Name</div><div><strong>${escape(name)}</strong></div></div>
          <div class="kv"><div>Age</div><div>${escape(record.age || '-')}</div></div>
          <div class="kv"><div>Gender</div><div>${escape(record.gender || '-')}</div></div>
          <div class="kv"><div>Barangay</div><div>${escape(record.barangay || '-')}</div></div>
          <div class="kv"><div>Contact</div><div>${escape(record.contactNumber || '-')}</div></div>
          <div class="kv"><div>PhilHealth</div><div>${escape(record.philhealth || '-')}</div></div>
          <div class="kv"><div>Civil Status</div><div>${escape(record.civilStatus || '-')}</div></div>
          ${record.cvdStatus ? `<div class="kv"><div>CVD Status</div><div>${escape(record.cvdStatus)}</div></div>` : ''}
          ${record.ncdStatus ? `<div class="kv"><div>NCD Status</div><div>${escape(record.ncdStatus)}</div></div>` : ''}
        </div>
      `;
    } else if (currentTab === 'pregnancy-tracking') {
      detailsHTML += `
        <div class="drawer-section">
          <h4>Patient Information</h4>
          <div class="kv"><div>Name</div><div><strong>${escape(record.name || '-')}</strong></div></div>
          <div class="kv"><div>Address</div><div>${escape(record.completeAddress || record.address || '-')}</div></div>
          <div class="kv"><div>Age</div><div>${escape(record.age || '-')}</div></div>
        </div>
        <div class="drawer-section">
          <h4>Pregnancy Information</h4>
          <div class="kv"><div>LMP</div><div>${escape(formatDate(record.lmp))}</div></div>
          <div class="kv"><div>EDD</div><div>${escape(formatDate(record.edd))}</div></div>
          <div class="kv"><div>Prenatal Consultation</div><div>${escape(record.prenatalConsultation || '-')}</div></div>
          <div class="kv"><div>Health Facility</div><div>${escape(record.healthFacility || '-')}</div></div>
        </div>
      `;
    } else if (currentTab === 'pre-natal') {
      detailsHTML += `
        <div class="drawer-section">
          <h4>Patient Information</h4>
          <div class="kv"><div>Patient Name</div><div><strong>${escape(record.patientName || '-')}</strong></div></div>
          <div class="kv"><div>Age</div><div>${escape(record.age || '-')}</div></div>
          <div class="kv"><div>Address</div><div>${escape(record.address || '-')}</div></div>
        </div>
        <div class="drawer-section">
          <h4>Visit Information</h4>
          <div class="kv"><div>Visit Date</div><div>${escape(formatDate(record.visitDate))}</div></div>
          <div class="kv"><div>Trimester</div><div>${escape(record.trimester || '-')}</div></div>
          <div class="kv"><div>Midwife</div><div>${escape(record.midwifeName || '-')}</div></div>
          <div class="kv"><div>Blood Pressure</div><div>${escape(record.bloodPressure || '-')}</div></div>
        </div>
      `;
    } else if (currentTab === 'schedules') {
      const typeMap = {
        'prenatal': { icon: '🤰', label: 'Pre-natal' },
        'infant': { icon: '👶', label: 'Infant' },
        'health': { icon: '🏥', label: 'Health' },
        'general': { icon: '👤', label: 'General' }
      };
      const typeInfo = typeMap[(record.type || '').toLowerCase()] || { icon: '📋', label: record.type || 'N/A' };
      detailsHTML += `
        <div class="drawer-section">
          <h4>Schedule Information</h4>
          <div class="kv"><div>Type</div><div><strong>${typeInfo.icon} ${escape(typeInfo.label)}</strong></div></div>
          <div class="kv"><div>Preferred Date</div><div>${escape(formatDate(record.preferredDate))}</div></div>
          <div class="kv"><div>Preferred Time</div><div>${escape(record.preferredTime || '-')}</div></div>
          <div class="kv"><div>Notes</div><div>${escape(record.notes || '-')}</div></div>
          ${record.midwifeName ? `<div class="kv"><div>Assigned Midwife</div><div>${escape(record.midwifeName)}</div></div>` : ''}
          ${record.confirmedDate ? `<div class="kv"><div>Confirmed Date</div><div>${escape(formatDate(record.confirmedDate))}</div></div>` : ''}
          ${record.confirmedTime ? `<div class="kv"><div>Confirmed Time</div><div>${escape(record.confirmedTime)}</div></div>` : ''}
        </div>
        <div class="drawer-section">
          <h4>Resident Information</h4>
          <div class="kv"><div>Resident Name</div><div><strong>${escape(record.residentName || record.resident?.name || '-')}</strong></div></div>
          <div class="kv"><div>Resident Username</div><div>${escape(record.residentUsername || record.resident?.username || '-')}</div></div>
          <div class="kv"><div>Resident Contact</div><div>${escape(record.residentContact || record.resident?.contact || '-')}</div></div>
        </div>
      `;
    } else if (currentTab === 'medicine-list') {
      detailsHTML += `
        <div class="drawer-section">
          <h4>Medicine Information</h4>
          <div class="kv"><div>Medicine</div><div><strong>${escape(record.medicineName || record.name || '-')}</strong></div></div>
          <div class="kv"><div>Category</div><div>${escape(record.category || '-')}</div></div>
        </div>
        <div class="drawer-section">
          <h4>Inventory Information</h4>
          <div class="kv"><div>Stock</div><div>${escape((record.stock || 0) + ' ' + (record.unit || ''))}</div></div>
          <div class="kv"><div>Min Stock</div><div>${escape(record.minStock || '-')}</div></div>
          <div class="kv"><div>Max Stock</div><div>${escape(record.maxStock || '-')}</div></div>
        </div>
      `;
    } else if (currentTab === 'midwives') {
      detailsHTML += `
        <div class="drawer-section">
          <h4>Midwife Information</h4>
          <div class="kv"><div>Name</div><div><strong>${escape(record.name || '-')}</strong></div></div>
          <div class="kv"><div>Contact</div><div>${escape(record.contactNumber || '-')}</div></div>
          <div class="kv"><div>Details</div><div>${escape(record.details || '-')}</div></div>
        </div>
      `;
    }

    // Add common metadata in a styled section
    if (record.addedBy || record.createdAt || record.createdBy || record.updatedAt || record.updatedBy || record.completedAt) {
      detailsHTML += `<div class="drawer-meta-section">`;
      detailsHTML += `<h4>Record Metadata</h4>`;
      if (record.addedBy) {
        detailsHTML += `<div class="kv"><div>Added By</div><div><strong>${escape(record.addedBy)}</strong></div></div>`;
      }
      if (record.createdAt) {
        detailsHTML += `<div class="kv"><div>Created</div><div>${escape(formatDateTime(record.createdAt))}</div></div>`;
      }
      if (record.updatedAt) {
        detailsHTML += `<div class="kv"><div>Last Updated</div><div>${escape(formatDateTime(record.updatedAt))}</div></div>`;
      }
      if (record.updatedBy) {
        const updatedByText = typeof record.updatedBy === 'object' ? (record.updatedBy.name || record.updatedBy.username || 'Unknown') : record.updatedBy;
        detailsHTML += `<div class="kv"><div>Updated By</div><div>${escape(updatedByText)}</div></div>`;
      }
      if (record.completedAt) {
        detailsHTML += `<div class="kv"><div>Completed At</div><div>${escape(formatDateTime(record.completedAt))}</div></div>`;
      }
      detailsHTML += `</div>`;
    }

    currentDBody.innerHTML = detailsHTML || '<p>No details available.</p>';

    // Open drawer with proper styling
    currentDrawer.classList.remove('hidden');
    currentDrawer.style.setProperty('pointer-events', 'auto', 'important');
    currentDrawer.style.setProperty('display', 'flex', 'important');
    currentDrawer.style.setProperty('z-index', '10000', 'important');
    console.log('Health page: Drawer opened');
  }

  // Calendar elements (will be initialized in init function)
  let calGrid, calLabel, calPrev, calNext;

  async function refreshCalendar() {
    // Double-check elements exist before proceeding
    if (!calGrid || !calLabel) {
      console.warn('refreshCalendar: Calendar elements not found');
      return;
    }
    
    // Verify elements are still in the DOM
    if (!calGrid.parentNode || !calLabel.parentNode) {
      console.warn('refreshCalendar: Calendar elements no longer in DOM, re-querying...');
      const contentArea = document.querySelector('.content-area');
      if (contentArea) {
        calGrid = contentArea.querySelector('#calGrid') || document.getElementById('calGrid');
        calLabel = contentArea.querySelector('#calLabel') || document.getElementById('calLabel');
        if (!calGrid || !calLabel) {
          console.warn('refreshCalendar: Could not re-find calendar elements');
          return;
        }
      } else {
        return;
      }
    }
    
    const y = calYear;
    const m = calMonth;
    calLabel.textContent = new Date(y, m, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });

    calGrid.innerHTML = '';
    const daysOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    daysOfWeek.forEach(d => {
      const head = document.createElement('div');
      head.className = 'health-calendar-dow';
      head.textContent = d;
      if (calGrid) {
        calGrid.appendChild(head);
      }
    });

    let items = [];
    try {
      const resp = await fetch(`/api/health/calendar?year=${y}&month=${m}`);
      const j = await resp.json();
      if (j.ok) items = j.items || [];
    } catch {}

    const byDay = {};
    items.forEach(it => {
      if (!it.preferredDate) return;
      const d = new Date(it.preferredDate);
      const key = d.getDate();
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(it);
    });

    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    if (!calGrid) return; // Safety check
    
    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'health-calendar-cell health-calendar-cell--muted';
      calGrid.appendChild(blank);
    }

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      const isToday = isCurrentMonth && today.getDate() === day;
      cell.className = `health-calendar-cell${isToday ? ' today' : ''}`;
      const list = byDay[day] || [];
      const html = [];
      html.push(`<div class="health-calendar-day">${day}</div>`);
      html.push(`<div class="health-calendar-events">`);
      if (list.length) {
        const counts = { prenatal:0, infant:0, health:0, general:0 };
        list.forEach(it => {
          const t = (it.type || '').toLowerCase();
          if (counts[t] !== undefined) counts[t] += 1;
        });
        const parts = [];
        if (counts.prenatal) parts.push(`<span><span class="health-calendar-dot health-calendar-dot--prenatal"></span>${counts.prenatal} PN</span>`);
        if (counts.infant) parts.push(`<span><span class="health-calendar-dot health-calendar-dot--infant"></span>${counts.infant} Infant</span>`);
        if (counts.health) parts.push(`<span><span class="health-calendar-dot health-calendar-dot--health"></span>${counts.health} Health</span>`);
        if (counts.general) parts.push(`<span><span class="health-calendar-dot health-calendar-dot--general"></span>${counts.general} Gen</span>`);
        html.push(`<div class="health-calendar-count">${parts.join('<br>')}</div>`);
      }
      html.push(`</div>`);
      cell.innerHTML = html.join('');
      if (calGrid) {
        calGrid.appendChild(cell);
      }
    }
  }

  // Calendar initialization is now handled in the init() function

  // Form HTML functions follow...
  // Resident search functionality
  let residentSearchTimeout = null;
  let selectedResidentUser = null;

  function setupResidentSearch() {
    const searchInput = frm?.querySelector('input[name="residentSearch"]');
    const usernameInput = frm?.querySelector('input[name="residentUsername"]');
    const dropdown = frm?.querySelector('#residentUserDropdown');
    
    if (!searchInput || !dropdown) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (residentSearchTimeout) clearTimeout(residentSearchTimeout);
      residentSearchTimeout = setTimeout(() => searchUsers(query), 300);
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length >= 2) {
        searchUsers(searchInput.value.trim());
      }
    });

    // Close dropdown when clicking outside
    const closeHandler = (e) => {
      if (!e.target.closest('input[name="residentSearch"]') && !e.target.closest('#residentUserDropdown')) {
        dropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', closeHandler);
  }

  async function searchUsers(query) {
    const dropdown = frm?.querySelector('#residentUserDropdown');
    if (!dropdown) return;

    if (!query || query.trim().length < 2) {
      dropdown.style.display = 'none';
      return;
    }

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include'
      });
      const j = await res.json();
      const users = j.users || [];
      displayUserDropdown(users);
    } catch (e) {
      console.error('User search error:', e);
      dropdown.style.display = 'none';
    }
  }

  function displayUserDropdown(users) {
    const dropdown = frm?.querySelector('#residentUserDropdown');
    if (!dropdown) return;

    if (!users.length) {
      dropdown.innerHTML = '<div style="padding:12px;font-size:0.875rem;color:#666;">No users found</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = users.map(u => `
      <div style="padding:12px;cursor:pointer;border-bottom:1px solid #eee;transition:background 0.2s;" 
           onmouseover="this.style.background='#f0f7ff'" 
           onmouseout="this.style.background='white'"
           data-username="${(u.username || '').replace(/"/g, '&quot;')}" 
           data-name="${(u.name || '').replace(/"/g, '&quot;')}">
        <div style="font-weight:600;color:#333;">${u.name || '—'}</div>
        <div style="font-size:0.75rem;color:#666;margin-top:2px;">Username: ${u.username || '—'}</div>
      </div>
    `).join('');

    dropdown.querySelectorAll('[data-username]').forEach(el => {
      el.addEventListener('click', () => {
        const username = el.getAttribute('data-username');
        const name = el.getAttribute('data-name');
        selectResidentUser({ username, name });
      });
    });

    dropdown.style.display = 'block';
  }

  function selectResidentUser(user) {
    selectedResidentUser = user;
    const searchInput = frm?.querySelector('input[name="residentSearch"]');
    const usernameInput = frm?.querySelector('input[name="residentUsername"]');
    const dropdown = frm?.querySelector('#residentUserDropdown');
    
    if (searchInput) searchInput.value = `${user.name} (${user.username})`;
    if (usernameInput) usernameInput.value = user.username;
    if (dropdown) dropdown.style.display = 'none';
  }

  function getResidentSearchField() {
    return `
      <div class="full" style="grid-column:1/-1;">
        <label>Select Resident <span style="color:#999;font-weight:normal;">(Optional - search to link record)</span></label>
        <div style="position:relative;">
          <input name="residentSearch" type="text" placeholder="Search by name or username..." autocomplete="off" style="width:100%;">
          <div id="residentUserDropdown" style="position:absolute;z-index:50;width:100%;margin-top:4px;background:white;border:1px solid #ddd;border-radius:4px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-height:240px;overflow-y:auto;display:none;"></div>
        </div>
        <input type="hidden" name="residentUsername">
        <p style="font-size:0.75rem;color:#666;margin-top:4px;">Search and select a resident to link this record to their account.</p>
      </div>
    `;
  }

  function getPatientDataForm() {
    return `
      <div class="form-section">
        <h4>Basic Information</h4>
        <div class="form-grid">
          ${getResidentSearchField()}
          <div><label>Coordinator *</label><input name="coordinator" required></div>
          <div><label>Program *</label><select name="program" required>
            <option value="">Select Program</option>
            <option value="Newborn Screening">Newborn Screening</option>
            <option value="Monthly Check-up Day">Monthly Check-up Day</option>
            <option value="Senior Citizen Assessment">Senior Citizen Assessment</option>
          </select></div>
          <div><label>Type *</label><select name="type" required>
            <option value="">Select Type</option>
            <option value="Patient Data">Patient Data</option>
            <option value="Health Assessment">Health Assessment</option>
          </select></div>
          <div><label>Location *</label><select name="location" required>
            <option value="">Select Location</option>
            <option value="Barangay Health Center">Barangay Health Center</option>
            <option value="Health Center Annex A">Health Center Annex A</option>
          </select></div>
          <div><label>Date & Time *</label><input type="datetime-local" name="datetime" required></div>
          <div><label>Status</label><select name="status">
            <option value="Scheduled">Scheduled</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Completed">Completed</option>
          </select></div>
        </div>
      </div>
    `;
  }

  function getFamilyPlanningForm() {
    return `
      <div class="form-section">
        <h4>Family Planning Client Assessment Record</h4>
        <div class="form-grid">
          ${getResidentSearchField()}
          <div><label>Last Name *</label><input name="lastName" required></div>
          <div><label>Given Name *</label><input name="givenName" required></div>
          <div><label>Middle Initial</label><input name="middleInitial" maxlength="2"></div>
          <div><label>Date of Birth *</label><input type="date" name="dateOfBirth" required></div>
          <div><label>Age *</label><input type="number" name="age" required min="15" max="60"></div>
          <div class="full"><label>Address *</label><input name="address" required></div>
          <div><label>Contact Number</label><input name="contactNumber" placeholder="09XXXXXXXXX"></div>
          <div><label>Client Type *</label><select name="clientType" required>
            <option value="">Select Type</option>
            <option value="New Acceptor">New Acceptor</option>
            <option value="Current User">Current User</option>
            <option value="Changing Method">Changing Method</option>
          </select></div>
          <div><label>FP Method</label><select name="fpMethod">
            <option value="">Select Method</option>
            <option value="Pills">Pills</option>
            <option value="Injectable">Injectable</option>
            <option value="IUD">IUD</option>
            <option value="Condom">Condom</option>
          </select></div>
        </div>
      </div>
    `;
  }

  function getPostPartumForm() {
    return `
      <div class="form-section">
        <h4>Post Partum Form - Phase 1</h4>
        <div class="form-grid" data-pp-section="main">
          ${getResidentSearchField()}
          <div><label>Mother Name *</label><input name="motherName" required></div>
          <div><label>Address *</label><input name="address" required></div>
          <div><label>Age *</label><input type="number" name="ageOfMother" required min="15" max="60"></div>
          <div><label>Birth Date *</label><input type="date" name="birthDate" required></div>
          <div><label>Gravida (G) *</label><input type="number" name="gravida" required min="1"></div>
          <div><label>Para (P) *</label><input type="number" name="para" required min="0"></div>
          <div><label>Place of Delivery *</label><select name="placeOfDelivery" required>
            <option value="">Select Place</option>
            <option value="Barangay Health Center">Barangay Health Center</option>
            <option value="Hospital">Hospital</option>
            <option value="Home">Home</option>
          </select></div>
          <div><label>Date/Time *</label><input type="datetime-local" name="deliveryDateTime" required></div>
          <div><label>Gender *</label><select name="gender" required>
            <option value="">Select</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select></div>
          <div><label>Weight (kg) *</label><input type="number" name="weight" step="0.1" min="1" max="8" required></div>
          <div><label>Tetanus Status</label><select name="tetanusStatus">
            <option value="BCG">BCG</option>
            <option value="Hep B">Hep B</option>
            <option value="NBs">NBs</option>
          </select></div>
          <div class="full"><label>Post-partum (first 30 minutes) details</label><textarea name="details30Min" rows="3" placeholder="Observations within first 30 minutes after delivery…"></textarea></div>
        </div>
        <div id="ppGenderHint" style="margin-top:6px;font-size:0.82rem;color:#c0392b;display:none;">
          Post-partum tracking is only applicable for female patients. Please change gender to Female if this is a valid post-partum case.
        </div>
      </div>
    `;
  }

  function wirePostPartumLogic() {
    const genderSel = frm.querySelector('select[name="gender"]');
    const section = frm.querySelector('[data-pp-section="main"]');
    const hint = document.getElementById('ppGenderHint');
    if (!genderSel || !section) return;
    const saveBtn = document.getElementById('btnSave');

    const apply = () => {
      const v = genderSel.value;
      if (v === 'M') {
        section.style.display = 'none';
        if (hint) hint.style.display = 'block';
        if (saveBtn) saveBtn.disabled = true;
      } else {
        section.style.display = 'grid';
        if (hint) hint.style.display = 'none';
        if (saveBtn) saveBtn.disabled = false;
      }
    };
    genderSel.addEventListener('change', apply);
    apply();
  }

  function getChildImmunizationForm() {
    return `
      <div class="form-section">
        <h4>Child Immunization Record</h4>
        <div class="form-grid">
          ${getResidentSearchField()}
          <div><label>Child Name *</label><input name="childName" required></div>
          <div><label>Birthday *</label><input type="date" name="birthday" required></div>
          <div><label>Age (months)</label><input type="number" name="age" min="0" max="60"></div>
          <div><label>Gender *</label><select name="gender" required>
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select></div>
          <div class="full"><label>Address *</label><input name="address" required></div>
          <div><label>Mother Name</label><input name="motherName"></div>
          <div><label>Father Name</label><input name="fatherName"></div>
          <div><label>BCG Date</label><input type="date" name="bcgDate"></div>
          <div><label>Hep B Birth</label><input type="date" name="hepBBirthDate"></div>
          <div><label>Pentavalent 1</label><input type="date" name="pentavalent1Date"></div>
          <div><label>OPV 1</label><input type="date" name="opv1Date"></div>
          <div><label>MMR 1</label><input type="date" name="mmr1Date"></div>
        </div>
      </div>
    `;
  }

  function getIndividualTreatmentForm() {
    return `
      <div class="form-section">
        <h4>Individual Treatment Record</h4>
        <div class="form-grid">
          ${getResidentSearchField()}
          <div><label>Patient Name *</label><input name="patientName" required></div>
          <div><label>Date *</label><input type="date" name="consultationDate" required></div>
          <div><label>Age *</label><input type="number" name="age" required min="1" max="120"></div>
          <div><label>Birthday *</label><input type="date" name="birthday" required></div>
          <div class="full"><label>Address *</label><input name="address" required></div>
          <div><label>Sex *</label><select name="sex" required>
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select></div>
          <div><label>Philhealth</label><select name="philhealth">
            <option value="">Select</option>
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select></div>
          <div><label>Blood Pressure</label><input name="bloodPressure" placeholder="120/80"></div>
          <div><label>Temperature</label><input type="number" name="temperature" step="0.1" min="35" max="42"></div>
          <div class="full"><label>History of Illness *</label><textarea name="historyOfIllness" required rows="3"></textarea></div>
          <div class="full"><label>Assessment *</label><textarea name="assessment" required rows="3"></textarea></div>
          <div class="full"><label>Treatment Plan *</label><textarea name="treatmentPlan" required rows="3"></textarea></div>
          <div><label>Status</label><select name="status">
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
            <option value="Follow-up Required">Follow-up Required</option>
          </select></div>
        </div>
      </div>
    `;
  }

  function getPatientDataRecordForm() {
    return `
      <div class="form-section">
        <h4>Patient Data Record</h4>
        <div class="form-grid">
          ${getResidentSearchField()}
          <div><label>Surname *</label><input name="surname" required></div>
          <div><label>Given Name *</label><input name="givenName" required></div>
          <div><label>Middle Name</label><input name="middleName"></div>
          <div><label>Age *</label><input type="number" name="age" required min="1" max="120"></div>
          <div><label>Birth Date *</label><input type="date" name="birthDate" required></div>
          <div><label>Gender *</label><select name="gender" required>
            <option value="">Select</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select></div>
          <div><label>Barangay *</label><select name="barangay" required>
            <option value="">Select Barangay</option>
            <option value="Langkaan II">Langkaan II</option>
            <option value="Langkaan I">Langkaan I</option>
          </select></div>
          <div><label>Contact Number</label><input name="contactNumber" placeholder="09XXXXXXXXX"></div>
          <div><label>Philhealth</label><input name="philhealth" placeholder="XX-XXXXXXXXX-X"></div>
          <div><label>Civil Status</label><select name="civilStatus">
            <option value="">Select</option>
            <option value="SINGLE">Single</option>
            <option value="MARRIED">Married</option>
            <option value="WIDOW">Widow</option>
          </select></div>
          <div><label>Height (cm)</label><input type="number" name="height" step="0.1"></div>
          <div><label>Weight (kg)</label><input type="number" name="weight" step="0.1"></div>
          <div><label>Blood Pressure</label><input name="bloodPressure" placeholder="120/80"></div>
          <div><label>CVD / Cardio status</label><input name="cvdStatus" placeholder="e.g., Hypertensive, at risk, controlled"></div>
          <div><label>NCD status</label><input name="ncdStatus" placeholder="e.g., Diabetes, asthma, others"></div>
          <div class="full"><label>Chronic Conditions / Notes</label><textarea name="chronicConditions" rows="3" placeholder="List of chronic conditions, medications, lifestyle notes…"></textarea></div>
          <div><label>Status</label><select name="status">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select></div>
        </div>
      </div>
    `;
  }

  function getPregnancyTrackingForm() {
    return `
      <div class="form-section">
        <h4>Pregnancy Tracking Master Listing</h4>
        <div class="form-grid">
          ${getResidentSearchField()}
          <div><label>Name *</label><input name="name" required></div>
          <div><label>Age *</label><input type="number" name="age" required min="15" max="55"></div>
          <div class="full"><label>Complete Address *</label><input name="completeAddress" required></div>
          <div><label>LMP *</label><input type="date" name="lmp" required></div>
          <div><label>EDD *</label><input type="date" name="edd" required></div>
          <div><label>Prenatal</label><select name="prenatalConsultation">
            <option value="">Select</option>
            <option value="1st Trimester">1st Trimester</option>
            <option value="2nd Trimester">2nd Trimester</option>
            <option value="3rd Trimester">3rd Trimester</option>
            <option value="Regular">Regular</option>
          </select></div>
          <div><label>Health Facility *</label><select name="healthFacility" required>
            <option value="">Select</option>
            <option value="Center">Barangay Health Center</option>
            <option value="Annex A">Health Center Annex A</option>
            <option value="Hospital">Hospital</option>
          </select></div>
          <div><label>Contact Number</label><input name="contactNumber" placeholder="09XXXXXXXXX"></div>
          <div><label>Gravida (G)</label><input type="number" name="gravida" min="1"></div>
          <div><label>Para (P)</label><input type="number" name="para" min="0"></div>
          <div><label>Risk Level</label><select name="riskLevel">
            <option value="">Select</option>
            <option value="Low Risk">Low Risk</option>
            <option value="Medium Risk">Medium Risk</option>
            <option value="High Risk">High Risk</option>
          </select></div>
        </div>
      </div>
    `;
  }

  function getPreNatalForm() {
    return `
      <div class="form-section">
        <h4>Pre-Natal Visit</h4>
        <div class="form-grid">
          ${getResidentSearchField()}
          <div><label>Patient Name *</label><input name="patientName" required></div>
          <div><label>Age *</label><input type="number" name="age" required min="15" max="55"></div>
          <div class="full"><label>Address *</label><input name="address" required></div>
          <div><label>Visit Date *</label><input type="datetime-local" name="visitDate" required></div>
          <div><label>Trimester *</label><select name="trimester" required>
            <option value="">Select</option>
            <option value="1st Trimester">1st Trimester</option>
            <option value="2nd Trimester">2nd Trimester</option>
            <option value="3rd Trimester">3rd Trimester</option>
          </select></div>
          <div><label>Blood Pressure</label><input name="bloodPressure" placeholder="120/80"></div>
          <div><label>Weight (kg)</label><input type="number" name="weight" step="0.1" min="20" max="200"></div>
          <div><label>Fundic Height</label><input name="fundicHeight" placeholder="Fundic height"></div>
          <div><label>Fetal Heart Tone</label><input name="fetalHeartTone" placeholder="FHT"></div>
          <div><label>Midwife Name</label><input name="midwifeName" placeholder="Assigned midwife"></div>
          <div class="full"><label>Remarks</label><textarea name="remarks" rows="3"></textarea></div>
        </div>
      </div>
    `;
  }

  function getMedicineListForm() {
    return `
      <div class="form-section">
        <h4>Medicine Inventory Item</h4>
        <div class="form-grid">
          <div><label>Medicine Name *</label><input name="name" required></div>
          <div><label>Category *</label><select name="category" required>
            <option value="">Select Category</option>
            <option value="Paracetamol">Paracetamol</option>
            <option value="Antibiotic">Antibiotic</option>
            <option value="Antihypertensive">Antihypertensive</option>
            <option value="Cough / Cold">Cough / Cold</option>
            <option value="Others">Others</option>
          </select></div>
          <div><label>Current Stock</label><input type="number" name="stock" min="0" step="1"></div>
          <div><label>Minimum Stock (alert)</label><input type="number" name="minStock" min="0" step="1"></div>
          <div><label>Maximum Stock</label><input type="number" name="maxStock" min="0" step="1"></div>
          <div><label>Unit</label><input name="unit" placeholder="e.g., tablet, bottle, vial" value="tablet"></div>
        </div>
      </div>
    `;
  }

  function getMidwivesForm() {
    return `
      <div class="form-section">
        <h4>Kumadronas / Midwives</h4>
        <div class="form-grid">
          <div><label>Name *</label><input name="name" required></div>
          <div><label>Contact Number *</label><input name="contactNumber" required placeholder="09XXXXXXXXX"></div>
          <div class="full"><label>Details</label><textarea name="details" rows="3" placeholder="Clinic schedule, barangay coverage, notes…"></textarea></div>
        </div>
      </div>
    `;
  }

  function getSchedulesForm() {
    return `
      <div class="form-section">
        <h4>Health Schedule</h4>
        <div class="form-grid">
          <div><label>Schedule Type *</label><select name="type" required>
            <option value="">Select Type</option>
            <option value="prenatal">Pre-natal Checkup</option>
            <option value="infant">Infant Checkup</option>
            <option value="health">Health Checkup</option>
            <option value="general">General Checkup</option>
          </select></div>
          <div><label>Preferred Date *</label><input type="date" name="preferredDate" required></div>
          <div><label>Preferred Time</label><input type="time" name="preferredTime"></div>
          <div><label>Status</label><select name="status">
            <option value="Pending">Pending</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select></div>
          <div class="full"><label>Notes</label><textarea name="notes" rows="3" placeholder="Additional instructions or remarks…"></textarea></div>
        </div>
      </div>
    `;
  }

  // Initialize - ensure initUser completes before loading data
  let initRetryCount = 0;
  const MAX_INIT_RETRIES = 10;
  let initTimeoutId = null;
  
  async function init() {
    // Clear any pending retries
    if (initTimeoutId) {
      clearTimeout(initTimeoutId);
      initTimeoutId = null;
    }
    
    // Check if we're still on the health page
    const currentPath = window.location.pathname.toLowerCase();
    if (!currentPath.includes('health')) {
      console.log('Health page: No longer on health page, aborting init');
      return;
    }
    
    // Small delay to ensure DOM is ready (especially important for SPA navigation)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Re-query all DOM elements (they may have been removed/replaced during navigation)
    // Query within content-area to ensure we're getting the right elements
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Health page: Content area not found, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Health page: Content area not found after max retries');
        return;
      }
    }
    
    // Verify content area has content (not just empty)
    if (!contentArea.innerHTML || contentArea.innerHTML.trim().length < 100) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Health page: Content area is empty, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Health page: Content area is empty after max retries');
        return;
      }
    }
    
    tableHead = contentArea.querySelector('#tableHead') || $('#tableHead');
    tableBody = contentArea.querySelector('#tableBody') || $('#tableBody');
    pager = contentArea.querySelector('#pager') || $('#pager');
    modal = document.getElementById('modal') || $('#modal');
    frm = document.getElementById('frm') || $('#frm');
    msg = document.getElementById('msg') || $('#msg');
    formContent = document.getElementById('formContent') || $('#formContent');
    tabs = contentArea.querySelector('#tabs') || $('#tabs');
    
    drawer = document.getElementById('drawer') || $('#drawer');
    dBody = document.getElementById('dBody') || $('#dBody');
    dClose = document.getElementById('dClose') || $('#dClose');
    dRecordId = document.getElementById('dRecordId') || $('#dRecordId');
    dStatus = document.getElementById('dStatus') || $('#dStatus');
    
    // Check if critical elements exist
    if (!tableHead || !tableBody || !tabs) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Health page: Critical DOM elements not found, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Health page: Critical DOM elements not found after max retries');
        return;
      }
    }
    
    // Reset retry count on success
    initRetryCount = 0;
    initTimeoutId = null;
    
    // Reset loading state to allow fresh data load
    isLoading = false;
    
    // Reset state to defaults
    state = { 
      page: 1, 
      limit: 10, 
      status: '', 
      q: '', 
      from: '', 
      to: '', 
      sort: 'desc' 
    };
    
    await initUser();
    
    // Setup all event listeners (re-attach them)
    setupEventListeners();
    
    // Initialize calendar elements (they may not exist when script first loads in SPA mode)
    // Query within content area first, then fallback to document-wide search
    calGrid = contentArea.querySelector('#calGrid') || document.getElementById('calGrid');
    calLabel = contentArea.querySelector('#calLabel') || document.getElementById('calLabel');
    calPrev = contentArea.querySelector('#calPrev') || document.getElementById('calPrev');
    calNext = contentArea.querySelector('#calNext') || document.getElementById('calNext');
    
    // Setup calendar event listeners (remove old ones first to prevent duplicates)
    if (calPrev && calNext && calPrev.parentNode) {
      // Clone to remove old event listeners
      const newPrev = calPrev.cloneNode(true);
      const newNext = calNext.cloneNode(true);
      calPrev.parentNode.replaceChild(newPrev, calPrev);
      calNext.parentNode.replaceChild(newNext, calNext);
      calPrev = newPrev;
      calNext = newNext;
      
      calPrev.onclick = () => {
        calMonth -= 1;
        if (calMonth < 0) { calMonth = 11; calYear -= 1; }
        refreshCalendar();
      };
      calNext.onclick = () => {
        calMonth += 1;
        if (calMonth > 11) { calMonth = 0; calYear += 1; }
        refreshCalendar();
      };
    }
    
    // Reset calendar to current month
    calYear = new Date().getFullYear();
    calMonth = new Date().getMonth();
    
    // Refresh calendar only if elements exist
    if (calGrid && calLabel) {
      refreshCalendar();
    } else {
      console.warn('Health page: Calendar elements not found, skipping calendar initialization');
    }
    
    // Reset to default tab and load data
    currentTab = 'patient-data';
    switchTab('patient-data');
    
    // Delay summary refresh to ensure DOM elements are ready
    setTimeout(() => {
      refreshSummary();
    }, 100);
  }

  // Expose init function for router
  window.initHealth = init;

  // Auto-initialize ONLY for direct page loads (not SPA navigation)
  // Check if router is active - if so, don't auto-init (router will call initHealth)
  const isSPAMode = window.__ROUTER_INITIALIZED__ || window.location.pathname.includes('/admin/') || window.location.pathname.includes('/user/');
  
  if (!isSPAMode) {
    // Direct page load (not via router)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 50);
    }
  } else {
    // SPA mode - router will call initHealth, don't auto-init
    console.log('Health page: SPA mode detected, waiting for router to call initHealth');
  }

})();