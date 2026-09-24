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


/* =========================================================
   FIREBASE
========================================================= */

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


/* =========================================================
   HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);

const orderId = params.get("id");

const source =
    params.get("source") ||
    "orders";

const MODE =
    (params.get("mode") || "edit")
        .toLowerCase();


let currentOrderRef = null;

let currentCollectionName = "";

let loadedOrderData = null;

let previousStatusValue = "Pending";

window.cancelReason = "";


/* =========================================================
   DOM ELEMENTS
========================================================= */

const els = {

    loader: $("loader"),

    editArea: $("editArea"),

    orderNo: $("orderNo"),

    orderDate: $("orderDate"),

    salesman: $("salesmanName"),

    status: $("orderStatus"),

    partyName: $("partyName"),

    partyType: $("partyType"),

    distributor: $("distributor"),

    city: $("partyCity"),

    mobile: $("partyMobile"),

    gst: $("partyGST"),

    address: $("partyAddress"),

    notes: $("orderNotes"),

    items: $("itemsBody"),

    suggest: $("suggestBox"),

    freight: $("freight"),

    special: $("specialDiscount"),

    gstPct: $("gstPercent"),

    sub: $("subTotal"),

    gstAmt: $("gstAmount"),

    grand: $("grandTotal"),

    reasonModal: $("cancelRemarkModal"),

    reason: $("cancelRemark")
};


/* =========================================================
   ROLE
========================================================= */

function role() {

    let r = (
        localStorage.getItem("user_role") ||
        localStorage.getItem("adminRole") ||
        ""
    )
        .toLowerCase()
        .replace(/[- ]/g, "_");


    if (
        !r &&
        (
            localStorage.getItem("salesman") ||
            localStorage.getItem("loggedSalesman")
        )
    ) {
        r = "sales";
    }


    return r;
}


/* =========================================================
   USER NAME
========================================================= */

function userName() {

    return (
        localStorage.getItem("adminName") ||
        localStorage.getItem("user_name") ||
        localStorage.getItem("salesman") ||
        localStorage.getItem("loggedSalesman") ||
        "User"
    );
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function esc(value) {

    return String(value ?? "")

        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;");
}


/* =========================================================
   STATUS NORMALIZE
========================================================= */

function statusNorm(value) {

    const v =
        String(value || "")
            .toLowerCase();


    if (v.includes("quotation")) {
        return "Quotation Sent";
    }


    if (v.includes("payment")) {
        return "Payment Received";
    }


    if (v.includes("partial")) {
        return "Partial Delivered";
    }


    if (v.includes("delivered")) {
        return "Delivered";
    }


    if (v.includes("cancel")) {
        return "Cancelled";
    }


    if (v.includes("hold")) {
        return "Hold";
    }


    return "Pending";
}


/* =========================================================
   DATE FORMAT FOR INPUT
========================================================= */

function dateInput(value) {

    if (!value) {
        return "";
    }


    if (
        value &&
        typeof value.toDate === "function"
    ) {
        value = value.toDate();
    }


    if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(value)
    ) {
        return value.slice(0, 10);
    }


    const d = new Date(value);


    if (Number.isNaN(d.getTime())) {
        return "";
    }


    return d
        .toISOString()
        .slice(0, 10);
}


/* =========================================================
   LOADER
========================================================= */

function showLoader(show) {

    if (els.loader) {

        els.loader.style.display =
            show
                ? "flex"
                : "none";
    }


    if (
        !show &&
        els.editArea
    ) {

        els.editArea.style.display =
            "block";
    }
}


/* =========================================================
   BACK BUTTON
========================================================= */

window.goBackToOrders = function () {

    /*
     * Agar page orders page se open hua hai
     * to wahi previous page par return karega.
     */

    if (
        window.history.length > 1 &&
        document.referrer
    ) {

        window.history.back();

        return;
    }


    const currentRole = role();


    if (currentRole === "sales") {

        window.location.href =
            "/sales-dashboard.html";

        return;
    }


    window.location.href =
        "/orders/orders.html";
};


/* =========================================================
   FIND ORDER
========================================================= */

