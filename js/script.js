function toggleDarkMode() {
    const body = document.body;
    const toggle = document.getElementById("darkToggle");

    if (toggle.checked) {
        body.classList.add("dark");
        localStorage.setItem("petro_dark", true);
    } else {
        body.classList.remove("dark");
        localStorage.setItem("petro_dark", false);
    }
}

// Restore state on load
window.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("darkToggle");
    const saved = localStorage.getItem("petro_dark") === "true";

    toggle.checked = saved;
    if (saved) document.body.classList.add("dark");
});

function getStatusClass(status) {
    if (!status) return "status-pending";

    switch (status.toLowerCase()) {
        case "pending":
            return "status-pending";

        case "delivered":
            return "status-delivered";

        case "partial delivered":
            return "status-partial";

        case "cancelled":
            return "status-cancelled";

        case "hold":
            return "status-hold";

        default:
            return "status-pending";
    }
}
