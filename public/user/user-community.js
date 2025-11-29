// public/user-community.js - User-specific version (no create/delete posts)
(function () {
  const $ = (id) => document.getElementById(id);

  const feed = $('feed'), loadMoreBtn = $('loadMore');
  const search = $('search'), filterCategory = $('filterCategory');
  const calLabel = $('calLabel'), calendar = $('calendar'), prevMonth = $('prevMonth'), nextMonth = $('nextMonth'), clearDate = $('clearDate');
  const eventList = $('eventList');
  const toast = $('toast');

  let me = null;
  let nextCursor = '';
  let selectedDate = '';
  let curYear, curMonth;

  const show = (n) => n.style.display = '';
  const hide = (n) => n.style.display = 'none';
  const toastMsg = (m) => { toast.textContent = m; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), 1500); };

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok || data.ok === false) throw new Error(data.message || 'Request failed');
    return data;
  }

  function avatarLetter(name='U'){ return (name||'U').trim()[0]?.toUpperCase() || 'U'; }

  function renderPost(p) {
    const liked = (p.likes||[]).includes(me?.username);
    const likes = (p.likes||[]).length;
    const comments = p.comments || [];
    const isEvent = p.type === 'event';

    const card = document.createElement('div');
    card.className = 'card post';
    card.dataset.id = p._id;

    card.innerHTML = `
      <div class="post-header">
        <div class="avatar">${avatarLetter(p.author?.name)}</div>
        <div style="flex:1">
          <div style="font-weight:600">${p.author?.name || 'Admin'} ${p.pinned? '📌':''}</div>
          <div class="post-meta">${new Date(p.createdAt).toLocaleString()} • 
            <span class="pill ${isEvent?'event':'category'}">${isEvent ? 'Event' : (p.category || 'Announcement')}</span>
          </div>
        </div>
      </div>
      <div class="post-title">${p.title||''}</div>
      ${p.body ? `<div class="post-body">${p.body}</div>` : ''}
      ${p.imageUrl ? `<img class="post-image" src="${p.imageUrl}" alt="">` : ''}
      ${isEvent && p.event ? `<div class="post-meta">📅 ${p.event.startDate ? new Date(p.event.startDate).toLocaleDateString() : ''} – ${p.event.endDate ? new Date(p.event.endDate).toLocaleDateString() : ''} • 📍 ${p.event.location||''}</div>`:''}

      <div class="actions">
        <button class="btn like">${liked?'💙 Liked':'👍 Like'} (${likes})</button>
        <button class="btn comment-btn">💬 Comment (${comments.length})</button>
        <button class="btn btn-light" disabled>↗ Share</button>
      </div>

      <div class="comments">
        ${comments.map(c => `
          <div class="comment">
            <div class="avatar">${avatarLetter(c.author?.name)}</div>
            <div class="bubble">
              <div style="font-weight:600">${c.author?.name || 'User'}</div>
              <div>${c.text}</div>
              <div style="font-size:12px;color:#888">${new Date(c.createdAt).toLocaleString()}</div>
            </div>
          </div>
        `).join('')}
        <div class="add-comment">
          <input class="new-comment" placeholder="Write a comment…">
          <button class="btn btn-light send">Post</button>
        </div>
      </div>
    `;

    card.querySelector('.like').onclick = async () => {
      try {
        const { item } = await fetchJSON(`/api/community/like/${p._id}`, { method:'POST', headers:{'Content-Type':'application/json'} });
        card.replaceWith(renderPost(item));
      } catch (e) { toastMsg(e.message); }
    };

    const send = card.querySelector('.send');
    const input = card.querySelector('.new-comment');
    send.onclick = async () => {
      const text = input.value.trim(); if(!text) return;
      try {
        const { item } = await fetchJSON(`/api/community/comment/${p._id}`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text })
        });
        card.replaceWith(renderPost(item));
        toastMsg('Comment added');
      } catch (e) { toastMsg(e.message); }
    };

    return card;
  }

  async function loadPosts(reset=false) {
    if (reset) { feed.innerHTML = ''; nextCursor = ''; }
    try {
      const qs = new URLSearchParams({
        q: search.value,
        category: filterCategory.value,
        cursor: nextCursor,
        limit: '10'
      }).toString();
      const { items, nextCursor: nc } = await fetchJSON(`/api/community/posts?${qs}`);
      items.forEach(p => feed.appendChild(renderPost(p)));
      nextCursor = nc || '';
      loadMoreBtn.style.display = nc ? '' : 'none';
    } catch (e) {
      console.error('Load posts error:', e);
    }
  }

  function drawCalendar(year, month) {
    curYear = year; curMonth = month;
    calLabel.textContent = new Date(year, month).toLocaleString('default', { month:'long', year:'numeric' });
    calendar.innerHTML = '';
    ['M','T','W','T','F','S','S'].forEach(d => {
      const el = document.createElement('div'); el.className='muted'; el.textContent=d; calendar.appendChild(el);
    });
    const first = new Date(year, month, 1);
    const last = new Date(year, month+1, 0);
    const pad = (first.getDay()+6)%7;
    for(let i=0; i<pad; i++) calendar.appendChild(document.createElement('div'));
    for(let day=1; day<=last.getDate(); day++) {
      const cell = document.createElement('div');
      cell.className = 'day';
      cell.textContent = day;
      if (day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear()) {
        cell.classList.add('today');
      }
      cell.onclick = () => {
        selectedDate = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        loadPosts(true);
      };
      calendar.appendChild(cell);
    }
  }

  async function loadEvents() {
    try {
      const { items } = await fetchJSON('/api/community/events');
      eventList.innerHTML = '';
      (items||[]).slice(0,5).forEach(ev => {
        const div = document.createElement('div');
        div.className = 'event-row';
        const start = new Date(ev.event?.startDate || ev.createdAt);
        div.innerHTML = `
          <div class="datepill">
            <div class="d">${start.getDate()}</div>
            <div class="m">${start.toLocaleString('default',{month:'short'})}</div>
          </div>
          <div>
            <div style="font-weight:600">${ev.title}</div>
            <div style="font-size:12px;color:#888">${ev.event?.location || ''}</div>
          </div>
        `;
        eventList.appendChild(div);
      });
    } catch {}
  }

  async function init(){
    try {
      const res = await fetchJSON('/api/me');
      me = res.user || null;
      if (me) {
        $('username').textContent = me.name || 'User';
        $('avatar').textContent = avatarLetter(me.name);
      }
      
      const isAdmin = /^(admin)$/i.test(me?.role||'') || me?.isAdmin===true || me?.type==='admin' || me?.accountType==='admin';
      if (isAdmin) {
        location.href='/admin/community';
        return;
      }
    } catch {}

    search.oninput = () => loadPosts(true);
    filterCategory.onchange = () => loadPosts(true);
    loadMoreBtn.onclick = () => loadPosts(false);
    clearDate.onclick = async () => { selectedDate=''; await loadPosts(true); await drawCalendar(curYear,curMonth); };

    const now = new Date();
    drawCalendar(now.getFullYear(), now.getMonth());
    prevMonth.onclick = () => {
      const d = new Date(curYear, curMonth-1);
      drawCalendar(d.getFullYear(), d.getMonth());
    };
    nextMonth.onclick = () => {
      const d = new Date(curYear, curMonth+1);
      drawCalendar(d.getFullYear(), d.getMonth());
    };

    document.querySelectorAll('.catchips .chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('.catchips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterCategory.value = chip.getAttribute('data-cat') || '';
        loadPosts(true);
      };
    });

    loadPosts(true);
    loadEvents();
  }

  init();
})();