async function resolveOrderRef() {

    if (!orderId) {
        return null;
    }


    const firstCollection =
        String(source)
            .toLowerCase()
            .includes("product")
            ? "products"
            : "orders";


    const collections =
        firstCollection === "products"

            ? [
                "products",
                "orders"
            ]

            : [
                "orders",
                "products"
            ];


    /* -----------------------------------------------------
       1. TRY FIRESTORE DOCUMENT ID
    ----------------------------------------------------- */

    for (const collectionName of collections) {

        try {

            const ref =
                doc(
                    db,
                    collectionName,
                    orderId
                );


            const snap =
                await getDoc(ref);


            if (snap.exists()) {

                return {

                    ref,

                    collectionName,

                    data: snap.data()
                };
            }

        } catch (error) {

            console.warn(
                `Direct lookup failed in ${collectionName}`,
                error
            );
        }

    }


    /* -----------------------------------------------------
       2. TRY ORDER NUMBER FIELDS
    ----------------------------------------------------- */

    const fields = [

        "orderNo",

        "partyDetails.orderNo"
    ];


    for (const collectionName of collections) {

        for (const field of fields) {

            try {

                const q = query(

                    collection(
                        db,
                        collectionName
                    ),

                    where(
                        field,
                        "==",
                        orderId
                    )
                );


                const snapshot =
                    await getDocs(q);


                if (!snapshot.empty) {

                    const firstDoc =
                        snapshot.docs[0];


                    return {

                        ref: firstDoc.ref,

                        collectionName,

                        data: firstDoc.data()
                    };
                }

            } catch (error) {

                console.warn(
                    `Order lookup failed: ${collectionName}/${field}`,
                    error
                );
            }

        }

    }


    return null;
}


/* =========================================================
   LOAD ORDER
========================================================= */

async function loadOrder() {

    try {

        showLoader(true);


        const result =
            await resolveOrderRef();


        if (!result) {

            showLoader(false);

            alert(
                "Order not found."
            );

            return;
        }


        currentOrderRef =
            result.ref;


        currentCollectionName =
            result.collectionName;


        loadedOrderData =
            result.data;


        const o =
            result.data || {};


        const party =
            o.party ||
            o.partyDetails ||
            {};


        /* -------------------------------------------------
           ORDER NUMBER
        -------------------------------------------------- */

        if (els.orderNo) {

            els.orderNo.value =
                o.orderNo ||
                o.partyDetails?.orderNo ||
                orderId ||
                "";


            /*
             * IMPORTANT:
             * ORDER NUMBER CANNOT BE EDITED
             */

            els.orderNo.readOnly =
                true;
        }


        /* -------------------------------------------------
           ORDER DATE
        -------------------------------------------------- */

        if (els.orderDate) {

            els.orderDate.value =
                dateInput(
                    o.orderDate ||
                    o.date ||
                    o.createdAt
                );
        }


        /* -------------------------------------------------
           SALESMAN
        -------------------------------------------------- */

        if (els.salesman) {

            els.salesman.value =
                o.salesman ||
                o.salesmanName ||
                "";
        }


        /* -------------------------------------------------
           STATUS
        -------------------------------------------------- */

        if (els.status) {

            els.status.value =
                statusNorm(
                    o.status
                );


            previousStatusValue =
                els.status.value;
        }


        window.cancelReason =
            o.cancelRemark ||
            "";


        /* -------------------------------------------------
           PARTY
        -------------------------------------------------- */

        if (els.partyName) {

            els.partyName.value =
                o.partyName ||
                party.name ||
                party.partyName ||
                "";
        }


        if (els.partyType) {

            els.partyType.value =
                o.partyType ||
                party.type ||
                party.partyType ||
                "";
        }


        if (els.distributor) {

            els.distributor.value =
                o.distributor ||
                o.distributorName ||
                party.distributor ||
                party.transport ||
                "";
        }


        if (els.city) {

            els.city.value =
                o.city ||
                party.city ||
                "";
        }


        if (els.mobile) {

            els.mobile.value =
                o.mobile ||
                party.mobile ||
                party.phone ||
                "";
        }


        if (els.gst) {

            els.gst.value =
                o.gst ||
                party.gst ||
                party.gstNumber ||
                "";
        }


        if (els.address) {

            els.address.value =
                o.address ||
                party.address ||
                "";
        }


        if (els.notes) {

            els.notes.value =
                o.notes ||
                o.remarks ||
                o.remark ||
                "";
        }


        /* -------------------------------------------------
           BILLING
        -------------------------------------------------- */

        if (els.freight) {

            els.freight.value =
                Number(
                    o.freight ||
                    o.freightCharges ||
                    0
                );
        }


        if (els.special) {

            els.special.value =
                Number(
                    o.specialDiscount ||
                    0
                );
        }


        if (els.gstPct) {

            els.gstPct.value =
                Number(
                    o.gstPercent ??
                    18
                );
        }


        /* -------------------------------------------------
           DISCOUNTS
        -------------------------------------------------- */

        const hardwareDisc =
            $("hardwareDisc");


        const bathroomDisc =
            $("bathroomDisc");


        const stainlesssteelDisc =
            $("stainlesssteelDisc");


        if (hardwareDisc) {

            hardwareDisc.value =
                Number(
                    o.categoryDiscounts?.hardware ||
                    0
                );
        }


        if (bathroomDisc) {

            bathroomDisc.value =
                Number(
                    o.categoryDiscounts?.bathroom ||
                    0
                );
        }


        if (stainlesssteelDisc) {

            stainlesssteelDisc.value =
                Number(
                    o.categoryDiscounts?.stainlesssteel ||
                    o.categoryDiscounts?.ss ||
                    0
                );
        }


        /* -------------------------------------------------
           ITEMS
        -------------------------------------------------- */

        const rawItems =

            o.items ||

            o.cartItems ||

            o.orderItems ||

            o.productList ||

            o.cart ||

            [];


        if (els.items) {

            els.items.innerHTML =
                "";


            if (
                Array.isArray(rawItems) &&
                rawItems.length
            ) {

                rawItems.forEach(item => {

                    window.addItemRow(item);
                });

            } else {

                window.addItemRow({});
            }

        }


        window.calcTotals();


        showLoader(false);


        applyViewMode();
 


    } catch (error) {

        console.error(
            "LOAD ORDER ERROR:",
            error
        );


        showLoader(false);


        alert(
            "Failed to load order. Please check Console."
        );
    }

}


