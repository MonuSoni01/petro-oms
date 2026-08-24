import {
    initializeApp
}
    from
    "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";

import {
    getFirestore,
    collection,
    addDoc,
    setDoc,
    doc
}
    from
    "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// ================= FIREBASE INIT =================

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

// Check if the current page is not 'cart-page'
if (!document.body.classList.contains('main-page')) {
    // This code will run only if the current page is NOT the cart-page page
    if (typeof itemMaster === "undefined") {
        alert("❌ Item Master not loaded. Please refresh.");
    }
}

const salesman = document.getElementById("salesman");

const orderNo = document.getElementById("orderNo");
const orderDate = document.getElementById("orderDate");
// ✅ AUTO SET TODAY DATE

if (orderDate && !orderDate.value) {

    const today = new Date();

    const yyyy = today.getFullYear();

    const mm = String(
        today.getMonth() + 1
    ).padStart(2, "0");

    const dd = String(
        today.getDate()
    ).padStart(2, "0");

    orderDate.value =
        `${yyyy}-${mm}-${dd}`;
}
const partyName = document.getElementById("partyName");
const partyType = document.getElementById("partyType");
const partyCity = document.getElementById("partyCity");
const partyGST = document.getElementById("partyGST");
const partyMobile = document.getElementById("partyMobile");
const distributor = document.getElementById("distributor");
const orderNotes = document.getElementById("orderNotes");

const tbody = document.getElementById('tbody');
// const money = n => (Number(n) || 0).toFixed(2);

const SALESMAN_PREFIX = {
    "Sariya Murtuza": "SM",
    "Roshan Sharma": "RS",
    "Amit Soni": "AS",
    "Ankit Kalra": "AK",
    "Vivek Srivastava": "VS",
    "Rup Ranjan Bora": "RRB",
    "Ashutosh Satapathy": "ASO",
};

// ================= SALESMAN → DISTRIBUTOR MAPPING =================
//
// Mapping is loaded from: Asm-Distributor.json
//
// Supported JSON formats:
// 1) { "Sariya Murtuza": ["Distributor A", "Distributor B"] }
// 2) { "Sariya Murtuza": [{"name":"Distributor A"}, {"name":"Distributor B"}] }
// 3) { "Sariya Murtuza": [{"distributor":"Distributor A"}] }

let asmDistributorMap = {};

