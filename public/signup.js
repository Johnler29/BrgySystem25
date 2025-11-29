// public/signup.js
(function () {
  const f = document.getElementById('signupForm');
  const btn = document.getElementById('signupBtn');
  const ok = document.getElementById('ok');
  const err = document.getElementById('err');

  function show(el, msg){ el.textContent = msg; el.style.display = 'block'; }
  function hide(el){ el.style.display = 'none'; }

  // Validators
  const emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usernameRE = /^[a-zA-Z0-9._-]{3,20}$/;
  const strongPwRE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/; // Uppercase + digit + symbol + len>=8
  const nameOptionalRE = /^[A-Za-z.\-'\s]{1,50}$/; // for middle name (if provided)

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(ok); hide(err);

    const fd = new FormData(f);
    const body = Object.fromEntries(fd.entries());

    const problems = [];

    if (!body.firstName?.trim()) problems.push('First name is required.');
    if (!body.lastName?.trim())  problems.push('Last name is required.');

    // Middle name: optional but must be valid if given
    if (body.middleName && body.middleName.trim() && !nameOptionalRE.test(body.middleName.trim())) {
      problems.push('Middle name may contain letters, spaces, hyphens, apostrophes, and periods only.');
    }

    if (!body.username?.trim()) {
      problems.push('Username is required.');
    } else if (!usernameRE.test(body.username.trim())) {
      problems.push('Username must be 3–20 chars (letters, numbers, . _ - only).');
    }

    if (!body.email?.trim() || !emailRE.test(body.email.trim())) {
      problems.push('Please enter a valid email address.');
    }

    if (!body.password) {
      problems.push('Password is required.');
    } else if (!strongPwRE.test(body.password)) {
      problems.push('Password must be at least 8 characters with an uppercase letter, a number, and a symbol.');
    }

    if (!body.address?.trim()) problems.push('Address is required.');
    if (!document.getElementById('terms').checked) problems.push('Please agree to the Terms & Conditions.');

    if (problems.length) {
      show(err, problems.join('\n'));
      return;
    }

    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept':'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: body.firstName.trim(),
          middleName: body.middleName?.trim() || '',
          lastName: body.lastName.trim(),
          username: body.username.trim(),
          email: body.email.trim(),
          password: body.password,
          address: body.address.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to create account');

      // Success: go to "under verification" page/message
      window.location.href = '/signup-success';
    } catch (e) {
      show(err, e.message || 'Network error. Please try again.');
    } finally {
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  });
})();