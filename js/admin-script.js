// DARK MODE
document.getElementById("darkToggle").onclick = () => {
    document.body.classList.toggle("dark-mode");
};

// CHART JS SAMPLES
new Chart(document.getElementById("salesChart"), {
    type: "line",
    data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May"],
        datasets: [{
            label: "Sales",
            data: [120, 150, 180, 220, 260],
            borderColor: "#108082",
            fill: false
        }]
    }
});

new Chart(document.getElementById("salesmanChart"), {
    type: "bar",
    data: {
        labels: ["Amit", "Ankit", "Vivek", "Ajay"],
        datasets: [{
            label: "Orders",
            data: [40, 27, 32, 18],
            backgroundColor: "#108082"
        }]
    }
});
