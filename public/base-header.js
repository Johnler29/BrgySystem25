// /public/base-header.js
(() => {
  "use strict";

  async function getMe() {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      const j = await res.json();
      if (!j?.user) { location.href = "/login"; return; }

      const { name, username, role = "user" } = j.user;

      const nameEl   = document.getElementById("username");
      const avatarEl = document.getElementById("avatar");
      const chip     = document.getElementById("userChip");

      // Label: show "Admin" for admins, otherwise the person’s name
      if (nameEl)   nameEl.textContent = (role === "admin" ? "Admin" : (name || username || "User"));

      // Avatar initial
      const initial = (name || username || "U").trim().charAt(0).toUpperCase();
      if (avatarEl) avatarEl.textContent = initial;

      // Optional: style hook if you want to tint the chip for admins
      chip?.classList.toggle("is-admin", role === "admin");

      // Expose role for other scripts that might need it
      window.__BRGY_USER__ = j.user;
    } catch (e) {
      console.warn("base-header getMe() error:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", getMe);
})();
