/* ============================================================
   FIREBASE INITIALIZATION (Firebase v8)
============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyCdfQu5GCsBCyMHM7HX8GRzY-VTZaEMU5M",
  authDomain: "petro-oms.firebaseapp.com",
  projectId: "petro-oms",
  storageBucket: "petro-oms.firebasestorage.app",
  messagingSenderId: "562472760628",
  appId: "1:562472760628:web:384f4eda2c862b6e3ce161",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ============================================================
   FIRESTORE CACHE
============================================================ */
db.enablePersistence().catch((err) => {
  console.warn("Firestore persistence not enabled:", err.code);
});

/* ============================================================
   GLOBAL VARIABLES
============================================================ */
let allOrdersMaster = [];
let currentRenderedOrders = [];
let deleteOrderId = null;
let deleteOrderSource = "orders";

const PAGE_SIZE = 10;

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

const ADMIN_DELETE_PASSWORD = "2003";

/* ============================================================
   PAGINATION STATE
============================================================ */
let currentPage = 1;
let filteredOrders = [];

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
  "Mahesh Kumar"
];

function populateSalesmanMasterList() {
  const filter = document.getElementById("salesmanFilter");
  if (!filter) return;
  const selectedValue = filter.value;
  filter.innerHTML = `<option value="">All Salesman</option>`;
  ALL_SALESMEN.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    filter.appendChild(option);
  });
  filter.value = selectedValue;
}

populateSalesmanMasterList();

/* ============================================================
   FETCH ALL ORDERS — SIRF EK BAAR
============================================================ */
function fetchAllOrders() {
  showLoadingState();

  db.collection("orders")
    .orderBy("savedAt", "desc")
    .get({ source: "default" })
    .then((snapshot) => {
      allOrdersMaster = snapshot.docs.map((doc) => ({
        id: doc.id,
        source: "orders",
        ...doc.data(),
      }));

      applyFiltersAndRender();
    })
    .catch((err) => {
      console.error("Orders fetch error:", err);
      hideLoadingState();
    });
}

fetchAllOrders();

/* ============================================================
   LOADING STATE
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
  if (emptyState) emptyState.style.display = "none";
}

function hideLoadingState() {
  if (ordersBody) ordersBody.innerHTML = "";
}

/* ============================================================
   NORMALIZE — case insensitive comparison ke liye
============================================================ */
function normalize(val) {
  return String(val || "").trim().toLowerCase();
}

/* ============================================================
   APPLY ALL FILTERS — PURE CLIENT SIDE
   FIX: Saare comparisons case-insensitive hain ab
============================================================ */
function applyFiltersAndRender() {

  const searchText = normalize(searchBox?.value);
  const selectedSalesman = normalize(salesmanFilterEl?.value);
  const selectedType = normalize(typeFilter?.value);
  const selectedStatus = normalize(statusFilter?.value);
  const fromDate = dateFrom?.value || "";
  const toDate = dateTo?.value || "";

  filteredOrders = allOrdersMaster.filter(o => {

    // ================= SEARCH =================
    if (searchText) {
      const orderNo = normalize(o.orderNo);
      const partyName = normalize(o.party?.name);

      if (!orderNo.includes(searchText) && !partyName.includes(searchText)) {
        return false;
      }
    }

    // ================= SALESMAN =================
    if (selectedSalesman) {
      const dbSalesman = normalize(o.salesman);

      if (dbSalesman !== selectedSalesman) {
        return false;
      }
    }

    // ================= TYPE =================
    if (selectedType) {
      const dbType = normalize(o.party?.type);

      if (dbType !== selectedType) {
        return false;
      }
    }

    // ================= STATUS =================
    if (selectedStatus) {
      const dbStatus = normalize(o.status);

      if (dbStatus !== selectedStatus) {
        return false;
      }
    }

    // ================= DATE FROM =================
    if (fromDate) {
      const orderDate = o.orderDate ? o.orderDate.substring(0, 10) : "";

      if (!orderDate || orderDate < fromDate) {
        return false;
      }
    }

    // ================= DATE TO =================
    if (toDate) {
      const orderDate = o.orderDate ? o.orderDate.substring(0, 10) : "";

      if (!orderDate || orderDate > toDate) {
        return false;
      }
    }

    return true;
  });

  currentPage = 1;
  renderCurrentPage();
  updatePaginationUI();
}

