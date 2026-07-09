let orders = [];
let productOrders = [];

let allOrdersCache = [];
let currentPage = 1;
let rowsPerPage = 10;
let currentSearchQuery = "";

let currentStatusFilter = "";
let currentBillFilter = "";
let currentDateFromFilter = "";
let currentDateToFilter = "";
let currentMinAmountFilter = "";
let currentMaxAmountFilter = "";

/* -------------------------------------
   FIREBASE INIT
-------------------------------------- */
const db = firebase.firestore();
const DRIVE_UPLOAD_URL = "https://script.google.com/macros/s/AKfycbyAbNdLjXn4-I6fao_HkGsdYsgWHKpmEp0b5tfEpzLAb5qEwe62aXEOy_j4WKi8CjNulg/exec";

/* -------------------------------------
   ACTIVITY LOGGER
-------------------------------------- */
async function logActivity({

  orderId = "",
  orderNo = "",
  action = "",
  message = ""

}) {

  try {

    await db.collection("order_activities").add({

      orderId,

      orderNo,

      action,

      message,

      user:
        localStorage.getItem("user_name") || "Unknown",

      role:
        localStorage.getItem("user_role") || "sales",

      timestamp:
        firebase.firestore.FieldValue.serverTimestamp()

    });

  } catch (err) {

    console.error(
      "Activity Error:",
      err
    );

  }

}

/* -------------------------------------
   DOM READY
-------------------------------------- */
document.addEventListener("DOMContentLoaded", function () {

  const salesman = localStorage.getItem("salesman");

  if (!salesman) {
    alert("Please login first!");
    window.location.href = "sales-login.html";
    return;
  }

  const welcomeEl = document.getElementById("welcome");
  if (welcomeEl) {
    welcomeEl.innerHTML = "Logged in as: <b>" + salesman + "</b>";
  }

  const SALESMAN_PREFIX = {
    "Sariya Murtuza": "SM",
    "Roshan Sharma": "RS",
    "Amit Soni": "AS",
    "Ankit Kalra": "AK",
    "Vivek Srivastava": "VS",
    "Rup Ranjan Bora": "RRB",
    "Mahesh Kumar": "MK",
  };

  const prefix = SALESMAN_PREFIX[salesman];
  if (!prefix) return;

  fetchOrders(prefix);
  fetchProductOrders(prefix);

});

/* -------------------------------------
   FETCH ORDERS (from "orders" collection)
-------------------------------------- */
function fetchOrders(prefix) {

  db.collection("orders")
    .orderBy("savedAt", "desc")
    .onSnapshot((snap) => {

      orders = [];

      snap.forEach(doc => {

        const o = {
          id: doc.id,
          source: "orders",
          ...doc.data()
        };

        if (
          !o.orderNo ||
          !o.orderNo.startsWith(prefix)
        ) {
          return;
        }

        orders.push(o);

      });

      mergeAndRender();

    });

}

/* -------------------------------------
   FETCH PRODUCT ORDERS (from "products" collection)
-------------------------------------- */
function fetchProductOrders(prefix) {

  db.collection("products")
    .onSnapshot((snap) => {

      productOrders = [];

      snap.forEach(doc => {

        const data = doc.data();

        // orderNo check — partyDetails ke andar bhi ho sakta hai
        const orderNo =
          data.orderNo ||
          data.partyDetails?.orderNo ||
          "";

        if (
          !orderNo ||
          !orderNo.startsWith(prefix)
        ) {
          return;
        }

        const party = data.partyDetails || {};

        const rawItems =
          data.items ||
          data.orderItems ||
          data.productList ||
          data.cart ||
          data.cartItems ||
          [];

        const items = rawItems.map(item => ({
          code: item.code || item.name || "-",
          unit: item.unit || "-",
          qty: item.qty || item.quantity || 0,
          rate: item.rate || item.price || 0,
          amount: item.amount || ((item.qty || item.quantity || 0) * (item.rate || item.price || 0))
        }));

        productOrders.push({
          id: doc.id,
          source: "products",
          orderNo: orderNo,
          orderDate: data.orderDate || party.orderDate || "-",
          status: data.status || "Pending",
          billImage: data.billImage || null,
          billAmount: data.billAmount || null,
          grandTotal: Number(data.grandTotal || 0),
          subTotal: Number(data.subTotal || 0),
          freight: Number(data.freight || 0),
          specialDiscount: Number(data.specialDiscount || 0),
          gstAmount: Number(data.gstAmount || 0),
          cancelRemark: data.cancelRemark || "",
          categoryDiscounts: data.categoryDiscounts || { hardware: 0, bathroom: 0, stainlesssteel: 0 },
          party: {
            name: data.partyName || party.partyName || "-",
            mobile: data.mobile || party.mobile || "-",
            address: data.address || party.address || "-",
            gst: data.gst || party.gst || "-",
          },
          cartItems: items,
          savedAt: data.createdAt || data.savedAt || null,
        });

      });

      mergeAndRender();

    });

}

