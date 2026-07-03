"use strict";

/* -------------------------------------
   PETRO OMS ADMIN LOGIN JS
   Firebase Compat Version
-------------------------------------- */

/* -------------------------------------
   FIREBASE CHECK
-------------------------------------- */

if (typeof firebase === "undefined") {
  alert("Firebase SDK not loaded. Please check script order.");
  throw new Error("Firebase SDK not loaded");
}

if (!firebase.apps || !firebase.apps.length) {
  alert("Firebase app not initialized. Please check ../firebaseconfig.js");
  throw new Error("Firebase app not initialized");
}

if (!firebase.auth) {
  alert("Firebase Auth SDK not loaded.");
  throw new Error("Firebase Auth SDK not loaded");
}

if (!firebase.firestore) {
  alert("Firebase Firestore SDK not loaded.");
  throw new Error("Firebase Firestore SDK not loaded");
}

const auth = firebase.auth();
const db = firebase.firestore();

/* -------------------------------------
   CONFIG
-------------------------------------- */

const CONFIG = {
  DASHBOARD_URL: "admin-dashboard.html",

  LOGIN_COLLECTION: "sales-login",
  LOGIN_LOG_COLLECTION: "admin_login_logs",

  REMEMBER_EMAIL_KEY: "petro_admin_saved_email",

  SESSION_HOURS: 12,

  ALLOWED_ROLES: [
    "admin",
    "super_admin",
    "manager"
  ]
};

/* -------------------------------------
   DOM ELEMENTS
-------------------------------------- */

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const rememberEmail = document.getElementById("rememberEmail");
const togglePassword = document.getElementById("togglePassword");

const popupModal = document.getElementById("popupModal");
const modalIcon = document.getElementById("modalIcon");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");

/* -------------------------------------
   PAGE READY
-------------------------------------- */

document.addEventListener("DOMContentLoaded", function () {
  loadRememberedEmail();
  clearButtonLoading();
});

/* -------------------------------------
   FORM SUBMIT
-------------------------------------- */

if (loginForm) {
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    adminLogin();
  });
}

/* -------------------------------------
   PASSWORD TOGGLE
-------------------------------------- */

if (togglePassword) {
  togglePassword.addEventListener("click", function () {
    if (!passwordInput) return;

    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";

    togglePassword.innerHTML = isPassword
      ? `<i class="fa-solid fa-eye-slash"></i>`
      : `<i class="fa-solid fa-eye"></i>`;
  });
}

/* -------------------------------------
   MAIN LOGIN FUNCTION
-------------------------------------- */

