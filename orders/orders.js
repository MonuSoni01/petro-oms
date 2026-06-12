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

// ✅ ENABLE OFFLINE CACHE — repeat visits / re-renders won't re-read from server
db.enablePersistence().catch((err) => {
  console.warn("Firestore persistence not enabled:", err.code);
});

/* ============================================================
   GLOBAL VARIABLES
============================================================ */
let orders = [];
let productOrders = [];
let deleteOrderId = null;
let deleteOrderSource = "orders";
let currentRenderedOrders = [];
let lastVisibleOrder = null;
let lastVisibleProduct = null;

const ordersBody = document.getElementById("ordersBody");
const emptyState = document.getElementById("emptyState");

const statusFilter = document.getElementById("filterStatus");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const searchBox = document.getElementById("searchBox");

const ADMIN_DELETE_PASSWORD = "2003";

/* ============================================================
   FETCH ORDERS (REDUCED PAGE SIZE — saves reads)
============================================================ */
// ✅ Reduced from 25 -> 10. Adjust as needed.
const PAGE_SIZE = 10;

db.collection("orders")
  .orderBy("savedAt", "desc")
  .limit(PAGE_SIZE)
  .get({ source: "default" })
  .then((snapshot) => {

    lastVisibleOrder =
      snapshot.docs[snapshot.docs.length - 1];

    orders = snapshot.docs.map((doc) => ({
      id: doc.id,
      source: "orders",
      ...doc.data(),
    }));

    pageCache[1] = orders;
    hasNextPage = snapshot.docs.length === PAGE_SIZE;
    updatePaginationUI();

    mergeOrdersAndRender();
  });


/* ============================================================
 RENDER ORDERS TABLE
============================================================ */
function renderOrders(list) {
  currentRenderedOrders = list;
  if (!list.length) {
    emptyState.style.display = "block";
    ordersBody.innerHTML = "";
    return;
  }

  emptyState.style.display = "none";

  const srNoOffset = isSearchMode ? 0 : (currentPage - 1) * PAGE_SIZE;

  ordersBody.innerHTML = list
    .map((o, index) => {
      const partyType = o.party?.type || "Secondary";
      const statusText = o.status || "Pending";
      const total = Number(o.grandTotal ?? 0);
      const billImage = o.billImage || null;

      const viewImageButton = billImage
        ? `<a href="${billImage}"
       target="_blank"
       class="btn btn-info btn-sm">
       View Image
     </a>`
        : "Not Uploaded";

      return `
      <tr>
  <td>
    <input type="checkbox" class="rowCheck" value="${o.id}">
  </td>
  <td>${srNoOffset + index + 1}</td>
          <td>${o.salesman || "-"}</td>
          <td>${o.orderNo || "-"}</td>
          <td>${o.party?.name || "-"}</td>

          <td>
            <span class="badge ${partyType === "Primary" ? "badge-success" : "badge-warning"}">
              ${partyType}
            </span>
          </td>

          <td>₹${total.toFixed(2)}</td>

          <td>
            <span class="badge-status ${statusClass(statusText)}">
              ${statusText}
            </span>
          </td>

          <td>
            <button class="btn btn-warning btn-sm" onclick="editOrder('${o.id}', '${o.source || "orders"}')">✏ Edit</button>
            <button class="btn btn-primary btn-sm" onclick="viewOrder('${o.id}')">
              <i class="fa fa-eye"></i> View Order
            </button>
            <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${o.id}', '${o.source || "orders"}')">
              <i class="fa fa-trash"></i> Delete
            </button>
          </td>

          <td>
            ${viewImageButton}
          </td>
        </tr>
      `;
    })
    .join("");
}