/* =========================================================
   ADD ITEM ROW
========================================================= */

window.addItemRow = function (
    item = {}
) {

    if (!els.items) {
        return;
    }


    const tr =
        document.createElement(
            "tr"
        );


    tr.className =
        "item-row";


    const qty =
        Number(
            item.qty ??
            item.quantity ??
            0
        );


    const rate =
        Number(
            item.rate ??
            item.price ??
            0
        );


    tr.innerHTML = `

        <td>

            <input
                class="code"
                value="${esc(
                    item.code ||
                    item.itemCode ||
                    item.productCode ||
                    ""
                )}"
                placeholder="Code"
            >

        </td>


        <td>

            <input
                class="name"
                value="${esc(
                    item.name ||
                    item.itemName ||
                    item.productName ||
                    ""
                )}"
                placeholder="Item name"
            >

        </td>


        <td>

            <input
                class="qty"
                type="number"
                min="0"
                value="${qty}"
            >

        </td>


        <td>

            <select class="unit"></select>

        </td>


        <td>

            <input
                class="rate"
                type="number"
                readonly
                value="${rate.toFixed(2)}"
            >

        </td>


        <td>

            <input
                class="total"
                readonly
                value="0.00"
            >

        </td>


        <td>

            <button
                class="remove"
                type="button"
                title="Remove Item"
            >

                <i class="fa-solid fa-trash"></i>

            </button>

        </td>

    `;


    els.items.appendChild(tr);


    const code =
        tr.querySelector(".code");


    const name =
        tr.querySelector(".name");


    const qtyInput =
        tr.querySelector(".qty");


    const unit =
        tr.querySelector(".unit");


    const remove =
        tr.querySelector(".remove");


    /* -----------------------------------------------------
       EVENTS
    ----------------------------------------------------- */

    if (code) {

        code.addEventListener(
            "input",
            () => suggestFor(code)
        );
    }


    if (name) {

        name.addEventListener(
            "input",
            () => suggestFor(name)
        );
    }


    if (qtyInput) {

        qtyInput.addEventListener(
            "input",
            window.calcTotals
        );
    }


    if (unit) {

        unit.addEventListener(
            "change",
            () => {

                populateByCode(
                    tr,
                    code?.value || "",
                    unit.value
                );
            }
        );
    }


    if (remove) {

        remove.addEventListener(
            "click",
            () => {

                tr.remove();

                window.calcTotals();
            }
        );
    }


    /* -----------------------------------------------------
       INITIAL PRODUCT
    ----------------------------------------------------- */

    const itemCode =
        String(
            code?.value ||
            ""
        )
            .trim()
            .toUpperCase();


    if (
        itemCode &&
        window.itemMaster?.[itemCode]
    ) {

        populateByCode(

            tr,

            itemCode,

            item.unit ||
            item.selectedUnit ||
            ""
        );

    } else if (unit) {

        const selectedUnit =
            item.unit ||
            item.selectedUnit ||
            "-";


        unit.innerHTML =
            `<option value="${esc(selectedUnit)}">${esc(selectedUnit)}</option>`;
    }


    window.calcTotals();
};