async function loadAsmDistributorMap() {
    if (!distributor) return;

    try {
        const response = await fetch("./Asm-Distributor.json", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Asm-Distributor.json HTTP ${response.status}`);
        }

        asmDistributorMap = await response.json();

        populateDistributorDropdown(salesman?.value || "");

    } catch (error) {
        console.warn("Distributor mapping could not be loaded:", error);

        distributor.innerHTML =
            '<option value="">Distributor Mapping Not Loaded</option>';

        distributor.disabled = true;
    }
}

function normalizeDistributorList(value) {
    if (!Array.isArray(value)) return [];

    return value
        .map(item => {
            if (typeof item === "string") return item.trim();

            if (item && typeof item === "object") {
                return String(
                    item.name ??
                    item.distributor ??
                    item.distributorName ??
                    item.partyName ??
                    ""
                ).trim();
            }

            return "";
        })
        .filter(Boolean);
}

function populateDistributorDropdown(salesmanName, selectedValue = "") {
    if (!distributor) return;

    distributor.innerHTML = "";

    if (!salesmanName) {
        distributor.innerHTML =
            '<option value="">Select Salesman First</option>';

        distributor.disabled = true;
        return;
    }

    const list = normalizeDistributorList(
        asmDistributorMap?.[salesmanName]
    );

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent =
        list.length ? "Select Distributor" : "No Distributor Mapped";

    distributor.appendChild(defaultOption);

    list.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        distributor.appendChild(option);
    });

    distributor.disabled = list.length === 0;

    if (selectedValue && list.includes(selectedValue)) {
        distributor.value = selectedValue;
    }
}



function autoOrderNo() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    const fyCode = (d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1) % 100;
    const sm = salesman.value.trim();
    if (!sm || !SALESMAN_PREFIX[sm]) return "";
    const prefix = SALESMAN_PREFIX[sm];
    return `${prefix}-${fyCode}-${day}${month}-${hour}${minute}`;
}

if (salesman) {
    salesman.addEventListener("change", () => {

        const newOrderNo = autoOrderNo();

        if (orderNo) {
            orderNo.value = newOrderNo;
            orderNo.placeholder =
                newOrderNo || "Select Salesman to Generate Order No";
        }

        populateDistributorDropdown(salesman.value.trim());
    });
}


window.addRow = function (data = {}) {
    // Ensure tbody exists
    const tbody = document.getElementById('tbody');
    if (!tbody) {
        return;  // Exit if tbody doesn't exist
    }

    const idx = tbody.children.length + 1;

    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td class="petro-right"><span class="sr">${idx}</span></td>
        <td><input class="item-code" placeholder="Item Code" value="${data.code || ''}" oninput="lookupItem(this)"></td>
        <td><input class="item-name" placeholder="Item Name" value="${data.name || ''}" oninput="lookupItemByName(this)"></td>
        <td><input class="qty" type="number" min="0" step="1" value="${data.qty || 0}" oninput="recalc()"></td>
        <td>
            <select class="unit" onchange="updateRateOnUnitChange(this.closest('tr'))">
                <!-- Dynamically populate unit options here -->
            </select>
        </td>
        <td><input class="rate" type="number" min="0" step="0.01" value="${data.rate || 0}" oninput="recalc()" readonly></td> 
        <td class="petro-right"><strong class="amt">0.00</strong></td>
        <td class="no-print">
            <button class="petro-btn warn" onclick="removeRow(this)">Remove</button>
        </td>
    `;

    // Dynamically populate unit options based on the item code
    const unitSelect = tr.querySelector(".unit");
    const code = (data.code || '').trim().toUpperCase();
    if (itemMaster[code]) {
        const item = itemMaster[code];

        // Clear existing options
        unitSelect.innerHTML = "";

        // Add options for available units
        Object.keys(item.units).forEach(unit => {
            const option = document.createElement("option");
            option.value = unit;
            option.textContent = unit;
            unitSelect.appendChild(option);
        });
    }

    tbody.appendChild(tr);
    recalc();
}



// Ensure autoSave runs after checking if tbody exists
window.autoSave = function () {
    // Ensure tbody exists before calling collectData
    const tbody = document.getElementById('tbody');
    if (!tbody) {
        console.error("Table body (tbody) is not available, autoSave cannot proceed!");
        return;
    }

    const data = collectData();
    if (data.party && !data.party.type) {
        data.party.type = partyType.value || "";
    }
    localStorage.setItem("petro_order_auto_draft", JSON.stringify(data));
    // console.log("Updated");
}


window.updateRateOnUnitChange = function (tr) {
    const code = tr.querySelector(".item-code").value.trim().toUpperCase();
    if (!itemMaster[code]) return;

    const unit = tr.querySelector(".unit").value;
    const item = itemMaster[code];

    if (!item.units[unit]) return;

    tr.querySelector(".rate").value =
        item.units[unit].rate.toFixed(2);

    recalc();
}

function openSuggestFor(input) {
    const q = input.value.trim().toUpperCase();
    const box = document.getElementById("suggestBox");

    box.innerHTML = "";

    if (!q) {
        box.style.display = "none";
        return;
    }

    const matches = Object.entries(itemMaster).filter(([code, item]) =>
        code.startsWith(q) || item.name.toUpperCase().includes(q)
    );

    if (!matches.length) {
        box.style.display = "none";
        return;
    }

    matches.forEach(([code, item]) => {
        if (!item || !item.units) return;

        const units = Object.keys(item.units);
        if (!units.length) return;

        const rate = item.units[units[0]]?.rate ?? 0;


        const div = document.createElement("div");
        div.innerHTML = `<strong>${code}</strong> — ${item.name} (₹${rate})`;
        div.style.padding = "6px 10px";
        div.style.cursor = "pointer";

        div.onclick = () => {
            const tr = input.closest("tr");

            tr.querySelector(".item-code").value = code;
            tr.querySelector(".item-name").value = item.name;

            const unitSelect = tr.querySelector(".unit");
            unitSelect.innerHTML = "";

            units.forEach(u => {
                const opt = document.createElement("option");
                opt.value = u;
                opt.textContent = u;
                unitSelect.appendChild(opt);
            });

            unitSelect.value = units[0];
            tr.querySelector(".rate").value = rate.toFixed(2);

            box.style.display = "none";
            recalc();
        };

        box.appendChild(div);
    });

    const rect = input.getBoundingClientRect();
    box.style.left = (rect.left + window.scrollX) + "px";
    box.style.top = rect.bottom + window.scrollY + "px";
    box.style.display = "block";
}


window.lookupItem = function (input) {

    const tr = input.closest("tr");
    const code = input.value.trim().toUpperCase();

    // input ko uppercase me maintain rakhega
    input.value = code;

    const nameInput = tr.querySelector(".item-name");
    const unitSelect = tr.querySelector(".unit");
    const rateInput = tr.querySelector(".rate");
    const amtElement = tr.querySelector(".amt");

    openSuggestFor(input); // suggestion box same rahega

    // ✅ Agar exact item code match nahi hua to old data clear ho jayega
    if (!itemMaster[code]) {

        if (nameInput) nameInput.value = "";

        if (unitSelect) {
            unitSelect.innerHTML = "";
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "Select";
            unitSelect.appendChild(opt);
        }

        if (rateInput) rateInput.value = "0.00";

        if (amtElement) amtElement.textContent = "₹0.00";

        recalc();

        return;
    }

    // ✅ Sirf exact match hone par hi data fill hoga
    const item = itemMaster[code];

    nameInput.value = item.name;

    unitSelect.innerHTML = "";

    const units = Object.keys(item.units);

    units.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u;
        opt.textContent = u;
        unitSelect.appendChild(opt);
    });

    const defaultUnit = units[0];

    unitSelect.value = defaultUnit;

    rateInput.value = item.units[defaultUnit].rate.toFixed(2);

    recalc();
};