/* ============================================================
   OPEN IMAGE MODAL
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
   VIEW IMAGE (ONLY BILL IMAGE)
============================================================ */
function viewImage(id) {
  const o = orders.find(x => x.id === id) || productOrders.find(x => x.id === id);
  if (!o || !o.billImage) return;

  const div = document.getElementById("modalContent");

  div.innerHTML = `
    <div style="font-size:24px; font-weight:600; margin-bottom: 15px;">Bill Image for Order #${o.orderNo}</div>
    <img src="${o.billImage}" alt="Bill Image" style="max-width: 100%; height: auto; border-radius: 12px;">
    <button class="btn btn-secondary mt-3" onclick="closeModal()">Close</button>
  `;

  document.getElementById("modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.body.style.overflow = "auto";
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
   FILTER LOGIC (client-side, on already-fetched data)
============================================================ */
document
  .getElementById("salesmanFilter")
  .addEventListener("change", applyFilters);
let searchDebounceTimer;
searchBox.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(applyFilters, 400);
});
statusFilter.addEventListener("change", applyFilters);
dateFrom.addEventListener("change", applyFilters);
dateTo.addEventListener("change", applyFilters);

 function isAnyFilterActive() {
  const searchText = searchBox.value.trim();
  const selectedSalesman = document.getElementById("salesmanFilter")?.value || "";
  const s = statusFilter.value;
  const df = dateFrom.value;
  const dt = dateTo.value;

  return !!(searchText || selectedSalesman || s || df || dt);
}

function applyFilters() {
  const filterActive = isAnyFilterActive();

  if (filterActive) {
    // ✅ Need full dataset to search across ALL orders
    if (!allOrdersCache) {
      fetchAllOrdersForSearch().then(() => {
        runFilterOnDataset(allOrdersCache);
      });
      return;
    }
    runFilterOnDataset(allOrdersCache);
  } else {
    // No filters — go back to normal paginated view
    if (isSearchMode) {
      isSearchMode = false;
      if (paginationControls) paginationControls.style.display = "flex";
      orders = pageCache[currentPage] || [];
      mergeOrdersAndRender();
    } else {
      mergeOrdersAndRender();
    }
  }
}

function runFilterOnDataset(dataset) {
  let filtered = [...dataset];

  const searchText = searchBox.value.toLowerCase().trim();
  if (searchText) {
    filtered = filtered.filter((o) =>
      (o.orderNo && o.orderNo.toLowerCase().includes(searchText)) ||
      (o.party?.name && o.party.name.toLowerCase().includes(searchText)) ||
      (o.party?.mobile && o.party.mobile.toLowerCase().includes(searchText))
    );
  }

  const salesmanFilter = document.getElementById("salesmanFilter");
  const selectedSalesman = salesmanFilter ? salesmanFilter.value.toLowerCase() : "";

  if (selectedSalesman) {
    filtered = filtered.filter(o =>
      (o.salesman || "").toLowerCase() === selectedSalesman
    );
  }

  const s = statusFilter.value;
  if (s) {
    filtered = filtered.filter((o) =>
      (o.status || "").toLowerCase() === s.toLowerCase()
    );
  }

  if (dateFrom.value)
    filtered = filtered.filter((o) => o.orderDate >= dateFrom.value);

  if (dateTo.value)
    filtered = filtered.filter((o) => o.orderDate <= dateTo.value);

  isSearchMode = true;
  if (paginationControls) paginationControls.style.display = "none";

  renderOrders(filtered);
}

/* ============================================================
   FETCH ALL ORDERS — only when search/filter is used
============================================================ */
function fetchAllOrdersForSearch() {
  // ✅ Check sessionStorage cache first (valid for 5 minutes)
  const cached = sessionStorage.getItem('allOrdersCache');
  const cacheTime = sessionStorage.getItem('allOrdersCacheTime');

  if (cached && cacheTime && (Date.now() - Number(cacheTime) < 5 * 60 * 1000)) {
    allOrdersCache = JSON.parse(cached);
    return Promise.resolve();
  }

  return Promise.all([
    db.collection("orders").orderBy("savedAt", "desc").get(),
    loadProductOrders() // ensures productOrders is populated too
  ]).then(([ordersSnapshot]) => {

    const allOrders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      source: "orders",
      ...doc.data(),
    }));

    let merged = [...allOrders, ...productOrders];

    merged = merged.filter(o =>
      o.orderNo &&
      o.party &&
      o.party.name &&
      Number(o.grandTotal || 0) >= 0
    );

    allOrdersCache = merged;

    // ✅ Save to sessionStorage for next time
    try {
      sessionStorage.setItem('allOrdersCache', JSON.stringify(allOrdersCache));
      sessionStorage.setItem('allOrdersCacheTime', Date.now().toString());
    } catch (e) {
      console.warn("sessionStorage cache failed:", e);
    }
  });
}

