/* ============================================================
   PETRO OMS - ORDERS PAGE JS
   CLEAN + FIXED VERSION
   Firebase v8 Compat
============================================================ */

/* ============================================================
   FIREBASE INITIALIZATION
============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyCdfQu5GCsBCyMHM7HX8GRzY-VTZaEMU5M",
  authDomain: "petro-oms.firebaseapp.com",
  projectId: "petro-oms",
  storageBucket: "petro-oms.firebasestorage.app",
  messagingSenderId: "562472760628",
  appId: "1:562472760628:web:384f4eda2c862b6e3ce161",
};

if (typeof firebase === "undefined") {
  alert("Firebase SDK not loaded. Please check script order.");
  throw new Error("Firebase SDK not loaded");
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

/* ============================================================
   FIRESTORE CACHE
============================================================ */

try {
  db.enablePersistence().catch((err) => {
    console.warn("Firestore persistence not enabled:", err.code);
  });
} catch (err) {
  console.warn("Firestore persistence setup skipped:", err.message);
}

/* ============================================================
   GLOBAL STATE
============================================================ */

let allOrdersMaster = [];
let filteredOrders = [];
let currentRenderedOrders = [];
let currentPage = 1;

let deleteOrderId = null;
let deleteOrderSource = "orders";

const PAGE_SIZE = 10;
const ADMIN_DELETE_PASSWORD = "2003";

/* Selected rows across current pagination */
const selectedRowIds = new Set();

/* ============================================================
   DOM ELEMENTS
============================================================ */

const ordersBody = document.getElementById("ordersBody");
const emptyState = document.getElementById("emptyState");

const statusFilter = document.getElementById("filterStatus");
const typeFilter = document.getElementById("filterType");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const searchBox = document.getElementById("searchBox");
const salesmanFilterEl = document.getElementById("salesmanFilter");

const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageIndicator = document.getElementById("pageIndicator");
const selectAllRowsEl = document.getElementById("selectAllRows");

const tableSubText = document.getElementById("tableSubText");

/* ============================================================
   SALESMAN MASTER LIST
============================================================ */

const ALL_SALESMEN = [
  "Sariya Murtuza",
  "Roshan Sharma",
  "Rup Ranjan Bora",
  "Ankit Kalra",
  "Amit Soni",
  "Vivek Srivastava",
  "Mahesh Kumar",
];

/* ============================================================
   HELPERS
============================================================ */

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function numberValue(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value) {
  return numberValue(value).toFixed(2);
}

function getOrderDateValue(value) {
  if (!value) return "";

  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return "";
}

function getOrderDate(order) {
  return getOrderDateValue(
    order?.orderDate ||
    order?.savedAt ||
    order?.createdAt ||
    order?.date
  );
}

function getSortTime(order) {
  const value =
    order?.savedAt ||
    order?.orderDate ||
    order?.createdAt ||
    order?.date;

  if (!value) return 0;

  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  return 0;
}

function getPartyType(order) {
  return order?.party?.type || order?.type || "Secondary";
}

function getOrderStatus(order) {
  return order?.status || "Pending";
}

function calculateOrderDisplayTotals(order) {
  const gstPercent = numberValue(order?.gstPercent || 18) || 18;
  const gstDivider = 1 + gstPercent / 100;

  const items = Array.isArray(order?.items) ? order.items : [];

  /*
    IMPORTANT:
    item.amount ko GST inclusive maana gaya hai,
    kyunki order create page me rate GST inclusive hai.
  */
  const itemsGrandInclGst = items.reduce((sum, item) => {
    const itemAmount = parseAmountLikeDashboard(item?.amount ?? item?.total ?? 0);

    if (itemAmount > 0) {
      return sum + itemAmount;
    }

    const qty = numberValue(item?.qty || 0);
    const rateInclGst = numberValue(item?.rate || 0);

    return sum + qty * rateInclGst;
  }, 0);

  const freight = parseAmountLikeDashboard(order?.freight || 0);
  const specialDiscount = parseAmountLikeDashboard(order?.specialDiscount || 0);

  const grandTotalInclGst = Math.max(
    0,
    itemsGrandInclGst + freight - specialDiscount
  );

  const taxableAmount = grandTotalInclGst / gstDivider;
  const gstAmount = grandTotalInclGst - taxableAmount;

  return {
    gstPercent,
    gstDivider,
    freight,
    specialDiscount,
    grandTotalInclGst,
    taxableAmount,
    gstAmount,
  };
}

function getOrderTotal(order) {
  return calculateOrderDisplayTotals(order).grandTotalInclGst;
}

function parseAmountLikeDashboard(value) {
  if (typeof value === "number") return value;

  const cleaned = String(value || "0")
    .replace(/[₹,\s/-]/g, "")
    .trim();

  const num = Number(cleaned);

  return Number.isFinite(num) ? num : 0;
}

