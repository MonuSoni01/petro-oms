/* ======================================================
   DEV ACCESS LOCK (NO HTML REQUIRED)
====================================================== */

const DEV_PASSWORD = "2003";

let devUnlocked = false;

// Create Modal Dynamically
(function createDevModal() {

    const modal = document.createElement("div");

    modal.id = "devLockModal";

    modal.innerHTML = `
        <div id="devOverlay">
            <div id="devBox">

                <div id="devIcon">
                    🔒
                </div>

                <h3>Developer Access</h3>

                <p>
                    Enter password to continue
                </p>

                <input
                    type="password"
                    id="devPassword"
                    placeholder="Enter Password"
                >

                <div id="devError">
                    Wrong Password
                </div>

                <div id="devBtns">

                    <button id="devCancel">
                        Cancel
                    </button>

                    <button id="devUnlock">
                        Unlock
                    </button>

                </div>

            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const style = document.createElement("style");

    style.innerHTML = `
    
    #devOverlay{
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.55);
        backdrop-filter:blur(5px);
        z-index:99999999;
        display:none;
        align-items:center;
        justify-content:center;
    }

    #devBox{
        width:95%;
        max-width:380px;
        background:#fff;
        border-radius:18px;
        padding:25px;
        text-align:center;
        box-shadow:0 20px 50px rgba(0,0,0,.25);
        animation:devPop .25s ease;
    }

    @keyframes devPop{
        from{
            transform:scale(.9);
            opacity:0;
        }
        to{
            transform:scale(1);
            opacity:1;
        }
    }

    #devIcon{
        width:70px;
        height:70px;
        margin:auto;
        border-radius:50%;
        background:#108282;
        color:#fff;
        font-size:30px;
        display:flex;
        align-items:center;
        justify-content:center;
        margin-bottom:15px;
    }

    #devBox h3{
        margin:0;
        color:#222;
    }

    #devBox p{
        color:#666;
        margin:10px 0 20px;
    }

    #devPassword{
        width:100%;
        height:45px;
        border:1px solid #ddd;
        border-radius:10px;
        padding:0 12px;
        outline:none;
    }

    #devPassword:focus{
        border-color:#108282;
    }

    #devError{
        display:none;
        color:#dc3545;
        margin-top:10px;
        font-size:13px;
        font-weight:600;
    }

    #devBtns{
        display:flex;
        gap:10px;
        margin-top:20px;
    }

    #devBtns button{
        flex:1;
        height:42px;
        border:none;
        border-radius:10px;
        cursor:pointer;
        font-weight:600;
    }

    #devCancel{
        background:#eee;
    }

    #devUnlock{
        background:#108282;
        color:#fff;
    }

    `;

    document.head.appendChild(style);

})();

function openDevModal() {

    document
        .getElementById("devOverlay")
        .style.display = "flex";

    document
        .getElementById("devPassword")
        .focus();

}

function closeDevModal() {

    document
        .getElementById("devOverlay")
        .style.display = "none";

    document
        .getElementById("devPassword")
        .value = "";

}

document.addEventListener("click", function (e) {

    if (e.target.id === "devCancel") {
        closeDevModal();
    }

    if (e.target.id === "devUnlock") {

        const pass =
            document.getElementById("devPassword").value;

        if (pass === DEV_PASSWORD) {

            devUnlocked = true;

            closeDevModal();

            alert("✅ Developer Access Granted");

        } else {

            document
                .getElementById("devError")
                .style.display = "block";

        }

    }

});

// Enter key support
document.addEventListener("keydown", function (e) {

    if (
        document.getElementById("devOverlay")
            .style.display === "flex"
        &&
        e.key === "Enter"
    ) {

        document
            .getElementById("devUnlock")
            .click();
    }

});

// Right Click
document.addEventListener("contextmenu", function (e) {

    if (devUnlocked) return;

    e.preventDefault();

    openDevModal();

});

// F12
document.addEventListener("keydown", function (e) {

    if (devUnlocked) return;

    const key = e.key.toUpperCase();

    if (e.key === "F12") {

        e.preventDefault();

        openDevModal();

    }

    if (
        e.ctrlKey &&
        e.shiftKey &&
        ["I", "J", "C"].includes(key)
    ) {

        e.preventDefault();

        openDevModal();

    }

    if (
        e.ctrlKey &&
        key === "U"
    ) {

        e.preventDefault();

        openDevModal();

    }

});