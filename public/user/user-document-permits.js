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
      
      // Auto-fill user's name and address in the form
      const requesterNameInput = $id("requesterName");
      const addressInput = $id("address");
      if (requesterNameInput) {
        requesterNameInput.value = currentUser.name || "";
      }
      if (addressInput) {
        addressInput.value = currentUser.address || "";
      }
      
      // Try to find and link resident record if user is linked to a resident
      if (currentUser.residentId || currentUser.linkedToResident) {
        try {
          // Search for resident by username or name
          const residentSearch = await fetchJSON(`/api/residents/search?q=${encodeURIComponent(currentUser.username || currentUser.name || '')}`);
          const residents = residentSearch.residents || [];
          const matchingResident = residents.find(r => 
            r.username === currentUser.username?.toLowerCase() ||
            r.name?.toLowerCase() === currentUser.name?.toLowerCase()
          );
          
          if (matchingResident) {
            const selectedResidentId = $id("selectedResidentId");
            if (selectedResidentId) {
              selectedResidentId.value = matchingResident._id || matchingResident.residentId || "";
            }
            selectedResident = matchingResident;
          }
        } catch (e) {
          console.log('Could not auto-link resident:', e);
          // Not critical, continue without resident link
        }
      }
    } catch {
      location.href = "/login";
    }
  }

  // Resident linking - try to find resident record for the logged-in user
  let selectedResident = null;

  async function linkUserToResident() {
    if (!currentUser) return;
    
    try {
      // Try to find resident by username or name
      const searchQuery = currentUser.username || currentUser.name || '';
      if (!searchQuery) return;
      
      const j = await fetchJSON(`/api/residents/search?q=${encodeURIComponent(searchQuery)}`);
      const residents = j.residents || [];
      
      // Find matching resident
      const matchingResident = residents.find(r => 
        r.username === currentUser.username?.toLowerCase() ||
        (r.name?.toLowerCase() === currentUser.name?.toLowerCase() && 
         r.address?.toLowerCase() === currentUser.address?.toLowerCase())
      );
      
      if (matchingResident) {
        selectedResident = matchingResident;
        const selectedResidentId = $id("selectedResidentId");
        if (selectedResidentId) {
          selectedResidentId.value = matchingResident._id || matchingResident.residentId || "";
        }
        console.log('User document-permits: Linked to resident', matchingResident.residentId || matchingResident._id);
      }
    } catch (e) {
      console.log('User document-permits: Could not link to resident:', e);
      // Not critical, continue without resident link
    }
  }

  function setupForm() {
    const addBtn = $id("addNewBtn");
    const formModal = $id("formModal");
    const cancel = $id("cancelForm");
    const save = $id("saveForm");
    const form = $id("docForm");
    const requesterNameInput = $id("requesterName");
    const addressInput = $id("address");

    if (!addBtn || !formModal || !form) {
      console.warn('User document-permits: Required form elements not found');
      return;
    }

    // Clone buttons to remove old listeners
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    
    const newCancel = cancel ? cancel.cloneNode(true) : null;
    if (cancel && newCancel) {
      cancel.parentNode.replaceChild(newCancel, cancel);
    }
    
    const newSave = save ? save.cloneNode(true) : null;
    if (save && newSave) {
      save.parentNode.replaceChild(newSave, save);
    }

    const open = () => {
      if (!form) return;
      form.reset();
      const docId = $id("docId");
      if (docId) docId.value = "";
      const formTitle = $id("formTitle");
      if (formTitle) formTitle.textContent = "Request New Document";
      const msgEl = $id("msg");
      if (msgEl) msgEl.textContent = "";
      
      // Auto-fill user's information (but allow editing)
      if (currentUser) {
        if (requesterNameInput) {
          requesterNameInput.value = currentUser.name || "";
          // Remove readonly and styling restrictions
          requesterNameInput.readOnly = false;
          requesterNameInput.style.backgroundColor = "";
          requesterNameInput.style.cursor = "";
        }
        if (addressInput) {
          addressInput.value = currentUser.address || "";
          // Remove readonly and styling restrictions
          addressInput.readOnly = false;
          addressInput.style.backgroundColor = "";
          addressInput.style.cursor = "";
        }
      }
      
      // Try to link to resident record
      linkUserToResident();
      
      // Reset payment fields
      const paymentMethod = $id("paymentMethod");
      if (paymentMethod) paymentMethod.value = "";
      
      // Set default number of copies
      const numberOfCopies = $id("numberOfCopies");
      if (numberOfCopies) numberOfCopies.value = "1";
      
      formModal.classList.remove("hidden");
      formModal.classList.add("active");
      formModal.style.setProperty('pointer-events', 'auto', 'important');
      formModal.style.setProperty('display', 'flex', 'important');
      formModal.style.setProperty('z-index', '10000', 'important');
    };

    const close = () => {
      formModal.classList.remove("active", "flex");
      formModal.classList.add("hidden");
      formModal.style.removeProperty('pointer-events');
      formModal.style.removeProperty('display');
      formModal.style.removeProperty('z-index');
    };

    on(newAddBtn, "click", open);
    if (newCancel) on(newCancel, "click", close);
    
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

    if (newSave) {
      on(newSave, "click", async (e) => {
        e.preventDefault();
        
        const msgEl = $id("msg");
        const selectedResidentIdEl = $id("selectedResidentId");
        const residentId = selectedResidentIdEl ? selectedResidentIdEl.value.trim() : "";

        const data = {
          typeOfDocument: ($id("typeOfDocument")?.value || "").trim(),
          numberOfCopies: Math.max(1, parseInt($id("numberOfCopies")?.value || 1, 10)),
          requesterName: (requesterNameInput?.value || "").trim(),
          address: (addressInput?.value || "").trim(),
          purpose: ($id("purpose")?.value || "").trim(),
          paymentMethod: $id("paymentMethod")?.value || "",
          paymentStatus: "", // Users don't set payment status, admin does
          ...(residentId ? { residentId: residentId } : {}) // Include residentId if available
        };

        if (!data.typeOfDocument || !data.requesterName || !data.address || !data.purpose) {
          if (msgEl) {
            msgEl.textContent = "Please fill all required fields.";
            msgEl.style.color = "#dc2626";
          }
          return;
        }

        // Disable save button during submission
        if (newSave) {
          newSave.disabled = true;
          newSave.textContent = "Submitting...";
        }

        try {
          const j = await fetchJSON("/api/documents/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });

          if (j.ok) {
            if (msgEl) {
              msgEl.textContent = "Request submitted successfully!";
              msgEl.style.color = "#239b56";
            }
            setTimeout(() => {
              close();
              loadDocs();
            }, 500);
          } else {
            if (msgEl) {
              msgEl.textContent = j.message || "Failed to submit request";
              msgEl.style.color = "#dc2626";
            }
          }
        } catch (e) {
          const errorMsg = e.message || "Failed to submit request";
          if (msgEl) {
            msgEl.textContent = errorMsg;
            msgEl.style.color = "#dc2626";
          }
          console.error("Submit error:", e);
        } finally {
          if (newSave) {
            newSave.disabled = false;
            newSave.textContent = "Submit Request";
          }
        }
      });
    }
  }

  function setupSearch() {
    const input = $id("searchInput");
    if (!input) return;
    
    // Clone to remove old listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    on(newInput, "input", () => {
      const q = newInput.value.toLowerCase().trim();
      VIEW = q ? ALL.filter((d) => 
        (d.typeOfDocument || "").toLowerCase().includes(q) ||
        (d.purpose || "").toLowerCase().includes(q) ||
        (d.requesterName || "").toLowerCase().includes(q)
      ) : ALL;
      renderRows(VIEW);
    });
  }

  // Main init function
  async function init() {
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) {
      console.warn('User document-permits: Content area not found, retrying...');
      setTimeout(init, 100);
      return;
    }

    // Check if content is loaded
    if (!contentArea.innerHTML || contentArea.innerHTML.trim().length < 100) {
      console.warn('User document-permits: Content area is empty, waiting...');
      setTimeout(init, 100);
      return;
    }

    await initUser();
    await linkUserToResident(); // Try to link user to resident
    setupForm();
    setupSearch();
    loadDocs();
  }

  // Expose init function for router
  window.initDocumentPermits = init;

  // Auto-initialize ONLY for direct page loads (not SPA navigation)
  const isSPAMode = window.__ROUTER_INITIALIZED__;
  
  if (!isSPAMode) {
    // Direct page load (not via router)
    if (document.readyState === 'loading') {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      setTimeout(init, 50);
    }
  } else {
    // SPA mode - router will call initDocumentPermits, don't auto-init
    console.log('User document-permits: SPA mode detected, waiting for router to call initDocumentPermits');
  }
})();

