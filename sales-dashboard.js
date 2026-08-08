"use strict";

/*
 * PETRO OMS - Sales Dashboard
 * End-to-end replacement JavaScript
 * Version: 2026.08.04.1
 *
 * Main improvements:
 * - Safer login/session handling
 * - Salesman-prefix Firestore queries instead of loading all recent records
 * - Orders/products merge with duplicate protection
 * - Search/filter UI automatically injected if HTML does not contain it
 * - Correct dashboard counts
 * - Robust pagination
 * - Safer HTML rendering
 * - Hold/Cancel reason handling
 * - Status rollback on Firestore failure
 * - Reliable Google Drive upload errors and timeout handling
 * - Drag/drop preview for JPG/PNG/WEBP/PDF
 * - Dark-mode persistence
 * - Better modal, bill, view, edit, and PDF download logic
 */

(() => {
  const CONFIG = Object.freeze({
    APP_VERSION: "2026.08.04.1",

    // Replace this with the latest deployed Apps Script /exec URL.
    DRIVE_UPLOAD_URL:
      "https://script.google.com/macros/s/AKfycbyvLw_BrRXcDI7lRsVE3gZZa11z_km1F1g_pk7pytl4Tl1IT2wEqxsjiVBorW-cBf1D/exec",

    SESSION_TIME_MS: 24 * 60 * 60 * 1000,
    MAX_BILL_FILE_SIZE: 5 * 1024 * 1024,
    DRIVE_UPLOAD_TIMEOUT_MS: 90 * 1000,
    ORDERS_FETCH_LIMIT: 1000,
    PRODUCTS_FETCH_LIMIT: 1000,
    DEFAULT_ROWS_PER_PAGE: 10,
    EDIT_WINDOW_MS: 15 * 60 * 1000,

    ALLOWED_BILL_TYPES: Object.freeze([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf"
    ]),

    SALESMAN_PREFIX: Object.freeze({
      "Sariya Murtuza": "SM",
      "Roshan Sharma": "RS",
      "Amit Soni": "AS",
      "Ankit Kalra": "AK",
      "Vivek Srivastava": "VS",
      "Rup Ranjan Bora": "RRB",
      "Ashutosh Satapathy": "ASO"
    })
  });

  const state = {
    db: null,
    salesman: "",
    prefix: "",
    ordersMap: new Map(),
    productTopMap: new Map(),
    productNestedMap: new Map(),
    allOrders: [],
    currentPage: 1,
    rowsPerPage: CONFIG.DEFAULT_ROWS_PER_PAGE,
    filters: {
      search: "",
      status: "",
      bill: "",
      dateFrom: "",
      dateTo: "",
      minAmount: "",
      maxAmount: ""
    },
    unsubscribers: [],
    searchTimer: null,
    initialized: false
  };

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                    */
  /* -------------------------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);

  function log(...args) {
    console.log("[PETRO Sales Dashboard]", ...args);
  }

  function warn(...args) {
    console.warn("[PETRO Sales Dashboard]", ...args);
  }

  function fail(...args) {
    console.error("[PETRO Sales Dashboard]", ...args);
  }

  function escapeHTML(value) {
    return String(value ?? "-")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHTML(value).replaceAll("`", "&#096;");
  }

  function normalizeString(value) {
    return String(value ?? "").trim();
  }

  function normalizeStatus(value) {
    return normalizeString(value) || "Pending";
  }

  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatMoney(value) {
    return toFiniteNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getLoggedSalesman() {
    return (
      localStorage.getItem("loggedSalesman") ||
      localStorage.getItem("salesman") ||
      ""
    ).trim();
  }

  function getCurrentUserName() {
    return (
      localStorage.getItem("user_name") ||
      getLoggedSalesman() ||
      "Unknown"
    );
  }

  function resolveSalesmanPrefix(salesman) {
    return (
      localStorage.getItem("salesmanPrefix") ||
      CONFIG.SALESMAN_PREFIX[salesman] ||
      ""
    ).trim();
  }

  function clearLoginSession() {
    [
      "loggedSalesman",
      "salesman",
      "salesmanPrefix",
      "loginTime",
      "user_name",
      "user_role"
    ].forEach((key) => localStorage.removeItem(key));
  }

  function redirectToLogin(message = "") {
    if (message) alert(message);
    window.location.replace("sales-login.html");
  }

  function getMillis(value) {
    if (!value) return 0;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? 0 : value.getTime();
    }

    if (typeof value.toDate === "function") {
      const date = value.toDate();
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    if (typeof value.seconds === "number") {
      return value.seconds * 1000;
    }

    if (typeof value._seconds === "number") {
      return value._seconds * 1000;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function parseDateValue(value) {
    if (!value) return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value.toDate === "function") {
      const date = value.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value.seconds === "number") {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = normalizeString(value);
    if (!text) return null;

    // Supports DD-MM-YYYY and DD/MM/YYYY.
    const indianDate = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (indianDate) {
      const day = Number(indianDate[1]);
      const month = Number(indianDate[2]) - 1;
      const year = Number(indianDate[3]);
      const date = new Date(year, month, day);

      if (
        date.getFullYear() === year &&
        date.getMonth() === month &&
        date.getDate() === day
      ) {
        return date;
      }

      return null;
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getOrderDateValue(order) {
    return (
      parseDateValue(order.savedAt) ||
      parseDateValue(order.createdAt) ||
      parseDateValue(order.orderDate) ||
      null
    );
  }

  function getOrderById(orderId) {
    return state.allOrders.find((order) => order.id === orderId) || null;
  }

  function isAllowedSource(source) {
    return source === "orders" || source === "products";
  }

  function safeSource(source) {
    return isAllowedSource(source) ? source : "orders";
  }

  function isSafeHttpUrl(value) {
    try {
      const url = new URL(String(value), window.location.href);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
      return false;
    }
  }

  function debounceSearch(callback, wait = 180) {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(callback, wait);
  }

  /* -------------------------------------------------------------------------- */
  /* Login, Firebase, dark mode                                                  */
  /* -------------------------------------------------------------------------- */

  function validateSession() {
    const salesman = getLoggedSalesman();
    const loginTimeText = localStorage.getItem("loginTime");
    const loginTime = Number(loginTimeText);

    if (!salesman || !loginTimeText || !Number.isFinite(loginTime)) {
      redirectToLogin("Please login first!");
      return false;
    }

    if (Date.now() - loginTime > CONFIG.SESSION_TIME_MS) {
      clearLoginSession();
      redirectToLogin("Your session has expired. Please login again.");
      return false;
    }

    const prefix = resolveSalesmanPrefix(salesman);

    if (!prefix) {
      fail("No order prefix configured for salesman:", salesman);
      alert(
        "Salesman prefix configuration is missing. Please contact the administrator."
      );
      return false;
    }

    state.salesman = salesman;
    state.prefix = prefix;

    const adminName = $("adminName");
    const welcome = $("welcome");

    if (adminName) adminName.textContent = salesman;
    if (welcome) welcome.textContent = salesman;

    return true;
  }

  function initFirebase() {
    if (typeof firebase === "undefined" || !firebase.firestore) {
      throw new Error(
        "Firebase SDK or firebaseconfig.js is not loaded before sales-dashboard.js"
      );
    }

    state.db = firebase.firestore();
  }

  function restoreDarkMode() {
    const enabled = localStorage.getItem("petro_dark") === "true";
    document.body.classList.toggle("dark", enabled);

    const toggle = $("darkToggle");
    if (toggle) toggle.checked = enabled;
  }

  function toggleDarkMode() {
    const toggle = $("darkToggle");
    const enabled = Boolean(toggle?.checked);
    document.body.classList.toggle("dark", enabled);
    localStorage.setItem("petro_dark", String(enabled));
  }

  window.toggleDarkMode = toggleDarkMode;

  /* -------------------------------------------------------------------------- */
  /* Filter UI                                                                   */
  /* -------------------------------------------------------------------------- */

  function ensureFilterUI() {
    if ($("orderSearch")) return;

    const tableWrap = document.querySelector(".myq-table-wrap");
    if (!tableWrap) {
      warn("Filter UI could not be inserted: .myq-table-wrap not found");
      return;
    }

    tableWrap.insertAdjacentHTML(
      "beforebegin",
      `
      <section class="petro-filter-panel" aria-label="Order filters">
        <div class="petro-filter-grid">
          <label class="petro-filter-field petro-filter-search">
            <span><i class="fa fa-search"></i> Search</span>
            <input id="orderSearch" type="search" placeholder="Order no, party or mobile" autocomplete="off">
          </label>

          <label class="petro-filter-field">
            <span>Status</span>
            <select id="statusFilter">
              <option value="">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Quotation Sent">Quotation Sent</option>
              <option value="Payment Received">Payment Received</option>
              <option value="Partial Delivered">Partial Delivered</option>
              <option value="Delivered">Delivered</option>
              <option value="Hold">Hold</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>

          <label class="petro-filter-field">
            <span>Bill</span>
            <select id="billFilter">
              <option value="">All bills</option>
              <option value="uploaded">Bill uploaded</option>
              <option value="pending">Bill pending</option>
            </select>
          </label>

          <label class="petro-filter-field">
            <span>Date from</span>
            <input id="dateFromFilter" type="date">
          </label>

          <label class="petro-filter-field">
            <span>Date to</span>
            <input id="dateToFilter" type="date">
          </label>

          <label class="petro-filter-field">
            <span>Min amount</span>
            <input id="minAmountFilter" type="number" min="0" step="0.01" placeholder="₹ 0">
          </label>

          <label class="petro-filter-field">
            <span>Max amount</span>
            <input id="maxAmountFilter" type="number" min="0" step="0.01" placeholder="₹ 0">
          </label>

          <button type="button" id="resetFiltersBtn" class="petro-reset-filter">
            <i class="fa fa-rotate-left"></i> Reset
          </button>
        </div>
      </section>
      `
    );

    if (!$("petro-dashboard-runtime-styles")) {
      const style = document.createElement("style");
      style.id = "petro-dashboard-runtime-styles";
      style.textContent = `
        .petro-filter-panel{margin:20px 0 0;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
        .petro-filter-grid{display:grid;grid-template-columns:2fr repeat(6,minmax(130px,1fr)) auto;gap:12px;align-items:end}
        .petro-filter-field{display:flex;flex-direction:column;gap:6px;margin:0;font-size:12px;font-weight:700;color:#334155}
        .petro-filter-field span{display:flex;gap:6px;align-items:center}
        .petro-filter-field input,.petro-filter-field select{width:100%;height:42px;border:1px solid #cbd5e1;border-radius:10px;padding:0 12px;background:#fff;color:#111827;outline:none}
        .petro-filter-field input:focus,.petro-filter-field select:focus{border-color:#108082;box-shadow:0 0 0 3px rgba(16,128,130,.12)}
        .petro-reset-filter{height:42px;border:0;border-radius:10px;padding:0 16px;background:#0f766e;color:#fff;font-weight:700;white-space:nowrap;cursor:pointer}
        .petro-reset-filter:hover{filter:brightness(.96)}
        .dark .petro-filter-panel{background:#111827;border-color:#374151}
        .dark .petro-filter-field{color:#d1d5db}
        .dark .petro-filter-field input,.dark .petro-filter-field select{background:#1f2937;border-color:#4b5563;color:#f9fafb}
        .status-dropdown.is-saving{opacity:.65;pointer-events:none}
        .ubill-message{padding:10px 12px;border-radius:10px;margin-top:12px;font-size:13px;font-weight:600}
        .ubill-message.error{background:#fee2e2;color:#991b1b}
        .ubill-message.info{background:#e0f2fe;color:#075985}
        .view-order-wrap .modal-items-table{min-width:720px}
        .modal-section-scroll{overflow:auto}
        @media(max-width:1400px){.petro-filter-grid{grid-template-columns:repeat(4,minmax(150px,1fr))}.petro-filter-search{grid-column:span 2}}
        @media(max-width:768px){.petro-filter-grid{grid-template-columns:1fr 1fr}.petro-filter-search{grid-column:1/-1}.petro-reset-filter{width:100%}}
        @media(max-width:520px){.petro-filter-grid{grid-template-columns:1fr}.petro-filter-search{grid-column:auto}}
      `;
      document.head.appendChild(style);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Firestore normalization                                                     */
  /* -------------------------------------------------------------------------- */

  function normalizeItem(item = {}) {
    const qty = toFiniteNumber(item.qty ?? item.quantity);
    const rate = toFiniteNumber(item.rate ?? item.price);
    const amount = toFiniteNumber(item.amount, qty * rate);

    return {
      ...item,
      code: item.code || item.itemCode || item.name || "-",
      itemName:
        item.itemName ||
        item.productName ||
        item.name ||
        item.description ||
        "-",
      unit: item.unit || item.uom || "-",
      qty,
      rate,
      amount
    };
  }

  function normalizeOrderDocument(doc, source) {
    const data = doc.data() || {};
    const partyData = data.party || data.partyDetails || {};
    const orderNo =
      data.orderNo ||
      data.partyDetails?.orderNo ||
      data.party?.orderNo ||
      "";

    const rawItems =
      data.cartItems ||
      data.items ||
      data.orderItems ||
      data.productList ||
      data.cart ||
      [];

    return {
      ...data,
      id: doc.id,
      source: safeSource(source),
      orderNo,
      orderDate:
        data.orderDate ||
        data.partyDetails?.orderDate ||
        data.party?.orderDate ||
        "-",
      status: normalizeStatus(data.status),
      billImage: data.billImage || data.billUrl || null,
      billUrl: data.billUrl || data.billImage || null,
      billAmount:
        data.billAmount === null || data.billAmount === undefined
          ? null
          : toFiniteNumber(data.billAmount),
      grandTotal: toFiniteNumber(data.grandTotal),
      subTotal: toFiniteNumber(data.subTotal ?? data.subtotal),
      freight: toFiniteNumber(data.freight),
      specialDiscount: toFiniteNumber(data.specialDiscount),
      gstAmount: toFiniteNumber(data.gstAmount),
      cancelRemark:
        data.cancelRemark || data.statusRemark || data.holdRemark || "",
      categoryDiscounts: {
        hardware: toFiniteNumber(data.categoryDiscounts?.hardware),
        bathroom: toFiniteNumber(data.categoryDiscounts?.bathroom),
        stainlesssteel: toFiniteNumber(
          data.categoryDiscounts?.stainlesssteel ??
            data.categoryDiscounts?.stainlessSteel
        )
      },
      party: {
        ...partyData,
        name:
          data.partyName ||
          partyData.name ||
          partyData.partyName ||
          "-",
        mobile: data.mobile || partyData.mobile || "-",
        address: data.address || partyData.address || "-",
        gst: data.gst || partyData.gst || "-",
        type:
          data.partyType ||
          partyData.type ||
          partyData.partyType ||
          "-"
      },
      cartItems: Array.isArray(rawItems)
        ? rawItems.map(normalizeItem)
        : [],
      savedAt: data.savedAt || data.createdAt || null,
      createdAt: data.createdAt || data.savedAt || null
    };
  }

  function attachQueryListener({ name, query, targetMap, source }) {
    const unsubscribe = query.onSnapshot(
      (snapshot) => {
        const nextMap = new Map();

        snapshot.forEach((doc) => {
          const order = normalizeOrderDocument(doc, source);
          if (!order.orderNo || !order.orderNo.startsWith(state.prefix)) return;
          nextMap.set(doc.id, order);
        });

        state[targetMap] = nextMap;
        log(`${name}: ${nextMap.size} records loaded`);
        mergeAndRender();
      },
      (error) => {
        fail(`${name} Firestore listener failed:`, error);
        showPageError(
          `${name} could not load. ${error.message || "Firestore query failed."}`
        );
      }
    );

    state.unsubscribers.push(unsubscribe);
  }

  function startRealtimeListeners() {
    stopRealtimeListeners();

    const prefixEnd = `${state.prefix}\uf8ff`;

    const ordersQuery = state.db
      .collection("orders")
      .where("orderNo", ">=", state.prefix)
      .where("orderNo", "<=", prefixEnd)
      .orderBy("orderNo")
      .limit(CONFIG.ORDERS_FETCH_LIMIT);

    const productTopQuery = state.db
      .collection("products")
      .where("orderNo", ">=", state.prefix)
      .where("orderNo", "<=", prefixEnd)
      .orderBy("orderNo")
      .limit(CONFIG.PRODUCTS_FETCH_LIMIT);

    const productNestedQuery = state.db
      .collection("products")
      .where("partyDetails.orderNo", ">=", state.prefix)
      .where("partyDetails.orderNo", "<=", prefixEnd)
      .orderBy("partyDetails.orderNo")
      .limit(CONFIG.PRODUCTS_FETCH_LIMIT);

    attachQueryListener({
      name: "Orders",
      query: ordersQuery,
      targetMap: "ordersMap",
      source: "orders"
    });

    attachQueryListener({
      name: "Product orders (top-level orderNo)",
      query: productTopQuery,
      targetMap: "productTopMap",
      source: "products"
    });

    attachQueryListener({
      name: "Product orders (partyDetails.orderNo)",
      query: productNestedQuery,
      targetMap: "productNestedMap",
      source: "products"
    });
  }

  function stopRealtimeListeners() {
    state.unsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        warn("Listener cleanup failed:", error);
      }
    });
    state.unsubscribers = [];
  }

  function choosePreferredOrder(existing, candidate) {
    const preferred =
      existing.source === "orders"
        ? existing
        : candidate.source === "orders"
          ? candidate
          : getMillis(candidate.savedAt) > getMillis(existing.savedAt)
            ? candidate
            : existing;

    const secondary = preferred === existing ? candidate : existing;

    return {
      ...secondary,
      ...preferred,
      party: {
        ...(secondary.party || {}),
        ...(preferred.party || {})
      },
      categoryDiscounts: {
        ...(secondary.categoryDiscounts || {}),
        ...(preferred.categoryDiscounts || {})
      },
      cartItems:
        preferred.cartItems?.length > 0
          ? preferred.cartItems
          : secondary.cartItems || [],
      billImage: preferred.billImage || secondary.billImage || null,
      billUrl: preferred.billUrl || secondary.billUrl || null,
      billAmount:
        preferred.billAmount ?? secondary.billAmount ?? null,
      id: preferred.id,
      source: preferred.source
    };
  }

  function mergeAndRender() {
    const byDocument = new Map();

    [
      ...state.ordersMap.values(),
      ...state.productTopMap.values(),
      ...state.productNestedMap.values()
    ].forEach((order) => {
      const docKey = `${order.source}:${order.id}`;
      byDocument.set(docKey, order);
    });

    const byOrderNo = new Map();

    byDocument.forEach((order) => {
      const normalizedOrderNo = normalizeString(order.orderNo).toUpperCase();
      const key = normalizedOrderNo || `${order.source}:${order.id}`;

      if (!byOrderNo.has(key)) {
        byOrderNo.set(key, order);
      } else {
        byOrderNo.set(
          key,
          choosePreferredOrder(byOrderNo.get(key), order)
        );
      }
    });

    state.allOrders = [...byOrderNo.values()].sort(
      (a, b) => getMillis(b.savedAt) - getMillis(a.savedAt)
    );

    updateDashboardStats();
    applySearchAndPagination();
  }

  function updateDashboardStats() {
    const total = state.allOrders.length;
    const pending = state.allOrders.filter(
      (order) => normalizeStatus(order.status) === "Pending"
    ).length;
    const delivered = state.allOrders.filter(
      (order) => normalizeStatus(order.status) === "Delivered"
    ).length;

    if ($("totalOrders")) $("totalOrders").textContent = String(total);
    if ($("pendingOrders")) $("pendingOrders").textContent = String(pending);
    if ($("deliveredOrders")) {
      $("deliveredOrders").textContent = String(delivered);
    }
  }

  function showPageError(message) {
    const tableBody = $("myOrders");
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:28px;color:#991b1b;font-weight:700;">
          ${escapeHTML(message)}
        </td>
      </tr>
    `;
  }

  /* -------------------------------------------------------------------------- */
  /* Activity log                                                                */
  /* -------------------------------------------------------------------------- */

  async function logActivity({
    orderId = "",
    orderNo = "",
    action = "",
    message = ""
  }) {
    try {
      await state.db.collection("order_activities").add({
        orderId,
        orderNo,
        action,
        message,
        user: getCurrentUserName(),
        role: localStorage.getItem("user_role") || "sales",
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      // Activity failure must never block the main order operation.
      warn("Activity log failed:", error);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Filters and pagination                                                      */
  /* -------------------------------------------------------------------------- */

  function getFilteredOrders() {
    const query = state.filters.search.toLowerCase();

    return state.allOrders.filter((order) => {
      const orderNo = normalizeString(order.orderNo).toLowerCase();
      const partyName = normalizeString(order.party?.name).toLowerCase();
      const mobile = normalizeString(order.party?.mobile).toLowerCase();
      const status = normalizeStatus(order.status);
      const grandTotal = toFiniteNumber(order.grandTotal);
      const hasBill = Boolean(order.billImage || order.billUrl);

      if (
        query &&
        !orderNo.includes(query) &&
        !partyName.includes(query) &&
        !mobile.includes(query)
      ) {
        return false;
      }

      if (state.filters.status && status !== state.filters.status) {
        return false;
      }

      if (state.filters.bill === "uploaded" && !hasBill) return false;
      if (state.filters.bill === "pending" && hasBill) return false;

      if (
        state.filters.minAmount !== "" &&
        grandTotal < toFiniteNumber(state.filters.minAmount)
      ) {
        return false;
      }

      if (
        state.filters.maxAmount !== "" &&
        grandTotal > toFiniteNumber(state.filters.maxAmount)
      ) {
        return false;
      }

      const orderDate = getOrderDateValue(order);

      if (state.filters.dateFrom) {
        if (!orderDate) return false;
        const fromDate = new Date(`${state.filters.dateFrom}T00:00:00`);
        if (orderDate < fromDate) return false;
      }

      if (state.filters.dateTo) {
        if (!orderDate) return false;
        const toDate = new Date(`${state.filters.dateTo}T23:59:59.999`);
        if (orderDate > toDate) return false;
      }

      return true;
    });
  }

  function applySearchAndPagination() {
    const filtered = getFilteredOrders();
    const totalRecords = filtered.length;
    const totalPages = Math.max(
      1,
      Math.ceil(totalRecords / state.rowsPerPage)
    );

    state.currentPage = Math.min(
      Math.max(1, state.currentPage),
      totalPages
    );

    const startIndex = (state.currentPage - 1) * state.rowsPerPage;
    const pageData = filtered.slice(
      startIndex,
      startIndex + state.rowsPerPage
    );

    renderOrders(pageData);
    renderPagination(totalRecords, startIndex);
  }

  function renderPagination(totalRecords, startIndex) {
    const info = $("paginationInfo");
    const pageNumbers = $("pageNumbers");
    const prevButton = $("prevPageBtn");
    const nextButton = $("nextPageBtn");

    if (!info || !pageNumbers || !prevButton || !nextButton) return;

    const totalPages = Math.max(
      1,
      Math.ceil(totalRecords / state.rowsPerPage)
    );
    const from = totalRecords === 0 ? 0 : startIndex + 1;
    const to = Math.min(
      startIndex + state.rowsPerPage,
      totalRecords
    );

    info.textContent = `Showing ${from} to ${to} of ${totalRecords} orders`;
    prevButton.disabled = state.currentPage <= 1;
    nextButton.disabled = state.currentPage >= totalPages;

    let startPage = Math.max(1, state.currentPage - 2);
    let endPage = Math.min(totalPages, state.currentPage + 2);

    if (state.currentPage <= 3) endPage = Math.min(5, totalPages);
    if (state.currentPage >= totalPages - 2) {
      startPage = Math.max(1, totalPages - 4);
    }

    let html = "";
    for (let page = startPage; page <= endPage; page += 1) {
      html += `
        <button type="button"
          class="page-number-btn ${page === state.currentPage ? "active" : ""}"
          data-action="go-page"
          data-page="${page}">
          ${page}
        </button>
      `;
    }

    pageNumbers.innerHTML = html;
  }

  function resetAllFilters() {
    state.filters = {
      search: "",
      status: "",
      bill: "",
      dateFrom: "",
      dateTo: "",
      minAmount: "",
      maxAmount: ""
    };
    state.currentPage = 1;

    const fieldMap = {
      orderSearch: "",
      statusFilter: "",
      billFilter: "",
      dateFromFilter: "",
      dateToFilter: "",
      minAmountFilter: "",
      maxAmountFilter: ""
    };

    Object.entries(fieldMap).forEach(([id, value]) => {
      const element = $(id);
      if (element) element.value = value;
    });

    applySearchAndPagination();
  }

  /* -------------------------------------------------------------------------- */
  /* Order rendering                                                             */
  /* -------------------------------------------------------------------------- */

  function isEditAllowed(order) {
    const timestamp = getMillis(order.savedAt || order.createdAt);
    if (!timestamp) return true;
    return Date.now() - timestamp <= CONFIG.EDIT_WINDOW_MS;
  }

  function renderStatusControl(order) {
    const status = normalizeStatus(order.status);

    if (status === "Delivered") {
      return `
        <span class="status-badge status-approved">
          <i class="fa fa-circle-check"></i> Delivered
        </span>
      `;
    }

    const statuses = [
      "Pending",
      "Quotation Sent",
      "Payment Received",
      "Partial Delivered",
      "Delivered",
      "Hold",
      "Cancelled"
    ];

    const options = statuses
      .map(
        (item) =>
          `<option value="${escapeAttr(item)}" ${item === status ? "selected" : ""}>${escapeHTML(item)}</option>`
      )
      .join("");

    return `
      <select class="status-dropdown"
        data-action="status-change"
        data-order-id="${escapeAttr(order.id)}"
        data-current-status="${escapeAttr(status)}">
        ${options}
      </select>
    `;
  }

  function renderOrders(list) {
    const tableBody = $("myOrders");
    if (!tableBody) return;

    if (!list.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:30px;font-weight:700;color:#777;">
            No Orders Found
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = list
      .map((order) => {
        const status = normalizeStatus(order.status);
        const hasBill = Boolean(order.billImage || order.billUrl);
        const editAllowed = isEditAllowed(order);
        const billAmount =
          order.billAmount === null || order.billAmount === undefined
            ? "-"
            : `₹${formatMoney(order.billAmount)}`;

        return `
          <tr class="erp-mobile-card">
            <td data-label="Order">
              <div class="erp-order-box">
                <div class="erp-order-id">${escapeHTML(order.orderNo || "-")}</div>
                <div class="erp-order-date">
                  <i class="fa fa-calendar"></i>
                  ${escapeHTML(order.orderDate || "-")}
                </div>
                <div class="erp-status-chip">${escapeHTML(status)}</div>
              </div>
            </td>

            <td data-label="Party">
              <div class="erp-info-box">
                <div class="erp-info-icon"><i class="fa fa-user"></i></div>
                <div>
                  <div class="erp-label">Party</div>
                  <div class="erp-value">${escapeHTML(order.party?.name || "-")}</div>
                </div>
              </div>
            </td>

            <td data-label="Total">
              <div class="erp-info-box">
                <div class="erp-info-icon green"><i class="fa fa-indian-rupee-sign"></i></div>
                <div>
                  <div class="erp-label">Grand Total</div>
                  <div class="erp-amount">${formatMoney(order.grandTotal)}</div>
                </div>
              </div>
            </td>

            <td data-label="Action">
              <div class="erp-action-wrap">
                <button type="button" class="myq-btn myq-btn-view"
                  data-action="view-order" data-order-id="${escapeAttr(order.id)}">
                  <i class="fa fa-eye"></i> View
                </button>

                ${
                  editAllowed
                    ? `
                      <button type="button" class="myq-btn myq-btn-edit"
                        data-action="edit-order" data-order-id="${escapeAttr(order.id)}">
                        <i class="fa fa-pen"></i> Edit
                      </button>
                    `
                    : `
                      <button type="button" class="myq-btn myq-btn-lock" disabled>
                        <i class="fa fa-lock"></i> Locked
                      </button>
                    `
                }
              </div>
            </td>

            <td data-label="Status">${renderStatusControl(order)}</td>

            <td data-label="Bill">
              ${
                hasBill
                  ? `
                    <button type="button" class="myq-btn myq-btn-view"
                      data-action="view-bill" data-order-id="${escapeAttr(order.id)}">
                      <i class="fa fa-file-invoice"></i> View Bill
                    </button>
                  `
                  : `
                    <div class="erp-bill-pending">
                      <i class="fa fa-clock"></i> Bill Pending
                    </div>
                  `
              }
            </td>

            <td data-label="Bill Amount">
              <span class="bill-amt-display">${billAmount}</span>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  /* -------------------------------------------------------------------------- */
  /* Status update                                                               */
  /* -------------------------------------------------------------------------- */

  async function handleStatusChange(selectElement) {
    const orderId = selectElement.dataset.orderId;
    const order = getOrderById(orderId);

    if (!order) {
      alert("Order not found");
      return;
    }

    const oldStatus = normalizeStatus(
      selectElement.dataset.currentStatus || order.status
    );
    const newStatus = normalizeStatus(selectElement.value);

    if (newStatus === oldStatus) return;

    if (newStatus === "Delivered") {
      selectElement.value = oldStatus;
      openBillModal(orderId);
      return;
    }

    let reason = "";

    if (newStatus === "Hold" || newStatus === "Cancelled") {
      reason = window.prompt(
        `Please enter the reason for ${newStatus}:`,
        order.cancelRemark || ""
      );

      if (reason === null) {
        selectElement.value = oldStatus;
        return;
      }

      reason = reason.trim();
      if (!reason) {
        alert(`${newStatus} reason is required.`);
        selectElement.value = oldStatus;
        return;
      }
    }

    const source = safeSource(order.source);
    const updateData = {
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (newStatus === "Hold" || newStatus === "Cancelled") {
      updateData.cancelRemark = reason;
      updateData.statusRemark = reason;
    } else {
      updateData.cancelRemark = "";
      updateData.statusRemark = "";
    }

    selectElement.disabled = true;
    selectElement.classList.add("is-saving");

    try {
      await state.db.collection(source).doc(orderId).update(updateData);

      selectElement.dataset.currentStatus = newStatus;

      await logActivity({
        orderId,
        orderNo: order.orderNo || "",
        action: "status_changed",
        message: `${getCurrentUserName()} changed status from "${oldStatus}" to "${newStatus}" for order ${order.orderNo || ""}${reason ? `. Reason: ${reason}` : ""}`
      });
    } catch (error) {
      fail("Status update failed:", error);
      selectElement.value = oldStatus;
      alert(`Status update failed: ${error.message || "Unknown error"}`);
    } finally {
      selectElement.disabled = false;
      selectElement.classList.remove("is-saving");
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Modal helpers                                                               */
  /* -------------------------------------------------------------------------- */

  function openModal() {
    const modal = $("modal");
    if (!modal) return;
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = $("modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  window.closeModal = closeModal;

  function setModalMessage(message, type = "info") {
    const holder = $("ubillMessage");
    if (!holder) return;
    holder.className = `ubill-message ${type}`;
    holder.textContent = message;
    holder.style.display = "block";
  }

  /* -------------------------------------------------------------------------- */
  /* Bill upload                                                                 */
  /* -------------------------------------------------------------------------- */

  function openBillModal(orderId) {
    const order = getOrderById(orderId);
    if (!order) {
      alert("Order not found");
      return;
    }

    const modalContent = $("modalContent");
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="ubill-wrap">
        <h3 class="ubill-title">Upload Delivery Bill</h3>

        <div class="ubill-meta">
          <div><b>Order No:</b> ${escapeHTML(order.orderNo || "-")}</div>
          <div><b>Party:</b> ${escapeHTML(order.party?.name || "-")}</div>
        </div>

        <div class="ubill-drop" id="ubillDrop" tabindex="0" role="button" aria-label="Choose bill file">
          <div class="ubill-drop-inner" id="dropPlaceholder">
            <div class="ubill-drop-icon"><i class="fa fa-cloud-upload-alt"></i></div>
            <div class="ubill-drop-text" id="ubillFileText">Choose File / Drag & Drop</div>
            <div class="ubill-drop-sub">Supported: JPG, PNG, WEBP, PDF · Maximum 5 MB</div>
          </div>

          <input type="file" id="modalFile" accept="image/jpeg,image/png,image/webp,.pdf" hidden>
        </div>

        <img id="billPreview" class="ubill-preview" alt="Bill preview" style="display:none;">

        <div id="pdfPreview" class="pdf-preview" style="display:none;">
          <i class="fa fa-file-pdf"></i>
          <span id="pdfName"></span>
        </div>

        <input type="number" id="modalBillAmount" class="ubill-input"
          min="0.01" step="0.01" placeholder="Enter Bill Amount"
          value="${escapeAttr(order.billAmount ?? "")}">

        <div id="ubillMessage" class="ubill-message info" style="display:none;"></div>

        <button type="button" id="saveButton" class="ubill-btn"
          data-action="save-delivered" data-order-id="${escapeAttr(orderId)}">
          Save & Mark Delivered
        </button>
      </div>
    `;

    openModal();
    setupBillDrop();
  }

  function validateBillFile(file) {
    if (!file) throw new Error("Please select a bill file");

    if (file.size > CONFIG.MAX_BILL_FILE_SIZE) {
      throw new Error("Maximum 5 MB file allowed. Please compress the bill.");
    }

    if (!CONFIG.ALLOWED_BILL_TYPES.includes(file.type)) {
      throw new Error("Only JPG, PNG, WEBP or PDF files are allowed");
    }
  }

  function setupBillDrop() {
    const drop = $("ubillDrop");
    const input = $("modalFile");

    if (!drop || !input) return;

    const selectFile = () => input.click();

    drop.addEventListener("click", selectFile);
    drop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectFile();
      }
    });

    input.addEventListener("change", () => {
      if (input.files?.[0]) showSelectedBillFile(input.files[0]);
    });

    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("is-drag");
    });

    drop.addEventListener("dragleave", () => {
      drop.classList.remove("is-drag");
    });

    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("is-drag");

      const file = event.dataTransfer?.files?.[0];
      if (!file) return;

      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
      } catch (error) {
        warn("Browser did not allow assigning dropped file:", error);
      }

      showSelectedBillFile(file);
    });
  }

  function showSelectedBillFile(file) {
    const preview = $("billPreview");
    const pdfPreview = $("pdfPreview");
    const pdfName = $("pdfName");
    const placeholder = $("dropPlaceholder");
    const text = $("ubillFileText");

    try {
      validateBillFile(file);
    } catch (error) {
      alert(error.message);
      const input = $("modalFile");
      if (input) input.value = "";
      return;
    }

    if (text) text.textContent = file.name;
    if (placeholder) placeholder.style.display = "none";

    if (file.type.startsWith("image/")) {
      if (pdfPreview) pdfPreview.style.display = "none";

      const reader = new FileReader();
      reader.onload = (event) => {
        if (!preview) return;
        preview.src = event.target.result;
        preview.style.display = "block";
      };
      reader.onerror = () => alert("Image preview could not be created");
      reader.readAsDataURL(file);
      return;
    }

    if (preview) {
      preview.removeAttribute("src");
      preview.style.display = "none";
    }
    if (pdfPreview) pdfPreview.style.display = "flex";
    if (pdfName) pdfName.textContent = file.name;
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Selected file could not be read"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadBillToGoogleDrive(file, orderId, orderNo) {
    validateBillFile(file);

    if (!navigator.onLine) {
      throw new Error("Internet connection is offline");
    }

    const fileData = await readFileAsDataURL(file);
    const safeOrderNo = normalizeString(orderNo || orderId || "ORDER").replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const safeFileName = normalizeString(file.name).replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const payload = {
      fileName: `${safeOrderNo}_${Date.now()}_${safeFileName}`,
      fileType: file.type,
      fileData,
      orderId,
      orderNo: orderNo || "",
      appVersion: CONFIG.APP_VERSION
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONFIG.DRIVE_UPLOAD_TIMEOUT_MS
    );

    let response;

    try {
      response = await fetch(CONFIG.DRIVE_UPLOAD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(
          "Google Drive upload timed out. Please check internet speed and try again."
        );
      }

      throw new Error(
        "Google Apps Script could not be reached. Check that the latest /exec URL is deployed as Web App, Execute as Me, and access is set to Anyone. Original error: " +
          (error.message || "Failed to fetch")
      );
    } finally {
      clearTimeout(timeoutId);
    }

    let responseText = "";

    try {
      responseText = await response.text();
    } catch (error) {
      throw new Error("Drive server response could not be read");
    }

    log("Drive raw response:", response.status, responseText.slice(0, 250));

    if (!response.ok) {
      throw new Error(
        `Drive server returned HTTP ${response.status}: ${responseText.slice(0, 180)}`
      );
    }

    const trimmed = responseText.trim();

    if (!trimmed) {
      throw new Error("Apps Script returned an empty response");
    }

    if (trimmed.startsWith("<")) {
      throw new Error(
        "Apps Script returned HTML instead of JSON. Open the /exec URL and verify public Web App deployment."
      );
    }

    let result;

    try {
      result = JSON.parse(trimmed);
    } catch (_) {
      throw new Error(
        `Apps Script returned invalid JSON: ${trimmed.slice(0, 180)}`
      );
    }

    if (!result.success) {
      throw new Error(result.error || "Google Drive upload failed");
    }

    if (!result.fileId || !result.fileUrl) {
      throw new Error("Apps Script response is missing fileId or fileUrl");
    }

    return result;
  }

  async function saveDeliveredOrder(orderId) {
    const order = getOrderById(orderId);
    const fileInput = $("modalFile");
    const amountInput = $("modalBillAmount");
    const saveButton = $("saveButton");

    if (!order) {
      alert("Order not found");
      return;
    }

    const file = fileInput?.files?.[0];
    const amount = toFiniteNumber(amountInput?.value, 0);

    try {
      validateBillFile(file);
    } catch (error) {
      alert(error.message);
      return;
    }

    if (amount <= 0) {
      alert("Enter a valid bill amount");
      amountInput?.focus();
      return;
    }

    const originalButtonText = saveButton?.innerHTML || "Save & Mark Delivered";

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Uploading Bill...';
    }

    setModalMessage(
      "Uploading bill to Google Drive. Please keep this window open.",
      "info"
    );

    let driveData;

    try {
      driveData = await uploadBillToGoogleDrive(
        file,
        orderId,
        order.orderNo || ""
      );

      if (saveButton) {
        saveButton.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving Delivery...';
      }
      setModalMessage("Bill uploaded. Saving delivery status...", "info");

      await state.db
        .collection(safeSource(order.source))
        .doc(orderId)
        .update({
          status: "Delivered",
          billImage: driveData.fileUrl,
          billUrl: driveData.fileUrl,
          billDriveId: driveData.fileId,
          billType: file.type,
          billFileName: file.name,
          billAmount: amount,
          deliveredAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

      await logActivity({
        orderId,
        orderNo: order.orderNo || "",
        action: "delivered",
        message: `${getCurrentUserName()} uploaded bill to Google Drive and marked order ${order.orderNo || ""} as Delivered`
      });

      const modalContent = $("modalContent");
      if (modalContent) {
        modalContent.innerHTML = `
          <div style="text-align:center;padding:28px 18px;">
            <div style="font-size:48px;color:#108082;margin-bottom:12px;">
              <i class="fa fa-circle-check"></i>
            </div>
            <h3>Delivery Saved Successfully</h3>
            <p style="margin-top:8px;color:#666;">
              Bill uploaded to Google Drive and delivery saved in Firestore.
            </p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px;">
              <button type="button" class="myq-btn myq-btn-view" data-action="open-uploaded-bill" data-url="${escapeAttr(driveData.fileUrl)}">
                <i class="fa fa-file-invoice"></i> View Bill
              </button>
              <button type="button" class="myq-btn myq-btn-edit" data-action="close-modal">
                Close
              </button>
            </div>
          </div>
        `;
      }
    } catch (error) {
      fail("Drive/delivery save error:", error);

      const extra = driveData?.fileUrl
        ? " The bill reached Drive, but Firestore saving failed. Do not upload again until you check the order."
        : "";

      setModalMessage(`${error.message}${extra}`, "error");
      alert(`Delivery save failed: ${error.message}${extra}`);

      if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonText;
      }
    }
  }

  function openBillImage(fileUrl) {
    if (!isSafeHttpUrl(fileUrl)) {
      alert("Invalid or missing bill URL");
      return;
    }

    const opened = window.open(fileUrl, "_blank", "noopener,noreferrer");
    if (!opened) alert("Please allow pop-ups to view the bill");
  }

  /* -------------------------------------------------------------------------- */
  /* View/edit order                                                             */
  /* -------------------------------------------------------------------------- */

  function viewOrder(orderId) {
    const order = getOrderById(orderId);
    if (!order) {
      alert("Order not found");
      return;
    }

    const status = normalizeStatus(order.status);
    const remark = normalizeString(order.cancelRemark);
    const items = order.cartItems || [];

    const itemRows = items.length
      ? items
          .map((item, index) => {
            const qty = toFiniteNumber(item.qty ?? item.quantity);
            const rate = toFiniteNumber(item.rate ?? item.price);
            const amount = toFiniteNumber(item.amount, qty * rate);

            return `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHTML(item.code || "-")}</td>
                <td>${escapeHTML(item.itemName || "-")}</td>
                <td>${escapeHTML(item.unit || "-")}</td>
                <td>${qty}</td>
                <td>₹${formatMoney(rate)}</td>
                <td>₹${formatMoney(amount)}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="7" style="text-align:center;">No items found</td></tr>`;

    const remarkBlock =
      status === "Cancelled" && remark
        ? `
          <div style="background:#f8d7da;padding:10px;margin-top:20px;border-radius:5px;border:1px solid #f5c6cb;">
            <h5 style="color:#721c24;">Cancel Reason</h5>
            <p style="color:#721c24;margin:0;">${escapeHTML(remark)}</p>
          </div>
        `
        : status === "Hold" && remark
          ? `
            <div style="background:#fff3cd;padding:10px;margin-top:20px;border-radius:5px;border:1px solid #ffeeba;">
              <h5 style="color:#856404;">Hold Reason</h5>
              <p style="color:#856404;margin:0;">${escapeHTML(remark)}</p>
            </div>
          `
          : "";

    const modalContent = $("modalContent");
    if (!modalContent) return;

    modalContent.innerHTML = `
      <div class="view-order-wrap">
        <div class="view-order-header">
          <div class="view-order-left">
            <h3 class="modal-title">Order Details - ${escapeHTML(order.orderNo || "-")}</h3>
          </div>

          <button type="button" class="myq-btn myq-btn-download"
            data-action="download-order" data-order-id="${escapeAttr(order.id)}">
            <i class="fa fa-download"></i> Download
          </button>
        </div>

        ${remarkBlock}

        <div class="modal-section">
          <h4>Party Details</h4>
          <p><b>Name:</b> ${escapeHTML(order.party?.name || "-")}</p>
          <p><b>Mobile:</b> ${escapeHTML(order.party?.mobile || "-")}</p>
          <p><b>Address:</b> ${escapeHTML(order.party?.address || "-")}</p>
          <p><b>GST:</b> ${escapeHTML(order.party?.gst || "-")}</p>
        </div>

        <div class="modal-section">
          <h4>Items</h4>
          <div class="modal-section-scroll">
            <table class="modal-items-table">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
          </div>
        </div>

        <div class="modal-section">
          <h4>Category Discounts</h4>
          <p><b>Hardware Discount:</b> ${formatMoney(order.categoryDiscounts?.hardware)}%</p>
          <p><b>Bathroom Discount:</b> ${formatMoney(order.categoryDiscounts?.bathroom)}%</p>
          <p><b>SS Discount:</b> ${formatMoney(order.categoryDiscounts?.stainlesssteel)}%</p>
        </div>

        <div class="modal-section">
          <h4>Billing</h4>
          <div class="billing-row"><span>Subtotal</span><span>₹${formatMoney(order.subTotal)}</span></div>
          <div class="billing-row"><span>Freight</span><span>₹${formatMoney(order.freight)}</span></div>
          <div class="billing-row"><span>Special Discount</span><span>₹${formatMoney(order.specialDiscount)}</span></div>
          <div class="billing-row"><span>GST</span><span>₹${formatMoney(order.gstAmount)}</span></div>
          <div class="billing-row total"><span>Grand Total</span><span>₹${formatMoney(order.grandTotal)}</span></div>
        </div>
      </div>
    `;

    openModal();
  }

  function editOrder(orderId) {
    const order = getOrderById(orderId);
    if (!order) {
      alert("Order not found");
      return;
    }

    void logActivity({
      orderId: order.id,
      orderNo: order.orderNo || "",
      action: "edit_order",
      message: `${getCurrentUserName()} opened edit page for order ${order.orderNo || ""}`
    });

    const source = encodeURIComponent(safeSource(order.source));
    const id = encodeURIComponent(order.id);
    window.location.href = `../orders/edit-order.html?id=${id}&source=${source}`;
  }

  /* -------------------------------------------------------------------------- */
  /* PDF/print                                                                   */
  /* -------------------------------------------------------------------------- */

  function downloadOrder(orderId) {
    const order = getOrderById(orderId);
    if (!order) {
      alert("Order not found");
      return;
    }

    const items = order.cartItems || [];
    const rows = items.length
      ? items
          .map((item, index) => {
            const qty = toFiniteNumber(item.qty ?? item.quantity);
            const rate = toFiniteNumber(item.rate ?? item.price);
            const amount = toFiniteNumber(item.amount, qty * rate);

            return `
              <tr>
                <td class="center">${index + 1}</td>
                <td>${escapeHTML(item.code || "-")}</td>
                <td class="item-name">${escapeHTML(item.itemName || "-")}</td>
                <td class="center">${escapeHTML(item.unit || "-")}</td>
                <td class="num">${qty}</td>
                <td class="num">${formatMoney(rate)}</td>
                <td class="num">${formatMoney(amount)}</td>
              </tr>
            `;
          })
          .join("")
      : '<tr><td colspan="7" class="center empty">No items</td></tr>';

    const logoUrl = new URL("images/logo.webp", window.location.href).href;
    const popup = window.open("", "_blank", "width=1100,height=850");

    if (!popup) {
      alert("Please allow pop-ups to download the order PDF.");
      return;
    }

    const fileName = `${normalizeString(order.orderNo || "Petro-Quotation").replace(/[^a-zA-Z0-9_-]/g, "_")}-PETRO-OMS.pdf`;
    const fileNameJS = JSON.stringify(fileName);
    const shareTitleJS = JSON.stringify(
      `Petro OMS Quotation ${order.orderNo || ""}`
    );
    const shareTextJS = JSON.stringify(
      `Quotation ${order.orderNo || ""} - www.oms.rankchahiye.com`
    );

    popup.document.write(`<!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${escapeHTML(order.orderNo || "Petro Order")} - PETRO OMS</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
        <style>
          @page{size:A4;margin:11mm}*{box-sizing:border-box}body{margin:0;color:#20252a;font:12px Arial,sans-serif;background:#f3f4f6;padding:14px}.sheet{width:100%;max-width:800px;margin:auto;background:#fff;border:1px solid #1b7f82;position:relative;overflow:hidden}.sheet>*:not(.watermark){position:relative;z-index:1}.watermark{position:absolute;z-index:0;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-35deg);color:#108082;opacity:.055;font-size:74px;font-weight:800;letter-spacing:9px;white-space:nowrap;pointer-events:none}.header{display:flex;justify-content:space-between;align-items:center;padding:15px 18px;border-bottom:3px solid #108082}.logo{max-width:190px;max-height:58px}.company{text-align:right;line-height:1.5}.company strong{color:#108082;font-size:18px}.title{background:#108082;color:white;text-align:center;font-size:18px;font-weight:700;letter-spacing:1px;padding:9px}.meta{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #9aa}.box{padding:12px 15px;min-height:105px}.box+.box{border-left:1px solid #9aa}.box h3{color:#108082;font-size:13px;margin:0 0 8px;text-transform:uppercase}.line{margin:4px 0}.label{display:inline-block;width:82px;font-weight:700}table{width:100%;border-collapse:collapse}th{background:#e7f3f3;color:#075e61;font-weight:700}th,td{border:1px solid #aeb8b8;padding:7px 6px}.center{text-align:center}.num{text-align:right;white-space:nowrap}.item-name{text-align:left;font-weight:600}.empty{padding:24px;color:#777}.discount-summary-wrap{display:grid;grid-template-columns:57% 43%;width:100%;border-bottom:1px solid #9aa}.discount-breakup{min-height:100%;border-right:1px solid #9aa}.discount-title{background:#e7f3f3;color:#075e61;font-size:12px;font-weight:700;padding:8px 12px;border-bottom:1px solid #aeb8b8}.discount-breakup>div:not(.discount-title){display:flex;align-items:center;justify-content:space-between;gap:15px;padding:7px 12px;border-bottom:1px solid #ccd3d3}.discount-breakup>div:last-child{border-bottom:none}.discount-breakup b{color:#075e61;white-space:nowrap}.summary{width:100%}.summary div{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:7px 12px;border-bottom:1px solid #ccd3d3}.summary b,.summary span:last-child{white-space:nowrap}.summary .grand{background:#108082;color:#fff;font-size:15px;font-weight:700}.notes{min-height:75px;padding:12px 15px;border-top:1px solid #9aa}.footer{display:flex;justify-content:space-between;align-items:end;min-height:85px;padding:12px 15px;border-top:1px solid #9aa}.sign{text-align:center;width:210px;padding-top:40px;border-bottom:1px solid #333}.website-footer{text-align:center;padding:8px;color:#075e61;font-weight:700;border-top:1px solid #ccd3d3}.toolbar{position:sticky;top:10px;z-index:20;max-width:800px;margin:0 auto 12px;display:flex;gap:10px;justify-content:flex-end}.toolbar button{border:0;border-radius:24px;padding:11px 16px;font-weight:700;color:#fff;cursor:pointer;box-shadow:0 5px 18px #0003}.download-btn{background:#108082}.share-btn{background:#25d366}.print-btn{background:#334155}.toolbar button:disabled{opacity:.65;cursor:wait}@media print{body{padding:0;background:#fff}.toolbar{display:none}.sheet{max-width:none;border:1px solid #1b7f82}}@media(max-width:700px){.meta,.discount-summary-wrap{grid-template-columns:1fr}.box+.box,.discount-breakup{border-left:0;border-right:0;border-top:1px solid #9aa}.header{align-items:flex-start;gap:10px}.company{font-size:10px}.company strong{font-size:14px}}
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button id="downloadPdfBtn" class="download-btn">Download PDF</button>
          <button id="sharePdfBtn" class="share-btn">Share PDF</button>
          <button id="printBtn" class="print-btn">Print</button>
        </div>

        <div class="sheet" id="quotationSheet">
          <div class="watermark">PETRO OMS</div>
          <div class="header">
            <img class="logo" src="${logoUrl}" alt="PETRO Industries">
            <div class="company"><strong>PETRO INDUSTECH PVT. LTD.</strong><br>Phone: +91-8000007336<br>Email: contact@petroindustech.com</div>
          </div>
          <div class="title">ORDER / QUOTATION</div>

          <div class="meta">
            <div class="box">
              <h3>Party Details</h3>
              <div class="line"><span class="label">Name:</span>${escapeHTML(order.party?.name)}</div>
              <div class="line"><span class="label">Mobile:</span>${escapeHTML(order.party?.mobile)}</div>
              <div class="line"><span class="label">Address:</span>${escapeHTML(order.party?.address)}</div>
              <div class="line"><span class="label">GST:</span>${escapeHTML(order.party?.gst)}</div>
            </div>

            <div class="box">
              <h3>Order Details</h3>
              <div class="line"><span class="label">Order No:</span>${escapeHTML(order.orderNo)}</div>
              <div class="line"><span class="label">Date:</span>${escapeHTML(order.orderDate)}</div>
              <div class="line"><span class="label">Status:</span>${escapeHTML(normalizeStatus(order.status))}</div>
              <div class="line"><span class="label">Salesman:</span>${escapeHTML(state.salesman)}</div>
              <div class="line"><span class="label">Party Type:</span>${escapeHTML(order.party?.type || "-")}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width:5%">S.No.</th>
                <th style="width:12%">Code</th>
                <th>Item Name</th>
                <th style="width:9%">Unit</th>
                <th style="width:8%">Qty</th>
                <th style="width:14%">Rate (Rs.)</th>
                <th style="width:16%">Amount (Rs.)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="discount-summary-wrap">
            <div class="discount-breakup">
              <div class="discount-title">DISCOUNT BREAKUP</div>
              <div><span>Hardware Discount</span><b>${formatMoney(order.categoryDiscounts?.hardware)}%</b></div>
              <div><span>Bathroom Discount</span><b>${formatMoney(order.categoryDiscounts?.bathroom)}%</b></div>
              <div><span>SS Discount</span><b>${formatMoney(order.categoryDiscounts?.stainlesssteel)}%</b></div>
              <div><span>Special Discount</span><b>Rs. ${formatMoney(order.specialDiscount)}</b></div>
            </div>

            <div class="summary">
              <div><span>Subtotal</span><b>Rs. ${formatMoney(order.subTotal)}</b></div>
              <div><span>Freight</span><b>Rs. ${formatMoney(order.freight)}</b></div>
              <div><span>Special Discount</span><b>Rs. ${formatMoney(order.specialDiscount)}</b></div>
              <div><span>GST</span><b>Rs. ${formatMoney(order.gstAmount)}</b></div>
              <div class="grand"><span>Grand Total</span><span>Rs. ${formatMoney(order.grandTotal)}</span></div>
            </div>
          </div>

          <div class="notes"><b>Terms & Conditions</b><br>1. Goods once sold will not be taken back.<br>2. Subject to company terms and applicable jurisdiction.</div>
          <div class="footer"><div>This is a computer-generated document.</div><div class="sign">Authorised Signatory</div></div>
          <div class="website-footer">Generated from Petro OMS | www.oms.rankchahiye.com</div>
        </div>

        <script>
          const fileName = ${fileNameJS};
          const shareTitle = ${shareTitleJS};
          const shareText = ${shareTextJS};

          async function createPdfBlob() {
            if (typeof html2pdf === "undefined") {
              throw new Error("PDF library could not load");
            }

            const worker = html2pdf().set({
              margin: 8,
              filename: fileName,
              image: { type: "jpeg", quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
              jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
              pagebreak: { mode: ["css", "legacy"] }
            }).from(document.getElementById("quotationSheet")).toPdf();

            return worker.outputPdf("blob");
          }

          async function downloadPdf() {
            const button = document.getElementById("downloadPdfBtn");
            const oldText = button.textContent;
            button.disabled = true;
            button.textContent = "Preparing...";

            try {
              const blob = await createPdfBlob();
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 2500);
            } catch (error) {
              alert("Unable to download PDF: " + error.message);
            } finally {
              button.disabled = false;
              button.textContent = oldText;
            }
          }

          async function sharePdf() {
            const button = document.getElementById("sharePdfBtn");
            const oldText = button.textContent;
            button.disabled = true;
            button.textContent = "Preparing...";

            try {
              const blob = await createPdfBlob();
              const pdfFile = new File([blob], fileName, { type: "application/pdf" });
              const shareData = { files: [pdfFile], title: shareTitle, text: shareText };

              if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
              } else {
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2500);
                alert("File sharing is not supported by this browser. PDF downloaded; attach it manually in WhatsApp.");
              }
            } catch (error) {
              if (error.name !== "AbortError") {
                alert("Unable to share PDF: " + error.message);
              }
            } finally {
              button.disabled = false;
              button.textContent = oldText;
            }
          }

          document.getElementById("downloadPdfBtn").addEventListener("click", downloadPdf);
          document.getElementById("sharePdfBtn").addEventListener("click", sharePdf);
          document.getElementById("printBtn").addEventListener("click", () => window.print());
        <\/script>
      </body>
      </html>`);

    popup.document.close();
  }

  /* -------------------------------------------------------------------------- */
  /* Events                                                                      */
  /* -------------------------------------------------------------------------- */

  function bindGlobalEvents() {
    document.addEventListener("input", (event) => {
      const target = event.target;

      if (target.id === "orderSearch") {
        debounceSearch(() => {
          state.filters.search = target.value.trim().toLowerCase();
          state.currentPage = 1;
          applySearchAndPagination();
        });
        return;
      }

      if (target.id === "minAmountFilter") {
        state.filters.minAmount = target.value.trim();
        state.currentPage = 1;
        applySearchAndPagination();
        return;
      }

      if (target.id === "maxAmountFilter") {
        state.filters.maxAmount = target.value.trim();
        state.currentPage = 1;
        applySearchAndPagination();
      }
    });

    document.addEventListener("change", (event) => {
      const target = event.target;

      if (target.id === "rowsPerPage") {
        state.rowsPerPage = Math.max(1, Number(target.value) || 10);
        state.currentPage = 1;
        applySearchAndPagination();
        return;
      }

      if (target.id === "statusFilter") {
        state.filters.status = target.value;
        state.currentPage = 1;
        applySearchAndPagination();
        return;
      }

      if (target.id === "billFilter") {
        state.filters.bill = target.value;
        state.currentPage = 1;
        applySearchAndPagination();
        return;
      }

      if (target.id === "dateFromFilter") {
        state.filters.dateFrom = target.value;
        state.currentPage = 1;
        applySearchAndPagination();
        return;
      }

      if (target.id === "dateToFilter") {
        state.filters.dateTo = target.value;
        state.currentPage = 1;
        applySearchAndPagination();
        return;
      }

      if (target.matches('[data-action="status-change"]')) {
        void handleStatusChange(target);
      }
    });

    document.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");
      if (!actionElement) return;

      const action = actionElement.dataset.action;
      const orderId = actionElement.dataset.orderId;

      switch (action) {
        case "view-order":
          viewOrder(orderId);
          break;

        case "edit-order":
          editOrder(orderId);
          break;

        case "view-bill": {
          const order = getOrderById(orderId);
          openBillImage(order?.billImage || order?.billUrl || "");
          break;
        }

        case "download-order":
          downloadOrder(orderId);
          break;

        case "save-delivered":
          void saveDeliveredOrder(orderId);
          break;

        case "open-uploaded-bill":
          openBillImage(actionElement.dataset.url || "");
          break;

        case "close-modal":
          closeModal();
          break;

        case "go-page": {
          const page = Number(actionElement.dataset.page);
          if (Number.isInteger(page) && page > 0) {
            state.currentPage = page;
            applySearchAndPagination();
          }
          break;
        }

        default:
          break;
      }
    });

    $("prevPageBtn")?.addEventListener("click", () => {
      if (state.currentPage > 1) {
        state.currentPage -= 1;
        applySearchAndPagination();
      }
    });

    $("nextPageBtn")?.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(getFilteredOrders().length / state.rowsPerPage)
      );

      if (state.currentPage < totalPages) {
        state.currentPage += 1;
        applySearchAndPagination();
      }
    });

    $("resetFiltersBtn")?.addEventListener("click", resetAllFilters);

    const modal = $("modal");
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("modal")?.style.display === "flex") {
        closeModal();
      }
    });

    window.addEventListener("beforeunload", stopRealtimeListeners);
  }

  /* -------------------------------------------------------------------------- */
  /* Startup                                                                     */
  /* -------------------------------------------------------------------------- */

  function start() {
    if (state.initialized) return;
    state.initialized = true;

    try {
      initFirebase();
      restoreDarkMode();

      if (!validateSession()) return;

      ensureFilterUI();

      const rowsSelect = $("rowsPerPage");
      if (rowsSelect) {
        state.rowsPerPage = Number(rowsSelect.value) || CONFIG.DEFAULT_ROWS_PER_PAGE;
      }

      bindGlobalEvents();
      startRealtimeListeners();

      log(
        `Started version ${CONFIG.APP_VERSION} for ${state.salesman} (${state.prefix})`
      );
    } catch (error) {
      fail("Startup failed:", error);
      alert(`Sales dashboard could not start: ${error.message}`);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();