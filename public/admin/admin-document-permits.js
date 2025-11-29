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
      throw Object.assign(new Error(text || res.statusText), { status: res.status });
    }
    if (!ct.includes("application/json")) {
      throw new Error("Expected JSON response");
    }
    return JSON.parse(text);
  }

  /* ---- state ---- */
  let ALL = [];
  let VIEW = [];

  /* ---- small render utils ---- */
  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
  const badge = (s) => {
    const map = { Released: "b-yes", Pending: "b-no", "Pick-up Ready": "b-info", Declined: "b-no" };
    return `<span class="badge ${map[s] || "b-info"}">${s || "Pending"}</span>`;
  };

  /* ---- table render ---- */
  function renderRows(rows) {
    const tb = $id("reqTbody");
    tb.innerHTML = "";

    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#777;">No document requests found.</td></tr>`;
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
    try {
      const data = await fetchJSON("/api/documents");
      ALL = data.documents || [];
      VIEW = [...ALL];
      renderRows(VIEW);
    } catch (e) {
      console.warn("[loadDocs]", e);
      $id("reqTbody").innerHTML =
        `<tr><td colspan="8" style="text-align:center;color:#888">Unable to load data.</td></tr>`;
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
    showModal(formModal);
  }

  async function saveForm() {
    const id = $id("docId").value;
    const payload = {
      requesterName: $id("requesterName").value.trim(),
      address: $id("address").value.trim(),
      typeOfDocument: $id("typeOfDocument").value,
      purpose: $id("purpose").value.trim(),
      numberOfCopies: Math.max(1, parseInt($id("numberOfCopies").value || 1, 10)),
      paymentMethod: $id("paymentMethod").value || "",
      paymentStatus: $id("paymentStatus").value || "",
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
      }
    } catch {
      alert("Save failed");
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
    try {
      const j = await fetchJSON(`/api/documents/update-status/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: $id("statusValue").value,
          dateReleased: $id("dateReleased").value || null,
        }),
      });
      if (j.ok) {
        alert("Status updated");
        hideModal(statusModal);
        loadDocs();
      }
    } catch {
      alert("Update failed");
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

  /* ---- bind once DOM is ready ---- */
  document.addEventListener("DOMContentLoaded", () => {
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


    // get role from header (populated by base-header.js)
let isAdmin = false;
let currentUser = null;

async function applyRoleUI() {
  // If base-header hasn't loaded yet, fetch /api/me directly
  const me = window.__BRGY_USER__ || await (async () => {
    const r = await fetch("/api/me", { credentials: "include" });
    const j = await r.json(); 
    return j.user;
  })();

  currentUser = me;
  const role = me?.role || "user";
  isAdmin = /^(admin)$/i.test(role||'') || me?.isAdmin===true || me?.type==='admin' || me?.accountType==='admin';

  // Hide admin-only UI elements for regular users
  if (!isAdmin) {
    const bulk = document.getElementById("bulkReleasedBtn");
    if (bulk) bulk.style.display = "none";
    
    // Hide kebab menus (edit/delete/status change) for non-admins
    // We'll handle this in renderRows instead
  }

  // Save for later checks if you need
  window.__BRGY_ROLE__ = role;
  window.__BRGY_IS_ADMIN__ = isAdmin;
}

document.addEventListener("DOMContentLoaded", applyRoleUI);

    // initial load
    loadDocs();
  });
})();
