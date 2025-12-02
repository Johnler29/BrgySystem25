// /public/base.js
(function() {
  'use strict';
  
  // Only declare $ if it doesn't already exist (prevents redeclaration errors in SPA)
  if (typeof window.$ === 'undefined') {
    window.$ = (id) => document.getElementById(id);
  }
  
  // ---------- helpers ----------
  const $ = window.$;
const on = (el, evt, fn, opt) => el && el.addEventListener(evt, fn, opt);
const qs  = (sel, root=document) => root.querySelector(sel);

// Resolve elements by id -> data-attr -> fallback selector
function pick({ id, data, sel }) {
  return $(id) || qs(`[${data}]`) || qs(sel);
}

// ---------- toast (global) ----------
let __toastStack;
function toast(msg, type = 'info', ms = 2800) {
  if (!__toastStack) {
    __toastStack = document.createElement('div');
    __toastStack.className = 'toast-stack';
    document.body.appendChild(__toastStack);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  __toastStack.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'fadeOut .25s ease both';
    t.addEventListener('animationend', () => t.remove());
  }, ms);
}
window.toast = toast;

// ---------- ripple ----------
function enableRipple(selector) {
  document.querySelectorAll(selector).forEach((el) => {
    if (el._rippleBound) return;
    el._rippleBound = true;
    el.classList.add('ripple-host');
    el.addEventListener('click', (e) => {
      const host = e.currentTarget;
      const dot = document.createElement('span');
      dot.className = 'ripple-dot';
      const rect = host.getBoundingClientRect();
      const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left;
      const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top;
      dot.style.left = x + 'px';
      dot.style.top  = y + 'px';
      host.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove());
    });
  });
}

// ---------- sidebar ----------
function initSidebar(){
  const sidebar   = pick({ id:'sidebar',   data:'data-sidebar',   sel:'.sidebar' });
  const hamburger = pick({ id:'hamburgerBtn', data:'data-hamburger', sel:'.hamburger' });
  if (!sidebar || !hamburger) return;

  const saved = localStorage.getItem('sidebar-collapsed');
  if (saved === '1') sidebar.classList.add('collapsed');

  on(hamburger, 'click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
  });
}

// ---------- header menus (notif + user) ----------
function initHeaderMenus(){
  // tiles
  const userChip   = pick({ id:'userChip',   data:'data-user-chip',   sel:'.user-info' });
  const notifBtn   = pick({ id:'notifBtn',   data:'data-notif-btn',   sel:'.notif-btn, [aria-label="Notifications"]' });

  // menus (dropdowns/panels)
  const userMenu   = pick({ id:'userMenu',   data:'data-user-menu',   sel:'.dropdown' });
  const notifPanel = pick({ id:'notifPanel', data:'data-notif-panel', sel:'.notif-panel' });

  // If either tile exists but its menu is missing, don't crash; just return.
  // Clicks will do nothing (safe), but the page still works.
  const closeAll = () => {
    userMenu   && userMenu.classList.remove('open');
    notifPanel && notifPanel.classList.remove('open');
  };
  const toggle = (el) => el && el.classList.toggle('open');

  // Ensure tiles are clickable and float above
  [userChip, notifBtn].forEach(el => {
    if (!el) return;
    el.style.cursor = 'pointer';
    el.style.position = el.style.position || 'relative';
  });

  // add ping dot to bell if present
  if (notifBtn && !notifBtn.querySelector('.ping')) {
    const dot = document.createElement('span');
    dot.className = 'ping';
    notifBtn.appendChild(dot);
  }

  // Keep interaction inside menus from closing them
  on(userMenu,   'click', (e) => e.stopPropagation());
  on(notifPanel, 'click', (e) => e.stopPropagation());

  // Toggle handlers (separate tiles)
  on(userChip, 'click', (e) => {
    e.stopPropagation();
    if (notifPanel) notifPanel.classList.remove('open');
    toggle(userMenu);
  });

  on(notifBtn, 'click', (e) => {
    e.stopPropagation();
    if (userMenu) userMenu.classList.remove('open');
    toggle(notifPanel);
  });

  // Keyboard accessibility: Enter/Space toggles
  [userChip, notifBtn].forEach(el => {
    if (!el || el._kb) return;
    el._kb = true;
    el.tabIndex = el.tabIndex || 0;
    on(el, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });

  // Close when clicking outside or pressing Esc
  on(document, 'click', () => closeAll());
  on(document, 'keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}

  // ---------- global init ----------
  document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    initHeaderMenus();

    // shared ripple across pages (leave userChip itself out to avoid clipping)
    enableRipple('.btn, .filter-chip, .kebab, .sidebar-menu a, .hamburger, #notifBtn, [data-notif-btn], .user-info .btn');

    // Tiny feedback on bell (dblclick demo)
    const nb = $('notifBtn') || qs('[data-notif-btn]');
    if (nb && !nb._feedback) {
      nb._feedback = true;
      nb.addEventListener('dblclick', () => toast('No new notifications', 'info', 1600));
    }
  });
})();