/* ============================================================
   RENDER CURRENT PAGE
============================================================ */
function renderCurrentPage() {

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageData = filteredOrders.slice(start, end);

  currentRenderedOrders = pageData;

  if (!filteredOrders.length) {
    if (emptyState) emptyState.style.display = "block";
    if (ordersBody) ordersBody.innerHTML = "";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  ordersBody.innerHTML = pageData.map((o, index) => {

    const partyType = o.party?.type || "Secondary";
    const statusText = o.status || "Pending"; 
    const total = parseFloat(o.grandTotal);
    const safeTotal = isNaN(total) ? 0 : total;
    const billImage = o.billImage || null;

    const viewImageButton = billImage
      ? `<a href="${billImage}" target="_blank" class="btn btn-info btn-sm">View Image</a>`
      : "Not Uploaded";

    return `
      <tr>
        <td><input type="checkbox" class="rowCheck" value="${o.id}"></td>
        <td>${start + index + 1}</td>
        <td>${o.salesman || "-"}</td>
        <td>${o.orderNo || "-"}</td>
        <td>${o.party?.name || "-"}</td>
        <td>
          <span class="badge ${partyType === "Primary" ? "badge-success" : "badge-warning"}">
            ${partyType}
          </span>
        </td>
        <td>₹${safeTotal.toFixed(2)}</td>
        <td>
          <span class="badge-status ${statusClass(statusText)}">
            ${statusText}
          </span>
        </td>
        <td>
          <button class="btn btn-warning btn-sm" onclick="editOrder('${o.id}', '${o.source || "orders"}')">
            ✏ Edit
          </button>
          <button class="btn btn-primary btn-sm" onclick="viewOrder('${o.id}')">
            <i class="fa fa-eye"></i> View Order
          </button>
          <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${o.id}', '${o.source || "orders"}')">
            <i class="fa fa-trash"></i> Delete
          </button>
        </td>
        <td>${viewImageButton}</td>
      </tr>
    `;
  }).join("");
}

/* ============================================================
   STATUS BADGE
============================================================ */
function statusClass(status) {
  if (!status) return "status-pending";

  switch (status.toLowerCase()) {
    case "pending":
      return "status-pending";
    case "quotation sent":
      return "status-info";
    case "payment received":
      return "status-payment";
    case "partial delivered":
      return "status-partial";
    case "delivered":
      return "status-delivered";
    case "hold":
      return "status-hold";
    case "cancelled":
      return "status-cancelled";
    default:
      return "status-pending";
  }
}

/* ============================================================
   PAGINATION UI
============================================================ */
function updatePaginationUI() {
  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE) || 1;

  if (pageIndicator) {
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  }

  if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
}

/* ============================================================
   PAGINATION BUTTONS
============================================================ */
function goToPrevPage() {
  if (currentPage <= 1) return;
  currentPage--;
  renderCurrentPage();
  updatePaginationUI();
  window.scrollTo(0, 0);
}

function goToNextPage() {
  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE) || 1;
  if (currentPage >= totalPages) return;
  currentPage++;
  renderCurrentPage();
  updatePaginationUI();
  window.scrollTo(0, 0);
}

if (prevPageBtn) prevPageBtn.addEventListener("click", goToPrevPage);
if (nextPageBtn) nextPageBtn.addEventListener("click", goToNextPage);

/* ============================================================
   FILTER EVENTS
============================================================ */
if (salesmanFilterEl) salesmanFilterEl.addEventListener("change", applyFiltersAndRender);
if (typeFilter) typeFilter.addEventListener("change", applyFiltersAndRender);
if (statusFilter) statusFilter.addEventListener("change", applyFiltersAndRender);
if (dateFrom) dateFrom.addEventListener("change", applyFiltersAndRender);
if (dateTo) dateTo.addEventListener("change", applyFiltersAndRender);

let searchDebounceTimer;
if (searchBox) {
  searchBox.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(applyFiltersAndRender, 400);
  });
}

