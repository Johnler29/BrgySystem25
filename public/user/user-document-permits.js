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
    const map = { Released: "b-yes", Pending: "b-no", "Pick-up Ready": "b-info", Declined: "b-no" };
    return `<span class="badge ${map[s] || "b-info"}">${s || "Pending"}</span>`;
  };

  function renderRows(rows) {
    const tb = $id("reqTbody");
    tb.innerHTML = "";

    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#777;">No document requests found.</td></tr>`;
      return;
    }

    rows.forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.typeOfDocument || "—"}</td>
        <td>${d.numberOfCopies ?? 1}</td>
        <td>${fmt(d.dateRequested)}</td>
        <td>${fmt(d.dateReleased)}</td>
        <td>${badge(d.status)}</td>
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

    const open = () => {
      form.reset();
      $id("docId").value = "";
      $id("formTitle").textContent = "Request New Document";
      formModal.classList.add("active");
    };

    const close = () => formModal.classList.remove("active");

    on(addBtn, "click", open);
    on(closeX, "click", close);
    on(cancel, "click", close);
    on(formModal, "click", (e) => {
      if (e.target === formModal) close();
    });

    on(save, "click", async () => {
      const data = {
        typeOfDocument: $id("typeOfDocument").value,
        numberOfCopies: parseInt($id("numberOfCopies").value) || 1,
        requesterName: $id("requesterName").value,
        address: $id("address").value,
        purpose: $id("purpose").value,
        paymentMethod: $id("paymentMethod").value,
        paymentStatus: $id("paymentStatus").value,
      };

      if (!data.typeOfDocument || !data.requesterName || !data.address || !data.purpose) {
        alert("Please fill all required fields.");
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
          alert(j.message || "Failed to submit request");
        }
      } catch (e) {
        alert(e.message || "Failed to submit request");
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