window.lookupItemByName = function (input) {
    const tr = input.closest("tr");
    const name = input.value.trim().toUpperCase();

    openSuggestFor(input);

    const entry = Object.entries(itemMaster).find(
        ([, item]) => item.name.toUpperCase().includes(name)
    );

    if (!entry) return;

    const [code, item] = entry;

    tr.querySelector(".item-code").value = code;
    tr.querySelector(".item-name").value = item.name;

    const unitSelect = tr.querySelector(".unit");
    unitSelect.innerHTML = "";

    const units = Object.keys(item.units);
    units.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u;
        opt.textContent = u;
        unitSelect.appendChild(opt);
    });

    const defaultUnit = units[0];
    unitSelect.value = defaultUnit;

    tr.querySelector(".rate").value =
        item.units[defaultUnit].rate.toFixed(2);

    recalc();
}

if (document.getElementById("tbody")) {
    document.addEventListener("click", (e) => {
        const box = document.getElementById("suggestBox");
        const isProductInteraction = e.target.closest("#suggestBox") ||
            e.target.classList.contains("item-code") ||
            e.target.classList.contains("item-name");

        if (!isProductInteraction) {
            box.style.display = "none";
        }
    });
}


window.removeRow = function (btn) {
    btn.closest('tr').remove();
    [...tbody.querySelectorAll('.sr')].forEach((el, i) => el.textContent = i + 1);
    recalc();
}