/* =========================================================
   POPULATE PRODUCT
========================================================= */

function populateByCode(
    tr,
    code,
    preferredUnit = ""
) {

    if (!tr) {
        return;
    }


    code =
        String(code || "")
            .trim()
            .toUpperCase();


    const product =
        window.itemMaster?.[code];


    if (
        !product ||
        !product.units
    ) {
        return;
    }


    const codeInput =
        tr.querySelector(".code");


    const nameInput =
        tr.querySelector(".name");


    const unitSelect =
        tr.querySelector(".unit");


    const rateInput =
        tr.querySelector(".rate");


    if (!unitSelect) {
        return;
    }


    if (codeInput) {

        codeInput.value =
            code;
    }


    if (nameInput) {

        nameInput.value =
            product.name ||
            "";
    }


    const units =
        Object.keys(
            product.units
        );


    unitSelect.innerHTML =
        units
            .map(unit => {

                return `
                    <option value="${esc(unit)}">
                        ${esc(unit)}
                    </option>
                `;

            })
            .join("");


    let selectedUnit =
        preferredUnit;


    if (
        !selectedUnit ||
        !product.units[selectedUnit]
    ) {

        selectedUnit =
            units[0] ||
            "";
    }


    unitSelect.value =
        selectedUnit;


    if (rateInput) {

        rateInput.value =
            Number(
                product.units?.[selectedUnit]?.rate ||
                0
            )
                .toFixed(2);
    }


    window.calcTotals();
}


/* =========================================================
   CATEGORY DISCOUNT
========================================================= */

function discountFor(code) {

    const product =
        window.itemMaster?.[
            String(code || "")
                .trim()
                .toUpperCase()
        ];


    const category =
        String(
            product?.category ||
            ""
        )
            .toLowerCase()
            .replace(/\s/g, "");


    if (
        category.includes(
            "hardware"
        )
    ) {

        return Number(
            $("hardwareDisc")?.value ||
            0
        );
    }


    if (
        category.includes(
            "bathroom"
        )
    ) {

        return Number(
            $("bathroomDisc")?.value ||
            0
        );
    }


    if (
        category.includes(
            "stainlesssteel"
        ) ||
        category === "ss"
    ) {

        return Number(
            $("stainlesssteelDisc")?.value ||
            0
        );
    }


    return 0;
}


/* =========================================================
   CALCULATIONS
========================================================= */

window.calcTotals = function () {

    let subtotal = 0;


    document
        .querySelectorAll(
            ".item-row"
        )
        .forEach(row => {

            const qty =
                Number(
                    row.querySelector(
                        ".qty"
                    )?.value ||
                    0
                );


            const rate =
                Number(
                    row.querySelector(
                        ".rate"
                    )?.value ||
                    0
                );


            const code =
                row.querySelector(
                    ".code"
                )?.value ||
                "";


            const discount =
                discountFor(code);


            const total =
                qty *
                rate *
                (
                    1 -
                    discount / 100
                );


            const totalInput =
                row.querySelector(
                    ".total"
                );


            if (totalInput) {

                totalInput.value =
                    total.toFixed(2);
            }


            subtotal +=
                total;
        });


    const freight =
        Number(
            els.freight?.value ||
            0
        );


    const specialDiscount =
        Number(
            els.special?.value ||
            0
        );


    const gstPercent =
        Number(
            els.gstPct?.value ||
            0
        );


    const taxable =
        Math.max(
            0,
            subtotal +
            freight -
            specialDiscount
        );


    const gstAmount =
        taxable *
        gstPercent /
        100;


    const grandTotal =
        taxable +
        gstAmount;


    if (els.sub) {

        els.sub.value =
            subtotal.toFixed(2);
    }


    if (els.gstAmt) {

        els.gstAmt.value =
            gstAmount.toFixed(2);
    }


    if (els.grand) {

        els.grand.value =
            grandTotal.toFixed(2);
    }
};