/* -------------------------------------
   MERGE ORDERS + PRODUCT ORDERS & RENDER
-------------------------------------- */
function mergeAndRender() {

  allOrdersCache = [
    ...orders,
    ...productOrders
  ];

  // Sort latest first
  allOrdersCache.sort((a, b) => {

    const aTime =
      a.savedAt?.seconds ||
      a.savedAt?.toDate?.().getTime() / 1000 ||
      0;

    const bTime =
      b.savedAt?.seconds ||
      b.savedAt?.toDate?.().getTime() / 1000 ||
      0;

    return bTime - aTime;

  });

  // Dashboard counts
  const total = allOrdersCache.length;

  const pending =
    allOrdersCache.filter(o => o.status !== "Delivered").length;

  const delivered =
    allOrdersCache.filter(o => o.status === "Delivered").length;

  document.getElementById("totalOrders").innerText = total;
  document.getElementById("pendingOrders").innerText = pending;
  document.getElementById("deliveredOrders").innerText = delivered;

  applySearchAndPagination();

}

/* -------------------------------------
   STATUS CHANGE
-------------------------------------- */
function handleStatusChange(orderId, selectElement) {

  const newStatus = selectElement.value;

  const order =
    orders.find(x => x.id === orderId) ||
    productOrders.find(x => x.id === orderId);

  const source = order?.source || "orders";

  if (newStatus === "Delivered") {
    selectElement.value = order?.status || "Pending";
    openBillModal(orderId);
  } else {

    const oldStatus = order?.status || "Pending";

    db.collection(source)
      .doc(orderId)
      .update({
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      })
      .then(async () => {

        await logActivity({
          orderId: orderId,
          orderNo: order?.orderNo || "",
          action: "status_changed",
          message: `${localStorage.getItem("user_name") || "User"} changed status from "${oldStatus}" to "${newStatus}" for order ${order?.orderNo || ""}`
        });

      });

  }
}

/* -------------------------------------
   OPEN BILL UPLOAD MODAL (Updated)
-------------------------------------- */
function openBillModal(orderId) {

  const o =
    orders.find(x => x.id === orderId) ||
    productOrders.find(x => x.id === orderId);

  if (!o) return;

  const div = document.getElementById("modalContent");

  div.innerHTML = `

    <div class="ubill-wrap">

      <h3 class="ubill-title">

        Upload Delivery Bill

      </h3>

      <div class="ubill-meta">

        <div>
          <b>Order No:</b>
          ${o.orderNo}
        </div>

        <div>
          <b>Party:</b>
          ${o.party?.name || "-"}
        </div>

      </div>

      <!-- DROP AREA -->

      <div class="ubill-drop" id="ubillDrop">

        <div class="ubill-drop-inner"
             id="dropPlaceholder">

          <div class="ubill-drop-icon">

            <i class="fa fa-cloud-upload-alt"></i>

          </div>

          <div class="ubill-drop-text"
               id="ubillFileText">

            Choose File / Drag & Drop

          </div>

          <div class="ubill-drop-sub">

            Supported:
            JPG, PNG, PDF

          </div>

        </div>

        <input type="file"
              id="modalFile"
              accept="image/*,.pdf"
               style="display:none;" />

      </div>

      <!-- IMAGE PREVIEW -->

      <img id="billPreview"
           class="ubill-preview"
           style="display:none;" />

      <!-- PDF PREVIEW -->

      <div id="pdfPreview"
           class="pdf-preview"
           style="display:none;">

        <i class="fa fa-file-pdf"></i>

        <span id="pdfName"></span>

      </div>

      <!-- BILL AMOUNT -->

      <input type="number"
             id="modalBillAmount"
             class="ubill-input"

             placeholder="Enter Bill Amount"

             value="${o.billAmount || ""}" />

      <!-- SAVE BUTTON -->

      <button id="saveButton"
              class="ubill-btn"

              onclick="saveDeliveredOrder('${orderId}', '${o.source || "orders"}')">

        Save & Mark Delivered

      </button>

    </div>

  `;

  document.getElementById("modal").style.display = "flex";

  document.body.style.overflow = "hidden";

  setupBillDrop();
}

function setupBillDrop() {

  const drop = document.getElementById("ubillDrop");

  const input = document.getElementById("modalFile");

  const preview =
    document.getElementById("billPreview");

  const pdfPreview =
    document.getElementById("pdfPreview");

  const pdfName =
    document.getElementById("pdfName");

  const placeholder =
    document.getElementById("dropPlaceholder");

  const text =
    document.getElementById("ubillFileText");

  if (!drop || !input) return;

  function showFile(file) {

    if (!file) return;

    text.textContent = file.name;

    placeholder.style.display = "none";

    // IMAGE
    if (file.type.startsWith("image/")) {

      pdfPreview.style.display = "none";

      const reader = new FileReader();

      reader.onload = e => {

        preview.src = e.target.result;

        preview.style.display = "block";
      };

      reader.readAsDataURL(file);
    }

    // PDF
    else if (file.type === "application/pdf") {

      preview.style.display = "none";

      pdfPreview.style.display = "flex";

      pdfName.textContent = file.name;
    }
  }

  drop.addEventListener("click", () => {

    input.click();

  });

  input.addEventListener("change", () => {

    if (input.files && input.files[0]) {

      showFile(input.files[0]);
    }
  });

  drop.addEventListener("dragover", (e) => {

    e.preventDefault();

    drop.classList.add("is-drag");

  });

  drop.addEventListener("dragleave", () => {

    drop.classList.remove("is-drag");

  });

  drop.addEventListener("drop", (e) => {

    e.preventDefault();

    drop.classList.remove("is-drag");

    if (
      e.dataTransfer.files &&
      e.dataTransfer.files[0]
    ) {

      input.files = e.dataTransfer.files;

      showFile(e.dataTransfer.files[0]);
    }
  });
}


