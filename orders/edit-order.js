/* ======================================================
   EDIT ORDER JS - PETRO OMS
   Fixed:
   - Admin / Super Admin / Manager / Sales session support
   - No unwanted logout after update
   - Orders + Products source auto-detect
   - Party data compatible with old + new structure
   - Cancel / Hold reason fixed
   - Logout function added
   - Dark mode localStorage added
   - Safer redirect after update
====================================================== */

/* ======================================================
   FIREBASE IMPORTS
====================================================== */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";

import {
    getFirestore,
    doc,
    getDoc,
    updateDoc,
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

import {
    getAuth,
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

/* ======================================================
   FIREBASE CONFIG
====================================================== */

const firebaseConfig = {
    apiKey: "AIzaSyCdfQu5GCsBCyMHM7HX8GRzY-VTZaEMU5M",
    authDomain: "petro-oms.firebaseapp.com",
    projectId: "petro-oms",
    storageBucket: "petro-oms.firebasestorage.app",
    messagingSenderId: "562472760628",
    appId: "1:562472760628:web:3b4f4eda2c862b6e3ce161"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* ======================================================
   URL PARAMS
====================================================== */

const params = new URLSearchParams(window.location.search);

const orderId = params.get("id");

const source = params.get("source") || "orders";

const MODE = String(params.get("mode") || "edit").toLowerCase();

let currentOrderRef = null;
let currentCollectionName = "";
let loadedOrderData = null;
let previousStatusValue = "Pending";

window.cancelReason = "";

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

const cancelRemarkModal = document.getElementById("cancelRemarkModal");
const cancelRemarkInput = document.getElementById("cancelRemark");

/* ======================================================
   PAGE INIT
====================================================== */

if (!orderId) {

    alert("❌ Invalid Order ID");

    redirectBack();

} else {

    if (checkSession()) {

        setNavbarUserName();
        restoreDarkMode();
        bindStatusPopup();

        loadOrder();

    }

}

/* ======================================================
   SESSION CHECK
====================================================== */

function checkSession() {

    const hasAdmin =
        localStorage.getItem("adminEmail") ||
        localStorage.getItem("adminName") ||
        localStorage.getItem("loggedAdmin");

    const hasUser =
        localStorage.getItem("user_email") ||
        localStorage.getItem("user_name") ||
        localStorage.getItem("user_role");

    const hasSales =
        localStorage.getItem("salesman") ||
        localStorage.getItem("loggedSalesman");

    if (!hasAdmin && !hasUser && !hasSales) {

        alert("Please login first.");

        window.location.href = "/login.html";

        return false;

    }

    const loginTime =
        localStorage.getItem("loginTime");

    const SESSION_TIME =
        24 * 60 * 60 * 1000;

    if (loginTime) {

        const isExpired =
            Date.now() - Number(loginTime) > SESSION_TIME;

        if (isExpired) {

            clearLoginSession();

            alert("Session expired. Please login again.");

            window.location.href = "/login.html";

            return false;

        }

    } else {

        localStorage.setItem("loginTime", String(Date.now()));

    }

    return true;

}

function getCurrentRole() {

    const role =
        localStorage.getItem("user_role") ||
        localStorage.getItem("adminRole") ||
        "";

    let normalizedRole =
        String(role)
            .toLowerCase()
            .trim()
            .replace(/-/g, "_")
            .replace(/\s+/g, "_");

    if (!normalizedRole) {

        if (
            localStorage.getItem("salesman") ||
            localStorage.getItem("loggedSalesman")
        ) {
            normalizedRole = "sales";
        }

    }

    return normalizedRole;

}

/* ======================================================
   NAVBAR USER
====================================================== */

function setNavbarUserName() {

    const adminNameEl =
        document.getElementById("adminName");

    if (!adminNameEl) return;

    const name =
        localStorage.getItem("adminName") ||
        localStorage.getItem("user_name") ||
        localStorage.getItem("salesman") ||
        localStorage.getItem("loggedSalesman") ||
        "User";

    adminNameEl.innerText = name;

}

/* ======================================================
   STATUS NORMALIZER
====================================================== */

function normalizeStatus(status) {

    const text =
        String(status || "")
            .trim()
            .toLowerCase();

    if (text.includes("quotation")) return "Quotation Sent";

    if (text.includes("payment")) return "Payment Received";

    if (text.includes("partial")) return "Partial Delivered";

    if (text.includes("delivered")) return "Delivered";

    if (text.includes("cancel")) return "Cancelled";

    if (text.includes("hold")) return "Hold";

    return "Pending";

}

/* ======================================================
   LOAD ORDER
====================================================== */

async function loadOrder() {

    try {

        showLoader(true);

        const result =
            await resolveOrderRef();

        if (!result) {

            alert("❌ Order Not Found");

            redirectBack();

            return;

        }

        currentOrderRef = result.ref;
        currentCollectionName = result.collectionName;
        loadedOrderData = result.data;

        const o = loadedOrderData;

        orderNo.value =
            o.orderNo ||
            o.partyDetails?.orderNo ||
            orderId ||
            "";

        orderStatus.value =
            normalizeStatus(o.status || "Pending");

        previousStatusValue =
            orderStatus.value;

        window.cancelReason =
            o.cancelRemark || "";

        const party =
            o.party ||
            o.partyDetails ||
            {};

        partyName.value =
            o.partyName ||
            party.name ||
            party.partyName ||
            "";

        partyMobile.value =
            o.mobile ||
            party.mobile ||
            party.phone ||
            "";

        partyAddress.value =
            o.address ||
            party.address ||
            "";

        partyGST.value =
            o.gst ||
            party.gst ||
            party.gstNumber ||
            "";

        partyType.value =
            o.partyType ||
            party.type ||
            party.partyType ||
            "";

        freight.value =
            Number(o.freight || 0);

        specialDiscount.value =
            Number(o.specialDiscount || 0);

        gstPercent.value =
            Number(o.gstPercent || 0);

        const hDisc =
            document.getElementById("hardwareDisc");

        const bDisc =
            document.getElementById("bathroomDisc");

        const ssDisc =
            document.getElementById("stainlesssteelDisc");

        if (hDisc) {
            hDisc.value =
                Number(o.categoryDiscounts?.hardware || 0);
        }

        if (bDisc) {
            bDisc.value =
                Number(o.categoryDiscounts?.bathroom || 0);
        }

        if (ssDisc) {
            ssDisc.value =
                Number(o.categoryDiscounts?.stainlesssteel || 0);
        }

        itemsBody.innerHTML = "";

        const rawItems =
            o.items ||
            o.cartItems ||
            o.orderItems ||
            o.productList ||
            o.cart ||
            [];

        if (Array.isArray(rawItems) && rawItems.length) {

            rawItems.forEach(function (item) {

                addItemRow(normalizeItem(item));

            });

        } else {

            addItemRow();

        }

        calcTotals();

        showLoader(false);

        editArea.style.display = "block";

        applyViewMode();

    } catch (error) {

        console.error("Load Order Error:", error);

        alert("❌ Failed to load order. Check console.");

        showLoader(false);

    }

}

async function resolveOrderRef() {

    const requestedCollection =
        source.toLowerCase().includes("product")
            ? "products"
            : "orders";

    const collectionsToCheck =
        requestedCollection === "products"
            ? ["products", "orders"]
            : ["orders", "products"];

    for (const colName of collectionsToCheck) {

        const directRef =
            doc(db, colName, orderId);

        const directSnap =
            await getDoc(directRef);

        if (directSnap.exists()) {

            return {
                ref: directRef,
                collectionName: colName,
                data: directSnap.data()
            };

        }

    }

    for (const colName of collectionsToCheck) {

        const q1 =
            query(
                collection(db, colName),
                where("orderNo", "==", orderId)
            );

        const q1Snap =
            await getDocs(q1);

        if (!q1Snap.empty) {

            const docSnap =
                q1Snap.docs[0];

            return {
                ref: docSnap.ref,
                collectionName: colName,
                data: docSnap.data()
            };

        }

        const q2 =
            query(
                collection(db, colName),
                where("partyDetails.orderNo", "==", orderId)
            );

        const q2Snap =
            await getDocs(q2);

        if (!q2Snap.empty) {

            const docSnap =
                q2Snap.docs[0];

            return {
                ref: docSnap.ref,
                collectionName: colName,
                data: docSnap.data()
            };

        }

    }

    return null;

}

function normalizeItem(item = {}) {

    return {
        code:
            item.code ||
            item.itemCode ||
            item.productCode ||
            "",

        name:
            item.name ||
            item.itemName ||
            item.productName ||
            "",

        qty:
            item.qty ??
            item.quantity ??
            0,

        unit:
            item.unit ||
            item.selectedUnit ||
            "",

        rate:
            item.rate ??
            item.price ??
            0,

        amount:
            item.amount ??
            item.total ??
            0
    };

}

/* ======================================================
   ADD ITEM ROW
====================================================== */

window.addItemRow = function (item = {}) {

    const tr =
        document.createElement("tr");

    tr.classList.add("item-row");

    tr.innerHTML = `
        <td>
            <input class="code form-control" value="${escapeAttr(item.code || "")}" placeholder="Code">
        </td>

        <td>
            <input class="name form-control" value="${escapeAttr(item.name || "")}" placeholder="Item name">
        </td>

        <td>
            <input class="qty form-control" type="number" min="0" value="${Number(item.qty || 0)}">
        </td>

        <td>
            <select class="unit form-control"></select>
        </td>

        <td>
            <input class="rate form-control" type="number" value="${Number(item.rate || 0).toFixed(2)}" readonly>
        </td>

        <td>
            <input class="total form-control" readonly value="0.00">
        </td>

        <td>
            <button class="btn btn-danger btn-sm" type="button"
                onclick="this.closest('tr').remove(); calcTotals();">
                X
            </button>
        </td>
    `;

    itemsBody.appendChild(tr);

    const codeInput =
        tr.querySelector(".code");

    const nameInput =
        tr.querySelector(".name");

    const qtyInput =
        tr.querySelector(".qty");

    const unitSelect =
        tr.querySelector(".unit");

    codeInput.addEventListener("input", function () {
        openSuggestFor(codeInput);
    });

    nameInput.addEventListener("input", function () {
        openSuggestFor(nameInput);
    });

    qtyInput.addEventListener("input", function () {
        calcTotals();
    });

    unitSelect.addEventListener("change", function () {
        updateRateOnUnitChange(tr);
    });

    codeInput.addEventListener("blur", function () {

        const code =
            codeInput.value.trim().toUpperCase();

        if (
            code &&
            window.itemMaster &&
            window.itemMaster[code]
        ) {

            populateByCode(
                tr,
                code,
                unitSelect.value
            );

            calcTotals();

        }

    });

    const code =
        String(item.code || "")
            .trim()
            .toUpperCase();

    if (
        code &&
        window.itemMaster &&
        window.itemMaster[code]
    ) {

        populateByCode(
            tr,
            code,
            item.unit || ""
        );

    } else {

        const unit =
            item.unit || "";

        unitSelect.innerHTML =
            `<option value="${escapeAttr(unit)}">${escapeHTML(unit || "-")}</option>`;

    }

    calcTotals();

};

/* ======================================================
   PRODUCT MASTER HELPERS
====================================================== */

function populateByCode(tr, code, preferredUnit = "") {

    if (!window.itemMaster) return;

    const item =
        window.itemMaster[code];

    if (!item || !item.units) return;

    const units =
        Object.keys(item.units);

    if (!units.length) return;

    const nameInput =
        tr.querySelector(".name");

    const unitSelect =
        tr.querySelector(".unit");

    const rateInput =
        tr.querySelector(".rate");

    if (nameInput) {
        nameInput.value = item.name || "";
    }

    unitSelect.innerHTML = "";

    units.forEach(function (unit) {

        const opt =
            document.createElement("option");

        opt.value = unit;
        opt.textContent = unit;

        unitSelect.appendChild(opt);

    });

    const unitToUse =
        preferredUnit &&
        item.units[preferredUnit]
            ? preferredUnit
            : units[0];

    unitSelect.value =
        unitToUse;

    const rate =
        Number(item.units[unitToUse]?.rate || 0);

    rateInput.value =
        rate.toFixed(2);

}

window.updateRateOnUnitChange = function (tr) {

    const code =
        tr.querySelector(".code")
            .value
            .trim()
            .toUpperCase();

    if (
        !window.itemMaster ||
        !window.itemMaster[code]
    ) {
        return;
    }

    const unit =
        tr.querySelector(".unit").value;

    const item =
        window.itemMaster[code];

    if (!item.units || !item.units[unit]) return;

    const rate =
        Number(item.units[unit].rate || 0);

    tr.querySelector(".rate").value =
        rate.toFixed(2);

    calcTotals();

};

function getCategoryDiscByCode(code) {

    const h =
        Number(document.getElementById("hardwareDisc")?.value || 0);

    const b =
        Number(document.getElementById("bathroomDisc")?.value || 0);

    const ss =
        Number(document.getElementById("stainlesssteelDisc")?.value || 0);

    if (!window.itemMaster) return 0;

    const item =
        window.itemMaster[code];

    if (!item) return 0;

    const category =
        String(item.category || "")
            .toLowerCase()
            .replace(/\s+/g, "")
            .trim();

    if (category.includes("hardware")) return h;

    if (category.includes("bathroom")) return b;

    if (
        category.includes("stainlesssteel") ||
        category.includes("ss")
    ) {
        return ss;
    }

    return 0;

}

/* ======================================================
   TOTAL CALCULATION
====================================================== */

window.calcTotals = function () {

    let subtotal = 0;

    document.querySelectorAll(".item-row").forEach(function (row) {

        const qty =
            Number(row.querySelector(".qty")?.value || 0);

        const rate =
            Number(row.querySelector(".rate")?.value || 0);

        const code =
            row.querySelector(".code")
                ?.value
                .trim()
                .toUpperCase() || "";

        const discount =
            getCategoryDiscByCode(code);

        let total =
            qty * rate;

        if (discount > 0) {
            total = total * (1 - discount / 100);
        }

        row.querySelector(".total").value =
            total.toFixed(2);

        subtotal += total;

    });

    const freightValue =
        Number(freight.value || 0);

    const specialDiscountValue =
        Number(specialDiscount.value || 0);

    const gstValue =
        Number(gstPercent.value || 0);

    const taxableAmount =
        Math.max(
            0,
            subtotal + freightValue - specialDiscountValue
        );

    const gstAmountValue =
        (taxableAmount * gstValue) / 100;

    subTotal.value =
        subtotal.toFixed(2);

    gstAmount.value =
        gstAmountValue.toFixed(2);

    grandTotal.value =
        (taxableAmount + gstAmountValue).toFixed(2);

};

/* ======================================================
   AUTOCOMPLETE
====================================================== */

window.openSuggestFor = function (input) {

    const q =
        input.value.trim().toUpperCase();

    suggestBox.innerHTML = "";

    if (!q || !window.itemMaster) {

        suggestBox.style.display = "none";

        return;

    }

    const matches =
        Object.entries(window.itemMaster)
            .filter(function ([code, item]) {

                const name =
                    String(item?.name || "").toUpperCase();

                return (
                    code.startsWith(q) ||
                    name.includes(q)
                );

            });

    if (!matches.length) {

        suggestBox.style.display = "none";

        return;

    }

    matches.slice(0, 25).forEach(function ([code, item]) {

        if (!item?.units) return;

        const units =
            Object.keys(item.units);

        if (!units.length) return;

        const firstUnit =
            units[0];

        const rate =
            Number(item.units[firstUnit]?.rate || 0);

        const div =
            document.createElement("div");

        div.innerHTML =
            `<strong>${escapeHTML(code)}</strong> — ${escapeHTML(item.name || "")} (₹${rate})`;

        div.style.padding = "6px 10px";
        div.style.cursor = "pointer";
        div.style.borderBottom = "1px solid #eee";

        div.onclick = function () {

            const tr =
                input.closest("tr");

            tr.querySelector(".code").value =
                code;

            populateByCode(
                tr,
                code,
                ""
            );

            suggestBox.style.display =
                "none";

            calcTotals();

        };

        suggestBox.appendChild(div);

    });

    const rect =
        input.getBoundingClientRect();

    suggestBox.style.left =
        rect.left + window.scrollX + "px";

    suggestBox.style.top =
        rect.bottom + window.scrollY + "px";

    suggestBox.style.width =
        rect.width + "px";

    suggestBox.style.display =
        "block";

};

document.addEventListener("click", function (e) {

    if (
        !e.target.closest("#suggestBox") &&
        !e.target.classList.contains("code") &&
        !e.target.classList.contains("name")
    ) {

        suggestBox.style.display =
            "none";

    }

});

/* ======================================================
   UPDATE ORDER
====================================================== */

window.updateOrder = async function () {

    if (MODE === "view") {
        alert("This order is in view mode.");
        return;
    }

    try {

        if (!currentOrderRef) {

            alert("❌ Order reference not found. Please reload page.");

            return;

        }

        if (!partyName.value.trim()) {

            alert("❌ Party Name required");

            partyName.focus();

            return;

        }

        const statusValue =
            orderStatus.value;

        if (
            (statusValue === "Cancelled" || statusValue === "Hold") &&
            (!window.cancelReason || !window.cancelReason.trim())
        ) {

            openCancelPopup();

            alert("❌ Please enter reason first.");

            return;

        }

        const items =
            [...document.querySelectorAll(".item-row")]
                .map(function (row) {

                    return {
                        code:
                            row.querySelector(".code")
                                .value
                                .trim()
                                .toUpperCase(),

                        name:
                            row.querySelector(".name")
                                .value
                                .trim(),

                        qty:
                            Number(row.querySelector(".qty").value || 0),

                        unit:
                            row.querySelector(".unit").value,

                        rate:
                            Number(row.querySelector(".rate").value || 0),

                        amount:
                            Number(row.querySelector(".total").value || 0)
                    };

                })
                .filter(function (item) {
                    return item.code || item.name;
                });

        if (!items.length) {

            alert("❌ At least 1 item required.");

            return;

        }

        const partyPayload = {
            name: partyName.value.trim(),
            partyName: partyName.value.trim(),
            mobile: partyMobile.value.trim(),
            address: partyAddress.value.trim(),
            gst: partyGST.value.trim(),
            type: partyType.value,
            partyType: partyType.value
        };

        const payload = {
            status: statusValue,

            cancelRemark:
                statusValue === "Cancelled" || statusValue === "Hold"
                    ? window.cancelReason.trim()
                    : "",

            party: partyPayload,

            partyDetails: partyPayload,

            partyName: partyName.value.trim(),
            mobile: partyMobile.value.trim(),
            address: partyAddress.value.trim(),
            gst: partyGST.value.trim(),
            partyType: partyType.value,

            items: items,
            cartItems: items,
            orderItems: items,

            categoryDiscounts: {
                hardware:
                    Number(document.getElementById("hardwareDisc")?.value || 0),

                bathroom:
                    Number(document.getElementById("bathroomDisc")?.value || 0),

                stainlesssteel:
                    Number(document.getElementById("stainlesssteelDisc")?.value || 0)
            },

            freight:
                Number(freight.value || 0),

            specialDiscount:
                Number(specialDiscount.value || 0),

            gstPercent:
                Number(gstPercent.value || 0),

            subTotal:
                Number(subTotal.value || 0),

            gstAmount:
                Number(gstAmount.value || 0),

            grandTotal:
                Number(grandTotal.value || 0),

            updatedAt:
                serverTimestamp()
        };

        await updateDoc(
            currentOrderRef,
            payload
        );

        await addDoc(
            collection(db, "order_activities"),
            {
                orderId: orderId,
                orderNo: orderNo.value,
                source: currentCollectionName,
                action: "updated",
                message:
                    `${getCurrentUserName()} updated order ${orderNo.value} and changed status to ${statusValue}`,
                user: getCurrentUserName(),
                role: getCurrentRole() || "unknown",
                timestamp: serverTimestamp()
            }
        );

        alert("✅ Order Updated Successfully!");

        redirectAfterUpdate();

    } catch (error) {

        console.error("Update Error:", error);

        alert("❌ Update failed. Check console.");

    }

};

/* ======================================================
   REDIRECT AFTER UPDATE
====================================================== */

function redirectAfterUpdate() {

    const role =
        getCurrentRole();

    if (
        role === "admin" ||
        role === "super_admin" ||
        role === "manager"
    ) {

        window.location.href =
            "/admin-dashboard.html";

        return;

    }

    if (role === "sales") {

        window.location.href =
            "/sales-dashboard.html";

        return;

    }

    alert("Session role not found. Please login again.");

    window.location.href =
        "/login.html";

}

function redirectBack() {

    const role =
        getCurrentRole();

    if (
        role === "admin" ||
        role === "super_admin" ||
        role === "manager"
    ) {

        window.location.href =
            "/admin-dashboard.html";

        return;

    }

    if (role === "sales") {

        window.location.href =
            "/sales-dashboard.html";

        return;

    }

    window.location.href =
        "/login.html";

}

/* ======================================================
   CANCEL / HOLD REASON POPUP
====================================================== */

function bindStatusPopup() {

    if (!orderStatus) return;

    orderStatus.addEventListener("focus", function () {

        previousStatusValue =
            orderStatus.value || "Pending";

    });

    orderStatus.addEventListener("change", function () {

        const value =
            orderStatus.value;

        if (
            value === "Cancelled" ||
            value === "Hold"
        ) {

            if (!window.cancelReason) {

                openCancelPopup();

            }

        } else {

            window.cancelReason =
                "";

        }

    });

}

function openCancelPopup() {

    if (!cancelRemarkModal || !cancelRemarkInput) return;

    cancelRemarkModal.style.display =
        "flex";

    cancelRemarkInput.value =
        window.cancelReason || "";

    setTimeout(function () {
        cancelRemarkInput.focus();
    }, 100);

}

window.closeCancelPopup = function () {

    if (cancelRemarkModal) {
        cancelRemarkModal.style.display = "none";
    }

    if (orderStatus) {
        orderStatus.value = previousStatusValue || "Pending";
    }

    window.cancelReason =
        "";

};

window.confirmCancelRemark = function () {

    const remark =
        cancelRemarkInput.value.trim();

    if (!remark) {

        alert("❌ Please enter reason.");

        cancelRemarkInput.focus();

        return;

    }

    window.cancelReason =
        remark;

    previousStatusValue =
        orderStatus.value;

    cancelRemarkModal.style.display =
        "none";

};

/* ======================================================
   VIEW MODE
====================================================== */

function applyViewMode() {

    if (MODE !== "view") return;

    editArea.querySelectorAll("input, select, textarea, button")
        .forEach(function (el) {

            if (el.tagName.toLowerCase() === "button") {
                el.style.display = "none";
            } else {
                el.setAttribute("disabled", true);
            }

        });

    const banner =
        document.createElement("div");

    banner.innerHTML =
        "🔍 Viewing Order (Read Only)";

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
   DARK MODE
====================================================== */

window.toggleDarkMode = function () {

    document.body.classList.toggle("dark");

    localStorage.setItem(
        "petro_dark",
        document.body.classList.contains("dark")
            ? "true"
            : "false"
    );

};

function restoreDarkMode() {

    const isDark =
        localStorage.getItem("petro_dark") === "true";

    const toggle =
        document.getElementById("darkToggle");

    if (isDark) {

        document.body.classList.add("dark");

        if (toggle) {
            toggle.checked = true;
        }

    }

}

/* ======================================================
   LOGOUT
====================================================== */

window.logoutUser = async function () {

    clearLoginSession();

    try {

        await signOut(auth);

    } catch (error) {

        console.warn("Firebase logout skipped:", error);

    }

    window.location.href =
        "/login.html";

};

window.logout = window.logoutUser;

function clearLoginSession() {

    const rememberedEmail =
        localStorage.getItem("petro_admin_saved_email");

    localStorage.removeItem("adminUid");
    localStorage.removeItem("adminEmail");
    localStorage.removeItem("adminName");
    localStorage.removeItem("adminRole");
    localStorage.removeItem("adminStatus");
    localStorage.removeItem("adminDocId");
    localStorage.removeItem("loggedAdmin");

    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");

    localStorage.removeItem("salesman");
    localStorage.removeItem("loggedSalesman");
    localStorage.removeItem("prefix");

    localStorage.removeItem("loginTime");
    localStorage.removeItem("firebaseAuthLogin");

    if (rememberedEmail) {
        localStorage.setItem("petro_admin_saved_email", rememberedEmail);
    }

}

/* ======================================================
   HELPERS
====================================================== */

function getCurrentUserName() {

    return (
        localStorage.getItem("adminName") ||
        localStorage.getItem("user_name") ||
        localStorage.getItem("salesman") ||
        localStorage.getItem("loggedSalesman") ||
        "User"
    );

}

function showLoader(show) {

    if (loader) {
        loader.style.display = show ? "block" : "none";
    }

    if (!show && editArea) {
        editArea.style.display = "block";
    }

}

function escapeAttr(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

function escapeHTML(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

/* ======================================================
   DEBUG SOURCE CHECK - OPTIONAL
====================================================== */

window.checkOrderSource = async function () {

    if (!orderId) return;

    const sources =
        ["orders", "products"];

    for (const s of sources) {

        const ref =
            doc(db, s, orderId);

        const snap =
            await getDoc(ref);

        if (snap.exists()) {
            console.log(`✅ Found in ${s}`, snap.data());
        } else {
            console.warn(`❌ Not found in ${s}`);
        }

    }

};