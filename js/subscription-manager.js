/* =========================================================
   PETRO / RANK CHAHIYE OMS - SUBSCRIPTION & RENEWAL MANAGER
   Version: 2026.09.02.4 PAYMENT PROOF UPLOAD

   Flow:
   - Reads subscription config from Firestore.
   - Shows top warning during configured warning window (default 10 days).
   - Locks the OMS on the expiry date (and after it).
   - Lets the user select a plan + required users.
   - Calculates renewal amount from Firebase plan pricing.
   - Logs a renewal request, opens the configured payment link,
     then lets the customer upload the payment screenshot directly for verification.

   Preferred Firestore document: subscription/current
   Legacy fallback: subscription/TZxEjESFJ6xuT9V3ZGfM
========================================================= */
(function () {
  "use strict";

  if (window.__OMS_SUBSCRIPTION_MANAGER_LOADED__) return;
  window.__OMS_SUBSCRIPTION_MANAGER_LOADED__ = true;

  const VERSION = "2026.09.02.4-proof-upload";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCdfQu5GCsBCyMHM7HX8GRzY-VTZaEMU5M",
    authDomain: "petro-oms.firebaseapp.com",
    projectId: "petro-oms",
    storageBucket: "petro-oms.firebasestorage.app",
    messagingSenderId: "562472760628",
    appId: "1:562472760628:web:384f4eda2c862b6e3ce161"
  };

  const CONFIG = {
    collection: "subscription",
    preferredDocId: "current",
    legacyDocId: "TZxEjESFJ6xuT9V3ZGfM",
    requestsCollection: "renewal_requests",
    cacheKey: "oms_subscription_cache_v2",
    defaultWarningDays: 10,
    defaultWhatsapp: "8750097457",
    refreshEvaluationMs: 60 * 1000
  };

  let db = null;
  let activeDocRef = null;
  let unsubscribe = null;
  let currentConfig = null;
  let currentStatus = null;
  let activeRequestId = null;
  let renewalFlowOpenedFromLock = false;

  const styles = `
    #oms-subscription-banner{position:sticky;top:0;z-index:2147482000;width:100%;font-family:Arial,sans-serif;box-sizing:border-box}
    #oms-subscription-banner *{box-sizing:border-box}
    .oms-sub-banner-inner{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:11px 18px;background:linear-gradient(90deg,#fff7d6,#ffe69c);color:#6f5000;border-bottom:1px solid #f2c94c;box-shadow:0 2px 12px rgba(15,23,42,.12);font-size:14px;font-weight:700}
    .oms-sub-banner-inner.urgent{background:linear-gradient(90deg,#fff1f2,#fee2e2);color:#991b1b;border-bottom-color:#fca5a5}
    .oms-sub-banner-inner strong{font-weight:900}
    .oms-sub-banner-btn{border:0;border-radius:8px;background:#0f766e;color:#fff;padding:7px 13px;font-weight:800;cursor:pointer;box-shadow:0 2px 6px rgba(15,118,110,.25)}
    .oms-sub-banner-btn:hover{filter:brightness(.96)}

    .oms-sub-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.86);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:18px;font-family:Arial,sans-serif;box-sizing:border-box}
    .oms-sub-overlay.visible{display:flex}
    .oms-sub-card{width:min(560px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 30px 80px rgba(0,0,0,.35);padding:28px;position:relative;color:#172033;box-sizing:border-box}
    .oms-sub-lock-card{text-align:center;border-top:6px solid #dc2626}
    .oms-sub-lock-icon{width:76px;height:76px;border-radius:50%;background:#fee2e2;color:#dc2626;display:flex;align-items:center;justify-content:center;margin:2px auto 16px;font-size:34px;font-weight:900}
    .oms-sub-card h2{margin:0 0 10px;font-size:27px;font-weight:900;line-height:1.15;color:#172033}
    .oms-sub-card p{margin:0;color:#64748b;line-height:1.6;font-size:15px}
    .oms-sub-expiry-box{margin:18px 0;padding:13px 15px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155;font-size:14px}
    .oms-sub-primary{width:100%;border:0;border-radius:11px;background:#108082;color:#fff;padding:13px 16px;font-size:15px;font-weight:900;cursor:pointer;margin-top:16px}
    .oms-sub-primary:hover{filter:brightness(.96)}
    .oms-sub-secondary{width:100%;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#334155;padding:11px 16px;font-size:14px;font-weight:800;cursor:pointer;margin-top:9px}
    .oms-sub-link-btn{border:0;background:transparent;color:#0f766e;font-weight:800;cursor:pointer;text-decoration:underline;margin-top:12px}
    .oms-sub-close{position:absolute;right:14px;top:13px;width:34px;height:34px;border:0;border-radius:50%;background:#f1f5f9;color:#475569;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}

    #oms-renewal-flow{z-index:2147483640}
    .oms-renew-header{padding-right:35px;margin-bottom:20px}
    .oms-renew-header small{display:inline-block;margin-bottom:6px;color:#0f766e;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
    .oms-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:15px 0}
    .oms-plan-card{border:2px solid #e2e8f0;border-radius:13px;padding:13px 10px;background:#fff;cursor:pointer;text-align:center;transition:.15s ease;min-height:82px;display:flex;flex-direction:column;justify-content:center}
    .oms-plan-card:hover{border-color:#94a3b8;transform:translateY(-1px)}
    .oms-plan-card.selected{border-color:#108082;background:#ecfeff;box-shadow:0 0 0 2px rgba(16,128,130,.10)}
    .oms-plan-card .name{font-weight:900;color:#1e293b;font-size:14px}
    .oms-plan-card .price{font-size:13px;color:#64748b;margin-top:4px;font-weight:700}
    .oms-renew-field{margin-top:15px;text-align:left}
    .oms-renew-field label{display:block;color:#334155;font-weight:800;font-size:13px;margin-bottom:7px}
    .oms-user-row{display:flex;align-items:center;gap:10px}
    .oms-user-row button{width:42px;height:42px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:9px;font-size:20px;font-weight:900;color:#334155;cursor:pointer}
    .oms-user-row input{flex:1;height:42px;border:1px solid #cbd5e1;border-radius:9px;text-align:center;font-weight:900;font-size:16px;color:#172033}
    .oms-summary{margin-top:18px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:13px;padding:14px}
    .oms-summary-row{display:flex;justify-content:space-between;gap:15px;padding:5px 0;font-size:14px;color:#475569}
    .oms-summary-row.total{margin-top:7px;padding-top:11px;border-top:1px dashed #cbd5e1;color:#172033;font-size:17px;font-weight:900}
    .oms-renew-note{font-size:12px!important;color:#64748b!important;margin-top:10px!important;text-align:center}
    .oms-disabled{opacity:.55;cursor:not-allowed!important}
    .oms-payment-step{text-align:center}
    .oms-payment-step .amount{font-size:34px;font-weight:900;color:#108082;margin:13px 0 4px}
    .oms-ref{font-family:monospace;background:#f1f5f9;border-radius:8px;padding:8px 10px;display:inline-block;margin-top:12px;color:#334155;font-size:12px}
    .oms-success-icon{width:64px;height:64px;border-radius:50%;background:#dcfce7;color:#15803d;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:30px;font-weight:900}
    .oms-error{display:none;margin-top:10px;border-radius:9px;background:#fff1f2;color:#b91c1c;border:1px solid #fecdd3;padding:9px 11px;font-size:12px;font-weight:700}
    .oms-error.show{display:block}

    body.oms-subscription-locked{overflow:hidden!important}
    @media(max-width:620px){
      .oms-sub-card{padding:23px 18px;border-radius:16px}
      .oms-sub-card h2{font-size:23px}
      .oms-plan-grid{grid-template-columns:1fr}
      .oms-plan-card{min-height:auto;flex-direction:row;align-items:center;justify-content:space-between;text-align:left;padding:12px 13px}
      .oms-sub-banner-inner{font-size:13px;padding:9px 10px}
    }
  
    .oms-proof-zone{margin-top:14px;border:1.5px dashed #cbd5e1;border-radius:14px;background:#f8fafc;padding:16px;text-align:center;transition:.16s ease}
    .oms-proof-zone.has-file{border-color:#108082;background:#f0fafa}
    .oms-proof-icon{width:46px;height:46px;border-radius:13px;background:#e6f6f6;color:#108082;display:flex;align-items:center;justify-content:center;margin:0 auto 9px;font-size:22px;font-weight:900}
    .oms-proof-title{font-size:14px;font-weight:900;color:#1e293b;margin-bottom:3px}
    .oms-proof-help{font-size:12px!important;color:#64748b!important;line-height:1.45!important}
    .oms-proof-input{position:absolute;left:-9999px;opacity:0}
    .oms-proof-choose{display:inline-flex;align-items:center;justify-content:center;margin-top:10px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer}
    .oms-proof-preview{display:none;margin-top:12px;border-top:1px solid #e2e8f0;padding-top:12px}
    .oms-proof-preview.visible{display:block}
    .oms-proof-preview img{display:block;width:100%;max-height:220px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;background:#fff}
    .oms-proof-file{margin-top:7px;font-size:11px;color:#64748b;word-break:break-all}
    .oms-proof-submit[disabled]{opacity:.5;cursor:not-allowed;transform:none!important}
    .oms-verification-badge{display:inline-flex;align-items:center;gap:7px;margin:13px auto 2px;padding:7px 11px;border-radius:999px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:900;border:1px solid #fed7aa}
    .oms-pending-icon{width:72px;height:72px;border-radius:50%;background:#fff7ed;color:#d97706;display:flex;align-items:center;justify-content:center;margin:2px auto 16px;font-size:31px;font-weight:900}

`;

  function injectStyle() {
    if (document.getElementById("oms-subscription-style")) return;
    const style = document.createElement("style");
    style.id = "oms-subscription-style";
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function ensureUI() {
    injectStyle();

    if (!document.getElementById("oms-subscription-banner")) {
      const banner = document.createElement("div");
      banner.id = "oms-subscription-banner";
      banner.style.display = "none";
      document.body.insertBefore(banner, document.body.firstChild);
    }

    if (!document.getElementById("oms-subscription-lock")) {
      const lock = document.createElement("div");
      lock.id = "oms-subscription-lock";
      lock.className = "oms-sub-overlay";
      lock.setAttribute("role", "dialog");
      lock.setAttribute("aria-modal", "true");
      lock.innerHTML = `
        <div class="oms-sub-card oms-sub-lock-card">
          <div class="oms-sub-lock-icon">!</div>
          <h2 id="oms-lock-title">Subscription Expired</h2>
          <p id="oms-lock-message">Your OMS subscription has expired. Renew your plan to continue working.</p>
          <div class="oms-sub-expiry-box" id="oms-lock-expiry"></div>
          <button class="oms-sub-primary" id="oms-lock-renew-btn">Renew Subscription</button>
          <button class="oms-sub-link-btn" id="oms-lock-whatsapp-btn">Contact Support on WhatsApp</button>
        </div>`;
      document.body.appendChild(lock);
    }

    if (!document.getElementById("oms-renewal-flow")) {
      const flow = document.createElement("div");
      flow.id = "oms-renewal-flow";
      flow.className = "oms-sub-overlay";
      flow.setAttribute("role", "dialog");
      flow.setAttribute("aria-modal", "true");
      document.body.appendChild(flow);
    }

    bindGlobalButtons();
  }

  function bindGlobalButtons() {
    const renew = document.getElementById("oms-lock-renew-btn");
    const wa = document.getElementById("oms-lock-whatsapp-btn");
    if (renew && !renew.dataset.bound) {
      renew.dataset.bound = "1";
      renew.addEventListener("click", function () {
        renewalFlowOpenedFromLock = true;
        openRenewalFlow();
      });
    }
    if (wa && !wa.dataset.bound) {
      wa.dataset.bound = "1";
      wa.addEventListener("click", function () {
        openSupportWhatsApp();
      });
    }
  }

  function initializeFirebase() {
    if (typeof firebase === "undefined" || !firebase.firestore) {
      console.error("[Subscription Manager] Firebase compat SDK is not available on this page.");
      return false;
    }

    // Reuse the default Firebase app so any existing Firebase Auth session also
    // applies to subscription reads when Firestore rules require authentication.
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    db = firebase.firestore();
    return true;
  }

  function dateToYmd(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function toLocalDate(value) {
    if (!value) return null;
    let d = null;

    if (value && typeof value.toDate === "function") {
      d = value.toDate();
    } else if (value instanceof Date) {
      d = new Date(value.getTime());
    } else if (typeof value === "number") {
      d = new Date(value);
    } else {
      const s = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(`${s}T00:00:00`);
      else d = new Date(s);
    }

    if (!d || isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function normalizePlan(plan, index) {
    const p = plan || {};
    return {
      id: String(p.id || `plan_${index + 1}`),
      name: String(p.name || `Plan ${index + 1}`),
      durationMonths: Math.max(1, Number(p.durationMonths || 1)),
      basePrice: Math.max(0, Number(p.basePrice || 0)),
      includedUsers: Math.max(0, Number(p.includedUsers || 0)),
      extraUserPrice: Math.max(0, Number(p.extraUserPrice || 0)),
      minUsers: Math.max(1, Number(p.minUsers || 1)),
      maxUsers: Math.max(1, Number(p.maxUsers || 100)),
      paymentLink: String(p.paymentLink || "").trim(),
      active: p.active !== false
    };
  }

  function normalizeConfig(raw, docId) {
    const data = raw || {};
    const plans = Array.isArray(data.plans) ? data.plans.map(normalizePlan).filter(p => p.active) : [];
    const expiryValue = data.expiryDate || data.renewalDate || data.expireDate || "";

    return {
      docId: docId || "",
      enabled: data.enabled !== false,
      status: String(data.status || "active").toLowerCase(),
      companyName: String(data.companyName || data.softwareName || "OMS"),
      expiryDate: expiryValue,
      expiryYmd: dateToYmd(toLocalDate(expiryValue)),
      warningDays: Math.max(0, Number(data.warningDays ?? data.renewalWarningDays ?? CONFIG.defaultWarningDays)),
      paymentLink: String(data.paymentLink || data.renewalPaymentLink || "").trim(),
      whatsappNumber: String(data.whatsappNumber || data.supportWhatsapp || CONFIG.defaultWhatsapp).replace(/\D/g, "") || CONFIG.defaultWhatsapp,
      currency: String(data.currency || "INR"),
      allowedUsers: Math.max(0, Number(data.allowedUsers || 0)),
      plans: plans,
      raw: data
    };
  }

  function saveCache(config) {
    try {
      const safe = {
        docId: config.docId,
        enabled: config.enabled,
        status: config.status,
        companyName: config.companyName,
        expiryDate: config.expiryYmd,
        warningDays: config.warningDays,
        paymentLink: config.paymentLink,
        whatsappNumber: config.whatsappNumber,
        currency: config.currency,
        allowedUsers: config.allowedUsers,
        plans: config.plans
      };
      localStorage.setItem(CONFIG.cacheKey, JSON.stringify(safe));
    } catch (_) {}
  }

  function loadCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFIG.cacheKey) || "null");
      if (!raw) return null;
      return normalizeConfig(raw, raw.docId || "cache");
    } catch (_) {
      return null;
    }
  }

  async function resolveSubscriptionDoc() {
    const preferred = db.collection(CONFIG.collection).doc(CONFIG.preferredDocId);
    const preferredSnap = await preferred.get();
    if (preferredSnap.exists) return preferred;

    const legacy = db.collection(CONFIG.collection).doc(CONFIG.legacyDocId);
    const legacySnap = await legacy.get();
    if (legacySnap.exists) return legacy;

    const first = await db.collection(CONFIG.collection).limit(1).get();
    if (!first.empty) return first.docs[0].ref;

    return null;
  }

  async function startSubscriptionListener() {
    try {
      activeDocRef = await resolveSubscriptionDoc();
      if (!activeDocRef) {
        console.warn("[Subscription Manager] No subscription document found. Create subscription/current in Firebase.");
        const cached = loadCache();
        if (cached) applyConfig(cached);
        return;
      }

      if (unsubscribe) unsubscribe();
      unsubscribe = activeDocRef.onSnapshot(
        function (snap) {
          if (!snap.exists) return;
          const cfg = normalizeConfig(snap.data(), snap.id);
          currentConfig = cfg;
          saveCache(cfg);
          applyConfig(cfg);
        },
        function (error) {
          console.error("[Subscription Manager] Subscription listener error:", error);
          const cached = loadCache();
          if (cached) {
            currentConfig = cached;
            applyConfig(cached);
          }
        }
      );
    } catch (error) {
      console.error("[Subscription Manager] Subscription load failed:", error);
      const cached = loadCache();
      if (cached) {
        currentConfig = cached;
        applyConfig(cached);
      }
    }
  }

  function daysUntil(expiryDate) {
    const exp = toLocalDate(expiryDate);
    if (!exp) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((exp.getTime() - today.getTime()) / 86400000);
  }

  function formatDate(date) {
    const d = toLocalDate(date);
    if (!d) return "Not configured";
    try {
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch (_) {
      return dateToYmd(d);
    }
  }

  function evaluateStatus(config) {
    if (!config || !config.enabled) return { type: "disabled", days: null };

    if (["suspended", "blocked", "expired", "inactive"].includes(config.status)) {
      return { type: "expired", days: daysUntil(config.expiryDate) };
    }

    const days = daysUntil(config.expiryDate);
    if (days === null) return { type: "not_configured", days: null };
    if (days <= 0) return { type: "expired", days };
    if (days <= config.warningDays) return { type: "warning", days };
    return { type: "active", days };
  }

  function applyConfig(config) {
    ensureUI();
    currentStatus = evaluateStatus(config);
    renderBanner(config, currentStatus);

    if (currentStatus.type === "expired") lockApplication(config, currentStatus);
    else unlockApplication();
  }

  function renderBanner(config, status) {
    const banner = document.getElementById("oms-subscription-banner");
    if (!banner) return;

    if (status.type !== "warning") {
      banner.style.display = "none";
      banner.innerHTML = "";
      return;
    }

    const urgentClass = status.days <= 3 ? " urgent" : "";
    const dayText = status.days === 1 ? "1 day" : `${status.days} days`;
    banner.innerHTML = `
      <div class="oms-sub-banner-inner${urgentClass}">
        <span>⚠️ <strong>Subscription Expiring Soon:</strong> ${dayText} left · Valid till ${escapeHtml(formatDate(config.expiryDate))}</span>
        <button type="button" class="oms-sub-banner-btn" id="oms-banner-renew">Renew Now</button>
      </div>`;
    banner.style.display = "block";

    document.getElementById("oms-banner-renew")?.addEventListener("click", function () {
      renewalFlowOpenedFromLock = false;
      openRenewalFlow();
    });
  }

  function lockApplication(config, status) {
    document.body.classList.add("oms-subscription-locked");
    const lock = document.getElementById("oms-subscription-lock");
    if (!lock) return;

    const title = document.getElementById("oms-lock-title");
    const msg = document.getElementById("oms-lock-message");
    const exp = document.getElementById("oms-lock-expiry");

    if (status.days === 0) {
      if (title) title.textContent = "Subscription Expired Today";
      if (msg) msg.textContent = "Your OMS plan expires today. Work has been paused until the subscription is renewed.";
    } else {
      if (title) title.textContent = "Subscription Expired";
      if (msg) msg.textContent = "Your OMS subscription has expired. Your data is safe, but working access is paused until renewal.";
    }

    if (exp) exp.innerHTML = `<strong>Expiry Date:</strong> ${escapeHtml(formatDate(config.expiryDate))}<br><span style="color:#64748b">Renew the plan to continue using the OMS.</span>`;
    lock.classList.add("visible");

    installLockGuards();
  }

  function unlockApplication() {
    document.body.classList.remove("oms-subscription-locked");
    document.getElementById("oms-subscription-lock")?.classList.remove("visible");
    removeLockGuards();
  }

  function isManagerElement(target) {
    return !!(target && target.closest && target.closest("#oms-subscription-lock, #oms-renewal-flow, #oms-subscription-banner"));
  }

  function guardEvent(event) {
    if (!document.body.classList.contains("oms-subscription-locked")) return;
    if (isManagerElement(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function installLockGuards() {
    if (window.__OMS_LOCK_GUARDS__) return;
    window.__OMS_LOCK_GUARDS__ = true;
    ["click", "dblclick", "submit", "keydown", "touchstart"].forEach(type => {
      document.addEventListener(type, guardEvent, true);
    });
  }

  function removeLockGuards() {
    if (!window.__OMS_LOCK_GUARDS__) return;
    window.__OMS_LOCK_GUARDS__ = false;
    ["click", "dblclick", "submit", "keydown", "touchstart"].forEach(type => {
      document.removeEventListener(type, guardEvent, true);
    });
  }

  function getPlans() {
    return (currentConfig?.plans || []).filter(p => p.active);
  }

  function openRenewalFlow() {
    ensureUI();
    const flow = document.getElementById("oms-renewal-flow");
    if (!flow) return;
    activeRequestId = null;

    const plans = getPlans();
    if (!plans.length) {
      flow.innerHTML = `
        <div class="oms-sub-card">
          ${renewalFlowOpenedFromLock ? "" : '<button class="oms-sub-close" id="oms-renew-close">×</button>'}
          <div class="oms-renew-header"><small>Renewal</small><h2>Plan Pricing Not Configured</h2><p>Please contact support to complete your renewal.</p></div>
          <button class="oms-sub-primary" id="oms-no-plan-wa">Contact on WhatsApp</button>
        </div>`;
      flow.classList.add("visible");
      document.getElementById("oms-renew-close")?.addEventListener("click", closeRenewalFlow);
      document.getElementById("oms-no-plan-wa")?.addEventListener("click", openSupportWhatsApp);
      return;
    }

    const first = plans[0];
    flow.innerHTML = `
      <div class="oms-sub-card">
        ${renewalFlowOpenedFromLock ? "" : '<button class="oms-sub-close" id="oms-renew-close">×</button>'}
        <div class="oms-renew-header">
          <small>Subscription Renewal</small>
          <h2>Choose Your Plan</h2>
          <p>Select the renewal plan and number of users required. The amount is calculated from your Firebase pricing.</p>
        </div>
        <div class="oms-plan-grid" id="oms-plan-grid"></div>
        <div class="oms-renew-field">
          <label>How many users do you need?</label>
          <div class="oms-user-row">
            <button type="button" id="oms-user-minus">−</button>
            <input type="number" id="oms-user-count" min="1" value="${Math.max(first.minUsers, currentConfig?.allowedUsers || first.includedUsers || 1)}">
            <button type="button" id="oms-user-plus">+</button>
          </div>
        </div>
        <div class="oms-summary" id="oms-renew-summary"></div>
        <div class="oms-error" id="oms-renew-error"></div>
        <button class="oms-sub-primary" id="oms-proceed-payment">Proceed to Payment</button>
        <p class="oms-renew-note">After payment, send the payment screenshot on WhatsApp for verification and activation.</p>
      </div>`;

    flow.classList.add("visible");
    renderPlans(first.id);
    updateRenewalSummary();

    document.getElementById("oms-renew-close")?.addEventListener("click", closeRenewalFlow);
    document.getElementById("oms-user-minus")?.addEventListener("click", () => stepUsers(-1));
    document.getElementById("oms-user-plus")?.addEventListener("click", () => stepUsers(1));
    document.getElementById("oms-user-count")?.addEventListener("input", updateRenewalSummary);
    document.getElementById("oms-proceed-payment")?.addEventListener("click", proceedToPayment);
  }

  function renderPlans(selectedId) {
    const grid = document.getElementById("oms-plan-grid");
    if (!grid) return;

    const plans = getPlans();
    grid.innerHTML = plans.map(p => {
      const priceLabel = p.basePrice > 0 ? `Starts at ${formatCurrency(p.basePrice)}` : "Price not configured";
      return `<button type="button" class="oms-plan-card ${p.id === selectedId ? "selected" : ""}" data-plan-id="${escapeHtml(p.id)}">
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="price">${escapeHtml(priceLabel)}</span>
      </button>`;
    }).join("");

    grid.querySelectorAll(".oms-plan-card").forEach(btn => {
      btn.addEventListener("click", function () {
        grid.querySelectorAll(".oms-plan-card").forEach(x => x.classList.remove("selected"));
        this.classList.add("selected");
        const p = selectedPlan();
        const input = document.getElementById("oms-user-count");
        if (p && input) {
          let n = Number(input.value || 1);
          n = Math.min(p.maxUsers, Math.max(p.minUsers, n));
          input.value = String(n);
        }
        updateRenewalSummary();
      });
    });
  }

  function selectedPlan() {
    const id = document.querySelector("#oms-plan-grid .oms-plan-card.selected")?.dataset.planId;
    return getPlans().find(p => p.id === id) || getPlans()[0] || null;
  }

  function userCountFor(plan) {
    const input = document.getElementById("oms-user-count");
    let count = Math.round(Number(input?.value || 1));
    if (!Number.isFinite(count)) count = 1;
    count = Math.max(plan?.minUsers || 1, count);
    count = Math.min(plan?.maxUsers || 100, count);
    if (input && String(count) !== input.value) input.value = String(count);
    return count;
  }

  function stepUsers(delta) {
    const p = selectedPlan();
    if (!p) return;
    const input = document.getElementById("oms-user-count");
    if (!input) return;
    input.value = String(Math.min(p.maxUsers, Math.max(p.minUsers, Number(input.value || 1) + delta)));
    updateRenewalSummary();
  }

  function calculateAmount(plan, users) {
    if (!plan) return 0;
    const extraUsers = Math.max(0, users - plan.includedUsers);
    return Number(plan.basePrice || 0) + extraUsers * Number(plan.extraUserPrice || 0);
  }

  function updateRenewalSummary() {
    const plan = selectedPlan();
    const summary = document.getElementById("oms-renew-summary");
    const proceed = document.getElementById("oms-proceed-payment");
    if (!plan || !summary) return;

    const users = userCountFor(plan);
    const extraUsers = Math.max(0, users - plan.includedUsers);
    const extraAmount = extraUsers * plan.extraUserPrice;
    const total = calculateAmount(plan, users);

    summary.innerHTML = `
      <div class="oms-summary-row"><span>Plan</span><strong>${escapeHtml(plan.name)}</strong></div>
      <div class="oms-summary-row"><span>Required Users</span><strong>${users}</strong></div>
      <div class="oms-summary-row"><span>Plan Price (${plan.includedUsers} user${plan.includedUsers === 1 ? "" : "s"} included)</span><strong>${formatCurrency(plan.basePrice)}</strong></div>
      <div class="oms-summary-row"><span>Extra Users (${extraUsers} × ${formatCurrency(plan.extraUserPrice)})</span><strong>${formatCurrency(extraAmount)}</strong></div>
      <div class="oms-summary-row total"><span>Total Payable</span><span>${formatCurrency(total)}</span></div>`;

    if (proceed) {
      const paymentLink = plan.paymentLink || currentConfig?.paymentLink || "";
      const invalid = total <= 0 || !paymentLink;
      proceed.classList.toggle("oms-disabled", invalid);
      proceed.dataset.invalid = invalid ? "1" : "0";
      proceed.textContent = !paymentLink ? "Payment Link Not Configured" : (total <= 0 ? "Pricing Not Configured" : `Proceed to Payment · ${formatCurrency(total)}`);
    }
  }

  function showRenewalError(message) {
    const el = document.getElementById("oms-renew-error");
    if (!el) return;
    el.textContent = message || "Something went wrong.";
    el.classList.add("show");
  }

  async function proceedToPayment() {
    const btn = document.getElementById("oms-proceed-payment");
    if (btn?.dataset.invalid === "1") {
      showRenewalError("Please ask the software owner to configure plan pricing and the payment link in Firebase.");
      return;
    }

    const plan = selectedPlan();
    if (!plan) return;
    const users = userCountFor(plan);
    const amount = calculateAmount(plan, users);
    const paymentLink = plan.paymentLink || currentConfig?.paymentLink || "";

    if (!paymentLink || amount <= 0) {
      showRenewalError("Payment configuration is incomplete.");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Preparing Payment...";
    }

    try {
      activeRequestId = await createRenewalRequest(plan, users, amount, paymentLink);
    } catch (error) {
      console.error("[Subscription Manager] Renewal request logging failed:", error);
      activeRequestId = `LOCAL-${Date.now()}`;
    }

    const opened = window.open(paymentLink, "_blank", "noopener,noreferrer");
    if (!opened) {
      // Browser popup blockers may block the new tab; give the user a direct button on the next step.
      console.warn("[Subscription Manager] Payment popup may have been blocked.");
    }

    showPaymentVerificationStep(plan, users, amount, paymentLink);
  }

  async function createRenewalRequest(plan, users, amount, paymentLink) {
    if (!db) throw new Error("Firestore unavailable");

    const requester = {
      name: localStorage.getItem("adminName") || localStorage.getItem("user_name") || localStorage.getItem("salesman") || localStorage.getItem("loggedSalesman") || "OMS User",
      email: localStorage.getItem("adminEmail") || localStorage.getItem("user_email") || "",
      role: localStorage.getItem("adminRole") || localStorage.getItem("user_role") || (localStorage.getItem("salesman") ? "sales" : "")
    };

    const payload = {
      subscriptionDocId: currentConfig?.docId || "",
      companyName: currentConfig?.companyName || "OMS",
      planId: plan.id,
      planName: plan.name,
      durationMonths: plan.durationMonths,
      requestedUsers: users,
      amount: amount,
      currency: currentConfig?.currency || "INR",
      paymentLink: paymentLink,
      currentExpiryDate: currentConfig?.expiryYmd || "",
      status: "payment_pending",
      requester: requester,
      sourcePage: location.pathname,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      clientCreatedAt: new Date().toISOString(),
      appVersion: VERSION
    };

    const ref = await db.collection(CONFIG.requestsCollection).add(payload);
    return ref.id;
  }

  function showPaymentVerificationStep(plan, users, amount, paymentLink) {
    const flow = document.getElementById("oms-renewal-flow");
    if (!flow) return;

    flow.innerHTML = `
      <div class="oms-sub-card oms-payment-step">
        ${renewalFlowOpenedFromLock ? "" : '<button class="oms-sub-close" id="oms-renew-close">×</button>'}
        <div class="oms-success-icon">₹</div>
        <h2>Complete Payment</h2>
        <p>Use the payment page, then upload your payment screenshot here for verification.</p>
        <div class="amount">${formatCurrency(amount)}</div>
        <p><strong>${escapeHtml(plan.name)}</strong> · ${users} User${users === 1 ? "" : "s"}</p>
        <div class="oms-ref">Renewal Ref: ${escapeHtml(activeRequestId || "Pending")}</div>

        <button class="oms-sub-primary" id="oms-open-payment-again">Open Payment Link</button>

        <div class="oms-proof-zone" id="oms-proof-zone">
          <div class="oms-proof-icon">↥</div>
          <div class="oms-proof-title">Upload Payment Screenshot</div>
          <p class="oms-proof-help">After completing the payment, upload a clear screenshot of the successful transaction.</p>
          <input class="oms-proof-input" id="oms-payment-proof" type="file" accept="image/png,image/jpeg,image/webp">
          <label class="oms-proof-choose" for="oms-payment-proof">Choose Screenshot</label>
          <div class="oms-proof-preview" id="oms-proof-preview">
            <img id="oms-proof-image" alt="Payment screenshot preview">
            <div class="oms-proof-file" id="oms-proof-file"></div>
          </div>
        </div>

        <button class="oms-sub-secondary oms-proof-submit" id="oms-submit-proof" disabled>Submit for Verification</button>
        <p class="oms-renew-note">Accepted: JPG, PNG or WEBP. The image is optimized before submission.</p>
      </div>`;

    document.getElementById("oms-renew-close")?.addEventListener("click", closeRenewalFlow);
    document.getElementById("oms-open-payment-again")?.addEventListener("click", () => window.open(paymentLink, "_blank", "noopener,noreferrer"));

    const input = document.getElementById("oms-payment-proof");
    const submit = document.getElementById("oms-submit-proof");
    let selectedFile = null;

    input?.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        alert("Please upload a JPG, PNG or WEBP screenshot.");
        input.value = "";
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        alert("Screenshot is too large. Please upload an image below 12 MB.");
        input.value = "";
        return;
      }
      selectedFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        const img = document.getElementById("oms-proof-image");
        if (img) img.src = reader.result;
        document.getElementById("oms-proof-preview")?.classList.add("visible");
        document.getElementById("oms-proof-zone")?.classList.add("has-file");
        const info = document.getElementById("oms-proof-file");
        if (info) info.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
        if (submit) submit.disabled = false;
      };
      reader.readAsDataURL(file);
    });

    submit?.addEventListener("click", async function () {
      if (!selectedFile) return;
      submit.disabled = true;
      submit.textContent = "Uploading & Submitting...";
      try {
        await submitPaymentProof(selectedFile, plan, users, amount);
      } catch (e) {
        console.error("[Subscription Manager] Proof submit failed:", e);
        alert("Could not submit the screenshot. Please try again. " + (e?.message || ""));
        submit.disabled = false;
        submit.textContent = "Submit for Verification";
      }
    });
  }

  async function compressPaymentProof(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });

    const maxSide = 1280;
    let w = image.width, h = image.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);

    let quality = 0.78;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > 760000 && quality > 0.46) {
      quality -= 0.08;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    if (out.length > 900000) throw new Error("Screenshot is still too large after optimization. Please crop it and try again.");
    return { dataUrl: out, width: w, height: h, originalName: file.name, originalType: file.type, originalSize: file.size };
  }

  async function submitPaymentProof(file, plan, users, amount) {
    if (!db || !activeRequestId || activeRequestId.startsWith("LOCAL-")) {
      throw new Error("Renewal request is not connected to Firebase.");
    }

    const proof = await compressPaymentProof(file);
    await db.collection(CONFIG.requestsCollection).doc(activeRequestId).set({
      status: "verification_pending",
      paymentProofDataUrl: proof.dataUrl,
      paymentProofName: proof.originalName,
      paymentProofType: proof.originalType,
      paymentProofOriginalSize: proof.originalSize,
      paymentProofWidth: proof.width,
      paymentProofHeight: proof.height,
      verificationSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      clientVerificationSubmittedAt: new Date().toISOString()
    }, { merge: true });

    showVerificationPending(plan, users, amount);
  }

  function showVerificationPending(plan, users, amount) {
    const flow = document.getElementById("oms-renewal-flow");
    if (!flow) return;
    flow.innerHTML = `
      <div class="oms-sub-card oms-payment-step" style="text-align:center">
        ${renewalFlowOpenedFromLock ? "" : '<button class="oms-sub-close" id="oms-renew-close">×</button>'}
        <div class="oms-pending-icon">⌛</div>
        <h2>Payment Proof Submitted</h2>
        <p>Your screenshot has been received successfully.</p>
        <div class="oms-verification-badge">Verification Pending</div>
        <div class="amount" style="margin-top:14px">${formatCurrency(amount)}</div>
        <p><strong>${escapeHtml(plan.name)}</strong> · ${users} User${users === 1 ? "" : "s"}</p>
        <div class="oms-ref">Renewal Ref: ${escapeHtml(activeRequestId || "Pending")}</div>
        <div class="oms-sub-expiry-box"><strong>What happens next?</strong><br>Your payment will be verified by the administrator. Once approved, your subscription will be activated automatically.</div>
        <button class="oms-sub-primary" id="oms-verification-ok">Okay</button>
      </div>`;
    document.getElementById("oms-renew-close")?.addEventListener("click", closeRenewalFlow);
    document.getElementById("oms-verification-ok")?.addEventListener("click", closeRenewalFlow);
  }

  async function openVerificationWhatsApp(plan, users, amount) {
    const ref = activeRequestId || "N/A";
    const msg = [
      "Hello,",
      "",
      "I have completed my OMS renewal payment.",
      "",
      `Renewal Ref: ${ref}`,
      `Company: ${currentConfig?.companyName || "OMS"}`,
      `Plan: ${plan.name}`,
      `Users Required: ${users}`,
      `Amount Paid: ${formatCurrency(amount)}`,
      `Previous Expiry: ${currentConfig?.expiryYmd || "N/A"}`,
      "",
      "I am attaching the payment screenshot. Please verify and activate my subscription."
    ].join("\n");

    if (db && activeRequestId && !activeRequestId.startsWith("LOCAL-")) {
      try {
        await db.collection(CONFIG.requestsCollection).doc(activeRequestId).set({
          status: "verification_sent",
          whatsappOpenedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.warn("[Subscription Manager] Could not update WhatsApp status:", e);
      }
    }

    openWhatsApp(currentConfig?.whatsappNumber || CONFIG.defaultWhatsapp, msg);
  }

  function openSupportWhatsApp() {
    const msg = [
      "Hello,",
      "I need help with my OMS subscription renewal.",
      `Company: ${currentConfig?.companyName || "OMS"}`,
      `Expiry Date: ${currentConfig?.expiryYmd || "N/A"}`
    ].join("\n");
    openWhatsApp(currentConfig?.whatsappNumber || CONFIG.defaultWhatsapp, msg);
  }

  function openWhatsApp(number, message) {
    let n = String(number || CONFIG.defaultWhatsapp).replace(/\D/g, "");
    if (n.length === 10) n = `91${n}`;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(message || "")}`, "_blank", "noopener,noreferrer");
  }

  function closeRenewalFlow() {
    if (renewalFlowOpenedFromLock && currentStatus?.type === "expired") return;
    document.getElementById("oms-renewal-flow")?.classList.remove("visible");
  }

  function formatCurrency(value) {
    const n = Number(value || 0);
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: currentConfig?.currency || "INR", maximumFractionDigits: 2 }).format(n);
    } catch (_) {
      return `₹${n.toLocaleString("en-IN")}`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function reEvaluate() {
    if (currentConfig) applyConfig(currentConfig);
  }

  function boot() {
    ensureUI();
    if (!initializeFirebase()) return;
    startSubscriptionListener();
    setInterval(reEvaluate, CONFIG.refreshEvaluationMs);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) reEvaluate();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.OMSSubscription = {
    version: VERSION,
    openRenewal: function () { renewalFlowOpenedFromLock = false; openRenewalFlow(); },
    getConfig: function () { return currentConfig; },
    getStatus: function () { return currentStatus; },
    refresh: reEvaluate
  };
})();