/* ============================================================
   VIEW ORDER
============================================================ */
function viewOrder(id) {
  const o =
    orders.find(x => x.id === id) ||
    productOrders.find(x => x.id === id);

  if (!o) return;

  const div = document.getElementById("modalContent");

  const statusText = o.status || "Pending";
  const cancelReason = o.cancelRemark || "";

  let itemsHTML = `
    <table class="table table-bordered" style="width:100%; margin-bottom: 15px; border-collapse: collapse;">
      <thead style="background-color: #f4f4f4; text-align: left;">
        <tr>
          <th>Item Code</th>
          <th>Unit</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Total</th>
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

  itemsHTML += `
      </tbody>
    </table>
  `;

  let categoryDiscountsHTML = `
<div class="discounts-section" style="font-weight: bold; margin-bottom: 10px;">

  <div style="margin-bottom:8px;">
    <b>Hardware Discount:</b> 
    ${o.categoryDiscounts?.hardware || 0}%

    ${o.categoryDiscountPercents?.hardware
      ? `(${o.categoryDiscountPercents.hardware})`
      : ""
    }
  </div>

  <div>
    <b>Bathroom Discount:</b> 
    ${o.categoryDiscounts?.bathroom || 0}%

    ${o.categoryDiscountPercents?.bathroom
      ? `(${o.categoryDiscountPercents.bathroom})`
      : ""
    }
  </div>
  <div style="margin-top:8px;">

  <b>SS Discount:</b>

  ${o.categoryDiscounts?.stainlesssteel || 0}%

  ${o.categoryDiscountPercents?.stainlesssteel
      ? `(${o.categoryDiscountPercents.stainlesssteel})`
      : ""
    }

</div>

</div>
`;

  let billingHTML = `
    <div class="billing-section" style="margin-top: 15px;">
      <p><b>Subtotal:</b> ₹${o.subTotal || 0}</p>
      <p><b>Freight:</b> ₹${o.freight || 0}</p>
      <p><b>Special Discount:</b> ₹${o.specialDiscount || 0}</p>
      <p><b>GST (${o.gstPercent || 0}%):</b> ₹${o.gstAmount || 0}</p>
      <h3><b>Grand Total:</b> ₹${o.grandTotal || 0}</h3>
    </div>
  `;

  const cancelReasonHTML =
    (statusText === "Cancelled" || statusText === "Hold") && cancelReason
      ? `
        <div style="
          background:#fff3f3;
          border:1px solid #f5c2c7;
          color:#842029;
          padding:12px 14px;
          border-radius:8px;
          margin-bottom:20px;
        ">
          <div style="font-weight:700; margin-bottom:6px;">
            Status: ${statusText}
          </div>

          <div>
            <b>
              ${statusText === "Hold" ? "Hold Reason" : "Cancel Reason"}:
            </b>

            ${cancelReason}
          </div>

        </div>
      `
      : "";

  div.innerHTML = `
    <div style="
     display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:15px;

  position:sticky;
  top:0;
  background:#fff;
  z-index:100;
  padding:10px 0;
    ">
      <div style="font-size:24px; font-weight:600;">
        Order Details #${o.orderNo || "-"}
      </div>

      <div>
        <button
          class="btn btn-success btn-sm"
          onclick="downloadOrder()"
          style="margin-right:10px;"
        >
          <i class="fa fa-download"></i>
          Download
        </button>

        <button
          class="btn btn-light btn-sm"
          onclick="closeModal()"
        >
          ✖
        </button>
      </div>
    </div>

    <hr style="border: 1px solid #ccc;">

    ${cancelReasonHTML}

    <div class="party-details" style="margin-bottom: 20px;">
      <h4 style="font-size: 18px; font-weight: 600;">Party Details</h4>
      <p><b>Name:</b> ${o.party?.name || "-"}</p>
      <p><b>Mobile:</b> ${o.party?.mobile || "-"}</p>
      <p><b>Address:</b> ${o.party?.address || "-"}</p>
      <p><b>GST:</b> ${o.party?.gst || "-"}</p>
    </div>

    <div class="items-section" style="margin-bottom: 20px;">
      <h4 style="font-size: 18px; font-weight: 600;">Items</h4>
      ${itemsHTML}
    </div>

    <div class="category-discounts" style="margin-bottom: 20px;">
      <h4 style="font-size: 18px; font-weight: 600; color: #108082;">Category Discounts</h4>
      ${categoryDiscountsHTML}
    </div>

    <div class="billing-section">
      <h4 style="font-size: 18px; font-weight: 600; color: #108082;">Billing</h4>
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
   DELETE — CLEAN POPUP
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

  // Capture order number before deleting (for the toast message)
  const deletedOrder =
    orders.find(o => o.id === deleteOrderId) ||
    productOrders.find(o => o.id === deleteOrderId);
  const deletedOrderNo = deletedOrder?.orderNo || deleteOrderId;

  try {
    await db
      .collection(deleteOrderSource)
      .doc(deleteOrderId)
      .delete();

    if (deleteOrderSource === "orders") {
      orders = orders.filter(o => o.id !== deleteOrderId);
      pageCache[currentPage] = orders;

      // ✅ Invalidate cache of all later pages so they refetch correctly
      Object.keys(pageCache).forEach(p => {
        if (Number(p) > currentPage) delete pageCache[p];
      });

      // If current page becomes empty, shift back/forward
      if (orders.length === 0 && currentPage > 1) {
        goToPrevPage();
      } else if (orders.length < PAGE_SIZE && hasNextPage) {
        // Refill current page from server to keep PAGE_SIZE consistent
        refillCurrentPage();
      }
    } else {
      productOrders = productOrders.filter(o => o.id !== deleteOrderId);
    }

    mergeOrdersAndRender();
    updatePaginationUI();

    // ✅ Close modal immediately, reset state
    closeDeleteModal();
    btns.forEach(b => b.disabled = false);

    // ✅ Show small toast message
    showToast(`✅ Order ${deletedOrderNo} Deleted Successfully`);

  } catch (err) {
    console.error(err);
    msg.textContent = "❌ Delete Failed. Try again.";
    msg.style.color = "red";
    btns.forEach(b => b.disabled = false);
  }
};