/* =========================================================
   SAFE CALCULATION EVENTS
========================================================= */

[
    "hardwareDisc",

    "bathroomDisc",

    "stainlesssteelDisc",

    "freight",

    "specialDiscount",

    "gstPercent"

].forEach(id => {

    const element =
        $(id);


    /*
     * IMPORTANT FIX:
     * Missing HTML element will NOT crash JS.
     */

    if (element) {

        element.addEventListener(
            "input",
            window.calcTotals
        );
    }

});


/* =========================================================
   PRODUCT SUGGESTION
========================================================= */

function suggestFor(input) {

    if (
        !input ||
        !els.suggest
    ) {
        return;
    }


    const search =
        input.value
            .trim()
            .toUpperCase();


    els.suggest.innerHTML =
        "";


    if (
        !search ||
        !window.itemMaster
    ) {

        els.suggest.style.display =
            "none";

        return;
    }


    const results =
        Object
            .entries(
                window.itemMaster
            )

            .filter(
                ([code, item]) =>

                    code
                        .toUpperCase()
                        .startsWith(
                            search
                        )

                    ||

                    String(
                        item?.name ||
                        ""
                    )
                        .toUpperCase()
                        .includes(
                            search
                        )
            )

            .slice(
                0,
                25
            );


    if (!results.length) {

        els.suggest.style.display =
            "none";

        return;
    }


    results.forEach(
        ([code, item]) => {

            const option =
                document.createElement(
                    "div"
                );


            option.className =
                "opt";


            option.innerHTML = `

                <b>
                    ${esc(code)}
                </b>

                —

                ${esc(
                    item?.name ||
                    ""
                )}

            `;


            option.addEventListener(
                "click",
                () => {

                    populateByCode(

                        input.closest("tr"),

                        code
                    );


                    els.suggest.style.display =
                        "none";
                }
            );


            els.suggest.appendChild(
                option
            );
        }
    );


    const rect =
        input.getBoundingClientRect();


    els.suggest.style.left =
        (
            rect.left +
            window.scrollX
        ) + "px";


    els.suggest.style.top =
        (
            rect.bottom +
            window.scrollY
        ) + "px";


    els.suggest.style.width =
        Math.max(
            rect.width,
            300
        ) + "px";


    els.suggest.style.display =
        "block";
}


/* =========================================================
   CLOSE SUGGESTION
========================================================= */

document.addEventListener(
    "click",
    event => {

        if (!els.suggest) {
            return;
        }


        if (
            !event.target.closest(
                "#suggestBox"
            )

            &&

            !event.target.classList.contains(
                "code"
            )

            &&

            !event.target.classList.contains(
                "name"
            )
        ) {

            els.suggest.style.display =
                "none";
        }

    }
);


/* =========================================================
   STATUS EVENTS
========================================================= */

if (els.status) {

    els.status.addEventListener(
        "focus",
        () => {

            previousStatusValue =
                els.status.value ||
                "Pending";
        }
    );


    els.status.addEventListener(
        "change",
        () => {

            if (
                [
                    "Cancelled",
                    "Hold"
                ]
                    .includes(
                        els.status.value
                    )
            ) {

                if (
                    !window.cancelReason
                ) {

                    openReason();
                }

            } else {

                window.cancelReason =
                    "";
            }

        }
    );
}


/* =========================================================
   REASON POPUP
========================================================= */

function openReason() {

    if (
        !els.reasonModal ||
        !els.reason
    ) {
        return;
    }


    const title =
        $("reasonTitle");


    if (title) {

        title.textContent =
            els.status?.value ===
            "Hold"

                ? "Hold Reason"

                : "Cancellation Reason";
    }


    els.reason.value =
        window.cancelReason ||
        "";


    els.reasonModal.style.display =
        "flex";


    setTimeout(
        () => {

            els.reason.focus();

        },
        50
    );
}


