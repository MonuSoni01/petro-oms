// ================= FIREBASE =================

import { initializeApp }
    from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";

import {
    getFirestore,
    collection,
    addDoc,
    doc,
    setDoc
}
    from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCdfQu5GCsBCyMHM7HX8GRzY-VTZaEMU5M",
    authDomain: "petro-oms.firebaseapp.com",
    projectId: "petro-oms",
    storageBucket: "petro-oms.firebasestorage.app",
    messagingSenderId: "562472760628",
    appId: "1:562472760628:web:384f4eda2c862b6e3ce161"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================= PRINT MODAL =================

window.openPrintModal = function () {
    const modal = document.getElementById("printModal");
    if (modal) modal.style.display = "flex";
};

window.closePrintModal = function () {
    const modal = document.getElementById("printModal");
    if (modal) modal.style.display = "none";
};

window.confirmPrint = function () {

    window.closePrintModal();

    setTimeout(() => {
        window.print();
    }, 200);

};

// ================= AUTO SAVE =================

function autoSave() {

    const tbody =
        document.getElementById("tbody");

    if (!tbody) return;

    if (
        typeof collectData !==
        "function"
    ) return;

    const data =
        collectData();

    if (
        !data.party.type
    ) {

        const partyType =
            document.getElementById(
                "partyType"
            );

        data.party.type =
            partyType?.value || "";

    }

    localStorage.setItem(
        "petro_order_auto_draft",
        JSON.stringify(data)
    );

}

// AUTO SAVE EVENTS

document.addEventListener(
    "input",
    autoSave
);

document.addEventListener(
    "change",
    autoSave
);

// ================= RESTORE AUTO DRAFT =================

(function restoreAutoDraft() {

    const saved =
        localStorage.getItem(
            "petro_order_auto_draft"
        );

    if (!saved) return;

    const d =
        JSON.parse(saved);

    // -------- BASIC FIELDS --------

    const orderNo =
        document.getElementById(
            "orderNo"
        );

    const orderDate =
        document.getElementById(
            "orderDate"
        );

    const salesman =
        document.getElementById(
            "salesman"
        );

    const partyName =
        document.getElementById(
            "partyName"
        );

    const partyAddress =
        document.getElementById(
            "partyAddress"
        );

    const partyType =
        document.getElementById(
            "partyType"
        );

    const partyGST =
        document.getElementById(
            "partyGST"
        );

    const partyMobile =
        document.getElementById(
            "partyMobile"
        );

    const partyTransport =
        document.getElementById(
            "partyTransport"
        );

    const paymentType =
        document.getElementById(
            "paymentType"
        );

    const dispatchDate =
        document.getElementById(
            "dispatchDate"
        );

    const orderNotes =
        document.getElementById(
            "orderNotes"
        );

    const preparedBy =
        document.getElementById(
            "preparedBy"
        );

    const freightEl =
        document.getElementById(
            "freight"
        );

    const specialDiscount =
        document.getElementById(
            "specialDiscount"
        );

    const gstPercent =
        document.getElementById(
            "gstPercent"
        );

    const hardwareDisc =
        document.getElementById(
            "hardwareDisc"
        );

    const bathroomDisc =
        document.getElementById(
            "bathroomDisc"
        );
    const stainlesssteelDisc =
        document.getElementById(
            "stainlesssteelDisc"
        );

    // -------- VALUES --------

    if (orderNo)
        orderNo.value =
            d.orderNo || "";

    if (orderDate)
        orderDate.value =
            d.orderDate || "";

    if (salesman)
        salesman.value =
            d.salesman || "";

    if (d.party) {

        if (partyName)
            partyName.value =
                d.party.name || "";

        if (partyAddress)
            partyAddress.value =
                d.party.address || "";

        if (partyType)
            partyType.value =
                d.party.type || "";

        if (partyGST)
            partyGST.value =
                d.party.gst || "";

        if (partyMobile)
            partyMobile.value =
                d.party.mobile || "";

        if (partyTransport)
            partyTransport.value =
                d.party.transport || "";

    }

    if (paymentType)
        paymentType.value =
            d.paymentType || "";

    if (dispatchDate)
        dispatchDate.value =
            d.dispatchDate || "";

    if (orderNotes)
        orderNotes.value =
            d.notes || "";

    if (preparedBy)
        preparedBy.value =
            d.preparedBy || "";

    if (freightEl)
        freightEl.value =
            d.freight || 0;

    if (specialDiscount)
        specialDiscount.value =
            d.specialDiscount || 0;

    if (gstPercent)
        gstPercent.value =
            d.gstPercent || 18;

    if (hardwareDisc)
        hardwareDisc.value =
            d.categoryDiscounts?.hardware || 0;

    if (bathroomDisc)
        bathroomDisc.value =
            d.categoryDiscounts?.bathroom || 0;

    if (stainlesssteelDisc)
        stainlesssteelDisc.value =
            d.categoryDiscounts?.stainlesssteel || 0;

    // -------- TABLE --------

    const tbody =
        document.getElementById(
            "tbody"
        );

    if (tbody) {

        tbody.innerHTML =
            "";

        if (
            d.items &&
            d.items.length > 0
        ) {

            d.items.forEach(
                item =>
                    addRow(item)
            );

        } else {

            addRow();

        }

    }

    if (
        typeof recalc ===
        "function"
    ) {

        recalc();

    }

})();