function getBillImage(order) {
  return order?.billImage || order?.billImageUrl || order?.imageUrl || "";
}

function showElement(el) {
  if (el) el.style.display = "block";
}

function hideElement(el) {
  if (el) el.style.display = "none";
}

/* ============================================================
   STATUS BADGE CLASS
============================================================ */

function statusClass(status) {
  const cleanStatus = normalizeText(status);

  switch (cleanStatus) {
    case "pending":
      return "status-pending";

    case "quotation sent":
      return "status-info";

    case "payment received":
      return "status-payment";

    case "partial delivered":
    case "partial delivery":
      return "status-partial";

    case "delivered":
      return "status-delivered";

    case "hold":
      return "status-hold";

    case "cancelled":
    case "canceled":
      return "status-cancelled";

    default:
      return "status-pending";
  }
}

/* ============================================================
   LOADING + ERROR STATES
============================================================ */

function showLoadingState() {
  if (ordersBody) {
    ordersBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:30px; color:#888;">
          <i class="fa fa-spinner fa-spin"></i> Loading orders...
        </td>
      </tr>
    `;
  }

  hideElement(emptyState);
}

function showErrorState(message) {
  if (ordersBody) {
    ordersBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:30px; color:#d93025;">
          <i class="fa fa-triangle-exclamation"></i> ${escapeHTML(message)}
        </td>
      </tr>
    `;
  }

  hideElement(emptyState);
}

function clearTableBody() {
  if (ordersBody) ordersBody.innerHTML = "";
}

/* ============================================================
   FETCH ALL ORDERS
   NOTE:
   orderBy("savedAt") remove kiya hai taaki savedAt missing orders gayab na hon.
============================================================ */

async function fetchAllOrders() {
  showLoadingState();

  try {
    const snapshot = await db.collection("orders").get({ source: "default" });

    allOrdersMaster = snapshot.docs.map((doc) => ({
      id: doc.id,
      source: "orders",
      ...doc.data(),
    }));

    allOrdersMaster.sort((a, b) => getSortTime(b) - getSortTime(a));

    populateSalesmanMasterList();
    applyFiltersAndRender();

  } catch (err) {
    console.error("Orders fetch error:", err);
    showErrorState("Orders load failed. Please refresh and try again.");
  }
}

/* ============================================================
   SALESMAN DROPDOWN
   Hardcoded + Database unique names
============================================================ */

function populateSalesmanMasterList() {
  if (!salesmanFilterEl) return;

  const selectedValue = salesmanFilterEl.value;

  const salesmanSet = new Set();

  ALL_SALESMEN.forEach((name) => {
    if (name) salesmanSet.add(name.trim());
  });

  allOrdersMaster.forEach((order) => {
    if (order?.salesman) salesmanSet.add(String(order.salesman).trim());
  });

  const salesmanList = Array.from(salesmanSet).sort((a, b) =>
    a.localeCompare(b)
  );

  salesmanFilterEl.innerHTML = `<option value="">All Salesmen</option>`;

  salesmanList.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    salesmanFilterEl.appendChild(option);
  });

  salesmanFilterEl.value = selectedValue;
}

/* ============================================================
   APPLY FILTERS
============================================================ */

window.applyFiltersAndRender = function () {
  const searchText = normalizeText(searchBox?.value);
  const selectedSalesman = normalizeText(salesmanFilterEl?.value);
  const selectedType = normalizeText(typeFilter?.value);
  const selectedStatus = normalizeText(statusFilter?.value);

  const fromDate = dateFrom?.value || "";
  const toDate = dateTo?.value || "";

  selectedRowIds.clear();

  filteredOrders = allOrdersMaster.filter((order) => {
    const orderNo = normalizeText(order?.orderNo);
    const partyName = normalizeText(order?.party?.name);
    const partyMobile = normalizeText(order?.party?.mobile);
    const partyGST = normalizeText(order?.party?.gst);
    const salesman = normalizeText(order?.salesman);
    const partyType = normalizeText(getPartyType(order));
    const status = normalizeText(getOrderStatus(order));
    const orderDate = getOrderDate(order);

    if (searchText) {
      const searchableText = [
        orderNo,
        partyName,
        partyMobile,
        partyGST,
        salesman,
        partyType,
        status,
      ].join(" ");

      if (!searchableText.includes(searchText)) {
        return false;
      }
    }

    if (selectedSalesman && salesman !== selectedSalesman) {
      return false;
    }

    if (selectedType && partyType !== selectedType) {
      return false;
    }

    if (selectedStatus && status !== selectedStatus) {
      return false;
    }

    if (fromDate && (!orderDate || orderDate < fromDate)) {
      return false;
    }

    if (toDate && (!orderDate || orderDate > toDate)) {
      return false;
    }

    return true;
  });

  currentPage = 1;
  renderCurrentPage();
  updatePaginationUI();
  updateTableSubText();
};