/* =========================================================
   CLOSE REASON
========================================================= */

window.closeCancelPopup =
function () {

    if (els.reasonModal) {

        els.reasonModal.style.display =
            "none";
    }


    if (els.status) {

        els.status.value =
            previousStatusValue ||
            "Pending";
    }


    window.cancelReason =
        "";
};


/* =========================================================
   CONFIRM REASON
========================================================= */

window.confirmCancelRemark =
function () {

    if (!els.reason) {
        return;
    }


    const value =
        els.reason.value
            .trim();


    if (!value) {

        alert(
            "Please enter reason."
        );

        return;
    }


    window.cancelReason =
        value;


    previousStatusValue =
        els.status?.value ||
        "Pending";


    if (els.reasonModal) {

        els.reasonModal.style.display =
            "none";
    }
};


/* =========================================================
   UPDATE ORDER
========================================================= */

window.updateOrder =
async function () {

    if (
        MODE === "view"
    ) {

        alert(
            "This order is in view mode."
        );

        return;
    }


    if (!currentOrderRef) {

        alert(
            "Order reference not found."
        );

        return;
    }


    if (
        !els.partyName ||
        !els.partyName.value.trim()
    ) {

        alert(
            "Party Name required."
        );


        els.partyName?.focus();

        return;
    }


    if (
        els.status &&
        [
            "Cancelled",
            "Hold"
        ].includes(
            els.status.value
        )

        &&

        !window.cancelReason.trim()
    ) {

        openReason();

        return;
    }


    /* -----------------------------------------------------
       ITEMS
    ----------------------------------------------------- */

    const items =
        [
            ...document.querySelectorAll(
                ".item-row"
            )
        ]

            .map(row => {

                return {

                    code:
                        row.querySelector(
                            ".code"
                        )
                            ?.value
                            .trim()
                            .toUpperCase() ||
                        "",


                    name:
                        row.querySelector(
                            ".name"
                        )
                            ?.value
                            .trim() ||
                        "",


                    qty:
                        Number(
                            row.querySelector(
                                ".qty"
                            )
                                ?.value ||
                            0
                        ),


                    unit:
                        row.querySelector(
                            ".unit"
                        )
                            ?.value ||
                        "",


                    rate:
                        Number(
                            row.querySelector(
                                ".rate"
                            )
                                ?.value ||
                            0
                        ),


                    amount:
                        Number(
                            row.querySelector(
                                ".total"
                            )
                                ?.value ||
                            0
                        )
                };

            })

            .filter(
                item =>
                    item.code ||
                    item.name
            );


    if (!items.length) {

        alert(
            "At least 1 item required."
        );

        return;
    }


    const updateBtn =
        $("updateBtn");


    if (updateBtn) {

        updateBtn.disabled =
            true;


        updateBtn.innerHTML = `

            <i class="fa-solid fa-spinner fa-spin"></i>

            Updating...

        `;
    }


    try {

        /* -------------------------------------------------
           PARTY PAYLOAD
        -------------------------------------------------- */

        const party = {

            name:
                els.partyName?.value.trim() ||
                "",


            partyName:
                els.partyName?.value.trim() ||
                "",


            mobile:
                els.mobile?.value.trim() ||
                "",


            address:
                els.address?.value.trim() ||
                "",


            city:
                els.city?.value.trim() ||
                "",


            gst:
                els.gst?.value.trim() ||
                "",


            type:
                els.partyType?.value ||
                "",


            partyType:
                els.partyType?.value ||
                "",


            distributor:
                els.distributor?.value.trim() ||
                ""
        };


        /* -------------------------------------------------
           UPDATE PAYLOAD
        -------------------------------------------------- */

        const payload = {

            status:
                els.status?.value ||
                "Pending",


            cancelRemark:
                [
                    "Cancelled",
                    "Hold"
                ]
                    .includes(
                        els.status?.value
                    )

                    ? window.cancelReason.trim()

                    : "",


            orderDate:
                els.orderDate?.value ||
                "",


            salesman:
                els.salesman?.value.trim() ||
                "",


            notes:
                els.notes?.value.trim() ||
                "",


            remarks:
                els.notes?.value.trim() ||
                "",


            party,

            partyDetails:
                party,


            partyName:
                party.name,


            mobile:
                party.mobile,


            address:
                party.address,


            city:
                party.city,


            gst:
                party.gst,


            partyType:
                party.type,


            distributor:
                party.distributor,


            /*
             * ORDER NUMBER INTENTIONALLY
             * NOT UPDATED.
             *
             * This protects the original Order No.
             */


            items,

            cartItems:
                items,

            orderItems:
                items,


            categoryDiscounts: {

                hardware:
                    Number(
                        $("hardwareDisc")
                            ?.value ||
                        0
                    ),


                bathroom:
                    Number(
                        $("bathroomDisc")
                            ?.value ||
                        0
                    ),


                stainlesssteel:
                    Number(
                        $("stainlesssteelDisc")
                            ?.value ||
                        0
                    )
            },


            freight:
                Number(
                    els.freight?.value ||
                    0
                ),


            specialDiscount:
                Number(
                    els.special?.value ||
                    0
                ),


            gstPercent:
                Number(
                    els.gstPct?.value ||
                    0
                ),


            subTotal:
                Number(
                    els.sub?.value ||
                    0
                ),


            gstAmount:
                Number(
                    els.gstAmt?.value ||
                    0
                ),


            grandTotal:
                Number(
                    els.grand?.value ||
                    0
                ),


            updatedAt:
                serverTimestamp()
        };


        /* -------------------------------------------------
           FIRESTORE UPDATE
        -------------------------------------------------- */

        await updateDoc(

            currentOrderRef,

            payload
        );


        /* -------------------------------------------------
           ACTIVITY LOG
        -------------------------------------------------- */

        try {

            await addDoc(

                collection(
                    db,
                    "order_activities"
                ),

                {

                    orderId,

                    orderNo:
                        els.orderNo?.value ||
                        orderId,


                    source:
                        currentCollectionName,


                    action:
                        "updated",


                    message:
                        `${userName()} updated order ${els.orderNo?.value || orderId} and changed status to ${els.status?.value || "Pending"}`,


                    user:
                        userName(),


                    role:
                        role() ||
                        "unknown",


                    timestamp:
                        serverTimestamp()
                }
            );

        } catch (activityError) {

            /*
             * Activity log fail hone par
             * main order update fail nahi hoga.
             */

            console.warn(
                "Activity log failed:",
                activityError
            );
        }


        alert(
            "Order Updated Successfully!"
        );


        window.goBackToOrders();


    } catch (error) {

        console.error(
            "UPDATE ORDER ERROR:",
            error
        );


        alert(
            "Update failed. Check Console."
        );


    } finally {

        if (updateBtn) {

            updateBtn.disabled =
                false;


            updateBtn.innerHTML = `

                <i class="fa-solid fa-floppy-disk"></i>

                Update Order

            `;
        }

    }

};