function getCategoryDiscByCode(code) {

    const h =
        +document.getElementById(
            "hardwareDisc"
        )?.value || 0;

    const b =
        +document.getElementById(
            "bathroomDisc"
        )?.value || 0;

    const ss =
        +document.getElementById(
            "stainlesssteelDisc"
        )?.value || 0;

    const item =
        itemMaster[code];

    if (!item || !item.category)
        return 0;

    const cat =
        item.category
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



window.submitTableOrder = async function () {

    const btn =
        document.getElementById("submitBtn");

    // ✅ SALESMAN VALIDATION

    const salesmanError =
        document.getElementById("salesmanError");

    // RESET

    salesman.style.border = "";
    salesmanError.style.display = "none";

    // CHECK

    if (!salesman.value.trim()) {

        salesman.style.border =
            "1.8px solid #dc3545";

        salesman.style.boxShadow =
            "0 0 0 3px rgba(220,53,69,0.15)";

        salesmanError.style.display =
            "block";

        salesman.focus();

        return;
    }

    // ✅ FUTURE DATE VALIDATION

    const today =
        new Date()
            .toISOString()
            .split("T")[0];

    if (orderDate.value > today) {

        alert(
            "❌ Future Date Not Allowed"
        );

        orderDate.focus();

        return;
    }
    // ✅ ORDER NO VALIDATION

    if (!orderNo.value.trim()) {

        alert("❌ Order Number Required");

        orderNo.focus();

        return;
    }

    // ✅ PARTY NAME VALIDATION

    if (!partyName.value.trim()) {

        alert("❌ Party Name Required");

        partyName.focus();

        return;
    }

    // ✅ PARTY TYPE VALIDATION

    if (!partyType.value.trim()) {

        alert("❌ Please Select Party Type");

        partyType.focus();

        return;
    }

    // ✅ PARTY MOBILE VALIDATION

    if (!partyMobile.value.trim()) {

        alert("❌ Party Mobile Number Required");

        partyMobile.focus();

        return;
    }

    if (!/^[0-9]{10}$/.test(partyMobile.value.trim())) {

        alert("❌ Mobile Number Must Be 10 Digits");

        partyMobile.focus();

        return;
    }

    try {

        btn.disabled = true;

        btn.innerText = "Saving...";

        const order =
            collectData();

        const validItems = (order.items || []).filter(
            item => item.code && item.qty > 0
        );

        if (validItems.length === 0) {
            alert("❌ Please add at least one valid item");
            return;
        }

        order.items = validItems;

        await addDoc(
            collection(db, "orders"),
            order
        );

        // FIRST ALERT

        const successPopup =
            document.getElementById("successPopup");

        successPopup.style.display = "flex";

        setTimeout(() => {

            successPopup.style.display = "none";

            // Keep the submitted order visible for printing.
            // resetOrderFormAfterSubmit() should be called by print/cancel flow if needed.
            openPrintModal();

        }, 2200);


    }

    catch (error) {

        console.error(error);

        alert("Error saving order");

    }

    finally {

        btn.disabled = false;

        btn.innerText =
            "Submit Order";

    }

};

function resetOrderFormAfterSubmit() {

    // ✅ Basic fields reset
    salesman.value = "";
    orderNo.value = "";
    orderNo.placeholder = "AUTO";

    const today = new Date().toISOString().split("T")[0];
    orderDate.value = today;

    partyName.value = "";
    partyType.value = "";
    partyCity.value = "";
    partyGST.value = "";
    partyMobile.value = "";
    if (distributor) {
        distributor.value = "";
        populateDistributorDropdown("");
    }
    orderNotes.value = "";

    // ✅ Discount / totals reset
    document.getElementById("hardwareDisc").value = 0;
    document.getElementById("bathroomDisc").value = 0;
    document.getElementById("stainlesssteelDisc").value = 0;

    freightEl.value = 0;
    specialDiscount.value = 0;
    gstPercent.value = 18;

    // ✅ Table reset
    tbody.innerHTML = "";
    addRow();

    // ✅ Totals reset
    recalc();

    // ✅ Draft / autosave clear
    localStorage.removeItem("petro_order_draft");
    localStorage.removeItem("petro_order_auto_draft");
    localStorage.removeItem("petro_order_data");
    localStorage.removeItem("cart");

    // ✅ Status message update
    const status = document.getElementById("statusMsg");
    if (status) {
        status.textContent = "Ready to start new order";
        status.className = "status-bar status-success show";
    }
}

window.submitCartOrder = async function () {

    try {

        const btn =
            document.getElementById("submitBtn");

        btn.disabled = true;

        btn.innerText = "Saving...";

        const order =
            collectData();

        // ✅ PASTE HERE

        if (
            !order.items ||
            order.items.length === 0 ||
            order.items.every(
                item => !item.code || item.qty <= 0
            )
        ) {

            alert("Please add at least one valid item");

            btn.disabled = false;

            btn.innerText = "Submit Order";

            return;

        }

        // PRODUCTS SAVE

        for (const item of order.items) {

            await setDoc(
                doc(db, "products", item.code),

                {
                    code: item.code,
                    name: item.name,
                    unit: item.unit,
                    qty: item.qty,
                    rate: item.rate,
                    createdAt: new Date()
                },

                { merge: true }

            );

        }

        alert("Products saved");

        localStorage.removeItem("cart");



        window.location.href = "index1.html";

    }

    catch (error) {

        console.error(error);

        alert("Error saving products");

        btn.disabled = false;

        btn.innerText = "Submit Order";

    }

};

window.applyCategoryDiscount = function () {
    recalc();
}

window.recalc = function () {

    let inclusiveTotal = 0;

    const tbody = document.getElementById('tbody');

    if (!tbody) {
        console.error("tbody not found.");
        return;
    }

    const freightEl = document.getElementById('freight');
    const specialDiscountEl = document.getElementById('specialDiscount');
    const gstPercentEl = document.getElementById('gstPercent');

    const subTotalEl = document.getElementById('subTotal');
    const gstAmountEl = document.getElementById('gstAmount');
    const grandTotalEl = document.getElementById('grandTotal');

    if (!subTotalEl || !gstAmountEl || !grandTotalEl) {
        console.error("Summary elements missing.");
        return;
    }

    const gstP = +gstPercentEl.value || 18;

    [...tbody.children].forEach(tr => {

        const qtyInput = tr.querySelector('.qty');
        const rateInput = tr.querySelector('.rate');
        const amtElement = tr.querySelector('.amt');
        const codeInput = tr.querySelector('.item-code');

        if (!qtyInput || !rateInput || !amtElement) return;

        const qty = +qtyInput.value || 0;
        const rate = +rateInput.value || 0;

        let amount = qty * rate;

        let discPercent = 0;

        if (codeInput) {
            const code = codeInput.value.trim().toUpperCase();
            discPercent = getCategoryDiscByCode(code);
        }

        const discountAmount = amount * discPercent / 100;
        amount = amount - discountAmount;

        amtElement.textContent = money(amount);

        inclusiveTotal += amount;
    });

    const freight = +freightEl.value || 0;
    const spDis = +specialDiscountEl.value || 0;

    const grand = Math.max(0, inclusiveTotal + freight - spDis);

    const taxable = grand / (1 + gstP / 100);
    const gstA = grand - taxable;

    subTotalEl.textContent = money(taxable);
    gstAmountEl.textContent = money(gstA);
    grandTotalEl.textContent = money(grand);
};
function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// Function to format the amount (currency formatting)
function money(amount) {
    return `₹${round2(amount).toFixed(2)}`;
}

let freightEl = document.getElementById('freight'),
    specialDiscount = document.getElementById('specialDiscount'),
    gstPercent = document.getElementById('gstPercent'),
    subTotal = document.getElementById('subTotal'),
    gstAmount = document.getElementById('gstAmount'),
    grandTotal = document.getElementById('grandTotal');


if (partyGST) {
    partyGST.addEventListener('input', function () {
        this.value = this.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 15);
    });
}
if (partyMobile) {
    partyMobile.addEventListener('input', function () {
        this.value = this.value
            .replace(/[^0-9]/g, '')
            .slice(0, 10);
    });
}

