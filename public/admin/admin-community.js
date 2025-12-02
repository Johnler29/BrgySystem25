// public/community.js
(function () {
  const $ = (id) => document.getElementById(id);

  // feed
  const feed = $('feed'), loadMoreBtn = $('loadMore');
  // modal controls
  const modal = $('modal'), closeModal = $('closeModal'), cancel = $('cancel'), publish = $('publish');
  const btnCreate = $('btnCreate'), composer = $('composer'), openModalBtn = $('openModal');
  const type = $('type'), category = $('category'), title = $('title'), body = $('body');
  const file = $('file'), imageUrl = $('imageUrl');
  const tabUpload = $('tabUpload'), tabUrl = $('tabUrl'), uploadBox = $('uploadBox'), urlBox = $('urlBox'), eventFields = $('eventFields');
  // filters/search
  const search = $('search'), filterCategory = $('filterCategory');
  // widgets
  const calLabel = $('calLabel'), calendar = $('calendar'), prevMonth = $('prevMonth'), nextMonth = $('nextMonth'), clearDate = $('clearDate');
  const eventList = $('eventList'), adminBox = $('adminBox'), addEventShortcut = $('addEventShortcut');
  const quickPost = $('quickPost'), quickEvent = $('quickEvent');
  const toast = $('toast');

  let me = null;
  let nextCursor = '';
  let selectedDate = ''; // YYYY-MM-DD
  let curYear, curMonth; // calendar view

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

  // ---- FEED RENDER ----
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
        ${me?.role==='admin' ? `<div style="display:flex;gap:6px">
            <button class="btn btn-light pin">${p.pinned?'Unpin':'Pin'}</button>
            <button class="btn btn-light delete">Delete</button>
        </div>`:''}
      </div>
      <div class="post-title">${p.title||''}</div>
      ${p.body ? `<div class="post-body">${p.body}</div>` : ''}
      ${p.imageUrl ? `<img class="post-image" src="${p.imageUrl}" alt="">` : ''}
      ${isEvent && p.event ? `<div class="post-meta"><i class="fas fa-calendar-alt"></i> ${p.event.startDate ? new Date(p.event.startDate).toLocaleDateString() : ''} – ${p.event.endDate ? new Date(p.event.endDate).toLocaleDateString() : ''} • <i class="fas fa-map-marker-alt"></i> ${p.event.location||''}</div>`:''}

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

    // actions
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

    const del = card.querySelector('.delete');
    if (del) del.onclick = async () => {
      if (!confirm('Delete this post?')) return;
      try {
        await fetchJSON(`/api/community/posts/${p._id}`, { method:'DELETE' });
        card.remove();
        toastMsg('Post deleted');
      } catch (e) { toastMsg(e.message); }
    };

    const pin = card.querySelector('.pin');
    if (pin) pin.onclick = async () => {
      try {
        const { item } = await fetchJSON(`/api/community/pin/${p._id}`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pinned: !p.pinned })
        });
        toastMsg(item.pinned ? 'Pinned' : 'Unpinned');
        // reload feed to maintain sort (pinned first)
        await loadPosts(true);
      } catch (e) { toastMsg(e.message); }
    };

    return card;
  }

  async function loadPosts(reset=false) {
    const q = search.value.trim();
    const cat = filterCategory.value;
    const url = new URL('/api/community/posts', location.origin);
    if (q) url.searchParams.set('q', q);
    if (cat) url.searchParams.set('category', cat);
    if (selectedDate) url.searchParams.set('on', selectedDate);
    if (!reset && nextCursor) url.searchParams.set('cursor', nextCursor);
    url.searchParams.set('limit', '6');

    try {
      const { items, nextCursor: nc } = await fetchJSON(url.toString());
      if (reset) feed.innerHTML = '';
      items.forEach(p => feed.appendChild(renderPost(p)));
      nextCursor = nc || '';
      loadMoreBtn.style.display = nextCursor ? '' : 'none';
    } catch (e) {
      toastMsg(e.message || 'Failed to load feed');
    }
  }

  // ---- MODAL ----
  function resetForm(){
    type.value = 'post'; category.value = 'Announcement';
    title.value = ''; body.value = ''; file.value = ''; imageUrl.value = '';
    eventFields.style.display = 'none';
    uploadBox.style.display = ''; urlBox.style.display = 'none';
    tabUpload.classList.add('active'); tabUrl.classList.remove('active');
  }
  const openModal = () => { resetForm(); modal.style.display='flex'; };
  const closeModalFn = () => { modal.style.display='none'; };

  type.onchange = () => { eventFields.style.display = type.value === 'event' ? '' : 'none'; };
  tabUpload.onclick = () => { tabUpload.classList.add('active'); tabUrl.classList.remove('active'); uploadBox.style.display=''; urlBox.style.display='none'; };
  tabUrl.onclick = () => { tabUrl.classList.add('active'); tabUpload.classList.remove('active'); urlBox.style.display=''; uploadBox.style.display='none'; };

  publish.onclick = async () => {
    try {
      publish.disabled = true; publish.textContent = 'Posting…';
      const fd = new FormData();
      fd.append('type', type.value); fd.append('category', category.value);
      fd.append('title', title.value); fd.append('body', body.value);
      if (type.value === 'event') {
        fd.append('startDate', $('startDate').value);
        fd.append('endDate', $('endDate').value);
        fd.append('location', $('location').value);
      }
      if (file.files[0]) fd.append('file', file.files[0]);
      if (imageUrl.value.trim()) fd.append('imageUrl', imageUrl.value.trim());

      const { item } = await fetchJSON('/api/community/posts', { method:'POST', body: fd });
      closeModalFn();
      feed.prepend(renderPost(item));
      toastMsg('Posted successfully');
      // refresh widgets if event
      if (item.type === 'event') { await refreshWidgets(); }
    } catch (e) {
      toastMsg(e.message || 'Failed to post');
    } finally {
      publish.disabled = false; publish.textContent = 'Post';
    }
  };

  // ---- WIDGETS ----
  function monthLabel(y, m){
    return new Date(y, m, 1).toLocaleString(undefined, { month:'long', year:'numeric' });
  }
  function fmtDateISO(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }

  async function drawCalendar(y, m){
    curYear=y; curMonth=m;
    calLabel.textContent = monthLabel(y,m);
    calendar.innerHTML = '';

    // build days
    const first = new Date(y, m, 1);
    const last = new Date(y, m+1, 0);
    const startPad = (first.getDay()+6)%7; // Monday-first
    const total = startPad + last.getDate();
    const weeks = Math.ceil(total/7)*7;

    // get events for this month
    let dots = new Set();
    try {
      const { items } = await fetchJSON(`/api/community/calendar?year=${y}&month=${m}`);
      items.forEach(ev => {
        const s = new Date(ev.event?.startDate || ev.createdAt);
        const e = new Date(ev.event?.endDate || ev.event?.startDate || ev.createdAt);
        // clamp to this month
        const start = new Date(Math.max(new Date(y,m,1), s));
        const end   = new Date(Math.min(new Date(y,m+1,0,23,59,59,999), e));
        for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
          dots.add(fmtDateISO(d));
        }
      });
    } catch {}

    // headers Mon..Sun
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(h=>{
      const div=document.createElement('div'); div.textContent=h; div.style.textAlign='center'; div.style.fontWeight='600'; div.style.color='#7f8c8d';
      calendar.appendChild(div);
    });

    for(let i=0;i<startPad;i++){
      const div=document.createElement('div'); div.className='day muted'; calendar.appendChild(div);
    }
    const todayIso = fmtDateISO(new Date());
    for (let d=1; d<=last.getDate(); d++){
      const date = new Date(y,m,d);
      const iso = fmtDateISO(date);
      const div=document.createElement('div');
      div.className='day'; div.textContent=d;
      if (iso===todayIso) div.classList.add('today');
      if (dots.has(iso)) div.classList.add('has');
      if (selectedDate===iso) { div.style.outline='2px solid #1877f2'; div.style.outlineOffset='-2px'; }
      div.onclick = async ()=>{
        selectedDate = iso;
        await loadPosts(true);
        await drawCalendar(curYear, curMonth);
      };
      calendar.appendChild(div);
    }
  }

  async function loadUpcoming(){
    try {
      const { items } = await fetchJSON('/api/community/events?limit=6');
      eventList.innerHTML = '';
      items.forEach(ev => {
        const s = new Date(ev.event?.startDate || ev.createdAt);
        const m = s.toLocaleString(undefined, { month:'short' });
        const d = String(s.getDate()).padStart(2,'0');
        const row = document.createElement('div');
        row.className='event-row';
        row.innerHTML = `
          <div class="datepill"><div class="d">${d}</div><div class="m">${m}</div></div>
          <div style="flex:1">
            <div style="font-weight:600">${ev.title}</div>
            <div style="font-size:12px;color:#666">📍 ${ev.event?.location || '—'}</div>
          </div>
          <button class="btn btn-light view">View</button>
        `;
        row.querySelector('.view').onclick = async ()=>{
          selectedDate = fmtDateISO(s);
          await loadPosts(true);
          await drawCalendar(curYear,curMonth);
          window.scrollTo({top:0,behavior:'smooth'});
        };
        eventList.appendChild(row);
      });
    } catch (e) {
      eventList.innerHTML = `<div style="color:#888">No upcoming events</div>`;
    }
  }

  async function refreshWidgets(){
    await drawCalendar(curYear, curMonth);
    await loadUpcoming();
  }

  // ---- INIT ----
  async function init(){
    // who am I
    try {
      const res = await fetchJSON('/api/me');
      me = res.user || null;
      if (me) {
        $('username').textContent = me.name || 'User';
        $('avatar').textContent = avatarLetter(me.name);
        $('avatar2').textContent = avatarLetter(me.name);
      }
      if (me?.role === 'admin') {
        show(btnCreate); show(composer); show(adminBox); show(addEventShortcut);
      }
    } catch {}

    // wire UI
    btnCreate.onclick = () => openModal();
    if (openModalBtn) openModalBtn.onclick = () => openModal();
    closeModal.onclick = closeModalFn; cancel.onclick = closeModalFn;
    search.oninput = () => loadPosts(true);
    filterCategory.onchange = () => loadPosts(true);
    loadMoreBtn.onclick = () => loadPosts(false);
    clearDate.onclick = async () => { selectedDate=''; await loadPosts(true); await drawCalendar(curYear,curMonth); };

    addEventShortcut.onclick = () => { openModal(); type.value='event'; eventFields.style.display=''; };
    quickPost.onclick = () => openModal();
    quickEvent.onclick = () => { openModal(); type.value='event'; eventFields.style.display=''; };

    // category chips
    document.querySelectorAll('.chip').forEach(ch => {
      ch.onclick = async () => {
        document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
        ch.classList.add('active');
        filterCategory.value = ch.dataset.cat || '';
        await loadPosts(true);
      };
    });

    // calendar nav
    const now = new Date(); curYear = now.getFullYear(); curMonth = now.getMonth();
    prevMonth.onclick = async () => { curMonth--; if (curMonth<0){curMonth=11; curYear--;} await drawCalendar(curYear,curMonth); };
    nextMonth.onclick = async () => { curMonth++; if (curMonth>11){curMonth=0; curYear++;} await drawCalendar(curYear,curMonth); };

    await drawCalendar(curYear, curMonth);
    await loadUpcoming();
    await loadPosts(true);
  }

  // Expose init function for router
  window.initCommunity = init;

  // Auto-initialize for direct page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // For SPA navigation, router will call initCommunity
    // But also call it here if DOM is already ready (direct page load)
    setTimeout(init, 50);
  }
})();
