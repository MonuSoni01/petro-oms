/* ======================================================
   FIREBASE IMPORTS (v9 – SAFE)
====================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js"; 
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
    

/* ======================================================
   FIREBASE CONFIG
====================================================== */
const firebaseConfig = {
    apiKey: "AIzaSyCdfQu5GCsBCyMHM7HX8GRzY-VTZaEMU5M",
    authDomain: "petro-oms.firebaseapp.com",
    projectId: "petro-oms",
    storageBucket: "petro-oms.firebasestorage.app",
    messagingSenderId: "562472760628",
    appId: "1:562472760628:web:384f4eda2c862b6e3ce161",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ======================================================
   GET ORDER ID + MODE
====================================================== */
const params =
    new URLSearchParams(window.location.search);

const orderId =
    params.get("id");

const source =
    params.get("source") || "orders";

const MODE =
    (params.get("mode") || "edit")
        .toLowerCase();

if (!orderId) {

    alert("❌ Invalid Order ID");

    window.location.href =
        "orders.html";

}

/* ======================================================
   DOM ELEMENTS
====================================================== */
const loader = document.getElementById("loader");
const editArea = document.getElementById("editArea");

const orderNo = document.getElementById("orderNo");
const orderStatus = document.getElementById("orderStatus");

const partyName = document.getElementById("partyName");
const partyMobile = document.getElementById("partyMobile");
const partyAddress = document.getElementById("partyAddress");
const partyGST = document.getElementById("partyGST");
const partyType = document.getElementById("partyType");

const freight = document.getElementById("freight");
const specialDiscount = document.getElementById("specialDiscount");
const gstPercent = document.getElementById("gstPercent");
const subTotal = document.getElementById("subTotal");
const gstAmount = document.getElementById("gstAmount");
const grandTotal = document.getElementById("grandTotal");

const itemsBody = document.getElementById("itemsBody");
const suggestBox = document.getElementById("suggestBox");

/* ======================================================
   STATUS NORMALIZER (Old → New 5 Status)
====================================================== */
function normalizeStatus(s) {

    const t = (s || "")
        .toString()
        .trim()
        .toLowerCase();

    if (t.includes("quotation"))
        return "Quotation Sent";

    if (t.includes("payment"))
        return "Payment Received";

    if (t.includes("partial"))
        return "Partial Delivered";

    if (t.includes("delivered"))
        return "Delivered";

    if (t.includes("cancel"))
        return "Cancelled";

    if (t.includes("hold"))
        return "Hold";

    return "Pending";

}

/* ======================================================
   LOAD ORDER
====================================================== */
async function loadOrder() {
    try {
        const collectionName = source.toLowerCase().includes("product") ? "products" : "orders";
        let o = null;

        // Try fetching by document ID first
        const ref = doc(db, collectionName, orderId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
            o = snap.data();
        } else {
            // If not found, fallback: search by orderNo
            const q = query(
                collection(db, collectionName),
                where("orderNo", "==", orderId)
            );
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
                o = querySnap.docs[0].data();
            }
        }

        if (!o) {
            alert("❌ Order Not Found");
            location.href = "orders.html";
            return;
        }

        // Populate form fields
        orderNo.value = o.orderNo || "";
        orderStatus.value = normalizeStatus(o.status || "Pending");

        const party = o.party || o.partyDetails || {};

        partyName.value = party.name || party.partyName || "";
        partyMobile.value = party.mobile || "";
        partyAddress.value = party.address || "";
        partyGST.value = party.gst || "";
        partyType.value = party.type || party.partyType || "";

        freight.value = Number(o.freight || 0);
        specialDiscount.value = Number(o.specialDiscount || 0);
        gstPercent.value = Number(o.gstPercent || 0);

        // Category discounts
        const hDisc = document.getElementById("hardwareDisc");
        const bDisc = document.getElementById("bathroomDisc");
        const ssDisc = document.getElementById("stainlesssteelDisc");

        if (hDisc) hDisc.value = Number(o.categoryDiscounts?.hardware || 0);
        if (bDisc) bDisc.value = Number(o.categoryDiscounts?.bathroom || 0);
        if (ssDisc) ssDisc.value = Number(o.categoryDiscounts?.stainlesssteel || 0);

        // Items
        itemsBody.innerHTML = "";
        const rawItems = o.items || o.cartItems || o.orderItems || o.productList || [];
        rawItems.forEach((item) => {
            // Normalize quantity
            if (item.quantity !== undefined && item.qty === undefined) {
                item.qty = item.quantity;
            }
            // Normalize rate
            if (item.price !== undefined && item.rate === undefined) {
                item.rate = item.price;
            }
            addItemRow(item);
        });

        calcTotals();
        loader.style.display = "none";
        editArea.style.display = "block";

        applyViewMode();

    } catch (err) {
        console.error(err);
        alert("❌ Failed to load order. Check console.");
    }
}
checkOrderSource(); 
loadOrder();

