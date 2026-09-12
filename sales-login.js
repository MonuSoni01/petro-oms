"use strict";

const SESSION_DURATION = 48 * 60 * 60 * 1000; // 48 hours

const SALESMAN_PREFIX = Object.freeze({
    "Sariya Murtuza": "SM",
    "Rup Ranjan Bora": "RRB",
    "Ankit Kalra": "AK",
    "Amit Soni": "AS",
    "Vivek Srivastava": "VS",
    "Prince Gupta": "PG"
});

const SALESMAN_PASSWORDS = Object.freeze({
    "Sariya Murtuza": "sariya123",
    "Ankit Kalra": "ankit123",
    "Amit Soni": "amit123",
    "Vivek Srivastava": "vivek123",
    "Rup Ranjan Bora": "rup123",
    "Prince Gupta": "prince123"
});

function clearSalesSession() {
    [
        "user_role",
        "user_name",
        "salesman",
        "loggedSalesman",
        "prefix",
        "salesmanPrefix",
        "loginTime",
        "sessionExpiresAt"
    ].forEach((key) => localStorage.removeItem(key));
}

function checkExistingSession() {
    const role = (localStorage.getItem("user_role") || "").trim();
    const name = (
        localStorage.getItem("loggedSalesman") ||
        localStorage.getItem("salesman") ||
        ""
    ).trim();

    const loginTime = Number(localStorage.getItem("loginTime") || 0);
    const storedExpiresAt = Number(localStorage.getItem("sessionExpiresAt") || 0);
    const calculatedExpiresAt = loginTime ? loginTime + SESSION_DURATION : 0;
    const expiresAt = storedExpiresAt || calculatedExpiresAt;

    if (!role || !name || !loginTime || !expiresAt) return;

    const validAccount =
        role === "sales" &&
        Object.prototype.hasOwnProperty.call(SALESMAN_PREFIX, name);

    if (!validAccount || Date.now() >= expiresAt) {
        clearSalesSession();
        return;
    }

    // Keep old/new prefix storage keys synchronized for dashboard compatibility.
    localStorage.setItem("prefix", SALESMAN_PREFIX[name]);
    localStorage.setItem("salesmanPrefix", SALESMAN_PREFIX[name]);

    window.location.replace("sales-dashboard.html");
}

function openPasswordModal() {
    const salesman = document.getElementById("salesman");
    const passwordField = document.getElementById("passwordField");
    const errorMsg = document.getElementById("errorMsg");
    const passwordModal = document.getElementById("passwordModal");

    if (!salesman || !passwordField || !errorMsg || !passwordModal) return;

    const name = salesman.value.trim();

    if (!name) {
        alert("Please select your name");
        salesman.focus();
        return;
    }

    passwordField.value = "";
    errorMsg.textContent = "";
    errorMsg.style.display = "none";
    passwordModal.style.display = "flex";

    setTimeout(() => passwordField.focus(), 100);
}

function verifyPassword() {
    const salesman = document.getElementById("salesman");
    const passwordField = document.getElementById("passwordField");
    const errorMsg = document.getElementById("errorMsg");

    if (!salesman || !passwordField || !errorMsg) return;

    const name = salesman.value.trim();
    const password = passwordField.value;

    if (!name) {
        closeModal();
        alert("Please select your name");
        salesman.focus();
        return;
    }

    if (!Object.prototype.hasOwnProperty.call(SALESMAN_PASSWORDS, name)) {
        errorMsg.textContent = "🔒 Your account is not activated yet. Contact Admin Team.";
        errorMsg.style.display = "block";
        return;
    }

    if (password !== SALESMAN_PASSWORDS[name]) {
        errorMsg.textContent = "❌ Incorrect Password";
        errorMsg.style.display = "block";
        passwordField.focus();
        passwordField.select();
        return;
    }

    const prefix = SALESMAN_PREFIX[name];
    if (!prefix) {
        errorMsg.textContent = "⚠️ Salesman prefix is missing. Contact Admin Team.";
        errorMsg.style.display = "block";
        return;
    }

    const loginTime = Date.now();
    const expiresAt = loginTime + SESSION_DURATION;

    clearSalesSession();

    localStorage.setItem("user_role", "sales");
    localStorage.setItem("user_name", name);
    localStorage.setItem("salesman", name);
    localStorage.setItem("loggedSalesman", name);

    // Save both keys because older dashboard versions may use either one.
    localStorage.setItem("prefix", prefix);
    localStorage.setItem("salesmanPrefix", prefix);

    localStorage.setItem("loginTime", String(loginTime));
    localStorage.setItem("sessionExpiresAt", String(expiresAt));
    localStorage.removeItem("admin");

    window.location.replace("sales-dashboard.html");
}

function togglePassword() {
    const passwordField = document.getElementById("passwordField");
    const icon = document.getElementById("togglePassword");
    if (!passwordField || !icon) return;

    const show = passwordField.type === "password";
    passwordField.type = show ? "text" : "password";
    icon.classList.toggle("fa-eye", !show);
    icon.classList.toggle("fa-eye-slash", show);
}

function closeModal() {
    const modal = document.getElementById("passwordModal");
    if (modal) modal.style.display = "none";
}

function goBack() {
    window.location.href = "https://oms.rankchahiye.com/";
}

document.addEventListener("DOMContentLoaded", () => {
    checkExistingSession();

    const modal = document.getElementById("passwordModal");
    const passwordField = document.getElementById("passwordField");

    modal?.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
    });

    passwordField?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") verifyPassword();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeModal();
    });
});

/*
 * NOTE:
 * Right-click / F12 / Ctrl+U blocking is intentionally not used as security.
 * Browser-side passwords/source code can always be inspected by a user.
 * Real authentication should be moved to a server/Firebase Auth when possible.
 */
