// public/cases.js
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  
  // DOM element references - will be re-queried in init()
  let tblBody, pager, modal, frm, msg, typeSel, fType, fPriority, fStatus;
  let notifBtn, notifPanel, notifList, notifEmpty, notifDot, notifMarkAll;
  let drawer, dBody, dFooter, dClose, dCaseId, dStatus;

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
  
  // Toolbar filter function
  function applyFilters() {
    state.from   = $('#fFrom')?.value || '';
    state.to     = $('#fTo')?.value || '';
    state.q      = $('#fQ')?.value?.trim() || '';
    state.mine   = $('#fMine')?.checked || false;
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
  const badge = s => `<span class="badge s-${s}">${s}</span>`;
  const fmt   = d => d ? new Date(d).toLocaleString() : '';

  function setSummary(sum){
    const sTotal = $('#sTotal');
    const sOngoing = $('#sOngoing');
    const sResolved = $('#sResolved');
    
    if (sTotal) sTotal.textContent = sum.Total || 0;
    
    const reportedEl = $('#sReported');
    if (reportedEl) {
      reportedEl.textContent = sum.Reported || sum.Pending || 0;
    } else {
      // Fallback for old ID
      const pendingEl = $('#sPending');
      if (pendingEl) pendingEl.textContent = sum.Reported || sum.Pending || 0;
    }
    
    if (sOngoing) sOngoing.textContent = sum.Ongoing || 0;
    if (sResolved) sResolved.textContent = sum.Resolved || 0;
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
            <button class="table-action-btn view" data-act="view" data-id="${r._id}">
              <i class="fas fa-eye"></i>
              <span>View</span>
            </button>
            ${isAdmin ? `<button class="table-action-btn edit" data-act="edit" data-id="${r._id}"><i class="fas fa-edit"></i><span>Edit</span></button>` : ''}
            ${isAdmin ? `<button class="table-action-btn delete" data-act="del" data-id="${r._id}"><i class="fas fa-trash"></i><span>Delete</span></button>` : ''}
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

  // Event listeners moved to setupEventListeners()

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

  // Ensure modals/drawers are closed on init
  function ensureModalsClosed() {
    const modal = $('#modal');
    const drawer = $('#drawer');
    const statusModal = document.getElementById('statusModal');
    
    if (modal) {
      modal.classList.remove('active');
      // Don't set inline display - let CSS handle it
    }
    if (drawer) {
      drawer.classList.remove('active');
      // Don't set inline display - let CSS handle it
    }
    if (statusModal) {
      statusModal.classList.remove('active');
      // Don't set inline display - let CSS handle it
    }
  }

  // Show case details in drawer
  function showDetails(r) {
    // Re-query drawer elements to ensure we have fresh references
    const currentDrawer = document.getElementById('drawer');
    const currentDCaseId = document.getElementById('dCaseId') || dCaseId;
    const currentDStatus = document.getElementById('dStatus') || dStatus;
    const currentDBody = document.getElementById('dBody') || dBody;
    const currentDFooter = document.getElementById('dFooter') || dFooter;
    
    if (!currentDCaseId || !currentDStatus || !currentDBody || !currentDrawer) {
      console.error('Cases page: Drawer elements not found');
      return;
    }
    
    currentDCaseId.textContent = r.caseId || r._id || 'Case';
    currentDStatus.className = 'badge s-'+r.status; 
    currentDStatus.textContent = r.status;

      // Helper to escape HTML
      const escape = (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      };
      
      currentDBody.innerHTML = `
        <div class="kv"><div>Type</div><div><strong>${escape(r.typeOfCase || '')}</strong></div></div>
        <div class="kv"><div>Priority</div><div>${escape(r.priority || 'Medium')}</div></div>
        <div class="kv"><div>Reported By</div><div>${escape(r.reportedBy?.name || r.reportedBy?.username || '')}</div></div>
        <div class="kv"><div>Date Reported</div><div>${escape(fmt(r.createdAt))}</div></div>
        <div class="kv"><div>Date of Incident</div><div>${escape(fmt(r.dateOfIncident))}</div></div>
        <div class="kv"><div>Place</div><div>${escape(r.placeOfIncident || '-')}</div></div>
        ${r.harassmentType ? `<div class="kv"><div>Harassment Type</div><div>${escape(r.harassmentType)}</div></div>` : ''}
        ${r.seniorCategory ? `<div class="kv"><div>Senior-Involved</div><div>${escape(r.seniorCategory)}</div></div>` : ''}

        <h4>Complainant</h4>
        <div class="kv"><div>Name</div><div>${escape(r.complainant?.name || r.complainantName || '')}</div></div>
        <div class="kv"><div>Address</div><div>${escape(r.complainant?.address || r.complainantAddress || '')}</div></div>
        <div class="kv"><div>Contact</div><div>${escape(r.complainant?.contact || r.complainantContact || '')}</div></div>

        <h4>Respondent</h4>
        <div class="kv"><div>Name</div><div>${escape(r.respondent?.name || r.respondentName || '-')}</div></div>
        <div class="kv"><div>Address</div><div>${escape(r.respondent?.address || r.respondentAddress || '-')}</div></div>
        <div class="kv"><div>Contact</div><div>${escape(r.respondent?.contact || r.respondentContact || '-')}</div></div>

        <h4>Description</h4>
        <div class="drawer-description">${escape(r.description || '')}</div>

        ${Array.isArray(r.evidences) && r.evidences.length ? `
          <h4>Evidence</h4>
          <ul class="drawer-list">
            ${r.evidences.map(ev => `
              <li class="drawer-list-item">
                <span class="pill">${escape(ev.kind || 'File')}</span>
                <a href="${escape(ev.url)}" target="_blank" rel="noopener" class="drawer-link">${escape(ev.filename)}</a>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${Array.isArray(r.hearings) && r.hearings.length ? `
          <h4>Hearings</h4>
          <ul class="drawer-list">
            ${r.hearings.map(h => `
              <li class="drawer-list-item">
                <span class="pill">Hearing</span>
                <span>${escape(fmt(h.dateTime))} @ ${escape(h.venue || 'Barangay Hall')}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${Array.isArray(r.patawagForms) && r.patawagForms.length ? `
          <h4>Patawag Forms</h4>
          <ul class="drawer-list">
            ${r.patawagForms.map(p => `
              <li class="drawer-list-item">
                <span class="pill">Patawag</span>
                <span>${escape(p.scheduleDate ? fmt(p.scheduleDate) : 'No schedule')} @ ${escape(p.venue || 'Barangay Hall')}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${r.over45Note ? `<div class="note-box">${escape(r.over45Note)}</div>` : ''}

        <h4>Timeline</h4>
        <div class="timeline">
          <div class="tl-item">
            <div class="m">Created</div>
            <div class="t">${escape(fmt(r.createdAt))}</div>
          </div>
          ${r.ongoingSince ? `
          <div class="tl-item">
            <div class="m">Ongoing Since</div>
            <div class="t">${escape(fmt(r.ongoingSince))}</div>
          </div>
          ` : ''}
          ${r.resolveDate ? `
          <div class="tl-item">
            <div class="m">Resolved Date</div>
            <div class="t">${escape(fmt(r.resolveDate))}</div>
          </div>
          ` : ''}
          ${r.cancelDate ? `
          <div class="tl-item">
            <div class="m">Cancelled Date</div>
            <div class="t">${escape(fmt(r.cancelDate))}</div>
          </div>
          ` : ''}
          <div class="tl-item">
            <div class="m">Last Updated</div>
            <div class="t">${escape(fmt(r.updatedAt))}</div>
          </div>
          ${Array.isArray(r.statusHistory) && r.statusHistory.length ? `
          <div style="margin-top: 16px;">
            <h4 style="margin: 0 0 12px 0; font-size: 1rem;">Status History</h4>
            ${r.statusHistory.map(sh => `
              <div class="tl-item">
                <div class="m">${escape(sh.status || 'Status Change')}</div>
                <div class="t">${escape(fmt(sh.at))} ${sh.by?.name ? 'by ' + escape(sh.by.name) : ''} ${sh.note ? ' - ' + escape(sh.note) : ''}</div>
              </div>
            `).join('')}
          </div>
          ` : ''}
        </div>

      `;
      
      // Set footer buttons separately
      if (currentDFooter) {
        currentDFooter.innerHTML = `
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
        window.open('/cases/'+r._id+'/full-report', '_blank');
        };
      }
      
      const changeBtn = document.getElementById('dChange');
      if (changeBtn) {
        changeBtn.onclick = () => {
        openStatusModal(r._id, r.status);
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
          const r2 = await fetch('/api/cases/'+r._id+'/hearings', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify(body)
            });
            if (!r2.ok) {
              const j2 = await r2.json().catch(()=>({}));
              alert(j2.message || 'Failed to add hearing.');
              return;
            }
            if (currentDrawer) {
              currentDrawer.classList.remove('active');
              currentDrawer.style.removeProperty('display');
              currentDrawer.style.removeProperty('pointer-events');
              currentDrawer.style.removeProperty('z-index');
            }
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
          const r2 = await fetch('/api/cases/'+r._id+'/patawag', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ scheduleDate, venue, notes })
            });
            const j2 = await r2.json().catch(()=>({}));
            if (!r2.ok || !j2.ok) {
              alert(j2.message || 'Failed to generate Patawag form.');
              return;
            }
          window.open('/cases/'+r._id+'/patawag-print', '_blank');
          }catch(e){
            alert(e.message || 'Failed to generate Patawag form.');
          }
        };
      }

      const cBtn = document.getElementById('dCancelLetter');
      if (cBtn) {
        cBtn.onclick = () => {
        window.open('/cases/'+r._id+'/cancellation-letter', '_blank');
        };
      }

      // Open drawer with pointer-events enabled
      if (currentDrawer) {
        currentDrawer.classList.add('active');
        currentDrawer.style.setProperty('display', 'block', 'important');
        currentDrawer.style.setProperty('pointer-events', 'auto', 'important');
        currentDrawer.style.setProperty('z-index', '10000', 'important');
        const panel = currentDrawer.querySelector('.panel');
        if (panel) {
          panel.style.setProperty('pointer-events', 'auto', 'important');
        }
        console.log('Cases page: Drawer opened');
      }
    }

  // Setup event listeners - called from init()
  function setupEventListeners() {
    // Chips filter
    const chips = $('#chips');
    if (chips && chips.parentNode) {
      const newChips = chips.cloneNode(true);
      chips.parentNode.replaceChild(newChips, chips);
      
      newChips.addEventListener('click',(e)=>{
        const chip = e.target.closest('.chip'); if(!chip) return;
        [...document.querySelectorAll('.chip')].forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        state.status = chip.getAttribute('data-status') || '';
        // Update status dropdown to match
        if (fStatus) {
          fStatus.value = state.status;
        }
        state.page = 1;
        load();
      });
    }
    
    // Filter button
    const btnFilter = $('#btnFilter');
    if (btnFilter) {
      btnFilter.onclick = applyFilters;
    }
    
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
    
    // Export button
    const btnExport = $('#btnExport');
    if (btnExport) {
      btnExport.onclick = () => {
        const qs = new URLSearchParams({ ...state, exportCsv:'true' }).toString();
        window.location='/api/cases?'+qs;
      };
    }

    // Modal buttons - query within content area first
    const contentArea = document.querySelector('.content-area');
    const btnAdd = contentArea ? (contentArea.querySelector('#btnAdd') || document.getElementById('btnAdd')) : document.getElementById('btnAdd');
    if (btnAdd) {
      // Clone to remove old listeners
      const newBtnAdd = btnAdd.cloneNode(true);
      btnAdd.parentNode.replaceChild(newBtnAdd, btnAdd);
      newBtnAdd.onclick = () => {
        console.log('Cases page: Add button clicked');
        
        // Re-query form elements to ensure we have fresh references
        const currentFrm = document.getElementById('frm') || frm;
        const currentMsg = document.getElementById('msg') || msg;
        const dlgTitle = document.getElementById('dlgTitle') || $('#dlgTitle');
        
        if (currentFrm) {
          currentFrm.reset();
          // Clear any edit ID
          if (currentFrm.dataset.editId) {
            delete currentFrm.dataset.editId;
          }
        }
        if (currentMsg) currentMsg.textContent='';
        if (dlgTitle) dlgTitle.textContent='Add Case';
        
        // Hide conditional form sections
        const hw = document.getElementById('harassmentTypeWrap');
        const mw = document.getElementById('medicoWrap');
        const vw = document.getElementById('vandalWrap');
        if (hw) hw.style.display='none';
        if (mw) mw.style.display='none';
        if (vw) vw.style.display='none';
        
        // Clear file inputs
        const evidenceFiles = document.getElementById('evidenceFiles');
        if (evidenceFiles) evidenceFiles.value = '';
        const medicoFile = document.getElementById('medicoLegalFile');
        if (medicoFile) medicoFile.value = '';
        const vandalFile = document.getElementById('vandalismImage');
        if (vandalFile) vandalFile.value = '';
        
        // Open modal - get fresh reference and open directly
        let currentModal = document.getElementById('modal');
        if (!currentModal) {
          console.error('Cases page: Modal element not found');
          return;
        }
        
        // Ensure modal is in body (router might have moved it)
        if (!document.body.contains(currentModal)) {
          console.warn('Cases page: Modal not in body, moving it');
          document.body.appendChild(currentModal);
        }
        
        // Mark modal as user-opened to prevent router from closing it
        currentModal.dataset.userOpened = 'true';
        
        // Add active class first
        currentModal.classList.add('active');
        
        // CRITICAL: Enable pointer-events so modal is clickable
        // base.css sets pointer-events:none on .modal, only .modal.open enables it
        // Since we're using .active, we need to explicitly enable pointer-events
        currentModal.style.setProperty('pointer-events', 'auto', 'important');
        
        // Force display: flex with !important to override router's inline display: none
        // Use setProperty with important flag
        currentModal.style.setProperty('display', 'flex', 'important');
        
        // Also ensure z-index is high enough
        currentModal.style.setProperty('z-index', '10000', 'important');
        
        // Remove any visibility or opacity issues
        currentModal.style.setProperty('visibility', 'visible', 'important');
        currentModal.style.setProperty('opacity', '1', 'important');
        
        // Ensure dialog content is also clickable
        const dialog = currentModal.querySelector('.dialog');
    if (dialog) {
          dialog.style.setProperty('pointer-events', 'auto', 'important');
        }
        
        // Force a reflow
        void currentModal.offsetHeight;
        
        // Verify it's actually visible
        const computedDisplay = window.getComputedStyle(currentModal).display;
        const rect = currentModal.getBoundingClientRect();
        const isVisible = computedDisplay !== 'none' && rect.width > 0 && rect.height > 0;
        
        console.log('Cases page: Modal opened', {
          hasActive: currentModal.classList.contains('active'),
          inlineDisplay: currentModal.style.display,
          computedDisplay: computedDisplay,
          zIndex: window.getComputedStyle(currentModal).zIndex,
          isInBody: document.body.contains(currentModal),
          parentDisplay: currentModal.parentElement ? window.getComputedStyle(currentModal.parentElement).display : 'N/A',
          rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
          isVisible: isVisible,
          visibility: window.getComputedStyle(currentModal).visibility,
          opacity: window.getComputedStyle(currentModal).opacity
        });
        
        // If still not visible, try one more time after a short delay
        if (!isVisible) {
          console.warn('Cases page: Modal not visible, retrying...');
          setTimeout(() => {
            currentModal = document.getElementById('modal');
            if (currentModal) {
              currentModal.style.setProperty('display', 'flex', 'important');
              currentModal.style.setProperty('z-index', '10000', 'important');
              currentModal.style.setProperty('visibility', 'visible', 'important');
              currentModal.style.setProperty('opacity', '1', 'important');
              void currentModal.offsetHeight;
            }
          }, 100);
        }
      };
      console.log('Cases page: btnAdd event listener attached');
    } else {
      console.warn('Cases page: btnAdd not found');
    }
    
    const btnCancel = document.getElementById('btnCancel') || $('#btnCancel');
    if (btnCancel) {
      const newBtnCancel = btnCancel.cloneNode(true);
      btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
      newBtnCancel.onclick = () => {
        console.log('Cases page: Cancel button clicked');
        const currentModal = document.getElementById('modal');
        if (currentModal) {
          currentModal.classList.remove('active');
          currentModal.style.removeProperty('display');
          currentModal.style.removeProperty('z-index');
          currentModal.style.removeProperty('visibility');
          currentModal.style.removeProperty('opacity');
          currentModal.style.removeProperty('pointer-events');
          delete currentModal.dataset.userOpened;
        }
        // Reset form
        const currentFrm = document.getElementById('frm') || frm;
        if (currentFrm) {
          currentFrm.reset();
        }
      };
      console.log('Cases page: btnCancel event listener attached');
        } else {
      console.warn('Cases page: btnCancel not found');
    }
    
    const btnSave = document.getElementById('btnSave') || $('#btnSave');
    if (btnSave) {
      const newBtnSave = btnSave.cloneNode(true);
      btnSave.parentNode.replaceChild(newBtnSave, btnSave);
      newBtnSave.onclick = async () => {
        console.log('Cases page: Save button clicked');
        // Re-query form in case it was replaced
        const currentFrm = document.getElementById('frm') || frm;
        if (!currentFrm) {
          console.error('Cases page: Form not found');
          return;
        }
        const fd = new FormData(currentFrm);
        const body = Object.fromEntries(fd.entries());
        
        console.log('Cases page: Form data', body);
        
        // Check if this is an edit
        const editId = currentFrm.dataset.editId;
        const isEdit = !!editId;
        
        // Validation
        if (!body.typeOfCase || !body.complainantName || !body.complainantAddress || !body.description || !body.dateOfIncident) {
          const currentMsg = document.getElementById('msg') || msg;
          if (currentMsg) currentMsg.textContent='Please fill all required fields.';
          return;
        }
        
        // Only require 3 files for new cases, not edits
        if (!isEdit) {
          const files = document.getElementById('evidenceFiles');
          if (!files || !files.files || files.files.length < 3) {
            const currentMsg = document.getElementById('msg') || msg;
            if (currentMsg) currentMsg.textContent='Please upload at least 3 evidence files.';
            return;
          }
        }
        
        try{
          console.log('Cases page: Submitting form...', isEdit ? 'EDIT' : 'NEW');
          const url = isEdit ? `/api/cases/${editId}` : '/api/cases';
          const method = isEdit ? 'PUT' : 'POST';
          const j = await fetchJSON(url, { 
            method: method, 
            body: fd,
            credentials: 'include'
          });
          
          if(!j.ok){ 
            const currentMsg = document.getElementById('msg') || msg;
            if (currentMsg) currentMsg.textContent=j.message || 'Failed to save report.';
            console.error('Cases page: Save failed', j);
            return; 
          }
          
          console.log('Cases page: Save successful', j);
          
          // Close modal
          const currentModal = document.getElementById('modal');
          if (currentModal) {
            currentModal.classList.remove('active');
            currentModal.style.removeProperty('display');
            currentModal.style.removeProperty('z-index');
            currentModal.style.removeProperty('visibility');
            currentModal.style.removeProperty('opacity');
            currentModal.style.removeProperty('pointer-events');
            delete currentModal.dataset.userOpened;
          }
          
          // Reset form and clear edit ID
          if (currentFrm) {
            currentFrm.reset();
            delete currentFrm.dataset.editId;
          }
          
          // Reload data
          load();
          refreshSummary();
        }catch(e){
          console.error('Cases page: Save error', e);
          const currentMsg = document.getElementById('msg') || msg;
          if (currentMsg) currentMsg.textContent=e.message || 'Failed to save report.';
        }
      };
    }

    // Dynamic form behaviour - re-query typeSel to ensure we have the right element
    const currentTypeSel = document.getElementById('typeOfCase') || typeSel;
    if (currentTypeSel) {
      // Remove old listeners by cloning
      const newTypeSel = currentTypeSel.cloneNode(true);
      currentTypeSel.parentNode.replaceChild(newTypeSel, currentTypeSel);
      
      newTypeSel.addEventListener('change', () => {
        const v = newTypeSel.value || '';
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
      
      // Update the typeSel reference
      typeSel = newTypeSel;
    }

    // Table actions - use event delegation on the table wrapper for better reliability
    const tableWrapper = tblBody ? tblBody.closest('.table-wrap') || tblBody.closest('table') : null;
    if (tableWrapper) {
      // Remove old listener by cloning the wrapper
      const newTableWrapper = tableWrapper.cloneNode(true);
      tableWrapper.parentNode.replaceChild(newTableWrapper, tableWrapper);
      
      // Re-query tblBody after cloning
      const newTblBody = newTableWrapper.querySelector('tbody') || newTableWrapper.querySelector('#tbl tbody');
      if (newTblBody) {
        tblBody = newTblBody;
      }
      
      // Use event delegation on the table wrapper (more reliable than tbody)
      newTableWrapper.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button[data-act]');
        if(!btn) return;
        
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        
        console.log('Cases page: Table action clicked', { act, id });

        if(act==='view'){
          try{
            console.log('Cases page: Loading case details for', id);
            const j = await fetchJSON('/api/cases/'+id);
            if(!j.ok) {
              alert('Case not found');
        return;
            }
            const r = j.row;
            showDetails(r);
          }catch(e){
            console.error('Cases page: Error loading case', e);
            alert('Error loading case: '+e.message);
          }
        }

        if(act==='edit'){
          try{
            console.log('Cases page: Loading case for edit', id);
            const r = await fetchJSON(`/api/cases/${id}`);
            if(!r.ok || !r.row){ 
              alert('Case not found.'); 
              return; 
            }
            const c = r.row;
            console.log('Cases page: Case data loaded for edit', c);
            const currentFrm = document.getElementById('frm') || frm;
            if (currentFrm) {
              currentFrm.reset();
              
              // Flatten nested objects for form fields
              const flatData = {
                ...c,
                // Flatten complainant object
                complainantName: c.complainant?.name || '',
                complainantAddress: c.complainant?.address || '',
                complainantContact: c.complainant?.contact || '',
                // Flatten respondent object
                respondentName: c.respondent?.name || '',
                respondentAddress: c.respondent?.address || '',
                respondentContact: c.respondent?.contact || ''
              };
              
              Object.keys(flatData).forEach(k=>{
                const f = currentFrm.querySelector(`[name="${k}"]`);
                if(f){
                  if(f.type==='date' || f.type==='datetime-local'){
                    if(flatData[k]) {
                      try {
                        f.value = new Date(flatData[k]).toISOString().slice(0,16);
                      } catch(e) {
                        console.warn('Cases page: Invalid date for', k, flatData[k]);
                      }
                    }
                  }else if(f.type==='checkbox'){
                    f.checked = !!flatData[k];
                  }else if(f.tagName === 'SELECT'){
                    // For select elements, set the value
                    f.value = flatData[k] || '';
                  }else{
                    f.value = flatData[k] || '';
                  }
                }
              });
              
              // Handle dynamic form fields based on type
              const typeSel = currentFrm.querySelector('#typeOfCase');
              if (typeSel && c.typeOfCase) {
                typeSel.value = c.typeOfCase;
                // Trigger change to show/hide conditional fields
                typeSel.dispatchEvent(new Event('change'));
              }
              
              // Log populated fields for debugging
              console.log('Cases page: Form populated with data', {
                complainantName: flatData.complainantName,
                complainantAddress: flatData.complainantAddress,
                complainantContact: flatData.complainantContact,
                respondentName: flatData.respondentName,
                respondentAddress: flatData.respondentAddress,
                respondentContact: flatData.respondentContact,
                typeOfCase: flatData.typeOfCase,
                description: flatData.description,
                placeOfIncident: flatData.placeOfIncident
              });
              
              // Set edit ID
              currentFrm.dataset.editId = id;
              
              const currentMsg = document.getElementById('msg') || msg;
              if (currentMsg) currentMsg.textContent='';
              const dlgTitle = document.getElementById('dlgTitle') || $('#dlgTitle');
              if (dlgTitle) dlgTitle.textContent='Edit Case';
              
              // Open modal with pointer-events enabled
              const currentModal = document.getElementById('modal');
              if (currentModal) {
                currentModal.classList.add('active');
                currentModal.style.setProperty('pointer-events', 'auto', 'important');
                currentModal.style.setProperty('display', 'flex', 'important');
                currentModal.style.setProperty('z-index', '10000', 'important');
                currentModal.style.setProperty('visibility', 'visible', 'important');
                currentModal.style.setProperty('opacity', '1', 'important');
                const dialog = currentModal.querySelector('.dialog');
                if (dialog) {
                  dialog.style.setProperty('pointer-events', 'auto', 'important');
                }
              }
            }
          }catch(e){
            console.error('Cases page: Error loading case for edit', e);
            alert('Error loading case: '+e.message);
          }
        }

        if(act==='del'){
          if(!confirm('Delete this case? This action cannot be undone.')) return;
          try{
            console.log('Cases page: Deleting case', id);
            const j = await fetchJSON(`/api/cases/${id}`, {method:'DELETE', credentials: 'include'});
            if(!j.ok){ 
              alert(j.message || 'Failed to delete case.'); 
              return; 
            }
            console.log('Cases page: Case deleted successfully');
                load();
            refreshSummary();
          }catch(e){
            console.error('Cases page: Error deleting case', e);
            alert('Error deleting case: '+e.message);
          }
        }
      });
      console.log('Cases page: Table action listeners attached');
    } else {
      console.warn('Cases page: Table wrapper not found for action buttons');
    }
    
    // Modal click-outside-to-close
    if (modal) {
      modal.addEventListener('click', (e) => {
        // Close if clicking on the modal background (not the dialog)
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
      // Prevent dialog clicks from closing modal
      const dialog = modal.querySelector('.dialog');
      if (dialog) {
        dialog.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
    }
    
    // Drawer close handlers - re-query to ensure fresh references
    const currentDClose = document.getElementById('dClose') || dClose;
    if (currentDClose) {
      const newDClose = currentDClose.cloneNode(true);
      currentDClose.parentNode.replaceChild(newDClose, currentDClose);
      newDClose.onclick = () => {
        const currentDrawer = document.getElementById('drawer') || drawer;
        if (currentDrawer) {
          currentDrawer.classList.remove('active');
          currentDrawer.style.removeProperty('display');
          currentDrawer.style.removeProperty('pointer-events');
          currentDrawer.style.removeProperty('z-index');
        }
      };
    }
    
    const currentDrawer = document.getElementById('drawer') || drawer;
    const overlay = currentDrawer?.querySelector('.overlay');
    if (overlay) {
      overlay.onclick = () => {
        if (currentDrawer) {
          currentDrawer.classList.remove('active');
          currentDrawer.style.removeProperty('display');
          currentDrawer.style.removeProperty('pointer-events');
          currentDrawer.style.removeProperty('z-index');
        }
      };
    }
    
    // Notification handlers
    if (notifBtn) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
        if (notifPanel) {
      const open = notifPanel.classList.toggle('open');
      if (open) {
        loadNotifications(true);
          }
      }
    });
    }
    
    document.addEventListener('click', () => {
      if (notifPanel) notifPanel.classList.remove('open');
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
  let initRetryCount = 0;
  const MAX_INIT_RETRIES = 10;
  let initTimeoutId = null;
  
  async function init() {
    // Clear any pending retries
    if (initTimeoutId) {
      clearTimeout(initTimeoutId);
      initTimeoutId = null;
    }
    
    // Check if we're still on the cases page
    const currentPath = window.location.pathname.toLowerCase();
    if (!currentPath.includes('case')) {
      console.log('Cases page: No longer on cases page, aborting init');
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
        console.warn('Cases page: Content area not found, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Cases page: Content area not found after max retries');
        return;
      }
    }
    
    // Verify content area has content (not just empty)
    if (!contentArea.innerHTML || contentArea.innerHTML.trim().length < 100) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Cases page: Content area is empty, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Cases page: Content area is empty after max retries');
        return;
      }
    }
    
    tblBody = contentArea.querySelector('#tbl tbody') || $('#tbl tbody');
    pager = contentArea.querySelector('#pager') || $('#pager');
    modal = document.getElementById('modal') || $('#modal');
    frm = document.getElementById('frm') || $('#frm');
    msg = document.getElementById('msg') || $('#msg');
    typeSel = document.getElementById('typeOfCase') || $('#typeOfCase');
    fType = document.getElementById('fType') || $('#fType');
    fPriority = document.getElementById('fPriority') || $('#fPriority');
    fStatus = document.getElementById('fStatus') || $('#fStatus');
    
    notifBtn = document.getElementById('notifBtn');
    notifPanel = document.getElementById('notifPanel');
    notifList = document.getElementById('notifList');
    notifEmpty = document.getElementById('notifEmpty');
    notifDot = document.getElementById('notifDot');
    notifMarkAll = document.getElementById('notifMarkAll');
    
    drawer = document.getElementById('drawer') || $('#drawer');
    dBody = document.getElementById('dBody') || $('#dBody');
    dFooter = document.getElementById('dFooter') || $('#dFooter');
    dClose = document.getElementById('dClose') || $('#dClose');
    dCaseId = document.getElementById('dCaseId') || $('#dCaseId');
    dStatus = document.getElementById('dStatus') || $('#dStatus');
    
    // Check if critical elements exist
    if (!tblBody || !pager) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Cases page: Critical DOM elements not found, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Cases page: Critical DOM elements not found after max retries');
        return;
      }
    }
    
    // Reset retry count on success
    initRetryCount = 0;
    initTimeoutId = null;
    
    ensureModalsClosed();
    await initUser();
  loadCaseTypes();
    
    // Setup all event listeners (re-attach them)
    setupEventListeners();
    
    // Reset state to ensure fresh data load
    state = { page:1, limit:10, status:'', q:'', from:'', to:'', mine:false, sort:'desc', type:'', priority:'' };
    
    // Delay summary refresh to ensure DOM elements are ready
    setTimeout(() => {
  refreshSummary();
    }, 100);
    
    // Load data
  load();
    
    // Don't close modals after init - let user interactions control them
    // The router already closes modals when loading new content
  }

  // Expose init function for router
  window.initCases = init;

  // Auto-initialize ONLY for direct page loads (not SPA navigation)
  // Check if router is active - if so, don't auto-init (router will call initCases)
  const isSPAMode = window.__ROUTER_INITIALIZED__ || window.location.pathname.includes('/admin/') || window.location.pathname.includes('/user/');
  
  if (!isSPAMode) {
    // Direct page load (not via router)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 50);
    }
  } else {
    // SPA mode - router will call initCases, don't auto-init
    console.log('Cases page: SPA mode detected, waiting for router to call initCases');
  }
})();
