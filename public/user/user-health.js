// public/user/user-health.js - User-specific version (view own records only)
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>p.querySelectorAll(s);
  
  const tableHead = $('#tableHead');
  const tableBody = $('#tableBody');
  const pager = $('#pager');
  const drawer = $('#drawer');
  const dBody = $('#dBody');
  const dClose = $('#dClose');
  const dRecordId = $('#dRecordId');
  const dStatus = $('#dStatus');
  const tabs = $('#tabs');
  const scheduleForm = $('#frmSchedule');
  const scheduleMsg = $('#scheduleMsg');

  let user = null;
  let currentTab = 'patient-data';
  let isAdmin = false;

  // Tab configurations
  const tabConfigs = {
    'patient-data': {
      title: 'Patient Data Records',
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
      
      $('#username').textContent = user.name || 'User';
      $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
      
    }catch{ location.href='/login'; }
  }

  async function logout(){ 
    await fetch('/api/logout',{method:'POST'}); 
    location.href='/login'; 
  }
  window.logout = logout;

  // Summary statistics
  function setSummary(sum){
    $('#sTotal').textContent = sum.Total || 0;
    $('#sActive').textContent = sum.Active || 0;
    $('#sScheduled').textContent = sum.Scheduled || 0;
    $('#sCompleted').textContent = sum.Completed || 0;
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
    
    // Remove active state from all tabs (CSS handles the styling via .active class)
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
      tableBody.innerHTML = '<tr><td colspan="' + config.headers.length + '" class="text-center p-4 text-muted">No records found.</td></tr>';
    }
  }

  function renderTable(headers, rows){
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
      
      tr.innerHTML = cells + `<td><button class="px-3 py-1.5 rounded-lg border-none cursor-pointer bg-ghost-btn text-primary-btn font-medium hover:opacity-90 transition-opacity text-sm" data-act="view" data-id="${r._id}">View</button></td>`;
      tableBody.appendChild(tr);
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

  // Event listeners
  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    switchTab(tab.getAttribute('data-tab'));
  });

  $('#btnFilter').onclick = () => {
    state.from = $('#fFrom').value || '';
    state.to = $('#fTo').value || '';
    state.q = $('#fQ').value.trim();
    state.status = $('#fStatus').value || '';
    state.page = 1;
    load();
  };

  tableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
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
        
        dRecordId.textContent = r.recordId || r._id;
        dStatus.className = 'px-2 py-1 rounded-2xl text-xs font-bold ' + (badge(r.status || 'Active').match(/class="([^"]+)"/)?.[1] || 'bg-active');
        dStatus.textContent = r.status || 'Active';

        dBody.innerHTML = Object.entries(r).filter(([k]) => !k.startsWith('_') && k !== 'recordId').map(([k, v]) => 
          `<div class="grid grid-cols-[140px_1fr] gap-2 mb-2">
            <div class="text-[#7f8c8d] text-sm">${k.replace(/([A-Z])/g, ' $1').trim()}</div>
            <div class="text-[#2c3e50]">${v || '-'}</div>
          </div>`
        ).join('');

        drawer.classList.remove('hidden');
        drawer.classList.add('flex');
      } catch(e) {
        alert('Failed to load record details');
      }
    }
  });

  dClose.onclick = () => {
    drawer.classList.remove('flex');
    drawer.classList.add('hidden');
  };

  drawer.querySelector('.overlay').onclick = () => {
    drawer.classList.remove('flex');
    drawer.classList.add('hidden');
  };

  // Schedule preference submit
  if (scheduleForm && scheduleMsg) {
    $('#btnSubmitSchedule')?.addEventListener('click', async () => {
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
          credentials: 'include', // Important for session cookies
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
      } catch (e) {
        console.error('Schedule submit error:', e);
        scheduleMsg.textContent = e.message || 'Failed to submit schedule preference.';
        scheduleMsg.style.color = '#1e40af';
      }
    });
  }

  // Init
  initUser();
  refreshSummary();
  load();
})();

