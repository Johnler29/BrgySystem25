// public/global-settings.js
// Include this script in ALL pages to apply user settings globally

(function(){
  // Load and apply settings on page load
  function loadGlobalSettings(){
    try {
      // Load from localStorage
      const theme = localStorage.getItem('theme') || 'light';
      const fontSize = localStorage.getItem('fontSize') || 'medium';
      const compactMode = localStorage.getItem('compactMode') === 'true';
      const animations = localStorage.getItem('animations') !== 'false';
      const highContrast = localStorage.getItem('highContrast') === 'true';
      
      console.log('Loading global settings:', { theme, fontSize, compactMode, animations, highContrast });
      
      // Apply theme
      applyTheme(theme);
      
      // Apply font size
      applyFontSize(fontSize);
      
      // Apply compact mode
      if(compactMode){
        document.body.classList.add('compact-mode');
        document.body.style.setProperty('--spacing', '0.5rem');
      }
      
      // Apply animations
      if(!animations){
        const style = document.createElement('style');
        style.id = 'disable-animations-global';
        style.textContent = '* { transition: none !important; animation: none !important; }';
        document.head.appendChild(style);
      }
      
      // Apply high contrast
      if(highContrast){
        document.body.classList.add('high-contrast');
        document.documentElement.style.setProperty('--text-primary', '#000');
        document.documentElement.style.setProperty('--bg-primary', '#fff');
      }
      
    } catch(error) {
      console.error('Error loading global settings:', error);
    }
  }

  function applyTheme(theme){
    if(theme === 'dark'){
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if(theme === 'light'){
      document.documentElement.removeAttribute('data-theme');
    } else if(theme === 'auto'){
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if(isDark){
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    }
  }

  function applyFontSize(size){
    const root = document.documentElement;
    switch(size){
      case 'small':
        root.style.fontSize = '14px';
        break;
      case 'medium':
        root.style.fontSize = '16px';
        break;
      case 'large':
        root.style.fontSize = '18px';
        break;
      case 'xlarge':
        root.style.fontSize = '20px';
        break;
      default:
        root.style.fontSize = '16px';
    }
  }

  // Apply settings immediately when script loads
  loadGlobalSettings();
  
  // Re-apply when storage changes (settings saved in another tab)
  window.addEventListener('storage', (e) => {
    if(e.key === 'theme' || e.key === 'fontSize' || e.key === 'compactMode' || 
       e.key === 'animations' || e.key === 'highContrast'){
      loadGlobalSettings();
    }
  });
  
  // Expose function globally for other scripts
  window.loadGlobalSettings = loadGlobalSettings;
  
})();