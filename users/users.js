/* ===============================
   FIREBASE INIT
================================ */
firebase.initializeApp({
  apiKey: "AIzaSyCdfQu5GCsBCyMHM7HX8GRzY-VTZaEMU5M",
  authDomain: "petro-oms.firebaseapp.com",
  projectId: "petro-oms",
});

const db = firebase.firestore();
const ADMIN_DELETE_PASSWORD = "PETRO123";
let deleteTargetId = null;
let deleteTargetOrderNo = null;

/* ===============================
   GLOBAL STATE
================================ */
let users = [];
let amountSortDir = "desc";

const PAGE_SIZE = 10;
let lastVisibleDoc = null;

/* ===============================
   DOM ELEMENTS
================================ */
const usersBody = document.getElementById("usersBody");
const emptyState = document.getElementById("emptyState");

const filterOrderNo = document.getElementById("filterOrderNo");
const filterPartyName = document.getElementById("filterPartyName");
const filterPartyMobile = document.getElementById("filterPartyMobile");
const filterSalesman = document.getElementById("filterSalesman");
const filterFromDate = document.getElementById("filterFromDate");
const filterToDate = document.getElementById("filterToDate");

/* ===============================
   LOAD USERS (FROM ORDERS)
================================ */
   async function loadUsers() {

    let query = db.collection("orders")
        .orderBy("savedAt", "desc")
        .limit(PAGE_SIZE);

    const snap = await query.get();

    if (!snap.empty) {
        lastVisibleDoc =
            snap.docs[snap.docs.length - 1];
    }

    users = snap.docs.map(d => {

        const o = d.data();

        return {
            id: d.id,
            orderNo: o.orderNo || "",
            name: o.party?.name || "",
            type: o.party?.type || "Secondary",
            mobile: o.party?.mobile || "",
            city: extractCity(o.party?.address || ""),
            salesman: o.salesman || "",
            status: o.status || "Pending",
            date: o.orderDate || "",
            total: o.grandTotal || 0,
            full: o
        };

    });

    populateSalesmanFilter();
    renderUsers(users);
}

loadUsers();

