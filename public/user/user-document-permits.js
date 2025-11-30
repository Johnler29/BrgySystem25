// /public/user-document-permits.js - User-specific version
(() => {
  "use strict";

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

  let ALL = [];
  let VIEW = [];
  let isAdmin = false;
  let currentUser = null;

  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
  const badge = (s) => {
    const status = s || "Pending";
    const statusMap = {
      "Released": "bg-[#e3f2fd] text-[#1565c0] border-[#64b5f6]",
      "PICK-UP READY": "bg-[#dbeafe] text-[#1e40af] border-[#60a5fa]",
      "Pick-up Ready": "bg-[#dbeafe] text-[#1e40af] border-[#60a5fa]",
      "Pending": "bg-[#dbeafe] text-[#1e40af] border-[#60a5fa]",
      "Declined": "bg-[#e3f2fd] text-[#1565c0] border-[#64b5f6]",
      "Processing": "bg-[#e1f5fe] text-[#0277bd] border-[#4fc3f7]"
    };
    const classes = statusMap[status] || "bg-[#e3f2fd] text-[#1565c0] border-[#64b5f6]";
    return `<span class="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${classes}">${status}</span>`;
  };

  function renderRows(rows) {
    const tb = $id("reqTbody");
    tb.innerHTML = "";

    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center"><div class="flex flex-col items-center gap-3"><div class="text-4xl">📄</div><p class="text-gray-500 font-medium">No document requests found.</p><p class="text-sm text-gray-400">Click "Request New Document" to get started.</p></div></td></tr>`;
      return;
    }

    rows.forEach((d) => {
      const tr = document.createElement("tr");
      tr.className = "group";
      tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm font-semibold text-gray-900">${d.typeOfDocument || "—"}</div></td>
        <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm text-gray-700">${d.numberOfCopies ?? 1}</div></td>
        <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm text-gray-700">${fmt(d.dateRequested)}</div></td>
        <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm text-gray-700">${fmt(d.dateReleased)}</div></td>
        <td class="px-6 py-4 whitespace-nowrap">${badge(d.status)}</td>
      `;
      tb.appendChild(tr);
    });
  }

  async function loadDocs() {
    try {
      const j = await fetchJSON("/api/documents");
      ALL = j.documents || [];
      VIEW = ALL;
      renderRows(VIEW);
    } catch (e) {
      console.error("Load error:", e);
      renderRows([]);
    }
  }

  async function initUser() {
    try {
      const j = await fetchJSON("/api/me");
      currentUser = j.user || null;
      if (!currentUser) {
        location.href = "/login";
        return;
      }

      isAdmin = /^(admin)$/i.test(currentUser.role || "") || currentUser.isAdmin === true || currentUser.type === "admin" || currentUser.accountType === "admin";
      if (isAdmin) {
        location.href = "/admin/document-permits";
        return;
      }

      $id("username").textContent = currentUser.name || "User";
      $id("avatar").textContent = (currentUser.name || "U").trim().charAt(0).toUpperCase();
    } catch {
      location.href = "/login";
    }
  }

  // Resident search functionality
  let searchTimeout = null;
  let selectedResident = null;

  async function searchResidents(query) {
    if (!query || query.trim().length < 2) {
      $id("residentDropdown").classList.add("hidden");
      return;
    }

    try {
      const j = await fetchJSON(`/api/residents/search?q=${encodeURIComponent(query)}`);
      const residents = j.residents || [];
      displayResidentDropdown(residents);
    } catch (e) {
      console.error("Search error:", e);
      $id("residentDropdown").classList.add("hidden");
    }
  }

  function displayResidentDropdown(residents) {
    const dropdown = $id("residentDropdown");
    if (!residents.length) {
      dropdown.innerHTML = '<div class="px-4 py-3 text-sm text-gray-500">No residents found</div>';
      dropdown.classList.remove("hidden");
      return;
    }

    dropdown.innerHTML = residents.map(r => `
      <div class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0" 
           data-resident-id="${r._id}" 
           data-resident-name="${(r.name || '').replace(/"/g, '&quot;')}" 
           data-resident-address="${(r.address || '').replace(/"/g, '&quot;')}"
           data-resident-id-string="${(r.residentId || '').replace(/"/g, '&quot;')}">
        <div class="font-semibold text-gray-900">${r.name || '—'}</div>
        <div class="text-xs text-gray-600 mt-0.5">ID: ${r.residentId || '—'} • ${r.address || 'No address'}</div>
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

    dropdown.classList.remove("hidden");
  }

  function selectResident(resident) {
    selectedResident = resident;
    $id("selectedResidentId").value = resident._id;
    $id("residentSearch").value = `${resident.name} (${resident.residentId || 'ID: N/A'})`;
    $id("requesterName").value = resident.name || "";
    $id("address").value = resident.address || "";
    $id("residentDropdown").classList.add("hidden");
    
    // Update help text
    const nameHelp = $id("nameHelp");
    const addressHelp = $id("addressHelp");
    if (nameHelp) nameHelp.textContent = "Auto-filled from selected resident";
    if (addressHelp) addressHelp.textContent = "Auto-filled from selected resident";
  }

  function setupForm() {
    const addBtn = $id("addNewBtn");
    const formModal = $id("formModal");
    const cancel = $id("cancelForm");
    const save = $id("saveForm");
    const form = $id("docForm");
    const requesterNameInput = $id("requesterName");
    const addressInput = $id("address");
    const residentSearchInput = $id("residentSearch");

    // Setup resident search
    if (residentSearchInput) {
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
    }

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      const dropdown = $id("residentDropdown");
      if (dropdown && !e.target.closest("#residentSearch") && !e.target.closest("#residentDropdown")) {
        dropdown.classList.add("hidden");
      }
    });

    const open = () => {
      form.reset();
      $id("docId").value = "";
      $id("selectedResidentId").value = "";
      $id("formTitle").textContent = "Request New Document";
      const msgEl = $id("msg");
      if (msgEl) msgEl.textContent = "";
      
      // Reset resident selection
      selectedResident = null;
      residentSearchInput.value = "";
      requesterNameInput.value = "";
      addressInput.value = "";
      
      // Reset fields to editable state
      requesterNameInput.readOnly = true;
      requesterNameInput.style.backgroundColor = "#f5f5f5";
      requesterNameInput.style.cursor = "not-allowed";
      addressInput.readOnly = true;
      addressInput.style.backgroundColor = "#f5f5f5";
      addressInput.style.cursor = "not-allowed";
      
      // Update help text
      const nameHelp = $id("nameHelp");
      const addressHelp = $id("addressHelp");
      if (nameHelp) nameHelp.textContent = "Will be auto-filled when you select a resident";
      if (addressHelp) addressHelp.textContent = "Will be auto-filled when you select a resident";
      
      // Reset payment fields
      $id("paymentMethod").value = "";
      $id("paymentStatus").value = "";
      
      formModal.classList.remove("hidden");
      formModal.classList.add("flex");
    };

    const close = () => {
      formModal.classList.remove("flex");
      formModal.classList.add("hidden");
      // Reset read-only styling when closing
      requesterNameInput.readOnly = false;
      requesterNameInput.style.backgroundColor = "";
      requesterNameInput.style.cursor = "";
      addressInput.readOnly = false;
      addressInput.style.backgroundColor = "";
      addressInput.style.cursor = "";
    };

    if (addBtn) on(addBtn, "click", open);
    if (cancel) on(cancel, "click", close);
    // Close modal when clicking outside (on the overlay)
    on(formModal, "click", (e) => {
      if (e.target === formModal) close();
    });
    
    // Prevent modal from closing when clicking inside the modal content
    const modalContent = formModal.querySelector("div.w-full");
    if (modalContent) {
      on(modalContent, "click", (e) => {
        e.stopPropagation();
      });
    }

    on(save, "click", async (e) => {
      e.preventDefault();
      
      const msgEl = $id("msg");
      const residentId = $id("selectedResidentId").value.trim();
      
      if (!residentId) {
        if (msgEl) msgEl.textContent = "Please select a resident to validate the request.";
        return;
      }

      const data = {
        typeOfDocument: $id("typeOfDocument").value.trim(),
        numberOfCopies: Math.max(1, parseInt($id("numberOfCopies").value || 1, 10)),
        requesterName: requesterNameInput.value.trim(),
        address: addressInput.value.trim(),
        purpose: $id("purpose").value.trim(),
        paymentMethod: $id("paymentMethod").value || "",
        paymentStatus: $id("paymentStatus").value || "",
        residentId: residentId
      };

      if (!data.typeOfDocument || !data.requesterName || !data.address || !data.purpose) {
        if (msgEl) msgEl.textContent = "Please fill all required fields.";
        return;
      }

      try {
        const j = await fetchJSON("/api/documents/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (j.ok) {
          close();
          loadDocs();
        } else {
          if (msgEl) msgEl.textContent = j.message || "Failed to submit request";
        }
      } catch (e) {
        const errorMsg = e.message || "Failed to submit request";
        if (msgEl) msgEl.textContent = errorMsg;
        console.error("Submit error:", e);
      }
    });
  }

  function setupSearch() {
    const input = $id("searchInput");
    on(input, "input", () => {
      const q = input.value.toLowerCase().trim();
      VIEW = q ? ALL.filter((d) => 
        (d.typeOfDocument || "").toLowerCase().includes(q) ||
        (d.purpose || "").toLowerCase().includes(q) ||
        (d.requesterName || "").toLowerCase().includes(q)
      ) : ALL;
      renderRows(VIEW);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await initUser();
    setupForm();
    setupSearch();
    loadDocs();
  });
})();