/* ======================================================
   CATEGORY DISC BY CODE
====================================================== */
function getCategoryDiscByCode(code) {

    const h =
        Number(
            document.getElementById(
                "hardwareDisc"
            )?.value || 0
        );

    const b =
        Number(
            document.getElementById(
                "bathroomDisc"
            )?.value || 0
        );

    const ss =
        Number(
            document.getElementById(
                "stainlesssteelDisc"
            )?.value || 0
        );

    if (!window.itemMaster)
        return 0;

    const item =
        window.itemMaster[code];

    if (!item)
        return 0;

    const cat =
        (item.category || "")
            .toLowerCase()
            .trim();

    if (cat.includes("hardware"))
        return h;

    if (cat.includes("bathroom"))
        return b;

    // ✅ STAINLESS STEEL
    if (cat.includes("stainlesssteel"))
        return ss;

    return 0;
}

/* ======================================================
   POPULATE UNIT + RATE BY CODE
====================================================== */
function populateByCode(tr, code, preferredUnit = "") {
    if (!window.itemMaster) return;
    const item = window.itemMaster[code];
    if (!item || !item.units) return;

    const units = Object.keys(item.units);
    if (!units.length) return;

    // Name fill
    tr.querySelector(".name").value = item.name || "";

    // Unit dropdown fill
    const unitSelect = tr.querySelector(".unit");
    unitSelect.innerHTML = "";
    units.forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u;
        opt.textContent = u;
        unitSelect.appendChild(opt);
    });

    // Select unit
    const unitToUse = preferredUnit && item.units[preferredUnit] ? preferredUnit : units[0];
    unitSelect.value = unitToUse;

    // Rate set
    const rate = Number(item.units[unitToUse]?.rate || 0);
    tr.querySelector(".rate").value = rate.toFixed(2);
}

/* ======================================================
   ADD ITEM ROW
====================================================== */
window.addItemRow = function (item = {}) {
    const tr = document.createElement("tr");
    tr.classList.add("item-row");

    tr.innerHTML = `
    <td>
      <input class="code form-control" value="${item.code || ""}" placeholder="Code">
    </td>

    <td>
      <input class="name form-control" value="${item.name || ""}" placeholder="Item name">
    </td>

    <td>
      <input class="qty form-control" type="number" min="0" value="${item.qty || 0}">
    </td>

    <td>
      <select class="unit form-control"></select>
    </td>

    <td>
      <input class="rate form-control" type="number" value="${Number(item.rate || 0)}" readonly>
    </td>

    <td>
      <input class="total form-control" readonly value="0.00">
    </td>

    <td>
      <button class="btn btn-danger btn-sm" type="button"
        onclick="this.closest('tr').remove(); calcTotals()">X</button>
    </td>
  `;

    itemsBody.appendChild(tr);

    // Events
    const codeInput = tr.querySelector(".code");
    const nameInput = tr.querySelector(".name");
    const qtyInput = tr.querySelector(".qty");
    const unitSelect = tr.querySelector(".unit");

    codeInput.addEventListener("input", () => openSuggestFor(codeInput));
    nameInput.addEventListener("input", () => openSuggestFor(nameInput));
    qtyInput.addEventListener("input", () => calcTotals());
    unitSelect.addEventListener("change", () => updateRateOnUnitChange(tr));

    // Blur: manual exact match fill
    codeInput.addEventListener("blur", () => {
        const code = codeInput.value.trim().toUpperCase();
        if (code && window.itemMaster && window.itemMaster[code]) {
            populateByCode(tr, code, unitSelect.value);
            calcTotals();
        }
    });

    // If item already exists
    const code = (item.code || "").toString().trim().toUpperCase();
    if (code && window.itemMaster && window.itemMaster[code]) {
        populateByCode(tr, code, item.unit || "");
    } else {
        // default empty unit
        tr.querySelector(".unit").innerHTML = `<option value="">-</option>`;
    }

    calcTotals();
};

