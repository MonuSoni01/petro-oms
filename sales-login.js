"use strict";

const SESSION_DURATION = Number.MAX_SAFE_INTEGER; // Persistent until explicit logout

const SALESMAN_PREFIX = Object.freeze({
    "Sariya Murtuza": "SM",
    "Rup Ranjan Bora": "RRB",
    "Ankit Kalra": "AK",
    "Amit Soni": "AS",
    "Vivek Srivastava": "VS",
    "Prince Gupta": "PG",
    "Shubham Meena": "SS",
    "Sumanta Kumar": "SK"
});

const SALESMAN_PASSWORDS = Object.freeze({
    "Sariya Murtuza": "sariya123",
    "Ankit Kalra": "ankit123",
    "Amit Soni": "amit123",
    "Vivek Srivastava": "vivek123",
    "Rup Ranjan Bora": "rup123",
    "Prince Gupta": "prince123",
    "Shubham Meena": "shubham123",
    "Sumanta Kumar": "sumanta123"
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

    if (!role || !name || !loginTime) return;

    const validAccount =
        role === "sales" &&
        Object.prototype.hasOwnProperty.call(SALESMAN_PREFIX, name);

    if (!validAccount) {
        clearSalesSession();
        return;
    }

    // Keep old/new prefix storage keys synchronized for dashboard compatibility.
    localStorage.setItem("prefix", SALESMAN_PREFIX[name]);
    localStorage.setItem("salesmanPrefix", SALESMAN_PREFIX[name]);

    window.top.location.replace("index.html");
}

function openPasswordModal() {
    const passwordField = document.getElementById("passwordField");
    passwordField?.focus();
}

function verifyPassword() {
    const salesman = document.getElementById("salesman");
    const passwordField = document.getElementById("passwordField");
    const errorMsg = document.getElementById("errorMsg");

    if (!salesman || !passwordField || !errorMsg) return;

    const name = salesman.value.trim();
    const password = passwordField.value;

    if (!name) {
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
    const expiresAt = Number.MAX_SAFE_INTEGER;

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

    window.top.location.replace("index.html");
}

function togglePassword() {
    const passwordField = document.getElementById("passwordField");
    const iconBtn = document.getElementById("togglePassword");
    const icon = iconBtn?.querySelector("i") || iconBtn;
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
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "petro-change-role" }, "*");
        return;
    }
    window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
    checkExistingSession();

    const salesman = document.getElementById("salesman");
    const passwordField = document.getElementById("passwordField");
    const errorMsg = document.getElementById("errorMsg");

    salesman?.addEventListener("change", () => {
        if (!errorMsg) return;
        errorMsg.style.display = "none";
        errorMsg.textContent = "";
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
