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
   GLOBAL VARIABLES
============================================================ */
let orders = [];
let deleteOrderId = null;
let deleteOrderSource = "orders";
let currentRenderedOrders = [];
let lastVisibleOrder = null;

const ordersBody = document.getElementById("ordersBody");
const emptyState = document.getElementById("emptyState");

const statusFilter = document.getElementById("filterStatus");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const searchBox = document.getElementById("searchBox");

const ADMIN_DELETE_PASSWORD = "PETRO123";

/* ============================================================
   FETCH ORDERS (REALTIME)
============================================================ */
const PAGE_SIZE = 25;

db.collection("orders")
  .orderBy("savedAt", "desc")
  .limit(PAGE_SIZE)
  .get()
  .then((snapshot) => {

    lastVisibleOrder =
      snapshot.docs[snapshot.docs.length - 1];

    orders = snapshot.docs.map((doc) => ({
      id: doc.id,
      source: "orders",
      ...doc.data(),
    }));

    mergeOrdersAndRender();
  }); 


/* ============================================================
 RENDER ORDERS TABLE (Updated)
============================================================ */
function renderOrders(list) {
  currentRenderedOrders = list;
  if (!list.length) {
    emptyState.style.display = "block";
    ordersBody.innerHTML = "";
    return;
  }

  emptyState.style.display = "none";

  ordersBody.innerHTML = list
    .map((o, index) => {
      const partyType = o.party?.type || "Secondary";  // ✅ Type column
      const statusText = o.status || "Pending";        // ✅ Status column
      const orderDate = o.orderDate || "-";
      const total = Number(o.grandTotal ?? 0);
      const billImage = o.billImage || null; // Assuming you have the image URL in `billImage` 

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
  <td>${index + 1}</td>
          <td>${o.salesman || "-"}</td>
          <td>${o.orderNo || "-"}</td> 
          <td>${o.party?.name || "-"}</td>

          <!-- ✅ TYPE -->
          <td>
            <span class="badge ${partyType === "Primary" ? "badge-success" : "badge-warning"}">
              ${partyType}
            </span>
          </td>

          <!-- ✅ TOTAL -->
          <td>₹${total.toFixed(2)}</td>

          <!-- ✅ STATUS -->
          <td>
            <span class="badge-status ${statusClass(statusText)}">
              ${statusText}
            </span>
          </td>
 
          <!-- ✅ ACTION -->
          <td>
            <button class="btn btn-warning btn-sm" onclick="editOrder('${o.id}', '${o.source || "orders"}')">✏ Edit</button>
            <button class="btn btn-primary btn-sm" onclick="viewOrder('${o.id}')">
              <i class="fa fa-eye"></i> View Order
            </button>
            <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${o.id}', '${o.source || "orders"}')">
              <i class="fa fa-trash"></i> Delete
            </button>
          </td>

          <!-- ✅ BILL IMAGE -->
          <td>
            ${viewImageButton}  <!-- View Image Button if image exists -->
          </td>
        </tr>
      `;
    })
    .join("");
}

/* ============================================================
   OPEN IMAGE MODAL (Updated)
============================================================ */
/* Open Image Modal with Skeleton Loader */
function openImageModal(imageUrl) {
  const modal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const imageSkeleton = document.getElementById("imageSkeleton");

  // Show skeleton loader
  imageSkeleton.style.display = "block";
  modalImage.style.display = "none";  // Hide the image until it's loaded

  // Load image
  const img = new Image();
  img.onload = function () {
    // When the image is loaded, hide the skeleton and show the image
    modalImage.src = imageUrl;
    imageSkeleton.style.display = "none";  // Hide skeleton loader
    modalImage.style.display = "block";  // Show image
  };

  img.src = imageUrl;  // Start loading the image

  // Show the modal
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";  // Disable scrolling when modal is open
}

function closeImageModal() {
  document.getElementById("imageModal").style.display = "none"; // Close the modal
}

/* ============================================================
   VIEW IMAGE (ONLY BILL IMAGE)
============================================================ */
function viewImage(id) {
  const o = orders.find(x => x.id === id);
  if (!o || !o.billImage) return;

  const div = document.getElementById("modalContent");

  // Display the bill image in the modal
  div.innerHTML = `
    <div style="font-size:24px; font-weight:600; margin-bottom: 15px;">Bill Image for Order #${o.orderNo}</div>
    <img src="${o.billImage}" alt="Bill Image" style="max-width: 100%; height: auto; border-radius: 12px;">
    <button class="btn btn-secondary mt-3" onclick="closeModal()">Close</button>
  `;

  // Show the modal
  document.getElementById("modal").style.display = "flex";
  document.body.style.overflow = "hidden";  // Disable scrolling when modal is open
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.body.style.overflow = "auto"; // Re-enable scrolling
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
   FILTER LOGIC
============================================================ */
document
  .getElementById("salesmanFilter")
  .addEventListener(
    "change",
    applyFilters
  );
searchBox.addEventListener("input", applyFilters);
statusFilter.addEventListener("change", applyFilters);
dateFrom.addEventListener("change", applyFilters);
dateTo.addEventListener("change", applyFilters);

function applyFilters() {
  let filtered = [
    ...(orders || []),
    ...(productOrders || [])
  ];

  const searchText = searchBox.value.toLowerCase();
  if (searchText) {
    filtered = filtered.filter(
      (o) =>
        (o.orderNo && o.orderNo.toLowerCase().includes(searchText)) ||
        (o.party?.name && o.party.name.toLowerCase().includes(searchText))
    );
  }

  const salesmanFilter =
    document.getElementById("salesmanFilter");

  const selectedSalesman =
    salesmanFilter
      ? salesmanFilter.value.toLowerCase()
      : "";

  if (selectedSalesman) {

    filtered = filtered.filter(o =>
      (o.salesman || "")
        .toLowerCase()
        .includes(selectedSalesman)
    );

  }

  const s = statusFilter.value;
  if (s) {
    filtered = filtered.filter((o) =>
      (o.status || "").toLowerCase().includes(s.toLowerCase())
    );
  }

  if (dateFrom.value)
    filtered = filtered.filter((o) => o.orderDate >= dateFrom.value);

  if (dateTo.value)
    filtered = filtered.filter((o) => o.orderDate <= dateTo.value);

  renderOrders(filtered);
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

  // ---- ITEMS TABLE ----
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

  // ---- CATEGORY DISCOUNTS ----
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

  // ---- BILLING DETAILS ----
  let billingHTML = `
    <div class="billing-section" style="margin-top: 15px;">
      <p><b>Subtotal:</b> ₹${o.subTotal || 0}</p>
      <p><b>Freight:</b> ₹${o.freight || 0}</p>
      <p><b>Special Discount:</b> ₹${o.specialDiscount || 0}</p>
      <p><b>GST (${o.gstPercent || 0}%):</b> ₹${o.gstAmount || 0}</p>
      <h3><b>Grand Total:</b> ₹${o.grandTotal || 0}</h3>
    </div>
  `;

  // ---- CANCEL REASON BLOCK ----
  // ---- REASON BLOCK ----
  const cancelReasonHTML =
    (
      statusText === "Cancelled"
      ||
      statusText === "Hold"
    )
      &&
      cancelReason
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
              ${statusText === "Hold"
        ? "Hold Reason"
        : "Cancel Reason"}
              :
            </b>

            ${cancelReason}
          </div>

        </div>
      `
      : "";

  // ---- COMPLETE MODAL HTML ----
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

    <!-- Party Details -->
    <div class="party-details" style="margin-bottom: 20px;">
      <h4 style="font-size: 18px; font-weight: 600;">Party Details</h4>
      <p><b>Name:</b> ${o.party?.name || "-"}</p>
      <p><b>Mobile:</b> ${o.party?.mobile || "-"}</p>
      <p><b>Address:</b> ${o.party?.address || "-"}</p>
      <p><b>GST:</b> ${o.party?.gst || "-"}</p>
    </div>

    <!-- Items -->
    <div class="items-section" style="margin-bottom: 20px;">
      <h4 style="font-size: 18px; font-weight: 600;">Items</h4>
      ${itemsHTML}
    </div>

    <!-- Category Discounts -->
    <div class="category-discounts" style="margin-bottom: 20px;">
      <h4 style="font-size: 18px; font-weight: 600; color: #108082;">Category Discounts</h4>
      ${categoryDiscountsHTML}
    </div>

    <!-- Billing -->
    <div class="billing-section">
      <h4 style="font-size: 18px; font-weight: 600; color: #108082;">Billing</h4>
      ${billingHTML}
    </div>
  `;

  document.getElementById("modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}


function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.body.style.overflow = "auto";
}

/* ============================================================
   EDIT ORDER
============================================================ */
window.editOrder = function (orderId, source) {

  window.location.href =
    `edit-order.html?id=${orderId}&source=${source}`;

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

  // 🔒 Disable delete button to prevent double click
  const btns = document.querySelectorAll("#deleteModal button");
  btns.forEach(b => b.disabled = true);

  try {
    // ✅ Show message FIRST
    msg.textContent = "🗑️ Deleting order...";
    msg.style.color = "#ff9800";

    // 🔥 Delete from Firebase
    await db
      .collection(deleteOrderSource)
      .doc(deleteOrderId)
      .delete();

    // ✅ Success message
    msg.textContent = "✅ Order Deleted Successfully";
    msg.style.color = "green";

    // ⏳ Keep popup visible for 2 seconds
    setTimeout(() => {
      closeDeleteModal();
      btns.forEach(b => b.disabled = false);
      msg.style.display = "none";
    }, 2000);

  } catch (err) {
    console.error(err);
    msg.textContent = "❌ Delete Failed. Try again.";
    msg.style.color = "red";
    btns.forEach(b => b.disabled = false);
  }
};



function togglePass() {
  const pass = document.getElementById("deletePass");
  const icon = document.querySelector(".toggle-eye");

  if (pass.type === "password") {
    pass.type = "text";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  } else {
    pass.type = "password";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  }
}

// EXTRAAAA


/* ==============================
   FETCH PRODUCTS ORDER DATA
==============================*/
let productOrders = [];

db.collection("products")
  .orderBy("createdAt", "desc")
  .limit(PAGE_SIZE)
  .get()
  .then((snapshot) => {

    productOrders = snapshot.docs.map(doc => {

      const data = doc.data();
      const party = data.partyDetails || {};

      // 🔥 UNIVERSAL ITEMS MAPPING
      const rawItems =
        data.items
        || data.orderItems
        || data.productList
        || data.cart
        || data.cartItems
        || [];

      const items = rawItems.map(item => ({

        code:
          item.code
          || item.name
          || "-",

        unit:
          item.unit
          || "-",

        qty:
          item.qty
          || item.quantity
          || 0,

        rate:
          item.rate
          || item.price
          || 0,

        amount:
          item.amount
          || (
            (item.qty || item.quantity || 0) *
            (item.rate || item.price || 0)
          )

      }));

      return {

        id: doc.id,

        // ORDER NUMBER
        orderNo:
          party.orderNo
          || data.orderNo
          || doc.id,

        // PARTY DETAILS
        party: {

          name:
            party.partyName
            || data.partyName
            || "Unknown",

          type:
            party.partyType
            || data.partyType
            || "Secondary",

          mobile:
            party.mobile
            || data.mobile
            || "-",

          address:
            party.address
            || data.address
            || "-",

          gst:
            party.gst
            || data.gst
            || "-"
        },
        salesman:
          data.salesman
          || party.salesman
          || "Unknown",

        // ITEMS (FIXED)
        items: items,

        // CATEGORY DISCOUNTS
        categoryDiscounts:
          data.categoryDiscounts || {

            hardware: 0,

            bathroom: 0,

            stainlesssteel: 0

          },

        categoryDiscountPercents:
          data.categoryDiscountPercents || {

            hardware: "0%",

            bathroom: "0%",

            stainlesssteel: "0%"

          },

        // BILLING
        subTotal:
          Number(data.subTotal || 0),

        freight:
          Number(data.freight || 0),

        specialDiscount:
          Number(data.specialDiscount || 0),

        gstPercent:
          Number(data.gstPercent || 0),

        gstAmount:
          Number(data.gstAmount || 0),

        grandTotal:
          Number(data.grandTotal || 0),

        // STATUS
        status:
          data.status || "Pending",

        // DATE
        orderDate:
          party.orderDate
          || data.orderDate
          || new Date().toISOString().split("T")[0],

        // SOURCE IDENTIFIER 
        source:
          "products"

      };

    });


    // SAFE MERGE
    mergeOrdersAndRender();

  });

/* ==============================
MERGE ORDERS + PRODUCTS
==============================*/
function mergeOrdersAndRender() {



  let allOrders = [
    ...orders,
    ...productOrders
  ];

  // REMOVE invalid empty orders
  allOrders = allOrders.filter(o =>
    o.orderNo &&
    o.party &&
    o.party.name &&
    Number(o.grandTotal || 0) >= 0
  );

  // SORT latest first
  // SORT LATEST CREATED ORDER FIRST
  allOrders.sort((a, b) => {

    const aTime =
      a.savedAt?.seconds ||
      a.createdAt?.seconds ||
      0;

    const bTime =
      b.savedAt?.seconds ||
      b.createdAt?.seconds ||
      0;

    return bTime - aTime;

  });

  renderOrders(allOrders);

  populateSalesmanFilter(allOrders);

}

function downloadOrder() {

  const content =
    document.getElementById("modalContent")
      .innerHTML;

  const win = window.open(
    "",
    "",
    "width=900,height=700"
  );

  win.document.write(`
    <html>
      <head>
        <title>Order Download</title>

        <style>
          body {
            font-family: Arial;
            padding: 20px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          table, th, td {
            border: 1px solid #ccc;
          }

          th, td {
            padding: 8px;
            text-align: left;
          }

          h3 {
            margin-top: 20px;
          }
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

  const filter =
    document.getElementById("salesmanFilter");

  if (!filter) return;

  // Unique names nikaalo
  const uniqueNames = [
    ...new Set(
      list.map(o =>
        o.salesman || "Unknown"
      )
    )
  ];

  filter.innerHTML =
    '<option value="">All Salesman</option>';

  uniqueNames.forEach(name => {

    const option =
      document.createElement("option");

    option.value = name;
    option.textContent = name;

    filter.appendChild(option);

  });

}
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
    get: o => o.billAmount
      ? `₹${Number(o.billAmount).toFixed(2)}`
      : "-"
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
  {
    type: "text/csv;charset=utf-8;"
  }
);

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `PETRO_Orders_Report_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();

  closeExportModal();
}

document
  .getElementById("loadMoreBtn")
  .addEventListener("click", loadMoreOrders);

function loadMoreOrders() {

  if (!lastVisibleOrder) return;

  db.collection("orders")
    .orderBy("savedAt", "desc")
    .startAfter(lastVisibleOrder)
    .limit(PAGE_SIZE)
    .get()
    .then((snapshot) => {

      if (snapshot.empty) {
        alert("No More Orders");
        return;
      }

      lastVisibleOrder =
        snapshot.docs[snapshot.docs.length - 1];

      const newOrders =
        snapshot.docs.map(doc => ({
          id: doc.id,
          source: "orders",
          ...doc.data()
        }));

      orders.push(...newOrders);

      mergeOrdersAndRender();
    });

}
window.goNextPage = function () {
  console.log("Next Page");
};

window.goPrevPage = function () {
  console.log("Previous Page");
};