// ================= LOAD ORDER =================

window.loadOrderIntoForm =
    function (o) {

        document.getElementById(
            "orderNo"
        ).value =
            o.orderNo;

        document.getElementById(
            "orderDate"
        ).value =
            o.orderDate;

        document.getElementById(
            "salesman"
        ).value =
            o.salesman;

        document.getElementById(
            "partyName"
        ).value =
            o.party.name;

        document.getElementById(
            "partyType"
        ).value =
            o.party.type || "";

        document.getElementById(
            "partyMobile"
        ).value =
            o.party.mobile;

        document.getElementById(
            "partyGST"
        ).value =
            o.party.gst;

        document.getElementById(
            "partyAddress"
        ).value =
            o.party.address;

        document.getElementById(
            "partyTransport"
        ).value =
            o.party.transport;

        document.getElementById(
            "paymentType"
        ).value =
            o.paymentType;

        document.getElementById(
            "dispatchDate"
        ).value =
            o.dispatchDate;

        document.getElementById(
            "orderNotes"
        ).value =
            o.notes;

        const tbody =
            document.getElementById(
                "tbody"
            );

        tbody.innerHTML =
            "";

        o.items.forEach(
            item =>
                addRow(item)
        );

        document.getElementById(
            "freight"
        ).value =
            o.freight;

        document.getElementById(
            "specialDiscount"
        ).value =
            o.specialDiscount;

        document.getElementById(
            "gstPercent"
        ).value =
            o.gstPercent;

        document.getElementById(
            "hardwareDisc"
        ).value =
            o.categoryDiscounts?.hardware || 0;

        document.getElementById(
            "bathroomDisc"
        ).value =
            o.categoryDiscounts?.bathroom || 0;

        document.getElementById(
            "stainlesssteelDisc"
        ).value =
            o.categoryDiscounts?.stainlesssteel || 0;

        if (
            typeof recalc ===
            "function"
        ) {

            recalc();

        }

    };

// ================= FIRESTORE PRODUCT =================

async function addProductToFirestore(product) {

    try {

        const docRef =
            await addDoc(
                collection(
                    db,
                    "products"
                ),
                {
                    name:
                        product.name,

                    code:
                        product.code,

                    unit:
                        product.unit,

                    price:
                        product.price,

                    category:
                        product.category,

                    description:
                        product.description ||
                        "",

                    photo:
                        product.photo ||
                        "",

                    createdAt:
                        new Date()

                }
            );

        console.log(
            "Product added ID:",
            docRef.id
        );

    }

    catch (e) {

        console.error(
            "Firestore error:",
            e
        );

    }

}

// EXPORT

export {
    db,
    collection,
    addDoc,
    setDoc,
    doc
};