function collectData() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return {}; // Return empty object if tbody is not found

    const items = [...tbody.children].map(tr => {

        const code =
            tr.querySelector('.item-code')
                ? tr.querySelector('.item-code').value.trim().toUpperCase()
                : '';

        return {

            code: code,

            name:
                tr.querySelector('.item-name')
                    ? tr.querySelector('.item-name').value.trim()
                    : '',

            // ⭐ NEW FIELD
            category:
                itemMaster[code]?.category || "",

            qty:
                tr.querySelector('.qty')
                    ? +tr.querySelector('.qty').value || 0
                    : 0,

            unit:
                tr.querySelector('.unit')
                    ? tr.querySelector('.unit').value
                    : '',

            rate:
                tr.querySelector('.rate')
                    ? +tr.querySelector('.rate').value || 0
                    : 0,

            amount:
                parseFloat(
                    tr.querySelector('.amt')
                        ?.textContent
                        .replace(/[₹,]/g, "")
                ) || 0
        };
    });

    // Log the items and other order data
    // console.log("Collected order data:", {
    //     orderNo: orderNo.value.trim() || autoOrderNo(),
    //     orderDate: orderDate.value,
    //     salesman: salesman.value.trim(),
    //     party: {
    //         name: partyName.value.trim() || '',
    //         type: partyType.value || '',
    //         address: partyAddress.value.trim() || '',
    //         gst: partyGST.value.trim() || '',
    //         mobile: partyMobile.value.trim() || '',
    //         transport: partyTransport.value.trim() || ''
    //     },
    //     items: items,  
    // });

    return {
        orderNo: orderNo.value.trim() || autoOrderNo(),
        orderDate: orderDate.value,
        salesman: salesman.value.trim(),
        party: {
            name: partyName.value.trim() || '',
            type: partyType.value || '',
            city: partyCity.value.trim() || '',
            gst: partyGST.value.trim() || '',
            mobile: partyMobile.value.trim() || '',
            distributor: distributor?.value || ''
        },
        notes: orderNotes.value.trim(),
        items, // Return collected items from the cart
        categoryDiscounts: {
            hardware: +hardwareDisc.value || 0,
            bathroom: +bathroomDisc.value || 0,
            stainlesssteel: +stainlesssteelDisc.value || 0
        },
        freight: +freightEl.value || 0,
        specialDiscount: +specialDiscount.value || 0,
        gstPercent: +gstPercent.value || 18,
        subTotal:
            parseFloat(
                subTotal.textContent.replace(/[₹,]/g, "")
            ) || 0,

        gstAmount:
            parseFloat(
                gstAmount.textContent.replace(/[₹,]/g, "")
            ) || 0,

        grandTotal:
            parseFloat(
                grandTotal.textContent.replace(/[₹,]/g, "")
            ) || 0,
        savedAt: new Date().toISOString()
    };
}