/* =========================================================
   VIEW MODE
========================================================= */

function applyViewMode() {

    if (
        MODE !== "view" ||
        !els.editArea
    ) {
        return;
    }


    els.editArea

        .querySelectorAll(
            "input, select, textarea"
        )

        .forEach(element => {

            element.disabled =
                true;
        });


    const updateBtn =
        $("updateBtn");


    if (updateBtn) {

        updateBtn.style.display =
            "none";
    }
}


/* =========================================================
   ADMIN NAME
========================================================= */

const adminNameEl =
    $("adminName");


if (adminNameEl) {

    adminNameEl.textContent =
        userName();
}


/* =========================================================
   DARK MODE
========================================================= */

const darkBtn =
    $("darkBtn");


if (darkBtn) {

    darkBtn.addEventListener(
        "click",
        () => {

            document.body
                .classList
                .toggle(
                    "dark"
                );


            localStorage.setItem(

                "petro_dark",

                document.body
                    .classList
                    .contains(
                        "dark"
                    )

                    ? "true"

                    : "false"
            );

        }
    );
}


if (
    localStorage.getItem(
        "petro_dark"
    ) === "true"
) {

    document.body
        .classList
        .add(
            "dark"
        );
}


/* =========================================================
   START PAGE
========================================================= */

if (!orderId) {

    showLoader(false);


    alert(
        "Invalid Order ID."
    );


    window.goBackToOrders();


} else {

    loadOrder();
}