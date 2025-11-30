// public/cases.js
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
  const fStatus = $('#fStatus');

  const notifBtn   = document.getElementById('notifBtn');
  const notifPanel = document.getElementById('notifPanel');
  const notifList  = document.getElementById('notifList');
  const notifEmpty = document.getElementById('notifEmpty');
  const notifDot   = document.getElementById('notifDot');
  const notifMarkAll = document.getElementById('notifMarkAll');

  const drawer  = $('#drawer');
  const dBody   = $('#dBody');
  const dFooter = $('#dFooter');
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
      
      // Check if user is admin
      isAdmin = /^(admin)$/i.test(user.role||'') || user.isAdmin===true || user.type==='admin' || user.accountType==='admin';
      
      // Redirect if accessing wrong route
      const path = window.location.pathname;
      if (isAdmin && path.startsWith('/user/')) {
        location.href = path.replace('/user/', '/admin/');
        return;
      } else if (!isAdmin && path.startsWith('/admin/')) {
        location.href = path.replace('/admin/', '/user/');
        return;
      }
      
      $('#username').textContent = user.name || 'User';
      $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
      
      // For non-admin users, automatically filter to show only their cases
      if (!isAdmin) {
        state.mine = true;
        // Hide admin-only UI elements
        const fMine = $('#fMine');
        const fMineLabel = fMine?.parentElement;
        if (fMineLabel) fMineLabel.style.display = 'none'; // Hide "My cases" checkbox
        
        const btnExport = $('#btnExport');
        if (btnExport) btnExport.style.display = 'none'; // Hide export button
      }
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
  let state = { page:1, limit:10, status:'', q:'', from:'', to:'', mine:false, sort:'desc', type:'', priority:'' };
  const badge = s => `<span class="badge s-${s}">${s}</span>`;
  const fmt   = d => d ? new Date(d).toLocaleString() : '';

  function setSummary(sum){
    $('#sTotal').textContent    = sum.Total || 0;
    const reportedEl = $('#sReported');
    if (reportedEl) {
      reportedEl.textContent = sum.Reported || sum.Pending || 0;
    } else {
      // Fallback for old ID
      const pendingEl = $('#sPending');
      if (pendingEl) pendingEl.textContent = sum.Reported || sum.Pending || 0;
    }
    $('#sOngoing').textContent  = sum.Ongoing || 0;
    $('#sResolved').textContent = sum.Resolved || 0;
  }
  async function refreshSummary(){
    try{
      const j = await fetchJSON('/api/cases/summary');
      if (j.ok) setSummary(j.summary || {});
    }catch{}
  }

  function showLoading() {
    if (!tblBody) return;
    
    // Add loading class to table wrapper
    const tableWrap = tblBody.closest('.table-wrap');
    if (tableWrap) {
      tableWrap.classList.add('table-loading');
    }
    
    // Clear existing rows
    tblBody.innerHTML = '';
    
    // Create 5 skeleton rows (7 columns: Reported By, Case ID, Type, Date Reported, Date of Incident, Status, Actions)
    const colCount = 7;
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement('tr');
      tr.className = 'table-skeleton';
      let skeletonCells = '';
      
      // Column widths: Reported By (long), Case ID (short), Type (long), Date Reported (long), Date of Incident (long), Status (short), Actions (short)
      const widths = ['long', 'short', 'long', 'long', 'long', 'short', 'short'];
      
      for (let j = 0; j < colCount; j++) {
        const width = widths[j] || 'long';
        skeletonCells += `<td><div class="skeleton-bar ${width}"></div></td>`;
      }
      
      tr.innerHTML = skeletonCells;
      tblBody.appendChild(tr);
    }
  }

  async function load(){
    // Show loading state
    showLoading();

    const qs = new URLSearchParams({
      page: state.page,
      limit: state.limit,
      status: state.status,
      q: state.q,
      from: state.from,
      to: state.to,
      mine: String(state.mine),
      sort: state.sort,
      type: state.type,
      priority: state.priority
    }).toString();

    try {
      // Add small delay for smooth transition (only if data loads too fast)
      const [j] = await Promise.all([
        fetchJSON('/api/cases?'+qs),
        new Promise(resolve => setTimeout(resolve, 150)) // Minimum 150ms for smooth transition
      ]);

      // Remove loading class
      const tableWrap = tblBody?.closest('.table-wrap');
      if (tableWrap) {
        tableWrap.classList.remove('table-loading');
      }

      renderRows(j.rows || []);
      renderPager(j.page, j.totalPages, j.total);
      refreshSummary();
    } catch (error) {
      // Remove loading class on error
      const tableWrap = tblBody?.closest('.table-wrap');
      if (tableWrap) {
        tableWrap.classList.remove('table-loading');
      }
      renderRows([]);
      renderPager(1, 1, 0);
      console.error('Failed to load cases:', error);
    }
  }

  function renderRows(rows){
    tblBody.innerHTML = '';
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      // Check if this case belongs to the current user (for non-admins)
      const isOwner = !isAdmin && (r.reportedBy?.username?.toLowerCase() === user?.username?.toLowerCase());
      const canManage = isAdmin || isOwner;
      
      tr.innerHTML = `
        <td>${r.reportedBy?.name || r.reportedBy?.username || ''}</td>
        <td>${r.caseId}</td>
        <td>${r.typeOfCase}</td>
        <td>${fmt(r.createdAt)}</td>
        <td>${fmt(r.dateOfIncident)}</td>
        <td>${badge(r.status)}</td>
        <td class="actions">
          <div class="table-actions">
            <button class="table-action-btn view" data-act="view" data-id="${r._id}">View</button>
            ${isAdmin ? `<button class="table-action-btn edit" data-act="status" data-id="${r._id}">Edit</button>` : ''}
            ${isAdmin ? `<button class="table-action-btn delete" data-act="del" data-id="${r._id}">Delete</button>` : ''}
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

    const mk = (t,cb,dis=false)=>{ const b=document.createElement('button'); b.className='btn'; b.textContent=t; b.disabled=dis; b.onclick=cb; pager.appendChild(b); };
    mk('Prev', ()=>{ if(state.page>1){ state.page--; load(); }}, page<=1);
    for(let i=Math.max(1,page-2); i<=Math.min(totalPages,page+2); i++){
      const b=document.createElement('button'); b.className='btn'; b.textContent=i;
      if(i===page){ b.style.background='#3498db'; b.style.color='#fff'; }
      b.onclick=()=>{ state.page=i; load(); };
      pager.appendChild(b);
    }
    mk('Next', ()=>{ if(state.page<totalPages){ state.page++; load(); }}, page>=totalPages);
  }

  // chips
  $('#chips').addEventListener('click',(e)=>{
    const chip = e.target.closest('.chip'); if(!chip) return;
    [...document.querySelectorAll('.chip')].forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    state.status = chip.getAttribute('data-status') || '';
    // Update status dropdown to match
    if (fStatus) fStatus.value = state.status;
    state.page = 1;
    load();
  });

  // toolbar
  function applyFilters() {
    state.from   = $('#fFrom').value || '';
    state.to     = $('#fTo').value || '';
    state.q      = $('#fQ').value.trim();
    state.mine   = $('#fMine').checked;
    state.type   = fType ? (fType.value || '') : '';
    state.priority = fPriority ? (fPriority.value || '') : '';
    if (fStatus) {
      state.status = fStatus.value || '';
      // Update chips to match
      [...document.querySelectorAll('.chip')].forEach(c=>c.classList.remove('active'));
      const chip = document.querySelector(`.chip[data-status="${state.status}"]`);
      if (chip) chip.classList.add('active');
    }
    state.page   = 1;
    load();
  }
  $('#btnFilter').onclick = applyFilters;
  
  // Enter key handler for search input
  const fQ = $('#fQ');
  if (fQ) {
    fQ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyFilters();
      }
    });
  }
  
  // Auto-apply filters when dropdowns change
  if (fType) {
    fType.addEventListener('change', applyFilters);
  }
  if (fPriority) {
    fPriority.addEventListener('change', applyFilters);
  }
  if (fStatus) {
    fStatus.addEventListener('change', applyFilters);
  }
  $('#btnExport').onclick=()=>{
    const qs = new URLSearchParams({ ...state, exportCsv:'true' }).toString();
    window.location='/api/cases?'+qs;
  };

  // modal
  $('#btnAdd').onclick=()=>{
    frm.reset();
    msg.textContent='';
    $('#dlgTitle').textContent='Add Case';
    const hw = document.getElementById('harassmentTypeWrap');
    const mw = document.getElementById('medicoWrap');
    const vw = document.getElementById('vandalWrap');
    if (hw) hw.style.display='none';
    if (mw) mw.style.display='none';
    if (vw) vw.style.display='none';
    modal.classList.add('active');
  };
  $('#btnCancel').onclick=()=> modal.classList.remove('active');
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
    modal.classList.remove('active');
    load();
    refreshSummary();
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
      if (hw) hw.style.display = isHarass ? '' : 'none';
      if (mw) mw.style.display = isAssault ? '' : 'none';
      if (vw) vw.style.display = isVandal ? '' : 'none';
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
      dStatus.className = 'badge s-'+r.status; dStatus.textContent = r.status;

      dBody.innerHTML = `
        <div class="kv"><div>Type</div><div><strong>${r.typeOfCase}</strong></div></div>
        <div class="kv"><div>Priority</div><div>${r.priority || 'Medium'}</div></div>
        <div class="kv"><div>Reported By</div><div>${r.reportedBy?.name || r.reportedBy?.username || ''}</div></div>
        <div class="kv"><div>Date Reported</div><div>${fmt(r.createdAt)}</div></div>
        <div class="kv"><div>Date of Incident</div><div>${fmt(r.dateOfIncident)}</div></div>
        <div class="kv"><div>Place</div><div>${r.placeOfIncident || '-'}</div></div>
        ${r.harassmentType ? `<div class="kv"><div>Harassment Type</div><div>${r.harassmentType}</div></div>` : ''}
        ${r.seniorCategory ? `<div class="kv"><div>Senior-Involved</div><div>${r.seniorCategory}</div></div>` : ''}

        <h4 style="margin:14px 0 8px">Complainant</h4>
        <div class="kv"><div>Name</div><div>${r.complainant?.name || ''}</div></div>
        <div class="kv"><div>Address</div><div>${r.complainant?.address || ''}</div></div>
        <div class="kv"><div>Contact</div><div>${r.complainant?.contact || ''}</div></div>

        <h4 style="margin:14px 0 8px">Respondent</h4>
        <div class="kv"><div>Name</div><div>${r.respondent?.name || '-'}</div></div>
        <div class="kv"><div>Address</div><div>${r.respondent?.address || '-'}</div></div>
        <div class="kv"><div>Contact</div><div>${r.respondent?.contact || '-'}</div></div>

        <h4 style="margin:14px 0 8px">Description</h4>
        <p style="white-space:pre-wrap">${r.description || ''}</p>

        ${Array.isArray(r.evidences) && r.evidences.length ? `
          <h4 style="margin:14px 0 8px">Evidence</h4>
          <ul style="padding-left:18px;margin-bottom:8px;">
            ${r.evidences.map(ev => `
              <li>
                <span class="pill">${ev.kind || 'File'}</span>
                <a href="${ev.url}" target="_blank" rel="noopener">${ev.filename}</a>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${Array.isArray(r.hearings) && r.hearings.length ? `
          <h4 style="margin:14px 0 8px">Hearings</h4>
          <ul style="padding-left:18px;margin-bottom:8px;">
            ${r.hearings.map(h => `
              <li>
                <span class="pill">Hearing</span>
                ${fmt(h.dateTime)} @ ${h.venue || 'Barangay Hall'}
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${Array.isArray(r.patawagForms) && r.patawagForms.length ? `
          <h4 style="margin:14px 0 8px">Patawag Forms</h4>
          <ul style="padding-left:18px;margin-bottom:8px;">
            ${r.patawagForms.map(p => `
              <li>
                <span class="pill">Patawag</span>
                ${p.scheduleDate ? fmt(p.scheduleDate) : 'No schedule'} @ ${p.venue || 'Barangay Hall'}
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${r.over45Note ? `<div class="note-box">${r.over45Note}</div>` : ''}

        <div class="timeline">
          <div class="tl-item">
            <div class="m">Created</div>
            <div class="t">${fmt(r.createdAt)}</div>
          </div>
          ${r.ongoingSince ? `
          <div class="tl-item">
            <div class="m">Ongoing Since</div>
            <div class="t">${fmt(r.ongoingSince)}</div>
          </div>
          ` : ''}
          ${r.resolveDate ? `
          <div class="tl-item">
            <div class="m">Resolved Date</div>
            <div class="t">${fmt(r.resolveDate)}</div>
          </div>
          ` : ''}
          ${r.cancelDate ? `
          <div class="tl-item">
            <div class="m">Cancelled Date</div>
            <div class="t">${fmt(r.cancelDate)}</div>
          </div>
          ` : ''}
          <div class="tl-item">
            <div class="m">Last Updated</div>
            <div class="t">${fmt(r.updatedAt)}</div>
          </div>
          ${Array.isArray(r.statusHistory) && r.statusHistory.length ? `
          <h4 style="margin:14px 0 8px">Status History</h4>
          ${r.statusHistory.map(sh => `
            <div class="tl-item">
              <div class="m">${sh.status || 'Status Change'}</div>
              <div class="t">${fmt(sh.at)} ${sh.by?.name ? 'by ' + sh.by.name : ''} ${sh.note ? ' - ' + sh.note : ''}</div>
            </div>
          `).join('')}
          ` : ''}
        </div>

      `;
      
      // Set footer buttons separately
      if (dFooter) {
        dFooter.innerHTML = `
          <button class="btn btn-ghost" id="dPrint">Print</button>
          <button class="btn btn-ghost" id="dReport">Full Report</button>
          ${isAdmin ? `<button class="btn btn-ghost" id="dChange">Change Status</button>` : ''}
          ${isAdmin ? `<button class="btn btn-ghost" id="dHearing">Add Hearing</button>` : ''}
          ${isAdmin && r.status === 'Ongoing' ? `<button class="btn btn-ghost" id="dPatawag">Patawag Form</button>` : ''}
          ${isAdmin && r.status === 'Cancelled' ? `<button class="btn btn-ghost" id="dCancelLetter">Cancellation Letter</button>` : ''}
        `;
      }

      const printBtn = document.getElementById('dPrint');
      if (printBtn) {
        printBtn.onclick = () => window.print();
      }
      
      const reportBtn = document.getElementById('dReport');
      if (reportBtn) {
        reportBtn.onclick = () => {
          window.open('/cases/'+id+'/full-report', '_blank');
        };
      }
      
      const changeBtn = document.getElementById('dChange');
      if (changeBtn) {
        changeBtn.onclick = () => {
          openStatusModal(id, r.status);
        };
      }

      const hBtn = document.getElementById('dHearing');
      if (hBtn) {
        hBtn.onclick = async () => {
          const dt = prompt('Enter hearing date/time (e.g. 2025-12-01 14:00):');
          if (!dt) return;
          const venue = prompt('Venue (default: Barangay Hall):') || '';
          try{
            const body = { dateTime: dt, venue };
            const r2 = await fetch('/api/cases/'+id+'/hearings', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify(body)
            });
            if (!r2.ok) {
              const j2 = await r2.json().catch(()=>({}));
              alert(j2.message || 'Failed to add hearing.');
              return;
            }
            drawer.classList.remove('active');
            load();
            refreshSummary();
          }catch(e){
            alert(e.message || 'Failed to add hearing.');
          }
        };
      }

      const pBtn = document.getElementById('dPatawag');
      if (pBtn) {
        pBtn.onclick = async () => {
          const scheduleDate = prompt('Patawag schedule (e.g. 2025-12-02 09:00):') || '';
          const venue = prompt('Venue (default: Barangay Hall):') || '';
          const notes = prompt('Notes (optional):') || '';
          try{
            const r2 = await fetch('/api/cases/'+id+'/patawag', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ scheduleDate, venue, notes })
            });
            const j2 = await r2.json().catch(()=>({}));
            if (!r2.ok || !j2.ok) {
              alert(j2.message || 'Failed to generate Patawag form.');
              return;
            }
            window.open('/cases/'+id+'/patawag-print', '_blank');
          }catch(e){
            alert(e.message || 'Failed to generate Patawag form.');
          }
        };
      }

      const cBtn = document.getElementById('dCancelLetter');
      if (cBtn) {
        cBtn.onclick = () => {
          window.open('/cases/'+id+'/cancellation-letter', '_blank');
        };
      }

      drawer.classList.add('active');
    }

    if(act==='status'){
      // Get case details first
      fetchJSON('/api/cases/'+id).then(j => {
        if (j.ok && j.row) {
          openStatusModal(id, j.row.status);
        }
      }).catch(() => {
        alert('Failed to load case details.');
      });
    }

    if(act==='del'){
      if(!confirm('Delete this report? This action cannot be undone.')) return;
      const r = await fetch(`/api/cases/${id}`, { method:'DELETE' });
      if(!r.ok) {
        const j2 = await r.json().catch(()=>({}));
        return alert(j2.message || 'Failed to delete case.');
      }
      load();
      refreshSummary();
    }
  });

  // close drawer
  dClose.onclick=()=>drawer.classList.remove('active');
  drawer.querySelector('.overlay').onclick=()=>drawer.classList.remove('active');

  // Status Change Modal
  const statusModal = document.getElementById('statusModal');
  const statusModalClose = document.getElementById('statusModalClose');
  const statusModalCancel = document.getElementById('statusModalCancel');
  const statusModalSave = document.getElementById('statusModalSave');
  const newStatusSelect = document.getElementById('newStatusSelect');
  const cancellationReasonWrapper = document.getElementById('cancellationReasonWrapper');
  const cancellationReason = document.getElementById('cancellationReason');
  const currentStatusBadge = document.getElementById('currentStatusBadge');
  const statusModalMsg = document.getElementById('statusModalMsg');
  let currentCaseId = null;

  function openStatusModal(caseId, currentStatus) {
    currentCaseId = caseId;
    if (currentStatusBadge) {
      currentStatusBadge.textContent = currentStatus;
      currentStatusBadge.className = 'badge s-' + currentStatus;
    }
    if (newStatusSelect) newStatusSelect.value = '';
    if (cancellationReason) cancellationReason.value = '';
    if (cancellationReasonWrapper) cancellationReasonWrapper.classList.remove('show');
    if (statusModalMsg) {
      statusModalMsg.style.display = 'none';
      statusModalMsg.textContent = '';
    }
    if (statusModal) statusModal.classList.add('active');
  }

  function closeStatusModal() {
    if (statusModal) statusModal.classList.remove('active');
    currentCaseId = null;
  }

  if (statusModalClose) {
    statusModalClose.onclick = closeStatusModal;
  }
  if (statusModalCancel) {
    statusModalCancel.onclick = closeStatusModal;
  }
  if (statusModal) {
    const dialog = statusModal.querySelector('.status-dialog');
    if (dialog) {
      dialog.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
    statusModal.addEventListener('click', (e) => {
      if (e.target === statusModal) {
        closeStatusModal();
      }
    });
  }

  if (newStatusSelect) {
    newStatusSelect.addEventListener('change', () => {
      const selectedStatus = newStatusSelect.value;
      if (cancellationReasonWrapper) {
        if (selectedStatus === 'Cancelled') {
          cancellationReasonWrapper.classList.add('show');
        } else {
          cancellationReasonWrapper.classList.remove('show');
          if (cancellationReason) cancellationReason.value = '';
        }
      }
      if (statusModalMsg) {
        statusModalMsg.style.display = 'none';
      }
    });
  }

  if (statusModalSave) {
    statusModalSave.onclick = async () => {
      if (!newStatusSelect) return;
      const newStatus = newStatusSelect.value;
      if (!newStatus) {
        if (statusModalMsg) {
          statusModalMsg.textContent = 'Please select a new status.';
          statusModalMsg.style.display = 'block';
        }
        return;
      }

      const valid = ['Reported', 'Ongoing', 'Hearing', 'Resolved', 'Cancelled'];
      if (!valid.includes(newStatus)) {
        if (statusModalMsg) {
          statusModalMsg.textContent = 'Invalid status selected.';
          statusModalMsg.style.display = 'block';
        }
        return;
      }

      statusModalSave.disabled = true;
      statusModalSave.textContent = 'Updating...';
      if (statusModalMsg) statusModalMsg.style.display = 'none';

      try {
        const cancelReason = newStatus === 'Cancelled' && cancellationReason 
          ? cancellationReason.value.trim() 
          : '';
        const r = await fetch(`/api/cases/${currentCaseId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, cancellationReason: cancelReason })
        });

        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.message || 'Failed to update status.');
        }

        closeStatusModal();
        if (drawer && drawer.classList.contains('active')) {
          drawer.classList.remove('active');
        }
        load();
        refreshSummary();
      } catch (e) {
        if (statusModalMsg) {
          statusModalMsg.textContent = e.message || 'Failed to update status. Please try again.';
          statusModalMsg.style.display = 'block';
        }
      } finally {
        statusModalSave.disabled = false;
        statusModalSave.textContent = 'Update Status';
      }
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
          li.className = 'notif-item ' + (n.read ? 'read' : 'unread');
          li.innerHTML = `
            <div>${n.message || ''}</div>
            <div class="meta">${n.caseRef || ''} • ${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
          `;
          li.onclick = async () => {
            if (n.caseId) {
              // Close notification panel
              if (notifPanel) notifPanel.classList.remove('open');
              // Try to find and open the case in the current table
              const viewBtn = document.querySelector(`button[data-act="view"][data-id="${n.caseId}"]`);
              if (viewBtn) {
                viewBtn.click();
              } else {
                // Case not in current page - reload table and search for it
                state.q = n.caseRef || n.caseId;
                state.page = 1;
                load();
                // Show message
                setTimeout(() => {
                  const btn = document.querySelector(`button[data-act="view"][data-id="${n.caseId}"]`);
                  if (btn) {
                    btn.click();
                  } else {
                    alert('Case '+(n.caseRef || n.caseId)+' loaded. Please use View button in table.');
                  }
                }, 500);
              }
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
      const open = notifPanel.classList.toggle('open');
      if (open) {
        loadNotifications(true);
      }
    });
    document.addEventListener('click', () => {
      notifPanel.classList.remove('open');
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
