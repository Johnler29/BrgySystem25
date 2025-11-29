// public/login.js
(function () {
  const loginForm = document.getElementById('loginForm');
  const loginBtn  = document.getElementById('loginBtn');
  const errorBox  = document.getElementById('errorBox');
  const okBox     = document.getElementById('okBox');
  const remember  = document.getElementById('remember');
  const usernameI = document.getElementById('username');
  const passwordI = document.getElementById('password');

  const forgotLink   = document.getElementById('forgotLink');
  const forgotModal  = document.getElementById('forgotModal');
  const closeForgot  = document.getElementById('closeForgot');
  const cancelForgot = document.getElementById('cancelForgot');
  const forgotForm   = document.getElementById('forgotForm');
  const fpInput      = document.getElementById('fpInput');
  const forgotBtn    = document.getElementById('forgotBtn');

  const LS_KEY_REMEMBER = 'brgy_langkaan_remember';
  const LS_KEY_USER     = 'brgy_langkaan_username';

  function show(el, msg) {
    if (!el) return;
    if (msg !== undefined) el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('block');
  }
  function hide(el) {
    if (!el) return;
    el.classList.remove('block');
    el.classList.add('hidden');
  }

  // Prefill if "Remember me" was used
  (function initRemember() {
    const remembered = localStorage.getItem(LS_KEY_REMEMBER) === '1';
    const savedUser  = localStorage.getItem(LS_KEY_USER) || '';
    remember.checked = remembered;
    if (remembered && savedUser) {
      usernameI.value = savedUser;
      passwordI.focus();
    }
  })();

  // If user is already logged in, jump to appropriate dashboard
  (async function maybeJump() {
    try {
      const res = await fetch('/api/me', { credentials: 'include', headers: { 'Accept': 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (data && data.user) {
        const user = data.user;
        const isAdmin = /^(admin)$/i.test(user.role||'') || user.isAdmin===true || user.type==='admin' || user.accountType==='admin';
        window.location.href = isAdmin ? '/admin/dashboard' : '/user/dashboard';
      }
    } catch(_) {}
  })();

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(errorBox); hide(okBox);

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in…';

    const payload = {
      username: usernameI.value.trim(),
      password: passwordI.value,
      remember: remember.checked
    };

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        show(errorBox, (data && data.message) ? data.message : 'Invalid credentials');
        return;
      }

      // Save remember preference (never store password)
      if (remember.checked) {
        localStorage.setItem(LS_KEY_REMEMBER, '1');
        localStorage.setItem(LS_KEY_USER, payload.username);
      } else {
        localStorage.removeItem(LS_KEY_REMEMBER);
        localStorage.removeItem(LS_KEY_USER);
      }

      // Redirect based on role
      const user = data.user;
      const isAdmin = /^(admin)$/i.test(user?.role||'') || user?.isAdmin===true || user?.type==='admin' || user?.accountType==='admin';
      window.location.href = isAdmin ? '/admin/dashboard' : '/user/dashboard';
    } catch (err) {
      show(errorBox, 'Network error. Please try again.');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Log In';
    }
  });

  // ----- Forgot Password modal -----
  function openForgot()  { 
    forgotModal.classList.remove('hidden'); 
    forgotModal.classList.add('flex'); 
    fpInput.focus(); 
  }
  function closeForgotM(){ 
    forgotModal.classList.remove('flex'); 
    forgotModal.classList.add('hidden'); 
    forgotForm.reset(); 
  }

  forgotLink.addEventListener('click', (e) => { e.preventDefault(); openForgot(); });
  closeForgot.addEventListener('click', closeForgotM);
  cancelForgot.addEventListener('click', closeForgotM);
  forgotModal.addEventListener('click', (e) => { if (e.target === forgotModal) closeForgotM(); });

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(errorBox); hide(okBox);
    forgotBtn.disabled = true; forgotBtn.textContent = 'Sending…';

    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: fpInput.value.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Error sending reset link');
      show(okBox, data.message || 'If the account exists, a reset link was sent.');
      closeForgotM();
    } catch (err) {
      show(errorBox, err.message || 'Error sending reset link');
    } finally {
      forgotBtn.disabled = false; forgotBtn.textContent = 'Send Reset Link';
    }
  });
})();