/* ============================================================
   REFILL CURRENT PAGE — fetch one extra doc to keep PAGE_SIZE
============================================================ */
function refillCurrentPage() {
  if (!hasNextPage) return;

  const needed = PAGE_SIZE - orders.length;
  if (needed <= 0) return;

  const lastDocInOrders = orders.length
    ? null // we don't have doc snapshot for last item in `orders` array, so use lastVisibleOrder
    : null;

  db.collection("orders")
    .orderBy("savedAt", "desc")
    .startAfter(lastVisibleOrder)
    .limit(needed)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        hasNextPage = false;
        return;
      }

      lastVisibleOrder = snapshot.docs[snapshot.docs.length - 1];

      const fillerOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        source: "orders",
        ...doc.data()
      }));

      orders.push(...fillerOrders);
      pageCache[currentPage] = orders;

      hasNextPage = snapshot.docs.length === needed;

      mergeOrdersAndRender();
      updatePaginationUI();
    });
}

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

  // trigger reflow for animation restart
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");

  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => { toast.style.display = "none"; }, 300);
  }, 2500);
}
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
   FETCH PRODUCTS — ✅ LAZY LOADED (only when needed)
   This collection is no longer fetched on every page load.
   It loads only when user interacts with filters/search,
   or you can wire a button to call loadProductOrders().
============================================================ */
let productsLoaded = false;