/* -------------------------------------
   IMAGE PREVIEW
-------------------------------------- */
function previewBillImage(event) {

  const file = event.target.files[0];
  const preview = document.getElementById("billPreview");

  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (e) {
    preview.src = e.target.result;
    preview.style.display = "block";
  };

  reader.readAsDataURL(file);
}


function uploadBillToGoogleDrive(file, orderId, orderNo) {

  return new Promise((resolve, reject) => {

    // File size check - 5MB max
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("Maximum 5MB file allowed"));
      return;
    }

    // File type check
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      reject(new Error("Only JPG, PNG or PDF allowed"));
      return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {

      const safeOrderNo =
        (orderNo || orderId || "ORDER")
          .replace(/[^a-zA-Z0-9_-]/g, "_");

      const safeFileName =
        file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

      const payload = JSON.stringify({
        fileName: `${safeOrderNo}_${Date.now()}_${safeFileName}`,
        fileType: file.type,
        fileData: e.target.result,   // base64 string
        orderId: orderId,
        orderNo: orderNo || ""
      });

      fetch(DRIVE_UPLOAD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: payload,
        redirect: "follow"          // 302 redirect auto follow karega
      })

        .then(async (response) => {

          // Response text lo pehle
          const text = await response.text();

          // Agar HTML aa gaya (login page redirect)
          if (text.trim().startsWith("<")) {
            throw new Error(
              "Apps Script returned HTML — Check deployment: Execute as 'Me', Access 'Anyone'"
            );
          }

          let data;
          try {
            data = JSON.parse(text);
          } catch (parseErr) {
            throw new Error(
              "Invalid JSON from Apps Script: " +
              text.substring(0, 100)
            );
          }

          if (!data.success) {
            throw new Error(data.error || "Drive upload failed");
          }

          return data;

        })

        .then((data) => {
          resolve(data);
        })

        .catch((err) => {
          reject(err);
        });

    };

    reader.onerror = function () {
      reject(new Error("File read failed"));
    };

    reader.readAsDataURL(file);

  });
}

function saveDeliveredOrder(orderId, source) {

  source = source || "orders";

  const fileInput =
    document.getElementById("modalFile");

  const amountInput =
    document.getElementById("modalBillAmount");

  const saveButton =
    document.getElementById("saveButton");

  const amount =
    amountInput ? amountInput.value.trim() : "";

  const order =
    orders.find(x => x.id === orderId) ||
    productOrders.find(x => x.id === orderId);

  if (!order) {
    alert("Order not found");
    return;
  }

  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    alert("Please upload bill");
    return;
  }

  if (!amount || Number(amount) <= 0) {
    alert("Enter valid bill amount");
    return;
  }

  const file = fileInput.files[0];

  if (
    !file.type.startsWith("image/") &&
    file.type !== "application/pdf"
  ) {
    alert("Only JPG, PNG or PDF allowed");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("Maximum 5MB file allowed");
    return;
  }

  saveButton.disabled = true;
  saveButton.innerHTML = "Uploading Bill...";

  uploadBillToGoogleDrive(
    file,
    orderId,
    order.orderNo || ""
  )

    .then((driveData) => {

      saveButton.innerHTML = "Saving Delivery...";

      return db.collection(source)
        .doc(orderId)
        .update({

          status: "Delivered",

          billImage: driveData.fileUrl,
          billUrl: driveData.fileUrl,
          billDriveId: driveData.fileId,

          billType: file.type,
          billFileName: file.name,
          billAmount: Number(amount),

          deliveredAt:
            firebase.firestore.FieldValue.serverTimestamp(),

          updatedAt:
            firebase.firestore.FieldValue.serverTimestamp()

        });

    })

    .then(async () => {

      await logActivity({
        orderId: orderId,
        orderNo: order.orderNo || "",
        action: "delivered",
        message:
          `${localStorage.getItem("user_name") || "User"} uploaded bill to Google Drive and marked order ${order.orderNo || ""} as Delivered`
      });

      document.getElementById("modalContent").innerHTML = `
<div class="success-box">

    <div class="success-icon">
        <i class="fa-solid fa-circle-check"></i>
    </div>

    <h2>Delivery Saved Successfully</h2>

    <p>
        Bill uploaded to Google Drive and saved in Firestore.
    </p>

    <button class="ubill-btn" onclick="closeModal()">
        Close
    </button>

</div>
`;

    })

    .catch((err) => {

      console.error("Drive Upload Error:", err);

      alert(
        "Drive Upload Failed: " + err.message
      );

      saveButton.disabled = false;
      saveButton.innerHTML = "Save & Mark Delivered";

    });

}
/* -------------------------------------
   VIEW BILL IMAGE
-------------------------------------- */

function openBillImage(fileUrl) {

  window.open(fileUrl, "_blank");

}

function handleImgLoad() {
  const skeleton = document.getElementById("imgSkeleton");
  const img = document.getElementById("actualBillImg");
  if (skeleton && img) {
    skeleton.style.display = "none";
    img.style.display = "inline-block";
  }
}