/* ===============================
   RENDER TABLE
================================ */
function renderUsers(data) {
  usersBody.innerHTML = "";

  if (!data.length) {
    emptyState.style.display = "block";
    calculateGrandTotal([]); // total = 0
    return;
  }
  emptyState.style.display = "none";

  data.forEach((u) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
            <td>${u.orderNo}</td> 
            <td>${u.name}</td>
            <td>
  <span class="badge ${u.type === "Primary" ? "badge-success" : "badge-warning"}">
    ${u.type}
  </span>
</td>
            <td>${u.mobile}</td>
            <td>${u.city}</td>
            <td>
    <span class="badge ${getStatusBadgeClass(u.status)}">
        ${u.status}
    </span>
</td>

            <td>₹${Number(u.total).toFixed(2)}</td>
           <td>
    <div style="display:flex; gap:6px; justify-content:center;">
       <button class="btn btn-sm btn-info" onclick="viewUser('${u.id}')">
    <i class="fa fa-eye mr-1"></i> View
</button>

<button class="btn btn-sm btn-danger"
    onclick="openDeleteModal('${u.id}','${u.orderNo}')">
    <i class="fa fa-trash mr-1"></i> Delete
</button>
    </div>
</td>
        `;

    usersBody.appendChild(tr);
  });

  calculateGrandTotal(data);
}

/* ===============================
   FILTERS
================================ */
document
  .querySelectorAll(
    "#filterOrderNo, #filterPartyName, #filterPartyMobile, #filterSalesman, #filterFromDate, #filterToDate",
  )
  .forEach((el) => el.addEventListener("input", applyFilters));

function applyFilters() {
  let data = [...users];

  if (filterOrderNo.value)
    data = data.filter((u) => u.orderNo.includes(filterOrderNo.value));

  if (filterPartyName.value)
    data = data.filter((u) =>
      u.name.toLowerCase().includes(filterPartyName.value.toLowerCase()),
    );

  if (filterPartyMobile.value)
    data = data.filter((u) => u.mobile.includes(filterPartyMobile.value));

  if (filterSalesman.value)
    data = data.filter((u) => u.salesman === filterSalesman.value);

  if (filterFromDate.value)
    data = data.filter((u) => u.date >= filterFromDate.value);

  if (filterToDate.value)
    data = data.filter((u) => u.date <= filterToDate.value);

  renderUsers(data);
}

function resetFilters() {
  document.querySelectorAll("input, select").forEach((el) => (el.value = ""));
  renderUsers(users);
}

/* ===============================
   SORT BY AMOUNT
================================ */
function sortByAmount() {
  amountSortDir = amountSortDir === "asc" ? "desc" : "asc";

  users.sort((a, b) =>
    amountSortDir === "asc" ? a.total - b.total : b.total - a.total,
  );

  renderUsers(users);
}

/* ===============================
   SALESMAN FILTER
================================ */
function populateSalesmanFilter() {
  const set = new Set(users.map((u) => u.salesman).filter(Boolean));
  filterSalesman.innerHTML = `<option value="">All Salesman</option>`;
  set.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    filterSalesman.appendChild(opt);
  });
}

/* ===============================
   VIEW USER MODAL
================================ */
window.viewUser = function (id) {
  const u = users.find((x) => x.id === id);
  if (!u) return;

  const m = document.getElementById("modal");
  const c = document.getElementById("modalContent");
  const party = u.full.party || {};
  const NA = "N/A";

  c.innerHTML = `
    <div class="line"><b>Party Name:</b> ${party.name || NA}</div>
    <div class="line"><b>Party Type:</b> ${party.type || party.partyType || NA}</div>
    <div class="line"><b>Party Address:</b> ${party.address || NA}</div>
    <div class="line"><b>GSTIN:</b> ${party.gst || party.gstin || party.gstNo || NA}</div>
    <div class="line"><b>Party Mobile No.:</b> ${party.mobile || NA}</div>
    <div class="line"><b>Salesman:</b> ${u.salesman || NA}</div>
    <div class="line"><b>Order No:</b> ${u.orderNo || NA}</div>
    <div class="line"><b>Order Total:</b> ₹${Number(u.total || 0).toFixed(2)}</div>
  `;

  m.style.display = "flex";
};

function closeModal() {
  document.getElementById("modal").style.display = "none";
}

/* ===============================
   UTIL
================================ */
function extractCity(address) {
  if (!address) return "";
  const parts = address.split(",");
  return parts[parts.length - 1].trim();
}

function calculateGrandTotal(data) {
  let total = 0;

  data.forEach((u) => {
    total += Number(u.total || 0);
  });

  const el = document.getElementById("grandTotalSum");
  if (el) {
    el.innerText =
      "₹ " +
      total.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      });
  }
}

function downloadCSV() {
  const rows = document.querySelectorAll("#usersBody tr");

  if (!rows.length) {
    alert("No data available to download");
    return;
  }

  let csv = [];
  csv.push(
    [
      "Order No",
      "Party Name",
      "Party Type",
      "Mobile",
      "City",
      "Status",
      "Order Total",
    ].join(","),
  );

  rows.forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (!tds.length) return;

    const row = [
      tds[0].innerText.trim(),
      tds[1].innerText.trim(),
      tds[2].innerText.trim(),
      tds[3].innerText.trim(),
      tds[4].innerText.trim(),
      tds[5].innerText.trim(),
      tds[6].innerText.replace("₹", "").trim(),
    ];

    csv.push(row.map((v) => `"${v}"`).join(","));
  });

  const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

function getStatusBadgeClass(status) {
  if (!status) return "badge-secondary";

  switch (status.toLowerCase()) {
    case "pending":
      return "badge-warning";

    case "delivered":
      return "badge-success";

    case "partial delivered":
      return "badge-info";

    case "cancelled":
    case "canceled":
      return "badge-danger";

    case "hold":
      return "badge-dark";

    default:
      return "badge-secondary";
  }
}

window.openDeleteModal = function (id, orderNo) {
  deleteTargetId = id;
  deleteTargetOrderNo = orderNo;

  document.getElementById("deleteOrderText").innerText =
    `Are you sure you want to permanently delete order ${orderNo}?`;

  const passwordField = document.getElementById("adminDeletePassword");
  passwordField.value = "";
  passwordField.focus();

  document.getElementById("deleteModal").style.display = "flex";
};

window.closeDeleteModal = function () {
  document.getElementById("deleteModal").style.display = "none";
};

window.confirmDeleteOrder = async function () {
  const pass = document.getElementById("adminDeletePassword").value.trim();

  if (!deleteTargetId) {
    alert("No order selected");
    return;
  }

  if (!pass) {
    alert("Please enter admin password");
    return;
  }

  if (pass !== ADMIN_DELETE_PASSWORD) {
    alert("Invalid admin password");
    return;
  }

  try {
    await db.collection("orders").doc(deleteTargetId).delete();

    users = users.filter((u) => u.id !== deleteTargetId);

    renderUsers(users);

    closeDeleteModal();

    deleteTargetId = null;
    deleteTargetOrderNo = null;

    alert("Order deleted successfully");
  } catch (err) {
    console.error(err);
    alert("Delete failed");
  }
};
document
  .getElementById("adminDeletePassword")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      confirmDeleteOrder();
    }
  });

window.toggleDeletePassword = function () {
  const input = document.getElementById("adminDeletePassword");
  const icon = document.getElementById("passwordToggleIcon");

  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
};

document
    .getElementById("loadMoreBtn")
    .addEventListener("click", loadMoreUsers);

async function loadMoreUsers() {

    if (!lastVisibleDoc) return;

    const snap = await db.collection("orders")
        .orderBy("savedAt", "desc")
        .startAfter(lastVisibleDoc)
        .limit(PAGE_SIZE)
        .get();

    if (snap.empty) {

        alert("No More Users");

        document.getElementById("loadMoreBtn")
            .style.display = "none";

        return;
    }

    lastVisibleDoc =
        snap.docs[snap.docs.length - 1];

    const newUsers = snap.docs.map(d => {

        const o = d.data();

        return {
            id: d.id,
            orderNo: o.orderNo || "",
            name: o.party?.name || "",
            type: o.party?.type || "Secondary",
            mobile: o.party?.mobile || "",
            city: extractCity(o.party?.address || ""),
            salesman: o.salesman || "",
            status: o.status || "Pending",
            date: o.orderDate || "",
            total: o.grandTotal || 0,
            full: o
        };

    });

    users.push(...newUsers);

    renderUsers(users);
}