function loadProductOrders() {
  if (productsLoaded) return Promise.resolve();

  return db.collection("products")
    .orderBy("createdAt", "desc")
    .limit(PAGE_SIZE)
    .get()
    .then((snapshot) => {

      lastVisibleProduct = snapshot.docs[snapshot.docs.length - 1];
      productsLoaded = true;

      productOrders = snapshot.docs.map(doc => {

        const data = doc.data();
        const party = data.partyDetails || {};

        const rawItems =
          data.items
          || data.orderItems
          || data.productList
          || data.cart
          || data.cartItems
          || [];

        const items = rawItems.map(item => ({
          code: item.code || item.name || "-",
          unit: item.unit || "-",
          qty: item.qty || item.quantity || 0,
          rate: item.rate || item.price || 0,
          amount: item.amount || ((item.qty || item.quantity || 0) * (item.rate || item.price || 0))
        }));

        return {
          id: doc.id,
          orderNo: party.orderNo || data.orderNo || doc.id,
          party: {
            name: party.partyName || data.partyName || "Unknown",
            type: party.partyType || data.partyType || "Secondary",
            mobile: party.mobile || data.mobile || "-",
            address: party.address || data.address || "-",
            gst: party.gst || data.gst || "-"
          },
          salesman: data.salesman || party.salesman || "Unknown",
          items: items,
          categoryDiscounts: data.categoryDiscounts || { hardware: 0, bathroom: 0, stainlesssteel: 0 },
          categoryDiscountPercents: data.categoryDiscountPercents || { hardware: "0%", bathroom: "0%", stainlesssteel: "0%" },
          subTotal: Number(data.subTotal || 0),
          freight: Number(data.freight || 0),
          specialDiscount: Number(data.specialDiscount || 0),
          gstPercent: Number(data.gstPercent || 0),
          gstAmount: Number(data.gstAmount || 0),
          grandTotal: Number(data.grandTotal || 0),
          status: data.status || "Pending",
          orderDate: party.orderDate || data.orderDate || new Date().toISOString().split("T")[0],
          source: "products"
        };
      });

      mergeOrdersAndRender();
    });
}

/* ==============================
   MERGE ORDERS + PRODUCTS
==============================*/
function mergeOrdersAndRender() {

  let allOrders = [
    ...orders,
    ...productOrders
  ];

  allOrders = allOrders.filter(o =>
    o.orderNo &&
    o.party &&
    o.party.name &&
    Number(o.grandTotal || 0) >= 0
  );

  allOrders.sort((a, b) => {
    const aTime = a.savedAt?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.savedAt?.seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  renderOrders(allOrders);
  populateSalesmanFilter(allOrders);
}

function downloadOrder() {

  const content = document.getElementById("modalContent").innerHTML;
  const win = window.open("", "", "width=900,height=700");

  win.document.write(`
    <html>
      <head>
        <title>Order Download</title>

        <style>
          body { font-family: Arial; padding: 20px; }
          table { width: 100%; border-collapse: collapse; }
          table, th, td { border: 1px solid #ccc; }
          th, td { padding: 8px; text-align: left; }
          h3 { margin-top: 20px; }
        </style>

      </head>

      <body>
        ${content}
      </body>
    </html>
  `);

  win.document.close();
  win.print();
}

function populateSalesmanFilter(list) {
  const filter = document.getElementById("salesmanFilter");
  if (!filter) return;

  const uniqueNames = [
    ...new Set(list.map(o => o.salesman || "Unknown"))
  ];

  filter.innerHTML = '<option value="">All Salesman</option>';

  uniqueNames.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    filter.appendChild(option);
  });
}

