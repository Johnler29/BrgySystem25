// public/residents.js
const $q = (sel) => document.querySelector(sel);
const $qa = (sel) => Array.from(document.querySelectorAll(sel));

let RES = [];
let VIEW = [];
let PAGE = 1;
const PER = 10;
let EDIT_ID = null;
let SORT = { key: 'name', dir: 'asc' };

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
  const q = $q('#q').value.trim().toLowerCase();
  const g = $q('#fGender').value;
  const an = $q('#fAnnex').value;
  const vo = $q('#fVoter').value;
  const indig = $q('#fIndigent').value;
  const single = $q('#fSingle').value;
  const f4ps = $q('#f4ps').value;

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
  const mk = (p, label=p, cls='p') => `<button class="${cls} ${p===PAGE?'active':''}" data-p="${p}">${label}</button>`;
  pg.innerHTML = `${mk(Math.max(1,PAGE-1),'‹ Prev')} ${Array.from({length:pages}).slice(0,7).map((_,i)=>mk(i+1)).join(' ')} ${mk(Math.min(pages,PAGE+1),'Next ›')}`;
  pg.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{ PAGE = Number(b.dataset.p); renderTable(); }));
}

function getRowId(e){ return e.target.closest('tr')?.dataset.id || null; }

async function loadResidents(){
  const res = await fetch('/api/residents', { credentials:'include' });
  const data = await res.json();
  RES = (data.residents||[]).map(r=>({
    ...r,
    indigent: r.indigent || 'No',
    singleParent: r.singleParent || 'No',
    fourPs: r.fourPs || r['4ps'] || 'No'
  }));
  VIEW = RES.slice();
  applyFilters();
}

/* Filters / Search / Sort */
['#q','#fGender','#fAnnex','#fVoter','#fIndigent','#fSingle','#f4ps'].forEach(sel=>{
  $q(sel).addEventListener('input', applyFilters);
  $q(sel).addEventListener('change', applyFilters);
});
$q('#btnFilter').addEventListener('click', ()=>{
  const f = $q('#filters'); f.style.display = f.style.display==='none'?'block':'none';
});
$q('#btnMore').addEventListener('click', ()=> alert('More actions coming soon (bulk update / print).'));
$q('#tbl thead').addEventListener('click', (e)=>{
  const map = { 'Name':'name','Resident ID':'residentId','Gender':'gender','Nearby Annex':'nearbyAnnex','Contact Number':'contactNumber','Voter':'voter' };
  const key = map[e.target.textContent.trim()]; if (!key) return;
  SORT = { key, dir: (SORT.key===key && SORT.dir==='asc') ? 'desc' : 'asc' };
  applyFilters();
});

/* CSV Export */
$q('#btnExport').addEventListener('click', ()=>{
  const cols = ['name','residentId','gender','nearbyAnnex','contactNumber','voter','indigent','singleParent','fourPs','address','civilStatus','occupation','dateOfBirth'];
  const rows = [cols.join(',')].concat(VIEW.map(r=> cols.map(c=> `"${String(r[c]??'').replace(/"/g,'""')}"`).join(',')));
  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'residents.csv'; a.click();
});

/* Modal (Add/Edit) */
const modal = $q('#modal'), form = $q('#frmResident'), title = $q('#modalTitle');
function openModal(id=null, readOnly=false){
  EDIT_ID = id;
  title.textContent = id ? (readOnly?'Resident Profile':'Edit Resident Profile') : 'Add New Resident';
  form.reset();
  if (id){
    const r = RES.find(x=> String(x._id)===String(id));
    if (r){
      $q('#mName').value = r.name||'';
      $q('#mResidentId').value = r.residentId||'';
      $q('#mGender').value = r.gender||'';
      $q('#mAnnex').value = r.nearbyAnnex||'Main';
      $q('#mContact').value = r.contactNumber||'';
      $q('#mDob').value = r.dateOfBirth ? r.dateOfBirth.slice(0,10) : '';
      $q('#mCivil').value = r.civilStatus||'Single';
      $q('#mVoter').value = r.voter||'No';
      $q('#mOcc').value = r.occupation||'';
      $q('#mIndigent').value = r.indigent||'No';
      $q('#mSingle').value = r.singleParent||'No';
      $q('#m4ps').value = r.fourPs || r['4ps'] || 'No';
      $q('#mAddress').value = r.address||'';
    }
  }
  const ro = readOnly;
  Array.from(form.querySelectorAll('input,select,textarea')).forEach(el=> el.disabled = ro);
  $q('#saveResident').style.display = ro ? 'none' : 'inline-block';
  modal.classList.add('open');
}
$q('#btnAdd').addEventListener('click', ()=> openModal());
$q('#cancelModal').addEventListener('click', ()=> modal.classList.remove('open'));
$q('#closeModal').addEventListener('click', ()=> modal.classList.remove('open'));

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    name: $q('#mName').value.trim(),
    residentId: $q('#mResidentId').value.trim(),
    gender: $q('#mGender').value,
    nearbyAnnex: $q('#mAnnex').value,
    contactNumber: $q('#mContact').value.trim(),
    dateOfBirth: $q('#mDob').value || null,
    civilStatus: $q('#mCivil').value,
    voter: $q('#mVoter').value,
    occupation: $q('#mOcc').value.trim(),
    indigent: $q('#mIndigent').value,
    singleParent: $q('#mSingle').value,
    fourPs: $q('#m4ps').value,
    address: $q('#mAddress').value.trim()
  };

  try{
    let ok=false,res;
    if (EDIT_ID){
      res = await fetch(`/api/residents/${EDIT_ID}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      ok = res.ok;
      if (ok){
        const upd = await res.json();
        const idx = RES.findIndex(x=> String(x._id)===String(EDIT_ID));
        if (idx>-1) RES[idx] = { ...RES[idx], ...upd.resident };
      }
    } else {
      res = await fetch('/api/residents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      ok = res.ok;
      if (ok){
        const { resident } = await res.json();
        RES.unshift(resident);
      }
    }
    if (!ok){ alert('Save failed (enable residents API on server).'); return; }
    modal.classList.remove('open');
    applyFilters();
  }catch{ alert('Save failed.'); }
});

/* Boot */
(async function(){
  try{ await loadResidents(); }catch{ alert('Failed to load residents'); }
})();
