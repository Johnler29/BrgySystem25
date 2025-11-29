// public/user-cases.js - User-specific version (no admin features)
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const tblBody = $('#tbl tbody');
  const pager   = $('#pager');
  const modal   = $('#modal');
  const frm     = $('#frm');
  const msg     = $('#msg');
  const typeSel = $('#typeOfCase');
  const fType   = $('#fType');
  const fPriority = $('#fPriority');

  const notifBtn   = document.getElementById('notifBtn');
  const notifPanel = document.getElementById('notifPanel');
  const notifList  = document.getElementById('notifList');
  const notifEmpty = document.getElementById('notifEmpty');
  const notifDot   = document.getElementById('notifDot');
  const notifMarkAll = document.getElementById('notifMarkAll');

  const drawer  = $('#drawer');
  const dBody   = $('#dBody');
  const dClose  = $('#dClose');
  const dCaseId = $('#dCaseId');
  const dStatus = $('#dStatus');

  let user = null;
  let isAdmin = false;

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
      
      // Check if user is admin - redirect to admin route
      isAdmin = /^(admin)$/i.test(user.role||'') || user.isAdmin===true || user.type==='admin' || user.accountType==='admin';
      if (isAdmin) {
        location.href='/admin/cases';
        return;
      }
      
      $('#username').textContent = user.name || 'User';
      $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
    }catch{ location.href='/login'; }
  }
  async function logout(){ await fetch('/api/logout',{method:'POST'}); location.href='/login'; }
  window.logout = logout;

  async function loadCaseTypes(){
    try{
      const j = await fetchJSON('/api/case-types');
      (j.items || []).forEach(v=>{
        const o=document.createElement('option'); o.value=v; o.textContent=v; typeSel.appendChild(o);
        if (fType) {
          const o2=document.createElement('option'); o2.value=v; o2.textContent=v; fType.appendChild(o2);
        }
      });
    }catch{}
  }

  //---- state + helpers
  let state = { page:1, limit:10, status:'', q:'', from:'', to:'', sort:'desc', type:'', priority:'' };
  const badge = s => {
    const map = {
      'Pending': 'bg-pending',
      'Ongoing': 'bg-ongoing',
      'Resolved': 'bg-resolved',
      'Cancelled': 'bg-cancelled'
    };
    const cls = map[s] || 'bg-ghost-btn text-primary-btn';
    return `<span class="px-2 py-1 rounded-2xl text-xs font-bold ${cls}">${s}</span>`;
  };
  const fmt   = d => d ? new Date(d).toLocaleString() : '';

  function setSummary(sum){
    $('#sTotal').textContent    = sum.Total || 0;
    $('#sPending').textContent  = sum.Reported || sum.Pending || 0;
    $('#sOngoing').textContent  = sum.Ongoing || 0;
    $('#sResolved').textContent = sum.Resolved || 0;
  }
  async function refreshSummary(){
    try{
      const j = await fetchJSON('/api/cases/summary');
      if (j.ok) setSummary(j.summary || {});
    }catch{}
  }

  async function load(){
    const qs = new URLSearchParams({
      page: state.page,
      limit: state.limit,
      status: state.status,
      q: state.q,
      from: state.from,
      to: state.to,
      mine: 'true', // Always filter to user's cases
      sort: state.sort,
      type: state.type,
      priority: state.priority
    }).toString();

    const j = await fetchJSON('/api/cases?'+qs);
    renderRows(j.rows || []);
    renderPager(j.page, j.totalPages, j.total);
    refreshSummary();
  }

  function renderRows(rows){
    tblBody.innerHTML = '';
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      tr.className = 'border-b border-[#f2f3f4]';
      tr.innerHTML = `
        <td class="px-3 py-3 text-sm">${r.caseId}</td>
        <td class="px-3 py-3 text-sm">${r.typeOfCase}</td>
        <td class="px-3 py-3 text-sm">${fmt(r.createdAt)}</td>
        <td class="px-3 py-3 text-sm">${fmt(r.dateOfIncident)}</td>
        <td class="px-3 py-3 text-sm">${badge(r.status)}</td>
        <td class="px-3 py-3">
          <div class="flex gap-2">
            <button class="px-3 py-1.5 rounded-lg border-none cursor-pointer bg-ghost-btn text-primary-btn font-medium hover:opacity-90 transition-opacity text-sm" data-act="view" data-id="${r._id}">View</button>
          </div>
        </td>
      `;
      tblBody.appendChild(tr);
    });
  }

  function renderPager(page,totalPages,total){
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

  // chips
  $('#chips').addEventListener('click',(e)=>{
    const chip = e.target.closest('.chip'); if(!chip) return;
    [...document.querySelectorAll('.chip')].forEach(c=>{
      c.classList.remove('active', 'bg-primary-btn', 'text-white');
      c.classList.add('bg-ghost-btn', 'text-primary-btn');
    });
    chip.classList.add('active', 'bg-primary-btn', 'text-white');
    chip.classList.remove('bg-ghost-btn', 'text-primary-btn');
    state.status = chip.getAttribute('data-status') || '';
    state.page = 1;
    load();
  });

  // toolbar
  $('#btnFilter').onclick=()=>{
    state.from   = $('#fFrom').value || '';
    state.to     = $('#fTo').value || '';
    state.q      = $('#fQ').value.trim();
    state.type   = fType ? (fType.value || '') : '';
    state.priority = fPriority ? (fPriority.value || '') : '';
    state.page   = 1;
    load();
  };

  // modal
  $('#btnAdd').onclick=()=>{
    frm.reset();
    msg.textContent='';
    $('#dlgTitle').textContent='Report New Case';
    const hw = document.getElementById('harassmentTypeWrap');
    const mw = document.getElementById('medicoWrap');
    const vw = document.getElementById('vandalWrap');
    if (hw) hw.classList.add('hidden');
    if (mw) mw.classList.add('hidden');
    if (vw) vw.classList.add('hidden');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  };
  $('#btnCancel').onclick=()=> {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  };
  $('#btnSave').onclick=async ()=>{
    const fd = new FormData(frm);
    const body = Object.fromEntries(fd.entries());
    if (!body.typeOfCase || !body.complainantName || !body.complainantAddress || !body.description || !body.dateOfIncident) {
      msg.textContent='Please fill all required fields.'; return;
    }
    const files = document.getElementById('evidenceFiles');
    if (!files || !files.files || files.files.length < 3) {
      msg.textContent='Please upload at least 3 evidence files.'; return;
    }
    try{
      const j = await fetchJSON('/api/cases', { method:'POST', body: fd });
      if(!j.ok){ msg.textContent=j.message || 'Failed to save report.'; return; }
    }catch(e){
      msg.textContent=e.message || 'Failed to save report.'; return;
    }
    modal.classList.remove('flex');
    modal.classList.add('hidden');
    load();
  };

  // dynamic form behaviour
  if (typeSel) {
    typeSel.addEventListener('change', () => {
      const v = typeSel.value || '';
      const isHarass = v === 'Harassment';
      const isAssault = v === 'Physical Assault';
      const isVandal = v === 'Vandalism';
      const hw = document.getElementById('harassmentTypeWrap');
      const mw = document.getElementById('medicoWrap');
      const vw = document.getElementById('vandalWrap');
      if (hw) {
        if (isHarass) {
          hw.classList.remove('hidden');
        } else {
          hw.classList.add('hidden');
        }
      }
      if (mw) {
        if (isAssault) {
          mw.classList.remove('hidden');
        } else {
          mw.classList.add('hidden');
        }
      }
      if (vw) {
        if (isVandal) {
          vw.classList.remove('hidden');
        } else {
          vw.classList.add('hidden');
        }
      }
    });
  }

  // table actions
  tblBody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const id = btn.getAttribute('data-id');
    const act= btn.getAttribute('data-act');

    if(act==='view'){
      const j = await fetchJSON('/api/cases/'+id);
      if(!j.ok) return alert('Not found');
      const r = j.row;
      dCaseId.textContent = r.caseId;
      const statusMap = {
        'Pending': 'bg-pending',
        'Ongoing': 'bg-ongoing',
        'Resolved': 'bg-resolved',
        'Cancelled': 'bg-cancelled'
      };
      dStatus.className = 'px-2 py-1 rounded-2xl text-xs font-bold ' + (statusMap[r.status] || 'bg-ghost-btn text-primary-btn');
      dStatus.textContent = r.status;

      dBody.innerHTML = `
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Type</div><div class="font-semibold text-[#2c3e50]">${r.typeOfCase}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Priority</div><div class="text-[#2c3e50]">${r.priority || 'Medium'}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Reported By</div><div class="text-[#2c3e50]">${r.reportedBy?.name || r.reportedBy?.username || ''}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Date Reported</div><div class="text-[#2c3e50]">${fmt(r.createdAt)}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Date of Incident</div><div class="text-[#2c3e50]">${fmt(r.dateOfIncident)}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Place</div><div class="text-[#2c3e50]">${r.placeOfIncident || '-'}</div></div>
        ${r.harassmentType ? `<div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Harassment Type</div><div class="text-[#2c3e50]">${r.harassmentType}</div></div>` : ''}
        ${r.seniorCategory ? `<div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Senior-Involved</div><div class="text-[#2c3e50]">${r.seniorCategory}</div></div>` : ''}

        <h4 class="my-3.5 mb-2 text-lg font-semibold text-[#2c3e50]">Complainant</h4>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Name</div><div class="text-[#2c3e50]">${r.complainant?.name || ''}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Address</div><div class="text-[#2c3e50]">${r.complainant?.address || ''}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Contact</div><div class="text-[#2c3e50]">${r.complainant?.contact || ''}</div></div>

        <h4 class="my-3.5 mb-2 text-lg font-semibold text-[#2c3e50]">Respondent</h4>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Name</div><div class="text-[#2c3e50]">${r.respondent?.name || '-'}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Address</div><div class="text-[#2c3e50]">${r.respondent?.address || '-'}</div></div>
        <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-[#7f8c8d] text-sm">Contact</div><div class="text-[#2c3e50]">${r.respondent?.contact || '-'}</div></div>

        <h4 class="my-3.5 mb-2 text-lg font-semibold text-[#2c3e50]">Description</h4>
        <p class="whitespace-pre-wrap text-[#2c3e50] leading-relaxed">${r.description || ''}</p>

        ${Array.isArray(r.evidences) && r.evidences.length ? `
          <h4 class="my-3.5 mb-2 text-lg font-semibold text-[#2c3e50]">Evidence</h4>
          <ul class="pl-4.5 mb-2 space-y-1">
            ${r.evidences.map(ev => `
              <li class="flex items-center gap-2">
                <span class="inline-block px-2.5 py-1 rounded-full text-[11px] bg-ghost-btn text-[#636e72] mr-1">${ev.kind || 'File'}</span>
                <a href="${ev.url}" target="_blank" rel="noopener" class="text-primary-btn hover:underline">${ev.filename}</a>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${Array.isArray(r.hearings) && r.hearings.length ? `
          <h4 class="my-3.5 mb-2 text-lg font-semibold text-[#2c3e50]">Hearings</h4>
          <ul class="pl-4.5 mb-2 space-y-1">
            ${r.hearings.map(h => `
              <li class="flex items-center gap-2">
                <span class="inline-block px-2.5 py-1 rounded-full text-[11px] bg-ghost-btn text-[#636e72] mr-1">Hearing</span>
                <span class="text-[#2c3e50]">${fmt(h.dateTime)} @ ${h.venue || 'Barangay Hall'}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${Array.isArray(r.patawagForms) && r.patawagForms.length ? `
          <h4 class="my-3.5 mb-2 text-lg font-semibold text-[#2c3e50]">Patawag Forms</h4>
          <ul class="pl-4.5 mb-2 space-y-1">
            ${r.patawagForms.map(p => `
              <li class="flex items-center gap-2">
                <span class="inline-block px-2.5 py-1 rounded-full text-[11px] bg-ghost-btn text-[#636e72] mr-1">Patawag</span>
                <span class="text-[#2c3e50]">${p.scheduleDate ? fmt(p.scheduleDate) : 'No schedule'} @ ${p.venue || 'Barangay Hall'}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${r.over45Note ? `<div class="px-3 py-2.5 rounded-lg bg-note-box border border-[#f5cba7] text-sm mt-2.5">${r.over45Note}</div>` : ''}

        <div class="mt-3.5 border-l-2 border-[#ecf0f1] pl-3">
          <div class="mb-2.5">
            <div class="font-semibold text-[#2c3e50] mb-0.5">Created</div>
            <div class="text-xs text-[#7f8c8d]">${fmt(r.createdAt)}</div>
          </div>
          <div class="mb-2.5">
            <div class="font-semibold text-[#2c3e50] mb-0.5">Last Updated</div>
            <div class="text-xs text-[#7f8c8d]">${fmt(r.updatedAt)}</div>
          </div>
        </div>

        <div class="mt-4 flex gap-2 flex-wrap">
          <button class="px-4 py-2.5 rounded-lg border-none cursor-pointer bg-ghost-btn text-primary-btn font-medium hover:opacity-90 transition-opacity" id="dPrint">Print</button>
        </div>
      `;

      document.getElementById('dPrint').onclick=()=>window.print();
      drawer.classList.remove('hidden');
      drawer.classList.add('block');
    }
  });

  // close drawer
  dClose.onclick=()=>{
    drawer.classList.remove('block');
    drawer.classList.add('hidden');
  };
  // Close drawer when clicking overlay (first child div)
  const overlay = drawer.querySelector('div.absolute.inset-0');
  if (overlay) {
    overlay.onclick=()=>{
      drawer.classList.remove('block');
      drawer.classList.add('hidden');
    };
  }

  // notifications
  async function loadNotifications(markReadOnOpen=false){
    try{
      const j = await fetchJSON('/api/case-notifications');
      const items = j.items || [];
      if (notifList) notifList.innerHTML = '';
      if (!items.length) {
        if (notifEmpty) notifEmpty.style.display = '';
      } else {
        if (notifEmpty) notifEmpty.style.display = 'none';
        items.forEach(n => {
          const li = document.createElement('li');
          li.className = `px-2 py-2 rounded-lg border border-[#ecf0f1] mb-1 text-sm cursor-pointer transition-colors ${n.read ? 'bg-white' : 'bg-notif-unread'}`;
          li.innerHTML = `
            <div class="text-[#2c3e50] font-medium">${n.message || ''}</div>
            <div class="text-xs text-muted-meta mt-0.5">${n.caseRef || ''} • ${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
          `;
          li.onclick = () => {
            if (n.caseId) {
              alert('Case: '+(n.caseRef || ''));
            }
          };
          if (notifList) notifList.appendChild(li);
        });
      }
      const unread = j.unreadCount || 0;
      if (notifDot) notifDot.style.display = unread > 0 ? 'inline-block' : 'none';

      if (markReadOnOpen && unread > 0) {
        await fetch('/api/case-notifications/read-all', { method:'POST' });
        if (notifDot) notifDot.style.display = 'none';
      }
    }catch(e){
      console.warn('Notifications error:', e);
    }
  }

  if (notifBtn && notifPanel) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = notifPanel.classList.contains('hidden');
      if (isHidden) {
        notifPanel.classList.remove('hidden');
        notifPanel.classList.add('block');
        loadNotifications(true);
      } else {
        notifPanel.classList.add('hidden');
        notifPanel.classList.remove('block');
      }
    });
    document.addEventListener('click', (e) => {
      if (!notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
        notifPanel.classList.add('hidden');
        notifPanel.classList.remove('block');
      }
    });
    if (notifMarkAll) {
      notifMarkAll.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/case-notifications/read-all', { method:'POST' });
        loadNotifications(false);
      });
    }
  }

  // init
  initUser();
  loadCaseTypes();
  refreshSummary();
  load();
})();

