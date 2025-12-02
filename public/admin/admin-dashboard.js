// public/admin-dashboard.js

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const on = (el, evt, fn, opt) => el && el.addEventListener(evt, fn, opt);

async function fetchJSON(url, opts = {}) {
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const res = await fetch(url, { 
      credentials:'include', 
      headers:{ Accept:'application/json', ...(opts.headers||{}) }, 
      signal: controller.signal,
      ...opts 
    });
    clearTimeout(timeoutId);
    
    try { const redirectedTo = res.redirected ? new URL(res.url).pathname : ''; if (redirectedTo === '/login') throw Object.assign(new Error('Unauthenticated'), { code:'UNAUTH' }); } catch {}
    const text = await res.text();
    if (!res.ok) { const err = Object.assign(new Error(text || res.statusText), { status:res.status }); if (res.status===401||res.status===403) err.code='UNAUTH'; throw err; }
    const ct=(res.headers.get('content-type')||'').toLowerCase();
    if (!ct.includes('application/json')) throw Object.assign(new Error('Expected JSON'), { code:'NONJSON', payload:text });
    return JSON.parse(text);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('Request timeout'), { code: 'TIMEOUT' });
    }
    throw err;
  }
}

function countUp(el, to, duration=900){
  const start = Number((el.textContent||'').replace(/[^\d]/g,'')) || 0;
  const t0 = performance.now();
  const step = (t)=>{
    const p = Math.min((t - t0)/duration, 1);
    el.textContent = Math.floor(start + (to - start)*p).toLocaleString();
    if (p<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- user ---------- */
async function initUser(){
  try{
    const me = await fetchJSON('/api/me');
    const user = me.user;
    if (!user) { location.href='/login'; return false; }
    
    // Check if user is admin
    const isAdmin = /^(admin)$/i.test(user.role||'') || user.isAdmin===true || user.type==='admin' || user.accountType==='admin';
    if (!isAdmin) {
      // Redirect non-admin users to user dashboard
      location.href='/user/dashboard';
      return false;
    }
    
    const name = user.name || 'Admin';
    $('greeting') && ($('greeting').textContent = `Admin Dashboard`);
    $('username') && ($('username').textContent = name);
    $('avatar') && ($('avatar').textContent = name.charAt(0).toUpperCase());
    return true;
  }catch(e){
    if (e.code==='UNAUTH' || e.code==='NONJSON'){ location.href='/login'; return false; }
    console.warn('[initUser]', e); return true;
  }
}

/* ---------- stats / activities ---------- */
async function initStats(){
  try{
    const { stats } = await fetchJSON('/api/stats');
    $('totalResidents') && countUp($('totalResidents'), Number(stats.totalResidents)||0);
    $('totalDocuments') && countUp($('totalDocuments'), Number(stats.totalDocuments)||0);
    $('pendingDocuments') && countUp($('pendingDocuments'), Number(stats.pendingDocuments)||0);
    $('avgResidents') && countUp($('avgResidents'), Number(stats.avgResidents)||0);

    try{
      const docs = await fetchJSON('/api/documents');
      const released = (docs.documents||[]).filter(d=>d.status==='Released').length;
      $('releasedCount') && countUp($('releasedCount'), released);
      
      // Get pending approvals for admin
      const pending = (docs.documents||[]).filter(d=>d.status==='Pending').length;
      $('pendingApprovals') && countUp($('pendingApprovals'), pending);
    }catch(e){ console.warn('[initStats/docs]', e); }
  }catch(e){
    if (e.code==='UNAUTH' || e.code==='NONJSON'){ location.href='/login'; return; }
    console.warn('[initStats]', e);
  }
}

async function initActivities(){
  try{
    const { recentActivities } = await fetchJSON('/api/recent-activities');
    const wrap = $('recentActivities'); if (!wrap) return;
    wrap.innerHTML='';
    (recentActivities||[]).forEach(a=>{
      const row=document.createElement('div');
      row.className='announce-row';
      row.innerHTML=`<div class="announce-dot" style="background:var(--brand)"></div>
                     <div><div style="font-weight:600;">${a.name} ${a.action}</div>
                     <div class="announce-meta">${a.date||''}</div></div>`;
      wrap.appendChild(row);
    });
  }catch(e){
    if (e.code==='UNAUTH' || e.code==='NONJSON'){ location.href='/login'; return; }
    console.warn('[initActivities]', e);
  }
}

/* ---------- calendar ---------- */
function initCalendar(){
  const now = new Date();
  $('calMonth') && ($('calMonth').textContent = `${now.toLocaleString('default',{month:'long'})} ${now.getFullYear()}`);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth()+1, 0);
  const grid  = $('calGrid'); if(!grid) return;
  grid.innerHTML='';
  ['M','T','W','T','F','S','S'].forEach(d=>{ const el=document.createElement('div'); el.className='dow'; el.textContent=d; grid.appendChild(el); });
  const pad=(first.getDay()+6)%7; for(let i=0;i<pad;i++) grid.appendChild(document.createElement('div'));
  for(let day=1; day<=last.getDate(); day++){
    const cell=document.createElement('div'); cell.className='calendar-day'; cell.textContent=String(day).padStart(2,'0');
    if (day===now.getDate()) cell.classList.add('today');
    grid.appendChild(cell);
  }
}

/* ---------- new widgets ---------- */
// Live clock (local)
function initClock(){
  const t = $('clockTime'), d = $('clockDate'); if(!t||!d) return;
  const fmt = new Intl.DateTimeFormat(undefined,{ hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const dfmt = new Intl.DateTimeFormat(undefined,{ weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const tick = ()=>{ const now=new Date(); t.textContent = fmt.format(now); d.textContent = dfmt.format(now); };
  tick(); setInterval(tick, 1000);
}

// Weather (Open-Meteo) - Non-blocking with timeout
async function initWeather(){
  const tempEl=$('weatherTemp'), descEl=$('weatherDesc'); if(!tempEl||!descEl) return;
  const render = (t, w)=>{ tempEl.textContent = `${Math.round(t)}°C`; descEl.textContent = w; };
  
  // Set default/fallback immediately so UI isn't blocked
  render(25, 'Loading...');
  
  try{
    // Add timeout wrapper to prevent hanging
    const position = await Promise.race([
      new Promise((resolve, reject)=>{
        if (!navigator.geolocation) return reject(new Error('No geolocation'));
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          enableHighAccuracy: false, // Use false for faster response
          timeout: 5000, // Reduced from 8000ms
          maximumAge: 300000 // Accept cached position up to 5 minutes old
        });
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Geolocation timeout')), 5000)
      )
    ]);
    
    const { latitude:lat, longitude:lon } = position.coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    
    // Add fetch timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const j = await r.json();
    const cw = j.current_weather;
    const codeMap = {
      0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
      45:'Fog',48:'Depositing rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
      61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
      80:'Rain showers',81:'Rain showers',82:'Heavy showers',95:'Thunderstorm'
    };
    render(cw.temperature, codeMap[cw.weathercode] || 'Weather');
  }catch(e){
    // Show fallback weather instead of error message
    render(25, 'Partly cloudy');
  }
}

// Events (fallback demo)
async function initEvents(){
  const list = $('eventList'); if (!list) return;
  list.innerHTML = '';
  try{
    const { events } = await fetchJSON('/api/events');
    (events||[]).slice(0,5).forEach(ev=>{
      const div = document.createElement('div');
      div.className='event-item';
      div.innerHTML = `<strong>${ev.title||'Event'}</strong><div class="announce-meta">${ev.date||''} • ${ev.location||''}</div>`;
      list.appendChild(div);
    });
    if (!list.children.length) throw new Error('No events');
  }catch(err){
    // Silently handle 404 or other errors - use fallback events
    if (err.status === 404) {
      // API endpoint doesn't exist, use fallback
    }
    [
      {title:'Barangay Council Meeting', date:'Oct 20, 2025 • 2:00 PM', location:'Session Hall'},
      {title:'Clean-up Drive', date:'Oct 26, 2025 • 7:00 AM', location:'Phase 2'},
      {title:'Health Check-up', date:'Nov 2, 2025 • 9:00 AM', location:'Barangay Clinic'}
    ].forEach(ev=>{
      const div=document.createElement('div');
      div.className='event-item';
      div.innerHTML=`<strong>${ev.title}</strong><div class="announce-meta">${ev.date} • ${ev.location}</div>`;
      list.appendChild(div);
    });
  }
}

/* ---------- menus ---------- */
function initUserMenus(){
  const chip=$('userChip'), menu=$('userMenu'), notif=$('notifPanel');
  const avatar=$('avatar'), name=$('username'), bell=$('notifBtn');

  const closeAll=()=>{ menu?.classList.remove('open'); notif?.classList.remove('open'); };
  const toggle=(el)=> el?.classList.toggle('open');

  // open/toggle
  on(avatar,'click',(e)=>{ e.stopPropagation(); toggle(menu); notif?.classList.remove('open'); });
  on(name,'click',(e)=>{ e.stopPropagation(); toggle(menu); notif?.classList.remove('open'); });
  on(bell,'click',(e)=>{ e.stopPropagation(); toggle(notif); menu?.classList.remove('open'); });

  // prevent inside-click from closing
  on(menu,'click', (e)=> e.stopPropagation());
  on(notif,'click',(e)=> e.stopPropagation());

  // close on outside / Esc
  on(document,'click',(e)=>{
    const inChip = chip?.contains(e.target);
    const inMenu = menu?.contains?.(e.target);
    const inNotif = notif?.contains?.(e.target);
    if (!inChip && !inMenu && !inNotif) closeAll();
  });
  on(document,'keydown',(e)=>{ if(e.key==='Escape') closeAll(); });

  // menu actions
  on($('goProfile'),'click',()=>alert('Profile — coming soon'));
  on($('goSettings'),'click',()=>location.href='/admin/settings');
  on($('doLogout'),'click',()=>logout());
}

/* ---------- sidebar (default expanded; icons-only collapse) ---------- */
function initSidebar(){
  const sidebar=$('sidebar'), hamburger=$('hamburgerBtn'); if(!sidebar||!hamburger) return;

  // Default: expanded (respect previous choice)
  const saved = localStorage.getItem('sidebar-collapsed');
  if (saved === '1') sidebar.classList.add('collapsed');

  on(hamburger,'click',()=>{
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
  });
}

/* ---------- logout ---------- */
async function logout(){ try{ await fetch('/api/logout',{method:'POST',credentials:'include'});} finally{ location.href='/login'; } }
window.logout = logout;

/* ---------- boot ---------- */
(async function(){
  initSidebar();
  initUserMenus();

  const ok = await initUser(); if (!ok) return;

  // Initialize non-blocking UI elements first
  initClock();
  initCalendar();

  // Initialize async operations in parallel (non-blocking)
  // These won't block the UI from rendering
  Promise.all([
    initStats().catch(e => console.warn('[initStats]', e)),
    initActivities().catch(e => console.warn('[initActivities]', e)),
    initEvents().catch(e => console.warn('[initEvents]', e))
  ]).catch(e => console.warn('[Dashboard init]', e));

  // Weather can be slow, run it separately and don't wait
  initWeather().catch(e => console.warn('[initWeather]', e));

  // Hide skeleton after a delay
  setTimeout(()=>{ const sk=$('requestsSkel'); if(sk) sk.style.display='none'; }, 1100);
})();

