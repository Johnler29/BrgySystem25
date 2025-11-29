// public/app-preferences.js
(function(){
  // quick logger so you can confirm it's loaded everywhere
  try { console.debug('[prefs] app-preferences.js loaded'); } catch(e){}

  function read() {
    try { return JSON.parse(localStorage.getItem('userSettings') || '{}'); }
    catch { return {}; }
  }
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else if (theme === 'auto') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) html.setAttribute('data-theme', 'dark');
      else html.removeAttribute('data-theme');
    } else {
      html.removeAttribute('data-theme');
    }
  }
  function applyFont(size) {
    const html = document.documentElement;
    const fs = (size || 'medium').toLowerCase();
    const map = { small:'14px', medium:'16px', large:'18px', xlarge:'20px' };
    html.setAttribute('data-font-size', fs);
    html.style.setProperty('--fs-base', map[fs] || '16px');
  }
  function applyBodyToggles(s) {
    document.body.classList.toggle('compact-mode', !!s.compactMode);
    document.body.classList.toggle('high-contrast', !!s.highContrast);
    document.body.classList.toggle('sidebar-collapsed', s.showSidebar === false);
  }

  // initial apply (in case page didn’t include the head bootstrap)
  const s = read();
  applyTheme(s.theme || 'light');
  applyFont(s.fontSize || 'medium');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>applyBodyToggles(s));
  } else {
    applyBodyToggles(s);
  }

  // react when OS theme changes and user is on "auto"
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.onchange = () => {
    const curr = read();
    if ((curr.theme || 'light') === 'auto') applyTheme('auto');
  };

  // cross-tab / cross-page sync
  window.addEventListener('storage', (e)=>{
    if (e.key === 'userSettings') {
      const now = read();
      applyTheme(now.theme || 'light');
      applyFont(now.fontSize || 'medium');
      applyBodyToggles(now);
      // little cross-fade
      document.documentElement.classList.add('theme-xfade');
      setTimeout(()=>document.documentElement.classList.remove('theme-xfade'), 300);
    }
  });
})();
