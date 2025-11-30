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

  function setupForm() {
    const addBtn = $id("addNewBtn");
    const formModal = $id("formModal");
    const closeX = $id("closeFormX");
    const cancel = $id("cancelForm");
    const save = $id("saveForm");
    const form = $id("docForm");
    const requesterNameInput = $id("requesterName");
    const addressInput = $id("address");

    const open = () => {
      form.reset();
      $id("docId").value = "";
      $id("formTitle").textContent = "Request New Document";
      const msgEl = $id("msg");
      if (msgEl) msgEl.textContent = "";
      
      // Auto-populate requester name and address from user profile
      if (currentUser) {
        requesterNameInput.value = currentUser.name || "";
        addressInput.value = currentUser.address || "";
        
        // Name is always read-only
        requesterNameInput.readOnly = true;
        requesterNameInput.style.backgroundColor = "#f5f5f5";
        requesterNameInput.style.cursor = "not-allowed";
        
        // If address is missing, allow user to enter it
        const addressHelp = document.getElementById("addressHelp");
        if (!currentUser.address || currentUser.address.trim() === "") {
          addressInput.readOnly = false;
          addressInput.style.backgroundColor = "";
          addressInput.style.cursor = "";
          addressInput.required = true;
          if (addressHelp) addressHelp.textContent = "Please enter your address";
        } else {
          // Make address read-only if it exists
          addressInput.readOnly = true;
          addressInput.style.backgroundColor = "#f5f5f5";
          addressInput.style.cursor = "not-allowed";
          if (addressHelp) addressHelp.textContent = "This field is automatically filled from your profile";
        }
      }
      
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

    on(addBtn, "click", open);
    on(closeX, "click", close);
    on(cancel, "click", close);
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
      const data = {
        typeOfDocument: $id("typeOfDocument").value.trim(),
        numberOfCopies: Math.max(1, parseInt($id("numberOfCopies").value || 1, 10)),
        requesterName: requesterNameInput.value.trim(),
        address: addressInput.value.trim(),
        purpose: $id("purpose").value.trim(),
        paymentMethod: $id("paymentMethod").value || "",
        paymentStatus: $id("paymentStatus").value || "",
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
        if (msgEl) msgEl.textContent = e.message || "Failed to submit request";
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