/* ======================================================
   TOTAL CALCULATION
====================================================== */
window.calcTotals = function () {
    let subtotal = 0;

    document.querySelectorAll(".item-row").forEach((row) => {
        const qty = Number(row.querySelector(".qty").value || 0);
        const rate = Number(row.querySelector(".rate").value || 0);

        const code = row.querySelector(".code").value.trim().toUpperCase();
        const catDisc = getCategoryDiscByCode(code);

        let total = qty * rate;
        if (catDisc > 0) total = total * (1 - catDisc / 100);

        row.querySelector(".total").value = total.toFixed(2);
        subtotal += total;
    });

    const freightVal = Number(freight.value || 0);
    const specialDisc = Number(specialDiscount.value || 0);
    const gstP = Number(gstPercent.value || 0);

    const after = subtotal + freightVal - specialDisc;
    const gstAmt = (after * gstP) / 100;

    subTotal.value = subtotal.toFixed(2);
    gstAmount.value = gstAmt.toFixed(2);
    grandTotal.value = (after + gstAmt).toFixed(2);
};

/* ======================================================
   UPDATE RATE WHEN UNIT CHANGE
====================================================== */
window.updateRateOnUnitChange = function (tr) {
    const code = tr.querySelector(".code").value.trim().toUpperCase();
    if (!window.itemMaster || !window.itemMaster[code]) return;

    const unit = tr.querySelector(".unit").value;
    const item = window.itemMaster[code];
    if (!item.units || !item.units[unit]) return;

    const rate = Number(item.units[unit].rate || 0);
    tr.querySelector(".rate").value = rate.toFixed(2);
    calcTotals();
};

/* ======================================================
   AUTOCOMPLETE SUGGESTIONS
====================================================== */
window.openSuggestFor = function (input) {
    const q = input.value.trim().toUpperCase();
    suggestBox.innerHTML = "";

    if (!q || !window.itemMaster) {
        suggestBox.style.display = "none";
        return;
    }

    const matches = Object.entries(window.itemMaster).filter(([code, item]) => {
        const name = (item?.name || "").toUpperCase();
        return code.startsWith(q) || name.includes(q);
    });

    if (!matches.length) {
        suggestBox.style.display = "none";
        return;
    }

    matches.slice(0, 25).forEach(([code, item]) => {
        if (!item?.units) return;

        const units = Object.keys(item.units);
        if (!units.length) return;

        const firstUnit = units[0];
        const rate = Number(item.units[firstUnit]?.rate || 0);

        const div = document.createElement("div");
        div.innerHTML = `<strong>${code}</strong> — ${item.name} (₹${rate})`;
        div.style.padding = "6px 10px";
        div.style.cursor = "pointer";
        div.style.borderBottom = "1px solid #eee";

        div.onclick = () => {
            const tr = input.closest("tr");
            tr.querySelector(".code").value = code;
            populateByCode(tr, code, "");
            suggestBox.style.display = "none";
            calcTotals();
        };

        suggestBox.appendChild(div);
    });

    const rect = input.getBoundingClientRect();
    suggestBox.style.left = rect.left + window.scrollX + "px";
    suggestBox.style.top = rect.bottom + window.scrollY + "px";
    suggestBox.style.width = rect.width + "px";
    suggestBox.style.display = "block";
};

document.addEventListener("click", (e) => {
    if (!e.target.closest("#suggestBox") && !e.target.classList.contains("code") && !e.target.classList.contains("name")) {
        suggestBox.style.display = "none";
    }
});
 
