// Admin Residents Management
(() => {
  'use strict';

  const $id = (id) => document.getElementById(id);
  const $q = (sel) => document.querySelector(sel);
  const $qa = (sel) => Array.from(document.querySelectorAll(sel));

  let RES = [];
  let VIEW = [];
  let PAGE = 1;
  const PER = 10;
  let EDIT_ID = null;
  let SORT = { key: 'name', dir: 'asc' };
  
  // Check if we're in SPA mode (router is active)
  const isSPAMode = () => {
    return window.__ROUTER_INITIALIZED__ === true || 
           document.querySelector('.content-area') !== null;
  };

function toBadge(val, yes='b-yes', no='b-no'){
  const y = String(val).toLowerCase() === 'yes';
  return `<span class="badge ${y?yes:no}">${y?'Yes':'No'}</span>`;
}

function cmp(a,b,k){
  const av = (a?.[k] ?? '').toString().toLowerCase();
  const bv = (b?.[k] ?? '').toString().toLowerCase();
  if (av < bv) return SORT.dir==='asc' ? -1 : 1;
  if (av > bv) return SORT.dir==='asc' ? 1 : -1;
  return 0;
}

function applyFilters(){
  const qEl = $q('#q');
  const gEl = $q('#fGender');
  const anEl = $q('#fAnnex');
  const voEl = $q('#fVoter');
  const indigEl = $q('#fIndigent');
  const singleEl = $q('#fSingle');
  const f4psEl = $q('#f4ps');
  
  const q = qEl ? qEl.value.trim().toLowerCase() : '';
  const g = gEl ? gEl.value : '';
  const an = anEl ? anEl.value : '';
  const vo = voEl ? voEl.value : '';
  const indig = indigEl ? indigEl.value : '';
  const single = singleEl ? singleEl.value : '';
  const f4ps = f4psEl ? f4psEl.value : '';

  VIEW = RES.filter(r=>{
    const hay = `${r.name} ${r.residentId} ${r.contactNumber} ${r.address}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okG = !g || r.gender === g;
    const okA = !an || r.nearbyAnnex === an;
    const okV = !vo || r.voter === vo;
    const okI = !indig || (r.indigent||'No') === indig;
    const okS = !single || (r.singleParent||'No') === single;
    const ok4 = !f4ps || (r.fourPs||r['4ps']||'No') === f4ps;
    return okQ && okG && okA && okV && okI && okS && ok4;
  }).sort((a,b)=>cmp(a,b,SORT.key));

  PAGE = 1;
  renderTable();
}

function renderTable(){
  const start = (PAGE-1)*PER;
  const rows = VIEW.slice(start, start+PER);
  const tb = $q('#tbody');
  
  if (!tb) {
    console.warn('Admin residents: Table body (#tbody) not found');
    return;
  }
  
  if (rows.length === 0) {
    tb.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #6b7280;">No residents found.</td></tr>';
    const pg = $q('#pager');
    if (pg) pg.innerHTML = '';
    return;
  }
  
  tb.innerHTML = rows.map(r=>{
    const indig = r.indigent || 'No';
    const single = r.singleParent || 'No';
    const fourPs = r.fourPs || r['4ps'] || 'No';
    return `<tr data-id="${r._id||''}">
      <td data-label=""><input type="checkbox"></td>
      <td data-label="Name">${r.name||''}</td>
      <td data-label="Resident ID">${r.residentId||''}</td>
      <td data-label="Gender">${r.gender||''}</td>
      <td data-label="Nearby Annex">${r.nearbyAnnex||''}</td>
      <td data-label="Contact Number">${r.contactNumber||''}</td>
      <td data-label="Voter">${toBadge(r.voter||'No')}</td>
      <td data-label="Indigent">${toBadge(indig, 'b-info', 'b-no')}</td>
      <td data-label="Single Parent">${toBadge(single, 'b-info', 'b-no')}</td>
      <td data-label="4Ps">${toBadge(fourPs, 'b-info', 'b-no')}</td>
      <td class="t-actions" data-label="Actions">
        <button class="kebab">⋮</button>
        <div class="menu">
          <div class="mi view">View Resident Profile</div>
          <div class="mi edit">Edit Resident Profile</div>
          <div class="mi delete">Delete this Resident</div>
        </div>
      </td>
    </tr>`;
  }).join('');

  // row action menus
  tb.querySelectorAll('.kebab').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const menu = e.currentTarget.nextElementSibling;
      $qa('.menu').forEach(m=> m!==menu && m.classList.remove('open'));
      menu.classList.toggle('open');
      e.stopPropagation();
    });
  });
  document.addEventListener('click', ()=> $qa('.menu').forEach(m=>m.classList.remove('open')));

  tb.querySelectorAll('.view').forEach(mi=> mi.addEventListener('click', (e)=> openModal(getRowId(e), true)));
  tb.querySelectorAll('.edit').forEach(mi=> mi.addEventListener('click', (e)=> openModal(getRowId(e), false)));
  tb.querySelectorAll('.delete').forEach(mi=> mi.addEventListener('click', async (e)=>{
    const id = getRowId(e);
    if (!id || !confirm('Delete this resident?')) return;
    try{
      const res = await fetch(`/api/residents/${id}`, { method:'DELETE', headers:{'Content-Type':'application/json'} });
      if (res.ok){ RES = RES.filter(r=> String(r._id)!==String(id)); applyFilters(); }
      else alert('Delete failed (enable API in server).');
    }catch{ alert('Delete failed.'); }
  }));

  // pager
  const pages = Math.max(1, Math.ceil(VIEW.length / PER));
  const pg = $q('#pager');
  if (pg) {
    const mk = (p, label=p, cls='p') => `<button class="${cls} ${p===PAGE?'active':''}" data-p="${p}">${label}</button>`;
    pg.innerHTML = `${mk(Math.max(1,PAGE-1),'‹ Prev')} ${Array.from({length:pages}).slice(0,7).map((_,i)=>mk(i+1)).join(' ')} ${mk(Math.min(pages,PAGE+1),'Next ›')}`;
    pg.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{ PAGE = Number(b.dataset.p); renderTable(); }));
  }
}

function getRowId(e){ return e.target.closest('tr')?.dataset.id || null; }

async function loadResidents(){
  try {
    const tbody = $q('#tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #6b7280;">Loading residents...</td></tr>';
    }
    
    const res = await fetch('/api/residents', { credentials:'include' });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.message || 'Failed to load residents');
    }
    
    RES = (data.residents||[]).map(r=>({
      ...r,
      indigent: r.indigent || 'No',
      singleParent: r.singleParent || 'No',
      fourPs: r.fourPs || r['4ps'] || 'No'
    }));
    VIEW = RES.slice();
    
    console.log(`Admin residents: Loaded ${RES.length} residents`);
    applyFilters();
  } catch (e) {
    console.error('Admin residents: Error loading residents:', e);
    const tbody = $q('#tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 40px; color: #dc2626;">Error loading residents: ${e.message}</td></tr>`;
    }
  }
}

  function exportCSV() {
    const cols = ['name', 'residentId', 'gender', 'nearbyAnnex', 'contactNumber', 'voter', 'indigent', 'singleParent', 'fourPs', 'address', 'civilStatus', 'occupation', 'dateOfBirth'];
    const rows = [cols.join(',')].concat(VIEW.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'residents.csv';
    a.click();
  }

  function openModal(id = null, readOnly = false) {
    EDIT_ID = id;
    const title = $id('modalTitle');
    const form = $id('frmResident');
    const modal = $id('modal');
    
    if (!modal || !form) {
      console.warn('Admin residents: Modal or form not found');
      return;
    }

    if (title) {
      title.textContent = id ? (readOnly ? 'Resident Profile' : 'Edit Resident Profile') : 'Add New Resident';
    }
    
    form.reset();
    
    if (id) {
      const r = RES.find(x => String(x._id) === String(id));
      if (r) {
        if ($id('mName')) $id('mName').value = r.name || '';
        if ($id('mResidentId')) $id('mResidentId').value = r.residentId || '';
        if ($id('mGender')) $id('mGender').value = r.gender || '';
        if ($id('mAnnex')) $id('mAnnex').value = r.nearbyAnnex || 'Main';
        if ($id('mContact')) $id('mContact').value = r.contactNumber || '';
        if ($id('mDob')) {
          const dob = r.dateOfBirth;
          if (dob) {
            // Handle both Date objects and string dates
            const dateStr = dob instanceof Date ? dob.toISOString().slice(0, 10) : 
                           typeof dob === 'string' ? dob.slice(0, 10) : '';
            $id('mDob').value = dateStr;
          } else {
            $id('mDob').value = '';
          }
        }
        if ($id('mCivil')) $id('mCivil').value = r.civilStatus || 'Single';
        if ($id('mVoter')) $id('mVoter').value = r.voter || 'No';
        if ($id('mOcc')) $id('mOcc').value = r.occupation || '';
        if ($id('mIndigent')) $id('mIndigent').value = r.indigent || 'No';
        if ($id('mSingle')) $id('mSingle').value = r.singleParent || 'No';
        if ($id('m4ps')) $id('m4ps').value = r.fourPs || r['4ps'] || 'No';
        if ($id('mAddress')) $id('mAddress').value = r.address || '';
      }
    }
    
    const ro = readOnly;
    Array.from(form.querySelectorAll('input,select,textarea')).forEach(el => el.disabled = ro);
    const saveBtn = $id('saveResident');
    if (saveBtn) saveBtn.style.display = ro ? 'none' : 'inline-block';
    
    // Explicitly show the modal
    modal.classList.add('open');
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
    modal.style.zIndex = '10000';
  }

  // Initialize function for router
  async function init() {
    console.log('Admin residents: init() called');
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) {
      console.warn('Admin residents: Content area not found, retrying...');
      setTimeout(init, 100);
      return;
    }

    // Check if content is actually loaded
    if (!contentArea.innerHTML || contentArea.innerHTML.trim().length < 100) {
      console.warn('Admin residents: Content area is empty, waiting...');
      setTimeout(init, 100);
      return;
    }

    // Wait a bit for DOM to be fully ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Re-query all DOM elements within content area
    const tbody = $id('tbody');
    const form = $id('frmResident');
    const modal = $id('modal');
    
    if (!tbody) {
      console.warn('Admin residents: Table body (#tbody) not found, retrying...');
      setTimeout(init, 100);
      return;
    }

    console.log('Admin residents: Initializing...');
    
    // Setup event listeners first
    setupEventListeners();
    
    // Load residents
    await loadResidents();
  }

  function setupEventListeners() {
    // Remove old listeners by cloning elements
    const elementsToClone = [
      { id: 'btnFilter', handler: () => {
          const f = $id('filters');
          if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
        }},
      { id: 'btnMore', handler: () => alert('More actions coming soon (bulk update / print).') },
      { id: 'btnExport', handler: exportCSV },
      { id: 'btnAdd', handler: () => openModal() },
      { id: 'cancelModal', handler: () => {
          const modal = $id('modal');
          const form = $id('frmResident');
          if (modal) {
            modal.classList.remove('open');
            modal.style.removeProperty('display');
            modal.style.removeProperty('pointer-events');
            modal.style.removeProperty('z-index');
          }
          if (form) form.reset();
          EDIT_ID = null;
        }},
      { id: 'closeModal', handler: () => {
          const modal = $id('modal');
          const form = $id('frmResident');
          if (modal) {
            modal.classList.remove('open');
            modal.style.removeProperty('display');
            modal.style.removeProperty('pointer-events');
            modal.style.removeProperty('z-index');
          }
          if (form) form.reset();
          EDIT_ID = null;
        }}
    ];

    elementsToClone.forEach(({ id, handler }) => {
      const el = $id(id);
      if (el) {
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener('click', handler);
      }
    });

    // Filter inputs
    ['#q', '#fGender', '#fAnnex', '#fVoter', '#fIndigent', '#fSingle', '#f4ps'].forEach(sel => {
      const el = $q(sel);
      if (el) {
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener('input', applyFilters);
        newEl.addEventListener('change', applyFilters);
      }
    });

    // Table header sort
    const thead = $q('#tbl thead');
    if (thead) {
      const newThead = thead.cloneNode(true);
      thead.parentNode.replaceChild(newThead, thead);
      newThead.addEventListener('click', (e) => {
        const map = { 
          'Name': 'name',
          'Resident ID': 'residentId',
          'Gender': 'gender',
          'Nearby Annex': 'nearbyAnnex',
          'Contact Number': 'contactNumber',
          'Voter': 'voter' 
        };
        const key = map[e.target.textContent.trim()];
        if (!key) return;
        SORT = { key, dir: (SORT.key === key && SORT.dir === 'asc') ? 'desc' : 'asc' };
        applyFilters();
      });
    }

    // Form submit
    const form = $id('frmResident');
    if (form) {
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
      newForm.addEventListener('submit', handleFormSubmit);
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const payload = {
      name: $id('mName')?.value.trim() || '',
      residentId: $id('mResidentId')?.value.trim() || '',
      gender: $id('mGender')?.value || '',
      nearbyAnnex: $id('mAnnex')?.value || 'Main',
      contactNumber: $id('mContact')?.value.trim() || '',
      dateOfBirth: $id('mDob')?.value || null,
      civilStatus: $id('mCivil')?.value || 'Single',
      voter: $id('mVoter')?.value || 'No',
      occupation: $id('mOcc')?.value.trim() || '',
      indigent: $id('mIndigent')?.value || 'No',
      singleParent: $id('mSingle')?.value || 'No',
      fourPs: $id('m4ps')?.value || 'No',
      address: $id('mAddress')?.value.trim() || ''
    };

    try {
      let ok = false, res;
      if (EDIT_ID) {
        res = await fetch(`/api/residents/${EDIT_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        ok = res.ok;
        if (ok) {
          const upd = await res.json();
          const idx = RES.findIndex(x => String(x._id) === String(EDIT_ID));
          if (idx > -1) RES[idx] = { ...RES[idx], ...upd.resident };
        }
      } else {
        res = await fetch('/api/residents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        ok = res.ok;
        if (ok) {
          const { resident } = await res.json();
          RES.unshift(resident);
        }
      }
      if (!ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || 'Save failed (enable residents API on server).');
        return;
      }
      
      // Success - close modal and refresh
      const modal = $id('modal');
      if (modal) {
        modal.classList.remove('open');
        // Remove inline styles that were set when opening
        modal.style.removeProperty('display');
        modal.style.removeProperty('pointer-events');
        modal.style.removeProperty('z-index');
      }
      
      // Reset form and EDIT_ID
      const form = $id('frmResident');
      if (form) form.reset();
      EDIT_ID = null;
      
      // Reload residents to get fresh data from server
      await loadResidents();
    } catch (e) {
      console.error('Save error:', e);
      alert('Save failed: ' + (e.message || 'Unknown error'));
    }
  }

  // Expose init function for router - do this immediately
  window.initResidents = init;
  console.log('Admin residents: initResidents function exposed to window');

  // Auto-initialize only if not in SPA mode
  if (!isSPAMode()) {
    console.log('Admin residents: Not in SPA mode, auto-initializing...');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init, 50);
      });
    } else {
      setTimeout(init, 50);
    }
  } else {
    console.log('Admin residents: In SPA mode, waiting for router to call initResidents');
  }
})();