/* ============================================================
   TABLE SUBTEXT
============================================================ */

function updateTableSubText() {
  if (!tableSubText) return;

  const total = filteredOrders.length;
  const allTotal = allOrdersMaster.length;

  tableSubText.textContent = `Showing ${total} of ${allTotal} orders`;
}
function ensureTotalsBar() {
  let bar = document.getElementById("ordersTotalsBar");

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "ordersTotalsBar";
    bar.className = "orders-totals-bar";

    bar.innerHTML = `
      <div class="total-pill">
        <span>Page Orders</span>
        <b id="pageOrdersCount">0</b>
      </div>

      <div class="total-pill">
        <span>Page Total</span>
        <b id="pageOrdersTotal">₹0.00</b>
      </div>

      
    `;

    const footer = document.querySelector(".orders-footer");
    const tableCard = document.querySelector(".orders-table-card");

    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(bar, footer);
    } else if (tableCard) {
      tableCard.appendChild(bar);
    }
  }

  return bar;
}

function updateOrdersTotalsUI() {
  ensureTotalsBar();

  const pageTotal = currentRenderedOrders.reduce((sum, order) => {
    return sum + getOrderTotal(order);
  }, 0);

  const filteredTotal = filteredOrders.reduce((sum, order) => {
    return sum + getOrderTotal(order);
  }, 0);

  const pageOrdersCount = document.getElementById("pageOrdersCount");
  const pageOrdersTotal = document.getElementById("pageOrdersTotal");

  if (pageOrdersCount) {
    pageOrdersCount.textContent = currentRenderedOrders.length;
  }

  if (pageOrdersTotal) {
    pageOrdersTotal.textContent = `₹${formatMoney(pageTotal)}`;
  }


}

/* ============================================================
   RENDER CURRENT PAGE
============================================================ */

function renderCurrentPage() {
  if (!ordersBody) return;

  if (selectAllRowsEl) selectAllRowsEl.checked = false;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  const pageData = filteredOrders.slice(start, end);
  currentRenderedOrders = pageData;

  if (!filteredOrders.length) {
    clearTableBody();
    showElement(emptyState);
    currentRenderedOrders = [];
    updateOrdersTotalsUI();
    return;
  }

  hideElement(emptyState);

  ordersBody.innerHTML = pageData
    .map((order, index) => {
      const orderId = String(order.id || "");
      const source = String(order.source || "orders");

      const partyType = getPartyType(order);
      const partyTypeClean = normalizeText(partyType);
      const statusText = getOrderStatus(order);
      const total = getOrderTotal(order);
      const billImage = getBillImage(order);

      const typeBadgeClass =
        partyTypeClean === "primary" ? "badge-success" : "badge-warning";

      const checked = selectedRowIds.has(orderId) ? "checked" : "";

      const billImageButton = billImage
  ? `
      <a
        href="${billImage}"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-info btn-sm">
        <i class="fa fa-image"></i> View Image
      </a>
    `
  : `<span style="color:#888;">Not Uploaded</span>`;

      return `
        <tr>
          <td>
            <input
              type="checkbox"
              class="rowCheck"
              value="${escapeAttr(orderId)}"
              ${checked}>
          </td>

          <td>${start + index + 1}</td>

          <td>${escapeHTML(order?.salesman || "-")}</td>

          <td>${escapeHTML(order?.orderNo || "-")}</td>

          <td>${escapeHTML(order?.party?.name || "-")}</td>

          <td>
            <span class="badge ${typeBadgeClass}">
              ${escapeHTML(partyType)}
            </span>
          </td>

          <td>₹${formatMoney(total)}</td>

          <td>
            <span class="badge-status ${statusClass(statusText)}">
              ${escapeHTML(statusText)}
            </span>
          </td>

          <td>
            <button
              type="button"
              class="btn btn-warning btn-sm js-edit-order"
              data-id="${escapeAttr(orderId)}"
              data-source="${escapeAttr(source)}">
              ✏ 
            </button>

            <button
              type="button"
              class="btn btn-primary btn-sm js-view-order"
              data-id="${escapeAttr(orderId)}">
              <i class="fa fa-eye"></i>
            </button>

            <button
              type="button"
              class="btn btn-danger btn-sm js-delete-order"
              data-id="${escapeAttr(orderId)}"
              data-source="${escapeAttr(source)}">
              <i class="fa fa-trash"></i>
            </button>
          </td>

          <td>${billImageButton}</td>
        </tr>
      `;
    })
    .join("");

  updateSelectAllState();
  updateOrdersTotalsUI();
}

/* ============================================================
   PAGINATION
============================================================ */

function getTotalPages() {
  return Math.ceil(filteredOrders.length / PAGE_SIZE) || 1;
}

