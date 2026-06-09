
if (typeof itemMaster === "undefined") {
    alert("❌ Item Master not loaded. Please refresh.");
}

let selectedProduct = null;
let selectedProductId = null;

function renderProducts() {
    const productContainer = document.getElementById("product-list");
    if (!productContainer) return;

    productContainer.innerHTML = "";

    if (!window.itemMaster) {
        console.error("❌ itemMaster not loaded");
        return;
    }

    const selectedCategory = document.getElementById("categoryFilter")?.value || "all";
    const searchValue = document.getElementById("searchFilter")?.value.trim().toLowerCase() || "";
    const unitFilter = document.getElementById("unitFilter")?.value || "all";
    const priceFilter = document.getElementById("priceFilter")?.value || "all";

    Object.entries(window.itemMaster).forEach(([key, product]) => {
        const productName = (product.name || "").toLowerCase();
        const productCode = String(key).toLowerCase();

        // category filter
        if (selectedCategory !== "all" && product.category !== selectedCategory) return;

        // search filter: item code + product name
        if (
            searchValue &&
            !productName.includes(searchValue) &&
            !productCode.includes(searchValue)
        ) {
            return;
        }

        // units check
        if (!product.units || Object.keys(product.units).length === 0) return;

        // unit filter
        if (unitFilter !== "all" && !product.units[unitFilter]) return;

        // first valid unit price
        let unitPrice = null;
        for (const unit in product.units) {
            if (product.units[unit]?.rate) {
                unitPrice = product.units[unit].rate;
                break;
            }
        }
        if (unitPrice === null) return;

        // price filter
        if (priceFilter !== "all") {
            let min = 0;
            let max = Infinity;

            if (priceFilter === "0-100") {
                min = 0;
                max = 100;
            } else if (priceFilter === "100-500") {
                min = 100;
                max = 500;
            } else if (priceFilter === "500-1000") {
                min = 500;
                max = 1000;
            }

            if (unitPrice < min || unitPrice > max) return;
        }

        const productImage = product.photo || "https://www.petroindustech.com/images/hardware-products/114/1.webp";

        const productCard = document.createElement("div");

        productCard.innerHTML = `
            <div class="product-card">
                <div class="product-image-wrapper">
                    <span class="product-badge">#${key}</span>
                    <img src="${productImage}" class="product-image" alt="${product.name}">
                </div>

                <div class="product-info">
                    <h5 class="product-name">${product.name}</h5>

                    <div class="product-meta">
                        <span class="product-unit">Unit: ${Object.keys(product.units).join(" / ")}</span>
                        <span class="product-price">₹${unitPrice}</span>
                    </div>

                    <button class="add-cart-btn" onclick="showUnitSelection('${key}')">
                        <i class="fa fa-shopping-cart"></i> Add To Cart
                    </button>
                </div>
            </div>
        `;

        productContainer.appendChild(productCard);
    });
}

function showUnitSelection(productId) {
    selectedProduct = window.itemMaster[productId];
    selectedProductId = productId;

    if (!selectedProduct) return;

    const dropdown = document.getElementById("unitSelectionDropdown");
    dropdown.innerHTML = "";

    Object.keys(selectedProduct.units).forEach(unit => {
        const option = document.createElement("option");
        option.value = unit;
        option.textContent = `${unit} - ₹${selectedProduct.units[unit].rate}`;
        dropdown.appendChild(option);
    });

    selectedProduct.selectedUnit = dropdown.value;

    dropdown.addEventListener("change", function () {
        selectedProduct.selectedUnit = this.value;
    });

    document.getElementById("modalQty").value = 1;

    $("#unitModal").modal("show");
}
function addToCartWithUnit() {
    const selectedUnit = selectedProduct.selectedUnit;
    const unitPrice = selectedProduct.units[selectedUnit].rate;
    const quantity = parseInt(document.getElementById("modalQty").value) || 1;

    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    const index = cart.findIndex(item => item.name === selectedProduct.name && item.unit === selectedUnit);

    if (index === -1) {
        cart.push({
            code: selectedProductId,
            name: selectedProduct.name,
            price: unitPrice,
            unit: selectedUnit,
            quantity: quantity,
            category: selectedProduct.category
        });
    } else {
        cart[index].quantity += quantity;
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartBadge(cart);
    displayCartItems(cart);
    updateFixedCart();

    $("#unitModal").modal("hide");
}


function updateCartBadge(cart) {
    const cartBadge = document.getElementById("cartBadge");
    if (!cartBadge) return;

    const cartItemCount = cart.reduce((total, item) => total + item.quantity, 0);
    cartBadge.textContent = cartItemCount;
}

function displayCartItems(cart) {
    const cartItemsList = document.getElementById("cartItemsList");
    if (!cartItemsList) return;

    cartItemsList.innerHTML = "";

    if (cart.length === 0) {
        cartItemsList.innerHTML = "<span class='dropdown-item'>No items in cart</span>";
        return;
    }

    cart.forEach((item, index) => {
        const cartItem = document.createElement("div");
        cartItem.classList.add("dropdown-item");

        cartItem.innerHTML = `
            ${item.name} - ₹${item.price} x ${item.quantity}
            <button class="btn btn-danger btn-sm ml-2" onclick="removeItemFromCart(${index})">
                Remove
            </button>
        `;

        cartItemsList.appendChild(cartItem);
    });
}

function removeItemFromCart(index) {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart.splice(index, 1);
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartBadge(cart);
    displayCartItems(cart);
    updateFixedCart();
}

function initCart() {
    const cart = JSON.parse(localStorage.getItem("cart")) || [];
    updateCartBadge(cart);
    displayCartItems(cart);
    updateFixedCart();
}

document.addEventListener("DOMContentLoaded", function () {
    renderProducts();
    initCart();

    const searchFilter = document.getElementById("searchFilter");
    const categoryFilter = document.getElementById("categoryFilter");
    const unitFilter = document.getElementById("unitFilter");
    const priceFilter = document.getElementById("priceFilter");

    if (searchFilter) searchFilter.addEventListener("input", renderProducts);
    if (categoryFilter) categoryFilter.addEventListener("change", renderProducts);
    if (unitFilter) unitFilter.addEventListener("change", renderProducts);
    if (priceFilter) priceFilter.addEventListener("change", renderProducts);
});

function changeModalQty(delta) {
    const input = document.getElementById("modalQty");
    let val = parseInt(input.value);
    val += delta;
    if (val < 1) val = 1;
    input.value = val;
}
document.addEventListener("DOMContentLoaded", function () {

    const qtyInput = document.getElementById("modalQty");

    if (qtyInput) {

        qtyInput.addEventListener("input", function () {

            this.value = this.value.replace(/[^0-9]/g, "");

            if (this.value < 1) this.value = 1;

        });

    }

});
function updateFixedCart() {

    let cart = JSON.parse(localStorage.getItem("cart")) || [];

    let items = 0;
    let total = 0;

    cart.forEach(p => {
        items += p.quantity;
        total += p.price * p.quantity;
    });

    document.getElementById("cartCount").textContent = items;
    document.getElementById("cartAmount").textContent = total;

    if (items > 0) {
        document.getElementById("fixedCartBar").style.display = "flex";
    } else {
        document.getElementById("fixedCartBar").style.display = "none";
    }

}