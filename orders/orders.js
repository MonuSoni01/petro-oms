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
let currentViewedOrderId = null; 



let deleteOrderId = null;

let deleteOrderSource = "orders";



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



function buildISODate(year, month, day) {

  const y = Number(year);

  const m = Number(month);

  const d = Number(day);



  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {

    return "";

  }



  const date = new Date(y, m - 1, d);



  if (

    date.getFullYear() !== y ||

    date.getMonth() !== m - 1 ||

    date.getDate() !== d

  ) {

    return "";

  }



  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

}



function localDateToISO(date) {

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";



  return buildISODate(

    date.getFullYear(),

    date.getMonth() + 1,

    date.getDate()

  );

}



function getOrderDateValue(value) {

  if (!value) return "";



  if (value && typeof value.toDate === "function") {

    return localDateToISO(value.toDate());

  }



  if (value instanceof Date) {

    return localDateToISO(value);

  }



  if (typeof value === "number") {

    return localDateToISO(new Date(value));

  }



  if (typeof value !== "string") return "";



  const text = value.trim();

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);



  if (match) {

    return buildISODate(match[1], match[2], match[3]);

  }



  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);



  if (match) {

    return buildISODate(match[3], match[2], match[1]);

  }



  return "";

}



function getOrderDate(order) {

  // Table display and From/To filters must use the actual order date,

  // not the record creation/saved timestamp.

  return getOrderDateValue(order?.orderDate || order?.date);

}



function formatOrderDateForDisplay(order) {

  const orderDate = getOrderDate(order);



  if (!orderDate) return "-";



  const [year, month, day] = orderDate.split("-");

  return year && month && day ? `${day}-${month}-${year}` : orderDate;

}



function getSortTime(order) {

  const normalizedOrderDate = getOrderDate(order);



  if (normalizedOrderDate) {

    return new Date(`${normalizedOrderDate}T00:00:00`).getTime();

  }



  const value = order?.savedAt || order?.createdAt || null;



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

  return (

    order?.party?.type ||

    order?.partyType ||

    order?.type ||

    "Secondary"

  );

}



function getPartyCity(order) {

  return (

    order?.party?.city ||

    order?.partyCity ||

    order?.party?.address ||

    order?.address ||

    "-"

  );

}



function getDistributor(order) {

  return (

    order?.party?.distributor ||

    order?.party?.partyDistributor ||

    order?.party?.transport ||

    order?.distributor ||

    order?.partyDistributor ||

    order?.transport ||

    "-"

  );

}