window.saveDraft = function () {
    localStorage.setItem('petro_order_draft', JSON.stringify(collectData()));
    alert('✅ Draft saved locally.');
}


function loadDraftFromStorage(storageKey = "petro_order_draft") {

    const d = JSON.parse(
        localStorage.getItem(storageKey) || "null"
    );

    if (!d) {
        return false;
    }

    orderNo.value = d.orderNo || "";

    if (d.orderDate) {
        orderDate.value = d.orderDate;
    } else {
        orderDate.value =
            new Date().toISOString().split("T")[0];
    }

    salesman.value = d.salesman || "";

    partyName.value = d.party?.name || "";
    partyType.value = d.party?.type || "";
    partyCity.value =
        d.party?.city ||
        d.party?.address ||
        "";

    partyGST.value = d.party?.gst || "";
    partyMobile.value = d.party?.mobile || "";
    orderNotes.value = d.notes || "";

    freightEl.value = d.freight || 0;
    specialDiscount.value = d.specialDiscount || 0;
    gstPercent.value = d.gstPercent || 18;

    hardwareDisc.value =
        d.categoryDiscounts?.hardware || 0;

    bathroomDisc.value =
        d.categoryDiscounts?.bathroom || 0;

    stainlesssteelDisc.value =
        d.categoryDiscounts?.stainlesssteel || 0;

    populateDistributorDropdown(
        d.salesman || "",
        d.party?.distributor ||
        d.party?.transport ||
        ""
    );

    tbody.innerHTML = "";

    (d.items || []).forEach(addRow);

    if ((d.items || []).length === 0) {
        addRow();
    }

    recalc();

    return true;
}

