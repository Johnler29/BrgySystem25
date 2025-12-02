// Router for SPA navigation - loads content dynamically into dashboard
(function() {
  'use strict';
  
  // Prevent multiple initializations
  if (window.__ROUTER_INITIALIZED__) {
    console.log('Router already initialized, skipping...');
    return;
  }
  window.__ROUTER_INITIALIZED__ = true;
  
  // Track loaded scripts globally to prevent re-loading
  window.__LOADED_SCRIPTS__ = window.__LOADED_SCRIPTS__ || new Set();
  
  // Wait for DOM to be ready
  function initRouter() {
    const isUser = window.location.pathname.startsWith('/user/');
    const isAdmin = window.location.pathname.startsWith('/admin/');
    const basePath = isUser ? '/user' : '/admin';
    
    // Keep body hidden until router is ready
    document.body.classList.remove('router-ready');
    
    // Content container
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) {
      console.error('Content area not found, retrying...');
      setTimeout(initRouter, 100);
      return;
    }
    
    // Hide content area for non-dashboard routes immediately
    const initialPath = window.location.pathname;
    const isDashboardRoute = initialPath === basePath + '/dashboard';
    
    if (!isDashboardRoute) {
      // Hide content area immediately to prevent dashboard flash
      contentArea.style.opacity = '0';
      contentArea.style.visibility = 'hidden';
      contentArea.removeAttribute('data-route-loaded');
    } else {
      // Dashboard route - mark as loaded but keep body hidden until router initializes
      contentArea.setAttribute('data-route-loaded', 'true');
    }
    
    startRouter(isUser, isAdmin, basePath, contentArea);
  }
  
  function startRouter(isUser, isAdmin, basePath, contentArea) {
  
  // Role-based access control configuration
  // Maps admin pages to required roles/permissions
  const ROLE_ACCESS = {
    '/admin/dashboard': ['admin', 'super_admin', 'moderator'], // All admin roles can access dashboard
    '/admin/residents': ['admin', 'super_admin', 'moderator'],
    '/admin/document-permits': ['admin', 'super_admin', 'clerk'], // Clerk can manage documents
    '/admin/community': ['admin', 'super_admin', 'moderator'],
    '/admin/cases': ['admin', 'super_admin', 'moderator'],
    '/admin/health': ['admin', 'super_admin', 'health_officer'],
    '/admin/disaster': ['admin', 'super_admin', 'emergency_officer'],
    '/admin/financial': ['admin', 'super_admin'], // Only admins and super admins
    '/admin/logs-reports': ['admin', 'super_admin'], // Only admins and super admins
    '/admin/users': ['admin', 'super_admin'], // Only admins and super admins can manage users
    '/admin/settings': ['admin', 'super_admin'] // Only admins and super admins
  };
  
  // Default: if page not in config, require admin role
  const DEFAULT_REQUIRED_ROLES = ['admin', 'super_admin'];
  
  // Current user info
  let currentUser = null;
  let userRole = null;
  
  // Fetch and cache user info
  async function fetchUserInfo() {
    if (currentUser) return currentUser;
    
    try {
      // Check if user info is already available
      if (window.__BRGY_USER__) {
        currentUser = window.__BRGY_USER__;
        userRole = currentUser.role || 'user';
        return currentUser;
      }
      
      // Fetch from API with timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch('/api/me', { 
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          // Don't throw on 401/403 - just return null
          if (response.status === 401 || response.status === 403) {
            return null;
          }
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.user) {
          currentUser = data.user;
          userRole = currentUser.role || 'user';
          window.__BRGY_USER__ = currentUser; // Cache globally
          return currentUser;
        }
        
        return null;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.warn('User info fetch timeout');
          return null;
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      return null;
    }
  }
  
  // Check if user has access to a page
  async function hasAccess(path) {
    // User pages don't need role checking (they're public to logged-in users)
    if (path.startsWith('/user/')) {
      return true;
    }
    
    // Admin pages need role checking
    if (path.startsWith('/admin/')) {
      const user = await fetchUserInfo();
      
      if (!user) {
        // Not logged in - redirect to login
        window.location.href = '/login';
        return false;
      }
      
      // Check if user is admin (basic check)
      const isAdmin = /^(admin|super_admin)$/i.test(user.role || '') || 
                      user.isAdmin === true || 
                      user.type === 'admin' || 
                      user.accountType === 'admin';
      
      if (!isAdmin) {
        // Not an admin - redirect to user dashboard
        window.location.href = '/user/dashboard';
        return false;
      }
      
      // Get required roles for this page
      const requiredRoles = ROLE_ACCESS[path] || DEFAULT_REQUIRED_ROLES;
      const userRoleLower = (user.role || 'user').toLowerCase();
      
      // Check if user's role is in the required roles list
      const hasRequiredRole = requiredRoles.some(role => 
        role.toLowerCase() === userRoleLower
      );
      
      if (!hasRequiredRole) {
        // User doesn't have required role
        return false;
      }
      
      return true;
    }
    
    return true;
  }
  
  // Update navigation visibility based on roles
  async function updateNavigationVisibility() {
    const user = await fetchUserInfo();
    if (!user || !isAdmin) return;
    
    const navLinks = document.querySelectorAll('.sidebar-menu a');
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('/admin/')) return;
      
      const requiredRoles = ROLE_ACCESS[href] || DEFAULT_REQUIRED_ROLES;
      const userRoleLower = (user.role || 'user').toLowerCase();
      const hasAccess = requiredRoles.some(role => 
        role.toLowerCase() === userRoleLower
      );
      
      // Hide links user doesn't have access to
      if (!hasAccess) {
        link.style.display = 'none';
        // Also hide the parent <li> if it exists
        const listItem = link.closest('li');
        if (listItem) {
          listItem.style.display = 'none';
        }
      } else {
        link.style.display = '';
        const listItem = link.closest('li');
        if (listItem) {
          listItem.style.display = '';
        }
      }
    });
  }
  
  // Page content cache
  const pageCache = new Map();
  
  // Current page state
  let currentPage = null;
  let currentScripts = [];
  
  // Extract content from HTML string
  function extractContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find the content area in the loaded page - try multiple selectors
    let loadedContent = doc.querySelector('.content-area');
    
    // If not found, try finding it within main
    if (!loadedContent) {
      const main = doc.querySelector('main');
      if (main) {
        loadedContent = main.querySelector('.content-area');
      }
    }
    
    // Find modals, drawers, and other elements outside dashboard-container
    const dashboardContainer = doc.querySelector('.dashboard-container');
    const modals = [];
    
    // Get all elements after the dashboard-container (modals, drawers, etc.)
    if (dashboardContainer && dashboardContainer.parentElement) {
      let nextSibling = dashboardContainer.nextElementSibling;
      while (nextSibling) {
        // Check if it's a modal/drawer pattern
        const id = nextSibling.id || '';
        const classes = nextSibling.className || '';
        const tagName = nextSibling.tagName?.toLowerCase() || '';
        if (id.includes('modal') || id.includes('drawer') || id.includes('dialog') ||
            (classes.includes('modal') || classes.includes('drawer')) ||
            (tagName === 'div' && (classes.includes('fixed') || id.includes('Modal') || id.includes('Drawer')))) {
          modals.push(nextSibling.outerHTML);
          console.log('Found modal after dashboard-container:', id || classes);
        }
        nextSibling = nextSibling.nextElementSibling;
      }
    }
    
    // Also check for modals anywhere in body that aren't in dashboard-container
    const allModals = doc.querySelectorAll('[id*="modal"], [id*="drawer"], [id*="dialog"], .modal, .drawer');
    allModals.forEach(modal => {
      if (!dashboardContainer || !dashboardContainer.contains(modal)) {
        const existing = modals.find(m => {
          const temp = document.createElement('div');
          temp.innerHTML = m;
          const existingEl = temp.querySelector(`#${modal.id}`);
          return existingEl !== null;
        });
        if (!existing) {
          modals.push(modal.outerHTML);
          console.log('Found modal via selector:', modal.id || modal.className);
        }
      }
    });
    
    console.log('Total modals found:', modals.length);
    
    // Remove script tags from content HTML to prevent re-execution
    // Scripts are handled separately via extractContent's scripts array
    let contentHTML = '';
    if (loadedContent) {
      const contentClone = loadedContent.cloneNode(true);
      // Remove all script tags from the content
      contentClone.querySelectorAll('script').forEach(script => {
        script.remove();
      });
      contentHTML = contentClone.innerHTML;
      console.log('Content extracted, length:', contentHTML.length);
    } else {
      // Fallback: try to find main content without content-area class
      const main = doc.querySelector('main');
      if (main) {
        // Get all content inside main except sidebar and header
        const mainClone = main.cloneNode(true);
        const sidebar = mainClone.querySelector('.sidebar, nav.sidebar');
        const header = mainClone.querySelector('.header, header');
        if (sidebar) sidebar.remove();
        if (header) header.remove();
        // Remove script tags from fallback content too
        mainClone.querySelectorAll('script').forEach(script => {
          script.remove();
        });
        contentHTML = mainClone.innerHTML;
        console.log('Using main content fallback, length:', contentHTML.length);
      } else {
        console.error('No content-area or main found in page');
        contentHTML = '';
      }
    }
    
    return {
      html: contentHTML,
      modals: modals,
      title: doc.querySelector('title')?.textContent || '',
      scripts: Array.from(doc.querySelectorAll('script[src]'))
        .map(s => {
          // Get relative path, ensure it starts with /
          const src = s.getAttribute('src');
          return src.startsWith('/') ? src : '/' + src;
        })
        .filter(src => {
          // Filter out dashboard-level scripts that are already loaded
          // These cause conflicts if reloaded (especially base.js with const $)
          const skipScripts = [
            '/base.js',
            '/base-header.js',
            '/app-preferences.js',
            '/router.js'
          ];
          const normalizedSrc = src.toLowerCase();
          // Check both exact match and case-insensitive match
          const shouldSkip = skipScripts.some(skip => skip.toLowerCase() === normalizedSrc);
          if (shouldSkip) {
            console.log('Filtering out dashboard script:', src);
            return false;
          }
          // For page-specific scripts, allow them to be re-executed
          const isPageSpecificScript = /^\/(admin|user)\/(admin|user)-.+\.js$/i.test(src);
          if (isPageSpecificScript) {
            // Always include page-specific scripts so they can be re-executed
            return true;
          }
          
          // Also check if already loaded (only for non-page-specific scripts)
          if (window.__LOADED_SCRIPTS__ && window.__LOADED_SCRIPTS__.has(src)) {
            console.log('Script already in loaded set, filtering out:', src);
            return false;
          }
          return true;
        }),
      styles: Array.from(doc.querySelectorAll('style')).map(s => s.innerHTML)
    };
  }
  
  // Load and inject scripts
  function loadScripts(scripts) {
    if (!scripts || scripts.length === 0) {
      console.log('No scripts to load');
      return Promise.resolve();
    }
    
    console.log('Loading scripts:', scripts);
    return Promise.all(scripts.map(src => {
      // Normalize script path
      const normalizedSrc = src.startsWith('/') ? src : '/' + src;
      
      // Skip dashboard-level scripts that should never be reloaded
      const skipScripts = [
        '/base.js',
        '/base-header.js',
        '/app-preferences.js',
        '/router.js'
      ];
      if (skipScripts.includes(normalizedSrc)) {
        console.log('Skipping dashboard script:', normalizedSrc);
        return Promise.resolve();
      }
      
      // Check if this is a page-specific script (admin-*.js, user-*.js)
      // These need to be re-executed on navigation to re-query DOM elements
      const isPageSpecificScript = /^\/(admin|user)\/(admin|user)-.+\.js$/i.test(normalizedSrc);
      
      // For page-specific scripts, remove from loaded set and re-execute
      if (isPageSpecificScript && window.__LOADED_SCRIPTS__.has(normalizedSrc)) {
        console.log('Page-specific script detected, removing from cache to allow re-execution:', normalizedSrc);
        window.__LOADED_SCRIPTS__.delete(normalizedSrc);
        // Also remove existing script tag from DOM to force reload
        const existing = document.querySelector(`script[src="${src}"]`) || 
                        document.querySelector(`script[src="${normalizedSrc}"]`);
        if (existing) {
          existing.remove();
        }
      }
      
      // Check global loaded scripts set (only for non-page-specific scripts)
      if (!isPageSpecificScript && window.__LOADED_SCRIPTS__.has(normalizedSrc)) {
        console.log('Script already loaded (global check), skipping:', normalizedSrc);
        return Promise.resolve();
      }
      
      // Also check DOM for existing script (only for non-page-specific scripts)
      if (!isPageSpecificScript) {
        const existing = document.querySelector(`script[src="${src}"]`) || 
                        document.querySelector(`script[src="${normalizedSrc}"]`);
        if (existing) {
          console.log('Script already in DOM, skipping:', normalizedSrc);
          window.__LOADED_SCRIPTS__.add(normalizedSrc);
          return Promise.resolve();
        }
      }
      
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = normalizedSrc;
        script.onload = () => {
          console.log('Script loaded successfully:', normalizedSrc);
          window.__LOADED_SCRIPTS__.add(normalizedSrc);
          
          // Special handling for residents page - call init immediately after script loads
          if (normalizedSrc.includes('admin-residents.js')) {
            console.log('Router: admin-residents.js loaded, checking for initResidents...');
            setTimeout(() => {
              if (window.initResidents && typeof window.initResidents === 'function') {
                console.log('Router: Calling initResidents immediately after script load');
                try {
                  window.initResidents();
                } catch (e) {
                  console.error('Router: Error calling initResidents after script load:', e);
                }
              } else {
                console.warn('Router: initResidents not found immediately after script load, will retry in main init loop');
              }
            }, 100);
          }
          
          resolve();
        };
        script.onerror = (err) => {
          console.warn('Script load failed (non-critical):', normalizedSrc);
          // Still mark as attempted to prevent retries
          window.__LOADED_SCRIPTS__.add(normalizedSrc);
          // Resolve anyway to not block other scripts
          resolve();
        };
        document.head.appendChild(script);
      });
    }));
  }
  
  // Update active nav item
  function updateActiveNav(path) {
    const navLinks = document.querySelectorAll('.sidebar-menu a');
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === path || (path !== basePath + '/dashboard' && href === path)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }
  
  // Update page title
  function updateTitle(title) {
    document.title = title || 'Dashboard — Barangay Langkaan II';
    const greeting = document.getElementById('greeting');
    if (greeting && title) {
      // Extract page name from title
      const pageName = title.replace(' — Barangay Langkaan II', '').trim();
      if (pageName !== 'Dashboard') {
        greeting.textContent = pageName;
      }
    }
  }
  
  // Convert route path to static file path
  function getPageFilePath(routePath) {
    // Convert /user/cases -> /user/user-cases.html
    // Convert /admin/residents -> /admin/admin-residents.html
    // Convert /admin/document-permits -> /admin/admin-document-permits.html
    const parts = routePath.split('/').filter(p => p);
    if (parts.length < 2) return null;
    
    const prefix = parts[0]; // 'user' or 'admin'
    const page = parts[1]; // 'cases', 'residents', 'document-permits', etc.
    
    // Handle dashboard specially
    if (page === 'dashboard') {
      return `/${prefix}/${prefix}-dashboard.html`;
    }
    
    // Convert kebab-case: document-permits -> admin-document-permits.html
    // The page part already contains the full name (e.g., 'document-permits')
    return `/${prefix}/${prefix}-${page}.html`;
  }
  
  // Track if a page is currently loading to prevent loops
  let isLoading = false;
  let loadingPath = null; // Track which path is currently loading
  
  // Load page content
  async function loadPage(path) {
    // Normalize path
    const normalizedPath = path.split('?')[0]; // Remove query params
    
    // Check role-based access before loading
    const accessGranted = await hasAccess(normalizedPath);
    if (!accessGranted) {
      // Show access denied message
      contentArea.innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <div style="max-width: 500px; margin: 0 auto;">
            <div style="font-size: 4rem; margin-bottom: 20px;">🔒</div>
            <h2 style="color: #dc2626; margin-bottom: 10px;">Access Denied</h2>
            <p style="color: #6b7280; margin-bottom: 20px;">
              You don't have permission to access this page. Please contact an administrator if you believe this is an error.
            </p>
            <button onclick="window.router.navigate('${basePath}/dashboard')" class="btn btn-primary" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 8px; cursor: pointer;">
              Go to Dashboard
            </button>
          </div>
        </div>
      `;
      // Show body for access denied page
      contentArea.style.opacity = '1';
      contentArea.style.visibility = 'visible';
      document.body.classList.add('router-ready');
      return;
    }
    
    // Allow re-loading the same page if explicitly navigating to it
    // (This allows data to refresh when navigating back to a page)
    // Only skip if we're currently loading the exact same path
    if (currentPage === normalizedPath && isLoading && loadingPath === normalizedPath) {
      console.log('Page already loading:', normalizedPath);
      return;
    }
    
    // Prevent loading loops - check if we're already loading this exact path
    if (isLoading && loadingPath === normalizedPath) {
      console.log('Page already loading (same path), skipping:', normalizedPath);
      return;
    }
    
    // Prevent loading loops - check if we're loading a different path
    if (isLoading && loadingPath !== normalizedPath) {
      console.log('Another page is loading, waiting...', loadingPath);
      // Wait for current load to finish
      let waitCount = 0;
      while (isLoading && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      if (isLoading) {
        console.warn('Timeout waiting for page load, proceeding anyway');
        isLoading = false;
      }
    }
    
    console.log('Loading page:', normalizedPath);
    isLoading = true;
    loadingPath = normalizedPath;
    // Don't set currentPage here - set it after content is loaded to allow re-loading
    
    // Hide content area and show loading state
    contentArea.style.opacity = '0';
    contentArea.style.visibility = 'hidden';
    contentArea.removeAttribute('data-route-loaded');
    contentArea.innerHTML = '<div style="padding: 40px; text-align: center;"><div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div><p>Loading...</p></div>';
    
    try {
      // Check cache first (use normalized path)
      if (pageCache.has(normalizedPath)) {
        const cached = pageCache.get(normalizedPath);
        // Inject cached styles FIRST to prevent FOUC
        if (cached.styles && cached.styles.length > 0) {
          cached.styles.forEach(style => {
            const styleEl = document.createElement('style');
            styleEl.textContent = style;
            document.head.appendChild(styleEl);
          });
        }
        
        // Sanitize cached content too
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = cached.html;
        tempContainer.querySelectorAll('script').forEach(script => {
          script.remove();
        });
        contentArea.innerHTML = tempContainer.innerHTML;
        
        // Show content area now that styles are loaded
        contentArea.style.opacity = '1';
        contentArea.style.visibility = 'visible';
        contentArea.setAttribute('data-route-loaded', 'true');
        
        // Inject cached modals
        if (cached.modals && cached.modals.length > 0) {
          cached.modals.forEach(modalHTML => {
            const temp = document.createElement('div');
            temp.innerHTML = modalHTML;
            const modal = temp.firstElementChild;
            if (modal) {
              // Remove any script tags from cached modals
              modal.querySelectorAll('script').forEach(script => {
                script.remove();
              });
              
              const id = modal.id;
              if (id) {
                const existing = document.getElementById(id);
                if (existing) existing.remove();
              }
              
              // Ensure modal is closed (remove active class and any display-related classes)
              modal.classList.remove('active', 'show', 'open', 'flex', 'block');
              
              // Remove any inline display styles that might force it to show
              if (modal.style.display) {
                modal.style.removeProperty('display');
              }
              
              // Explicitly set display to none to ensure it's hidden
              modal.style.display = 'none';
              
              document.body.appendChild(modal);
            }
          });
        }
        
        updateTitle(cached.title);
        updateActiveNav(normalizedPath);
        currentPage = normalizedPath;
        
        // Remove the inline hide style if it exists
        const hideStyle = document.getElementById('router-hide-style');
        if (hideStyle) {
          hideStyle.remove();
        }
        
        // Show body after cached content is loaded
        document.body.classList.add('router-ready');
        
        // Reset loading state IMMEDIATELY after content is loaded
        // This allows navigation to proceed even if init functions take time
        isLoading = false;
        loadingPath = null;
        
        // Load scripts if needed
        if (cached.scripts.length > 0) {
          await loadScripts(cached.scripts);
        }
        
        // Call init functions after scripts load - use requestAnimationFrame to ensure DOM is ready
        // Only call init function for the current page being loaded
        const path = normalizedPath.toLowerCase();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              // Document Permits page
              if (path.includes('document-permit') && window.initDocumentPermits) {
                try { window.initDocumentPermits(); } catch (e) { console.error('Error calling initDocumentPermits:', e); }
              }
              // Disaster page
              if (path.includes('disaster') && window.initDisaster) {
                try { window.initDisaster(); } catch (e) { console.error('Error calling initDisaster:', e); }
              }
              // Users page
              if (path.includes('user') && !path.includes('document') && window.initUsers) {
                try { window.initUsers(); } catch (e) { console.error('Error calling initUsers:', e); }
              }
              // Health page
              if (path.includes('health') && window.initHealth) {
                try { window.initHealth(); } catch (e) { console.error('Error calling initHealth:', e); }
              }
              // Cases page
              if (path.includes('case') && window.initCases) {
                try { window.initCases(); } catch (e) { console.error('Error calling initCases:', e); }
              }
              // Settings page
              if (path.includes('setting') && window.initSettings) {
                try { window.initSettings(); } catch (e) { console.error('Error calling initSettings:', e); }
              }
              // Community page
            if (path.includes('community') && window.initCommunity) {
              try { window.initCommunity(); } catch (e) { console.error('Error calling initCommunity:', e); }
            }
            
            if (path.includes('financial') && window.initFinancial) {
              // Ensure content is injected before calling init
              const contentArea = document.querySelector('.content-area');
              if (contentArea && contentArea.innerHTML.trim()) {
                // Force reflow
                void contentArea.offsetHeight;
                try { 
                  window.initFinancial(); 
                } catch (e) { 
                  console.error('Error calling initFinancial:', e); 
                }
              } else {
                console.warn('Router: Content area not ready for financial page, retrying...');
                setTimeout(() => {
                  if (window.initFinancial) {
                    try { window.initFinancial(); } catch (e) { console.error('Error calling initFinancial (retry):', e); }
                  }
                }, 200);
              }
            }
            }, 150);
          });
        });
        
        return;
      }
      
      // Get the actual file path
      const filePath = getPageFilePath(normalizedPath);
      if (!filePath) {
        throw new Error('Invalid route path');
      }
      
      // Fetch page content from static file
      console.log('Loading page:', filePath);
      const response = await fetch(filePath);
      if (!response.ok) {
        console.error('Failed to fetch:', filePath, response.status, response.statusText);
        throw new Error(`Failed to load page: ${response.statusText} (${response.status})`);
      }
      
      const html = await response.text();
      if (!html || html.length < 100) {
        console.error('Received empty or invalid HTML');
        console.error('File path:', filePath);
        console.error('Response status:', response.status);
        throw new Error('Received empty or invalid page content');
      }
      
      console.log('Extracting content from:', filePath, 'HTML length:', html.length);
      const content = extractContent(html);
      console.log('Extracted content length:', content.html ? content.html.length : 0);
      console.log('Scripts found:', content.scripts);
      console.log('Modals found:', content.modals ? content.modals.length : 0);
      
      if (!content.html || content.html.trim().length === 0) {
        console.error('No content extracted from page');
        console.error('File path:', filePath);
        console.error('Page HTML length:', html.length);
        // Debug: try to find content-area in a sample
        const parser = new DOMParser();
        const testDoc = parser.parseFromString(html.substring(0, Math.min(20000, html.length)), 'text/html');
        const testContent = testDoc.querySelector('.content-area');
        console.error('Content-area in sample:', testContent ? 'Found' : 'Not found');
        if (testContent) {
          console.error('Content-area innerHTML length:', testContent.innerHTML.length);
        }
        throw new Error('No content found in page. Check browser console for details.');
      }
      
      // Cache it (use normalized path)
      pageCache.set(normalizedPath, content);
      
      // Inject inline styles FIRST to prevent FOUC
      if (content.styles.length > 0) {
        content.styles.forEach(style => {
          const styleEl = document.createElement('style');
          styleEl.textContent = style;
          document.head.appendChild(styleEl);
        });
      }
      
      // Update content area
      // Use a temporary container to sanitize any remaining script tags
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = content.html;
      // Remove any script tags that might have slipped through
      tempContainer.querySelectorAll('script').forEach(script => {
        script.remove();
      });
      contentArea.innerHTML = tempContainer.innerHTML;
      
      // Show content area now that styles are loaded
      contentArea.style.opacity = '1';
      contentArea.style.visibility = 'visible';
      contentArea.setAttribute('data-route-loaded', 'true');
      
      // Force a reflow to ensure DOM is updated before scripts run
      void contentArea.offsetHeight;
      
      // Inject modals into body (remove existing first, then add new)
      if (content.modals && content.modals.length > 0) {
        content.modals.forEach(modalHTML => {
          const temp = document.createElement('div');
          temp.innerHTML = modalHTML;
          const modal = temp.firstElementChild;
          if (modal) {
            // Remove any script tags from modals before injecting
            modal.querySelectorAll('script').forEach(script => {
              script.remove();
            });
            
            const id = modal.id;
            if (id) {
              // Remove existing from body if present
              const existing = document.getElementById(id);
              if (existing) existing.remove();
            }
            
            // Ensure modal is closed (remove active class and any display-related classes)
            modal.classList.remove('active', 'show', 'open', 'flex', 'block');
            
            // Remove any inline display styles that might force it to show
            if (modal.style.display) {
              modal.style.removeProperty('display');
            }
            
            // Explicitly set display to none to ensure it's hidden
            modal.style.display = 'none';
            
            // Append to body
            document.body.appendChild(modal);
          }
        });
      }
      
      // Immediately ensure all modals/drawers are closed (before scripts run)
      const allModals = document.querySelectorAll('.modal, .status-modal, .drawer, [id*="modal"], [id*="drawer"]');
      allModals.forEach(m => {
        m.classList.remove('active', 'show', 'open', 'flex', 'block');
        if (m.style.display && (m.style.display === 'flex' || m.style.display === 'block')) {
          m.style.removeProperty('display');
        }
        // Explicitly hide if not already hidden
        if (!m.style.display || m.style.display !== 'none') {
          m.style.display = 'none';
        }
      });
      
      updateTitle(content.title);
      updateActiveNav(normalizedPath);
      currentPage = normalizedPath;
      
      // Ensure all modals are closed after scripts load (in case scripts try to open them)
      setTimeout(() => {
        const allModalsAfter = document.querySelectorAll('.modal, .status-modal, .drawer, [id*="modal"], [id*="drawer"]');
        allModalsAfter.forEach(m => {
          m.classList.remove('active', 'show', 'open', 'flex', 'block');
          if (m.style.display && (m.style.display === 'flex' || m.style.display === 'block')) {
            m.style.removeProperty('display');
          }
          // Explicitly hide if not already hidden
          if (!m.style.display || m.style.display !== 'none') {
            m.style.display = 'none';
          }
        });
      }, 200);
      
      // Load scripts
      if (content.scripts.length > 0) {
        await loadScripts(content.scripts);
      }
      
      // Trigger initialization for dynamically loaded scripts
      // Use requestAnimationFrame to ensure browser has painted the content
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Dispatch a custom event that scripts can listen to (only once per page load)
          if (!contentArea.dataset.routerContentLoaded) {
            const event = new Event('routerContentLoaded', { bubbles: true });
            contentArea.dispatchEvent(event);
            contentArea.dataset.routerContentLoaded = 'true';
          }
          
          // DON'T dispatch DOMContentLoaded - it causes scripts to re-initialize
          // Scripts should use routerContentLoaded or run immediately if DOM is ready
          
          // Wait a bit more for scripts to expose their init functions and DOM to be fully ready
          setTimeout(() => {
            // Only call init function for the current page being loaded
            // Determine which page based on the normalized path
            const path = normalizedPath.toLowerCase();
            console.log('Router: Checking init functions for path:', path);
            
            // Document Permits page
            // Document permits page (both admin and user)
            if (path.includes('document-permit') && window.initDocumentPermits) {
              console.log('Calling initDocumentPermits');
              try {
                window.initDocumentPermits();
              } catch (e) {
                console.error('Error calling initDocumentPermits:', e);
              }
            }
            
            // Disaster page
            if (path.includes('disaster') && window.initDisaster) {
              console.log('Calling initDisaster');
              try {
                window.initDisaster();
              } catch (e) {
                console.error('Error calling initDisaster:', e);
              }
            }
            
            // Users page
            if (path.includes('user') && !path.includes('document') && window.initUsers) {
              console.log('Calling initUsers');
              try {
                window.initUsers();
              } catch (e) {
                console.error('Error calling initUsers:', e);
              }
            }
            
            // Health page (both admin and user)
            if (path.includes('health')) {
              if (path.includes('/admin/') && window.initHealth) {
                console.log('Calling initHealth (admin)');
                try {
                  window.initHealth();
                } catch (e) {
                  console.error('Error calling initHealth:', e);
                }
              } else if (path.includes('/user/') && window.initUserHealth) {
                console.log('Calling initUserHealth');
                try {
                  window.initUserHealth();
                } catch (e) {
                  console.error('Error calling initUserHealth:', e);
                }
              }
            }
            
            // Cases page (both admin and user)
            if (path.includes('case')) {
              if (path.includes('/admin/') && window.initCases) {
                console.log('Calling initCases (admin)');
                try {
                  window.initCases();
                } catch (e) {
                  console.error('Error calling initCases:', e);
                }
              } else if (path.includes('/user/') && window.initUserCases) {
                console.log('Calling initUserCases');
                try {
                  window.initUserCases();
                } catch (e) {
                  console.error('Error calling initUserCases:', e);
                }
              }
            }
            
            // Settings page
            if (path.includes('setting') && window.initSettings) {
              console.log('Calling initSettings');
              try {
                window.initSettings();
              } catch (e) {
                console.error('Error calling initSettings:', e);
              }
            }
            
            // Community page
            if (path.includes('community') && window.initCommunity) {
              console.log('Calling initCommunity');
              try {
                window.initCommunity();
              } catch (e) {
                console.error('Error calling initCommunity:', e);
              }
            }
            
            // Financial page
            if (path.includes('financial') && window.initFinancial) {
              console.log('Calling initFinancial');
              // Ensure content is injected before calling init
              const contentArea = document.querySelector('.content-area');
              if (contentArea && contentArea.innerHTML.trim()) {
                // Force reflow
                void contentArea.offsetHeight;
                try {
                  window.initFinancial();
                } catch (e) {
                  console.error('Error calling initFinancial:', e);
                }
              } else {
                console.warn('Router: Content area not ready for financial page, retrying...');
                setTimeout(() => {
                  if (window.initFinancial) {
                    try { 
                      window.initFinancial(); 
                    } catch (e) { 
                      console.error('Error calling initFinancial (retry):', e); 
                    }
                  }
                }, 200);
              }
            }
            
            // Residents page - check for both 'resident' and 'residents'
            // Check multiple variations to catch all cases
            const isResidentsPage = (path.includes('resident') || path.includes('residents')) && 
                                   (path.includes('/admin/') || path.startsWith('/admin'));
            
            if (isResidentsPage) {
              console.log('Router: Detected residents page, checking for initResidents function...');
              console.log('Router: window.initResidents exists?', typeof window.initResidents);
              console.log('Router: window.initResidents value:', window.initResidents);
              
              // Function to call initResidents
              const callInitResidents = () => {
                if (window.initResidents && typeof window.initResidents === 'function') {
                  console.log('Router: Calling initResidents');
                  try {
                    window.initResidents();
                  } catch (e) {
                    console.error('Router: Error calling initResidents:', e);
                  }
                } else {
                  console.warn('Router: initResidents function not found. Type:', typeof window.initResidents);
                  return false;
                }
                return true;
              };
              
              // Try immediately
              if (!callInitResidents()) {
                // Wait a bit more for the script to expose the function
                setTimeout(() => {
                  if (!callInitResidents()) {
                    // Retry after a longer delay
                    setTimeout(() => {
                      if (!callInitResidents()) {
                        console.error('Router: initResidents function still not found after retries. Available init functions:', Object.keys(window).filter(k => k.startsWith('init')));
                      }
                    }, 300);
                  }
                }, 150);
              }
            } else {
              console.log('Router: Not a residents page. Path:', path, 'isResidentsPage:', isResidentsPage);
            }
          }, 150);
        });
      });
      
      // Reset loading state BEFORE calling init functions (non-blocking)
      // This allows navigation to proceed even if init functions take time or hang
      isLoading = false;
      loadingPath = null;
      
      // Remove the inline hide style if it exists
      const hideStyle = document.getElementById('router-hide-style');
      if (hideStyle) {
        hideStyle.remove();
      }
      
      // Show body after content and styles are loaded (but before scripts finish)
      // This prevents FOUC while allowing scripts to initialize
      document.body.classList.add('router-ready');
      
      // Ensure modals are still closed after scripts load
      setTimeout(() => {
        const allModals = document.querySelectorAll('.modal, .status-modal, .drawer');
        allModals.forEach(m => {
          if (m.classList.contains('active') || m.classList.contains('show') || m.classList.contains('open')) {
            m.classList.remove('active', 'show', 'open', 'flex', 'block');
            if (m.style.display && (m.style.display === 'flex' || m.style.display === 'block')) {
              m.style.removeProperty('display');
            }
          }
        });
      }, 200);
      
      // Trigger page-specific initialization if function exists
      if (window.onPageLoad) {
        window.onPageLoad();
      }
      
    } catch (error) {
      isLoading = false;
      loadingPath = null;
      console.error('Error loading page:', error);
      console.error('Path:', normalizedPath);
      console.error('File path:', filePath);
      contentArea.innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <h2>Error loading page</h2>
          <p style="color: #dc2626; margin: 10px 0;">${error.message}</p>
          <p style="color: #6b7280; font-size: 14px; margin: 10px 0;">Path: ${normalizedPath}</p>
          <p style="color: #6b7280; font-size: 14px; margin: 10px 0;">File: ${filePath || 'N/A'}</p>
          <button onclick="window.router.reload()" class="btn btn-primary" style="margin-top: 20px; padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 8px; cursor: pointer;">Retry</button>
          <button onclick="location.reload()" class="btn" style="margin-top: 10px; padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; cursor: pointer; margin-left: 10px;">Reload Page</button>
        </div>
      `;
      // Show body even on error so user can see the error message
      contentArea.style.opacity = '1';
      contentArea.style.visibility = 'visible';
      document.body.classList.add('router-ready');
    }
  }
  
  // Handle navigation
  function handleNavigation(e) {
    // Don't handle navigation if a page is currently loading
    if (isLoading) {
      return;
    }
    
    const link = e.target.closest('a');
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!href) return;
    
    // Skip external links, anchors, and special links
    if (href.startsWith('http') || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return;
    }
    
    // Skip logout and special actions
    if (href === '#' && link.onclick) {
      return;
    }
    
    // Skip if it's the same page
    if (href === window.location.pathname) {
      return;
    }
    
    // Check if it's a user/admin route
    const isUserRoute = href.startsWith('/user/');
    const isAdminRoute = href.startsWith('/admin/');
    
    if ((isUser && isUserRoute) || (isAdmin && isAdminRoute)) {
      e.preventDefault();
      e.stopPropagation();
      
      // Update URL without reload
      window.history.pushState({ path: href }, '', href);
      loadPage(href);
    }
  }
  
  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    if (isLoading) {
      console.log('Skipping popstate - page is loading');
      return;
    }
    
    const path = window.location.pathname;
    if ((isUser && path.startsWith('/user/')) || (isAdmin && path.startsWith('/admin/'))) {
      // Only load if it's different from current page
      if (path !== currentPage) {
        loadPage(path);
      }
    }
  });
  
  // Intercept all link clicks (use capture phase to catch early, but check carefully)
  document.addEventListener('click', handleNavigation, true);
  
    // Load initial page
    const initialPath = window.location.pathname;
    console.log('Router initialized for path:', initialPath);
    
    // Update navigation visibility based on roles
    if (isAdmin) {
      fetchUserInfo().then(() => {
        updateNavigationVisibility();
      });
    }
    
    if ((isUser && initialPath.startsWith('/user/')) || (isAdmin && initialPath.startsWith('/admin/'))) {
      // Always set currentPage to the initial path to prevent navigation away
      currentPage = initialPath;
      updateActiveNav(initialPath);
      
      // If it's the dashboard route, don't reload - use existing content
      if (initialPath === basePath + '/dashboard') {
        console.log('Dashboard route - using existing content');
        // Remove the inline hide style if it exists
        const hideStyle = document.getElementById('router-hide-style');
        if (hideStyle) {
          hideStyle.remove();
        }
        // Ensure content area is visible for dashboard
        contentArea.style.opacity = '1';
        contentArea.style.visibility = 'visible';
        contentArea.setAttribute('data-route-loaded', 'true');
        // Show body for dashboard route
        document.body.classList.add('router-ready');
      } else {
        // Load the page content - always load on refresh to ensure fresh content
        console.log('Loading page content for:', initialPath);
        // Load immediately without delay to prevent dashboard flash
        loadPage(initialPath);
      }
    } else {
      console.warn('Path does not match user/admin pattern:', initialPath);
    }
    
    // Export for manual navigation
    window.router = {
      navigate: loadPage,
      currentPage: () => currentPage,
      reload: () => {
        if (currentPage) {
          pageCache.delete(currentPage);
          loadPage(currentPage);
        }
      }
    };
  }
  
  // Add spinner animation
  if (!document.querySelector('#router-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'router-spinner-style';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter);
  } else {
    initRouter();
  }
})();

