// public/user/user-settings.js - User-specific settings
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  
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
      
      isAdmin = /^(admin)$/i.test(user.role||'') || user.isAdmin===true || user.type==='admin' || user.accountType==='admin';
      
      // Redirect if accessing wrong route
      if (isAdmin) {
        location.href='/admin/settings';
        return;
      }
      
      $('#username').textContent = user.name || 'User';
      $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
      
      // Load user settings
      loadSettings();
    }catch{ location.href='/login'; }
  }

  async function logout(){ 
    await fetch('/api/logout',{method:'POST'}); 
    location.href='/login'; 
  }
  window.logout = logout;

  function loadSettings(){
    try {
      const s = JSON.parse(localStorage.getItem('userSettings') || '{}');
      
      // General
      if ($('#language')) $('#language').value = s.language || 'en';
      if ($('#timezone')) $('#timezone').value = s.timezone || 'Asia/Manila';
      if ($('#compactMode')) $('#compactMode').checked = !!s.compactMode;
      if ($('#showSidebar')) $('#showSidebar').checked = s.showSidebar !== false;
      
      // Appearance
      if ($('#fontSize')) $('#fontSize').value = s.fontSize || 'medium';
      if ($('#highContrast')) $('#highContrast').checked = !!s.highContrast;
      
      // Account
      if ($('#fullName')) $('#fullName').value = user.name || '';
      if ($('#email')) $('#email').value = user.email || '';
      if ($('#phone')) $('#phone').value = user.phone || '';
      
      // Security
      if ($('#twoFactor')) $('#twoFactor').checked = !!s.twoFactor;
      if ($('#sessionTimeout')) $('#sessionTimeout').value = s.sessionTimeout || '30';
      if ($('#loginNotif')) $('#loginNotif').checked = s.loginNotif !== false;
      if ($('#showProfile')) $('#showProfile').checked = s.showProfile !== false;
      
      // Theme cards
      document.querySelectorAll('.theme-card').forEach(card => {
        if (card.dataset.theme === (s.theme || 'light')) {
          card.style.borderColor = 'var(--brand)';
        }
      });
    } catch(e) {
      console.error('Load settings error:', e);
    }
  }

  function saveSettings(){
    const s = {
      language: $('#language')?.value || 'en',
      timezone: $('#timezone')?.value || 'Asia/Manila',
      compactMode: $('#compactMode')?.checked || false,
      showSidebar: $('#showSidebar')?.checked !== false,
      fontSize: $('#fontSize')?.value || 'medium',
      highContrast: $('#highContrast')?.checked || false,
      twoFactor: $('#twoFactor')?.checked || false,
      sessionTimeout: $('#sessionTimeout')?.value || '30',
      loginNotif: $('#loginNotif')?.checked !== false,
      showProfile: $('#showProfile')?.checked !== false,
      theme: document.querySelector('.theme-card[data-theme].border-\\[var\\(--brand\\)\\]')?.dataset.theme || 
             document.querySelector('.theme-card[style*="border-color"]')?.dataset.theme || 
             'light'
    };
    
    localStorage.setItem('userSettings', JSON.stringify(s));
    
    // Apply theme immediately
    const html = document.documentElement;
    if (s.theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else if (s.theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) html.setAttribute('data-theme', 'dark'); else html.removeAttribute('data-theme');
    } else {
      html.removeAttribute('data-theme');
    }
    
    // Apply font size
    const map = { small:'14px', medium:'16px', large:'18px', xlarge:'20px' };
    html.setAttribute('data-font-size', s.fontSize);
    html.style.setProperty('--fs-base', map[s.fontSize] || '16px');
    
    // Apply body classes
    document.body.classList.toggle('compact-mode', !!s.compactMode);
    document.body.classList.toggle('high-contrast', !!s.highContrast);
    document.body.classList.toggle('sidebar-collapsed', s.showSidebar === false);
    
    alert('Settings saved successfully!');
  }

  // Event listeners
  $('#btnSaveGeneral')?.addEventListener('click', () => {
    saveSettings();
  });

  $('#btnApplyTheme')?.addEventListener('click', () => {
    saveSettings();
  });

  $('#btnSaveAccount')?.addEventListener('click', async () => {
    try {
      const body = {
        name: $('#fullName')?.value || '',
        email: $('#email')?.value || '',
        phone: $('#phone')?.value || ''
      };
      const j = await fetchJSON('/api/user/profile', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });
      if (j.ok) {
        alert('Profile updated successfully!');
        location.reload();
      } else {
        alert(j.message || 'Failed to update profile');
      }
    } catch(e) {
      alert('Failed to update profile: ' + e.message);
    }
  });

  document.querySelector('button:has-text("Change Password")')?.addEventListener('click', async () => {
    const current = $('#currentPassword')?.value;
    const newPwd = $('#newPassword')?.value;
    const confirm = $('#confirmPassword')?.value;
    
    if (!current || !newPwd || !confirm) {
      alert('Please fill all password fields');
      return;
    }
    
    if (newPwd !== confirm) {
      alert('New passwords do not match');
      return;
    }
    
    try {
      const j = await fetchJSON('/api/user/change-password', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd })
      });
      if (j.ok) {
        alert('Password changed successfully!');
        $('#currentPassword').value = '';
        $('#newPassword').value = '';
        $('#confirmPassword').value = '';
      } else {
        alert(j.message || 'Failed to change password');
      }
    } catch(e) {
      alert('Failed to change password: ' + e.message);
    }
  });

  $('#btnSaveSecurity')?.addEventListener('click', () => {
    saveSettings();
  });

  $('#btnSaveNotifications')?.addEventListener('click', () => {
    saveSettings();
  });

  // Theme card selection
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.theme-card').forEach(c => {
        c.style.borderColor = '';
      });
      card.style.borderColor = 'var(--brand)';
      saveSettings();
    });
  });

  // Init
  initUser();
})();

