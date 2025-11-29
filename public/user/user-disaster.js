// public/user/user-disaster.js - User-specific version
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>p.querySelectorAll(s);
  
  const tableHead = $('#tableHead');
  const tableBody = $('#tableBody');
  const pager = $('#pager');
  const modal = $('#modal');
  const frm = $('#frm');
  const msg = $('#msg');
  const tabs = $('#tabs');
  const drawer = $('#drawer');
  const dBody = $('#dBody');
  const dClose = $('#dClose');
  const dRecordId = $('#dRecordId');
  const dStatus = $('#dStatus');
  const alertBanner = $('#alertBanner');

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
    const res = await fetch(url, opts);
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
    tableHead.innerHTML = '<tr><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Type</th><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Location</th><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Date & Time</th><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold">Status</th><th class="px-3 py-3 text-left text-xs text-[#7f8c8d] font-semibold w-[100px]">Actions</th></tr>';
    
    tableBody.innerHTML = '';
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">No records found.</td></tr>';
      return;
    }

    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-[#f2f3f4] hover:bg-[#fbfcfd]';
      tr.innerHTML = `
        <td class="px-3 py-3 text-sm">${r.type || '-'}</td>
        <td class="px-3 py-3 text-sm">${r.location || '-'}</td>
        <td class="px-3 py-3 text-sm">${fmt(r.dateTime || r.createdAt)}</td>
        <td class="px-3 py-3 text-sm">${badge(r.status || 'Pending')}</td>
        <td class="px-3 py-3">
          <button class="px-3 py-1.5 rounded-lg border-none cursor-pointer bg-ghost-btn text-primary-btn font-medium hover:opacity-90 transition-opacity text-sm" data-act="view" data-id="${r._id}">View</button>
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

  $('#btnEmergency').onclick = () => {
    frm.reset();
    msg.textContent = '';
    $('#dlgTitle').textContent = 'Report Emergency';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  };

  $('#btnIncident').onclick = () => {
    frm.reset();
    msg.textContent = '';
    $('#dlgTitle').textContent = 'Log Incident';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  };

  $('#btnCancel').onclick = () => {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  };

  $('#btnSave').onclick = async () => {
    const fd = new FormData(frm);
    const body = Object.fromEntries(fd.entries());
    if (!body.type || !body.location || !body.description || !body.reporterName || !body.contact) {
      msg.textContent = 'Please fill all required fields.';
      return;
    }
    try{
      const j = await fetchJSON('/api/disaster/incidents', { method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
      if(!j.ok){ msg.textContent=j.message || 'Failed to submit report.'; return; }
      modal.classList.remove('flex');
      modal.classList.add('hidden');
      load();
      refreshSummary();
    }catch(e){
      msg.textContent=e.message || 'Failed to submit report.';
    }
  };

  tableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');

    if (act === 'view') {
      try {
        const j = await fetchJSON(`/api/disaster/incidents/${id}`);
        if (!j.ok) return alert('Record not found');
        const r = j.row;
        
        dRecordId.textContent = r.incidentId || r._id;
        dStatus.className = 'px-2 py-1 rounded-2xl text-xs font-bold ' + (badge(r.status || 'Pending').match(/class="([^"]+)"/)?.[1] || 'bg-pending');
        dStatus.textContent = r.status || 'Pending';

        dBody.innerHTML = Object.entries(r).filter(([k]) => !k.startsWith('_') && k !== 'incidentId').map(([k, v]) => 
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

  // Init
  initUser();
  refreshSummary();
  loadAlerts();
  load();
})();

