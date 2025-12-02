// public/disaster.js
(function(){
  const $ = (s,p=document)=>p.querySelector(s);
  const $$ = (s,p=document)=>p.querySelectorAll(s);
  
  // DOM element references - will be re-queried in init()
  let tableHead, tableBody, pager, modal, frm, msg, formContent, tabs;
  let drawer, dBody, dClose, dRecordId, dStatus, announcementsSection;

  let user = null;
  let currentTab = 'incidents';
  let isAdmin = false;
  let isLoading = false;

  // Tab configurations
  const tabConfigs = {
    'incidents': {
      title: 'Incident Reports',
      headers: ['Date', 'Type', 'Location', 'People Affected', 'Priority', 'Status', 'Reported By'],
      apiEndpoint: '/api/disaster/incidents'
    },
    'coordination': {
      title: 'Response & Coordination',
      headers: ['Date', 'Agency Coordinated', 'Action Taken', 'Resources Deployed', 'Status'],
      apiEndpoint: '/api/disaster/coordination'
    },
    'monitoring': {
      title: 'Area Monitoring',
      headers: ['Area/Zone', 'Risk Level', 'Population', 'Last Assessed', 'Vulnerabilities', 'Status'],
      apiEndpoint: '/api/disaster/monitoring'
    },
    'preparedness': {
      title: 'Preparedness Plans',
      headers: ['Plan Name', 'Disaster Type', 'Last Updated', 'Coordinator', 'Drill Schedule', 'Status'],
      apiEndpoint: '/api/disaster/preparedness'
    },
    'contacts': {
      title: 'Emergency Contacts',
      headers: ['Agency/Organization', 'Contact Person', 'Phone', 'Email', 'Type', 'Status'],
      apiEndpoint: '/api/disaster/contacts'
    },
    'resources': {
      title: 'Resources & Equipment',
      headers: ['Item Name', 'Category', 'Quantity', 'Location', 'Condition', 'Status'],
      apiEndpoint: '/api/disaster/resources'
    }
  };

  let state = { 
    page: 1, 
    limit: 10, 
    status: '', 
    type: '',
    q: '', 
    from: '', 
    to: '', 
    sort: 'desc' 
  };

  const badge = s => {
    const map = {
      'Resolved': 'bg-resolved',
      'Ongoing': 'bg-ongoing',
      'Pending': 'bg-pending',
      'Critical': 'bg-critical',
      'Completed': 'bg-completed',
      'Upcoming': 'bg-upcoming',
      'Monitoring': 'bg-monitoring',
      'Active': 'bg-ongoing',
      'Available': 'bg-resolved',
      'Reported': 'bg-reported'
    };
    const cls = map[s] || 'bg-pending';
    return `<span class="badge ${cls}" style="padding: 4px 8px; border-radius: 14px; font-size: 12px; font-weight: 700; display: inline-block;">${s}</span>`;
  };
  const fmt = d => d ? new Date(d).toLocaleString() : '';
  const fmtDate = d => d ? new Date(d).toLocaleDateString() : '';

  // User authentication with role checking
  async function initUser(){
    try{
      const res = await fetch('/api/me'); 
      const j = await res.json();
      user = j.user || null;
      if(!user){ location.href='/login'; return; }
      
      isAdmin = user.role === 'admin' || user.role === 'Admin';
      
      $('#username').textContent = user.name || 'User';
      $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
      
      if (!isAdmin) {
        const roleIndicator = document.createElement('small');
        roleIndicator.textContent = ' (User)';
        roleIndicator.className = 'text-[#7f8c8d]';
        $('#username').appendChild(roleIndicator);
      }
      
    }catch{ location.href='/login'; }
  }

  async function logout(){ 
    await fetch('/api/logout',{method:'POST'}); 
    location.href='/login'; 
  }
  window.logout = logout;

  // Announcements
  function renderAnnouncements() {
    if (!announcementsSection) return;
    
    const announcements = [
      {
        id: 1,
        title: '🌊 Flood Preparedness Advisory',
        content: 'Due to ongoing weather disturbances, residents in low-lying areas are advised to prepare emergency kits and monitor water levels. Evacuation centers are on standby.',
        date: '2025-10-07',
        priority: 'HIGH',
        active: true
      },
      {
        id: 2,
        title: '🚒 Fire Safety Week',
        content: 'Barangay Langkaan II will conduct fire drills and safety seminars this week. All households are encouraged to participate. Contact the fire marshal for schedules.',
        date: '2025-10-06',
        priority: 'MEDIUM',
        active: true
      }
    ];

    const activeAnnouncements = isAdmin ? announcements : announcements.filter(a => a.active);
    
    if (activeAnnouncements.length === 0) {
      announcementsSection.innerHTML = '';
      announcementsSection.classList.add('hidden');
      return;
    }
    announcementsSection.classList.remove('hidden');

    announcementsSection.innerHTML = activeAnnouncements.map(ann => {
      return `
      <div class="announcement-card">
        <div class="announcement-header">
          <div class="announcement-title">${ann.title}</div>
          <div class="announcement-date">${fmtDate(ann.date)}</div>
        </div>
        <div class="announcement-content">${ann.content}</div>
        <div class="announcement-footer">
          <div class="announcement-priority">Priority: ${ann.priority}</div>
        </div>
      </div>
    `;
    }).join('');
  }

  // Summary statistics
  function setSummary(sum){
    const sTotal = $('#sTotal');
    const sCritical = $('#sCritical');
    const sOngoing = $('#sOngoing');
    const sResolved = $('#sResolved');
    const sAffected = $('#sAffected');
    const sTeams = $('#sTeams');
    
    if (sTotal) sTotal.textContent = sum.Total || 0;
    if (sCritical) sCritical.textContent = sum.Critical || 0;
    if (sOngoing) sOngoing.textContent = sum.Ongoing || 0;
    if (sResolved) sResolved.textContent = sum.Resolved || 0;
    if (sAffected) sAffected.textContent = sum.Affected || 0;
    if (sTeams) sTeams.textContent = sum.Teams || 0;
    
    const popTotal = $('#popTotal');
    const popSeniors = $('#popSeniors');
    const popMinors = $('#popMinors');
    const popPets = $('#popPets');
    if (popTotal) popTotal.textContent = sum.PopulationTotal || 0;
    if (popSeniors) popSeniors.textContent = sum.PopulationSeniors || 0;
    if (popMinors) popMinors.textContent = sum.PopulationMinors || 0;
    if (popPets) popPets.textContent = sum.PopulationPets || 0;
    
    // Update alert banner based on critical incidents
    updateAlertBanner(sum);
  }

  // Update alert banner based on critical incidents
  function updateAlertBanner(summary) {
    const alertBanner = $('#alertBanner');
    const alertTitle = $('#alertTitle');
    const alertMessage = $('#alertMessage');
    
    if (!alertBanner || !alertTitle || !alertMessage) return;
    
    const criticalCount = summary.Critical || 0;
    const ongoingCount = summary.Ongoing || 0;
    
    if (criticalCount > 0) {
      alertBanner.classList.remove('hidden');
      alertTitle.textContent = `🚨 ${criticalCount} Critical ${criticalCount === 1 ? 'Incident' : 'Incidents'} Active`;
      alertMessage.textContent = `Immediate attention required. ${ongoingCount > 0 ? `${ongoingCount} ongoing ${ongoingCount === 1 ? 'incident' : 'incidents'} also need monitoring.` : 'Please review and take appropriate action.'}`;
      alertBanner.style.borderLeft = '4px solid #e74c3c';
      alertBanner.style.background = '#fff5f5';
    } else if (ongoingCount > 0) {
      alertBanner.classList.remove('hidden');
      alertTitle.textContent = `⚠️ ${ongoingCount} Ongoing ${ongoingCount === 1 ? 'Incident' : 'Incidents'}`;
      alertMessage.textContent = 'Active incidents are being monitored. Stay alert for updates.';
      alertBanner.style.borderLeft = '4px solid #f39c12';
      alertBanner.style.background = '#fffbf0';
    } else {
      alertBanner.classList.add('hidden');
    }
  }

  async function refreshSummary(){
    try{
      const j = await (await fetch('/api/disaster/summary')).json();
      if (j.ok) setSummary(j.summary || {});
    }catch{
      setSummary({Total: 127, Critical: 3, Ongoing: 12, Resolved: 112, Affected: 450, Teams: 8});
    }
  }

  // Tab switching
  function switchTab(tabName) {
    if (!tableHead || !tableBody) {
      console.warn('Disaster page: Table elements not ready for switchTab');
      return;
    }
    
    currentTab = tabName;
    
    const contentArea = document.querySelector('.content-area');
    const tabs = contentArea ? (contentArea.querySelectorAll('.disaster-tab') || document.querySelectorAll('.disaster-tab')) : document.querySelectorAll('.disaster-tab');
    tabs.forEach(t => {
      t.classList.remove('active');
    });
    const activeTab = contentArea ? (contentArea.querySelector(`.disaster-tab[data-tab="${tabName}"]`) || document.querySelector(`.disaster-tab[data-tab="${tabName}"]`)) : document.querySelector(`.disaster-tab[data-tab="${tabName}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }
    
    const config = tabConfigs[tabName];
    if (config && tableHead) {
      tableHead.innerHTML = `<tr>${config.headers.map(h => `<th>${h}</th>`).join('')}<th style="min-width: 180px;">Actions</th></tr>`;
      const dlgTitle = document.getElementById('dlgTitle');
      if (dlgTitle) {
        dlgTitle.textContent = `Add ${config.title}`;
      }
      state.page = 1;
      load();
      updateFormContent();
    }
  }

  // Show loading skeleton
  function showLoading() {
    if (!tableBody) return;
    const config = tabConfigs[currentTab];
    if (!config) return;
    
    const colCount = config.headers.length + 1; // +1 for Actions column
    tableBody.innerHTML = '';
    
    // Add loading class to table wrapper
    const tableWrap = tableBody.closest('.disaster-table-wrap');
    if (tableWrap) {
      tableWrap.classList.add('table-loading');
    }
    
    // Create 5 skeleton rows
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement('tr');
      tr.className = 'table-skeleton';
      let skeletonCells = '';
      
      for (let j = 0; j < colCount; j++) {
        const width = j === 0 ? 'short' : j === colCount - 1 ? 'short' : 'long';
        skeletonCells += `<td><div class="skeleton-bar ${width}"></div></td>`;
      }
      
      tr.innerHTML = skeletonCells;
      tableBody.appendChild(tr);
    }
  }

  // Data loading with role-based filtering
  async function load(){
    if (!tableHead || !tableBody) {
      console.warn('Disaster page: Cannot load data, table elements not ready');
      return;
    }
    
    const config = tabConfigs[currentTab];
    if (!config) {
      console.warn('Disaster page: No config for current tab:', currentTab);
      return;
    }

    // Show loading state
    showLoading();

    const params = {
      page: state.page, 
      limit: state.limit, 
      status: state.status,
      type: state.type,
      q: state.q, 
      from: state.from, 
      to: state.to, 
      sort: state.sort
    };
    
    if (!isAdmin && user && (user._id || user.id)) {
      params.userId = user._id || user.id;
    }

    const qs = new URLSearchParams(params).toString();

    try {
      // Add small delay for smooth transition (only if data loads too fast)
      const [response] = await Promise.all([
        fetch(`${config.apiEndpoint}?${qs}`),
        new Promise(resolve => setTimeout(resolve, 150)) // Minimum 150ms for smooth transition
      ]);
      
      const j = await response.json();
      
      // Remove loading class
      const tableWrap = tableBody?.closest('.disaster-table-wrap');
      if (tableWrap) {
        tableWrap.classList.remove('table-loading');
      }
      
      if (j.ok) {
        renderRows(j.rows || []);
        renderPager(j.page || 1, j.totalPages || 1, j.total || 0);
      } else {
        showSampleData();
      }
    } catch (error) {
      // Remove loading class on error
      const tableWrap = tableBody?.closest('.disaster-table-wrap');
      if (tableWrap) {
        tableWrap.classList.remove('table-loading');
      }
      showSampleData();
    }

    refreshSummary();
  }

  // Sample data with user filtering
  function showSampleData() {
    // Remove loading class
    const tableWrap = tableBody?.closest('.disaster-table-wrap');
    if (tableWrap) {
      tableWrap.classList.remove('table-loading');
    }
    
    const sampleData = getSampleDataForTab(currentTab);
    
    let filteredRows = sampleData.rows;
    if (!isAdmin && user) {
      const userSpecificRecords = sampleData.rows.slice(0, Math.ceil(sampleData.rows.length / 3));
      filteredRows = userSpecificRecords.map(record => ({
        ...record,
        createdBy: user._id || user.id,
        reportedBy: user.name || user.username
      }));
    }
    
    renderRows(filteredRows);
    renderPager(1, 1, filteredRows.length);
  }

  function getSampleDataForTab(tab) {
    const samples = {
      'incidents': {
        rows: [
          { _id: '1', incidentDate: new Date('2025-03-12'), type: 'Fire Incident', location: 'Humayao, Phase 2', peopleAffected: '15 families', affectedCount: 15, priority: 'HIGH', status: 'Resolved', description: 'Residential fire contained by BFP', createdAt: new Date('2025-03-12') },
          { _id: '2', incidentDate: new Date('2025-04-05'), type: 'Flooding', location: 'Valle Verde, Phase 3', peopleAffected: '42 families', affectedCount: 42, priority: 'HIGH', status: 'Resolved', description: 'Heavy rainfall caused flooding', createdAt: new Date('2025-04-05') },
          { _id: '3', incidentDate: new Date('2025-04-08'), type: 'Power Outage', location: 'Cityhomes, R5', peopleAffected: '28 families', affectedCount: 28, priority: 'MEDIUM', status: 'Ongoing', description: 'Meralco coordinating restoration', createdAt: new Date('2025-04-08') },
          { _id: '4', incidentDate: new Date('2025-04-15'), type: 'Vehicular Accident', location: 'Greenbreeze, Phase 1', peopleAffected: '3 persons', affectedCount: 3, priority: 'HIGH', status: 'Ongoing', description: 'Traffic collision, medical assistance provided', createdAt: new Date('2025-04-15') },
          { _id: '5', incidentDate: new Date('2025-04-28'), type: 'Chemical Spill', location: 'Greenbreeze, Phase 2', peopleAffected: '8 families', affectedCount: 8, priority: 'MEDIUM', status: 'Ongoing', description: 'Environmental Management coordinating cleanup', createdAt: new Date('2025-04-28') }
        ]
      },
      'coordination': {
        rows: [
          { _id: '1', coordinationDate: new Date('2025-03-12'), agency: 'Bureau of Fire Protection', actionTaken: 'Fire extinguished, site cleared', resourcesDeployed: '2 fire trucks, 12 personnel', status: 'Completed', contactPerson: 'Fire Marshal Cruz', contactNumber: '09171234567' },
          { _id: '2', coordinationDate: new Date('2025-04-05'), agency: 'City Disaster Risk Reduction Office', actionTaken: 'Deployed rescue boats and relief goods', resourcesDeployed: '3 boats, relief packs', status: 'Completed', contactPerson: 'Dir. Santos', contactNumber: '09181234568' },
          { _id: '3', coordinationDate: new Date('2025-04-08'), agency: 'Meralco', actionTaken: 'Power restoration scheduled', resourcesDeployed: 'Technical team dispatched', status: 'Upcoming', contactPerson: 'Engr. Reyes', contactNumber: '09191234569' },
          { _id: '4', coordinationDate: new Date('2025-04-15'), agency: 'Barangay Rescue Team', actionTaken: 'Assisted victims, reported to traffic division', resourcesDeployed: 'Ambulance, 4 responders', status: 'Ongoing', contactPerson: 'Team Leader Bautista', contactNumber: '09201234570' },
          { _id: '5', coordinationDate: new Date('2025-04-28'), agency: 'Environmental Management Bureau', actionTaken: 'Safety protocol and evacuation initiated', resourcesDeployed: 'Hazmat team, containment equipment', status: 'Completed', contactPerson: 'Officer Fernandez', contactNumber: '09211234571' }
        ]
      },
      'monitoring': {
        rows: [
          { _id: '1', area: 'Valle Verde - Zone 1', riskLevel: 'High', population: 450, lastAssessed: new Date('2025-10-01'), vulnerabilities: 'Low elevation, flood-prone', status: 'Monitoring', notes: 'Requires constant monitoring during rainy season' },
          { _id: '2', area: 'Cityhomes - Zone 2', riskLevel: 'Medium', population: 380, lastAssessed: new Date('2025-09-28'), vulnerabilities: 'Dense housing, fire risk', status: 'Monitoring', notes: 'Fire safety campaign ongoing' },
          { _id: '3', area: 'Greenbreeze - Zone 3', riskLevel: 'Low', population: 290, lastAssessed: new Date('2025-09-25'), vulnerabilities: 'Well-planned area', status: 'Monitoring', notes: 'Regular assessments scheduled' },
          { _id: '4', area: 'Humayao - Zone 4', riskLevel: 'High', population: 520, lastAssessed: new Date('2025-10-02'), vulnerabilities: 'Near creek, landslide risk', status: 'Critical', notes: 'Early warning system installed' },
          { _id: '5', area: 'Riverside - Zone 5', riskLevel: 'High', population: 410, lastAssessed: new Date('2025-10-03'), vulnerabilities: 'Flood-prone, riverbank erosion', status: 'Critical', notes: 'Evacuation plan active' }
        ]
      },
      'preparedness': {
        rows: [
          { _id: '1', planName: 'Flood Response Plan 2025', disasterType: 'Flooding', lastUpdated: new Date('2025-01-15'), coordinator: 'BDRRMO Officer Cruz', drillSchedule: 'Quarterly', status: 'Active', nextDrill: new Date('2025-12-15') },
          { _id: '2', planName: 'Fire Safety & Prevention', disasterType: 'Fire', lastUpdated: new Date('2025-02-10'), coordinator: 'Fire Marshal Santos', drillSchedule: 'Monthly', status: 'Active', nextDrill: new Date('2025-11-10') },
          { _id: '3', planName: 'Earthquake Preparedness', disasterType: 'Earthquake', lastUpdated: new Date('2024-12-20'), coordinator: 'Safety Officer Reyes', drillSchedule: 'Semi-Annual', status: 'Pending', nextDrill: new Date('2025-12-20') },
          { _id: '4', planName: 'Medical Emergency Response', disasterType: 'Medical Emergency', lastUpdated: new Date('2025-03-05'), coordinator: 'Health Officer Bautista', drillSchedule: 'Quarterly', status: 'Active', nextDrill: new Date('2025-11-05') },
          { _id: '5', planName: 'Typhoon Evacuation Plan', disasterType: 'Typhoon', lastUpdated: new Date('2025-06-01'), coordinator: 'BDRRMO Officer Cruz', drillSchedule: 'Annually', status: 'Active', nextDrill: new Date('2026-06-01') }
        ]
      },
      'contacts': {
        rows: [
          { _id: '1', agency: 'Bureau of Fire Protection - Dasmarinas', contactPerson: 'Fire Marshal Roberto Cruz', phone: '09171234567', email: 'bfp.dasmarinas@gov.ph', type: 'Fire Response', status: 'Active', address: 'Dasmarinas City Hall Complex' },
          { _id: '2', agency: 'Philippine National Police - Dasmarinas', contactPerson: 'P/Col. Maria Santos', phone: '09181234568', email: 'pnp.dasmarinas@pnp.gov.ph', type: 'Law Enforcement', status: 'Active', address: 'PNP Station, Dasmarinas' },
          { _id: '3', agency: 'City Disaster Risk Reduction Office', contactPerson: 'Dir. Antonio Reyes', phone: '09191234569', email: 'cdrrmo@dasmarinas.gov.ph', type: 'Disaster Management', status: 'Active', address: 'City Hall, Dasmarinas' },
          { _id: '4', agency: 'Dasmarinas Medical Center', contactPerson: 'Dr. Elena Bautista', phone: '09201234570', email: 'emergency@dasmed.ph', type: 'Medical Emergency', status: 'Active', address: 'Dasmarinas City' },
          { _id: '5', agency: 'Philippine Red Cross - Cavite Chapter', contactPerson: 'Chapter Manager Fernandez', phone: '09211234571', email: 'cavite@redcross.org.ph', type: 'Relief Operations', status: 'Active', address: 'Trece Martires City' },
          { _id: '6', agency: 'Meralco Emergency Hotline', contactPerson: 'Customer Service', phone: '16211', email: 'emergency@meralco.com.ph', type: 'Power Emergency', status: 'Active', address: '24/7 Hotline' }
        ]
      },
      'resources': {
        rows: [
          { _id: '1', itemName: 'Rescue Boat', category: 'Equipment', quantity: 3, location: 'Barangay Hall Storage', condition: 'Good', status: 'Available', lastMaintenance: new Date('2025-08-15'), serialNumber: 'RB-001-003' },
          { _id: '2', itemName: 'Fire Extinguisher (10kg)', category: 'Equipment', quantity: 25, location: 'Various Barangay Facilities', condition: 'Good', status: 'Available', lastMaintenance: new Date('2025-09-01'), serialNumber: 'FE-001-025' },
          { _id: '3', itemName: 'First Aid Kit', category: 'Medical', quantity: 40, location: 'Health Center & Outposts', condition: 'Good', status: 'Available', lastMaintenance: new Date('2025-10-01'), serialNumber: 'FA-001-040' },
          { _id: '4', itemName: 'Emergency Lights', category: 'Equipment', quantity: 15, location: 'Barangay Hall', condition: 'Excellent', status: 'Available', lastMaintenance: new Date('2025-07-20'), serialNumber: 'EL-001-015' },
          { _id: '5', itemName: 'Portable Radio Transceiver', category: 'Communication', quantity: 8, location: 'BDRRMO Office', condition: 'Good', status: 'Available', lastMaintenance: new Date('2025-09-10'), serialNumber: 'RT-001-008' },
          { _id: '6', itemName: 'Relief Goods (Family Packs)', category: 'Supplies', quantity: 200, location: 'Warehouse', condition: 'Good', status: 'Available', lastMaintenance: new Date('2025-10-05'), serialNumber: 'RG-FP-200' },
          { _id: '7', itemName: 'Tents (10-person)', category: 'Equipment', quantity: 10, location: 'Warehouse', condition: 'Good', status: 'Available', lastMaintenance: new Date('2025-08-25'), serialNumber: 'TNT-001-010' },
          { _id: '8', itemName: 'Megaphone', category: 'Equipment', quantity: 5, location: 'BDRRMO Office', condition: 'Excellent', status: 'Available', lastMaintenance: new Date('2025-09-15'), serialNumber: 'MP-001-005' }
        ]
      }
    };
    return samples[tab] || { rows: [] };
  }

  function renderRows(rows){
    if (!tableBody) return;
    
    // Clear existing rows with fade out
    tableBody.style.opacity = '0';
    tableBody.style.transition = 'opacity 0.2s ease';
    
    // Use requestAnimationFrame for smooth transition
    requestAnimationFrame(() => {
      tableBody.innerHTML = '';
      
      if (!rows || rows.length === 0) {
        const config = tabConfigs[currentTab];
        const colCount = config ? config.headers.length + 1 : 6;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="${colCount}" style="text-align: center; padding: 40px 20px; color: var(--muted);">No records found.</td>`;
        tableBody.appendChild(tr);
        tableBody.style.opacity = '1';
        return;
      }
      
      rows.forEach((r, index) => {
      const tr = document.createElement('tr');
      let cells = '';
      
      switch(currentTab) {
        case 'incidents':
          const priorityClass = r.priority?.toLowerCase() === 'high' || r.priority === 'HIGH' ? 'priority-high' : 
                               r.priority?.toLowerCase() === 'medium' || r.priority === 'MEDIUM' ? 'priority-medium' : 'priority-low';
          // Extract reporter name - can be object or string
          const reportedByName = typeof r.reportedBy === 'object' 
            ? (r.reportedBy.name || r.reportedBy.username || r.reporterName || 'N/A')
            : (r.reportedBy || r.reporterName || 'N/A');
          cells = `
            <td>${fmt(r.incidentDate)}</td>
            <td>${r.type || 'N/A'}</td>
            <td>${r.location || 'N/A'}</td>
            <td>${r.peopleAffected || (r.affectedCount ? `${r.affectedCount} ${r.affectedCount === 1 ? 'person' : 'people'}` : 'N/A')}</td>
            <td><span class="${priorityClass}">${r.priority || 'LOW'}</span></td>
            <td>${badge(r.status || 'Pending')}</td>
            <td>${reportedByName}</td>
          `;
          break;
        case 'coordination':
          cells = `
            <td>${fmt(r.coordinationDate)}</td>
            <td>${r.agency || 'N/A'}</td>
            <td>${r.actionTaken || 'N/A'}</td>
            <td>${r.resourcesDeployed || 'N/A'}</td>
            <td>${badge(r.status || 'Pending')}</td>
          `;
          break;
        case 'monitoring':
          const riskClass = r.riskLevel?.toLowerCase() === 'high' ? 'priority-high' : 
                           r.riskLevel?.toLowerCase() === 'medium' ? 'priority-medium' : 'priority-low';
          cells = `
            <td>${r.area || 'N/A'}</td>
            <td><span class="${riskClass}">${r.riskLevel || 'Low'}</span></td>
            <td>${r.population || 0}</td>
            <td>${fmtDate(r.lastAssessed)}</td>
            <td>${r.vulnerabilities || 'N/A'}</td>
            <td>${badge(r.status || 'Monitoring')}</td>
          `;
          break;
        case 'preparedness':
          cells = `
            <td>${r.planName || 'N/A'}</td>
            <td>${r.disasterType || 'N/A'}</td>
            <td>${fmtDate(r.lastUpdated)}</td>
            <td>${r.coordinator || 'N/A'}</td>
            <td>${r.drillSchedule || 'N/A'}</td>
            <td>${badge(r.status || 'Pending')}</td>
          `;
          break;
        case 'contacts':
          cells = `
            <td>${r.agency || 'N/A'}</td>
            <td>${r.contactPerson || 'N/A'}</td>
            <td>${r.phone || 'N/A'}</td>
            <td>${r.email || 'N/A'}</td>
            <td>${r.type || 'N/A'}</td>
            <td>${badge(r.status || 'Active')}</td>
          `;
          break;
        case 'resources':
          cells = `
            <td>${r.itemName || 'N/A'}</td>
            <td>${r.category || 'N/A'}</td>
            <td>${r.quantity || 0}</td>
            <td>${r.location || 'N/A'}</td>
            <td>${r.condition || 'N/A'}</td>
            <td>${badge(r.status || 'Available')}</td>
          `;
          break;
        default:
          cells = '<td colspan="6">No data</td>';
      }
      
        // Check ownership for edit/delete permissions
        let canEditDelete = isAdmin;
        if (!canEditDelete && user) {
          // For incidents, check reportedBy.username
          if (currentTab === 'incidents') {
            const reporterUsername = typeof r.reportedBy === 'object' 
              ? (r.reportedBy.username || '').toLowerCase()
              : '';
            canEditDelete = reporterUsername === (user.username || '').toLowerCase();
          } else {
            // For other tabs, check createdBy
            const createdBy = typeof r.createdBy === 'object' 
              ? (r.createdBy.username || r.createdBy._id || r.createdBy.id || '')
              : (r.createdBy || '');
            canEditDelete = createdBy === (user._id || user.id || user.username || '');
          }
        }
        
        tr.innerHTML = `
          ${cells}
          <td class="t-actions">
            <div class="table-actions">
              <button class="table-action-btn view" data-act="view" data-id="${r._id}">
                <i class="fas fa-eye"></i>
                <span>View</span>
              </button>
              ${canEditDelete ? '<button class="table-action-btn edit" data-act="edit" data-id="' + r._id + '"><i class="fas fa-edit"></i><span>Edit</span></button>' : ''}
              ${canEditDelete ? '<button class="table-action-btn delete" data-act="del" data-id="' + r._id + '"><i class="fas fa-trash"></i><span>Delete</span></button>' : ''}
            </div>
          </td>
        `;
        tableBody.appendChild(tr);
      });
      
      // Fade in the new content smoothly
      requestAnimationFrame(() => {
        tableBody.style.opacity = '1';
      });
    });
  }

  function renderPager(page, totalPages, total){
    pager.innerHTML = '';
    const info = document.createElement('div');
    info.style.marginRight = 'auto';
    info.textContent = `Total: ${total}`;
    pager.appendChild(info);

    const mk = (t, cb, dis = false) => { 
      const b = document.createElement('button'); 
      b.className = 'px-2.5 py-1.5 rounded-lg border border-input bg-white text-primary-btn font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm'; 
      b.textContent = t; 
      b.disabled = dis; 
      b.onclick = cb; 
      pager.appendChild(b); 
    };
    
    mk('Prev', () => { if(state.page > 1){ state.page--; load(); }}, page <= 1);
    
    for(let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++){
      const b = document.createElement('button'); 
      b.className = `px-2.5 py-1.5 rounded-lg border text-sm font-medium hover:opacity-90 transition-opacity ${i === page ? 'bg-success-btn text-white border-success-btn' : 'border-input bg-white text-primary-btn'}`; 
      b.textContent = i;
      if(i === page){ 
        b.classList.add('bg-success-btn', 'text-white', 'border-success-btn');
        b.classList.remove('bg-white', 'text-primary-btn', 'border-input');
      } else {
        b.classList.add('bg-white', 'text-primary-btn', 'border-input');
        b.classList.remove('bg-success-btn', 'text-white', 'border-success-btn');
      }
      b.onclick = () => { state.page = i; load(); };
      pager.appendChild(b);
    }
    
    mk('Next', () => { if(state.page < totalPages){ state.page++; load(); }}, page >= totalPages);
  }

  // ---- Disaster‑prone areas (for selects / suggestions) ----
  async function loadDisasterAreas() {
    try {
      const res = await fetch('/api/disaster/areas?riskLevel=High');
      const j = await res.json();
      if (!j.ok || !Array.isArray(j.items)) return [];
      return j.items;
    } catch {
      return [];
    }
  }

  // Form content generation
  function updateFormContent() {
    formContent.innerHTML = getFormHTML(currentTab);
    // after injecting fields, apply date min restrictions & dynamic behaviours
    applyDateGuards();
    wireDynamicFields();
  }

  function getFormHTML(tab) {
    const forms = {
      'incidents': getIncidentForm(),
      'coordination': getCoordinationForm(),
      'monitoring': getMonitoringForm(),
      'preparedness': getPreparednessForm(),
      'contacts': getContactsForm(),
      'resources': getResourcesForm()
    };
    return forms[tab] || '<p>Form not available</p>';
  }

  // Event Listeners - setup after DOM is ready
  function setupEventListeners() {
    // Remove old event listeners by cloning elements (for tabs)
    if (tabs && tabs.parentNode) {
      const newTabs = tabs.cloneNode(true);
      tabs.parentNode.replaceChild(newTabs, tabs);
      tabs = newTabs;
      
      tabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.disaster-tab');
        if (!tab) return;
        const tabName = tab.getAttribute('data-tab');
        if (tabName) switchTab(tabName);
      });
    }

    // Query filter and export buttons within content area
    const contentArea = document.querySelector('.content-area');
    const btnFilter = contentArea ? (contentArea.querySelector('#btnFilter') || document.getElementById('btnFilter')) : document.getElementById('btnFilter');
    if (btnFilter) {
      const newBtnFilter = btnFilter.cloneNode(true);
      btnFilter.parentNode.replaceChild(newBtnFilter, btnFilter);
      newBtnFilter.onclick = () => {
        const fFrom = contentArea ? (contentArea.querySelector('#fFrom') || document.getElementById('fFrom')) : document.getElementById('fFrom');
        const fTo = contentArea ? (contentArea.querySelector('#fTo') || document.getElementById('fTo')) : document.getElementById('fTo');
        const fQ = contentArea ? (contentArea.querySelector('#fQ') || document.getElementById('fQ')) : document.getElementById('fQ');
        const fStatus = contentArea ? (contentArea.querySelector('#fStatus') || document.getElementById('fStatus')) : document.getElementById('fStatus');
        const fType = contentArea ? (contentArea.querySelector('#fType') || document.getElementById('fType')) : document.getElementById('fType');
        state.from = fFrom?.value || '';
        state.to = fTo?.value || '';
        state.q = fQ?.value?.trim() || '';
        state.status = fStatus?.value || '';
        state.type = fType?.value || '';
        state.page = 1;
        load();
      };
    }

    // Search on Enter key
    const searchInput = contentArea ? (contentArea.querySelector('#fQ') || document.getElementById('fQ')) : document.getElementById('fQ');
    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (btnFilter) btnFilter.click();
        }
      });
    }

    const btnExport = contentArea ? (contentArea.querySelector('#btnExport') || document.getElementById('btnExport')) : document.getElementById('btnExport');
    if (btnExport) {
      const newBtnExport = btnExport.cloneNode(true);
      btnExport.parentNode.replaceChild(newBtnExport, btnExport);
      newBtnExport.onclick = () => {
        const config = tabConfigs[currentTab];
        const qs = new URLSearchParams({ ...state, exportCsv: 'true' }).toString();
        window.location = config.apiEndpoint + '?' + qs;
      };
    }

    // Query buttons within content area first, then fallback to document-wide search
    // (contentArea already declared above)
    const btnAdd = contentArea ? (contentArea.querySelector('#btnAdd') || document.getElementById('btnAdd')) : document.getElementById('btnAdd');
    if (btnAdd) {
      // Clone to remove old listeners
      const newBtnAdd = btnAdd.cloneNode(true);
      btnAdd.parentNode.replaceChild(newBtnAdd, btnAdd);
      newBtnAdd.onclick = () => {
        console.log('Disaster page: Add button clicked');
        openModal();
      };
      console.log('Disaster page: btnAdd event listener attached');
    } else {
      console.warn('Disaster page: btnAdd not found');
    }

    const btnEmergency = contentArea ? (contentArea.querySelector('#btnEmergency') || document.getElementById('btnEmergency')) : document.getElementById('btnEmergency');
    if (btnEmergency) {
      const newBtnEmergency = btnEmergency.cloneNode(true);
      btnEmergency.parentNode.replaceChild(newBtnEmergency, btnEmergency);
      newBtnEmergency.onclick = () => openModal('emergency');
    }

    const btnIncident = contentArea ? (contentArea.querySelector('#btnIncident') || document.getElementById('btnIncident')) : document.getElementById('btnIncident');
    if (btnIncident) {
      const newBtnIncident = btnIncident.cloneNode(true);
      btnIncident.parentNode.replaceChild(newBtnIncident, btnIncident);
      newBtnIncident.onclick = () => openModal('incident');
    }

    const btnCoordination = contentArea ? (contentArea.querySelector('#btnCoordination') || document.getElementById('btnCoordination')) : document.getElementById('btnCoordination');
    if (btnCoordination) {
      const newBtnCoordination = btnCoordination.cloneNode(true);
      btnCoordination.parentNode.replaceChild(newBtnCoordination, btnCoordination);
      newBtnCoordination.onclick = () => openModal('coordination');
    }

    const btnPreparedness = contentArea ? (contentArea.querySelector('#btnPreparedness') || document.getElementById('btnPreparedness')) : document.getElementById('btnPreparedness');
    if (btnPreparedness) {
      const newBtnPreparedness = btnPreparedness.cloneNode(true);
      btnPreparedness.parentNode.replaceChild(newBtnPreparedness, btnPreparedness);
      newBtnPreparedness.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Switch to preparedness tab (this will call load() internally)
        switchTab('preparedness');
        // Scroll to the tabs section to make it visible after a short delay
        setTimeout(() => {
          const tabsElement = contentArea ? (contentArea.querySelector('#tabs') || document.getElementById('tabs')) : document.getElementById('tabs');
          if (tabsElement) {
            tabsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      };
    }

    const btnCancel = document.getElementById('btnCancel') || $('#btnCancel');
    if (btnCancel) {
      const newBtnCancel = btnCancel.cloneNode(true);
      btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
      newBtnCancel.onclick = () => {
        const modalEl = document.getElementById('modal') || $('#modal');
        if (modalEl) {
          modalEl.classList.remove('open');
          modalEl.classList.add('hidden');
        }
        // Clear edit ID and reset form
        if (frm) {
          frm.reset();
          if (frm.dataset.editId) {
            delete frm.dataset.editId;
          }
          // Reset title
          const config = tabConfigs[currentTab];
          const dlgTitle = document.getElementById('dlgTitle') || $('#dlgTitle');
          if (dlgTitle && config) {
            dlgTitle.textContent = 'Add ' + config.title;
          }
        }
        const msgEl = document.getElementById('msg') || $('#msg');
        if (msgEl) msgEl.textContent = '';
      };
    }

    const btnSave = document.getElementById('btnSave') || $('#btnSave');
    if (btnSave) {
      const newBtnSave = btnSave.cloneNode(true);
      btnSave.parentNode.replaceChild(newBtnSave, btnSave);
      newBtnSave.onclick = async () => {
        if (!frm) return;
        const formData = new FormData(frm);

        if (user) {
          formData.set('createdBy', user._id || user.id || '');
          formData.set('reportedBy', user.name || user.username || '');
        }

        let hasError = false;
        const requiredFields = frm.querySelectorAll('input[required], select[required], textarea[required]');
        requiredFields.forEach(field => {
          const v = (field.type === 'file') ? (field.files && field.files.length ? 'ok' : '') : (formData.get(field.name) || '').toString().trim();
          if (!v) {
            hasError = true;
            field.style.borderColor = '#e74c3c';
          } else {
            field.style.borderColor = '#dfe6e9';
          }
        });

        if (hasError) {
          if (msg) msg.textContent = 'Please fill all required fields.';
          return;
        }

        try {
          const config = tabConfigs[currentTab];
          const editId = frm.dataset.editId;
          const isEdit = !!editId;
          
          // Only incidents tab supports edit for now
          const method = (isEdit && currentTab === 'incidents') ? 'PUT' : 'POST';
          const url = (isEdit && currentTab === 'incidents') ? `${config.apiEndpoint}/${editId}` : config.apiEndpoint;
          
          // For incidents tab, use FormData (for file uploads)
          // For all other tabs, convert to JSON
          let requestBody;
          let requestHeaders = {};
          
          if (currentTab === 'incidents') {
            // Use FormData for incidents (supports file uploads)
            requestBody = formData;
            // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
          } else {
            // Convert FormData to JSON for other tabs
            const jsonData = {};
            for (const [key, value] of formData.entries()) {
              // Skip file inputs (not used in non-incidents tabs)
              const field = frm.querySelector(`[name="${key}"]`);
              if (field && field.type === 'file') {
                continue;
              }
              // Include all form fields (backend will handle empty strings)
              jsonData[key] = value;
            }
            requestBody = JSON.stringify(jsonData);
            requestHeaders['Content-Type'] = 'application/json';
            
            console.log('Disaster page: Submitting JSON data', {
              url,
              method,
              currentTab,
              data: jsonData
            });
          }
          
          const response = await fetch(url, {
            method: method,
            headers: requestHeaders,
            body: requestBody,
            credentials: 'include'
          });
          
          let result;
          try {
            result = await response.json();
          } catch (e) {
            console.error('Failed to parse response:', e);
            if (msg) msg.textContent = 'Server error: Invalid response.';
            return;
          }

          if (response.ok && result.ok) {
            const modalEl = document.getElementById('modal') || $('#modal');
            if (modalEl) {
              modalEl.classList.remove('open');
              modalEl.classList.add('hidden');
            }
            // Clear edit ID
            if (frm.dataset.editId) {
              delete frm.dataset.editId;
            }
            // Reset form
            frm.reset();
            // Update title back to "Add"
            const dlgTitle = document.getElementById('dlgTitle') || $('#dlgTitle');
            if (dlgTitle && config) {
              dlgTitle.textContent = 'Add ' + config.title;
            }
            load();
            const msgEl = document.getElementById('msg') || $('#msg');
            if (msgEl) msgEl.textContent = '';
          } else {
            const msgEl = document.getElementById('msg') || $('#msg');
            const errorMsg = result.message || result.error || `Failed to save record. (${response.status})`;
            if (msgEl) msgEl.textContent = errorMsg;
            console.error('Save failed:', {
              status: response.status,
              statusText: response.statusText,
              result: result
            });
          }
        } catch (error) {
          console.error('Save error:', error);
          const msgEl = document.getElementById('msg') || $('#msg');
          if (msgEl) {
            msgEl.textContent = `Failed to save record: ${error.message || 'Network error'}`;
          }
        }
      };
    }
    
    // Table actions with role-based permissions
    if (tableBody && tableBody.parentNode) {
      // Remove old listener by cloning
      const newTableBody = tableBody.cloneNode(true);
      tableBody.parentNode.replaceChild(newTableBody, tableBody);
      tableBody = newTableBody;
      
      tableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');

        if (act === 'view') {
          try {
            const config = tabConfigs[currentTab];
            if (!config || !config.apiEndpoint) {
              const record = getSampleDataForTab(currentTab).rows.find(r => r._id === id);
              if (record) showRecordDetails(record);
              return;
            }
            
            const response = await fetch(`${config.apiEndpoint}/${id}`, {
              credentials: 'include'
            });
            
            if (!response.ok) {
              const record = getSampleDataForTab(currentTab).rows.find(r => r._id === id);
              if (record) {
                showRecordDetails(record);
              } else {
                alert('Failed to load record details.');
              }
              return;
            }
            
            const result = await response.json();
            if (result.ok && result.row) {
              showRecordDetails(result.row);
            } else {
              const record = getSampleDataForTab(currentTab).rows.find(r => r._id === id);
              if (record) {
                showRecordDetails(record);
              } else {
                alert('Record not found.');
              }
            }
          } catch (error) {
            console.error('View error:', error);
            const record = getSampleDataForTab(currentTab).rows.find(r => r._id === id);
            if (record) {
              showRecordDetails(record);
            } else {
              alert('Error loading record: ' + error.message);
            }
          }
        }

        if (act === 'edit') {
          if (!isAdmin) {
            const record = getSampleDataForTab(currentTab).rows.find(r => r._id === id);
            if (record && record.createdBy !== (user._id || user.id)) {
              alert('You can only edit records that you created.');
              return;
            }
          }
          
          try {
            const config = tabConfigs[currentTab];
            if (!config || !config.apiEndpoint) {
              alert('Cannot edit: No API endpoint configured.');
              return;
            }
            
            if (currentTab !== 'incidents') {
              alert('Edit functionality is currently only available for Incident Reports.');
              return;
            }
            
            const response = await fetch(`${config.apiEndpoint}/${id}`, {
              credentials: 'include'
            });
            
            if (!response.ok) {
              alert('Failed to load record for editing.');
              return;
            }
            
            const result = await response.json();
            if (!result.ok || !result.row) {
              alert('Record not found.');
              return;
            }
            
            const record = result.row;
            frm.dataset.editId = id;
            $('#dlgTitle').textContent = 'Edit ' + (config.title || 'Record');
            updateFormContent();
            
            setTimeout(() => {
              frm.reset();
              const fieldNameMap = {
                'incidentDate': 'incidentDate',
                'dateTime': 'incidentDate',
                'peopleAffected': 'affectedCount'
              };
              
              Object.keys(record).forEach(key => {
                const formFieldName = fieldNameMap[key] || key;
                let field = frm.querySelector(`[name="${formFieldName}"]`);
                if (!field) {
                  field = frm.querySelector(`[name="${key}"]`);
                }
                
                if (field) {
                  if (field.type === 'date') {
                    const dateValue = record[key];
                    if (dateValue) {
                      const d = new Date(dateValue);
                      if (!isNaN(d.getTime())) {
                        field.value = d.toISOString().split('T')[0];
                      }
                    }
                  } else if (field.type === 'datetime-local') {
                    const dateValue = record[key];
                    if (dateValue) {
                      const d = new Date(dateValue);
                      if (!isNaN(d.getTime())) {
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        const hours = String(d.getHours()).padStart(2, '0');
                        const minutes = String(d.getMinutes()).padStart(2, '0');
                        field.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                      }
                    }
                  } else if (field.tagName === 'SELECT') {
                    const value = String(record[key] || '').trim();
                    field.value = value;
                    if (!field.value && value) {
                      const options = Array.from(field.options);
                      const match = options.find(opt => 
                        opt.text.toLowerCase().includes(value.toLowerCase()) ||
                        opt.value.toLowerCase() === value.toLowerCase()
                      );
                      if (match) field.value = match.value;
                    }
                  } else if (field.type === 'checkbox') {
                    field.checked = !!record[key];
                  } else {
                    field.value = record[key] || '';
                  }
                }
              });
              
              const hasPlanSelect = frm.querySelector('#hasPlanSelect');
              const planRow = frm.querySelector('#planUploadRow');
              if (hasPlanSelect) {
                hasPlanSelect.value = record.hasPreparednessPlan ? 'Yes' : 'No';
                if (planRow) {
                  if (record.hasPreparednessPlan) {
                    planRow.classList.remove('hidden');
                  } else {
                    planRow.classList.add('hidden');
                  }
                }
              }
            }, 100);
            
            const modalEl = $('#modal');
            if (modalEl) {
              modalEl.classList.remove('hidden');
              modalEl.classList.add('open');
            }
          } catch (error) {
            console.error('Edit error:', error);
            alert('Error loading record: ' + error.message);
          }
        }

        if (act === 'del') {
          if (!confirm('Delete this record? This action cannot be undone.')) return;
          
          try {
            const config = tabConfigs[currentTab];
            if (!config || !config.apiEndpoint) {
              alert('Cannot delete: No API endpoint configured.');
              return;
            }
            
            if (currentTab !== 'incidents') {
              alert('Delete functionality is currently only available for Incident Reports.');
              return;
            }
            
            if (!isAdmin) {
              const checkResponse = await fetch(`${config.apiEndpoint}/${id}`, {
                credentials: 'include'
              });
              
              if (checkResponse.ok) {
                const checkResult = await checkResponse.json();
                if (checkResult.ok && checkResult.row) {
                  const record = checkResult.row;
                  const reporterUsername = record.reportedBy?.username || '';
                  if (reporterUsername !== (user.username || '').toLowerCase()) {
                    alert('You can only delete records that you created.');
                    return;
                  }
                }
              }
            }
            
            const response = await fetch(`${config.apiEndpoint}/${id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              alert(result.message || 'Failed to delete record.');
              return;
            }
            
            const result = await response.json();
            if (result.ok) {
              alert('Record deleted successfully.');
              load();
              refreshSummary();
            } else {
              alert(result.message || 'Failed to delete record.');
            }
          } catch (error) {
            console.error('Delete error:', error);
            alert('Error deleting record: ' + error.message);
          }
        }
      });
    }
  }

  function openModal(quickType) {
    console.log('Disaster page: openModal called', { quickType });
    const modalEl = document.getElementById('modal');
    const formEl = document.getElementById('frm');
    if (!modalEl) {
      console.error('Disaster page: Modal element not found');
      return;
    }
    if (!formEl) {
      console.error('Disaster page: Form element not found');
      return;
    }
    console.log('Disaster page: Opening modal', { 
      modal: !!modalEl, 
      form: !!formEl,
      modalClasses: modalEl.className,
      modalDisplay: window.getComputedStyle(modalEl).display
    });
    
    formEl.reset();
    // Clear edit ID when opening for new record
    if (formEl.dataset.editId) {
      delete formEl.dataset.editId;
    }
    const msgEl = document.getElementById('msg') || $('#msg');
    if (msgEl) msgEl.textContent = '';
    
    // Determine which tab to switch to
    let targetTab = currentTab;
    if (quickType === 'emergency' || quickType === 'incident') {
      targetTab = 'incidents';
    } else if (quickType === 'coordination') {
      targetTab = 'coordination';
    }
    
    // Switch tab if needed (this will call updateFormContent internally)
    if (targetTab !== currentTab) {
      switchTab(targetTab);
    } else {
      // If not switching tabs, just update form content
      updateFormContent();
    }
    
    const config = tabConfigs[targetTab];
    const dlgTitle = document.getElementById('dlgTitle') || $('#dlgTitle');
    if (dlgTitle && config) {
      dlgTitle.textContent = 'Add ' + config.title;
    }
    
    // Open modal immediately (don't wait for form content update)
    // Verify modal is still in DOM
    const currentModal = document.getElementById('modal');
    if (!currentModal) {
      console.error('Disaster page: Modal was removed from DOM');
      return;
    }
    
    // Open the modal now
    currentModal.classList.remove('hidden');
    currentModal.classList.add('open');
    // Remove any inline display styles that might override CSS
    currentModal.style.removeProperty('display');
    
    // Force a reflow to ensure CSS is applied
    void currentModal.offsetHeight;
    
    // Verify it's visible
    const computedDisplay = window.getComputedStyle(currentModal).display;
    if (computedDisplay === 'none') {
      console.warn('Disaster page: Modal display is still none, forcing flex');
      currentModal.style.display = 'flex';
    }
    
    console.log('Disaster page: Modal opened', {
      hasOpen: currentModal.classList.contains('open'),
      hasHidden: currentModal.classList.contains('hidden'),
      inlineDisplay: currentModal.style.display,
      computedDisplay: computedDisplay,
      zIndex: window.getComputedStyle(currentModal).zIndex,
      isInBody: document.body.contains(currentModal)
    });
    
    // Wait a bit for form content to update (especially if tab was switched)
    setTimeout(() => {
      // Set emergency priority if this is an emergency report
      if (quickType === 'emergency') {
        const priorityField = formEl.querySelector('[name="priority"]');
        if (priorityField) {
          priorityField.value = 'HIGH';
        }
      }
    }, 100);
  }

  function showRecordDetails(record) {
    dRecordId.textContent = getRecordTitle(record);
    const statusMap = {
      'Resolved': 'bg-resolved',
      'Ongoing': 'bg-ongoing',
      'Pending': 'bg-pending',
      'Critical': 'bg-critical',
      'Completed': 'bg-completed',
      'Upcoming': 'bg-upcoming',
      'Monitoring': 'bg-monitoring',
      'Reported': 'bg-reported',
      'Active': 'bg-ongoing',
      'Available': 'bg-resolved'
    };
    const status = record.status || 'Pending';
    dStatus.className = 'badge ' + (statusMap[status] || 'bg-pending');
    dStatus.textContent = status;

    // Handle reportedBy - can be object or string
    const reportedByName = typeof record.reportedBy === 'object' 
      ? (record.reportedBy.name || record.reportedBy.username || '')
      : (record.reportedBy || record.reporterName || '');
    const reportedByUsername = typeof record.reportedBy === 'object' 
      ? (record.reportedBy.username || '')
      : '';
    
    // Check if user can edit/delete
    const canEditDelete = isAdmin || 
      (reportedByUsername && reportedByUsername.toLowerCase() === (user.username || '').toLowerCase()) ||
      (record.createdBy && (record.createdBy === (user._id || user.id) || 
       (typeof record.createdBy === 'object' && record.createdBy.username && 
        record.createdBy.username.toLowerCase() === (user.username || '').toLowerCase())));
    
    const ownershipInfo = reportedByName ? `
      <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Reported By</div><div class="font-semibold text-[#2c3e50]"><strong>${reportedByName}</strong></div></div>
      <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Can Edit/Delete</div><div class="text-[#2c3e50]">${canEditDelete ? 'Yes' : 'No'}</div></div>
      <hr class="my-3 border-none border-t border-[#ecf0f1]">
    ` : '';

    dBody.innerHTML = ownershipInfo + getRecordDetailsHTML(record);

    drawer.classList.remove('hidden');
  }

  function getRecordTitle(record) {
    switch(currentTab) {
      case 'incidents': return `Incident #${record._id} - ${record.type}`;
      case 'coordination': return `Coordination #${record._id}`;
      case 'monitoring': return `Monitoring - ${record.area}`;
      case 'preparedness': return record.planName;
      case 'contacts': return record.agency;
      case 'resources': return record.itemName;
      default: return `Record #${record._id}`;
    }
  }

  function getRecordDetailsHTML(record) {
    switch(currentTab) {
      case 'incidents':
        const peopleAffected = record.peopleAffected || 
          (record.affectedCount ? `${record.affectedCount} ${record.affectedCount === 1 ? 'person' : 'people'}` : 'N/A');
        const incidentDate = record.incidentDate || record.dateTime;
        const typeDisplay = record.type + (record.type === 'Others' && record.typeOther ? ` - ${record.typeOther}` : '');
        return `
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Type</div><div class="text-[#2c3e50]">${typeDisplay || 'N/A'}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Location</div><div class="text-[#2c3e50]">${record.location || 'N/A'}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Date</div><div class="text-[#2c3e50]">${fmt(incidentDate)}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">People Affected</div><div class="text-[#2c3e50]">${peopleAffected}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Priority</div><div class="text-[#2c3e50]"><span class="${record.priority?.toLowerCase() === 'high' || record.priority === 'HIGH' ? 'text-[#e74c3c] font-bold' : record.priority?.toLowerCase() === 'medium' || record.priority === 'MEDIUM' ? 'text-[#f39c12] font-semibold' : 'text-[#3498db]'}">${record.priority || 'Medium'}</span></div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Description</div><div class="text-[#2c3e50]">${record.description || 'N/A'}</div></div>
          ${record.casualties !== undefined ? `<div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Casualties</div><div class="text-[#2c3e50]">${record.casualties || 0}</div></div>` : ''}
          ${record.injuries !== undefined ? `<div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Injuries</div><div class="text-[#2c3e50]">${record.injuries || 0}</div></div>` : ''}
          ${record.responseTimeMinutes !== undefined && record.responseTimeMinutes !== null ? `<div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Response Time</div><div class="text-[#2c3e50]">${record.responseTimeMinutes} minutes</div></div>` : ''}
        `;
      case 'coordination':
        return `
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Agency</div><div class="text-[#2c3e50]">${record.agency}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Contact Person</div><div class="text-[#2c3e50]">${record.contactPerson}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Phone</div><div class="text-[#2c3e50]">${record.contactNumber}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Date</div><div>${fmt(record.coordinationDate)}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Action Taken</div><div class="text-[#2c3e50]">${record.actionTaken}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Resources</div><div class="text-[#2c3e50]">${record.resourcesDeployed}</div></div>
        `;
      case 'monitoring':
        return `
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Area/Zone</div><div class="text-[#2c3e50]">${record.area}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Risk Level</div><div class="text-[#2c3e50]"><span class="${record.riskLevel?.toLowerCase() === 'high' ? 'text-[#e74c3c] font-bold' : record.riskLevel?.toLowerCase() === 'medium' ? 'text-[#f39c12] font-semibold' : 'text-[#3498db]'}">${record.riskLevel}</span></div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Population</div><div class="text-[#2c3e50]">${record.population}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Last Assessed</div><div class="text-[#2c3e50]">${fmtDate(record.lastAssessed)}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Vulnerabilities</div><div class="text-[#2c3e50]">${record.vulnerabilities}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Notes</div><div class="text-[#2c3e50]">${record.notes || 'N/A'}</div></div>
        `;
      case 'preparedness':
        return `
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Plan Name</div><div class="text-[#2c3e50]">${record.planName}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Disaster Type</div><div class="text-[#2c3e50]">${record.disasterType}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Coordinator</div><div class="text-[#2c3e50]">${record.coordinator}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Last Updated</div><div>${fmtDate(record.lastUpdated)}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Drill Schedule</div><div class="text-[#2c3e50]">${record.drillSchedule}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Next Drill</div><div>${fmtDate(record.nextDrill)}</div></div>
        `;
      case 'contacts':
        return `
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Agency</div><div class="text-[#2c3e50]">${record.agency}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Contact Person</div><div class="text-[#2c3e50]">${record.contactPerson}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Phone</div><div class="text-[#2c3e50]">${record.phone}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Email</div><div class="text-[#2c3e50]">${record.email}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Type</div><div class="text-[#2c3e50]">${record.type}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Address</div><div class="text-[#2c3e50]">${record.address || 'N/A'}</div></div>
        `;
      case 'resources':
        return `
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Item Name</div><div class="text-[#2c3e50]">${record.itemName}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Category</div><div class="text-[#2c3e50]">${record.category}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Quantity</div><div class="text-[#2c3e50]">${record.quantity}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Location</div><div class="text-[#2c3e50]">${record.location}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Condition</div><div class="text-[#2c3e50]">${record.condition}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Serial Number</div><div class="text-[#2c3e50]">${record.serialNumber || 'N/A'}</div></div>
          <div class="grid grid-cols-[140px_1fr] gap-2 mb-2"><div class="text-sm text-[#7f8c8d]">Last Maintenance</div><div>${fmtDate(record.lastMaintenance)}</div></div>
        `;
      default:
        return '<p>Details not available</p>';
    }
  }

  // Initialize
  let initRetryCount = 0;
  const MAX_INIT_RETRIES = 10;
  let initTimeoutId = null;
  
  async function init() {
    // Clear any pending retries
    if (initTimeoutId) {
      clearTimeout(initTimeoutId);
      initTimeoutId = null;
    }
    
    // Check if we're still on the disaster page
    const currentPath = window.location.pathname.toLowerCase();
    if (!currentPath.includes('disaster')) {
      console.log('Disaster page: No longer on disaster page, aborting init');
      return;
    }
    
    // Small delay to ensure DOM is ready (especially important for SPA navigation)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Re-query all DOM elements (they may have been removed/replaced during navigation)
    // Query within content-area to ensure we're getting the right elements
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Disaster page: Content area not found, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Disaster page: Content area not found after max retries');
        return;
      }
    }
    
    // Verify content area has content (not just empty)
    if (!contentArea.innerHTML || contentArea.innerHTML.trim().length < 100) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Disaster page: Content area is empty, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Disaster page: Content area is empty after max retries');
        return;
      }
    }
    
    tableHead = contentArea.querySelector('#tableHead') || $('#tableHead');
    tableBody = contentArea.querySelector('#tableBody') || $('#tableBody');
    pager = contentArea.querySelector('#pager') || $('#pager');
    modal = document.getElementById('modal') || $('#modal');
    frm = document.getElementById('frm') || $('#frm');
    msg = document.getElementById('msg') || $('#msg');
    formContent = document.getElementById('formContent') || $('#formContent');
    tabs = contentArea.querySelector('#tabs') || $('#tabs');
    
    drawer = document.getElementById('drawer') || $('#drawer');
    dBody = document.getElementById('dBody') || $('#dBody');
    dClose = document.getElementById('dClose') || $('#dClose');
    dRecordId = document.getElementById('dRecordId') || $('#dRecordId');
    dStatus = document.getElementById('dStatus') || $('#dStatus');
    announcementsSection = contentArea.querySelector('#announcementsSection') || $('#announcementsSection');
    
    // Check if critical elements exist
    if (!tableHead || !tableBody || !tabs) {
      if (initRetryCount < MAX_INIT_RETRIES) {
        initRetryCount++;
        console.warn('Disaster page: Critical DOM elements not found, retrying...', initRetryCount);
        initTimeoutId = setTimeout(init, 150);
        return;
      } else {
        console.error('Disaster page: Critical DOM elements not found after max retries');
        return;
      }
    }
    
    // Reset retry count on success
    initRetryCount = 0;
    initTimeoutId = null;
    
    // Reset loading state
    isLoading = false;
    
    // Reset state to defaults
    state = { 
      page: 1, 
      limit: 10, 
      status: '', 
      type: '',
      q: '', 
      from: '', 
      to: '', 
      sort: 'desc' 
    };
    
    await initUser();
    
    // Setup all event listeners (re-attach them)
    setupEventListeners();
    
    // Setup drawer close handlers with null checks (after DOM is ready)
    if (dClose) {
      dClose.onclick = () => {
        if (drawer) {
          drawer.classList.add('hidden');
        }
      };
    }
    
    // Setup overlay click handler (the backdrop)
    if (drawer) {
      const overlay = drawer.querySelector('.drawer-backdrop');
      if (overlay) {
        overlay.onclick = () => {
          drawer.classList.add('hidden');
        };
      }
    }
    
    renderAnnouncements();
    
    // Reset to default tab and reload data
    // Ensure table elements are ready before switching tabs
    if (tableHead && tableBody) {
      currentTab = 'incidents';
      switchTab('incidents');
    } else {
      console.warn('Disaster page: Table elements not ready, delaying switchTab');
      setTimeout(() => {
        if (tableHead && tableBody) {
          currentTab = 'incidents';
          switchTab('incidents');
        } else {
          console.error('Disaster page: Table elements still not ready after delay');
        }
      }, 200);
    }
    
    // Delay summary refresh to ensure DOM elements are ready
    setTimeout(() => {
      refreshSummary();
    }, 100);
  }

  // Expose init function for router
  window.initDisaster = init;

  // Auto-initialize ONLY for direct page loads (not SPA navigation)
  // Check if router is active - if so, don't auto-init (router will call initDisaster)
  const isSPAMode = window.__ROUTER_INITIALIZED__ || window.location.pathname.includes('/admin/') || window.location.pathname.includes('/user/');
  
  if (!isSPAMode) {
    // Direct page load (not via router)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 50);
    }
  } else {
    // SPA mode - router will call initDisaster, don't auto-init
    console.log('Disaster page: SPA mode detected, waiting for router to call initDisaster');
  }

  // Form HTML functions
  function getIncidentForm() {
    return `
      <div class="form-section">
        <h4>Incident Information</h4>
        <div class="form-grid">
          <div><label>Incident Type *</label><select name="type" required>
            <option value="">Select Type</option>
            <option value="Fire">Fire Incident</option>
            <option value="Flooding">Flooding</option>
            <option value="Earthquake">Earthquake</option>
            <option value="Typhoon">Typhoon</option>
            <option value="Landslide">Landslide</option>
            <option value="Accident">Vehicular Accident</option>
            <option value="Medical">Medical Emergency</option>
            <option value="Power Outage">Power Outage</option>
            <option value="Chemical Spill">Chemical Spill</option>
            <option value="Others">Others</option>
          </select></div>
          <div class="full"><label>If Others, please specify</label><input name="typeOther" placeholder="Please specify the incident type"></div>
          <div><label>Date & Time *</label><input type="datetime-local" name="incidentDate" required data-future-only="true"></div>
          <div class="full">
            <label>Location *</label>
            <input name="location" required placeholder="Specific address or landmark">
            <small class="text-xs text-[#7f8c8d] block mt-1">Tip: choose from nearby disaster-prone areas to auto-fill.</small>
          </div>
          <div><label>Number of People Affected *</label><input type="number" name="affectedCount" required min="0"></div>
          <div><label>Priority Level *</label><select name="priority" required>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="Critical">Critical</option>
          </select></div>
          <div class="full"><label>Description *</label><textarea name="description" required rows="4" placeholder="Detailed description of the incident..."></textarea></div>
          <div><label>Casualties</label><input type="number" name="casualties" min="0"></div>
          <div><label>Injuries</label><input type="number" name="injuries" min="0"></div>
          <div><label>Status</label><select name="status">
            <option value="Pending">Pending</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Resolved">Resolved</option>
          </select></div>
          <div class="full"><label>Do you have a disaster preparedness plan?</label>
            <select name="hasPlan" id="hasPlanSelect">
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
          <div class="full hidden" id="planUploadRow">
            <label>Upload Preparedness Plan (PDF/Doc/Image)</label>
            <input type="file" name="planFile" accept=".pdf,.doc,.docx,image/*">
          </div>
        </div>
      </div>
    `;
  }

  function getCoordinationForm() {
    return `
      <div class="form-section">
        <h4>Response & Coordination Details</h4>
        <div class="form-grid">
          <div><label>Date *</label><input type="date" name="coordinationDate" required></div>
          <div><label>Agency/Organization *</label><input name="agency" required placeholder="e.g., BFP, PNP, CDRRMO"></div>
          <div><label>Contact Person *</label><input name="contactPerson" required></div>
          <div><label>Contact Number *</label><input name="contactNumber" required placeholder="09XXXXXXXXX"></div>
          <div class="full"><label>Action Taken *</label><textarea name="actionTaken" required rows="3" placeholder="Describe the response actions..."></textarea></div>
          <div class="full"><label>Resources Deployed *</label><textarea name="resourcesDeployed" required rows="3" placeholder="List equipment, personnel, vehicles..."></textarea></div>
          <div><label>Response Time (minutes)</label><input type="number" name="responseTime" min="0"></div>
          <div><label>Status</label><select name="status">
            <option value="Upcoming">Upcoming</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Completed">Completed</option>
          </select></div>
          <div class="full"><label>Notes</label><textarea name="notes" rows="2" placeholder="Additional notes or observations..."></textarea></div>
        </div>
      </div>
    `;
  }

  function getMonitoringForm() {
    return `
      <div class="form-section">
        <h4>Area Monitoring Information</h4>
        <div class="form-grid">
          <div><label>Area/Zone Name *</label><input name="area" required placeholder="e.g., Valle Verde - Zone 1"></div>
          <div><label>Risk Level *</label><select name="riskLevel" required>
            <option value="">Select Risk Level</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select></div>
          <div><label>Population *</label><input type="number" name="population" required min="0"></div>
          <div><label>Last Assessment Date *</label><input type="date" name="lastAssessed" required></div>
          <div class="full"><label>Vulnerabilities *</label><textarea name="vulnerabilities" required rows="3" placeholder="List potential hazards and vulnerabilities..."></textarea></div>
          <div class="full"><label>Mitigation Measures</label><textarea name="mitigationMeasures" rows="3" placeholder="List implemented or planned mitigation measures..."></textarea></div>
          <div><label>Evacuation Site</label><input name="evacuationSite" placeholder="Nearest evacuation center"></div>
          <div><label>Status</label><select name="status">
            <option value="Monitoring">Monitoring</option>
            <option value="Critical">Critical</option>
            <option value="Under Assessment">Under Assessment</option>
          </select></div>
          <div class="full"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
        </div>
      </div>
    `;
  }

  function getPreparednessForm() {
    return `
      <div class="form-section">
        <h4>Disaster Preparedness Plan</h4>
        <div class="form-grid">
          <div class="full"><label>Plan Name *</label><input name="planName" required placeholder="e.g., Flood Response Plan 2025"></div>
          <div><label>Disaster Type *</label><select name="disasterType" required>
            <option value="">Select Type</option>
            <option value="Fire">Fire</option>
            <option value="Flooding">Flooding</option>
            <option value="Earthquake">Earthquake</option>
            <option value="Typhoon">Typhoon</option>
            <option value="Landslide">Landslide</option>
            <option value="Medical Emergency">Medical Emergency</option>
            <option value="Chemical Hazard">Chemical Hazard</option>
          </select></div>
          <div><label>Last Updated *</label><input type="date" name="lastUpdated" required></div>
          <div><label>Coordinator *</label><input name="coordinator" required placeholder="Officer-in-charge"></div>
          <div><label>Contact Number *</label><input name="contactNumber" required placeholder="09XXXXXXXXX"></div>
          <div><label>Drill Schedule *</label><select name="drillSchedule" required>
            <option value="">Select Schedule</option>
            <option value="Monthly">Monthly</option>
            <option value="Quarterly">Quarterly</option>
            <option value="Semi-Annual">Semi-Annual</option>
            <option value="Annually">Annually</option>
          </select></div>
          <div><label>Next Drill Date</label><input type="date" name="nextDrill"></div>
          <div><label>Status</label><select name="status">
            <option value="Active">Active</option>
            <option value="Pending">Pending Approval</option>
            <option value="Under Review">Under Review</option>
          </select></div>
          <div class="full"><label>Objectives</label><textarea name="objectives" rows="3" placeholder="Key objectives of this plan..."></textarea></div>
          <div class="full"><label>Key Actions</label><textarea name="keyActions" rows="4" placeholder="List of key actions and procedures..."></textarea></div>
        </div>
      </div>
    `;
  }

  function getContactsForm() {
    return `
      <div class="form-section">
        <h4>Emergency Contact Information</h4>
        <div class="form-grid">
          <div class="full"><label>Agency/Organization *</label><input name="agency" required placeholder="e.g., Bureau of Fire Protection"></div>
          <div><label>Contact Person *</label><input name="contactPerson" required></div>
          <div><label>Position/Title</label><input name="position" placeholder="e.g., Fire Marshal"></div>
          <div><label>Phone Number *</label><input name="phone" required placeholder="09XXXXXXXXX or Hotline"></div>
          <div><label>Email Address</label><input type="email" name="email" placeholder="email@agency.gov.ph"></div>
          <div><label>Contact Type *</label><select name="type" required>
            <option value="">Select Type</option>
            <option value="Fire Response">Fire Response</option>
            <option value="Law Enforcement">Law Enforcement</option>
            <option value="Medical Emergency">Medical Emergency</option>
            <option value="Disaster Management">Disaster Management</option>
            <option value="Relief Operations">Relief Operations</option>
            <option value="Power Emergency">Power Emergency</option>
            <option value="Other">Other</option>
          </select></div>
          <div class="full"><label>Address</label><input name="address" placeholder="Office location"></div>
          <div><label>Available Hours</label><input name="availableHours" placeholder="e.g., 24/7, 8AM-5PM"></div>
          <div><label>Status</label><select name="status">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select></div>
          <div class="full"><label>Additional Notes</label><textarea name="notes" rows="2"></textarea></div>
        </div>
      </div>
    `;
  }

  function getResourcesForm() {
    return `
      <div class="form-section">
        <h4>Resource & Equipment Details</h4>
        <div class="form-grid">
          <div><label>Item Name *</label><input name="itemName" required placeholder="e.g., Rescue Boat"></div>
          <div><label>Category *</label><select name="category" required>
            <option value="">Select Category</option>
            <option value="Equipment">Equipment</option>
            <option value="Medical">Medical Supplies</option>
            <option value="Communication">Communication</option>
            <option value="Transportation">Transportation</option>
            <option value="Supplies">Relief Supplies</option>
            <option value="Tools">Tools</option>
          </select></div>
          <div><label>Quantity *</label><input type="number" name="quantity" required min="1"></div>
          <div><label>Unit of Measure</label><input name="unit" placeholder="e.g., pcs, boxes, kg"></div>
          <div class="full"><label>Location *</label><input name="location" required placeholder="Storage location"></div>
          <div><label>Condition *</label><select name="condition" required>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Needs Repair">Needs Repair</option>
          </select></div>
          <div><label>Status</label><select name="status">
            <option value="Available">Available</option>
            <option value="In Use">In Use</option>
            <option value="Under Maintenance">Under Maintenance</option>
            <option value="Out of Stock">Out of Stock</option>
          </select></div>
          <div><label>Serial Number</label><input name="serialNumber" placeholder="If applicable"></div>
          <div><label>Last Maintenance</label><input type="date" name="lastMaintenance"></div>
          <div><label>Acquisition Date</label><input type="date" name="acquisitionDate"></div>
          <div><label>Cost (PHP)</label><input type="number" name="cost" min="0" step="0.01"></div>
          <div class="full"><label>Description</label><textarea name="description" rows="2" placeholder="Additional details about the item..."></textarea></div>
        </div>
      </div>
    `;
  }

  // Dynamic behaviours: min dates, plan upload toggle, disaster areas helper
  function applyDateGuards() {
    const inputs = frm.querySelectorAll('input[type="date"][data-future-only="true"], input[type="datetime-local"][data-future-only="true"]');
    if (!inputs.length) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const dateTimeStr = `${dateStr}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    inputs.forEach(inp => {
      if (inp.type === 'date') inp.min = dateStr;
      if (inp.type === 'datetime-local') inp.min = dateTimeStr;
    });
  }

  function wireDynamicFields() {
    const hasPlanSelect = frm.querySelector('#hasPlanSelect');
    const planRow = frm.querySelector('#planUploadRow');
    if (hasPlanSelect && planRow) {
      hasPlanSelect.onchange = () => {
        if (hasPlanSelect.value === 'Yes') {
          planRow.classList.remove('hidden');
        } else {
          planRow.classList.add('hidden');
          const fileInput = planRow.querySelector('input[type="file"]');
          if (fileInput) fileInput.value = '';
        }
      };
    }

    // Load disaster-prone areas and show as simple helper list under location when available
    const locationInput = frm.querySelector('input[name="location"]');
    if (locationInput) {
      loadDisasterAreas().then(areas => {
        if (!areas.length) return;
        const listId = 'disasterAreasList';
        let dataList = document.getElementById(listId);
        if (!dataList) {
          dataList = document.createElement('datalist');
          dataList.id = listId;
          document.body.appendChild(dataList);
        }
        dataList.innerHTML = areas.map(a => `<option value="${a.area || ''}">${(a.area || '')} (${a.riskLevel || 'Risk'})</option>`).join('');
        locationInput.setAttribute('list', listId);
      }).catch(() => {});
    }
  }


})();