/* ======================================================
   UPDATE ORDER - FIXED FOR PRODUCTS + ORDERS
====================================================== */
window.updateOrder = async function () {
    try {
        // Basic validation
        if (!partyName.value.trim()) {
            alert("❌ Party Name required");
            partyName.focus();
            return;
        }

        if ((orderStatus.value === "Cancelled" || orderStatus.value === "Hold") && (!window.cancelReason || window.cancelReason === "")) {
            alert("❌ Please enter reason first");
            return;
        }

        const items = [...document.querySelectorAll(".item-row")].map((row) => ({
            code: row.querySelector(".code").value.trim().toUpperCase(),
            name: row.querySelector(".name").value.trim(),
            qty: Number(row.querySelector(".qty").value || 0),
            unit: row.querySelector(".unit").value,
            rate: Number(row.querySelector(".rate").value || 0),
            amount: Number(row.querySelector(".total").value || 0),
        })).filter(i => i.code || i.name);

        if (!items.length) {
            alert("❌ At least 1 item required");
            return;
        }

        // Correct collection selection
        const collectionName = source.toLowerCase().includes("product") ? "products" : "orders";

        // Try doc by ID first
        let ref = doc(db, collectionName, orderId);
        let snap = await getDoc(ref);

        // Fallback to orderNo search if ID not found
        if (!snap.exists()) {
            const q = query(collection(db, collectionName), where("orderNo", "==", orderId));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) ref = querySnap.docs[0].ref;
            else {
                alert("❌ Order Not Found");
                return;
            }
        }

        await updateDoc(ref, {
            status: orderStatus.value,
            cancelRemark: (orderStatus.value === "Cancelled" || orderStatus.value === "Hold") ? window.cancelReason : "",
            party: {
                name: partyName.value.trim(),
                mobile: partyMobile.value.trim(),
                address: partyAddress.value.trim(),
                gst: partyGST.value.trim(),
                type: partyType.value,
            },
            items,
            categoryDiscounts: {
                hardware: Number(document.getElementById("hardwareDisc")?.value || 0),
                bathroom: Number(document.getElementById("bathroomDisc")?.value || 0),
                stainlesssteel: Number(document.getElementById("stainlesssteelDisc")?.value || 0),
            },
            freight: Number(freight.value || 0),
            specialDiscount: Number(specialDiscount.value || 0),
            gstPercent: Number(gstPercent.value || 0),
            subTotal: Number(subTotal.value || 0),
            gstAmount: Number(gstAmount.value || 0),
            grandTotal: Number(grandTotal.value || 0),
            updatedAt: new Date().toISOString(),
        });

        await addDoc(collection(db, "order_activities"), {
            orderId: orderId,
            orderNo: orderNo.value,
            action: "updated",
            message: `${localStorage.getItem("user_name") || "User"} updated order ${orderNo.value} and changed status to ${orderStatus.value}`,
            user: localStorage.getItem("user_name") || "Unknown",
            role: localStorage.getItem("user_role") || "unknown",
            timestamp: serverTimestamp(),
        });

        alert("✅ Order Updated Successfully!");

        const role = localStorage.getItem("user_role");
        if (role === "admin") location.href = "/admin-dashboard.html";
        else if (role === "sales") location.href = "/sales-dashboard.html";
        else location.href = "/login.html";

    } catch (err) {
        console.error(err);
        alert("❌ Update failed. Check console.");
    }
};

/* ======================================================
   VIEW MODE (READ ONLY)
====================================================== */
function applyViewMode() {
    if (MODE !== "view") return;

    // Disable all inputs/selects
    editArea.querySelectorAll("input, select, textarea, button").forEach((el) => {
        // allow scroll, but block edits
        if (el.tagName.toLowerCase() === "button") el.style.display = "none";
        else el.setAttribute("disabled", true);
    });

    // Banner
    const banner = document.createElement("div");
    banner.innerHTML = "🔍 Viewing Order (Read Only)";
    banner.style.cssText = `
    background:#fff3cd;
    padding:10px;
    border:1px solid #ffeeba;
    margin-bottom:10px;
    font-weight:bold;
    border-radius:8px;
  `;
    editArea.prepend(banner);
}

/* ======================================================
   DARK MODE (simple)
====================================================== */
window.toggleDarkMode = function () {
    document.body.classList.toggle("dark");
};


const cancelRemarkModal =
    document.getElementById("cancelRemarkModal");

const cancelRemarkInput =
    document.getElementById("cancelRemark");

orderStatus.addEventListener(
    "change",
    function () {

        if (
            (orderStatus.value === "Cancelled"
                ||
                orderStatus.value === "Hold")
            &&
            (!window.cancelReason || window.cancelReason === "")
        ) {

            window.cancelReason = "";

            cancelRemarkModal.style.display = "flex";

            cancelRemarkInput.value = "";

        }

    }
);

window.closeCancelPopup = function () {
    cancelRemarkModal.style.display = "none";
    orderStatus.value = "Pending";
    window.cancelReason = "";
};

window.confirmCancelRemark = function () {
    const remark = cancelRemarkInput.value.trim();

    if (!remark) {
        alert("❌ Please enter reason");
        cancelRemarkInput.focus();
        return;
    }

    window.cancelReason = remark;
    cancelRemarkModal.style.display = "none";
};

async function checkOrderSource() {
    const sources = ["orders", "products"];
    
    for (let s of sources) {
        const ref = doc(db, s, orderId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            console.log(`✅ Found in ${s} collection`, snap.data());
        } else {
            console.warn(`❌ Not found in ${s}`);
        }
    }
}