// public/user/user-disaster.js - User-specific version
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>p.querySelectorAll(s);
  
  // DOM element references - will be re-queried in init()
  let tableHead, tableBody, pager, modal, frm, msg, tabs;
  let drawer, dBody, dClose, dRecordId, dStatus, alertBanner;

  let user = null;
  let currentTab = 'incidents';
  let isAdmin = false;

  let state = { 
    page: 1, 
    limit: 10, 
    status: '', 
    q: '', 
    from: '', 
    to: '', 
    sort: 'desc',
    type: ''
  };

  const badge = s => {
    const map = {
      'Pending': 'bg-pending',
      'Ongoing': 'bg-ongoing',
      'Resolved': 'bg-resolved',
      'Critical': 'bg-critical'
    };
    const cls = map[s] || 'bg-ghost-btn text-primary-btn';
    return `<span class="px-2 py-1 rounded-2xl text-xs font-bold ${cls}">${s}</span>`;
  };
  const fmt = d => d ? new Date(d).toLocaleString() : '';

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      ...opts
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!res.ok) {
      const msg = data.message || res.statusText || 'Request failed';
      throw new Error(msg);
    }
    return data;
  }

  async function initUser(){
    try{
      const j = await fetchJSON('/api/me');
      user = j.user || null;
      if(!user){ location.href='/login'; return; }
      
      isAdmin = /^(admin)$/i.test(user.role||'') || user.isAdmin===true || user.type==='admin' || user.accountType==='admin';
      
      // Redirect if accessing wrong route
      if (isAdmin) {
        location.href='/admin/disaster';
        return;
      }
      
      $('#username').textContent = user.name || 'User';
      $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
      
    }catch{ location.href='/login'; }
  }

  async function logout(){ 
    await fetch('/api/logout',{method:'POST'}); 
    location.href='/login'; 
  }
  window.logout = logout;

  function setSummary(sum){
    $('#sTotal').textContent = sum.Total || 0;
    $('#sCritical').textContent = sum.Critical || 0;
    $('#sOngoing').textContent = sum.Ongoing || 0;
    $('#sResolved').textContent = sum.Resolved || 0;
  }

  async function refreshSummary(){
    try{
      const j = await fetchJSON('/api/disaster/summary?mine=true');
      if (j.ok) setSummary(j.summary || {});
    }catch{}
  }

  async function loadAlerts(){
    try{
      const j = await fetchJSON('/api/disaster/alerts');
      if (j.items && j.items.length > 0) {
        const alert = j.items[0];
        $('#alertTitle').textContent = alert.title || 'Emergency Alert';
        $('#alertMessage').textContent = alert.message || '';
        alertBanner.classList.remove('hidden');
      } else {
        alertBanner.classList.add('hidden');
      }
    }catch{}
  }

  function switchTab(tabName) {
    currentTab = tabName;
    
    $$('.tab').forEach(t => {
      t.classList.remove('active', 'text-[#e74c3c]', 'border-[#e74c3c]', 'font-semibold');
      t.classList.add('text-[#7f8c8d]', 'border-transparent');
    });
    const activeTab = $(`.tab[data-tab="${tabName}"]`);
    if (activeTab) {
      activeTab.classList.add('active', 'text-[#e74c3c]', 'border-[#e74c3c]', 'font-semibold');
      activeTab.classList.remove('text-[#7f8c8d]', 'border-transparent');
    }
    
    state.page = 1;
    load();
  }

  async function load(){
    if (currentTab === 'announcements') {
      loadAnnouncements();
      return;
    }
    if (currentTab === 'contacts') {
      loadContacts();
      return;
    }

    const qs = new URLSearchParams({
      page: state.page,
      limit: state.limit,
      status: state.status,
      q: state.q,
      from: state.from,
      to: state.to,
      sort: state.sort,
      type: state.type,
      mine: 'true'
    }).toString();

    try {
      const j = await fetchJSON('/api/disaster/incidents?' + qs);
      renderTable(j.rows || []);
      renderPager(j.page, j.totalPages, j.total);
      refreshSummary();
    } catch(e) {
      console.error('Load error:', e);
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">No records found.</td></tr>';
    }
  }

  function renderTable(rows){
    tableHead.innerHTML = '<tr><th>Type</th><th>Location</th><th>Date & Time</th><th>Status</th><th>Actions</th></tr>';
    
    tableBody.innerHTML = '';
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 24px; color: #6b7280;">No records found.</td></tr>';
      return;
    }

    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.type || '-'}</td>
        <td>${r.location || '-'}</td>
        <td>${fmt(r.dateTime || r.createdAt)}</td>
        <td>${badge(r.status || 'Pending')}</td>
        <td>
          <button class="action-btn-view" data-act="view" data-id="${r._id}">
            <i class="fas fa-eye"></i>
            <span>View</span>
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  function loadAnnouncements(){
    tableHead.innerHTML = '<tr><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Title</th><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Message</th><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Date</th></tr>';
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-muted">Loading announcements...</td></tr>';
    
    fetchJSON('/api/disaster/announcements').then(j => {
      if (j.items && j.items.length) {
        tableBody.innerHTML = j.items.map(a => `
          <tr class="border-b border-[#f2f3f4] hover:bg-[#fbfcfd]">
            <td class="px-3 py-3 text-sm font-semibold">${a.title || '-'}</td>
            <td class="px-3 py-3 text-sm">${a.message || '-'}</td>
            <td class="px-3 py-3 text-sm">${fmt(a.createdAt)}</td>
          </tr>
        `).join('');
      } else {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-muted">No announcements available.</td></tr>';
      }
    }).catch(() => {
      tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-muted">No announcements available.</td></tr>';
    });
  }

  function loadContacts(){
    tableHead.innerHTML = '<tr><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Department/Service</th><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Contact Number</th><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Email</th></tr>';
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-muted">Loading contacts...</td></tr>';
    
    fetchJSON('/api/disaster/contacts').then(j => {
      if (j.items && j.items.length) {
        tableBody.innerHTML = j.items.map(c => `
          <tr class="border-b border-[#f2f3f4] hover:bg-[#fbfcfd]">
            <td class="px-3 py-3 text-sm font-semibold">${c.name || '-'}</td>
            <td class="px-3 py-3 text-sm">${c.phone || '-'}</td>
            <td class="px-3 py-3 text-sm">${c.email || '-'}</td>
          </tr>
        `).join('');
      } else {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-muted">No contacts available.</td></tr>';
      }
    }).catch(() => {
      tableBody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-muted">No contacts available.</td></tr>';
    });
  }

  function renderPager(page, totalPages, total){
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

  // Setup event listeners
  function setupEventListeners() {
    // Tabs
    if (tabs) {
      tabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        switchTab(tab.getAttribute('data-tab'));
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

    // Emergency button
    const btnEmergency = $('#btnEmergency');
    if (btnEmergency) {
      console.log('User disaster: btnEmergency found, attaching handler');
      btnEmergency.onclick = () => {
        console.log('User disaster: Emergency button clicked');
        if (!modal || !frm) {
          console.error('Modal or form not found', { modal: !!modal, frm: !!frm });
          return;
        }
        // Remove any conflicting classes and inline styles
        modal.classList.remove('hidden', 'show', 'open', 'flex', 'block');
        modal.style.removeProperty('display');
        modal.style.removeProperty('visibility');
        modal.style.removeProperty('opacity');
        
        frm.reset();
        if (msg) msg.textContent = '';
        const dlgTitle = $('#dlgTitle');
        if (dlgTitle) dlgTitle.textContent = 'Report Emergency';
        
        // Add active class
        modal.classList.add('active');
        
        // Force a reflow to ensure CSS is applied
        void modal.offsetHeight;
        
        // Verify and force display if needed
        const computed = window.getComputedStyle(modal);
        if (computed.display === 'none') {
          console.warn('User disaster: CSS display is none, forcing flex');
          modal.style.display = 'flex';
        }
        
        console.log('User disaster: Modal opened', {
          hasActive: modal.classList.contains('active'),
          classes: modal.className,
          display: window.getComputedStyle(modal).display,
          zIndex: window.getComputedStyle(modal).zIndex,
          visibility: window.getComputedStyle(modal).visibility,
          opacity: window.getComputedStyle(modal).opacity,
          inlineDisplay: modal.style.display
        });
      };
    } else {
      console.warn('User disaster: btnEmergency not found');
    }

    // Incident button
    const btnIncident = $('#btnIncident');
    if (btnIncident) {
      console.log('User disaster: btnIncident found, attaching handler');
      btnIncident.onclick = () => {
        console.log('User disaster: Incident button clicked');
        if (!modal || !frm) {
          console.error('Modal or form not found', { modal: !!modal, frm: !!frm });
          return;
        }
        // Remove any conflicting classes and inline styles
        modal.classList.remove('hidden', 'show', 'open', 'flex', 'block');
        modal.style.removeProperty('display');
        modal.style.removeProperty('visibility');
        modal.style.removeProperty('opacity');
        
        frm.reset();
        if (msg) msg.textContent = '';
        const dlgTitle = $('#dlgTitle');
        if (dlgTitle) dlgTitle.textContent = 'Log Incident';
        
        // Add active class
        modal.classList.add('active');
        
        // Force a reflow to ensure CSS is applied
        void modal.offsetHeight;
        
        // Verify and force display if needed
        const computed = window.getComputedStyle(modal);
        if (computed.display === 'none') {
          console.warn('User disaster: CSS display is none, forcing flex');
          modal.style.display = 'flex';
        }
        
        console.log('User disaster: Modal opened', {
          hasActive: modal.classList.contains('active'),
          classes: modal.className,
          display: window.getComputedStyle(modal).display,
          zIndex: window.getComputedStyle(modal).zIndex,
          visibility: window.getComputedStyle(modal).visibility,
          opacity: window.getComputedStyle(modal).opacity,
          inlineDisplay: modal.style.display
        });
      };
    } else {
      console.warn('User disaster: btnIncident not found');
    }

    // Cancel button
    const btnCancel = $('#btnCancel');
    if (btnCancel) {
      btnCancel.onclick = () => {
        if (modal) {
          modal.classList.remove('active');
        }
      };
    }

    // Save button
    const btnSave = $('#btnSave');
    if (btnSave) {
      btnSave.onclick = async () => {
        if (!frm) {
          console.error('Form not found');
          return;
        }
        const fd = new FormData(frm);

        // Basic required validation (excluding optional file)
        const required = ['type','location','description','reporterName','contact'];
        let hasError = false;
        required.forEach(name => {
          const v = (fd.get(name) || '').toString().trim();
          if (!v) hasError = true;
        });
        if (hasError) {
          if (msg) msg.textContent = 'Please fill all required fields.';
          return;
        }

        try{
          const res = await fetch('/api/disaster/incidents', { method:'POST', body: fd });
          const j = await res.json().catch(()=>({}));
          if(!res.ok || !j.ok){
            if (msg) msg.textContent = j.message || 'Failed to submit report.';
            return;
          }
          if (modal) {
            modal.classList.remove('active');
          }
          load();
          refreshSummary();
          if (msg) msg.textContent = '';
        }catch(e){
          if (msg) msg.textContent = e.message || 'Failed to submit report.';
        }
      };
    }

    // Table body click handler
    if (tableBody) {
      tableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');

    if (act === 'view') {
      try {
        // Re-query drawer elements to ensure fresh references
        const currentDrawer = document.getElementById('drawer');
        const currentDBody = document.getElementById('dBody');
        const currentDRecordId = document.getElementById('dRecordId');
        const currentDStatus = document.getElementById('dStatus');
        
        if (!currentDrawer || !currentDBody) {
          console.error('User disaster: Drawer elements not found');
          return;
        }
        
        const j = await fetchJSON(`/api/disaster/incidents/${id}`, { credentials: 'include' });
        if (!j.ok) {
          alert('Record not found');
          return;
        }
        const r = j.row;
        
        if (currentDRecordId) currentDRecordId.textContent = r.incidentId || r._id || 'Report';
        const status = r.status || 'Pending';
        const statusMap = {
          'Pending': 'bg-pending',
          'Ongoing': 'bg-ongoing',
          'Resolved': 'bg-resolved',
          'Critical': 'bg-critical'
        };
        const statusClass = statusMap[status] || 'bg-pending';
        if (currentDStatus) {
          currentDStatus.className = 'badge ' + statusClass;
          currentDStatus.textContent = status;
        }

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
        const excludedFields = ['_id', 'incidentId', '__v'];
        const fields = Object.entries(r)
          .filter(([k]) => !k.startsWith('_') && !excludedFields.includes(k))
          .map(([k, v]) => ({
            key: k,
            label: formatFieldName(k),
            value: formatValue(k, v),
            isImportant: ['type', 'location', 'status', 'description'].includes(k)
          }));
        
        // Group fields by category
        const incidentFields = fields.filter(f => 
          ['type', 'typeOther', 'location', 'status'].includes(f.key)
        );
        const reporterFields = fields.filter(f => 
          f.key.toLowerCase().includes('reporter') || f.key.toLowerCase().includes('contact') || f.key.toLowerCase().includes('name')
        );
        const impactFields = fields.filter(f => 
          f.key.toLowerCase().includes('affected') || f.key.toLowerCase().includes('casualt') || f.key.toLowerCase().includes('injur')
        );
        const planFields = fields.filter(f => 
          f.key.toLowerCase().includes('plan') || f.key.toLowerCase().includes('file')
        );
        const otherFields = fields.filter(f => 
          !incidentFields.includes(f) && !reporterFields.includes(f) && !impactFields.includes(f) && !planFields.includes(f) && f.key !== 'description'
        );
        
        let html = '';
        
        // Incident Information
        if (incidentFields.length > 0) {
          html += '<h4>Incident Information</h4>';
          incidentFields.forEach(f => {
            html += `
              <div class="drawer-field-disaster">
                <div class="drawer-field-label-disaster">${escape(f.label)}</div>
                <div class="drawer-field-value-disaster">${escape(f.value)}</div>
              </div>
            `;
          });
        }
        
        // Description
        if (r.description) {
          html += '<h4>Description</h4>';
          html += `<div class="drawer-description-disaster">${escape(r.description)}</div>`;
        }
        
        // Reporter Information
        if (reporterFields.length > 0) {
          html += '<h4>Reporter Information</h4>';
          reporterFields.forEach(f => {
            html += `
              <div class="drawer-field-disaster">
                <div class="drawer-field-label-disaster">${escape(f.label)}</div>
                <div class="drawer-field-value-disaster">${escape(f.value)}</div>
              </div>
            `;
          });
        }
        
        // Impact Information
        if (impactFields.length > 0) {
          html += '<h4>Impact Information</h4>';
          impactFields.forEach(f => {
            html += `
              <div class="drawer-field-disaster">
                <div class="drawer-field-label-disaster">${escape(f.label)}</div>
                <div class="drawer-field-value-disaster">${escape(f.value)}</div>
              </div>
            `;
          });
        }
        
        // Preparedness Plan
        if (planFields.length > 0) {
          html += '<h4>Preparedness Plan</h4>';
          planFields.forEach(f => {
            html += `
              <div class="drawer-field-disaster">
                <div class="drawer-field-label-disaster">${escape(f.label)}</div>
                <div class="drawer-field-value-disaster">${escape(f.value)}</div>
              </div>
            `;
          });
        }
        
        // Other Information
        if (otherFields.length > 0) {
          html += '<h4>Additional Information</h4>';
          otherFields.forEach(f => {
            html += `
              <div class="drawer-field-disaster">
                <div class="drawer-field-label-disaster">${escape(f.label)}</div>
                <div class="drawer-field-value-disaster">${escape(f.value)}</div>
              </div>
            `;
          });
        }
        
        // Metadata
        const metaFields = fields.filter(f => 
          f.key.toLowerCase().includes('created') || f.key.toLowerCase().includes('updated')
        );
        if (metaFields.length > 0) {
          html += '<div class="drawer-meta-disaster">';
          metaFields.forEach(f => {
            html += `
              <div class="drawer-meta-item-disaster">
                <div class="drawer-meta-label-disaster">${escape(f.label)}</div>
                <div class="drawer-meta-value-disaster">${escape(f.value)}</div>
              </div>
            `;
          });
          html += '</div>';
        }
        
        currentDBody.innerHTML = html || '<p class="text-muted">No information available.</p>';
        
        // Open drawer with correct class
        currentDrawer.classList.remove('hidden');
        currentDrawer.classList.add('active');
        currentDrawer.style.setProperty('pointer-events', 'auto', 'important');
        currentDrawer.style.setProperty('display', 'flex', 'important');
        currentDrawer.style.setProperty('z-index', '10000', 'important');
        console.log('User disaster: Drawer opened');
      } catch(e) {
        console.error('User disaster: Error loading incident details:', e);
        alert('Failed to load record details: ' + (e.message || 'Unknown error'));
      }
    }
      });
    }

    // Drawer close handlers - re-query to get fresh reference
    const currentDClose = document.getElementById('dClose');
    if (currentDClose) {
      const newDClose = currentDClose.cloneNode(true);
      currentDClose.parentNode.replaceChild(newDClose, currentDClose);
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

    const currentDrawer = document.getElementById('drawer');
    if (currentDrawer) {
      const backdrop = currentDrawer.querySelector('.drawer-backdrop');
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
  }

  // Main initialization function
  async function init() {
    console.log('User disaster: Initializing...');
    
    // Re-query all DOM elements (they may not exist yet in SPA mode)
    const contentArea = document.querySelector('.content-area');
    tableHead = contentArea?.querySelector('#tableHead') || $('#tableHead');
    tableBody = contentArea?.querySelector('#tableBody') || $('#tableBody');
    pager = contentArea?.querySelector('#pager') || $('#pager');
    modal = document.getElementById('modal') || $('#modal');
    frm = document.getElementById('frm') || $('#frm');
    msg = document.getElementById('msg') || $('#msg');
    tabs = contentArea?.querySelector('#tabs') || $('#tabs');
    drawer = document.getElementById('drawer') || $('#drawer');
    dBody = document.getElementById('dBody') || $('#dBody');
    dClose = document.getElementById('dClose') || $('#dClose');
    dRecordId = document.getElementById('dRecordId') || $('#dRecordId');
    dStatus = document.getElementById('dStatus') || $('#dStatus');
    alertBanner = document.getElementById('alertBanner') || $('#alertBanner');

    console.log('User disaster: DOM elements queried', {
      btnEmergency: !!$('#btnEmergency'),
      btnIncident: !!$('#btnIncident'),
      modal: !!modal,
      frm: !!frm
    });

    // Setup event listeners
    setupEventListeners();

    // Initialize user
    await initUser();
    
    // Load data
    refreshSummary();
    loadAlerts();
    load();

    // Dynamic fields: Others + plan upload + disaster-prone areas
    (function wireDynamic(){
      const typeSel = document.getElementById('uTypeSelect');
      const typeOtherRow = document.getElementById('uTypeOtherRow');
      const hasPlan = document.getElementById('uHasPlan');
      const planRow = document.getElementById('uPlanRow');
      const locInput = document.getElementById('uLocation');

      if (typeSel && typeOtherRow) {
        typeSel.addEventListener('change', () => {
          if (typeSel.value === 'Others') {
            typeOtherRow.classList.remove('hidden');
          } else {
            typeOtherRow.classList.add('hidden');
          }
        });
      }

      if (hasPlan && planRow) {
        hasPlan.addEventListener('change', () => {
          if (hasPlan.value === 'Yes') {
            planRow.classList.remove('hidden');
          } else {
            planRow.classList.add('hidden');
            const f = planRow.querySelector('input[type="file"]');
            if (f) f.value = '';
          }
        });
      }

      if (locInput) {
        fetchJSON('/api/disaster/areas?riskLevel=High').then(j => {
          if (!j.ok || !Array.isArray(j.items) || !j.items.length) return;
          const listId = 'userDisasterAreas';
          let dl = document.getElementById(listId);
          if (!dl) {
            dl = document.createElement('datalist');
            dl.id = listId;
            document.body.appendChild(dl);
          }
          dl.innerHTML = j.items.map(a => `<option value="${a.area || ''}">${(a.area || '')} (${a.riskLevel || 'Risk'})</option>`).join('');
          locInput.setAttribute('list', listId);
        }).catch(()=>{});
      }
    })();

    console.log('User disaster: Initialization complete');
  }

  // Expose init function for router (both names for compatibility)
  window.initUserDisaster = init;
  window.initDisaster = init; // Also expose as initDisaster for router compatibility

  // Auto-initialize ONLY for direct page loads (not SPA navigation)
  const isSPAMode = window.__ROUTER_INITIALIZED__ || window.location.pathname.includes('/user/');
  
  if (!isSPAMode) {
    // Direct page load (not via router)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 50);
    }
  } else {
    // SPA mode - router will call initDisaster, don't auto-init
    console.log('User disaster: SPA mode detected, waiting for router to call initDisaster');
  }
})();

