// FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCdfQu5GCsBCyMHM7HX8GRzY-VTZaEMU5M",
  authDomain: "petro-oms.firebaseapp.com",
  projectId: "petro-oms",
  storageBucket: "petro-oms.firebasestorage.app",
  messagingSenderId: "562472760628",
  appId: "1:562472760628:web:3b4f4eda2c862b6e3ce161",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ADMIN LOGIN
function adminLogin() {

  const email =
    document.getElementById("email").value.trim();

  const password =
    document.getElementById("password").value.trim();

  auth.signInWithEmailAndPassword(email, password)

    .then(() => {

      // ✅ ADMIN ROLE
      localStorage.setItem(
        "user_role",
        "admin"
      );

      // ✅ ADMIN NAME
      localStorage.setItem(
        "user_name",
        "Admin"
      );

      // ❌ SALES DATA CLEAR
      localStorage.removeItem("salesman");

      localStorage.removeItem("loggedSalesman");

      localStorage.removeItem("prefix");

      // ✅ SUCCESS POPUP
      showPopup(
        "success",
        "Login Successful",
        "Welcome to PETRO OMS Dashboard"
      );

      // ✅ REDIRECT
      setTimeout(() => {

        window.location.href =
          "/admin-dashboard.html";

      }, 1200);

    })

    .catch(() => {

      showPopup(
        "error",
        "Login Failed",
        "Wrong email or password"
      );

    });

}


// important fix
window.adminLogin = adminLogin;

function showPopup(type, title, message) {
  const modal = document.getElementById("popupModal");
  const icon = document.getElementById("modalIcon");
  const modalTitle = document.getElementById("modalTitle");
  const modalMessage = document.getElementById("modalMessage");

  if (type === "success") {
    icon.innerHTML = "✅";
    modalTitle.style.color = "#108082";
  } else {
    icon.innerHTML = "❌";
    modalTitle.style.color = "#d93025";
  }

  modalTitle.innerText = title;
  modalMessage.innerText = message;
  modal.style.display = "flex";
}

function closePopup() {
  document.getElementById("popupModal").style.display = "none";
}

const btn =
document.getElementById(
"loginBtn"
);

btn.disabled = true;

btn.innerHTML =
"Logging in...";