// /public/document-permits.js
(() => {
  "use strict";

  /* ---- local helpers (no globals; won't clash with base.js) ---- */
  const $id = (id) => document.getElementById(id);
  const q = (sel, root = document) => root.querySelector(sel);
  const on = (el, evt, fn, opt) => el && el.addEventListener(evt, fn, opt);

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json", ...(opts.headers || {}) },
      ...opts,
    });

    if (res.redirected) {
      // if session expired you'll be redirected to /login
      location.href = res.url;
      return Promise.reject(new Error("Redirected to login"));
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();

    if (!res.ok) {
      // Try to parse as JSON first
      let errorMessage = res.statusText;
      try {
        const json = JSON.parse(text);
        errorMessage = json.message || json.error || errorMessage;
      } catch {
        // If not JSON, check if it's HTML and extract a meaningful message
        if (ct.includes("text/html") || text.trim().startsWith("<!")) {
          if (res.status === 404) {
            errorMessage = "API endpoint not found. Please check if the server is running correctly.";
          } else if (res.status === 500) {
            errorMessage = "Server error. Please try again later.";
          } else {
            errorMessage = `Request failed with status ${res.status}`;
          }
        } else {
          // Try to extract a short error message from text
          const shortText = text.length > 100 ? text.substring(0, 100) + "..." : text;
          errorMessage = shortText || errorMessage;
        }
      }
      const error = new Error(errorMessage);
      error.status = res.status;
      throw error;
    }
    if (!ct.includes("application/json")) {
      throw new Error("Server returned non-JSON response. Please check the API endpoint.");
    }
    return JSON.parse(text);
  }

  /* ---- state ---- */
  let ALL = [];
  let VIEW = [];
  let isAdmin = false;
  let currentUser = null;
  let searchTimeout = null;
  let selectedResident = null;

  /* ---- small render utils ---- */
  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
  const badge = (s) => {
    const map = { Released: "b-yes", Pending: "b-no", "Pick-up Ready": "b-info", Declined: "b-no" };
    return `<span class="badge ${map[s] || "b-info"}">${s || "Pending"}</span>`;
  };

  /* ---- loading skeleton ---- */
  function showLoading() {
    const tb = $id("reqTbody");
    if (!tb) return;
    
    // Add loading class to table wrapper
    const tableWrap = tb.closest('.table-wrap');
    if (tableWrap) {
      tableWrap.classList.add('table-loading');
    }
    
    // Clear existing rows
    tb.innerHTML = '';
    
    // Create 5 skeleton rows (8 columns: checkbox, Name, Copies, Type, Date Requested, Date Released, Status, Actions)
    const colCount = 8;
    const widths = ['short', 'long', 'short', 'long', 'long', 'long', 'short', 'short'];
    
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement('tr');
      tr.className = 'table-skeleton';
      let skeletonCells = '';
      
      for (let j = 0; j < colCount; j++) {
        const width = widths[j] || 'long';
        skeletonCells += `<td><div class="skeleton-bar ${width}"></div></td>`;
      }
      
      tr.innerHTML = skeletonCells;
      tb.appendChild(tr);
    }
  }

  /* ---- table render ---- */
  function renderRows(rows) {
    const tb = $id("reqTbody");
    if (!tb) return;
    
    // Remove loading class
    const tableWrap = tb.closest('.table-wrap');
    if (tableWrap) {
      tableWrap.classList.remove('table-loading');
    }
    
    tb.innerHTML = "";

    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem 1rem;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:0.5rem;color:#777;">
          <div style="font-size:3rem;opacity:0.5;color:#9ca3af;"><i class="fas fa-clipboard-list"></i></div>
          <div style="font-weight:500;color:#666;">No document requests found.</div>
          <div style="font-size:0.875rem;color:#999;">Click "+ Add New" to create a document request.</div>
        </div>
      </td></tr>`;
      return;
    }

    rows.forEach((d) => {
      const tr = document.createElement("tr");
      // Check if this document belongs to the current user (for non-admins)
      const isOwner = !isAdmin && (d.requesterName?.toLowerCase() === currentUser?.name?.toLowerCase() || 
                                   d.requesterUsername?.toLowerCase() === currentUser?.username?.toLowerCase());
      const canManage = isAdmin || isOwner;
      
      tr.innerHTML = `
        ${isAdmin ? `<td><input type="checkbox" class="rowCheck" data-id="${d._id}"></td>` : '<td></td>'}
        <td>${d.requesterName || "—"}</td>
        <td>${d.numberOfCopies ?? 1}</td>
        <td>${d.typeOfDocument || "—"}</td>
        <td>${fmt(d.dateRequested)}</td>
        <td>${fmt(d.dateReleased)}</td>
        <td>${badge(d.status)}</td>
        <td class="t-actions">
          ${isAdmin ? `
          <button class="kebab" aria-label="Actions" data-id="${d._id}">⋮</button>
          <div class="menu">
            <div class="mi" data-act="edit">Edit this Request</div>
            <div class="mi" data-act="status">Change Status</div>
            <div class="mi" data-act="delete">Delete this Request</div>
          </div>
          ` : '<span style="color:#999;">—</span>'}
        </td>
      `;
      tb.appendChild(tr);
    });

    // kebab menus
    tb.querySelectorAll(".kebab").forEach((btn) => {
      const holder = btn.parentElement.querySelector(".menu");
      on(btn, "click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
        holder.classList.add("open");
      });
      on(holder, "click", (e) => {
        e.stopPropagation();
        const act = e.target.getAttribute("data-act");
        const id = btn.getAttribute("data-id");
        holder.classList.remove("open");
        if (act === "edit") openFormForEdit(id);
        if (act === "status") openStatus(id);
        if (act === "delete") askDelete(id);
      });
    });

    // close all menus when clicking elsewhere
    on(document, "click", () => {
      document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
    });
  }

  /* ---- loading data ---- */
  async function loadDocs() {
    // Show loading state
    showLoading();

    try {
      // Fetch data (removed artificial delay for better performance)
      const data = await fetchJSON("/api/documents");
      
      ALL = data.documents || [];
      VIEW = [...ALL];
      renderRows(VIEW);
    } catch (e) {
      console.warn("[loadDocs]", e);
      
      // Remove loading class on error
      const tb = $id("reqTbody");
      const tableWrap = tb?.closest('.table-wrap');
      if (tableWrap) {
        tableWrap.classList.remove('table-loading');
      }
      
      if (tb) {
        tb.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem 1rem;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:0.5rem;color:#888;">
            <div style="font-size:3rem;opacity:0.5;color:#9ca3af;"><i class="fas fa-file-alt"></i></div>
            <div style="font-weight:500;color:#666;">Unable to load data.</div>
            <div style="font-size:0.875rem;color:#999;">Please refresh the page or contact support if the issue persists.</div>
          </div>
        </td></tr>`;
      }
    }
  }

  /* ---- search ---- */
  on($id("searchInput"), "input", (e) => {
    const qv = (e.target.value || "").toLowerCase();
    VIEW = ALL.filter(
      (d) =>
        (d.requesterName || "").toLowerCase().includes(qv) ||
        (d.typeOfDocument || "").toLowerCase().includes(qv) ||
        (d.purpose || "").toLowerCase().includes(qv)
    );
    renderRows(VIEW);
  });

  /* ---- select all + bulk release ---- */
  on($id("checkAll"), "change", (e) => {
    document.querySelectorAll(".rowCheck").forEach((c) => (c.checked = e.target.checked));
  });

  on($id("bulkReleasedBtn"), "click", async () => {
    const ids = [...document.querySelectorAll(".rowCheck:checked")].map((c) => c.getAttribute("data-id"));
    if (!ids.length) return alert("Select rows first");

    try {
      const r = await fetchJSON("/api/documents/bulk-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (r.ok) {
        alert("Updated to Released");
        loadDocs();
      }
    } catch {
      alert("Update failed");
    }
  });

  /* ---- resident search functionality ---- */
  async function searchResidents(query) {
    if (!query || query.trim().length < 2) {
      const dropdown = $id("residentDropdown");
      if (dropdown) dropdown.style.display = "none";
      return;
    }

    try {
      const j = await fetchJSON(`/api/residents/search?q=${encodeURIComponent(query)}`);
      const residents = j.residents || [];
      displayResidentDropdown(residents);
    } catch (e) {
      console.error("Search error:", e);
      const dropdown = $id("residentDropdown");
      if (dropdown) dropdown.style.display = "none";
    }
  }

  function displayResidentDropdown(residents) {
    const dropdown = $id("residentDropdown");
    if (!dropdown) return;
    
    if (!residents.length) {
      dropdown.innerHTML = '<div style="padding:12px;font-size:0.875rem;color:#666;">No residents found</div>';
      dropdown.style.display = "block";
      return;
    }

    dropdown.innerHTML = residents.map(r => `
      <div style="padding:12px;cursor:pointer;border-bottom:1px solid #eee;transition:background 0.2s;" 
           onmouseover="this.style.background='#f0f7ff'" 
           onmouseout="this.style.background='white'"
           data-resident-id="${r._id}" 
           data-resident-name="${(r.name || '').replace(/"/g, '&quot;')}" 
           data-resident-address="${(r.address || '').replace(/"/g, '&quot;')}"
           data-resident-id-string="${(r.residentId || '').replace(/"/g, '&quot;')}">
        <div style="font-weight:600;color:#333;">${r.name || '—'}</div>
        <div style="font-size:0.75rem;color:#666;margin-top:2px;">ID: ${r.residentId || '—'} • ${r.address || 'No address'}</div>
      </div>
    `).join('');

    // Add click handlers
    dropdown.querySelectorAll('[data-resident-id]').forEach(el => {
      el.addEventListener('click', () => {
        const residentId = el.getAttribute('data-resident-id');
        const residentName = el.getAttribute('data-resident-name');
        const residentAddress = el.getAttribute('data-resident-address');
        const residentIdString = el.getAttribute('data-resident-id-string');
        selectResident({
          _id: residentId,
          name: residentName,
          address: residentAddress,
          residentId: residentIdString
        });
      });
    });

    dropdown.style.display = "block";
  }

  function selectResident(resident) {
    selectedResident = resident;
    const residentIdInput = $id("selectedResidentId");
    const residentSearchInput = $id("residentSearch");
    const requesterNameInput = $id("requesterName");
    const addressInput = $id("address");
    const dropdown = $id("residentDropdown");
    
    if (residentIdInput) residentIdInput.value = resident._id;
    if (residentSearchInput) residentSearchInput.value = `${resident.name} (${resident.residentId || 'ID: N/A'})`;
    if (requesterNameInput) requesterNameInput.value = resident.name || "";
    if (addressInput) addressInput.value = resident.address || "";
    if (dropdown) dropdown.style.display = "none";
  }

  function setupResidentSearch() {
    const residentSearchInput = $id("residentSearch");
    if (!residentSearchInput) return;

    on(residentSearchInput, "input", (e) => {
      const query = e.target.value.trim();
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => searchResidents(query), 300);
    });

    on(residentSearchInput, "focus", () => {
      if (residentSearchInput.value.trim().length >= 2) {
        searchResidents(residentSearchInput.value.trim());
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      const dropdown = $id("residentDropdown");
      if (dropdown && !e.target.closest("#residentSearch") && !e.target.closest("#residentDropdown")) {
        dropdown.style.display = "none";
      }
    });
  }

  /* ---- modals ---- */
  const formModal = $id("formModal");
  const statusModal = $id("statusModal");
  const confirmModal = $id("confirmModal");
  const docForm = $id("docForm");

  const showModal = (m) => m.classList.add("open");
  const hideModal = (m) => m.classList.remove("open");

  function openFormNew() {
    $id("formTitle").textContent = "Document & Permit Issuance";
    docForm.reset();
    $id("docId").value = "";
    $id("selectedResidentId").value = "";
    $id("residentSearch").value = "";
    selectedResident = null;
    showModal(formModal);
  }

  function openFormForEdit(id) {
    const d = ALL.find((x) => x._id === id);
    if (!d) return;
    $id("formTitle").textContent = "Edit";
    $id("docId").value = d._id;
    $id("typeOfDocument").value = d.typeOfDocument || "Barangay Clearance";
    $id("numberOfCopies").value = d.numberOfCopies || 1;
    $id("requesterName").value = d.requesterName || "";
    $id("address").value = d.address || "";
    $id("purpose").value = d.purpose || "";
    $id("paymentMethod").value = d.paymentMethod || "";
    $id("paymentStatus").value = d.paymentStatus || "";
    
    // Set resident selection if available
    $id("selectedResidentId").value = d.residentId || "";
    $id("residentSearch").value = d.residentIdString ? `${d.requesterName} (${d.residentIdString})` : "";
    selectedResident = d.residentId ? { _id: d.residentId } : null;
    
    showModal(formModal);
  }

  async function saveForm() {
    const id = $id("docId").value;
    const residentId = $id("selectedResidentId").value.trim();
    const payload = {
      requesterName: $id("requesterName").value.trim(),
      address: $id("address").value.trim(),
      typeOfDocument: $id("typeOfDocument").value,
      purpose: $id("purpose").value.trim(),
      numberOfCopies: Math.max(1, parseInt($id("numberOfCopies").value || 1, 10)),
      paymentMethod: $id("paymentMethod").value || "",
      paymentStatus: $id("paymentStatus").value || "",
      ...(residentId ? { residentId: residentId } : {})
    };
    if (!payload.requesterName || !payload.address) return alert("Please fill required fields");

    const url = id ? `/api/documents/${id}` : "/api/documents/add";
    const method = id ? "PUT" : "POST";

    try {
      const j = await fetchJSON(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (j.ok) {
        alert(id ? "Changes saved" : "Request created");
        hideModal(formModal);
        loadDocs();
      } else {
        alert(j.message || "Save failed");
      }
    } catch (e) {
      alert(e.message || "Save failed");
    }
  }

  function openStatus(id) {
    $id("statusDocId").value = id;
    $id("statusValue").value = "Released";
    $id("dateReleased").value = new Date().toISOString().slice(0, 10);
    showModal(statusModal);
  }

  async function saveStatus() {
    const id = $id("statusDocId").value;
    if (!id) {
      alert("Invalid document ID");
      return;
    }
    
    const status = $id("statusValue").value;
    const dateReleased = $id("dateReleased").value || null;
    
    if (!status) {
      alert("Please select a status");
      return;
    }
    
    try {
      const j = await fetchJSON(`/api/documents/update-status/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: status,
          dateReleased: dateReleased,
        }),
      });
      if (j.ok) {
        alert("Status updated successfully");
        hideModal(statusModal);
        loadDocs();
      } else {
        alert(j.message || "Update failed");
      }
    } catch (e) {
      console.error("Status update error:", e);
      alert(e.message || "Update failed. Please check the console for details.");
    }
  }

  function askDelete(id) {
    $id("deleteDocId").value = id;
    showModal(confirmModal);
  }

  async function doDelete() {
    const id = $id("deleteDocId").value;
    try {
      const j = await fetchJSON(`/api/documents/${id}`, { method: "DELETE" });
      if (j.ok) {
        alert("Deleted");
        hideModal(confirmModal);
        loadDocs();
      }
    } catch {
      alert("Delete failed");
    }
  }

  /* ---- initialization function ---- */
  function initPage() {
    // Setup resident search
    setupResidentSearch();
    
    // toolbar
    on($id("addNewBtn"), "click", openFormNew);

    // form modal
    on($id("closeFormX"), "click", () => hideModal(formModal));
    on($id("cancelForm"), "click", () => hideModal(formModal));
    on($id("saveForm"), "click", (e) => {
      e.preventDefault();
      saveForm();
    });

    // status modal
    on($id("closeStatusX"), "click", () => hideModal(statusModal));
    on($id("cancelStatus"), "click", () => hideModal(statusModal));
    on($id("saveStatus"), "click", (e) => {
      e.preventDefault();
      saveStatus();
    });

    // delete modal
    on($id("cancelDelete"), "click", () => hideModal(confirmModal));
    on($id("doDelete"), "click", () => doDelete());


    // For admin pages, assume admin access
    // Get user info if available, but set isAdmin to true
    (async function applyRoleUI() {
      try {
        const me = window.__BRGY_USER__ || await (async () => {
          const r = await fetch("/api/me", { credentials: "include" });
          const j = await r.json(); 
          return j.user;
        })();
        currentUser = me;
        // On admin pages, user should be admin, but check anyway
        const role = me?.role || "admin";
        isAdmin = /^(admin)$/i.test(role||'') || me?.isAdmin===true || me?.type==='admin' || me?.accountType==='admin' || true; // Default to true for admin pages
      } catch (e) {
        // If check fails, assume admin since we're on admin page
        isAdmin = true;
        console.warn("Could not verify admin status, assuming admin:", e);
      }
    })();

    // initial load
    loadDocs();
  }
  
  /* ---- bind once DOM is ready ---- */
  // Support both DOMContentLoaded (for direct page loads) and immediate execution (for SPA)
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initPage);
  } else {
    // DOM already loaded, run immediately
    setTimeout(initPage, 50);
  }
  
  // Expose init function for router
  window.initDocumentPermits = initPage;
})();