async function adminLogin() {
  const email = String(emailInput?.value || "")
    .trim()
    .toLowerCase();

  const password = String(passwordInput?.value || "")
    .trim();

  if (!email || !password) {
    showPopup(
      "error",
      "Missing Details",
      "Please enter email and password."
    );
    return;
  }

  setButtonLoading(true);

  try {
    const adminResult = await getAdminByEmail(email);

    if (!adminResult) {
      await saveFailedLoginLog(email, "Email not approved");
      showPopup(
        "error",
        "Access Denied",
        "This email is not approved for PETRO OMS login."
      );
      return;
    }

    const adminDocId = adminResult.id;
    const adminData = adminResult.data || {};

    const status = normalizeText(adminData.status || "");

    if (status !== "active") {
      await saveFailedLoginLog(email, "Account inactive");
      showPopup(
        "error",
        "Account Inactive",
        "Your account is inactive. Please contact super admin."
      );
      return;
    }

    const rawRole = String(adminData.role || "").trim();
    const normalizedRole = normalizeRole(rawRole);

    if (!CONFIG.ALLOWED_ROLES.includes(normalizedRole)) {
      await saveFailedLoginLog(email, "Role not allowed: " + rawRole);
      showPopup(
        "error",
        "Permission Denied",
        `Your role "${rawRole || "-"}" does not have login permission.`
      );
      return;
    }

    let authUser = null;
    let firebaseAuthSuccess = false;

    try {
      const userCredential = await auth.signInWithEmailAndPassword(
        email,
        password
      );

      authUser = userCredential.user || null;
      firebaseAuthSuccess = true;

    } catch (authError) {
      console.warn(
        "Firebase Auth failed:",
        authError.code || authError.message
      );

      /*
        Legacy fallback:
        If old admins are stored only in Firestore with password field,
        this keeps login working.
        Recommended: move all admins to Firebase Auth later.
      */

      const firestorePassword = String(adminData.password || "");

      if (!firestorePassword) {
        await saveFailedLoginLog(
          email,
          authError.code || "Firebase Auth failed and Firestore password missing"
        );

        showPopup(
          "error",
          "Login Failed",
          getLoginErrorMessage(authError)
        );
        return;
      }

      if (password !== firestorePassword) {
        await saveFailedLoginLog(email, "Wrong password");
        showPopup(
          "error",
          "Login Failed",
          "Wrong email or password."
        );
        return;
      }
    }

    const adminName =
      adminData.name ||
      adminData.fullName ||
      adminData.displayName ||
      getNameFromEmail(email);

    const sessionData = {
      uid: authUser?.uid || adminDocId,
      email: email,
      name: adminName,
      role: normalizedRole,
      rawRole: rawRole,
      status: status,
      docId: adminDocId,
      firebaseAuth: firebaseAuthSuccess
    };

    saveAdminSession(sessionData);
    saveRememberedEmail(email);

    await saveSuccessLoginLog(sessionData);

    showPopup(
      "success",
      "Login Successful",
      `Welcome ${adminName}. Redirecting to dashboard...`
    );

    setTimeout(function () {
      window.location.href = CONFIG.DASHBOARD_URL;
    }, 900);

  } catch (error) {
    console.error("Login Error:", error);

    await saveFailedLoginLog(
      email,
      error.code || error.message || "Unknown error"
    );

    showPopup(
      "error",
      "Login Failed",
      getLoginErrorMessage(error)
    );

  } finally {
    setButtonLoading(false);
  }
}

window.adminLogin = adminLogin;

/* -------------------------------------
   GET ADMIN FROM FIRESTORE
-------------------------------------- */

async function getAdminByEmail(email) {
  const snap = await db
    .collection(CONFIG.LOGIN_COLLECTION)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  const doc = snap.docs[0];

  return {
    id: doc.id,
    data: doc.data()
  };
}

/* -------------------------------------
   SAVE ADMIN SESSION
-------------------------------------- */

function saveAdminSession(admin) {
  const now = Date.now();

  const expiresAt =
    now + CONFIG.SESSION_HOURS * 60 * 60 * 1000;

  localStorage.setItem("adminUid", admin.uid || "");
  localStorage.setItem("adminEmail", admin.email || "");
  localStorage.setItem("adminName", admin.name || "Admin");
  localStorage.setItem("adminRole", admin.role || "admin");
  localStorage.setItem("adminRawRole", admin.rawRole || "");
  localStorage.setItem("adminStatus", admin.status || "active");
  localStorage.setItem("adminDocId", admin.docId || "");
  localStorage.setItem("loggedAdmin", admin.name || "Admin");

  localStorage.setItem("user_name", admin.name || "Admin");
  localStorage.setItem("user_email", admin.email || "");
  localStorage.setItem("user_role", admin.role || "admin");

  localStorage.setItem("loginTime", String(now));
  localStorage.setItem("sessionExpiresAt", String(expiresAt));

  localStorage.setItem(
    "firebaseAuthLogin",
    admin.firebaseAuth ? "true" : "false"
  );

  localStorage.removeItem("salesman");
  localStorage.removeItem("loggedSalesman");
  localStorage.removeItem("prefix");
}

/* -------------------------------------
   REMEMBER EMAIL
-------------------------------------- */

function loadRememberedEmail() {
  const savedEmail =
    localStorage.getItem(CONFIG.REMEMBER_EMAIL_KEY);

  if (savedEmail && emailInput && rememberEmail) {
    emailInput.value = savedEmail;
    rememberEmail.checked = true;
  }
}