function updatePaginationUI() {
  const totalPages = getTotalPages();

  if (pageIndicator) {
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  }

  if (prevPageBtn) {
    prevPageBtn.disabled = currentPage <= 1;
  }

  if (nextPageBtn) {
    nextPageBtn.disabled = currentPage >= totalPages;
  }
}

function goToPrevPage() {
  if (currentPage <= 1) return;

  currentPage--;
  renderCurrentPage();
  updatePaginationUI();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function goToNextPage() {
  const totalPages = getTotalPages();

  if (currentPage >= totalPages) return;

  currentPage++;
  renderCurrentPage();
  updatePaginationUI();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

if (prevPageBtn) {
  prevPageBtn.addEventListener("click", goToPrevPage);
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", goToNextPage);
}

window.goPrevPage = goToPrevPage;
window.goNextPage = goToNextPage;

/* ============================================================
   FILTER EVENTS
============================================================ */

if (salesmanFilterEl) {
  salesmanFilterEl.addEventListener("change", window.applyFiltersAndRender);
}

if (typeFilter) {
  typeFilter.addEventListener("change", window.applyFiltersAndRender);
}

if (statusFilter) {
  statusFilter.addEventListener("change", window.applyFiltersAndRender);
}

if (dateFrom) {
  dateFrom.addEventListener("change", window.applyFiltersAndRender);
}

if (dateTo) {
  dateTo.addEventListener("change", window.applyFiltersAndRender);
}

let searchDebounceTimer;

if (searchBox) {
  searchBox.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(window.applyFiltersAndRender, 350);
  });
}

/* ============================================================
   CLEAR FILTERS
============================================================ */

window.clearAllFilters = function () {
  if (searchBox) searchBox.value = "";
  if (statusFilter) statusFilter.value = "";
  if (dateFrom) dateFrom.value = "";
  if (dateTo) dateTo.value = "";
  if (salesmanFilterEl) salesmanFilterEl.value = "";
  if (typeFilter) typeFilter.value = "";

  selectedRowIds.clear();
  currentPage = 1;

  window.applyFiltersAndRender();
};

/* ============================================================
   TABLE EVENT DELEGATION
============================================================ */

if (ordersBody) {
  ordersBody.addEventListener("click", (event) => {
    const target = event.target.closest("button");

    if (!target) return;

    if (target.classList.contains("js-edit-order")) {
      window.editOrder(target.dataset.id, target.dataset.source);
      return;
    }

    if (target.classList.contains("js-view-order")) {
      window.viewOrder(target.dataset.id);
      return;
    }

    if (target.classList.contains("js-delete-order")) {
      window.openDeleteModal(target.dataset.id, target.dataset.source);
      return;
    }

    if (target.classList.contains("js-bill-image")) {
      window.openImageModal(target.dataset.image);
    }
  });

  ordersBody.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".rowCheck");

    if (!checkbox) return;

    if (checkbox.checked) {
      selectedRowIds.add(checkbox.value);
    } else {
      selectedRowIds.delete(checkbox.value);
    }

    updateSelectAllState();
  });
}

/* ============================================================
   SELECT ALL ROWS
============================================================ */

window.toggleAllRows = function (source) {
  const shouldCheck = !!source.checked;

  currentRenderedOrders.forEach((order) => {
    const id = String(order.id || "");

    if (shouldCheck) {
      selectedRowIds.add(id);
    } else {
      selectedRowIds.delete(id);
    }
  });

  document.querySelectorAll(".rowCheck").forEach((checkbox) => {
    checkbox.checked = shouldCheck;
  });

  updateSelectAllState();
};

function updateSelectAllState() {
  if (!selectAllRowsEl) return;

  if (!currentRenderedOrders.length) {
    selectAllRowsEl.checked = false;
    selectAllRowsEl.indeterminate = false;
    return;
  }

  const selectedOnPage = currentRenderedOrders.filter((order) =>
    selectedRowIds.has(String(order.id || ""))
  ).length;

  selectAllRowsEl.checked = selectedOnPage === currentRenderedOrders.length;
  selectAllRowsEl.indeterminate =
    selectedOnPage > 0 && selectedOnPage < currentRenderedOrders.length;
}

/* ============================================================
   VIEW ORDER MODAL
============================================================ */