/* -------------------------------------
   VIEW ORDER
-------------------------------------- */
function viewOrder(id) {

  const o =
    orders.find(x => x.id === id) ||
    productOrders.find(x => x.id === id);

  if (!o) return;

  const div = document.getElementById("modalContent");

  const statusText = o.status || "Pending";
  const cancelRemark = o.cancelRemark || "";

  let itemsHTML = `
  <table class="modal-items-table">
    <thead>
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

  (o.cartItems || o.items || []).forEach(i => {

    const qty = i.qty || i.quantity || 0;
    const rate = i.rate || i.price || 0;
    const total = i.amount || (qty * rate);

    itemsHTML += `
    <tr>
      <td>${i.code || "-"}</td>
      <td>${i.unit || "-"}</td>
      <td>${qty}</td>
      <td>₹${rate}</td>
      <td>₹${total}</td>
    </tr>
  `;
  });

  itemsHTML += `
    </tbody>
  </table>
  `;

  div.innerHTML = `
    <div class="view-order-wrap">
      <div class="view-order-header">
        <div class="view-order-left">
          <h3 class="modal-title">${o.orderNo}</h3>
        </div>

        <button class="myq-btn myq-btn-download" onclick="downloadOrder('${o.id}')">
          <i class="fa fa-download"></i> Download
        </button>
      </div>

      <!-- CANCEL REMARK (Only if Cancelled) -->
      ${statusText === "Cancelled" && cancelRemark ? `
      <div style="background-color: #f8d7da; padding: 10px; margin-top: 20px; border-radius: 5px; border: 1px solid #f5c6cb;">
        <h5 style="color:#721c24;">Cancel Reason:</h5>
        <p style="color:#721c24;">${cancelRemark}</p>
      </div>
      ` : ""}

      <!-- HOLD REASON (Only if Hold) -->
      ${statusText === "Hold" && cancelRemark ? `
      <div style="background-color: #fff3cd; padding: 10px; margin-top: 20px; border-radius: 5px; border: 1px solid #ffeeba;">
        <h5 style="color:#856404;">Hold Reason:</h5>
        <p style="color:#856404;">${cancelRemark}</p>
      </div>
      ` : ""}

      <!-- PARTY DETAILS -->
      <div class="modal-section">
        <h4>Party Details</h4>
        <p><b>Name:</b> ${o.party?.name || "-"}</p>
        <p><b>Mobile:</b> ${o.party?.mobile || "-"}</p>
        <p><b>Address:</b> ${o.party?.address || "-"}</p>
        <p><b>GST:</b> ${o.party?.gst || "-"}</p>
      </div>

      <!-- ITEMS -->
      <div class="modal-section">
        <h4>Items</h4>
        ${itemsHTML}
      </div>

      <!-- DISCOUNT -->
      <div class="modal-section">
        <h4>Category Discounts</h4>
        <p><b>Hardware Discount:</b> ${o.categoryDiscounts?.hardware ?? 0}%</p>
        <p><b>Bathroom Discount:</b> ${o.categoryDiscounts?.bathroom ?? 0}%</p>
        <p><b>SS Discount:</b> ${o.categoryDiscounts?.stainlesssteel ?? 0}%</p>
      </div>

      <!-- BILLING -->
      <div class="modal-section">
        <h4>Billing</h4>
        <div class="billing-row">
          <span>Subtotal</span>
          <span>₹${o.subTotal || 0}</span>
        </div>
        <div class="billing-row">
          <span>Freight</span>
          <span>₹${o.freight || 0}</span>
        </div>
        <div class="billing-row">
          <span>Special Discount</span>
          <span>₹${o.specialDiscount || 0}</span>
        </div>
        <div class="billing-row">
          <span>GST</span>
          <span>₹${o.gstAmount || 0}</span>
        </div>
        <div class="billing-row total">
          <span>Grand Total</span>
          <span>₹${o.grandTotal || 0}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById("modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

/* -------------------------------------
   EDIT
-------------------------------------- */
function editOrder(id) {

  const order =
    orders.find(x => x.id === id) ||
    productOrders.find(x => x.id === id);

  const source = order?.source || "orders";

  logActivity({
    orderId: order?.id || "",
    orderNo: order?.orderNo || "",
    action: "edit_order",
    message: `${localStorage.getItem("user_name") || "User"} opened edit page for order ${order?.orderNo || ""}`
  });

  window.location.href =
    "../orders/edit-order.html?id=" + id + "&source=" + source;

}

/* -------------------------------------
   CLOSE MODAL
-------------------------------------- */
function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.body.style.overflow = "auto";
}

/* -------------------------------------
   SEARCH + PAGINATION EVENTS
-------------------------------------- */
/* -------------------------------------
   SEARCH + FILTER + PAGINATION EVENTS
-------------------------------------- */
document.addEventListener("input", function (e) {

  if (e.target.id === "orderSearch") {

    currentSearchQuery =
      e.target.value.trim().toLowerCase();

    currentPage = 1;

    applySearchAndPagination();

    return;
  }

  if (e.target.id === "minAmountFilter") {

    currentMinAmountFilter =
      e.target.value.trim();

    currentPage = 1;

    applySearchAndPagination();

    return;
  }

  if (e.target.id === "maxAmountFilter") {

    currentMaxAmountFilter =
      e.target.value.trim();

    currentPage = 1;

    applySearchAndPagination();

    return;
  }

});

document.addEventListener("change", function (e) {

  if (e.target.id === "rowsPerPage") {

    rowsPerPage = Number(e.target.value) || 10;

    currentPage = 1;

    applySearchAndPagination();

    return;
  }

  if (e.target.id === "statusFilter") {

    currentStatusFilter =
      e.target.value;

    currentPage = 1;

    applySearchAndPagination();

    return;
  }

  if (e.target.id === "billFilter") {

    currentBillFilter =
      e.target.value;

    currentPage = 1;

    applySearchAndPagination();

    return;
  }

  if (e.target.id === "dateFromFilter") {

    currentDateFromFilter =
      e.target.value;

    currentPage = 1;

    applySearchAndPagination();

    return;
  }

  if (e.target.id === "dateToFilter") {

    currentDateToFilter =
      e.target.value;

    currentPage = 1;

    applySearchAndPagination();

    return;
  }

});

document.addEventListener("click", function (e) {

  const prevBtn =
    e.target.closest("#prevPageBtn");

  const nextBtn =
    e.target.closest("#nextPageBtn");

  const pageBtn =
    e.target.closest(".page-number-btn");

  const resetBtn =
    e.target.closest("#resetFiltersBtn");

  if (resetBtn) {

    resetAllFilters();

    return;
  }

  if (prevBtn) {

    if (currentPage > 1) {
      currentPage--;
      applySearchAndPagination();
    }

    return;
  }

  if (nextBtn) {

    const totalFiltered =
      getFilteredOrders().length;

    const totalPages =
      Math.ceil(totalFiltered / rowsPerPage) || 1;

    if (currentPage < totalPages) {
      currentPage++;
      applySearchAndPagination();
    }

    return;
  }

  if (pageBtn) {

    const page =
      Number(pageBtn.dataset.page);

    if (page) {
      currentPage = page;
      applySearchAndPagination();
    }

  }

});

/* -------------------------------------
   RESET ALL FILTERS
-------------------------------------- */
function resetAllFilters() {

  currentSearchQuery = "";
  currentStatusFilter = "";
  currentBillFilter = "";
  currentDateFromFilter = "";
  currentDateToFilter = "";
  currentMinAmountFilter = "";
  currentMaxAmountFilter = "";

  currentPage = 1;

  const orderSearch =
    document.getElementById("orderSearch");

  const statusFilter =
    document.getElementById("statusFilter");

  const billFilter =
    document.getElementById("billFilter");

  const dateFromFilter =
    document.getElementById("dateFromFilter");

  const dateToFilter =
    document.getElementById("dateToFilter");

  const minAmountFilter =
    document.getElementById("minAmountFilter");

  const maxAmountFilter =
    document.getElementById("maxAmountFilter");

  if (orderSearch) orderSearch.value = "";
  if (statusFilter) statusFilter.value = "";
  if (billFilter) billFilter.value = "";
  if (dateFromFilter) dateFromFilter.value = "";
  if (dateToFilter) dateToFilter.value = "";
  if (minAmountFilter) minAmountFilter.value = "";
  if (maxAmountFilter) maxAmountFilter.value = "";

  applySearchAndPagination();

}
/* -------------------------------------
   GET FILTERED ORDERS
-------------------------------------- */
/* -------------------------------------
   GET ORDER DATE VALUE
-------------------------------------- */
function getOrderDateValue(o) {

  if (o.savedAt?.toDate) {
    return o.savedAt.toDate();
  }

  if (o.savedAt?.seconds) {
    return new Date(o.savedAt.seconds * 1000);
  }

  if (o.createdAt?.toDate) {
    return o.createdAt.toDate();
  }

  if (o.orderDate) {
    const parsedDate = new Date(o.orderDate);

    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;

}

/* -------------------------------------
   GET FILTERED ORDERS
-------------------------------------- */
function getFilteredOrders() {

  const q =
    currentSearchQuery || "";

  return allOrdersCache.filter(o => {

    const orderNo =
      String(o.orderNo || "").toLowerCase();

    const partyName =
      String(o.party?.name || "").toLowerCase();

    const mobile =
      String(o.party?.mobile || "").toLowerCase();

    const status =
      String(o.status || "Pending");

    const grandTotal =
      Number(o.grandTotal || 0);

    const hasBill =
      Boolean(o.billImage || o.billUrl);

    /* SEARCH FILTER */
    const searchMatch =
      !q ||
      orderNo.includes(q) ||
      partyName.includes(q) ||
      mobile.includes(q);

    if (!searchMatch) {
      return false;
    }

    /* STATUS FILTER */
    if (
      currentStatusFilter &&
      status !== currentStatusFilter
    ) {
      return false;
    }

    /* BILL FILTER */
    if (currentBillFilter === "uploaded" && !hasBill) {
      return false;
    }

    if (currentBillFilter === "pending" && hasBill) {
      return false;
    }

    /* AMOUNT FILTER */
    if (
      currentMinAmountFilter &&
      grandTotal < Number(currentMinAmountFilter)
    ) {
      return false;
    }

    if (
      currentMaxAmountFilter &&
      grandTotal > Number(currentMaxAmountFilter)
    ) {
      return false;
    }

    /* DATE FILTER */
    const orderDate =
      getOrderDateValue(o);

    if (currentDateFromFilter) {

      if (!orderDate) {
        return false;
      }

      const fromDate =
        new Date(currentDateFromFilter + "T00:00:00");

      if (orderDate < fromDate) {
        return false;
      }

    }

    if (currentDateToFilter) {

      if (!orderDate) {
        return false;
      }

      const toDate =
        new Date(currentDateToFilter + "T23:59:59");

      if (orderDate > toDate) {
        return false;
      }

    }

    return true;

  });

}

/* -------------------------------------
   APPLY SEARCH + PAGINATION
-------------------------------------- */
function applySearchAndPagination() {

  const filtered =
    getFilteredOrders();

  const totalRecords =
    filtered.length;

  const totalPages =
    Math.ceil(totalRecords / rowsPerPage) || 1;

  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  if (currentPage < 1) {
    currentPage = 1;
  }

  const startIndex =
    (currentPage - 1) * rowsPerPage;

  const endIndex =
    startIndex + rowsPerPage;

  const pageData =
    filtered.slice(startIndex, endIndex);

  renderOrders(pageData);

  renderPagination(totalRecords, startIndex);

}

/* -------------------------------------
   RENDER PAGINATION
-------------------------------------- */
function renderPagination(totalRecords, startIndex) {

  const info =
    document.getElementById("paginationInfo");

  const pageNumbers =
    document.getElementById("pageNumbers");

  const prevBtn =
    document.getElementById("prevPageBtn");

  const nextBtn =
    document.getElementById("nextPageBtn");

  if (!info || !pageNumbers || !prevBtn || !nextBtn) {
    return;
  }

  const totalPages =
    Math.ceil(totalRecords / rowsPerPage) || 1;

  const from =
    totalRecords === 0 ? 0 : startIndex + 1;

  const to =
    Math.min(startIndex + rowsPerPage, totalRecords);

  info.innerText =
    `Showing ${from} to ${to} of ${totalRecords} orders`;

  prevBtn.disabled =
    currentPage <= 1;

  nextBtn.disabled =
    currentPage >= totalPages;

  let html = "";

  let startPage =
    Math.max(1, currentPage - 2);

  let endPage =
    Math.min(totalPages, currentPage + 2);

  if (currentPage <= 3) {
    endPage = Math.min(5, totalPages);
  }

  if (currentPage >= totalPages - 2) {
    startPage = Math.max(1, totalPages - 4);
  }

  for (let i = startPage; i <= endPage; i++) {

    html += `

      <button class="page-number-btn ${i === currentPage ? "active" : ""}"
              data-page="${i}">
        ${i}
      </button>

    `;

  }

  pageNumbers.innerHTML = html;

}
/* -------------------------------------
   RENDER ORDERS
-------------------------------------- */
function renderOrders(list) {

  let html = "";

  list.forEach(o => {

    let editAllowed = true;

    if (o.savedAt) {

      const orderTime = o.savedAt?.toDate
        ? o.savedAt.toDate().getTime()
        : new Date(o.savedAt).getTime();

      if (Date.now() - orderTime > 15 * 60 * 1000) {
        editAllowed = false;
      }
    }

    html += `

<tr class="erp-mobile-card">

  <!-- ORDER -->
  <td data-label="Order">

    <div class="erp-order-box">

      <div class="erp-order-id">
        ${o.orderNo || "-"}
      </div>

      <div class="erp-order-date">

        <i class="fa fa-calendar"></i>

        ${o.orderDate || "-"}

      </div>

      <div class="erp-status-chip">
        ${o.status || "Pending"}
      </div>

    </div>

  </td>

  <!-- PARTY -->
  <td>

    <div class="erp-info-box">

      <div class="erp-info-icon">
        <i class="fa fa-user"></i>
      </div>

      <div>

        <div class="erp-label">
          Party
        </div>

        <div class="erp-value">
          ${o.party?.name || "-"}
        </div>

      </div>

    </div>

  </td>

  <!-- TOTAL -->
  <td>

    <div class="erp-info-box">

      <div class="erp-info-icon green">
        <i class="fa fa-indian-rupee-sign"></i>
      </div>

      <div>

        <div class="erp-label">
          Grand Total
        </div>

        <div class="erp-amount">

          ${Number(o.grandTotal || 0).toFixed(2)}

        </div>

      </div>

    </div>

  </td>

  <!-- ACTION -->
  <td data-label="Action">

    <div class="erp-action-wrap">

      <button class="myq-btn myq-btn-view"
        onclick="viewOrder('${o.id}')">

        <i class="fa fa-eye"></i>

        View

      </button>

      ${editAllowed
        ? `
        <button class="myq-btn myq-btn-edit"
          onclick="editOrder('${o.id}')"
          data-source="${o.source || 'orders'}">

          <i class="fa fa-pen"></i>

          Edit

        </button>
        `
        : `
        <button class="myq-btn myq-btn-lock" disabled>

          <i class="fa fa-lock"></i>

          Locked

        </button>
        `
      }

    </div>

  </td>

  <!-- STATUS -->
  <td data-label="Status">

    ${o.billImage
        ? `
      <span class="status-badge status-approved">

        <i class="fa fa-circle-check"></i>

        Delivered

      </span>
      `
        : `
      <select class="status-dropdown" onchange="handleStatusChange('${o.id}', this)">
    <option ${o.status === "All Status" ? "selected" : ""}>All Status</option>
    <option ${o.status === "Pending" ? "selected" : ""}>Pending</option>
    <option ${o.status === "Quotation Sent" ? "selected" : ""}>Quotation Sent</option>
    <option ${o.status === "Payment Received" ? "selected" : ""}>Payment Received</option>
    <option ${o.status === "Partial Delivered" ? "selected" : ""}>Partial Delivered</option>
    <option ${o.status === "Delivered" ? "selected" : ""}>Delivered</option>
    <option ${o.status === "Hold" ? "selected" : ""}>Hold</option>
    <option ${o.status === "Cancelled" ? "selected" : ""}>Cancelled</option>
</select>
      `
      }

  </td>

  <!-- BILL -->
  <td data-label="Bill">

    ${o.billImage
        ? `
      <button class="myq-btn myq-btn-view"
        onclick="openBillImage('${o.billImage}')">

        <i class="fa fa-file-invoice"></i>

        View Bill

      </button>
      `
        : `
      <div class="erp-bill-pending">

        <i class="fa fa-clock"></i>

        Bill Pending

      </div>
      `
      }

  </td>

  <!-- BILL AMOUNT -->
  <td data-label="Bill Amount">

    <span class="bill-amt-display">

      ${o.billAmount
        ? `₹${Number(o.billAmount).toFixed(2)}`
        : "-"}

    </span>

  </td>

</tr>

`;

  });

  if (!html) {

    html = `

<tr>

  <td colspan="7"
      style="
      text-align:center;
      padding:30px;
      font-weight:700;
      color:#777;
      ">

      No Orders Found

  </td>

</tr>

`;
  }

  document.getElementById("myOrders").innerHTML = html;
}


const loggedSalesman = localStorage.getItem("loggedSalesman");
const loginTime = localStorage.getItem("loginTime");

// 24 HOURS
const SESSION_TIME = 24 * 60 * 60 * 1000;

if (!loggedSalesman || !loginTime) {

  // ❌ NOT LOGGED IN
  window.location.replace("sales-login.html");

} else {

  const currentTime = Date.now();

  // CHECK SESSION EXPIRY
  if (currentTime - Number(loginTime) > SESSION_TIME) {

    // ❌ SESSION EXPIRED
    localStorage.clear();

    window.location.replace("sales-login.html");

  } else {

    // ✅ SESSION ACTIVE

    const adminName =
      document.getElementById("adminName");

    if (adminName) {
      adminName.innerText = loggedSalesman;
    }

    const welcome =
      document.getElementById("welcome");

    if (welcome) {
      welcome.innerHTML =
        `Welcome, ${loggedSalesman}`;
    }
  }
}


function downloadOrder(orderId) {
  const o =
    orders.find(x => x.id === orderId) ||
    productOrders.find(x => x.id === orderId);

  if (!o) {
    alert("Order not found");
    return;
  }

  const items = o.cartItems || o.items || [];

  const itemRows = items.map((i, index) => {
    const qty = Number(i.qty || i.quantity || 0);
    const rate = Number(i.rate || i.price || 0);
    const amount = Number(i.amount || qty * rate || 0);

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${i.code || "-"}</td>
        <td>${i.unit || "-"}</td>
        <td class="right">${qty}</td>
        <td class="right">₹${rate.toFixed(2)}</td>
        <td class="right">₹${amount.toFixed(2)}</td>
      </tr>
    `;
  }).join("");

  const win = window.open("", "", "width=1200,height=900");

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${o.orderNo || "Order"} - PETRO OMS</title>

  <style>
    @page {
      size: A4;
      margin: 12mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      color: #1f2937;
      margin: 0;
      background: #fff;
      font-size: 13px;
    }

    .invoice {
      width: 100%;
      border: 1px solid #d1d5db;
      padding: 18px;
      position: relative;
    }

    .watermark {
      position: fixed;
      top: 42%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      font-size: 70px;
      font-weight: 800;
      color: rgba(16,128,130,0.06);
      z-index: 0;
      white-space: nowrap;
    }

    .content {
      position: relative;
      z-index: 1;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #108082;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }

    .company h1 {
      margin: 0;
      font-size: 24px;
      color: #108082;
      letter-spacing: 0.5px;
    }

    .company p {
      margin: 4px 0;
      color: #4b5563;
      font-size: 12px;
    }

    .doc-title {
      text-align: right;
    }

    .doc-title h2 {
      margin: 0;
      font-size: 20px;
      color: #111827;
    }

    .doc-title span {
      display: inline-block;
      margin-top: 8px;
      background: #e6f7f7;
      color: #108082;
      padding: 6px 12px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 12px;
    }

    .top-info {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }

    .info-card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px;
      background: #f9fafb;
    }

    .info-card label {
      display: block;
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 5px;
      text-transform: uppercase;
      font-weight: 700;
    }

    .info-card strong {
      font-size: 14px;
      color: #111827;
    }

    .section {
      margin-top: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      overflow: hidden;
    }

    .section-title {
      background: #108082;
      color: #fff;
      padding: 9px 12px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .party-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0;
    }

    .party-item {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
    }

    .party-item:nth-child(odd) {
      border-right: 1px solid #e5e7eb;
    }

    .party-item label {
      display: block;
      font-size: 11px;
      color: #6b7280;
      font-weight: 700;
      margin-bottom: 4px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      background: #f3f4f6;
      color: #111827;
      padding: 9px;
      font-size: 12px;
      border-bottom: 1px solid #d1d5db;
      text-align: left;
    }

    td {
      padding: 9px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }

    .right {
      text-align: right;
    }

    .summary-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }

    .summary {
      width: 360px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      overflow: hidden;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 9px 12px;
      border-bottom: 1px solid #e5e7eb;
    }

    .summary-row.total {
      background: #108082;
      color: #fff;
      font-size: 17px;
      font-weight: 800;
      border-bottom: none;
    }

    .discount-box {
      margin-top: 16px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .discount {
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      padding: 10px;
      background: #f8fafc;
      text-align: center;
    }

    .discount label {
      display: block;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }

    .discount strong {
      display: block;
      margin-top: 5px;
      font-size: 16px;
    }

    .footer {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .signature {
      width: 210px;
      text-align: center;
      padding-top: 45px;
      border-top: 1px solid #111827;
      font-weight: 700;
      color: #374151;
    }

    .generated {
      margin-top: 22px;
      text-align: center;
      font-size: 11px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
    }

    .print-btn {
      position: fixed;
      top: 15px;
      right: 15px;
      background: #108082;
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      z-index: 99;
    }

    @media print {
      .print-btn {
        display: none;
      }

      .invoice {
        border: none;
        padding: 0;
      }

      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>

<body>

<button class="print-btn" onclick="window.print()">Print / Save PDF</button>

<div class="invoice">
  <div class="watermark">PETRO OMS</div>

  <div class="content">

    <div class="header">
      <div class="company">
        <h1>PETRO INDUSTECH PVT LTD</h1>
        <p>Manufacturing & Order Management System</p>
        <p>Phone: +91-8000007336 | Email: contact@petroindustech.com</p>
        <p>Website: www.oms.rankchahiye.com</p>
      </div>

      <div class="doc-title">
        <h2>ORDER / QUOTATION</h2>
        <span>${o.status || "Pending"}</span>
      </div>
    </div>

    <div class="top-info">
      <div class="info-card">
        <label>Order No</label>
        <strong>${o.orderNo || "-"}</strong>
      </div>

      <div class="info-card">
        <label>Order Date</label>
        <strong>${o.orderDate || "-"}</strong>
      </div>

      <div class="info-card">
        <label>Grand Total</label>
        <strong>₹${Number(o.grandTotal || 0).toFixed(2)}</strong>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Party Details</div>
      <div class="party-grid">
        <div class="party-item">
          <label>Name</label>
          ${o.party?.name || "-"}
        </div>

        <div class="party-item">
          <label>Mobile</label>
          ${o.party?.mobile || "-"}
        </div>

        <div class="party-item">
          <label>GST</label>
          ${o.party?.gst || "-"}
        </div>

        <div class="party-item">
          <label>Address</label>
          ${o.party?.address || "-"}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Products</div>
      <table>
        <thead>
          <tr>
            <th style="width:50px;">S.No</th>
            <th>Code / Product</th>
            <th>Unit</th>
            <th class="right">Qty</th>
            <th class="right">Rate</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || `
            <tr>
              <td colspan="6" style="text-align:center;padding:25px;">No items found</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>

    <div class="discount-box">
      <div class="discount">
        <label>Hardware Discount</label>
        <strong>${o.categoryDiscounts?.hardware ?? 0}%</strong>
      </div>

      <div class="discount">
        <label>Bathroom Discount</label>
        <strong>${o.categoryDiscounts?.bathroom ?? 0}%</strong>
      </div>

      <div class="discount">
        <label>SS Discount</label>
        <strong>${o.categoryDiscounts?.stainlesssteel ?? 0}%</strong>
      </div>
    </div>

    <div class="summary-wrap">
      <div class="summary">
        <div class="summary-row">
          <span>Subtotal</span>
          <strong>₹${Number(o.subTotal || 0).toFixed(2)}</strong>
        </div>

        <div class="summary-row">
          <span>Freight</span>
          <strong>₹${Number(o.freight || 0).toFixed(2)}</strong>
        </div>

        <div class="summary-row">
          <span>Special Discount</span>
          <strong>₹${Number(o.specialDiscount || 0).toFixed(2)}</strong>
        </div>

        <div class="summary-row">
          <span>GST</span>
          <strong>₹${Number(o.gstAmount || 0).toFixed(2)}</strong>
        </div>

        <div class="summary-row total">
          <span>Grand Total</span>
          <span>₹${Number(o.grandTotal || 0).toFixed(2)}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="signature">Customer Signature</div>
      <div class="signature">Authorized Signature</div>
    </div>

    <div class="generated">
      Generated from Petro OMS | www.oms.rankchahiye.com <br>
      This is a computer-generated document.
    </div>

  </div>
</div>

<script>
  window.onload = function() {
    setTimeout(function() {
      window.print();
    }, 500);
  };
</script>

</body>
</html>
`);

  win.document.close();
}