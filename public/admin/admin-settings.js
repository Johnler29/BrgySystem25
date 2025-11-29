// public/settings.js
(function(){
  const $  = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>p.querySelectorAll(s);

  let user = null;
  let isAdmin = false;
  let currentTheme = 'light';

  const FORCE_ADMIN_MODE = false;

  // ---------- UTIL ----------
  function toast(msg,type='info',ms=2200){
    const n=document.createElement('div');
    n.textContent=msg;
    n.style.cssText=`
      position:fixed;top:80px;right:20px;z-index:10000;padding:12px 14px;
      color:#fff;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);
      background:${type==='success'?'#27ae60':type==='error'?'#e74c3c':type==='warning'?'#f39c12':'#3498db'};
      animation:fadeIn .15s ease;max-width:320px;font:14px/1.4 Inter,system-ui,sans-serif`;
    document.body.appendChild(n);
    setTimeout(()=>{ n.style.animation='fadeOut .15s ease'; setTimeout(()=>n.remove(),150); },ms);
  }
  const styles=document.createElement('style');
  styles.textContent=`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
                      @keyframes fadeOut{from{opacity:1}to{opacity:0}}`;
  document.head.appendChild(styles);

  // ---------- THEME / FONT APPLY ----------
  function applyTheme(theme){
    currentTheme = theme || 'light';
    if(currentTheme === 'dark'){
      document.documentElement.setAttribute('data-theme','dark');
    }else if(currentTheme === 'auto'){
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if(prefersDark) document.documentElement.setAttribute('data-theme','dark');
      else document.documentElement.removeAttribute('data-theme');
    }else{
      document.documentElement.removeAttribute('data-theme');
    }
  }
  function applyFontSize(size){
    const fs = (size||'medium').toLowerCase();
    document.documentElement.setAttribute('data-font-size', fs);
    const map = { small:'14px', medium:'16px', large:'18px', xlarge:'20px' };
    document.documentElement.style.setProperty('--fs-base', map[fs] || '16px');
  }

  // ---------- PERSIST ----------
  function readSaved(){
    try { return JSON.parse(localStorage.getItem('userSettings') || '{}'); }
    catch { return {}; }
  }
  function writeSaved(s){
    localStorage.setItem('userSettings', JSON.stringify(s));
  }

  function gather(){
    return {
      theme: currentTheme,
      language: $('#language')?.value,
      timezone: $('#timezone')?.value,
      dateFormat: $('#dateFormat')?.value,
      fontSize: $('#fontSize')?.value,
      autoSave: $('#autoSave')?.checked || false,
      compactMode: $('#compactMode')?.checked || false,
      showSidebar: $('#showSidebar')?.checked !== false,
      animations: $('#animations')?.checked || false,
      highContrast: $('#highContrast')?.checked || false,
      twoFactor: $('#twoFactor')?.checked || false,
      sessionTimeout: $('#sessionTimeout')?.value || '30',
      loginNotif: $('#loginNotif')?.checked || false,
      activityTracking: $('#activityTracking')?.checked || false,
      showProfile: $('#showProfile')?.checked || false,
      browserNotif: $('#browserNotif')?.checked || false,
      autoBackup: $('#autoBackup')?.checked || false
    };
  }

  function save(applyNow=true){
    const s = gather();
    writeSaved(s);
    if(applyNow){
      applyTheme(s.theme);
      applyFontSize(s.fontSize);
      document.body.classList.toggle('compact-mode', s.compactMode);
      document.body.classList.toggle('high-contrast', s.highContrast);
      document.body.classList.toggle('sidebar-collapsed', !s.showSidebar);
    }
    toast('Settings saved','success');
  }

  // ---------- LOAD ----------
  function loadAndApply(){
    const s = readSaved();

    // Theme UI
    if(s.theme){
      applyTheme(s.theme);
      $$('.theme-card').forEach(card=>{
        card.classList.toggle('active', card.getAttribute('data-theme')===s.theme);
      });
    } else {
      // reflect default selected card
      const activeCard = $('.theme-card.active') || $('.theme-card[data-theme="light"]');
      applyTheme(activeCard?.getAttribute('data-theme') || 'light');
    }

    // font size
    if($('#fontSize') && s.fontSize) { $('#fontSize').value = s.fontSize; }
    applyFontSize(s.fontSize || $('#fontSize')?.value || 'medium');

    // selects
    if($('#language') && s.language) $('#language').value = s.language;
    if($('#timezone') && s.timezone) $('#timezone').value = s.timezone;
    if($('#dateFormat') && s.dateFormat) $('#dateFormat').value = s.dateFormat;

    // toggles
    const bool = (v,def=false)=> (typeof v==='boolean'? v : def);
    if($('#autoSave')) $('#autoSave').checked = bool(s.autoSave,true);
    if($('#compactMode')) $('#compactMode').checked = bool(s.compactMode,false);
    if($('#showSidebar')) $('#showSidebar').checked = bool(s.showSidebar,true);
    if($('#animations')) $('#animations').checked = bool(s.animations,true);
    if($('#highContrast')) $('#highContrast').checked = bool(s.highContrast,false);
    if($('#twoFactor')) $('#twoFactor').checked = bool(s.twoFactor,false);
    if($('#loginNotif')) $('#loginNotif').checked = bool(s.loginNotif,true);
    if($('#activityTracking')) $('#activityTracking').checked = bool(s.activityTracking,true);
    if($('#showProfile')) $('#showProfile').checked = bool(s.showProfile,true);
    if($('#browserNotif')) $('#browserNotif').checked = bool(s.browserNotif,false);
    if($('#autoBackup')) $('#autoBackup').checked = bool(s.autoBackup,true);
    if($('#sessionTimeout') && s.sessionTimeout) $('#sessionTimeout').value = s.sessionTimeout;

    // layout-affecting classes
    document.body.classList.toggle('compact-mode', $('#compactMode')?.checked);
    document.body.classList.toggle('high-contrast', $('#highContrast')?.checked);
    document.body.classList.toggle('sidebar-collapsed', !($('#showSidebar')?.checked ?? true));
  }

  // ---------- EVENTS ----------
  function bindEvents(){
    // theme cards
$$('.theme-card').forEach(card=>{
  card.addEventListener('click', ()=>{
    $$('.theme-card').forEach(c=>c.classList.remove('active'));
    card.classList.add('active');

    const theme = card.getAttribute('data-theme');
    document.documentElement.classList.add('theme-xfade'); // smooth
    // apply + save + toast
    currentTheme = theme;
    applyTheme(theme);
    save(true); // shows toast "Settings saved"

    setTimeout(()=>document.documentElement.classList.remove('theme-xfade'), 300);
  });
});

    // font size change
    $('#fontSize')?.addEventListener('change', e=>{
      applyFontSize(e.target.value);
      if($('#autoSave')?.checked) save(false);
    });

    // compact / hc / sidebar
    $('#compactMode')?.addEventListener('change', e=>{
      document.body.classList.toggle('compact-mode', e.target.checked);
      if($('#autoSave')?.checked) save(false);
    });
    $('#highContrast')?.addEventListener('change', e=>{
      document.body.classList.toggle('high-contrast', e.target.checked);
      if($('#autoSave')?.checked) save(false);
    });
    $('#showSidebar')?.addEventListener('change', e=>{
      document.body.classList.toggle('sidebar-collapsed', !e.target.checked);
      if($('#autoSave')?.checked) save(false);
    });

    // browser notifications
    $('#browserNotif')?.addEventListener('change', async (e)=>{
      if(e.target.checked && 'Notification' in window){
        const perm = await Notification.requestPermission();
        if(perm !== 'granted'){
          e.target.checked = false;
          toast('Notification permission denied','error');
        }else{
          new Notification('Barangay Langkaan II', { body: 'Browser notifications enabled!' });
        }
      }
      if($('#autoSave')?.checked) save(false);
    });

    // buttons (scoped; fallback if IDs missing)
    ($('#btnSaveGeneral')||$('.settings-content .btn.btn-primary'))?.addEventListener('click', e=>{ e.preventDefault(); save(true); });
    $('#btnApplyTheme')?.addEventListener('click', e=>{ e.preventDefault(); save(true); });
    $('#btnSaveSecurity')?.addEventListener('click', e=>{ e.preventDefault(); save(true); });
    $('#btnSaveNotifications')?.addEventListener('click', e=>{ e.preventDefault(); save(true); });
    $('#btnSaveSystem')?.addEventListener('click', e=>{ e.preventDefault(); save(true); });
    $('#btnSaveAccount')?.addEventListener('click', e=>{ e.preventDefault(); save(true); });

    // navigation (left)
    $$('.settings-nav-item').forEach(item=>{
      item.addEventListener('click', ()=>{
        const section = item.getAttribute('data-section');
        $$('.settings-nav-item').forEach(i=>i.classList.remove('active'));
        item.classList.add('active');
        $$('.settings-section').forEach(sec=>sec.classList.remove('active'));
        $('#'+section)?.classList.add('active');
      });
    });

    // 2FA modal
    $('#setup2FA')?.addEventListener('click', ()=> $('#twoFactorModal')?.classList.add('active'));
    $('#close2FAModal')?.addEventListener('click', ()=> $('#twoFactorModal')?.classList.remove('active'));
    $('#twoFactorModal')?.addEventListener('click', (e)=>{ if(e.target=== $('#twoFactorModal')) $('#twoFactorModal').classList.remove('active'); });

    // export
    $('#exportData')?.addEventListener('click', ()=>{
      toast('Preparing export…','info');
      setTimeout(()=>{
        const data = { user, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = 'barangay-data-export.json'; a.click(); URL.revokeObjectURL(url);
        toast('Export downloaded','success');
      }, 900);
    });

    // restore enable
    $('#restoreFile')?.addEventListener('change', e=>{
      if(e.target.files.length){ $('#restoreBtn').disabled=false; toast('Selected: '+ e.target.files[0].name,'info'); }
    });
    $('#restoreBtn')?.addEventListener('click', ()=>{
      if(confirm('Restore from backup? Current data will be replaced.')) toast('Restoring…','info');
    });

    // change password
    $$('.btn-ghost').forEach(btn=>{
      if(btn.textContent.trim()==='Change Password'){
        btn.addEventListener('click', ()=>{
          const cur=$('#currentPassword')?.value||'';
          const npw=$('#newPassword')?.value||'';
          const cfm=$('#confirmPassword')?.value||'';
          if(!cur||!npw||!cfm) return toast('Please fill all password fields','error');
          if(npw!==cfm)       return toast('New passwords do not match','error');
          if(npw.length<8)    return toast('Password must be at least 8 characters','error');
          toast('Password changed','success');
          if($('#currentPassword')) $('#currentPassword').value='';
          if($('#newPassword')) $('#newPassword').value='';
          if($('#confirmPassword')) $('#confirmPassword').value='';
        });
      }
    });

    // activity tracking
    function logActivity(e){
      const entry={ t:e.type, ts:Date.now(), tag:e.target.tagName };
      const arr=JSON.parse(sessionStorage.getItem('activityLogs')||'[]');
      arr.push(entry); if(arr.length>100) arr.shift();
      sessionStorage.setItem('activityLogs', JSON.stringify(arr));
    }
    if($('#activityTracking')?.checked){
      document.addEventListener('click', logActivity);
      document.addEventListener('keypress', logActivity);
    }
    $('#activityTracking')?.addEventListener('change', e=>{
      if(e.target.checked){
        document.addEventListener('click', logActivity);
        document.addEventListener('keypress', logActivity);
      }else{
        document.removeEventListener('click', logActivity);
        document.removeEventListener('keypress', logActivity);
      }
      if($('#autoSave')?.checked) save(false);
    });

    // session timeout reminder
    let warnTimer;
    function resetTimeout(){
      clearTimeout(warnTimer);
      const mins = parseInt($('#sessionTimeout')?.value||'30',10);
      const ms = Math.max(mins*60000 - 60000, 60000); // warn 1 min before
      warnTimer = setTimeout(()=>{
        if(confirm('Your session is about to expire. Continue?')) resetTimeout();
        else logout();
      }, ms);
    }
    function logout(){ fetch('/api/logout',{method:'POST'}).finally(()=>location.href='/login'); }
    resetTimeout();
    $('#sessionTimeout')?.addEventListener('change', ()=>{ if($('#autoSave')?.checked) save(false); resetTimeout(); });

    // keyboard shortcut
    document.addEventListener('keydown', e=>{
      if((e.ctrlKey||e.metaKey) && e.key==='s'){ e.preventDefault(); save(true); }
      if(e.key==='Escape'){ $$('.modal').forEach(m=>m.classList.remove('active')); }
    });

    // auto-save any input/select/textarea change
    let autoTimer;
    $$('.settings-content input, .settings-content select, .settings-content textarea').forEach(el=>{
      el.addEventListener('change', ()=>{
        if($('#autoSave')?.checked){
          clearTimeout(autoTimer);
          autoTimer = setTimeout(()=>{ save(true); toast('Auto-saved','info',1500); }, 400);
        }
      });
    });

    // live OS theme change when on "auto"
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.onchange = () => {
      if(currentTheme==='auto') applyTheme('auto');
    };
  }

  // ---------- USER / INIT ----------
  async function init(){
    try{
      const r = await fetch('/api/me'); const j = await r.json();
      user = j.user || null;
      if(!user){ location.href='/login'; return; }
      isAdmin = FORCE_ADMIN_MODE || /^(admin)$/i.test(user.role||'') || user.isAdmin===true
                || user.type==='admin' || user.accountType==='admin';

      $('#username').textContent = user.name || user.username || 'User';
      $('#avatar').textContent = (user.name||user.username||'U').trim().charAt(0).toUpperCase();

      if(!isAdmin){
        $('#systemNav')?.classList.add('hidden');
        $('#adminOnlyAlert')?.classList.remove('hidden');
        $('#systemSettingsContent')?.classList.add('hidden');
      }else{
        $('#systemNav')?.classList.remove('hidden');
        $('#adminOnlyAlert')?.classList.add('hidden');
        $('#systemSettingsContent')?.classList.remove('hidden');
      }

      loadAndApply();
      bindEvents();
    }catch(e){
      console.error(e);
      location.href='/login';
    }
  }

  init();
})();