window.loadDraft = function () {

    const loaded =
        loadDraftFromStorage("petro_order_draft");

    if (!loaded) {
        const status =
            document.getElementById("statusMsg");

        if (status) {
            status.textContent = "No saved draft found";
            status.className =
                "status-bar status-warning show";
        }
    }
};

window.newOrder = function () {
    openNewOrderModal();
};

window.openNewOrderModal = function () {
    const modal = document.getElementById("newOrderModal");
    if (!modal) return;

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
};

window.closeNewOrderModal = function () {
    const modal = document.getElementById("newOrderModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
};

window.confirmNewOrder = function () {

    closeNewOrderModal();

    salesman.value = "";
    orderNo.value = "";
    orderNo.placeholder = "AUTO";

    const today = new Date()
        .toISOString()
        .split("T")[0];

    orderDate.value = today;

    partyName.value = "";
    partyType.value = "";
    partyCity.value = "";
    partyGST.value = "";
    partyMobile.value = "";
    orderNotes.value = "";

    populateDistributorDropdown("");

    document.getElementById("hardwareDisc").value = 0;
    document.getElementById("bathroomDisc").value = 0;
    document.getElementById("stainlesssteelDisc").value = 0;

    freightEl.value = 0;
    specialDiscount.value = 0;
    gstPercent.value = 18;

    tbody.innerHTML = "";
    addRow();

    localStorage.removeItem("petro_order_draft");
    localStorage.removeItem("petro_order_auto_draft");
    localStorage.removeItem("petro_order_data");
    localStorage.removeItem("cart");

    recalc();

    const status = document.getElementById("statusMsg");

    if (status) {
        status.textContent = "New order started";
        status.className = "status-bar status-info show";
    }
};

// Close modal if user clicks outside the card
document.addEventListener("click", (event) => {
    const modal = document.getElementById("newOrderModal");

    if (modal && event.target === modal) {
        closeNewOrderModal();
    }
});

// Close modal using Escape key
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeNewOrderModal();
    }
});

// Backward compatibility if another file still calls clearAll()
window.clearAll = window.newOrder;




// ✅ PWA: Service Worker Registration
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
        navigator.serviceWorker.register("./service-worker.js")
            .then(function (reg) {
                // console.log("Service Worker registered:", reg.scope);
            })
            .catch(function (err) {
                // console.log("Service Worker registration failed:", err);
            });
    });
}



// AUTO SAVE ONLY IF TABLE EXISTS
if (document.getElementById("tbody")) {

    setInterval(() => {

        if (typeof autoSave === "function") {
            autoSave();
        }

    }, 5000);

}


// AUTO SAVE ON INPUT CHANGE

// REAL-TIME AUTO SAVE ON EVERY INPUT

document.addEventListener("input", () => {

    if (typeof autoSave === "function") {

        autoSave();

        // console.log("Auto saved");

    }

});

// AUTO SAVE ON CHANGE (SELECT, DATE, ETC)

document.addEventListener("change", () => {

    if (typeof autoSave === "function") {

        autoSave();

        // console.log("Auto saved (change)");

    }

});

// ================= PAGE STARTUP =================
(async function initPage() {

    const today =
        new Date().toISOString().split("T")[0];

    if (orderDate && !orderDate.value) {
        orderDate.value = today;
    }

    await loadAsmDistributorMap();

    const autoDraftLoaded =
        loadDraftFromStorage(
            "petro_order_auto_draft"
        );

    if (!autoDraftLoaded) {
        const manualDraftLoaded =
            loadDraftFromStorage(
                "petro_order_draft"
            );

        if (!manualDraftLoaded) {
            addRow();
            populateDistributorDropdown("");
        }
    }

})();