/* ============================================================
   CLEAR ALL FILTERS
============================================================ */
window.clearAllFilters = function () {
  if (searchBox) searchBox.value = "";
  if (statusFilter) statusFilter.value = "";
  if (dateFrom) dateFrom.value = "";
  if (dateTo) dateTo.value = "";
  if (salesmanFilterEl) salesmanFilterEl.value = "";
  if (typeFilter) typeFilter.value = "";

  currentPage = 1;
  applyFiltersAndRender();
};

/* ============================================================
   VIEW ORDER
============================================================ */
function viewOrder(id) {

  const o =
    allOrdersMaster.find(x => x.id === id) ||
    currentRenderedOrders.find(x => x.id === id);

  if (!o) return;

  const div = document.getElementById("modalContent");
  const statusText = o.status || "Pending";
  const cancelReason = o.cancelRemark || "";

  let itemsHTML = `
    <table class="table table-bordered" style="width:100%;margin-bottom:15px;border-collapse:collapse;">
      <thead style="background-color:#f4f4f4;text-align:left;">
        <tr>
          <th>Item Code</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  (o.items || []).forEach(i => {
    itemsHTML += `
      <tr>
        <td>${i.code || "-"}</td>
        <td>${i.unit || "-"}</td>
        <td>${i.qty || 0}</td>
        <td>₹${i.rate || 0}</td>
        <td>₹${i.amount || 0}</td>
      </tr>
    `;
  });

  itemsHTML += `</tbody></table>`;

  const categoryDiscountsHTML = `
    <div style="font-weight:bold;margin-bottom:10px;">
      <div style="margin-bottom:8px;">
        <b>Hardware Discount:</b> ${o.categoryDiscounts?.hardware || 0}%
        ${o.categoryDiscountPercents?.hardware ? `(${o.categoryDiscountPercents.hardware})` : ""}
      </div>
      <div>
        <b>Bathroom Discount:</b> ${o.categoryDiscounts?.bathroom || 0}%
        ${o.categoryDiscountPercents?.bathroom ? `(${o.categoryDiscountPercents.bathroom})` : ""}
      </div>
      <div style="margin-top:8px;">
        <b>SS Discount:</b> ${o.categoryDiscounts?.stainlesssteel || 0}%
        ${o.categoryDiscountPercents?.stainlesssteel ? `(${o.categoryDiscountPercents.stainlesssteel})` : ""}
      </div>
    </div>
  `;

  const billingHTML = `
    <div style="margin-top:15px;">
      <p><b>Subtotal:</b> ₹${o.subTotal || 0}</p>
      <p><b>Freight:</b> ₹${o.freight || 0}</p>
      <p><b>Special Discount:</b> ₹${o.specialDiscount || 0}</p>
      <p><b>GST (${o.gstPercent || 0}%):</b> ₹${o.gstAmount || 0}</p>
      <h3><b>Grand Total:</b> ₹${o.grandTotal || 0}</h3>
    </div>
  `;

  const cancelReasonHTML = (statusText === "Cancelled" || statusText === "Hold") && cancelReason
    ? `
      <div style="background:#fff3f3;border:1px solid #f5c2c7;color:#842029;padding:12px 14px;border-radius:8px;margin-bottom:20px;">
        <div style="font-weight:700;margin-bottom:6px;">Status: ${statusText}</div>
        <div><b>${statusText === "Hold" ? "Hold Reason" : "Cancel Reason"}:</b> ${cancelReason}</div>
      </div>
    `
    : "";

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;position:sticky;top:0;background:#fff;z-index:100;padding:10px 0;">
      <div style="font-size:24px;font-weight:600;">Order Details #${o.orderNo || "-"}</div>
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
      <p><b>Name:</b> ${o.party?.name || "-"}</p>
      <p><b>Mobile:</b> ${o.party?.mobile || "-"}</p>
      <p><b>Address:</b> ${o.party?.address || "-"}</p>
      <p><b>GST:</b> ${o.party?.gst || "-"}</p>
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

  document.getElementById("modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

/* ============================================================
   EDIT ORDER
============================================================ */
window.editOrder = function (orderId, source) {
  window.location.href = `edit-order.html?id=${orderId}&source=${source}`;
};

/* ============================================================
   DELETE ORDER MODAL
============================================================ */
window.openDeleteModal = function (orderId, source = "orders") {
  deleteOrderId = orderId;
  deleteOrderSource = source;
  document.getElementById("deletePass").value = "";
  document.getElementById("deleteModal").style.display = "flex";
};

function closeDeleteModal() {
  document.getElementById("deleteModal").style.display = "none";
  document.getElementById("deleteMsg").style.display = "none";
}

/* ============================================================
   CONFIRM DELETE
============================================================ */
window.confirmDelete = async function () {

  const pass = document.getElementById("deletePass").value.trim();
  const msg = document.getElementById("deleteMsg");

  msg.style.display = "block";
  msg.textContent = "";
  msg.style.color = "";

  if (pass !== ADMIN_DELETE_PASSWORD) {
    msg.textContent = "❌ Incorrect Password";
    msg.style.color = "red";
    return;
  }

  const btns = document.querySelectorAll("#deleteModal button");
  btns.forEach(b => b.disabled = true);

  const deletedOrder = allOrdersMaster.find(o => o.id === deleteOrderId);
  const deletedOrderNo = deletedOrder?.orderNo || deleteOrderId;

  try {
    await db.collection(deleteOrderSource).doc(deleteOrderId).delete();

    allOrdersMaster = allOrdersMaster.filter(o => o.id !== deleteOrderId);

    applyFiltersAndRender();
    closeDeleteModal();
    btns.forEach(b => b.disabled = false);
    showToast(`✅ Order ${deletedOrderNo} Deleted Successfully`);

  } catch (err) {
    console.error(err);
    msg.textContent = "❌ Delete Failed. Try again.";
    msg.style.color = "red";
    btns.forEach(b => b.disabled = false);
  }
};

/* ============================================================
   TOAST MESSAGE
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
    setTimeout(() => { toast.style.display = "none"; }, 300);
  }, 2500);
}

/* ============================================================
   PASSWORD TOGGLE
============================================================ */
function togglePass() {
  const pass = document.getElementById("deletePass");
  const icon = document.querySelector(".toggle-eye");
  if (pass.style.webkitTextSecurity === "disc" || pass.style.webkitTextSecurity === "") {
    pass.style.webkitTextSecurity = "none";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  } else {
    pass.style.webkitTextSecurity = "disc";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  }
}

/* ============================================================
   CLOSE MODAL
============================================================ */
function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.body.style.overflow = "auto";
}

/* ============================================================
   DOWNLOAD ORDER PRINT
============================================================ */
function downloadOrder() {
  const content = document.getElementById("modalContent").innerHTML;
  const win = window.open("", "", "width=900,height=700");
  win.document.write(`
    <html>
      <head>
        <title>Order Download</title>
        <style>
          body { font-family:Arial; padding:20px; }
          table { width:100%; border-collapse:collapse; }
          table, th, td { border:1px solid #ccc; }
          th, td { padding:8px; text-align:left; }
          h3 { margin-top:20px; }
        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
  win.document.close();
  win.print();
}

/* ============================================================
   IMAGE MODAL
============================================================ */
function openImageModal(imageUrl) {
  const modal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const imageSkeleton = document.getElementById("imageSkeleton");

  imageSkeleton.style.display = "block";
  modalImage.style.display = "none";

  const img = new Image();
  img.onload = function () {
    modalImage.src = imageUrl;
    imageSkeleton.style.display = "none";
    modalImage.style.display = "block";
  };
  img.src = imageUrl;

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeImageModal() {
  document.getElementById("imageModal").style.display = "none";
}

/* ============================================================
   VIEW BILL IMAGE
============================================================ */
function viewImage(id) {
  const o = allOrdersMaster.find(x => x.id === id);
  if (!o || !o.billImage) return;

  const div = document.getElementById("modalContent");
  div.innerHTML = `
    <div style="font-size:24px;font-weight:600;margin-bottom:15px;">
      Bill Image for Order #${o.orderNo}
    </div>
    <img src="${o.billImage}" alt="Bill Image" style="max-width:100%;height:auto;border-radius:12px;">
    <button class="btn btn-secondary mt-3" onclick="closeModal()">Close</button>
  `;
  document.getElementById("modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

/* ============================================================
   EXPORT CSV
============================================================ */
const exportColumns = [
  { key: "salesman", label: "Salesman", get: o => o.salesman || "-" },
  { key: "orderNo", label: "Order No", get: o => o.orderNo || "-" },
  { key: "partyName", label: "Party Name", get: o => o.party?.name || "-" },
  { key: "partyType", label: "Party Type", get: o => o.party?.type || "-" },
  { key: "mobile", label: "Mobile", get: o => o.party?.mobile || "-" },
  { key: "gst", label: "GST", get: o => o.party?.gst || "-" },
  { key: "address", label: "Address", get: o => o.party?.address || "-" },
  { key: "total", label: "Total", get: o => o.grandTotal || 0 },
  { key: "status", label: "Status", get: o => o.status || "Pending" },
  { key: "date", label: "Order Date", get: o => o.orderDate || "-" },
  { key: "billAmount", label: "Bill Amount", get: o => o.billAmount ? `₹${Number(o.billAmount).toFixed(2)}` : "-" },
  { key: "source", label: "Source", get: o => o.source || "orders" },
  { key: "items", label: "Items", get: o => (o.items || []).map(i => `${i.code || "-"} (${i.qty || 0} ${i.unit || "-"})`).join(" | ") }
];

let selectedColumnKeys = exportColumns.map(c => c.key);

function openExportModal() {
  document.getElementById("exportModal").style.display = "flex";
  document.body.style.overflow = "hidden";
  renderExportColumns();
}

function closeExportModal() {
  document.getElementById("exportModal").style.display = "none";
  document.body.style.overflow = "auto";
}

function renderExportColumns() {
  const box = document.getElementById("exportColumnsList");
  const search = String(document.getElementById("columnSearch")?.value || "").toLowerCase();
  const filteredColumns = exportColumns.filter(c => c.label.toLowerCase().includes(search));

  box.innerHTML = filteredColumns.map(col => `
    <label style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #eee;cursor:pointer;">
      <input type="checkbox" class="exportColumnCheck" value="${col.key}"
        ${selectedColumnKeys.includes(col.key) ? "checked" : ""}
        onchange="updateSelectedColumns()">
      <span>${col.label}</span>
    </label>
  `).join("");

  updateColumnCount();
}

function updateSelectedColumns() {
  selectedColumnKeys = Array.from(
    document.querySelectorAll(".exportColumnCheck:checked")
  ).map(cb => cb.value);
  updateColumnCount();
}

function updateColumnCount() {
  const countBox = document.getElementById("selectedColumnCount");
  if (countBox) countBox.textContent = `${selectedColumnKeys.length} Selected`;
  const selectAll = document.getElementById("selectAllColumns");
  if (selectAll) selectAll.checked = selectedColumnKeys.length === exportColumns.length;
}

function toggleAllColumns(source) {
  selectedColumnKeys = source.checked ? exportColumns.map(c => c.key) : [];
  renderExportColumns();
}

function toggleAllRows(source) {
  document.querySelectorAll(".rowCheck").forEach(cb => { cb.checked = source.checked; });
}

function csvSafe(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCustomCSV() {
  updateSelectedColumns();

  if (!selectedColumnKeys.length) {
    alert("Please select at least one column.");
    return;
  }

  const selectedRowIds = Array.from(
    document.querySelectorAll(".rowCheck:checked")
  ).map(cb => cb.value);

  let exportRows = filteredOrders;
  if (selectedRowIds.length) {
    exportRows = filteredOrders.filter(o => selectedRowIds.includes(o.id));
  }

  if (!exportRows.length) {
    alert("No data found to download.");
    return;
  }

  const selectedColumns = exportColumns.filter(c => selectedColumnKeys.includes(c.key));

  let csv = selectedColumns.map(c => csvSafe(c.label)).join(",") + "\n";
  exportRows.forEach(order => {
    csv += selectedColumns.map(col => csvSafe(col.get(order))).join(",") + "\n";
  });

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `PETRO_Orders_Report_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();

  closeExportModal();
}

/* ============================================================
   DEBUG COMPATIBILITY
============================================================ */
window.goNextPage = function () { goToNextPage(); };
window.goPrevPage = function () { goToPrevPage(); };