window.viewOrder = function (id) {
  const order =
    allOrdersMaster.find((item) => String(item.id) === String(id)) ||
    currentRenderedOrders.find((item) => String(item.id) === String(id));

  if (!order) {
    showToast("❌ Order not found");
    return;
  }

  const div = document.getElementById("modalContent");

  if (!div) return;

  const statusText = getOrderStatus(order);
  const cancelReason = order?.cancelRemark || order?.holdReason || "";

  const items = Array.isArray(order?.items) ? order.items : [];

  const gstPercentForItems = numberValue(order?.gstPercent || 18);
  const gstDividerForItems = 1 + gstPercentForItems / 100;

  let itemsHTML = `
  <table class="table table-bordered" style="width:100%;margin-bottom:15px;border-collapse:collapse;">
    <thead style="background-color:#f4f4f4;text-align:left;">
      <tr>
        <th>Item Code</th>
        <th>Unit</th>
        <th>Qty</th>
        <th>After Discount Rate</th>
        <th>After Discount Total</th>
      </tr>
    </thead>
    <tbody>
`;

  if (items.length) {
    items.forEach((item) => {
      const qty = numberValue(item?.qty || 0);
      const rateWithGst = numberValue(item?.rate ?? 0);

      const rateWithoutGst = rateWithGst / gstDividerForItems;

      /* category detect */
      const itemCategory = normalizeText(
        item?.category ||
        item?.productCategory ||
        item?.cat ||
        ""
      );

      /* category discount */
      let discountPercent = 0;

      if (itemCategory.includes("hardware")) {
        discountPercent = numberValue(order?.categoryDiscounts?.hardware || 0);
      } else if (
        itemCategory.includes("bathroom") ||
        itemCategory.includes("bath")
      ) {
        discountPercent = numberValue(order?.categoryDiscounts?.bathroom || 0);
      } else if (
        itemCategory.includes("stainlesssteel") ||
        itemCategory.includes("stainless steel") ||
        itemCategory.includes("ss")
      ) {
        discountPercent = numberValue(order?.categoryDiscounts?.stainlesssteel || 0);
      }

      /* after discount rate without GST */
      const afterDiscountRate = rateWithoutGst - (rateWithoutGst * discountPercent / 100);
      const afterDiscountTotal = afterDiscountRate * qty;

      itemsHTML += `
  <tr>
    <td>${escapeHTML(item?.code || "-")}</td>
    <td>${escapeHTML(item?.unit || "-")}</td>
    <td>${escapeHTML(qty)}</td>
    <td>₹${formatMoney(afterDiscountRate)}</td>
    <td>₹${formatMoney(afterDiscountTotal)}</td>
  </tr>
`;
    });
  } else {
    itemsHTML += `
    <tr>
      <td colspan="5" style="text-align:center;color:#888;">
        No items found.
      </td>
    </tr>
  `;
  }

  itemsHTML += `</tbody></table>`;

  const categoryDiscountsHTML = `
    <div style="font-weight:bold;margin-bottom:10px;">
      <div style="margin-bottom:8px;">
        <b>Hardware Discount:</b>
        ${escapeHTML(order?.categoryDiscounts?.hardware || 0)}%
        ${order?.categoryDiscountPercents?.hardware
      ? `(${escapeHTML(order.categoryDiscountPercents.hardware)})`
      : ""
    }
      </div>

      <div>
        <b>Bathroom Discount:</b>
        ${escapeHTML(order?.categoryDiscounts?.bathroom || 0)}%
        ${order?.categoryDiscountPercents?.bathroom
      ? `(${escapeHTML(order.categoryDiscountPercents.bathroom)})`
      : ""
    }
      </div>

      <div style="margin-top:8px;">
        <b>SS Discount:</b>
        ${escapeHTML(order?.categoryDiscounts?.stainlesssteel || 0)}%
        ${order?.categoryDiscountPercents?.stainlesssteel
      ? `(${escapeHTML(order.categoryDiscountPercents.stainlesssteel)})`
      : ""
    }
      </div>
    </div>
  `;

  const displayTotals = calculateOrderDisplayTotals(order);

  const billingHTML = `
  <div style="margin-top:15px;">
    <p><b>Taxable Amount:</b> ₹${formatMoney(displayTotals.taxableAmount)}</p>
    <p><b>Freight:</b> ₹${formatMoney(displayTotals.freight)}</p>
    <p><b>Special Discount:</b> ₹${formatMoney(displayTotals.specialDiscount)}</p>
    <p><b>GST (${escapeHTML(displayTotals.gstPercent)}%):</b> ₹${formatMoney(displayTotals.gstAmount)}</p>
    <h3><b>Grand Total Incl. GST:</b> ₹${formatMoney(displayTotals.grandTotalInclGst)}</h3>
  </div>
`;

  const showReason =
    (normalizeText(statusText) === "cancelled" ||
      normalizeText(statusText) === "hold") &&
    cancelReason;

  const cancelReasonHTML = showReason
    ? `
      <div style="background:#fff3f3;border:1px solid #f5c2c7;color:#842029;padding:12px 14px;border-radius:8px;margin-bottom:20px;">
        <div style="font-weight:700;margin-bottom:6px;">
          Status: ${escapeHTML(statusText)}
        </div>
        <div>
          <b>${normalizeText(statusText) === "hold" ? "Hold Reason" : "Cancel Reason"}:</b>
          ${escapeHTML(cancelReason)}
        </div>
      </div>
    `
    : "";

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;position:sticky;top:0;background:#fff;z-index:100;padding:10px 0;">
      <div style="font-size:24px;font-weight:600;">
        Order Details #${escapeHTML(order?.orderNo || "-")}
      </div>

      <div>
        <button class="btn btn-success btn-sm" onclick="downloadOrder()" style="margin-right:10px;">
          <i class="fa fa-download"></i> Download
        </button>

        <button class="btn btn-light btn-sm" onclick="closeModal()">✖</button>
      </div>
    </div>

    <hr style="border:1px solid #ccc;">

    ${cancelReasonHTML}

    <div style="margin-bottom:20px;">
      <h4 style="font-size:18px;font-weight:600;">Party Details</h4>
      <p><b>Name:</b> ${escapeHTML(order?.party?.name || "-")}</p>
      <p><b>Mobile:</b> ${escapeHTML(order?.party?.mobile || "-")}</p>
      <p><b>Address:</b> ${escapeHTML(order?.party?.address || "-")}</p>
      <p><b>GST:</b> ${escapeHTML(order?.party?.gst || "-")}</p>
      <p><b>Type:</b> ${escapeHTML(getPartyType(order))}</p>
      <p><b>Salesman:</b> ${escapeHTML(order?.salesman || "-")}</p>
      <p><b>Order Date:</b> ${escapeHTML(getOrderDate(order) || "-")}</p>
      <p><b>Status:</b> ${escapeHTML(statusText)}</p>
    </div>

    <div style="margin-bottom:20px;">
      <h4 style="font-size:18px;font-weight:600;">Items</h4>
      ${itemsHTML}
    </div>

    <div style="margin-bottom:20px;">
      <h4 style="font-size:18px;font-weight:600;color:#108082;">Category Discounts</h4>
      ${categoryDiscountsHTML}
    </div>

    <div>
      <h4 style="font-size:18px;font-weight:600;color:#108082;">Billing</h4>
      ${billingHTML}
    </div>
  `;

  const modal = document.getElementById("modal");

  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
};

/* ============================================================
   EDIT ORDER
============================================================ */

window.editOrder = function (orderId, source = "orders") {
  if (!orderId) {
    showToast("❌ Order ID missing");
    return;
  }

  window.location.href = `edit-order.html?id=${encodeURIComponent(orderId)}&source=${encodeURIComponent(source)}`;
};

/* ============================================================
   DELETE MODAL
============================================================ */

window.openDeleteModal = function (orderId, source = "orders") {
  deleteOrderId = orderId;
  deleteOrderSource = source || "orders";

  const deletePass = document.getElementById("deletePass");
  const deleteMsg = document.getElementById("deleteMsg");
  const deleteModal = document.getElementById("deleteModal");

  if (deletePass) deletePass.value = "";

  if (deleteMsg) {
    deleteMsg.style.display = "none";
    deleteMsg.textContent = "";
    deleteMsg.style.color = "";
  }

  if (deleteModal) {
    deleteModal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
};

window.closeDeleteModal = function () {
  const deleteModal = document.getElementById("deleteModal");
  const deleteMsg = document.getElementById("deleteMsg");

  if (deleteModal) deleteModal.style.display = "none";

  if (deleteMsg) {
    deleteMsg.style.display = "none";
    deleteMsg.textContent = "";
    deleteMsg.style.color = "";
  }

  document.body.style.overflow = "auto";
};

/* ============================================================
   CONFIRM DELETE
============================================================ */

window.confirmDelete = async function () {
  const passInput = document.getElementById("deletePass");
  const msg = document.getElementById("deleteMsg");

  if (!passInput || !msg) return;

  const pass = passInput.value.trim();

  msg.style.display = "block";
  msg.textContent = "";
  msg.style.color = "";

  if (!deleteOrderId) {
    msg.textContent = "❌ Order ID missing.";
    msg.style.color = "red";
    return;
  }

  if (pass !== ADMIN_DELETE_PASSWORD) {
    msg.textContent = "❌ Incorrect Password";
    msg.style.color = "red";
    return;
  }

  const buttons = document.querySelectorAll("#deleteModal button");
  buttons.forEach((button) => {
    button.disabled = true;
  });

  const deletedOrder = allOrdersMaster.find(
    (order) => String(order.id) === String(deleteOrderId)
  );

  const deletedOrderNo = deletedOrder?.orderNo || deleteOrderId;

  try {
    await db.collection(deleteOrderSource).doc(deleteOrderId).delete();

    allOrdersMaster = allOrdersMaster.filter(
      (order) => String(order.id) !== String(deleteOrderId)
    );

    filteredOrders = filteredOrders.filter(
      (order) => String(order.id) !== String(deleteOrderId)
    );

    selectedRowIds.delete(String(deleteOrderId));

    if (currentPage > getTotalPages()) {
      currentPage = getTotalPages();
    }

    renderCurrentPage();
    updatePaginationUI();
    updateTableSubText();

    window.closeDeleteModal();

    showToast(`✅ Order ${deletedOrderNo} Deleted Successfully`);

  } catch (err) {
    console.error("Delete error:", err);

    msg.textContent = "❌ Delete Failed. Try again.";
    msg.style.color = "red";

  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};

/* ============================================================
   PASSWORD TOGGLE
============================================================ */

window.togglePass = function () {
  const pass = document.getElementById("deletePass");
  const icon = document.querySelector(".toggle-eye");

  if (!pass || !icon) return;

  if (
    pass.style.webkitTextSecurity === "disc" ||
    pass.style.webkitTextSecurity === ""
  ) {
    pass.style.webkitTextSecurity = "none";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  } else {
    pass.style.webkitTextSecurity = "disc";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  }
};

/* ============================================================
   VIEW MODAL CLOSE
============================================================ */

window.closeModal = function () {
  const modal = document.getElementById("modal");

  if (modal) {
    modal.style.display = "none";
  }

  document.body.style.overflow = "auto";
};

/* ============================================================
   DOWNLOAD ORDER PRINT
============================================================ */

window.downloadOrder = function () {
  const modalContent = document.getElementById("modalContent");

  if (!modalContent) return;

  const content = modalContent.innerHTML;

  const win = window.open("", "", "width=950,height=750");

  if (!win) {
    alert("Popup blocked. Please allow popups to download/print order.");
    return;
  }

  win.document.write(`
    <html>
      <head>
        <title>Order Download</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #111;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          table,
          th,
          td {
            border: 1px solid #ccc;
          }

          th,
          td {
            padding: 8px;
            text-align: left;
          }

          h3 {
            margin-top: 20px;
          }

          button {
            display: none !important;
          }
        </style>
      </head>

      <body>
        ${content}
      </body>
    </html>
  `);

  win.document.close();
  win.focus();
  win.print();
};

/* ============================================================
   IMAGE MODAL
============================================================ */

window.openImageModal = function (imageUrl) {
  if (!imageUrl) {
    showToast("❌ Image not found");
    return;
  }

  const modal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const imageSkeleton = document.getElementById("imageSkeleton");

  if (!modal || !modalImage || !imageSkeleton) return;

  imageSkeleton.style.display = "block";
  modalImage.style.display = "none";
  modalImage.src = "";

  const img = new Image();

  img.onload = function () {
    modalImage.src = imageUrl;
    imageSkeleton.style.display = "none";
    modalImage.style.display = "block";
  };

  img.onerror = function () {
    imageSkeleton.style.display = "none";
    modalImage.style.display = "none";
    showToast("❌ Image failed to load");
  };

  img.src = imageUrl;

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
};

window.closeImageModal = function () {
  const modal = document.getElementById("imageModal");

  if (modal) {
    modal.style.display = "none";
  }

  document.body.style.overflow = "auto";
};

/* Old compatibility */
window.viewImage = function (id) {
  const order = allOrdersMaster.find((item) => String(item.id) === String(id));

  if (!order || !getBillImage(order)) {
    showToast("❌ Bill image not uploaded");
    return;
  }

  window.openImageModal(getBillImage(order));
};

/* ============================================================
   EXPORT CSV
============================================================ */

const exportColumns = [
  {
    key: "salesman",
    label: "Salesman",
    get: (order) => order?.salesman || "-",
  },
  {
    key: "orderNo",
    label: "Order No",
    get: (order) => order?.orderNo || "-",
  },
  {
    key: "partyName",
    label: "Party Name",
    get: (order) => order?.party?.name || "-",
  },
  {
    key: "partyType",
    label: "Party Type",
    get: (order) => getPartyType(order),
  },
  {
    key: "mobile",
    label: "Mobile",
    get: (order) => order?.party?.mobile || "-",
  },
  {
    key: "gst",
    label: "GST",
    get: (order) => order?.party?.gst || "-",
  },
  {
    key: "address",
    label: "Address",
    get: (order) => order?.party?.address || "-",
  },
  {
    key: "total",
    label: "Total",
    get: (order) => formatMoney(getOrderTotal(order)),
  },
  {
    key: "status",
    label: "Status",
    get: (order) => getOrderStatus(order),
  },
  {
    key: "date",
    label: "Order Date",
    get: (order) => getOrderDate(order) || "-",
  },
  {
    key: "billAmount",
    label: "Bill Amount",
    get: (order) =>
      order?.billAmount ? `₹${formatMoney(order.billAmount)}` : "-",
  },
  {
    key: "source",
    label: "Source",
    get: (order) => order?.source || "orders",
  },
  {
    key: "items",
    label: "Items",
    get: (order) =>
      Array.isArray(order?.items)
        ? order.items
          .map((item) => {
            const code = item?.code || "-";
            const qty = item?.qty || 0;
            const unit = item?.unit || "-";
            return `${code} (${qty} ${unit})`;
          })
          .join(" | ")
        : "-",
  },
];

let selectedColumnKeys = exportColumns.map((column) => column.key);

window.openExportModal = function () {
  const exportModal = document.getElementById("exportModal");

  if (exportModal) {
    exportModal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  window.renderExportColumns();
};

window.closeExportModal = function () {
  const exportModal = document.getElementById("exportModal");

  if (exportModal) {
    exportModal.style.display = "none";
  }

  document.body.style.overflow = "auto";
};

window.renderExportColumns = function () {
  const box = document.getElementById("exportColumnsList");
  const columnSearch = document.getElementById("columnSearch");

  if (!box) return;

  const search = normalizeText(columnSearch?.value);

  const filteredColumns = exportColumns.filter((column) =>
    normalizeText(column.label).includes(search)
  );

  box.innerHTML = filteredColumns
    .map((column) => {
      const checked = selectedColumnKeys.includes(column.key) ? "checked" : "";

      return `
        <label>
          <input
            type="checkbox"
            class="exportColumnCheck"
            value="${escapeAttr(column.key)}"
            ${checked}
            onchange="updateSelectedColumns()">
          <span>${escapeHTML(column.label)}</span>
        </label>
      `;
    })
    .join("");

  updateColumnCount();
};

window.updateSelectedColumns = function () {
  selectedColumnKeys = Array.from(
    document.querySelectorAll(".exportColumnCheck:checked")
  ).map((checkbox) => checkbox.value);

  updateColumnCount();
};

function updateColumnCount() {
  const countBox = document.getElementById("selectedColumnCount");
  const selectAllColumns = document.getElementById("selectAllColumns");

  if (countBox) {
    countBox.textContent = `${selectedColumnKeys.length} Selected`;
  }

  if (selectAllColumns) {
    selectAllColumns.checked =
      selectedColumnKeys.length === exportColumns.length;
    selectAllColumns.indeterminate =
      selectedColumnKeys.length > 0 &&
      selectedColumnKeys.length < exportColumns.length;
  }
}

window.toggleAllColumns = function (source) {
  selectedColumnKeys = source.checked
    ? exportColumns.map((column) => column.key)
    : [];

  window.renderExportColumns();
};

function csvSafe(value) {
  let text = String(value ?? "");

  /*
    Excel formula injection protection
    Agar value = + - @ se start hoti hai to apostrophe add karega.
  */
  if (/^[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

window.downloadCustomCSV = function () {
  window.updateSelectedColumns();

  if (!selectedColumnKeys.length) {
    alert("Please select at least one column.");
    return;
  }

  let exportRows = filteredOrders;

  const selectedMatchingRows = filteredOrders.filter((order) =>
    selectedRowIds.has(String(order.id || ""))
  );

  if (selectedMatchingRows.length > 0) {
    exportRows = selectedMatchingRows;
  }

  if (!exportRows.length) {
    alert("No data found to download.");
    return;
  }

  const selectedColumns = exportColumns.filter((column) =>
    selectedColumnKeys.includes(column.key)
  );

  let csv = selectedColumns.map((column) => csvSafe(column.label)).join(",");
  csv += "\n";

  exportRows.forEach((order) => {
    csv += selectedColumns
      .map((column) => csvSafe(column.get(order)))
      .join(",");
    csv += "\n";
  });

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = `PETRO_Orders_Report_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  window.closeExportModal();
};

