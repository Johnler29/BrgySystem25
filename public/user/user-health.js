// public/user/user-health.js - User-specific version (view own records only)
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>p.querySelectorAll(s);
  
  // DOM element references - will be re-queried in init()
  let tableHead, tableBody, pager, drawer, dBody, dClose, dRecordId, dStatus, tabs, scheduleForm, scheduleMsg;

  let user = null;
  let currentTab = 'patient-data';
  let isAdmin = false;

  // Tab configurations
  const tabConfigs = {
    'patient-data': {
      title: 'Health Programs',
      headers: ['Program', 'Type', 'Location', 'Date & Time', 'Status'],
      apiEndpoint: '/api/health/patient-data'
    },
    'family-planning': {
      title: 'Family Planning Records', 
      headers: ['Name', 'Age', 'Client Type', 'Method', 'Date'],
      apiEndpoint: '/api/health/family-planning'
    },
    'post-partum': {
      title: 'Post Partum Records',
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
      headers: ['Date', 'Age', 'Chief Complaint', 'Status'],
      apiEndpoint: '/api/health/individual-treatment'
    },
    'patient-data-record': {
      title: 'My Patient Profile',
      headers: ['Patient Name', 'Age', 'Gender', 'Barangay', 'Contact', 'Status'],
      apiEndpoint: '/api/health/patient-records'
    },
    'pregnancy-tracking': {
      title: 'Pregnancy Tracking',
      headers: ['Name', 'Address', 'Age', 'LMP', 'EDD', 'Prenatal', 'Health Facility'],
      apiEndpoint: '/api/health/pregnancy-tracking'
    },
    'pre-natal': {
      title: 'Pre-Natal Visits',
      headers: ['Patient Name', 'Age', 'Address', 'Visit Date', 'Trimester', 'Midwife', 'BP'],
      apiEndpoint: '/api/health/prenatal'
    },
    'schedules': {
      title: 'My Health Schedules',
      headers: ['Type', 'Preferred Date', 'Time', 'Status', 'Notes'],
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
      'Resolved': 'bg-resolved',
      'Administered': 'bg-administered'
    };
    const cls = map[s] || 'bg-ghost-btn text-primary-btn';
    return `<span class="px-2 py-1 rounded-2xl text-xs font-bold ${cls}">${s}</span>`;
  };
  const fmt = d => d ? new Date(d).toLocaleString() : '';

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, { ...opts, credentials: 'include' });
    const contentType = res.headers.get('content-type') || '';
    
    // Check if response is JSON
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) {
        const msg = data.message || res.statusText || 'Request failed';
        throw new Error(msg);
      }
      return data;
    }
    
    // If not JSON, it's likely an HTML error page (404, etc.)
    const text = await res.text();
    if (res.status === 404) {
      throw new Error('The requested service is not available. Please try again later.');
    }
    if (res.status === 401) {
      throw new Error('Please log in to continue.');
    }
    throw new Error(`Server error (${res.status}). Please try again.`);
  }

  // User authentication with role checking
  async function initUser(){
    try{
      const j = await fetchJSON('/api/me');
      user = j.user || null;
      if(!user){ location.href='/login'; return; }
      
      isAdmin = /^(admin)$/i.test(user.role||'') || user.isAdmin===true || user.type==='admin' || user.accountType==='admin';
      
      // Redirect if accessing wrong route
      if (isAdmin) {
        location.href='/admin/health';
        return;
      }
      
      const usernameEl = document.getElementById('username');
      const avatarEl = document.getElementById('avatar');
      if (usernameEl) usernameEl.textContent = user.name || 'User';
      if (avatarEl) avatarEl.textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
      
    }catch{ location.href='/login'; }
  }

  async function logout(){ 
    await fetch('/api/logout',{method:'POST'}); 
    location.href='/login'; 
  }
  window.logout = logout;

  // Summary statistics
  function setSummary(sum){
    const sTotal = document.getElementById('sTotal');
    const sActive = document.getElementById('sActive');
    const sScheduled = document.getElementById('sScheduled');
    const sCompleted = document.getElementById('sCompleted');
    if (sTotal) sTotal.textContent = sum.Total || 0;
    if (sActive) sActive.textContent = sum.Active || 0;
    if (sScheduled) sScheduled.textContent = sum.Scheduled || 0;
    if (sCompleted) sCompleted.textContent = sum.Completed || 0;
  }

  async function refreshSummary(){
    try{
      const j = await fetchJSON('/api/health/summary?mine=true');
      if (j.ok) setSummary(j.summary || {});
    }catch{}
  }

  // Tab switching
  function switchTab(tabName) {
    currentTab = tabName;
    
    // Remove active state from all tabs
    $$('.tab').forEach(t => {
      t.classList.remove('active');
    });
    
    // Add active state to selected tab
    const activeTab = $(`.tab[data-tab="${tabName}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }
    
    state.page = 1;
    load();
  }

  // Load data
  async function load(){
    if (!tableHead || !tableBody) return;
    
    const config = tabConfigs[currentTab];
    if (!config) return;

    const qs = new URLSearchParams({
      page: state.page,
      limit: state.limit,
      status: state.status,
      q: state.q,
      from: state.from,
      to: state.to,
      sort: state.sort,
      mine: 'true' // Always filter to user's records
    }).toString();

    try {
      const j = await fetchJSON(config.apiEndpoint + '?' + qs);
      renderTable(config.headers, j.rows || []);
      renderPager(j.page, j.totalPages, j.total);
      refreshSummary();
    } catch(e) {
      console.error('Load error:', e);
      if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="' + config.headers.length + '" class="text-center p-4 text-muted">No records found.</td></tr>';
      }
    }
  }

  function renderTable(headers, rows){
    if (!tableHead || !tableBody) return;
    
    tableHead.innerHTML = '<tr>' + headers.map(h => `<th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">${h}</th>`).join('') + '<th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold w-[100px]">Actions</th></tr>';
    
    tableBody.innerHTML = '';
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="' + (headers.length + 1) + '" class="text-center p-4 text-muted">No records found.</td></tr>';
      return;
    }

    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-[#f2f3f4] hover:bg-[#fbfcfd]';
      
      let cells = '';
      if (currentTab === 'patient-data') {
        cells = `<td>${r.program || '-'}</td><td>${r.type || '-'}</td><td>${r.location || '-'}</td><td>${fmt(r.dateTime || r.dateTime)}</td><td>${badge(r.status || 'Pending')}</td>`;
      } else if (currentTab === 'family-planning') {
        const name = r.lastName && r.givenName ? `${r.lastName}, ${r.givenName}` : (r.name || '-');
        cells = `<td>${name}</td><td>${r.age || '-'}</td><td>${r.clientType || '-'}</td><td>${r.fpMethod || r.method || '-'}</td><td>${r.dateOfBirth ? new Date(r.dateOfBirth).toLocaleDateString() : (r.date ? fmt(r.date) : '-')}</td>`;
      } else if (currentTab === 'post-partum') {
        cells = `<td>${r.motherName || '-'}</td><td>${r.address || '-'}</td><td>${r.ageOfMother || '-'}</td><td>${fmt(r.deliveryDateTime)}</td><td>${r.placeOfDelivery || '-'}</td><td>${r.gender || '-'}</td><td>${r.tetanusStatus || '-'}</td>`;
      } else if (currentTab === 'child-immunization') {
        cells = `<td>${r.childName || '-'}</td><td>${r.birthday ? new Date(r.birthday).toLocaleDateString() : '-'}</td><td>${r.age || '-'}</td><td>${r.bcgDate ? '✓' : '—'}</td><td>${r.hepBBirthDate ? '✓' : '—'}</td><td>${r.pentavalent1Date ? '✓' : '—'}</td><td>${r.opv1Date ? '✓' : '—'}</td><td>${r.mmr1Date ? '✓' : '—'}</td>`;
      } else if (currentTab === 'individual-treatment') {
        cells = `<td>${fmt(r.consultationDate || r.date)}</td><td>${r.age || '-'}</td><td>${r.historyOfIllness || r.chiefComplaint || '-'}</td><td>${badge(r.status || 'Pending')}</td>`;
      } else if (currentTab === 'patient-data-record') {
        const name = r.surname && r.givenName ? `${r.surname}, ${r.givenName} ${(r.middleName || '')}`.trim() : (r.name || '-');
        cells = `<td>${name}</td><td>${r.age || '-'}</td><td>${r.gender || '-'}</td><td>${r.barangay || '-'}</td><td>${r.contactNumber || '-'}</td><td>${badge(r.status || 'Active')}</td>`;
      } else if (currentTab === 'pregnancy-tracking') {
        cells = `<td>${r.name || '-'}</td><td>${r.completeAddress || '-'}</td><td>${r.age || '-'}</td><td>${r.lmp ? new Date(r.lmp).toLocaleDateString() : '-'}</td><td>${r.edd ? new Date(r.edd).toLocaleDateString() : '-'}</td><td>${r.prenatalConsultation || '-'}</td><td>${r.healthFacility || '-'}</td>`;
      } else if (currentTab === 'pre-natal') {
        cells = `<td>${r.patientName || '-'}</td><td>${r.age || '-'}</td><td>${r.address || '-'}</td><td>${fmt(r.visitDate)}</td><td>${r.trimester || '-'}</td><td>${r.midwifeName || '-'}</td><td>${r.bloodPressure || '-'}</td>`;
      } else if (currentTab === 'schedules') {
        const typeMap = {
          'prenatal': { icon: '🤰', label: 'Pre-natal' },
          'infant': { icon: '👶', label: 'Infant' },
          'health': { icon: '🏥', label: 'Health' },
          'general': { icon: '👤', label: 'General' }
        };
        const typeInfo = typeMap[(r.type || '').toLowerCase()] || { icon: '📋', label: (r.type || '').toString() };
        const formatDate = (date) => date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
        cells = `<td><span style="font-size:1.1rem;">${typeInfo.icon}</span> ${typeInfo.label}</td><td>${formatDate(r.preferredDate)}</td><td>${r.preferredTime || '-'}</td><td>${badge(r.status || 'Pending')}</td><td>${r.notes || '-'}</td>`;
      }
      
      tr.innerHTML = cells + `<td><button class="action-btn-view" data-act="view" data-id="${r._id}"><i class="fas fa-eye"></i><span>View</span></button></td>`;
      tableBody.appendChild(tr);
    });
  }

  function renderPager(page, totalPages, total){
    if (!pager) return;
    pager.innerHTML = '';
    const info = document.createElement('div');
    info.style.marginRight='auto';
    info.textContent = `Total: ${total}`;
    pager.appendChild(info);

    const mk = (t,cb,dis=false)=>{ 
      const b=document.createElement('button'); 
      b.className='px-2.5 py-1.5 rounded-lg border border-input bg-white text-primary-btn font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed'; 
      b.textContent=t; 
      b.disabled=dis; 
      b.onclick=cb; 
      pager.appendChild(b); 
    };
    mk('Prev', ()=>{ if(state.page>1){ state.page--; load(); }}, page<=1);
    for(let i=Math.max(1,page-2); i<=Math.min(totalPages,page+2); i++){
      const b=document.createElement('button'); 
      b.className=`px-2.5 py-1.5 rounded-lg border ${i===page ? 'bg-primary-btn text-white border-primary-btn' : 'border-input bg-white text-primary-btn'} font-medium hover:opacity-90 transition-opacity`;
      b.textContent=i;
      b.onclick=()=>{ state.page=i; load(); };
      pager.appendChild(b);
    }
    mk('Next', ()=>{ if(state.page<totalPages){ state.page++; load(); }}, page>=totalPages);
  }

  function setupEventListeners() {
    // Tabs
    if (tabs) {
      // Clone to remove old listeners
      const newTabs = tabs.cloneNode(true);
      tabs.parentNode.replaceChild(newTabs, tabs);
      tabs = newTabs;
      
      newTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        switchTab(tab.getAttribute('data-tab'));
      });
    }

    // Filter function (shared by button and Enter key)
    const applyFilter = () => {
      const fFrom = document.getElementById('fFrom');
      const fTo = document.getElementById('fTo');
      const fQ = document.getElementById('fQ');
      const fStatus = document.getElementById('fStatus');
      state.from = fFrom ? (fFrom.value || '') : '';
      state.to = fTo ? (fTo.value || '') : '';
      state.q = fQ ? fQ.value.trim() : '';
      state.status = fStatus ? (fStatus.value || '') : '';
      state.page = 1;
      load();
    };

    // Filter button
    const btnFilter = document.getElementById('btnFilter');
    if (btnFilter) {
      const newBtnFilter = btnFilter.cloneNode(true);
      btnFilter.parentNode.replaceChild(newBtnFilter, btnFilter);
      newBtnFilter.onclick = applyFilter;
    }

    // Search input - Enter key to apply filter
    const fQ = document.getElementById('fQ');
    if (fQ) {
      const newFQ = fQ.cloneNode(true);
      fQ.parentNode.replaceChild(newFQ, fQ);
      newFQ.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyFilter();
        }
      });
    }

    // Date inputs - Enter key to apply filter
    const fFrom = document.getElementById('fFrom');
    if (fFrom) {
      const newFFrom = fFrom.cloneNode(true);
      fFrom.parentNode.replaceChild(newFFrom, fFrom);
      newFFrom.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyFilter();
        }
      });
    }

    const fTo = document.getElementById('fTo');
    if (fTo) {
      const newFTo = fTo.cloneNode(true);
      fTo.parentNode.replaceChild(newFTo, fTo);
      newFTo.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyFilter();
        }
      });
    }

    // Status select - change event to apply filter
    const fStatus = document.getElementById('fStatus');
    if (fStatus) {
      const newFStatus = fStatus.cloneNode(true);
      fStatus.parentNode.replaceChild(newFStatus, fStatus);
      newFStatus.addEventListener('change', () => {
        applyFilter();
      });
    }

    // Table actions - use event delegation
    if (tableBody && tableBody.parentNode) {
      const tableWrapper = tableBody.closest('table') || tableBody.closest('.border-2');
      if (tableWrapper) {
        const newTableWrapper = tableWrapper.cloneNode(true);
        tableWrapper.parentNode.replaceChild(newTableWrapper, tableWrapper);
        
        // Re-query tableBody after cloning
        const newTableBody = newTableWrapper.querySelector('#tableBody') || newTableWrapper.querySelector('tbody');
        if (newTableBody) {
          tableBody = newTableBody;
        }
        
        // Re-query tableHead after cloning
        const newTableHead = newTableWrapper.querySelector('#tableHead') || newTableWrapper.querySelector('thead');
        if (newTableHead) {
          tableHead = newTableHead;
        }
        
        newTableWrapper.addEventListener('click', async (e) => {
          const btn = e.target.closest('button[data-act]');
          if (!btn) return;
          const id = btn.getAttribute('data-id');
          const act = btn.getAttribute('data-act');

          if (act === 'view') {
            try {
              // Map tab names to API endpoint names
              const endpointMap = {
                'patient-data': 'patient-data',
                'family-planning': 'family-planning',
                'post-partum': 'post-partum',
                'child-immunization': 'child-immunization',
                'individual-treatment': 'individual-treatment',
                'patient-data-record': 'patient-records',
                'pregnancy-tracking': 'pregnancy-tracking',
                'pre-natal': 'prenatal',
                'schedules': 'schedules'
              };
              const endpoint = endpointMap[currentTab] || currentTab;
              const j = await fetchJSON(`/api/health/${endpoint}/${id}`);
              if (!j.ok) return alert('Record not found');
              const r = j.row;
              
              if (dRecordId) dRecordId.textContent = r.recordId || r._id;
              if (dStatus) {
                const badgeClass = badge(r.status || 'Active').match(/class="([^"]+)"/)?.[1] || 'bg-active';
                dStatus.className = 'px-2 py-1 rounded-2xl text-xs font-bold ' + badgeClass;
                dStatus.textContent = r.status || 'Active';
              }

              if (dBody) {
                // Helper function to format field names
                const formatFieldName = (key) => {
                  return key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();
                };
                
                // Helper function to format values
                const formatValue = (key, value) => {
                  if (value === null || value === undefined || value === '') return '-';
                  
                  // Handle dates
                  if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time') || key.toLowerCase().includes('at')) {
                    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                      try {
                        const date = new Date(value);
                        if (!isNaN(date.getTime())) {
                          if (key.toLowerCase().includes('time') || key.toLowerCase().includes('at')) {
                            return date.toLocaleString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            });
                          }
                          return date.toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          });
                        }
                      } catch (e) {
                        // Fall through to default
                      }
                    }
                  }
                  
                  // Handle objects
                  if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value)) {
                      return value.length > 0 ? value.join(', ') : '-';
                    }
                    // Try to extract meaningful info from objects
                    if (value.name) return value.name;
                    if (value.username) return value.username;
                    if (value.email) return value.email;
                    return JSON.stringify(value);
                  }
                  
                  return String(value);
                };
                
                // Helper to escape HTML
                const escape = (str) => {
                  if (!str) return '';
                  const div = document.createElement('div');
                  div.textContent = str;
                  return div.innerHTML;
                };
                
                // Filter and organize fields
                const excludedFields = ['_id', 'recordId', '__v'];
                const fields = Object.entries(r)
                  .filter(([k]) => !k.startsWith('_') && !excludedFields.includes(k))
                  .map(([k, v]) => ({
                    key: k,
                    label: formatFieldName(k),
                    value: formatValue(k, v),
                    isImportant: ['type', 'status', 'preferredDate', 'preferredTime', 'notes'].includes(k)
                  }));
                
                // Group fields by category
                const scheduleFields = fields.filter(f => 
                  ['type', 'preferredDate', 'preferredTime', 'notes', 'status'].includes(f.key)
                );
                const residentFields = fields.filter(f => 
                  f.key.toLowerCase().includes('resident') || f.key.toLowerCase().includes('name') || f.key.toLowerCase().includes('contact')
                );
                const dateFields = fields.filter(f => 
                  (f.key.toLowerCase().includes('date') || f.key.toLowerCase().includes('time') || f.key.toLowerCase().includes('at')) &&
                  !scheduleFields.includes(f) && !residentFields.includes(f)
                );
                const otherFields = fields.filter(f => 
                  !scheduleFields.includes(f) && !residentFields.includes(f) && !dateFields.includes(f)
                );
                
                let html = '';
                
                // Schedule Information
                if (scheduleFields.length > 0) {
                  html += '<h4>Schedule Information</h4>';
                  scheduleFields.forEach(f => {
                    html += `
                      <div class="drawer-field-health">
                        <div class="drawer-field-label-health">${escape(f.label)}</div>
                        <div class="drawer-field-value-health">${escape(f.value)}</div>
                      </div>
                    `;
                  });
                }
                
                // Resident Information
                if (residentFields.length > 0) {
                  html += '<h4>Resident Information</h4>';
                  residentFields.forEach(f => {
                    html += `
                      <div class="drawer-field-health">
                        <div class="drawer-field-label-health">${escape(f.label)}</div>
                        <div class="drawer-field-value-health">${escape(f.value)}</div>
                      </div>
                    `;
                  });
                }
                
                // Other Important Fields
                if (otherFields.length > 0) {
                  html += '<h4>Additional Information</h4>';
                  otherFields.forEach(f => {
                    html += `
                      <div class="drawer-field-health">
                        <div class="drawer-field-label-health">${escape(f.label)}</div>
                        <div class="drawer-field-value-health">${escape(f.value)}</div>
                      </div>
                    `;
                  });
                }
                
                // Date Information
                if (dateFields.length > 0) {
                  html += '<h4>Timeline</h4>';
                  dateFields.forEach(f => {
                    html += `
                      <div class="drawer-field-health">
                        <div class="drawer-field-label-health">${escape(f.label)}</div>
                        <div class="drawer-field-value-health">${escape(f.value)}</div>
                      </div>
                    `;
                  });
                }
                
                // Metadata
                const metaFields = fields.filter(f => 
                  f.key.toLowerCase().includes('created') || f.key.toLowerCase().includes('updated')
                );
                if (metaFields.length > 0) {
                  html += '<div class="drawer-meta-health">';
                  metaFields.forEach(f => {
                    html += `
                      <div class="drawer-meta-item-health">
                        <div class="drawer-meta-label-health">${escape(f.label)}</div>
                        <div class="drawer-meta-value-health">${escape(f.value)}</div>
                      </div>
                    `;
                  });
                  html += '</div>';
                }
                
                dBody.innerHTML = html || '<p class="text-muted">No information available.</p>';
              }

              if (drawer) {
                drawer.classList.remove('hidden');
                drawer.classList.add('active');
                drawer.style.setProperty('pointer-events', 'auto', 'important');
                drawer.style.setProperty('display', 'flex', 'important');
                drawer.style.setProperty('z-index', '10000', 'important');
              }
            } catch(e) {
              console.error('View error:', e);
              alert('Failed to load record details');
            }
          }
        });
      }
    }

    // Drawer close
    if (dClose) {
      const newDClose = dClose.cloneNode(true);
      dClose.parentNode.replaceChild(newDClose, dClose);
      dClose = newDClose;
      newDClose.onclick = () => {
        const currentDrawer = document.getElementById('drawer');
        if (currentDrawer) {
          currentDrawer.classList.remove('active');
          currentDrawer.classList.add('hidden');
          currentDrawer.style.removeProperty('pointer-events');
          currentDrawer.style.removeProperty('display');
          currentDrawer.style.removeProperty('z-index');
        }
      };
    }

    // Drawer overlay
    const currentDrawer = document.getElementById('drawer');
    if (currentDrawer) {
      const backdrop = currentDrawer.querySelector('.drawer-backdrop-health');
      if (backdrop) {
        const newBackdrop = backdrop.cloneNode(true);
        backdrop.parentNode.replaceChild(newBackdrop, backdrop);
        newBackdrop.onclick = () => {
          const drawerEl = document.getElementById('drawer');
          if (drawerEl) {
            drawerEl.classList.remove('active');
            drawerEl.classList.add('hidden');
            drawerEl.style.removeProperty('pointer-events');
            drawerEl.style.removeProperty('display');
            drawerEl.style.removeProperty('z-index');
          }
        };
      }
    }

    // Schedule preference submit function (shared by button and Enter key)
    const submitSchedule = async () => {
      if (!scheduleForm || !scheduleMsg) return;
      
      scheduleMsg.textContent = '';
      const fd = new FormData(scheduleForm);
      const body = Object.fromEntries(fd.entries());

      if (!body.type || !body.preferredDate) {
        scheduleMsg.textContent = 'Please select a checkup type and preferred date.';
        scheduleMsg.style.color = '#1e40af';
        return;
      }

      try {
        const res = await fetch('/api/health/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body)
        });
        
        // Check if response is JSON
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          console.error('Non-JSON response:', text.substring(0, 200));
          throw new Error('Server returned an error. Please try again or contact support.');
        }
        
        const j = await res.json();
        if (!res.ok || !j.ok) {
          throw new Error(j.message || 'Failed to submit schedule.');
        }
        scheduleMsg.textContent = 'Your schedule preference has been submitted. The health center will confirm your final schedule.';
        scheduleMsg.style.color = '#2563eb';
        scheduleForm.reset();
        // Reload schedules tab if currently viewing it
        if (currentTab === 'schedules') {
          load();
        }
      } catch (e) {
        console.error('Schedule submit error:', e);
        scheduleMsg.textContent = e.message || 'Failed to submit schedule preference.';
        scheduleMsg.style.color = '#1e40af';
      }
    };

    // Schedule preference submit button
    const btnSubmitSchedule = document.getElementById('btnSubmitSchedule');
    if (scheduleForm && scheduleMsg) {
      if (btnSubmitSchedule) {
        // Clone to remove old listeners
        const newBtnSubmit = btnSubmitSchedule.cloneNode(true);
        btnSubmitSchedule.parentNode.replaceChild(newBtnSubmit, btnSubmitSchedule);
        
        // Force button to be visible with inline styles (override any CSS)
        newBtnSubmit.style.cssText = `
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 10px 20px !important;
          background-color: #3498db !important;
          color: white !important;
          border: none !important;
          border-radius: 10px !important;
          font-size: 0.875rem !important;
          font-weight: 500 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          pointer-events: auto !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 1 !important;
          min-width: 150px !important;
        `;
        
        newBtnSubmit.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('User health: Submit schedule button clicked');
          submitSchedule();
        });
        
        console.log('User health: Submit schedule button initialized');
      } else {
        console.warn('User health: btnSubmitSchedule not found');
      }
      
      // Add Enter key support to all form fields
      if (scheduleForm) {
        const formFields = scheduleForm.querySelectorAll('input, select, textarea');
        formFields.forEach(field => {
          // Clone to remove old listeners
          const newField = field.cloneNode(true);
          field.parentNode.replaceChild(newField, field);
          
          newField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitSchedule();
            }
          });
        });
      }
      
      // Also handle form submit event (in case form is submitted normally)
      if (scheduleForm) {
        scheduleForm.addEventListener('submit', (e) => {
          e.preventDefault();
          submitSchedule();
        });
      }
    }
  }

  // Main init function
  async function init() {
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) {
      console.warn('User health: Content area not found');
      return;
    }

    // Re-query all DOM elements
    tableHead = contentArea.querySelector('#tableHead') || document.getElementById('tableHead');
    tableBody = contentArea.querySelector('#tableBody') || document.getElementById('tableBody');
    pager = contentArea.querySelector('#pager') || document.getElementById('pager');
    drawer = document.getElementById('drawer');
    dBody = document.getElementById('dBody');
    dClose = document.getElementById('dClose');
    dRecordId = document.getElementById('dRecordId');
    dStatus = document.getElementById('dStatus');
    tabs = contentArea.querySelector('#tabs') || document.getElementById('tabs');
    scheduleForm = document.getElementById('frmSchedule');
    scheduleMsg = document.getElementById('scheduleMsg');

    // Setup event listeners
    setupEventListeners();

    // Initialize user
    await initUser();
    
    // Reset to default tab
    currentTab = 'patient-data';
    
    // Load data
    refreshSummary();
    load();
  }

  // Expose init function for router
  window.initUserHealth = init;

  // Auto-initialize ONLY for direct page loads (not SPA navigation)
  const isSPAMode = window.__ROUTER_INITIALIZED__;
  
  if (!isSPAMode) {
    // Direct page load (not via router) - auto-initialize
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 50);
    }
  } else {
    // SPA mode - router will call initUserHealth, don't auto-init
    console.log('User health: SPA mode detected, waiting for router to call initUserHealth');
  }
})();
