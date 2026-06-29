

document.getElementById("passwordModal").onclick = function (e) {
    if (e.target === this) this.style.display = "none";
}


const SALESMAN_PREFIX = {
    "Sariya Murtuza": "SM",
    "Roshan Sharma": "RS",
    "Rup Ranjan Bora": "RRB",
    "Ankit Kalra": "AK",
    "Amit Soni": "AS",
    "Vivek Srivastava": "VS", 
    "Mahesh Kumar": "MK",
};

// ⭐ Salesman-wise passwords
const SALESMAN_PASSWORDS = {
    "Sariya Murtuza": "sariya123",
    "Roshan Sharma": "roshan123",
    "Ankit Kalra": "ankit123",
    "Amit Soni": "amit123",
    "Vivek Srivastava": "vivek123",
    "Rup Ranjan Bora": "rup123",
    "Mahesh Kumar": "mahesh123",
};

function openPasswordModal() {

    let name = document.getElementById("salesman").value.trim();

    if (!name) {
        alert("Please select your name");
        return;
    }

    document.getElementById("passwordField").value = "";
    document.getElementById("errorMsg").style.display = "none";
    document.getElementById("passwordModal").style.display = "flex";
}

function verifyPassword() {

    let name =
        document.getElementById("salesman").value.trim();

    let password =
        document.getElementById("passwordField").value.trim();

    const errorMsg =
        document.getElementById("errorMsg");

    // ✅ User account created hai ya nahi

    if (!SALESMAN_PASSWORDS[name]) {

        errorMsg.innerHTML =
            "🔒 Your account is not activated yet. Contact Admin Team.";

        errorMsg.style.display =
            "block";

        return;
    }

    // ✅ Password Check

    if (password !== SALESMAN_PASSWORDS[name]) {

        errorMsg.innerHTML =
            "❌ Incorrect Password";

        errorMsg.style.display =
            "block";

        return;
    }

    // ✅ ROLE SET

    localStorage.setItem(
        "user_role",
        "sales"
    );

    localStorage.setItem(
        "user_name",
        name
    );

    localStorage.setItem(
        "salesman",
        name
    );

    localStorage.setItem(
        "loggedSalesman",
        name
    );

    localStorage.setItem(
        "prefix",
        SALESMAN_PREFIX[name]
    );

    localStorage.setItem(
        "loginTime",
        Date.now()
    );

    localStorage.removeItem(
        "admin"
    );

    window.location.href =
        "/sales-dashboard.html";
}
function togglePassword() {
    const passwordField = document.getElementById("passwordField");
    const icon = document.getElementById("togglePassword");

    if (passwordField.type === "password") {
        passwordField.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        passwordField.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

function goBack() {
    window.location.href = "https://oms.rankchahiye.com/";
}
function closeModal() {
    document.getElementById("passwordModal").style.display = "none";
}
// Disable right click
document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
});

// Disable common dev shortcut keys
document.addEventListener("keydown", function (e) {
    // F12
    if (e.key === "F12") {
        e.preventDefault();
        return false;
    }

    // Ctrl+Shift+I
    if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i")) {
        e.preventDefault();
        return false;
    }

    // Ctrl+Shift+J
    if (e.ctrlKey && e.shiftKey && (e.key === "J" || e.key === "j")) {
        e.preventDefault();
        return false;
    }

    // Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();

        return false;
    }

    // Ctrl+U
    if (e.ctrlKey && (e.key === "U" || e.key === "u")) {
        e.preventDefault();
        return false;
    }

    // Ctrl+S optional
    if (e.ctrlKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        return false;
    }
});