/* ============================================================
   TOAST
============================================================ */

function showToast(message) {
  let toast = document.getElementById("petroToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "petroToast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";

  toast.classList.remove("show");

  void toast.offsetWidth;

  toast.classList.add("show");

  clearTimeout(toast._hideTimer);

  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");

    setTimeout(() => {
      toast.style.display = "none";
    }, 300);
  }, 2500);
}

/* ============================================================
   MODAL BACKDROP CLOSE
============================================================ */

document.addEventListener("click", (event) => {
  const imageModal = document.getElementById("imageModal");
  const exportModal = document.getElementById("exportModal");
  const deleteModal = document.getElementById("deleteModal");
  const viewModal = document.getElementById("modal");

  if (event.target === imageModal) {
    window.closeImageModal();
  }

  if (event.target === exportModal) {
    window.closeExportModal();
  }

  if (event.target === deleteModal) {
    window.closeDeleteModal();
  }

  if (event.target === viewModal) {
    window.closeModal();
  }
});

/* ============================================================
   ESC KEY CLOSE MODALS
============================================================ */

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  window.closeImageModal();
  window.closeExportModal();
  window.closeDeleteModal();
  window.closeModal();
});

/* ============================================================
   INIT
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  populateSalesmanMasterList();
  fetchAllOrders();
});