/* ============================================================
   EXPORT (CSV)
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
  {
    key: "billAmount",
    label: "Bill Amount",
    get: o => o.billAmount ? `₹${Number(o.billAmount).toFixed(2)}` : "-"
  },
  { key: "source", label: "Source", get: o => o.source || "orders" },
  {
    key: "items",
    label: "Items",
    get: o => (o.items || [])
      .map(i => `${i.code || "-"} (${i.qty || 0} ${i.unit || "-"})`)
      .join(" | ")
  }
];

let selectedColumnKeys = exportColumns.map(c => c.key);

function openExportModal() {
  // ✅ Load products data only when export is needed (if not already loaded)
  loadProductOrders().then(() => {
    document.getElementById("exportModal").style.display = "flex";
    document.body.style.overflow = "hidden";
    renderExportColumns();
  });
}

function closeExportModal() {
  document.getElementById("exportModal").style.display = "none";
  document.body.style.overflow = "auto";
}

function renderExportColumns() {
  const box = document.getElementById("exportColumnsList");
  const search = (document.getElementById("columnSearch")?.value || "").toLowerCase();

  const filteredColumns = exportColumns.filter(c =>
    c.label.toLowerCase().includes(search)
  );

  box.innerHTML = filteredColumns.map(col => `
    <label style="display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #eee; cursor:pointer;">
      <input
        type="checkbox"
        class="exportColumnCheck"
        value="${col.key}"
        ${selectedColumnKeys.includes(col.key) ? "checked" : ""}
        onchange="updateSelectedColumns()"
      >
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
  if (selectAll) {
    selectAll.checked = selectedColumnKeys.length === exportColumns.length;
  }
}

function toggleAllColumns(source) {
  if (source.checked) {
    selectedColumnKeys = exportColumns.map(c => c.key);
  } else {
    selectedColumnKeys = [];
  }

  renderExportColumns();
}

function toggleAllRows(source) {
  document.querySelectorAll(".rowCheck").forEach(cb => {
    cb.checked = source.checked;
  });
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

  let exportRows = currentRenderedOrders;

  if (selectedRowIds.length) {
    exportRows = currentRenderedOrders.filter(o =>
      selectedRowIds.includes(o.id)
    );
  }

  if (!exportRows.length) {
    alert("No data found to download.");
    return;
  }

  const selectedColumns = exportColumns.filter(c =>
    selectedColumnKeys.includes(c.key)
  );

  let csv = selectedColumns.map(c => csvSafe(c.label)).join(",") + "\n";

  exportRows.forEach(order => {
    csv += selectedColumns
      .map(col => csvSafe(col.get(order)))
      .join(",") + "\n";
  });

  const blob = new Blob(
    ["\uFEFF" + csv],
    { type: "text/csv;charset=utf-8;" }
  );

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `PETRO_Orders_Report_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();

  closeExportModal();
}

/* ============================================================
   PAGINATION (Next / Prev) — pages cached, no re-fetch on Prev
============================================================ */
let currentPage = 1;
let pageCache = { 1: [] };       // caches orders array per page
let pageCursors = { 1: null };   // first doc cursor (before this page) per page
let hasNextPage = true;

// ✅ SEARCH/FILTER MODE
let allOrdersCache = null;       // full fetched orders+products when search/filter active
let isSearchMode = false;
const paginationControls = document.querySelector(".d-flex.justify-content-center.align-items-center.mt-3");

const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageIndicator = document.getElementById("pageIndicator");

prevPageBtn.addEventListener("click", goToPrevPage);
nextPageBtn.addEventListener("click", goToNextPage);

function updatePaginationUI() {
  pageIndicator.textContent = `Page ${currentPage}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = !hasNextPage;
}

function goToPrevPage() {
  if (currentPage === 1) return;
  currentPage--;
  orders = pageCache[currentPage] || [];
  mergeOrdersAndRender();
  updatePaginationUI();
}

function goToNextPage() {
  const nextPage = currentPage + 1;

  // ✅ Already cached — no Firestore read
  if (pageCache[nextPage]) {
    currentPage = nextPage;
    orders = pageCache[nextPage];
    mergeOrdersAndRender();
    updatePaginationUI();
    return;
  }

  if (!lastVisibleOrder) {
    hasNextPage = false;
    updatePaginationUI();
    return;
  }

  db.collection("orders")
    .orderBy("savedAt", "desc")
    .startAfter(lastVisibleOrder)
    .limit(PAGE_SIZE)
    .get()
    .then((snapshot) => {

      if (snapshot.empty) {
        hasNextPage = false;
        updatePaginationUI();
        return;
      }

      lastVisibleOrder = snapshot.docs[snapshot.docs.length - 1];

      const newOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        source: "orders",
        ...doc.data()
      }));

      pageCache[nextPage] = newOrders;
      currentPage = nextPage;
      orders = newOrders;

      // Check if there might be more after this
      hasNextPage = snapshot.docs.length === PAGE_SIZE;

      mergeOrdersAndRender();
      updatePaginationUI();
    });
}

window.goNextPage = function () {
  console.log("Next Page");
};

window.goPrevPage = function () {
  console.log("Previous Page");
};
/* ============================================================
   CLEAR ALL FILTERS
============================================================ */
window.clearAllFilters = function () {
  searchBox.value = "";
  statusFilter.value = "";
  dateFrom.value = "";
  dateTo.value = "";

  const salesmanFilter = document.getElementById("salesmanFilter");
  if (salesmanFilter) salesmanFilter.value = "";

  applyFilters();
};