function saveRememberedEmail(email) {
  if (!rememberEmail) return;

  if (rememberEmail.checked) {
    localStorage.setItem(CONFIG.REMEMBER_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(CONFIG.REMEMBER_EMAIL_KEY);
  }
}

/* -------------------------------------
   LOGIN LOGS
-------------------------------------- */

async function saveSuccessLoginLog(admin) {
  try {
    await db.collection(CONFIG.LOGIN_LOG_COLLECTION).add({
      uid: admin.uid || "",
      email: admin.email || "",
      name: admin.name || "",
      role: admin.role || "",
      rawRole: admin.rawRole || "",
      status: "success",
      accountStatus: admin.status || "",
      adminDocId: admin.docId || "",
      firebaseAuthLogin: Boolean(admin.firebaseAuth),
      action: "admin_login_success",
      page: window.location.pathname,
      userAgent: navigator.userAgent,
      loginAt: firebase.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.warn("Success login log not saved:", error);
  }
}

async function saveFailedLoginLog(email, reason) {
  try {
    await db.collection(CONFIG.LOGIN_LOG_COLLECTION).add({
      email: email || "",
      status: "failed",
      reason: reason || "",
      action: "admin_login_failed",
      page: window.location.pathname,
      userAgent: navigator.userAgent,
      loginAt: firebase.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.warn("Failed login log not saved:", error);
  }
}

/* -------------------------------------
   BUTTON LOADING
-------------------------------------- */

function setButtonLoading(isLoading) {
  if (!loginBtn) return;

  if (isLoading) {
    loginBtn.disabled = true;
    loginBtn.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Checking Access...</span>
    `;
  } else {
    clearButtonLoading();
  }
}

function clearButtonLoading() {
  if (!loginBtn) return;

  loginBtn.disabled = false;
  loginBtn.innerHTML = `
    <i class="fa-solid fa-right-to-bracket"></i>
    <span>Login to Dashboard</span>
  `;
}

/* -------------------------------------
   POPUP
-------------------------------------- */

function showPopup(type, title, message) {
  if (!popupModal || !modalIcon || !modalTitle || !modalMessage) {
    alert(message || "Something happened.");
    return;
  }

  modalIcon.className = "modal-icon info";
  modalIcon.innerHTML = `<i class="fa-solid fa-circle-info"></i>`;

  if (type === "success") {
    modalIcon.className = "modal-icon success";
    modalIcon.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
  }

  if (type === "error") {
    modalIcon.className = "modal-icon error";
    modalIcon.innerHTML = `<i class="fa-solid fa-circle-xmark"></i>`;
  }

  modalTitle.innerText = title || "Message";
  modalMessage.innerText = message || "";

  popupModal.style.display = "flex";
}

function closePopup() {
  if (popupModal) {
    popupModal.style.display = "none";
  }
}

window.closePopup = closePopup;

if (popupModal) {
  popupModal.addEventListener("click", function (e) {
    if (e.target === popupModal) {
      closePopup();
    }
  });
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    closePopup();
  }
});

/* -------------------------------------
   ERROR MESSAGE
-------------------------------------- */

function getLoginErrorMessage(error) {
  const code = error?.code || "";

  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }

  if (code === "auth/user-not-found") {
    return "No Firebase Authentication account found with this email.";
  }

  if (code === "auth/wrong-password") {
    return "Wrong password. Please try again.";
  }

  if (code === "auth/invalid-login-credentials") {
    return "Wrong email or password.";
  }

  if (code === "auth/too-many-requests") {
    return "Too many failed attempts. Please try again later.";
  }

  if (code === "auth/network-request-failed") {
    return "Network issue. Please check your internet connection.";
  }

  if (code === "permission-denied") {
    return "Firestore permission denied. Please check Firebase rules.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

/* -------------------------------------
   HELPERS
-------------------------------------- */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeRole(role) {
  const value = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  if (value === "superadmin") return "super_admin";
  if (value === "super_admin") return "super_admin";
  if (value === "admin") return "admin";
  if (value === "manager") return "manager";

  return value;
}

function getNameFromEmail(email) {
  if (!email) return "Admin";

  const namePart =
    String(email).split("@")[0] || "Admin";

  return namePart
    .replace(/[._-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}