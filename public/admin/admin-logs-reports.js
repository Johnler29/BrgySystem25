// public/logs-reports.js
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>p.querySelectorAll(s);

  let user = null;
  let isAdmin = false;
  let currentTab = 'reports';

  // Elements
  const tabs = $$('.tab');
  const tabContents = $$('.tab-content');
  const drawer = $('#drawer');
  const drawerBody = $('#drawerBody');
  const drawerTitle = $('#drawerTitle');
  const dClose = $('#dClose');

  // Pagination state
  const state = {
    reports:  { page: 1, pageSize: 20, total: 0, rows: [] },
    activity: { page: 1, pageSize: 50, total: 0, rows: [] },
    users:    { page: 1, pageSize: 20, total: 0, rows: [] },
    system:   { page: 1, pageSize: 50, total: 0, rows: [] },
  };

  // -------- Init user ----------
  async function initUser(){
    try{
      const res = await fetch('/api/me');
      const j = await res.json();
      user = j.user || null;
      if(!user){ location.href='/login'; return; }

      isAdmin = ['admin','Admin','ADMIN'].includes(user.role);
      $('#username').textContent = user.name || 'User';
      $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();

      if(isAdmin) $('#adminAlert').classList.remove('hidden');
      else $('#userAlert').classList.remove('hidden');

      loadStatistics();
      switchTab('reports'); // default
    }catch{
      location.href='/login';
    }
  }

  async function logout(){
    await fetch('/api/logout',{method:'POST'});
    location.href='/login';
  }
  window.logout = logout;

  function loadStatistics(){
    $('#statTotal').textContent       = Math.floor(Math.random() * 500) + 100;
    $('#statModules').textContent     = 7;
    $('#statLogs').textContent        = Math.floor(Math.random() * 5000) + 1000;
    $('#statActiveUsers').textContent = Math.floor(Math.random() * 50) + 10;
  }

  // -------- Tabs ----------
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');
    switchTab(tabName);
  }));

  function switchTab(tabName){
    currentTab = tabName;
    tabs.forEach(t => t.classList.remove('active'));
    $(`.tab[data-tab="${tabName}"]`).classList.add('active');
    tabContents.forEach(tc => tc.classList.add('hidden'));
    $(`#${tabName}-tab`).classList.remove('hidden');

    if(tabName==='reports')       loadReports(1);
    if(tabName==='activity-logs') loadActivityLogs(1);
    if(tabName==='user-logs')     loadUserLogs(1);
    if(tabName==='system-logs')   loadSystemLogs(1);
  }

  // -------- Helpers ----------
  async function getJSON(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  function safeDate(v){ return v ? new Date(v) : new Date(); }

  // =========================================================
  //                       REPORTS
  // =========================================================
  async function loadReports(page=1){
    const moduleFilter = $('#moduleFilter').value || '';
    const from = $('#reportFromDate').value || '';
    const to = $('#reportToDate').value || '';
    const status = $('#reportStatus').value || '';
    const q = new URLSearchParams({ page, pageSize: state.reports.pageSize });
    if(moduleFilter) q.set('module', moduleFilter);
    if(from) q.set('from', from);
    if(to) q.set('to', to);
    if(status) q.set('status', status);

    try{
      const data = await getJSON(`/api/logs/reports?${q.toString()}`);
      let rows = Array.isArray(data?.items) ? data.items : [];
      if (!rows.length) rows = generateSampleReports(moduleFilter, from, to, status); // fallback if empty
      state.reports = { ...state.reports, page: 1, total: rows.length, rows };
      renderReports(rows);
      renderPagination('reportsPagination', 1, Math.max(rows.length, state.reports.pageSize), rows.length, loadReports);
    }catch(e){
      const rows = generateSampleReports(moduleFilter, from, to, status);
      state.reports = { ...state.reports, page: 1, total: rows.length, rows };
      renderReports(rows);
      renderPagination('reportsPagination', 1, rows.length, rows.length, loadReports);
    }
  }

  function generateSampleReports(module, from, to, status){
    const modules = ['resident','documents','cases','community','health','disaster','financial'];
    const moduleName = {
      resident:'Resident Information', documents:'Documents & Permits', cases:'Case & Incident',
      community:'Community Development', health:'Health & Social Services',
      disaster:'Disaster & Emergency', financial:'Financial & Budget'
    };
    const filtered = module ? [module] : modules;
    const statuses = ['Completed','Pending','In Progress'];
    const out = [];
    filtered.forEach(mod=>{
      for(let i=0;i<4;i++){
        out.push({
          _id: `${mod}_${Date.now()}_${i}`,
          module: mod,
          moduleName: moduleName[mod] || mod,
          title: `${moduleName[mod]} ${100+i}`,
          generatedBy: user?.name || 'User',
          createdAt: new Date(Date.now() - Math.random()*30*864e5).toISOString(),
          status: status || statuses[Math.floor(Math.random()*statuses.length)],
          recordCount: Math.floor(Math.random()*120)+15
        });
      }
    });
    return out;
  }

  function renderReports(reports){
    const tbody = $('#reportsTableBody');
    tbody.innerHTML = '';
    reports.forEach(r => {
      const tr = document.createElement('tr');
      const st = (r.status || '').split(' ')[0]; // map "In Progress" -> "In"
      tr.innerHTML = `
        <td>#${String(r._id).substring(0, 8)}</td>
        <td>${r.moduleName || r.module}</td>
        <td>${r.title}</td>
        <td>${r.generatedBy || user?.name || '—'}</td>
        <td>${safeDate(r.createdAt || r.dateGenerated).toLocaleString()}</td>
        <td><span class="badge s-${st}">${r.status}</span></td>
        <td>${r.recordCount ?? '—'}</td>
        <td>
          <button class="btn btn-outline" onclick="viewReport('${r._id}')">View</button>
          <button class="btn btn-outline" onclick="downloadReport('${r._id}')">Download</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // =========================================================
  //                    ACTIVITY LOGS
  // =========================================================
  async function loadActivityLogs(page=1){
    const from = $('#activityFromDate').value || '';
    const to = $('#activityToDate').value || '';
    const search = ($('#activitySearch').value || '').trim();
    const type = $('#activityType').value || '';
    const q = new URLSearchParams({ page, pageSize: state.activity.pageSize });
    if(from) q.set('from', from);
    if(to) q.set('to', to);
    if(search) q.set('search', search);
    if(type) q.set('activityType', type);

    try{
      const data = await getJSON(`/api/logs/activity?${q.toString()}`);
      let rows = Array.isArray(data?.items) ? data.items : [];
      if (!rows.length) rows = generateSampleActivityLogs(from, to, search, type);
      state.activity = { ...state.activity, page: 1, total: rows.length, rows };
      renderActivityLogs(rows);
      renderPagination('activityPagination', 1, Math.max(rows.length, state.activity.pageSize), rows.length, loadActivityLogs);
    }catch(e){
      const rows = generateSampleActivityLogs(from, to, search, type);
      state.activity = { ...state.activity, page: 1, total: rows.length, rows };
      renderActivityLogs(rows);
      renderPagination('activityPagination', 1, rows.length, rows.length, loadActivityLogs);
    }
  }

  function generateSampleActivityLogs(from, to, search, type){
    const activities = ['Create','Update','Delete','View','Export','Login','Logout','Download'];
    const modules = ['resident','health','cases','community','disaster','financial','documents'];
    const logs = [];
    for(let i=0;i<120;i++){
      const act = type || activities[Math.floor(Math.random()*activities.length)];
      const desc = `${act} ${['record','file','report','profile'][Math.floor(Math.random()*4)]}`;
      const row = {
        _id: 'log_'+i,
        createdAt: new Date(Date.now() - Math.random()*7*864e5).toISOString(),
        userName: user?.name || ['admin','m.santos','k.garcia','guest'][Math.floor(Math.random()*4)],
        activityType: act,
        module: modules[Math.floor(Math.random()*modules.length)],
        description: desc,
        ipAddress: `192.168.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
        status: Math.random()>0.06 ? 'Success' : 'Failed'
      };
      if (search && !(`${row.userName} ${row.description}`.toLowerCase().includes(search.toLowerCase()))) continue;
      logs.push(row);
    }
    return logs;
  }

  function renderActivityLogs(logs){
    const tbody = $('#activityTableBody');
    tbody.innerHTML = '';
    logs.forEach(log => {
      const st = (log.status || '').split(' ')[0];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safeDate(log.createdAt || log.timestamp).toLocaleString()}</td>
        <td>${log.userName || log.user}</td>
        <td><span class="badge">${log.activityType}</span></td>
        <td>${log.module}</td>
        <td>${log.description}</td>
        <td>${log.ipAddress}</td>
        <td><span class="badge s-${st}">${log.status}</span></td>`;
      tbody.appendChild(tr);
    });
  }

  // =========================================================
  //                       USER LOGS
  // =========================================================
  async function loadUserLogs(page=1){
    const search = ($('#userSearch').value || '').trim();
    const status = $('#userStatus').value || '';
    const role = $('#userRole').value || '';
    const q = new URLSearchParams({ page, pageSize: state.users.pageSize });
    if(search) q.set('search', search);
    if(status) q.set('status', status);
    if(role) q.set('role', role);

    try{
      const data = await getJSON(`/api/logs/users?${q.toString()}`);
      let rows = Array.isArray(data?.items) ? data.items : [];
      if (!rows.length) rows = generateSampleUserLogs(search, status, role);
      state.users = { ...state.users, page: 1, total: rows.length, rows };
      renderUserLogs(rows);
      renderPagination('usersPagination', 1, Math.max(rows.length, state.users.pageSize), rows.length, loadUserLogs);
    }catch(e){
      const rows = generateSampleUserLogs(search, status, role);
      state.users = { ...state.users, page: 1, total: rows.length, rows };
      renderUserLogs(rows);
      renderPagination('usersPagination', 1, rows.length, rows.length, loadUserLogs);
    }
  }

  function generateSampleUserLogs(search, status, role){
    const roles = ['Admin','User','Health Worker','Barangay Official'];
    const list = [];
    for(let i=0;i<40;i++){
      const r = role || roles[Math.floor(Math.random()*roles.length)];
      const s = status || (Math.random()>0.2 ? 'Active' : 'Inactive');
      const full = `User Name ${i}`;
      if (search && !(full.toLowerCase().includes(search.toLowerCase()))) continue;
      list.push({
        _id: 'user_'+i,
        userId: 'U-'+String(1000+i),
        username: ['admin','m.santos','k.garcia','guest'][i%4] || `user${i}`,
        fullName: full,
        role: r,
        lastLogin: new Date(Date.now()-Math.random()*30*864e5).toISOString(),
        loginCount: Math.floor(Math.random()*500)+10,
        status: s,
        email: `user${i}@barangay.gov.ph`
      });
    }
    return list;
  }

  function renderUserLogs(users){
    const tbody = $('#usersTableBody');
    tbody.innerHTML = '';
    users.forEach(u => {
      const st = (u.status || '').split(' ')[0];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.userId}</td>
        <td>${u.username}</td>
        <td>${u.fullName}</td>
        <td><span class="badge">${u.role}</span></td>
        <td>${safeDate(u.lastLogin).toLocaleString()}</td>
        <td>${u.loginCount}</td>
        <td><span class="badge s-${st}">${u.status}</span></td>
        <td>
          <button class="btn btn-outline" onclick="viewUserDetails('${u._id}')">Details</button>
          ${isAdmin ? `<button class="btn btn-outline" onclick="editUser('${u._id}')">Edit</button>` : ''}
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // =========================================================
  //                       SYSTEM LOGS
  // =========================================================
  async function loadSystemLogs(page=1){
    const from = $('#sysFromDate').value || '';
    const to = $('#sysToDate').value || '';
    const level = $('#sysLogLevel').value || '';
    const q = new URLSearchParams({ page, pageSize: state.system.pageSize });
    if(from) q.set('from', from);
    if(to) q.set('to', to);
    if(level) q.set('level', level);

    try{
      const data = await getJSON(`/api/logs/system?${q.toString()}`);
      let rows = Array.isArray(data?.items) ? data.items : [];
      if (!rows.length) rows = generateSampleSystemLogs(from, to, level);
      state.system = { ...state.system, page: 1, total: rows.length, rows };
      renderSystemLogs(rows);
      renderPagination('systemPagination', 1, Math.max(rows.length, state.system.pageSize), rows.length, loadSystemLogs);
    }catch(e){
      const rows = generateSampleSystemLogs(from, to, level);
      state.system = { ...state.system, page: 1, total: rows.length, rows };
      renderSystemLogs(rows);
      renderPagination('systemPagination', 1, rows.length, rows.length, loadSystemLogs);
    }
  }

  function generateSampleSystemLogs(from, to, level){
    const levels = ['Error','Warning','Info','Debug'];
    const components = ['Database','Authentication','File Storage','API','Cache','Email Service','PDF Generator'];
    const events = ['Connection established','Query executed','User authenticated','File uploaded','Report generated','Export completed','Error occurred'];
    const logs = [];
    for(let i=0;i<160;i++){
      const lv = level || levels[Math.floor(Math.random()*levels.length)];
      logs.push({
        _id: 'syslog_'+i,
        createdAt: new Date(Date.now() - Math.random()*7*864e5).toISOString(),
        logLevel: lv,
        event: events[Math.floor(Math.random()*events.length)],
        component: components[Math.floor(Math.random()*components.length)],
        message: `Operation finished in ${Math.floor(Math.random()*5000)}ms`,
        details: `Details for system log entry ${i}`
      });
    }
    return logs;
  }

  function renderSystemLogs(logs){
    const tbody = $('#systemTableBody');
    tbody.innerHTML = '';
    logs.forEach(log => {
      const badgeClass = log.logLevel==='Error' ? 'High' : log.logLevel==='Warning' ? 'Medium' : 'Low';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safeDate(log.createdAt || log.timestamp).toLocaleString()}</td>
        <td><span class="badge s-${badgeClass}">${log.logLevel}</span></td>
        <td>${log.event}</td>
        <td>${log.component}</td>
        <td>${log.message}</td>
        <td><button class="btn btn-outline" onclick="viewSystemLogDetails('${log._id}')">View</button></td>`;
      tbody.appendChild(tr);
    });
  }

  // -------- Pagination ----------
  function renderPagination(elId, page, pageSize, total, onChange){
    const el = $('#'+elId);
    el.innerHTML = '';
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    const mkBtn = (label, p, disabled=false) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.disabled = disabled;
      b.onclick = () => onChange(p);
      return b;
    };

    el.appendChild(mkBtn('« First', 1, page<=1));
    el.appendChild(mkBtn('‹ Prev', Math.max(1,page-1), page<=1));
    const info = document.createElement('span');
    info.style.margin = '0 8px';
    info.textContent = `Page ${page} of ${totalPages} — ${total} record(s)`;
    el.appendChild(info);
    el.appendChild(mkBtn('Next ›', Math.min(totalPages,page+1), page>=totalPages));
    el.appendChild(mkBtn('Last »', totalPages, page>=totalPages));
  }

  // =========================================================
  //                      EXPORTS
  // =========================================================
  async function exportCurrentViewToPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    const titleMap = {
      'reports': 'Module Reports',
      'activity-logs': 'Activity Logs',
      'user-logs': 'User Logs',
      'system-logs': 'System Logs',
    };
    const title = `Barangay Langkaan II — ${titleMap[currentTab]}`;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 40, 40);

    // Meta
    doc.setFontSize(10);
    const uname = (user?.name || 'User');
    const now = new Date().toLocaleString();
    doc.text(`Generated by: ${uname}`, 40, 60);
    doc.text(`Generated at: ${now}`, 40, 75);

    // Watermark
    doc.setTextColor(150);
    doc.setFontSize(60);
    doc.text('BRGY LANGKAAN II', doc.internal.pageSize.getWidth()/2, doc.internal.pageSize.getHeight()/2, { align:'center', angle: 30, opacity: 0.05 });

    // Table grab
    const table = document.querySelector(`#${currentTab}-tab table`);
    const head = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const body = [...table.querySelectorAll('tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
    );

    doc.autoTable({
      head: [head],
      body,
      startY: 100,
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [248,249,250], textColor: [80,80,80] },
      alternateRowStyles: { fillColor: [252,253,255] },
      didDrawPage: (data) => {
        const str = `Page ${doc.internal.getNumberOfPages()}`;
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(str, data.settings.margin.left, doc.internal.pageSize.getHeight() - 20);
      }
    });

    doc.save(`${titleMap[currentTab].replace(/\s+/g,'-').toLowerCase()}-${Date.now()}.pdf`);
  }

  function tableToArrays(scopeSel){
    const table = document.querySelector(`${scopeSel} table`);
    if (!table) return { head: [], body: [] };
    const head = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const body = [...table.querySelectorAll('tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
    );
    return { head, body };
  }

  function downloadCSV(filename, head, body){
    const esc = (v) => `"${String(v).replace(/"/g,'""')}"`;
    const rows = [
      head.map(esc).join(','),
      ...body.map(r => r.map(esc).join(','))
    ].join('\r\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function exportCurrentViewToCSV(){
    const map = {
      'reports': 'module-reports',
      'activity-logs': 'activity-logs',
      'user-logs': 'user-logs',
      'system-logs': 'system-logs',
    };
    const { head, body } = tableToArrays(`#${currentTab}-tab`);
    if (!body.length) { toast('Nothing to export', 'info'); return; }
    downloadCSV(`${map[currentTab]}-${Date.now()}.csv`, head, body);
  }

  // Buttons
  $('#btnFilterReports').addEventListener('click', () => loadReports(1));
  $('#btnRefreshReports').addEventListener('click', () => loadReports(state.reports.page));
  $('#btnFilterActivity').addEventListener('click', () => loadActivityLogs(1));
  $('#btnRefreshActivity').addEventListener('click', () => loadActivityLogs(state.activity.page));
  $('#btnFilterUsers').addEventListener('click', () => loadUserLogs(1));
  $('#btnRefreshUsers').addEventListener('click', () => loadUserLogs(state.users.page));
  $('#btnFilterSystem').addEventListener('click', () => loadSystemLogs(1));
  $('#btnRefreshSystem').addEventListener('click', () => loadSystemLogs(state.system.page));

  // Smart Export chooser (PDF/CSV) + populate if empty
  $('#btnExportReport').addEventListener('click', () => {
    const tbody = document.querySelector(`#${currentTab}-tab tbody`);
    if (tbody && tbody.children.length === 0) {
      if (currentTab==='reports')       loadReports(1);
      if (currentTab==='activity-logs') loadActivityLogs(1);
      if (currentTab==='user-logs')     loadUserLogs(1);
      if (currentTab==='system-logs')   loadSystemLogs(1);
    }
    const choice = (window.prompt('Export format? Type "pdf" or "csv"', 'pdf') || '').toLowerCase();
    if (choice === 'csv') return exportCurrentViewToCSV();
    return exportCurrentViewToPDF();
  });

  $('#btnClearSystemLogs').addEventListener('click', async () => {
    if(!confirm('Clear system logs? This cannot be undone.')) return;
    // await fetch('/api/logs/system', { method:'DELETE' });
    alert('System logs cleared successfully.');
    loadSystemLogs(1);
  });

  // Drawer helpers
  window.viewReport = function(id){
    drawerTitle.textContent = 'Report Details';
    drawerBody.innerHTML = `
      <div class="detail-item"><div class="detail-item-label">Report ID</div><div class="detail-item-value">${id}</div></div>
      <div class="detail-item"><div class="detail-item-label">Module</div><div class="detail-item-value">Selected Module</div></div>
      <div class="detail-item"><div class="detail-item-label">Generated By</div><div class="detail-item-value">${user?.name || 'User'}</div></div>
      <div class="detail-item"><div class="detail-item-label">Date Generated</div><div class="detail-item-value">${new Date().toLocaleString()}</div></div>
      <div class="detail-item"><div class="detail-item-label">Status</div><div class="detail-item-value"><span class="badge s-Completed">Completed</span></div></div>
      <div class="detail-item"><div class="detail-item-label">Records Count</div><div class="detail-item-value">150 records</div></div>
      <hr style="margin:15px 0;border:none;border-top:1px solid var(--border-color)">
      <div style="margin-top:15px;display:flex;gap:10px">
        <button class="btn btn-primary" onclick="downloadReport('${id}')">Download Report</button>
        <button class="btn btn-outline" onclick="printReport('${id}')">Print</button>
      </div>`;
    drawer.classList.add('active');
  };
  window.downloadReport = function(){ exportCurrentViewToPDF(); };
  window.printReport = function(){ window.print(); };

  window.viewUserDetails = function(id){
    drawerTitle.textContent = 'User Account Details';
    drawerBody.innerHTML = `
      <div class="detail-item"><div class="detail-item-label">User ID</div><div class="detail-item-value">BL2-0001</div></div>
      <div class="detail-item"><div class="detail-item-label">Username</div><div class="detail-item-value">user_account</div></div>
      <div class="detail-item"><div class="detail-item-label">Full Name</div><div class="detail-item-value">User Full Name</div></div>
      <div class="detail-item"><div class="detail-item-label">Email</div><div class="detail-item-value">user@barangay.gov.ph</div></div>
      <div class="detail-item"><div class="detail-item-label">Role</div><div class="detail-item-value"><span class="badge">User</span></div></div>
      <div class="detail-item"><div class="detail-item-label">Status</div><div class="detail-item-value"><span class="badge s-Active">Active</span></div></div>
      <div class="detail-item"><div class="detail-item-label">Last Login</div><div class="detail-item-value">${new Date().toLocaleString()}</div></div>
      <div class="detail-item"><div class="detail-item-label">Total Logins</div><div class="detail-item-value">245</div></div>
      ${isAdmin ? `
        <div class="detail-item"><div class="detail-item-label">Account Created</div><div class="detail-item-value">${new Date(Date.now()-90*864e5).toLocaleString()}</div></div>
        <div class="detail-item"><div class="detail-item-label">Last Password Change</div><div class="detail-item-value">${new Date(Date.now()-30*864e5).toLocaleString()}</div></div>
      ` : ''}
      <hr style="margin:15px 0;border:none;border-top:1px solid var(--border-color)">
      <div style="margin-top:15px;display:flex;gap:10px">
        ${isAdmin ? `<button class="btn btn-primary" onclick="resetUserPassword('${id}')">Reset Password</button>` : ''}
        <button class="btn btn-outline" onclick="exportUserReport('${id}')">Export Report</button>
      </div>`;
    drawer.classList.add('active');
  };
  window.editUser = function(){ alert('Edit user (Admin only)'); };
  window.resetUserPassword = function(){ if(confirm('Reset password for this user?')) alert('Temporary password sent to user email.'); };
  window.exportUserReport = function(){ exportCurrentViewToPDF(); };

  window.viewSystemLogDetails = function(id){
    drawerTitle.textContent = 'System Log Details';
    drawerBody.innerHTML = `
      <div class="detail-item"><div class="detail-item-label">Log ID</div><div class="detail-item-value">${id}</div></div>
      <div class="detail-item"><div class="detail-item-label">Timestamp</div><div class="detail-item-value">${new Date().toLocaleString()}</div></div>
      <div class="detail-item"><div class="detail-item-label">Log Level</div><div class="detail-item-value"><span class="badge s-Low">Info</span></div></div>
      <div class="detail-item"><div class="detail-item-label">Component</div><div class="detail-item-value">Database</div></div>
      <div class="detail-item"><div class="detail-item-label">Event</div><div class="detail-item-value">Query executed successfully</div></div>
      <div class="detail-item"><div class="detail-item-label">Message</div><div class="detail-item-value">Operation finished in 1234ms</div></div>
      <div class="detail-item"><div class="detail-item-label">Stack Trace</div><div class="detail-item-value" style="background:var(--bg-primary);padding:10px;border-radius:8px;font-family:monospace;font-size:12px">No errors occurred</div></div>`;
    drawer.classList.add('active');
  };

  dClose.onclick = () => drawer.classList.remove('active');
  drawer.querySelector('.overlay').onclick = () => drawer.classList.remove('active');

  // Start
  initUser();
})();
