// public/user-cases.js - User-specific version (no admin features)
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  
  // DOM element references - will be re-queried in init()
  let tblBody, pager, modal, frm, msg, typeSel, fType, fPriority;
  let notifBtn, notifPanel, notifList, notifEmpty, notifDot, notifMarkAll;
  let drawer, dBody, dClose, dCaseId, dStatus;

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
      
      const usernameEl = document.getElementById('username');
      const avatarEl = document.getElementById('avatar');
      if (usernameEl) usernameEl.textContent = user.name || 'User';
      if (avatarEl) avatarEl.textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
    }catch{ location.href='/login'; }
  }
  async function logout(){ await fetch('/api/logout',{method:'POST'}); location.href='/login'; }
  window.logout = logout;

  async function loadCaseTypes(){
    try{
      const j = await fetchJSON('/api/case-types');
      if (typeSel) {
        typeSel.innerHTML = '';
        (j.items || []).forEach(v=>{
          const o=document.createElement('option'); o.value=v; o.textContent=v; typeSel.appendChild(o);
        });
      }
      if (fType) {
        fType.innerHTML = '<option value="">All types</option>';
        (j.items || []).forEach(v=>{
          const o2=document.createElement('option'); o2.value=v; o2.textContent=v; fType.appendChild(o2);
        });
      }
    }catch{}
  }

  //---- state + helpers
  let state = { page:1, limit:10, status:'', q:'', from:'', to:'', sort:'desc', type:'', priority:'' };
  const badge = s => {
    const status = s || 'Pending';
    const statusMap = {
      'Pending': 'bg-[#dbeafe] text-[#1e40af] border-[#60a5fa]',
      'Ongoing': 'bg-[#e1f5fe] text-[#0277bd] border-[#4fc3f7]',
      'Resolved': 'bg-[#e3f2fd] text-[#1565c0] border-[#64b5f6]',
      'Cancelled': 'bg-[#e3f2fd] text-[#1565c0] border-[#64b5f6]'
    };
    const classes = statusMap[status] || 'bg-[#e3f2fd] text-[#1565c0] border-[#64b5f6]';
    return `<span class="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${classes}">${status}</span>`;
  };
  const fmt   = d => d ? new Date(d).toLocaleString() : '';

  async function load(){
    if (!tblBody) return;
    
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
  }

  function renderRows(rows){
    if (!tblBody) return;
    tblBody.innerHTML = '';
    if (!rows.length) {
      tblBody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center"><div class="flex flex-col items-center gap-3"><div class="text-4xl">⚖️</div><p class="text-gray-500 font-medium">No cases found.</p><p class="text-sm text-gray-400">Click "Report New Case" to get started.</p></div></td></tr>`;
      return;
    }
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      tr.className = 'group';
      tr.innerHTML = `
        <td><div style="font-size: 0.875rem; font-weight: 600; color: #111827;">${r.caseId}</div></td>
        <td><div style="font-size: 0.875rem; color: #374151;">${r.typeOfCase}</div></td>
        <td><div style="font-size: 0.875rem; color: #374151;">${fmt(r.createdAt)}</div></td>
        <td><div style="font-size: 0.875rem; color: #374151;">${fmt(r.dateOfIncident)}</div></td>
        <td>${badge(r.status)}</td>
        <td>
          <button class="action-btn-view" data-act="view" data-id="${r._id}">
            <i class="fas fa-eye"></i>
            <span>View</span>
          </button>
        </td>
      `;
      tblBody.appendChild(tr);
    });
  }

  function renderPager(page,totalPages,total){
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
    // Chips
    const chips = document.getElementById('chips');
    if (chips) {
      // Clone to remove old listeners
      const newChips = chips.cloneNode(true);
      chips.parentNode.replaceChild(newChips, chips);
      newChips.addEventListener('click',(e)=>{
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
    }

    // Filter button
    const btnFilter = document.getElementById('btnFilter');
    if (btnFilter) {
      const newBtnFilter = btnFilter.cloneNode(true);
      btnFilter.parentNode.replaceChild(newBtnFilter, btnFilter);
      newBtnFilter.onclick=()=>{
        const fFrom = document.getElementById('fFrom');
        const fTo = document.getElementById('fTo');
        const fQ = document.getElementById('fQ');
        state.from   = fFrom ? (fFrom.value || '') : '';
        state.to     = fTo ? (fTo.value || '') : '';
        state.q      = fQ ? fQ.value.trim() : '';
        state.type   = fType ? (fType.value || '') : '';
        state.priority = fPriority ? (fPriority.value || '') : '';
        state.page   = 1;
        load();
      };
    }

    // Add button - query within content area first, then fallback to document
    const contentArea = document.querySelector('.content-area');
    let btnAdd = contentArea ? contentArea.querySelector('#btnAdd') : null;
    if (!btnAdd) btnAdd = document.getElementById('btnAdd');
    
    if (btnAdd) {
      const newBtnAdd = btnAdd.cloneNode(true);
      btnAdd.parentNode.replaceChild(newBtnAdd, btnAdd);
      newBtnAdd.onclick=()=>{
        console.log('User cases: Report New Case button clicked');
        if (frm) {
          frm.reset();
        }
        if (msg) msg.textContent='';
        const dlgTitle = document.getElementById('dlgTitle');
        if (dlgTitle) dlgTitle.textContent='Report New Case';
        
        // Open modal with pointer-events enabled
        const currentModal = document.getElementById('modal');
        if (currentModal) {
          currentModal.classList.remove('hidden');
          currentModal.classList.add('flex');
          currentModal.style.setProperty('pointer-events', 'auto', 'important');
          currentModal.style.setProperty('display', 'flex', 'important');
          currentModal.style.setProperty('z-index', '10000', 'important');
          currentModal.style.setProperty('visibility', 'visible', 'important');
          currentModal.style.setProperty('opacity', '1', 'important');
          
          // Ensure dialog content is also clickable
          const dialog = currentModal.querySelector('.w-full.max-w-\\[700px\\]') || currentModal.querySelector('div > div');
          if (dialog) {
            dialog.style.setProperty('pointer-events', 'auto', 'important');
          }
          
          // IMPORTANT: Update form fields after modal opens to ensure correct visibility
          // Use setTimeout to ensure DOM is ready
          setTimeout(() => {
            updateFormFields();
          }, 50);
          
          console.log('User cases: Modal opened');
        } else {
          console.error('User cases: Modal not found');
        }
      };
      console.log('User cases: btnAdd event listener attached');
    } else {
      console.warn('User cases: btnAdd not found');
    }

    // Cancel button
    const btnCancel = document.getElementById('btnCancel');
    if (btnCancel) {
      const newBtnCancel = btnCancel.cloneNode(true);
      btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
      newBtnCancel.onclick=()=> {
        const currentModal = document.getElementById('modal');
        if (currentModal) {
          currentModal.classList.remove('flex');
          currentModal.classList.add('hidden');
          currentModal.style.removeProperty('pointer-events');
          currentModal.style.removeProperty('display');
          currentModal.style.removeProperty('z-index');
          currentModal.style.removeProperty('visibility');
          currentModal.style.removeProperty('opacity');
        }
      };
    }

    // Save button
    const btnSave = document.getElementById('btnSave');
    if (btnSave) {
      const newBtnSave = btnSave.cloneNode(true);
      btnSave.parentNode.replaceChild(newBtnSave, btnSave);
      newBtnSave.onclick=async ()=>{
        if (!frm) return;
        const fd = new FormData(frm);
        const body = Object.fromEntries(fd.entries());
        
        // Check required fields
        if (!body.typeOfCase || !body.complainantName || !body.complainantAddress || !body.description || !body.dateOfIncident) {
          if (msg) msg.textContent='Please fill all required fields.';
          return;
        }
        
        // If Harassment is selected, harassmentType is required
        if (body.typeOfCase === 'Harassment' && !body.harassmentType) {
          if (msg) msg.textContent='Please select a Harassment Type.';
          const harassmentTypeSelect = document.getElementById('harassmentType');
          if (harassmentTypeSelect) harassmentTypeSelect.focus();
          return;
        }
        
        const files = document.getElementById('evidenceFiles');
        if (!files || !files.files || files.files.length < 3) {
          if (msg) msg.textContent='Please upload at least 3 evidence files.';
          return;
        }
        try{
          const j = await fetchJSON('/api/cases', { method:'POST', body: fd, credentials: 'include' });
          if(!j.ok){ 
            if (msg) msg.textContent=j.message || 'Failed to save report.';
            return; 
          }
        }catch(e){
          if (msg) msg.textContent=e.message || 'Failed to save report.';
          return;
        }
        const currentModal = document.getElementById('modal');
        if (currentModal) {
          currentModal.classList.remove('flex');
          currentModal.classList.add('hidden');
          currentModal.style.removeProperty('pointer-events');
          currentModal.style.removeProperty('display');
          currentModal.style.removeProperty('z-index');
          currentModal.style.removeProperty('visibility');
          currentModal.style.removeProperty('opacity');
        }
        load();
      };
    }

    // Function to update form fields based on case type (accessible globally in this scope)
    const updateFormFields = () => {
      const typeSelect = document.getElementById('typeOfCase');
      if (!typeSelect) return;
      
      const v = typeSelect.value || '';
      const isHarass = v === 'Harassment';
      const isAssault = v === 'Physical Assault';
      const isVandal = v === 'Vandalism';
      const hw = document.getElementById('harassmentTypeWrap');
      const mw = document.getElementById('medicoWrap');
      const vw = document.getElementById('vandalWrap');
      const harassmentTypeSelect = document.getElementById('harassmentType');
      
      // Harassment Type field - ONLY show when Harassment is selected
      if (hw) {
        if (isHarass) {
          hw.classList.remove('hidden');
          hw.style.display = '';
          // Make required when visible
          if (harassmentTypeSelect) {
            harassmentTypeSelect.required = true;
          }
        } else {
          hw.classList.add('hidden');
          hw.style.display = 'none';
          // Remove required and clear value when hidden
          if (harassmentTypeSelect) {
            harassmentTypeSelect.required = false;
            harassmentTypeSelect.value = '';
          }
        }
      }
      
      // Medico-Legal field
      if (mw) {
        if (isAssault) {
          mw.classList.remove('hidden');
          mw.style.display = '';
        } else {
          mw.classList.add('hidden');
          mw.style.display = 'none';
          const medicoFile = document.getElementById('medicoLegalFile');
          if (medicoFile) medicoFile.value = '';
        }
      }
      
      // Vandalism Image field
      if (vw) {
        if (isVandal) {
          vw.classList.remove('hidden');
          vw.style.display = '';
        } else {
          vw.classList.add('hidden');
          vw.style.display = 'none';
          const vandalFile = document.getElementById('vandalismImage');
          if (vandalFile) vandalFile.value = '';
        }
      }
    };
    
    // Type selector - dynamic form behaviour
    if (typeSel) {
      const newTypeSel = typeSel.cloneNode(true);
      typeSel.parentNode.replaceChild(newTypeSel, typeSel);
      typeSel = newTypeSel;
      
      // Set initial state (should hide all conditional fields)
      updateFormFields();
      
      // Listen for changes
      newTypeSel.addEventListener('change', updateFormFields);
    }

    // Table actions - use event delegation on tbody
    if (tblBody) {
      // Use event delegation directly on tbody - no need to clone
      tblBody.addEventListener('click', async (e)=>{
        const btn = e.target.closest('button[data-act]');
        if(!btn) return;
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');

        if(act==='view'){
          console.log('User cases: View button clicked for case', id);
          try {
            // Re-query drawer elements to ensure fresh references
            const currentDrawer = document.getElementById('drawer');
            const currentDBody = document.getElementById('dBody');
            const currentDCaseId = document.getElementById('dCaseId');
            const currentDStatus = document.getElementById('dStatus');
            const currentDClose = document.getElementById('dClose');
            
            if (!currentDrawer) {
              console.error('User cases: Drawer not found');
              return;
            }
            
            const j = await fetchJSON('/api/cases/'+id, { credentials: 'include' });
            if(!j.ok) {
              alert('Case not found');
              return;
            }
            const r = j.row;
            
            if (currentDCaseId) currentDCaseId.textContent = r.caseId || 'Case';
            const status = r.status || 'Pending';
            const statusMap = {
              'Pending': 'bg-pending',
              'Ongoing': 'bg-ongoing',
              'Resolved': 'bg-resolved',
              'Cancelled': 'bg-cancelled'
            };
            const statusClass = statusMap[status] || 'bg-pending';
            if (currentDStatus) {
              currentDStatus.className = 'badge ' + statusClass;
              currentDStatus.textContent = status;
            }

            if (currentDBody) {
              // Escape HTML to prevent XSS
              const escape = (str) => {
                if (!str) return '';
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
              };
              
              currentDBody.innerHTML = `
                <div class="drawer-field">
                  <div class="drawer-field-label">Type</div>
                  <div class="drawer-field-value"><strong>${escape(r.typeOfCase || '')}</strong></div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Priority</div>
                  <div class="drawer-field-value">${escape(r.priority || 'Medium')}</div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Reported By</div>
                  <div class="drawer-field-value">${escape(r.reportedBy?.name || r.reportedBy?.username || '')}</div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Date Reported</div>
                  <div class="drawer-field-value">${escape(fmt(r.createdAt))}</div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Date of Incident</div>
                  <div class="drawer-field-value">${escape(fmt(r.dateOfIncident))}</div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Place</div>
                  <div class="drawer-field-value">${escape(r.placeOfIncident || '-')}</div>
                </div>
                ${r.harassmentType ? `
                <div class="drawer-field">
                  <div class="drawer-field-label">Harassment Type</div>
                  <div class="drawer-field-value">${escape(r.harassmentType)}</div>
                </div>
                ` : ''}
                ${r.seniorCategory ? `
                <div class="drawer-field">
                  <div class="drawer-field-label">Senior-Involved</div>
                  <div class="drawer-field-value">${escape(r.seniorCategory)}</div>
                </div>
                ` : ''}

                <h4>Complainant</h4>
                <div class="drawer-field">
                  <div class="drawer-field-label">Name</div>
                  <div class="drawer-field-value">${escape(r.complainant?.name || r.complainantName || '')}</div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Address</div>
                  <div class="drawer-field-value">${escape(r.complainant?.address || r.complainantAddress || '')}</div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Contact</div>
                  <div class="drawer-field-value">${escape(r.complainant?.contact || r.complainantContact || '')}</div>
                </div>

                <h4>Respondent</h4>
                <div class="drawer-field">
                  <div class="drawer-field-label">Name</div>
                  <div class="drawer-field-value">${escape(r.respondent?.name || r.respondentName || '-')}</div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Address</div>
                  <div class="drawer-field-value">${escape(r.respondent?.address || r.respondentAddress || '-')}</div>
                </div>
                <div class="drawer-field">
                  <div class="drawer-field-label">Contact</div>
                  <div class="drawer-field-value">${escape(r.respondent?.contact || r.respondentContact || '-')}</div>
                </div>

                <h4>Description</h4>
                <div class="drawer-description">${escape(r.description || '')}</div>

                ${Array.isArray(r.evidences) && r.evidences.length ? `
                  <h4>Evidence</h4>
                  <ul class="drawer-list">
                    ${r.evidences.map(ev => `
                      <li class="drawer-list-item">
                        <span class="drawer-badge drawer-badge-file">${escape(ev.kind || 'File')}</span>
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
                        <span class="drawer-badge drawer-badge-file">Hearing</span>
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
                        <span class="drawer-badge drawer-badge-file">Patawag</span>
                        <span>${escape(p.scheduleDate ? fmt(p.scheduleDate) : 'No schedule')} @ ${escape(p.venue || 'Barangay Hall')}</span>
                      </li>
                    `).join('')}
                  </ul>
                ` : ''}

                ${r.over45Note ? `<div class="drawer-note">${escape(r.over45Note)}</div>` : ''}

                <div class="drawer-meta">
                  <div class="drawer-meta-item">
                    <div class="drawer-meta-label">Created</div>
                    <div class="drawer-meta-value">${escape(fmt(r.createdAt))}</div>
                  </div>
                  <div class="drawer-meta-item">
                    <div class="drawer-meta-label">Last Updated</div>
                    <div class="drawer-meta-value">${escape(fmt(r.updatedAt))}</div>
                  </div>
                </div>

                <div class="drawer-actions">
                  <button class="drawer-btn" id="dPrint">Print</button>
                </div>
              `;

              const dPrint = document.getElementById('dPrint');
              if (dPrint) dPrint.onclick=()=>window.print();
            }
            
            // Open drawer with correct class
            currentDrawer.classList.remove('hidden');
            currentDrawer.classList.add('active');
            currentDrawer.style.setProperty('pointer-events', 'auto', 'important');
            currentDrawer.style.setProperty('display', 'flex', 'important');
            currentDrawer.style.setProperty('z-index', '10000', 'important');
            console.log('User cases: Drawer opened');
          } catch (e) {
            console.error('User cases: Error loading case details:', e);
            alert('Failed to load case details: ' + (e.message || 'Unknown error'));
          }
        }
      });
    }

    // Drawer close - re-query to get fresh reference
    const currentDClose = document.getElementById('dClose');
    if (currentDClose) {
      const newDClose = currentDClose.cloneNode(true);
      currentDClose.parentNode.replaceChild(newDClose, currentDClose);
      newDClose.onclick=()=>{
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
    
    // Close drawer when clicking overlay
    const currentDrawer = document.getElementById('drawer');
    if (currentDrawer) {
      const backdrop = currentDrawer.querySelector('.drawer-backdrop');
      if (backdrop) {
        const newBackdrop = backdrop.cloneNode(true);
        backdrop.parentNode.replaceChild(newBackdrop, backdrop);
        newBackdrop.onclick=()=>{
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

    // Notifications
    if (notifBtn && notifPanel) {
      const newNotifBtn = notifBtn.cloneNode(true);
      notifBtn.parentNode.replaceChild(newNotifBtn, notifBtn);
      notifBtn = newNotifBtn;
      
      newNotifBtn.addEventListener('click', (e) => {
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
        const newNotifMarkAll = notifMarkAll.cloneNode(true);
        notifMarkAll.parentNode.replaceChild(newNotifMarkAll, notifMarkAll);
        notifMarkAll = newNotifMarkAll;
        newNotifMarkAll.addEventListener('click', async (e) => {
          e.stopPropagation();
          await fetch('/api/case-notifications/read-all', { method:'POST' });
          loadNotifications(false);
        });
      }
    }
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

  // Main init function
  async function init() {
    // Re-query all DOM elements
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) {
      console.warn('User cases: Content area not found');
      return;
    }

    tblBody = contentArea.querySelector('#tbl tbody') || document.querySelector('#tbl tbody');
    pager = contentArea.querySelector('#pager') || document.getElementById('pager');
    modal = document.getElementById('modal');
    frm = document.getElementById('frm');
    msg = document.getElementById('msg');
    typeSel = document.getElementById('typeOfCase');
    fType = document.getElementById('fType');
    fPriority = document.getElementById('fPriority');

    notifBtn = document.getElementById('notifBtn');
    notifPanel = document.getElementById('notifPanel');
    notifList = document.getElementById('notifList');
    notifEmpty = document.getElementById('notifEmpty');
    notifDot = document.getElementById('notifDot');
    notifMarkAll = document.getElementById('notifMarkAll');

    drawer = document.getElementById('drawer');
    dBody = document.getElementById('dBody');
    dClose = document.getElementById('dClose');
    dCaseId = document.getElementById('dCaseId');
    dStatus = document.getElementById('dStatus');

    // Setup event listeners
    setupEventListeners();

    // Initialize user
    await initUser();
    
    // Load case types
    await loadCaseTypes();
    
    // Ensure conditional fields are hidden on initial load
    setTimeout(() => {
      const hw = document.getElementById('harassmentTypeWrap');
      const mw = document.getElementById('medicoWrap');
      const vw = document.getElementById('vandalWrap');
      if (hw) {
        hw.classList.add('hidden');
        hw.style.display = 'none';
      }
      if (mw) {
        mw.classList.add('hidden');
        mw.style.display = 'none';
      }
      if (vw) {
        vw.classList.add('hidden');
        vw.style.display = 'none';
      }
    }, 100);
    
    // Load data
    load();
  }

  // Expose init function for router
  window.initUserCases = init;

  // Auto-initialize ONLY for direct page loads (not SPA navigation)
  const isSPAMode = window.__ROUTER_INITIALIZED__;
  
  if (!isSPAMode) {
    // Direct page load (not via router)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 50);
    }
  } else {
    // SPA mode - router will call initUserCases, don't auto-init
    console.log('User cases: SPA mode detected, waiting for router to call initUserCases');
  }
})();