function getPartyAddress(order) {

  return (

    order?.party?.address ||

    order?.address ||

    order?.party?.city ||

    order?.partyCity ||

    "-"

  );

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

        <td colspan="11" style="text-align:center; padding:30px; color:#888;">

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

        <td colspan="11" style="text-align:center; padding:30px; color:#d93025;">

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

   All filters are applied to this complete in-memory list.

============================================================ */



const FIREBASE_PAGE_SIZE = 10;

let currentPage = 1;



async function fetchFirstOrdersPage() {

  showLoadingState();



  try {

    const snapshot = await db

      .collection("orders")

      .get();



    allOrdersMaster = snapshot.docs.map((doc) => ({

      id: doc.id,

      source: "orders",

      ...doc.data(),

    })).sort((a, b) => getSortTime(b) - getSortTime(a));



    currentPage = 1;



    populateSalesmanMasterList();

    applyFiltersAndRender();



  } catch (err) {

    console.error("Orders fetch error:", err);

    showErrorState("Orders load failed. Please refresh and try again.");

  }

}



/* ============================================================

   SALESMAN DROPDOWN

   ONLY NAMES THAT ACTUALLY EXIST IN LOADED ORDERS

============================================================ */



function populateSalesmanMasterList() {

  if (!salesmanFilterEl) return;



  const selectedValue = salesmanFilterEl.value;



  const salesmanSet = new Set();



  allOrdersMaster.forEach((order) => {

    const name = String(order?.salesman || "").trim();

    if (name) salesmanSet.add(name);

  });



  const salesmanList = Array.from(salesmanSet).sort((a, b) =>

    a.localeCompare(b, undefined, { sensitivity: "base" })

  );



  salesmanFilterEl.innerHTML = `<option value="">All Salesmen</option>`;



  salesmanList.forEach((name) => {

    const option = document.createElement("option");

    option.value = name;

    option.textContent = name;

    salesmanFilterEl.appendChild(option);

  });



  if (selectedValue && salesmanSet.has(selectedValue)) {

    salesmanFilterEl.value = selectedValue;

  } else {

    salesmanFilterEl.value = "";

  }

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



  if (dateTo) dateTo.setCustomValidity("");



  if (fromDate && toDate && fromDate > toDate) {

    filteredOrders = [];

    currentPage = 1;

    renderCurrentPage();

    updateFirestorePaginationButtons();



    if (dateTo) {

      dateTo.setCustomValidity("To Date must be the same as or after From Date.");

      dateTo.reportValidity();

    }



    showToast("To Date, From Date se pehle nahi ho sakti.");

    return;

  }



  filteredOrders = allOrdersMaster.filter((order) => {

    const orderNo = normalizeText(order?.orderNo);

    const partyName = normalizeText(order?.party?.name);

    const partyMobile = normalizeText(order?.party?.mobile);

    const partyGST = normalizeText(order?.party?.gst);

    const distributor = normalizeText(getDistributor(order));

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

        distributor,

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

  updateFirestorePaginationButtons();

  updateTableSubText();

};



/* ============================================================

   TABLE SUBTEXT

============================================================ */



function updateTableSubText() {

  if (!tableSubText) return;



  const filteredTotal = filteredOrders.length;

  const allTotal = allOrdersMaster.length;

  const start = filteredTotal

    ? (currentPage - 1) * FIREBASE_PAGE_SIZE + 1

    : 0;

  const end = Math.min(currentPage * FIREBASE_PAGE_SIZE, filteredTotal);



  const hasFilters = Boolean(

    searchBox?.value ||

    salesmanFilterEl?.value ||

    typeFilter?.value ||

    statusFilter?.value ||

    dateFrom?.value ||

    dateTo?.value

  );



  tableSubText.textContent = hasFilters

    ? `Showing ${start}-${end} of ${filteredTotal} matching orders (${allTotal} total)`

    : `Showing ${start}-${end} of ${allTotal} orders`;

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



  const start = (currentPage - 1) * FIREBASE_PAGE_SIZE;

  const pageData = filteredOrders.slice(start, start + FIREBASE_PAGE_SIZE);

  currentRenderedOrders = pageData;



  if (!filteredOrders.length) {

    clearTableBody();

    showElement(emptyState);

    currentRenderedOrders = [];

    updateOrdersTotalsUI();

    updateTableSubText();

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

      const orderDate = formatOrderDateForDisplay(order);

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



          <td>${escapeHTML(orderDate)}</td>



          <td>${escapeHTML(order?.party?.name || "-")}</td>



          <td>${escapeHTML(getDistributor(order))}</td>



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

  updateTableSubText();

}



/* ============================================================

   PAGINATION

============================================================ */







function getTotalPages() {

  return Math.max(1, Math.ceil(filteredOrders.length / FIREBASE_PAGE_SIZE));

}



function updateFirestorePaginationButtons() {

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

  updateFirestorePaginationButtons();



  document.querySelector(".orders-table-card")?.scrollIntoView({

    behavior: "smooth",

    block: "start",

  });

}



function goToNextPage() {

  if (currentPage >= getTotalPages()) return;



  currentPage++;

  renderCurrentPage();

  updateFirestorePaginationButtons();



  document.querySelector(".orders-table-card")?.scrollIntoView({

    behavior: "smooth",

    block: "start",

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



// window.viewOrder = function (id) {

//   const order =

//     allOrdersMaster.find((item) => String(item.id) === String(id)) ||

//     currentRenderedOrders.find((item) => String(item.id) === String(id));



//   if (!order) {

//     showToast("❌ Order not found");

//     return;

//   }



//   currentViewedOrderId = String(id);

//   const div = document.getElementById("modalContent");



//   if (!div) return;



//   const statusText = getOrderStatus(order);

//   const cancelReason = order?.cancelRemark || order?.holdReason || "";



//   const items = Array.isArray(order?.items) ? order.items : [];



//   const gstPercentForItems = numberValue(order?.gstPercent || 18);

//   const gstDividerForItems = 1 + gstPercentForItems / 100;



//   let itemsHTML = `

//   <table class="table table-bordered" style="width:100%;margin-bottom:15px;border-collapse:collapse;">

//     <thead style="background-color:#f4f4f4;text-align:left;">

//       <tr>

//         <th>Item Code</th>

//         <th>Unit</th>

//         <th>Qty</th>

//         <th>After Discount Rate</th>

//         <th>After Discount Total</th>

//       </tr>

//     </thead>

//     <tbody>

// `;



//   if (items.length) {

//     items.forEach((item) => {

//       const qty = numberValue(item?.qty || 0);

//       const rateWithGst = numberValue(item?.rate ?? 0);



//       const rateWithoutGst = rateWithGst / gstDividerForItems;



//       /* category detect */

//       const itemCategory = normalizeText(

//         item?.category ||

//         item?.productCategory ||

//         item?.cat ||

//         ""

//       );



//       /* category discount */

//       let discountPercent = 0;



//       if (itemCategory.includes("hardware")) {

//         discountPercent = numberValue(order?.categoryDiscounts?.hardware || 0);

//       } else if (

//         itemCategory.includes("bathroom") ||

//         itemCategory.includes("bath")

//       ) {

//         discountPercent = numberValue(order?.categoryDiscounts?.bathroom || 0);

//       } else if (

//         itemCategory.includes("stainlesssteel") ||

//         itemCategory.includes("stainless steel") ||

//         itemCategory.includes("ss")

//       ) {

//         discountPercent = numberValue(order?.categoryDiscounts?.stainlesssteel || 0);

//       }



//       /* after discount rate without GST */

//       const afterDiscountRate = rateWithoutGst - (rateWithoutGst * discountPercent / 100);

//       const afterDiscountTotal = afterDiscountRate * qty;



//       itemsHTML += `

//   <tr>

//     <td>${escapeHTML(item?.code || "-")}</td>

//     <td>${escapeHTML(item?.unit || "-")}</td>

//     <td>${escapeHTML(qty)}</td>

//     <td>₹${formatMoney(afterDiscountRate)}</td>

//     <td>₹${formatMoney(afterDiscountTotal)}</td>

//   </tr>

// `;

//     });

//   } else {

//     itemsHTML += `

//     <tr>

//       <td colspan="5" style="text-align:center;color:#888;">

//         No items found.

//       </td>

//     </tr>

//   `;

//   }



//   itemsHTML += `</tbody></table>`;



//   const categoryDiscountsHTML = `

//     <div style="font-weight:bold;margin-bottom:10px;">

//       <div style="margin-bottom:8px;">

//         <b>Hardware Discount:</b>

//         ${escapeHTML(order?.categoryDiscounts?.hardware || 0)}%

//         ${order?.categoryDiscountPercents?.hardware

//       ? `(${escapeHTML(order.categoryDiscountPercents.hardware)})`

//       : ""

//     }

//       </div>



//       <div>

//         <b>Bathroom Discount:</b>

//         ${escapeHTML(order?.categoryDiscounts?.bathroom || 0)}%

//         ${order?.categoryDiscountPercents?.bathroom

//       ? `(${escapeHTML(order.categoryDiscountPercents.bathroom)})`

//       : ""

//     }

//       </div>



//       <div style="margin-top:8px;">

//         <b>SS Discount:</b>

//         ${escapeHTML(order?.categoryDiscounts?.stainlesssteel || 0)}%

//         ${order?.categoryDiscountPercents?.stainlesssteel

//       ? `(${escapeHTML(order.categoryDiscountPercents.stainlesssteel)})`

//       : ""

//     }

//       </div>

//     </div>

//   `;



//   const displayTotals = calculateOrderDisplayTotals(order);



//   const billingHTML = `

//   <div style="margin-top:15px;">

//     <p><b>Taxable Amount:</b> ₹${formatMoney(displayTotals.taxableAmount)}</p>

//     <p><b>Freight:</b> ₹${formatMoney(displayTotals.freight)}</p>

//     <p><b>Special Discount:</b> ₹${formatMoney(displayTotals.specialDiscount)}</p>

//     <p><b>GST (${escapeHTML(displayTotals.gstPercent)}%):</b> ₹${formatMoney(displayTotals.gstAmount)}</p>

//     <h3><b>Grand Total Incl. GST:</b> ₹${formatMoney(displayTotals.grandTotalInclGst)}</h3>

//   </div>

// `;



//   const showReason =

//     (normalizeText(statusText) === "cancelled" ||

//       normalizeText(statusText) === "hold") &&

//     cancelReason;



//   const cancelReasonHTML = showReason

//     ? `

//       <div style="background:#fff3f3;border:1px solid #f5c2c7;color:#842029;padding:12px 14px;border-radius:8px;margin-bottom:20px;">

//         <div style="font-weight:700;margin-bottom:6px;">

//           Status: ${escapeHTML(statusText)}

//         </div>

//         <div>

//           <b>${normalizeText(statusText) === "hold" ? "Hold Reason" : "Cancel Reason"}:</b>

//           ${escapeHTML(cancelReason)}

//         </div>

//       </div>

//     `

//     : "";



//   div.innerHTML = `

//     <div class="order-view-shell">



//       <div class="order-view-topbar">

//         <div>

//           <div class="order-view-kicker">Order Details</div>

//           <h2>#${escapeHTML(order?.orderNo || "-")}</h2>

//         </div>



//         <div class="order-view-actions">

//           <button class="btn order-download-btn" onclick="downloadOrder(currentViewedOrderId)">

//             <i class="fa fa-download"></i>

//             Download

//           </button>



//           <button class="btn order-close-btn" onclick="closeModal()" aria-label="Close">

//             <i class="fa fa-xmark"></i>

//           </button>

//         </div>

//       </div>



//       ${cancelReasonHTML}



//       <div class="order-summary-grid">



//         <section class="order-detail-card">

//           <div class="detail-card-title">

//             <i class="fa-solid fa-building-user"></i>

//             Party Details

//           </div>



//           <div class="detail-list">

//             <div class="detail-row">

//               <span>Name</span>

//               <strong>${escapeHTML(order?.party?.name || "-")}</strong>

//             </div>



//             <div class="detail-row">

//               <span>Mobile</span>

//               <strong>${escapeHTML(order?.party?.mobile || "-")}</strong>

//             </div>



//             <div class="detail-row">

//               <span>City</span>

//               <strong>${escapeHTML(getPartyCity(order))}</strong>

//             </div>



//             <div class="detail-row">

//               <span>GST</span>

//               <strong>${escapeHTML(order?.party?.gst || "-")}</strong>

//             </div>



//             <div class="detail-row detail-row-highlight">

//               <span>Party Type</span>

//               <strong>${escapeHTML(getPartyType(order))}</strong>

//             </div>



//             <div class="detail-row">

//               <span>Distributor</span>

//               <strong>${escapeHTML(getDistributor(order))}</strong>

//             </div>

//           </div>

//         </section>



//         <section class="order-detail-card">

//           <div class="detail-card-title">

//             <i class="fa-solid fa-receipt"></i>

//             Order Details

//           </div>



//           <div class="detail-list">

//             <div class="detail-row">

//               <span>Order No.</span>

//               <strong>${escapeHTML(order?.orderNo || "-")}</strong>

//             </div>



//             <div class="detail-row">

//               <span>Order Date</span>

//               <strong>${escapeHTML(formatOrderDateForDisplay(order))}</strong>

//             </div>



//             <div class="detail-row">

//               <span>Salesman</span>

//               <strong>${escapeHTML(order?.salesman || "-")}</strong>

//             </div>



//             <div class="detail-row">

//               <span>Status</span>

//               <strong>

//                 <span class="badge-status ${statusClass(statusText)}">

//                   ${escapeHTML(statusText)}

//                 </span>

//               </strong>

//             </div>



//             <div class="detail-row">

//               <span>Grand Total</span>

//               <strong class="detail-money">

//                 ₹${formatMoney(displayTotals.grandTotalInclGst)}

//               </strong>

//             </div>

//           </div>

//         </section>



//       </div>



//       <section class="order-view-section">

//         <div class="order-section-title">

//           <i class="fa-solid fa-boxes-stacked"></i>

//           Items

//         </div>



//         <div class="order-items-scroll">

//           ${itemsHTML}

//         </div>

//       </section>



//       <div class="order-bottom-grid">



//         <section class="order-view-section">

//           <div class="order-section-title">

//             <i class="fa-solid fa-percent"></i>

//             Category Discounts

//           </div>



//           ${categoryDiscountsHTML}

//         </section>



//         <section class="order-view-section">

//           <div class="order-section-title">

//             <i class="fa-solid fa-indian-rupee-sign"></i>

//             Billing

//           </div>



//           ${billingHTML}

//         </section>



//       </div>



//     </div>

//   `;



//   const modal = document.getElementById("modal");



//   if (modal) {

//     modal.style.display = "flex";

//     document.body.style.overflow = "hidden";

//   }

// };


/* =========================================================
   PREMIUM VIEW ORDER MODAL
   Replace your OLD viewOrder() with this function
========================================================= */

function viewOrder(id) {

    const o =
        allOrdersMaster.find(x => x.id === id) ||
        filteredOrders.find(x => x.id === id) ||
        currentRenderedOrders.find(x => x.id === id);

    if (!o) {
        alert("Order not found.");
        return;
    }

    const modal = document.getElementById("modal");
    const div = document.getElementById("modalContent");

    if (!modal || !div) return;


    /* =====================================================
       HELPERS
    ===================================================== */

    const safe = (value, fallback = "-") => {
        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {
            return fallback;
        }

        return value;
    };


    const money = (value) => {

        const num = Number(value);

        if (!Number.isFinite(num)) {
            return "₹0.00";
        }

        return "₹" + num.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };


    const escapeHTML = (value) => {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };


    const formatModalDate = (value) => {

        if (!value) return "-";

        try {

            if (typeof formatDate === "function") {
                return formatDate(value);
            }

        } catch (e) {}

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) {
            return String(value);
        }

        return d.toLocaleDateString("en-GB");
    };


    /* =====================================================
       BASIC ORDER DATA
    ===================================================== */

    const party =
        o.party ||
        o.customer ||
        {};


    const partyName =
        party.name ||
        o.partyName ||
        o.customerName ||
        "-";


    const mobile =
        party.mobile ||
        party.phone ||
        o.mobile ||
        o.phone ||
        "-";


    const city =
        party.city ||
        o.city ||
        "-";


    const state =
        party.state ||
        o.state ||
        "";


    const pincode =
        party.pincode ||
        o.pincode ||
        "";


    const gstNo =
        party.gst ||
        party.gstNo ||
        party.gstin ||
        o.gst ||
        o.gstNo ||
        o.gstin ||
        "-";


    const address =
        party.address ||
        o.address ||
        o.partyAddress ||
        "-";


    const distributor =
        party.distributor ||
        o.distributor ||
        o.distributorName ||
        "-";


    const partyType =
        party.type ||
        o.partyType ||
        o.customerType ||
        o.type ||
        "-";


    const orderNo =
        o.orderNo ||
        o.orderNumber ||
        "-";


    const orderDate =
        o.orderDate ||
        o.date ||
        o.createdAt ||
        "";


    const salesman =
        o.salesman ||
        o.salesmanName ||
        o.executiveName ||
        o.createdByName ||
        "-";


    const status =
        o.status ||
        o.orderStatus ||
        "Pending";


    const remarks =
        o.remarks ||
        o.remark ||
        o.notes ||
        o.cancelRemark ||
        "-";


    /* =====================================================
       ITEMS
    ===================================================== */

    const items =
        o.cartItems ||
        o.items ||
        o.orderItems ||
        [];


    /* =====================================================
       DISCOUNTS
    ===================================================== */

    const hardwareDiscount = Number(
        o.hardwareDiscount ??
        o.hardwareDiscountPercent ??
        o.categoryDiscounts?.hardware ??
        0
    ) || 0;


    const bathroomDiscount = Number(
        o.bathroomDiscount ??
        o.bathroomDiscountPercent ??
        o.categoryDiscounts?.bathroom ??
        0
    ) || 0;


    const ssDiscount = Number(
        o.ssDiscount ??
        o.ssDiscountPercent ??
        o.categoryDiscounts?.ss ??
        o.categoryDiscounts?.stainlessSteel ??
        0
    ) || 0;


    /* =====================================================
       BILLING
    ===================================================== */

    let calculatedTotal = 0;

    items.forEach(item => {

        const qty =
            Number(item.qty ?? item.quantity ?? 0) || 0;

        const rate =
            Number(
                item.afterDiscountRate ??
                item.finalRate ??
                item.rate ??
                item.price ??
                0
            ) || 0;

        const total =
            Number(
                item.afterDiscountTotal ??
                item.finalAmount ??
                item.amount ??
                item.total ??
                (qty * rate)
            ) || 0;

        calculatedTotal += total;
    });


    let totals = {};

    try {

        if (typeof calculateOrderDisplayTotals === "function") {
            totals = calculateOrderDisplayTotals(o) || {};
        }

    } catch (error) {
        console.warn("Could not calculate display totals:", error);
    }


    const taxableAmount =
        Number(
            totals.taxable ??
            totals.taxableAmount ??
            o.taxableAmount ??
            o.subtotal ??
            calculatedTotal
        ) || 0;


    const freight =
        Number(
            totals.freight ??
            o.freight ??
            o.freightCharges ??
            0
        ) || 0;


    const specialDiscount =
        Number(
            totals.specialDiscount ??
            o.specialDiscount ??
            o.extraDiscount ??
            0
        ) || 0;


    const gstAmount =
        Number(
            totals.gst ??
            totals.gstAmount ??
            o.gstAmount ??
            o.gst ??
            0
        ) || 0;


    const grandTotal =
        Number(
            totals.grandTotal ??
            totals.grandInclGST ??
            o.grandTotal ??
            o.totalAmount ??
            (
                taxableAmount +
                freight -
                specialDiscount +
                gstAmount
            )
        ) || 0;


    const beforeDiscount =
        Number(
            o.beforeDiscountTotal ??
            o.totalBeforeDiscount ??
            o.grossAmount ??
            grandTotal
        ) || 0;


    const categoryDiscountAmount =
        Number(
            o.categoryDiscountAmount ??
            o.totalCategoryDiscount ??
            0
        ) || 0;


    /* =====================================================
       BILL IMAGE
    ===================================================== */

    const billImage =
        o.billImage ||
        o.billUrl ||
        o.billImageUrl ||
        o.invoiceImage ||
        "";


    /* =====================================================
       ITEMS HTML
    ===================================================== */

    let itemsRows = "";

    let itemsGrandTotal = 0;


    if (!items.length) {

        itemsRows = `
            <tr>
                <td colspan="7"
                    style="
                        text-align:center;
                        padding:30px;
                        color:#64748b;
                    ">
                    No items available
                </td>
            </tr>
        `;

    } else {

        items.forEach((item, index) => {

            const qty =
                Number(
                    item.qty ??
                    item.quantity ??
                    0
                ) || 0;


            const originalRate =
                Number(
                    item.rate ??
                    item.price ??
                    0
                ) || 0;


            const afterDiscountRate =
                Number(
                    item.afterDiscountRate ??
                    item.finalRate ??
                    item.discountedRate ??
                    originalRate
                ) || 0;


            const total =
                Number(
                    item.afterDiscountTotal ??
                    item.finalAmount ??
                    item.amount ??
                    item.total ??
                    (qty * afterDiscountRate)
                ) || 0;


            itemsGrandTotal += total;


            const code =
                item.code ||
                item.itemCode ||
                item.sku ||
                "-";


            const name =
                item.name ||
                item.itemName ||
                item.productName ||
                item.title ||
                "-";


            const unit =
                item.unit ||
                "-";


            itemsRows += `

                <tr>

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        ${escapeHTML(code)}
                    </td>

                    <td>
                        ${escapeHTML(name)}
                    </td>

                    <td>
                        ${escapeHTML(unit)}
                    </td>

                    <td>
                        ${qty}
                    </td>

                    <td>
                        ${money(originalRate)}
                    </td>

                    <td>
                        <strong>
                            ${money(total)}
                        </strong>
                    </td>

                </tr>

            `;

        });

    }


    /* =====================================================
       STATUS LOGIC
    ===================================================== */

    const normalizedStatus =
        String(status)
            .trim()
            .toLowerCase();


    const statusRank = (() => {

        if (
            normalizedStatus.includes("deliver")
        ) return 5;

        if (
            normalizedStatus.includes("dispatch")
        ) return 4;

        if (
            normalizedStatus.includes("pack")
        ) return 3;

        if (
            normalizedStatus.includes("confirm") ||
            normalizedStatus.includes("payment")
        ) return 2;

        return 1;

    })();


    const timelineStep = (
        rank,
        icon,
        label,
        dateText = ""
    ) => {

        const active =
            statusRank >= rank
                ? "active"
                : "";

        return `

            <div class="timeline-step ${active}">

                <div class="timeline-icon">
                    <i class="${icon}"></i>
                </div>

                <span class="timeline-label">
                    ${label}
                </span>

                ${
                    dateText
                        ? `
                            <span class="timeline-date">
                                ${dateText}
                            </span>
                        `
                        : ""
                }

            </div>

        `;

    };


    /* =====================================================
       PARTY ADDRESS
    ===================================================== */

    const fullAddress = [
        address !== "-" ? address : "",
        city !== "-" ? city : "",
        state,
        pincode
    ]
        .filter(Boolean)
        .join(", ");


    /* =====================================================
       WHATSAPP
    ===================================================== */

    const mobileDigits =
        String(mobile)
            .replace(/\D/g, "");


    const whatsappNumber =
        mobileDigits.length === 10
            ? `91${mobileDigits}`
            : mobileDigits;


    /* =====================================================
       MODAL HTML
    ===================================================== */

    div.innerHTML = `

    <div class="order-view-shell">


        <!-- ===============================================
             HEADER
        ================================================ -->

        <div class="order-view-topbar">

            <div class="order-view-heading">

                <div class="order-view-heading-icon">
                    <i class="fa-regular fa-file-lines"></i>
                </div>

                <div>

                    <h2 class="order-view-kicker">
                        Order Details
                    </h2>

                    <p class="order-view-subtitle">
                        Complete information for this order including
                        party, items, billing and status details.
                    </p>

                </div>

            </div>


            <div class="order-view-actions">

                <button
                    type="button"
                    class="order-download-btn"
                    onclick="downloadOrder('${escapeHTML(o.id)}')"
                >

                    <i class="fa-solid fa-download"></i>

                    Download Order

                </button> 


                <button
                    type="button"
                    class="order-close-btn"
                    onclick="closeModal()"
                    aria-label="Close"
                >

                    <i class="fa-solid fa-xmark"></i>

                </button>

            </div>

        </div>



        <!-- ===============================================
             ORDER HERO
        ================================================ -->

        <div class="order-hero-row">

            <div class="order-number-wrap">

                <h2 class="order-number">

                    <span style="color:#108082">
                        #
                    </span>

                    ${escapeHTML(orderNo)}

                </h2>


                <span class="order-status-badge">
                    ${escapeHTML(status)}
                </span>


                <span class="order-type-badge">
                    ${escapeHTML(partyType)}
                </span>

            </div>


            <div class="order-date-box">

                <i class="fa-regular fa-calendar-days"></i>

                <div>

                    <span>
                        Order Date
                    </span>

                    <strong>
                        ${formatModalDate(orderDate)}
                    </strong>

                </div>

            </div>

        </div>



        <!-- ===============================================
             TOP 3 CARDS
        ================================================ -->

        <div class="order-main-grid">


            <!-- PARTY DETAILS -->

            <section class="order-detail-card">

                <div class="detail-card-title">

                    <i class="fa-solid fa-building-user"></i>

                    Party Details


                    ${
                        typeof editOrder === "function"
                            ? `
                                <button
                                    type="button"
                                    class="party-edit-btn"
                                    onclick="closeModal(); editOrder('${escapeHTML(o.id)}')"
                                >

                                    <i class="fa-solid fa-pen"></i>

                                    Edit

                                </button>
                            `
                            : ""
                    }

                </div>


                <div class="detail-list">


                    <div class="detail-row">

                        <span>
                            Party Name
                        </span>

                        <strong>
                            ${escapeHTML(partyName)}
                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Mobile No.
                        </span>

                        <strong>

                            ${escapeHTML(mobile)}

                            ${
                                whatsappNumber
                                    ? `
                                        <a
                                            href="https://wa.me/${whatsappNumber}"
                                            target="_blank"
                                            rel="noopener"
                                            style="
                                                color:#108082;
                                                margin-left:8px;
                                                text-decoration:none;
                                            "
                                        >
                                            <i class="fa-brands fa-whatsapp"></i>
                                        </a>
                                    `
                                    : ""
                            }

                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            City
                        </span>

                        <strong>
                            ${escapeHTML(city)}
                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            GST No.
                        </span>

                        <strong>
                            ${escapeHTML(gstNo)}
                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Party Type
                        </span>

                        <strong>

                            <span class="order-type-badge">
                                ${escapeHTML(partyType)}
                            </span>

                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Distributor
                        </span>

                        <strong>
                            ${escapeHTML(distributor)}
                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Address
                        </span>

                        <strong>
                            ${escapeHTML(fullAddress || "-")}
                        </strong>

                    </div>


                </div>

            </section>



            <!-- ORDER DETAILS -->

            <section class="order-detail-card">

                <div class="detail-card-title">

                    <i class="fa-regular fa-file-lines"></i>

                    Order Details

                </div>


                <div class="detail-list">


                    <div class="detail-row">

                        <span>
                            Order No.
                        </span>

                        <strong>
                            ${escapeHTML(orderNo)}
                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Order Date
                        </span>

                        <strong>
                            ${formatModalDate(orderDate)}
                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Salesman
                        </span>

                        <strong>
                            ${escapeHTML(salesman)}
                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Type
                        </span>

                        <strong>

                            <span class="order-type-badge">
                                ${escapeHTML(partyType)}
                            </span>

                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Status
                        </span>

                        <strong>

                            <span class="order-status-badge">
                                ${escapeHTML(status)}
                            </span>

                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Grand Total
                        </span>

                        <strong class="detail-money">
                            ${money(grandTotal)}
                        </strong>

                    </div>


                    <div class="detail-row">

                        <span>
                            Remarks
                        </span>

                        <strong>
                            ${escapeHTML(remarks)}
                        </strong>

                    </div>


                </div>

            </section>



            <!-- BILLING -->

            <section class="order-billing-card">

                <div class="detail-card-title">

                    <i class="fa-solid fa-indian-rupee-sign"></i>

                    Billing & Charges

                </div>


                <div class="billing-list">


                    <div class="billing-row">

                        <span>
                            Total Amount (Before Discount)
                        </span>

                        <strong>
                            ${money(beforeDiscount)}
                        </strong>

                    </div>


                    <div class="billing-row">

                        <span>
                            Category Discount
                        </span>

                        <strong>
                            ${money(categoryDiscountAmount)}
                        </strong>

                    </div>


                    <div class="billing-row">

                        <span>
                            Taxable Amount
                        </span>

                        <strong>
                            ${money(taxableAmount)}
                        </strong>

                    </div>


                    <div class="billing-row">

                        <span>
                            Freight Charges
                        </span>

                        <strong>
                            ${money(freight)}
                        </strong>

                    </div>


                    <div class="billing-row">

                        <span>
                            Special Discount
                        </span>

                        <strong>
                            ${money(specialDiscount)}
                        </strong>

                    </div>


                    <div class="billing-row">

                        <span>
                            GST (18%)
                        </span>

                        <strong>
                            ${money(gstAmount)}
                        </strong>

                    </div>


                    <div class="billing-grand-total">

                        <span>
                            Grand Total
                        </span>

                        <strong>
                            ${money(grandTotal)}
                        </strong>

                    </div>


                </div>

            </section>


        </div>



        <!-- ===============================================
             ITEMS + DISCOUNTS
        ================================================ -->

        <div class="order-items-discount-grid">


            <!-- ITEMS -->

            <section class="order-items-card">

                <div class="order-section-title">

                    <i class="fa-solid fa-cube"></i>

                    Items (${items.length})

                </div>


                <div class="order-items-scroll">

                    <table class="modal-items-table">

                        <thead>

                            <tr>

                                <th>#</th>

                                <th>Item Code</th>

                                <th>Item Name</th>

                                <th>Unit</th>

                                <th>Qty</th>

                                <th>Rate (₹)</th>

                                <th>Total (₹)</th>

                            </tr>

                        </thead>


                        <tbody>

                            ${itemsRows}

                        </tbody>


                        <tfoot>

                            <tr class="items-total-row">

                                <td
                                    colspan="6"
                                    style="text-align:right"
                                >
                                    Total
                                </td>

                                <td>
                                    <strong>
                                        ${money(itemsGrandTotal)}
                                    </strong>
                                </td>

                            </tr>

                        </tfoot>

                    </table>

                </div>

            </section>



            <!-- DISCOUNTS -->

            <section class="order-discount-card">

                <div class="order-section-title">

                    <i class="fa-solid fa-percent"></i>

                    Discounts

                </div>


                <div class="discount-list">


                    <div class="discount-row">

                        <span>
                            Hardware Discount
                        </span>

                        <strong>
                            ${hardwareDiscount}%
                        </strong>

                    </div>


                    <div class="discount-row">

                        <span>
                            Bathroom Discount
                        </span>

                        <strong>
                            ${bathroomDiscount}%
                        </strong>

                    </div>


                    <div class="discount-row">

                        <span>
                            SS Discount
                        </span>

                        <strong>
                            ${ssDiscount}%
                        </strong>

                    </div>


                </div>

            </section>


        </div>



        <!-- ===============================================
             BOTTOM SECTION
        ================================================ -->

        <div class="order-bottom-info-grid">


            <!-- BILL IMAGE -->

            <section class="order-bottom-card">

                <div class="order-section-title">

                    <i class="fa-regular fa-image"></i>

                    Bill Image

                </div>


                <div class="bill-image-content">


                    ${
                        billImage
                            ? `

                                <img
                                    src="${escapeHTML(billImage)}"
                                    class="bill-image-preview"
                                    alt="Bill"
                                    onerror="
                                        this.style.display='none'
                                    "
                                >

                            `
                            : `

                                <div
                                    class="bill-image-preview"
                                    style="
                                        display:flex;
                                        align-items:center;
                                        justify-content:center;
                                        color:#94a3b8;
                                        font-size:28px;
                                    "
                                >

                                    <i class="fa-regular fa-image"></i>

                                </div>

                            `
                    }


                    <div class="bill-image-info">


                        <div class="bill-image-status">

                            <i class="fa-regular fa-file"></i>

                            ${
                                billImage
                                    ? "Bill Uploaded"
                                    : "Not Uploaded"
                            }

                        </div>


                        ${
                            billImage
                                ? `

                                    <button
                                        type="button"
                                        class="bill-view-btn"
                                        onclick="openBillImage('${escapeHTML(billImage)}')"
                                    >

                                        <i class="fa-solid fa-eye"></i>

                                        View Bill

                                    </button>

                                `
                                : `

                                    <span
                                        style="
                                            display:block;
                                            font-size:12px;
                                            color:#94a3b8;
                                        "
                                    >
                                        No bill image available
                                    </span>

                                `
                        }


                    </div>

                </div>

            </section>



            <!-- TIMELINE -->

            <section class="order-bottom-card timeline-card">

                <div class="order-section-title">

                    <i class="fa-solid fa-clock-rotate-left"></i>

                    Status & Timeline

                </div>


                <div class="timeline-scroll">

                    <div class="order-timeline">


                        ${timelineStep(
                            1,
                            "fa-solid fa-pen-to-square",
                            "Order Created",
                            formatModalDate(orderDate)
                        )}


                        ${timelineStep(
                            2,
                            "fa-solid fa-check",
                            "Confirmed"
                        )}


                        ${timelineStep(
                            3,
                            "fa-solid fa-box",
                            "Packing"
                        )}


                        ${timelineStep(
                            4,
                            "fa-solid fa-truck",
                            "Dispatched"
                        )}


                        ${timelineStep(
                            5,
                            "fa-solid fa-circle-check",
                            "Delivered"
                        )}


                    </div>

                </div>

            </section>



            <!-- NOTES -->

            <section class="order-bottom-card">

                <div class="order-section-title">

                    <i class="fa-regular fa-file-lines"></i>

                    Notes / Remarks

                </div>


                <div class="order-notes-box">

                    ${
                        remarks !== "-"
                            ? escapeHTML(remarks)
                            : "No additional remarks available."
                    }

                </div>

            </section>


        </div>


    </div>

    `;


    /* =====================================================
       OPEN MODAL
    ===================================================== */

    modal.style.display = "flex";

    document.body.style.overflow = "hidden";

}
function printOrderDetails(id) {

    const o =
        allOrdersMaster.find(x => x.id === id) ||
        filteredOrders.find(x => x.id === id) ||
        currentRenderedOrders.find(x => x.id === id);

    if (!o) {
        alert("Order not found.");
        return;
    }


    /*
     * Sales dashboard wala PetroPDF available hai
     * to SAME approved PDF/Print design use hoga.
     */

    if (
        window.PetroPDF &&
        typeof window.PetroPDF.preview === "function"
    ) {

        try {

            window.PetroPDF.preview(o, {

                logoUrl:
                    new URL(
                        "images/logo.webp",
                        window.location.href
                    ).href,

                autoPrint: true

            });

            return;

        } catch (error) {

            console.error(
                "PETRO PDF print error:",
                error
            );

        }

    }


    /*
     * Fallback:
     * PetroPDF available nahi hai to browser print.
     */

    window.print();

}
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

    updateFirestorePaginationButtons();

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



window.downloadOrder = function (orderId = currentViewedOrderId) {
    const order = allOrdersMaster.find((item) => String(item.id) === String(orderId)) || currentRenderedOrders.find((item) => String(item.id) === String(orderId));
    if (!order) {
      alert("Order not found");
      return;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const rows = items.length
      ? items
        .map((item, index) => {
          const qty = numberValue(item.qty ?? item.quantity ?? 0);
          const rate = numberValue(item.rate ?? item.price ?? 0);
          const amount = parseAmountLikeDashboard(item.amount ?? item.total ?? (qty * rate));

          return `
              <tr>
                <td class="center">${index + 1}</td>
                <td>${escapeHTML(item.code || "-")}</td>
                <td class="item-name">${escapeHTML(item.itemName || item.name || item.productName || item.title || "-")}</td>
                <td class="center">${escapeHTML(item.unit || "-")}</td>
                <td class="num">${qty}</td>
                <td class="num">${formatMoney(rate)}</td>
                <td class="num">${formatMoney(amount)}</td>
              </tr>
            `;
        })
        .join("")
      : '<tr><td colspan="7" class="center empty">No items</td></tr>';


    const pdfTotals = calculateOrderDisplayTotals(order);
    const pdfSubtotal = pdfTotals.taxableAmount;

    const logoUrl = new URL("/images/logo.webp", window.location.href).href;
    const popup = window.open("", "_blank", "width=1100,height=850");

    if (!popup) {
      alert("Please allow pop-ups to download the order PDF.");
      return;
    }

    const fileName = `${String(order.orderNo || "Petro-Quotation").replace(/[^a-zA-Z0-9_-]/g, "_")}-PETRO-OMS.pdf`;
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
          @page{size:A4;margin:11mm}*{box-sizing:border-box}body{

margin:0;

color:#20252a;

font:12px Arial,sans-serif;

background:#fff;

padding:5px;

}.sheet{width:100%;max-width:800px;margin:auto;background:#fff;border:1px solid #1b7f82;position:relative;overflow:hidden}.sheet>*:not(.watermark){position:relative;z-index:1}.watermark{position:absolute;z-index:0;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-35deg);color:#108082;opacity:.055;font-size:74px;font-weight:800;letter-spacing:9px;white-space:nowrap;pointer-events:none}.header{display:flex;justify-content:space-between;align-items:center;padding:15px 18px;border-bottom:3px solid #108082}.logo{max-width:190px;max-height:58px}.company{text-align:right;line-height:1.5}.company strong{color:#108082;font-size:18px}.title{background:#108082;color:white;text-align:center;font-size:18px;font-weight:700;letter-spacing:1px;padding:9px}.meta{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #9aa}.box{padding:12px 15px;min-height:105px}.box+.box{border-left:1px solid #9aa}.box h3{color:#108082;font-size:13px;margin:0 0 8px;text-transform:uppercase}.line{margin:4px 0}.label{display:inline-block;width:82px;font-weight:700}table{width:100%;border-collapse:collapse}th{background:#e7f3f3;color:#075e61;font-weight:700}th,td{border:1px solid #aeb8b8;padding:7px 6px}.center{text-align:center}.num{text-align:right;white-space:nowrap}.item-name{text-align:left;font-weight:600}.empty{padding:24px;color:#777}.discount-summary-wrap{display:grid;grid-template-columns:57% 43%;width:100%;border-bottom:1px solid #9aa}.discount-breakup{min-height:100%;border-right:1px solid #9aa}.discount-title{background:#e7f3f3;color:#075e61;font-size:12px;font-weight:700;padding:8px 12px;border-bottom:1px solid #aeb8b8}.discount-breakup>div:not(.discount-title){display:flex;align-items:center;justify-content:space-between;gap:15px;padding:7px 12px;border-bottom:1px solid #ccd3d3}.discount-breakup>div:last-child{border-bottom:none}.discount-breakup b{color:#075e61;white-space:nowrap}.summary{width:100%}.summary div{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:7px 12px;border-bottom:1px solid #ccd3d3}.summary b,.summary span:last-child{white-space:nowrap}.summary .grand{background:#108082;color:#fff;font-size:15px;font-weight:700}.notes{min-height:75px;padding:12px 15px;border-top:1px solid #9aa}.footer{display:flex;justify-content:space-between;align-items:end;min-height:85px;padding:12px 15px;border-top:1px solid #9aa}.sign{text-align:center;width:210px;padding-top:40px;border-bottom:1px solid #333}.website-footer{text-align:center;padding:8px;color:#075e61;font-weight:700;border-top:1px solid #ccd3d3}.toolbar{position:sticky;top:10px;z-index:20;max-width:800px;margin:0 auto 12px;display:flex;gap:10px;justify-content:flex-end}.toolbar button{border:0;border-radius:24px;padding:11px 16px;font-weight:700;color:#fff;cursor:pointer;box-shadow:0 5px 18px #0003}.download-btn{background:#108082}.share-btn{background:#25d366}.print-btn{background:#334155}.toolbar button:disabled{opacity:.65;cursor:wait}@media print{body{padding:0;background:#fff}.toolbar{display:none}.sheet{max-width:none;border:1px solid #1b7f82}}@media(max-width:700px){.meta,.discount-summary-wrap{grid-template-columns:1fr}.box+.box,.discount-breakup{border-left:0;border-right:0;border-top:1px solid #9aa}.header{align-items:flex-start;gap:10px}.company{font-size:10px}.company strong{font-size:14px}}
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
              <div class="line"><span class="label">City:</span>${escapeHTML(getPartyCity(order))}</div>              <div class="line"><span class="label">GST:</span>${escapeHTML(order.party?.gst)}</div>
            </div>

            <div class="box">
              <h3>Order Details</h3>
              <div class="line"><span class="label">Order No:</span>${escapeHTML(order.orderNo)}</div>
              <div class="line"><span class="label">Date:</span>${escapeHTML(order.orderDate)}</div>
              <div class="line"><span class="label">Status:</span>${escapeHTML(getOrderStatus(order))}</div>
              <div class="line"><span class="label">Salesman:</span>${escapeHTML(order.salesman || "-")}</div>
              <div class="line"><span class="label">Party Type:</span>${escapeHTML(getPartyType(order))}</div>
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
              <div><span>Special Discount</span><b>Rs. ${formatMoney(pdfTotals.specialDiscount)}</b></div>
            </div>

            <div class="summary">
              <div><span>Subtotal</span><b>Rs. ${formatMoney(pdfSubtotal)}</b></div>
              <div><span>Freight</span><b>Rs. ${formatMoney(pdfTotals.freight)}</b></div>
              <div><span>Special Discount</span><b>Rs. ${formatMoney(pdfTotals.specialDiscount)}</b></div>
              <div><span>GST</span><b>Rs. ${formatMoney(pdfTotals.gstAmount)}</b></div>
              <div class="grand"><span>Grand Total</span><span>Rs. ${formatMoney(pdfTotals.grandTotalInclGst)}</span></div>
            </div>
          </div>

          <div class="notes"><b>Terms & Conditions</b><br>1. Goods once sold will not be taken back.<br>2. Subject to company terms and applicable jurisdiction.</div>
          <div class="footer"><div>This is a computer-generated document.</div><div class="sign">Authorised Signatory</div></div>
          <div class="website-footer">Generated from Petro OMS | www.petroindustech.com</div>
        </div>

        <script>
          const fileName = ${fileNameJS};
          const shareTitle = ${shareTitleJS};
          const shareText = ${shareTextJS};

          async function createPdfBlob() {

    if (typeof html2pdf === "undefined") {
        throw new Error("PDF library could not load");
    }

    const element = document.getElementById("quotationSheet");

    if (!element) {
        throw new Error("Quotation content not found");
    }


    const options = {

        filename: fileName,

        margin: [
            8,
            8,
            8,
            8
        ],

        image: {
            type: "jpeg",
            quality: 0.98
        },


        html2canvas: {

            scale: 3,

            useCORS: true,

            allowTaint: true,

            backgroundColor: "#ffffff",

            scrollY: 0

        },


        jsPDF: {

            unit: "mm",

            format: "a4",

            orientation: "portrait"

        },


        pagebreak: {

            mode:[
                "avoid-all",
                "css",
                "legacy"
            ]

        }

    };


    return await html2pdf()
        .set(options)
        .from(element)
        .outputPdf("blob");

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

    key: "city",

    label: "City",

    get: (order) => getPartyCity(order),

  },

  {

    key: "distributor",

    label: "Distributor",

    get: (order) => getDistributor(order),

  },

  {

    key: "address",

    label: "Address",

    get: (order) => getPartyAddress(order),

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

  fetchFirstOrdersPage();

});