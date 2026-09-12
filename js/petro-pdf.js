/* =========================================================
   PETRO OMS - UNIFIED ORDER / QUOTATION PDF
   Build: 2026.09.12.5 - Full-root anti-crop capture
   Use this same file from Create Order + Sales Dashboard.
   Requires html2pdf.js on the page.
   ========================================================= */
(function (global) {
  "use strict";

  const BRAND = {
    teal: "#108082",
    tealDark: "#075e61",
    tealSoft: "#e7f3f3",
    border: "#aeb8b8",
    text: "#20252a",
    website: "www.petroindustech.com",
    phone: "+91-8000007336",
    email: "contact@petroindustech.com",
    company: "PETRO INDUSTECH PVT. LTD."
  };

  function n(value) {
    const x = Number(value);
    return Number.isFinite(x) ? x : 0;
  }

  function money(value) {
    return n(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function esc(value) {
    return String(value ?? "-")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeOrder(order = {}) {
    const party = order.party || order.partyDetails || {};
    const rawItems =
      order.cartItems ||
      order.items ||
      order.orderItems ||
      order.productList ||
      [];

    const items = Array.isArray(rawItems)
      ? rawItems.map((item) => {
          const qty = n(item.qty ?? item.quantity);
          const rate = n(item.rate ?? item.price);
          const amount = n(item.amount || qty * rate);
          return {
            code: item.code || item.itemCode || "-",
            name:
              item.itemName ||
              item.productName ||
              item.name ||
              item.description ||
              "-",
            unit: item.unit || item.uom || "-",
            qty,
            rate,
            amount
          };
        })
      : [];

    return {
      orderNo: order.orderNo || party.orderNo || "PETRO-ORDER",
      orderDate: order.orderDate || party.orderDate || "-",
      salesman:
        order.salesman ||
        order.salesmanName ||
        localStorage.getItem("loggedSalesman") ||
        localStorage.getItem("salesman") ||
        "-",
      status: order.status || "Pending",
      notes: order.notes || order.orderNotes || "",
      party: {
        name: order.partyName || party.name || party.partyName || "-",
        mobile:
          order.partyMobile ||
          order.mobile ||
          party.mobile ||
          party.partyMobile ||
          "-",
        city:
          order.partyCity ||
          order.city ||
          party.city ||
          party.partyCity ||
          party.address ||
          "-",
        gst:
          order.partyGST ||
          order.gst ||
          party.gst ||
          party.partyGST ||
          "-",
        type:
          order.partyType ||
          party.type ||
          party.partyType ||
          "-",
        distributor:
          order.distributor ||
          order.partyDistributor ||
          party.distributor ||
          party.partyDistributor ||
          party.transport ||
          "-"
      },
      items,
      categoryDiscounts: {
        hardware: n(order.categoryDiscounts?.hardware),
        bathroom: n(order.categoryDiscounts?.bathroom),
        stainlesssteel: n(
          order.categoryDiscounts?.stainlesssteel ??
          order.categoryDiscounts?.stainlessSteel
        )
      },
      freight: n(order.freight),
      specialDiscount: n(order.specialDiscount),
      gstAmount: n(order.gstAmount),
      subTotal: n(order.subTotal ?? order.subtotal),
      grandTotal: n(order.grandTotal)
    };
  }

  function filename(order) {
    const o = normalizeOrder(order);
    const safe = String(o.orderNo || "PETRO-ORDER")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${safe}-PETRO-OMS.pdf`;
  }

  function getLogoUrl(options = {}) {
    if (options.logoUrl) return options.logoUrl;
    try {
      return new URL("/images/logo.webp", window.location.origin).href;
    } catch (_) {
      return "/images/logo.webp";
    }
  }

  function buildRows(o) {
    if (!o.items.length) {
      return '<tr><td colspan="7" class="center empty">No items</td></tr>';
    }

    return o.items.map((item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${esc(item.code)}</td>
        <td class="item-name">${esc(item.name)}</td>
        <td class="center">${esc(item.unit)}</td>
        <td class="num">${item.qty}</td>
        <td class="num">${money(item.rate)}</td>
        <td class="num">${money(item.amount)}</td>
      </tr>
    `).join("");
  }

  function buildDiscountRows(o) {
    // Keep the three category rows to match the approved PETRO sample PDF.
    return `
      <div><span>Hardware Discount</span><b>${money(o.categoryDiscounts.hardware)}%</b></div>
      <div><span>Bathroom Discount</span><b>${money(o.categoryDiscounts.bathroom)}%</b></div>
      <div><span>SS Discount</span><b>${money(o.categoryDiscounts.stainlesssteel)}%</b></div>
      <div><span>Special Discount</span><b>Rs. ${money(o.specialDiscount)}</b></div>
    `;
  }

  function sheetHTML(order, options = {}) {
    const o = normalizeOrder(order);
    const logoUrl = getLogoUrl(options);
    const rows = buildRows(o);

    const distributorLine =
      o.party.type === "Secondary" && o.party.distributor && o.party.distributor !== "-"
        ? `<div class="line"><span class="label">Distributor:</span>${esc(o.party.distributor)}</div>`
        : "";

    return `
      <div class="petro-pdf-sheet" id="petroPdfSheet">
        <div class="petro-watermark">PETRO OMS</div>

        <div class="petro-header">
          <img class="petro-logo" src="${esc(logoUrl)}" alt="PETRO">
          <div class="petro-company">
            <strong>${BRAND.company}</strong><br>
            Phone: ${BRAND.phone}<br>
            Email: ${BRAND.email}
          </div>
        </div>

        <div class="petro-title">ORDER / QUOTATION</div>

        <div class="petro-meta">
          <div class="petro-box">
            <h3>Party Details</h3>
            <div class="line"><span class="label">Name:</span>${esc(o.party.name)}</div>
            <div class="line"><span class="label">Mobile:</span>${esc(o.party.mobile)}</div>
            <div class="line"><span class="label">City:</span>${esc(o.party.city)}</div>
            <div class="line"><span class="label">GST:</span>${esc(o.party.gst)}</div>
            ${distributorLine}
          </div>

          <div class="petro-box">
            <h3>Order Details</h3>
            <div class="line"><span class="label">Order No:</span>${esc(o.orderNo)}</div>
            <div class="line"><span class="label">Date:</span>${esc(o.orderDate)}</div>
            <div class="line"><span class="label">Status:</span>${esc(o.status)}</div>
            <div class="line"><span class="label">Salesman:</span>${esc(o.salesman)}</div>
            <div class="line"><span class="label">Party Type:</span>${esc(o.party.type)}</div>
          </div>
        </div>

        <table class="petro-items-table">
          <thead>
            <tr>
              <th style="width:5%">S.No.</th>
              <th style="width:12%">Code</th>
              <th>Item Name</th>
              <th style="width:9%">Unit</th>
              <th style="width:8%">Qty</th>
              <th style="width:14%">Rate (Rs.)</th>
              <th style="width:16%">Amount (Rs.)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="petro-finance">
          <div class="petro-discounts">
            <div class="petro-finance-title">DISCOUNT BREAKUP</div>
            ${buildDiscountRows(o)}
          </div>

          <div class="petro-summary">
            <div><span>Subtotal</span><b>Rs. ${money(o.subTotal)}</b></div>
            <div><span>Freight</span><b>Rs. ${money(o.freight)}</b></div>
            <div><span>Special Discount</span><b>Rs. ${money(o.specialDiscount)}</b></div>
            <div><span>GST</span><b>Rs. ${money(o.gstAmount)}</b></div>
            <div class="grand"><span>Grand Total</span><span>Rs. ${money(o.grandTotal)}</span></div>
          </div>
        </div>

        <div class="petro-terms">
          <b>Terms &amp; Conditions</b><br>
          1. Goods once sold will not be taken back.<br>
          2. Subject to company terms and applicable jurisdiction.
          ${o.notes ? `<div class="petro-note"><b>Order Note:</b> ${esc(o.notes)}</div>` : ""}
        </div>

        <div class="petro-footer">
          <div>This is a computer-generated document.</div>
          <div class="petro-sign">Authorised Signatory</div>
        </div>

        <div class="petro-website">
          Generated from Petro OMS | ${BRAND.website}
        </div>
      </div>
    `;
  }

  function styles() {
    return `
      .petro-pdf-root{
        position:absolute;
        left:0;
        top:0;
        width:794px;
        background:#fff;
        font-family:Arial,sans-serif;
        color:${BRAND.text};
        z-index:-9999;
        pointer-events:none;
      }
      .petro-pdf-sheet{
        width:770px;
        margin:0 12px;
        background:#fff;
        border:1px solid ${BRAND.teal};
        position:relative;
        overflow:visible;
      }
      .petro-pdf-sheet>*:not(.petro-watermark){position:relative;z-index:1}
      .petro-watermark{
        position:absolute;z-index:0;left:50%;top:53%;
        transform:translate(-50%,-50%) rotate(-35deg);
        color:${BRAND.teal};opacity:.045;font-size:72px;font-weight:800;
        letter-spacing:9px;white-space:nowrap;pointer-events:none
      }
      .petro-header{
        display:flex;justify-content:space-between;align-items:center;
        padding:15px 18px;border-bottom:3px solid ${BRAND.teal}
      }
      .petro-logo{max-width:190px;max-height:58px;object-fit:contain}
      .petro-company{text-align:right;line-height:1.45;font-size:11px}
      .petro-company strong{color:${BRAND.teal};font-size:18px}
      .petro-title{
        background:${BRAND.teal};color:#fff;text-align:center;
        font-size:18px;font-weight:700;letter-spacing:1px;padding:9px
      }
      .petro-meta{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #9aa}
      .petro-box{padding:12px 15px;min-height:108px}
      .petro-box+.petro-box{border-left:1px solid #9aa}
      .petro-box h3{color:${BRAND.teal};font-size:13px;margin:0 0 8px;text-transform:uppercase}
      .line{margin:4px 0;font-size:11px;line-height:1.35}
      .label{display:inline-block;width:82px;font-weight:700}
      .petro-items-table{width:100%;border-collapse:collapse}
      .petro-items-table th{
        background:${BRAND.tealSoft};color:${BRAND.tealDark};font-weight:700
      }
      .petro-items-table th,.petro-items-table td{
        border:1px solid ${BRAND.border};padding:7px 6px;font-size:10.5px
      }
      .petro-items-table .center{text-align:center}
      .petro-items-table .num{text-align:right;white-space:nowrap}
      .petro-items-table .item-name{text-align:left;font-weight:600}
      .petro-items-table .empty{padding:24px;color:#777}
      .petro-finance{
        display:grid;grid-template-columns:57% 43%;width:100%;
        border-bottom:1px solid #9aa
      }
      .petro-discounts{min-height:100%;border-right:1px solid #9aa}
      .petro-finance-title{
        background:${BRAND.tealSoft};color:${BRAND.tealDark};
        font-size:12px;font-weight:700;padding:8px 12px;border-bottom:1px solid ${BRAND.border}
      }
      .petro-discounts>div:not(.petro-finance-title){
        display:flex;align-items:center;justify-content:space-between;
        gap:15px;padding:7px 12px;border-bottom:1px solid #ccd3d3;font-size:10.5px
      }
      .petro-discounts>div:last-child{border-bottom:none}
      .petro-discounts b{color:${BRAND.tealDark};white-space:nowrap}
      .petro-summary{width:100%}
      .petro-summary div{
        display:flex;align-items:center;justify-content:space-between;
        gap:15px;padding:7px 12px;border-bottom:1px solid #ccd3d3;font-size:10.5px
      }
      .petro-summary b,.petro-summary span:last-child{white-space:nowrap}
      .petro-summary .grand{
        background:${BRAND.teal};color:#fff;font-size:15px;font-weight:700
      }
      .petro-terms{min-height:75px;padding:12px 15px;border-top:1px solid #9aa;font-size:10.5px}
      .petro-note{margin-top:7px;padding-top:6px;border-top:1px dashed #ccd3d3}
      .petro-footer{
        display:flex;justify-content:space-between;align-items:end;
        min-height:85px;padding:12px 15px;border-top:1px solid #9aa;font-size:10px
      }
      .petro-sign{text-align:center;width:210px;padding-top:40px;border-bottom:1px solid #333}
      .petro-website{
        text-align:center;padding:8px;color:${BRAND.tealDark};
        font-weight:700;border-top:1px solid #ccd3d3;font-size:10px
      }
    `;
  }

  function ensureHtml2Pdf() {
    if (typeof global.html2pdf === "undefined") {
      throw new Error("html2pdf library is not loaded");
    }
  }

  async function createBlob(order, options = {}) {
    ensureHtml2Pdf();

    const previousScrollX = window.scrollX;
    const previousScrollY = window.scrollY;
    const previousBodyOverflowX = document.body.style.overflowX;
    const previousHtmlOverflowX = document.documentElement.style.overflowX;

    // IMPORTANT:
    // On mobile / DevTools responsive mode the page viewport can be narrower
    // than the quotation. We render the PDF in a fixed desktop-sized capture
    // layer and temporarily force the document back to horizontal origin.
    window.scrollTo(0, 0);
    document.body.style.overflowX = "visible";
    document.documentElement.style.overflowX = "visible";

    const root = document.createElement("div");
    root.className = "petro-pdf-root";

    Object.assign(root.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "794px",
      minWidth: "794px",
      maxWidth: "794px",
      height: "auto",
      margin: "0",
      padding: "0",
      background: "#ffffff",
      overflow: "visible",
      zIndex: "-2147483647",
      pointerEvents: "none",
      transform: "none",
      zoom: "1"
    });

    root.innerHTML = `<style>${styles()}</style>${sheetHTML(order, options)}`;
    document.body.appendChild(root);

    try {
      const images = [...root.querySelectorAll("img")];

      await Promise.all(
        images.map(async (img) => {
          if (img.complete) {
            try { await img.decode?.(); } catch (_) {}
            return;
          }

          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      // Let layout settle after image decoding.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const sheet = root.querySelector(".petro-pdf-sheet");

      if (!sheet) {
        throw new Error("PDF quotation sheet not found");
      }

      // Lock the sheet to a desktop/A4-safe CSS width regardless of phone viewport.
      Object.assign(sheet.style, {
        width: "770px",
        minWidth: "770px",
        maxWidth: "770px",
        margin: "0 12px",
        transform: "none",
        zoom: "1",
        overflow: "visible"
      });

      const captureWidth = 794;
      const captureHeight = Math.ceil(Math.max(
        root.scrollHeight,
        root.offsetHeight,
        root.getBoundingClientRect().height
      )) + 4;

      const opt = {
        filename: filename(order),
        margin: [5, 5, 5, 5],

        image: {
          type: "jpeg",
          quality: 0.98
        },

        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,

          // Capture the complete fixed-width root. Do not force x/y document coordinates.
          scrollX: 0,
          scrollY: 0,
          width: captureWidth,
          height: captureHeight,
          windowWidth: 1200,
          windowHeight: captureHeight,

          onclone: function (clonedDoc) {
            clonedDoc.documentElement.style.width = captureWidth + "px";
            clonedDoc.documentElement.style.minWidth = captureWidth + "px";
            clonedDoc.documentElement.style.maxWidth = captureWidth + "px";
            clonedDoc.documentElement.style.overflow = "visible";

            clonedDoc.body.style.width = captureWidth + "px";
            clonedDoc.body.style.minWidth = captureWidth + "px";
            clonedDoc.body.style.maxWidth = captureWidth + "px";
            clonedDoc.body.style.margin = "0";
            clonedDoc.body.style.padding = "0";
            clonedDoc.body.style.overflow = "visible";
            clonedDoc.body.style.transform = "none";
            clonedDoc.body.style.zoom = "1";

            const clonedRoot = clonedDoc.querySelector(".petro-pdf-root");
            const clonedSheet = clonedDoc.querySelector(".petro-pdf-sheet");

            if (clonedRoot) {
              Object.assign(clonedRoot.style, {
                position: "absolute",
                left: "0px",
                top: "0px",
                width: "794px",
                minWidth: "794px",
                maxWidth: "794px",
                margin: "0",
                padding: "0",
                overflow: "visible",
                transform: "none",
                zoom: "1",
                zIndex: "0",
                background: "#ffffff"
              });
            }

            if (clonedSheet) {
              Object.assign(clonedSheet.style, {
                width: "770px",
                minWidth: "770px",
                maxWidth: "770px",
                margin: "0 12px",
                overflow: "visible",
                transform: "none",
                zoom: "1"
              });
            }
          }
        },

        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
          compress: true
        },

        pagebreak: {
          mode: ["css", "legacy"],
          avoid: [
            ".petro-header",
            ".petro-meta",
            ".petro-finance",
            ".petro-terms",
            ".petro-footer"
          ]
        }
      };

      return await global.html2pdf()
        .set(opt)
        .from(root)
        .outputPdf("blob");

    } finally {
      root.remove();

      document.body.style.overflowX = previousBodyOverflowX;
      document.documentElement.style.overflowX = previousHtmlOverflowX;

      // Restore the user's original page position.
      window.scrollTo(previousScrollX, previousScrollY);
    }
  }

  async function download(order, options = {}) {
    const blob = await createBlob(order, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename(order);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
    return filename(order);
  }

  async function share(order, options = {}) {
    const blob = await createBlob(order, options);
    const name = filename(order);
    const file = new File([blob], name, { type: "application/pdf" });
    const data = {
      files: [file],
      title: `PETRO OMS - ${normalizeOrder(order).orderNo}`,
      text: `Order / Quotation ${normalizeOrder(order).orderNo}`
    };

    if (navigator.share && navigator.canShare && navigator.canShare(data)) {
      await navigator.share(data);
      return true;
    }

    await download(order, options);
    return false;
  }

  function preview(order, options = {}) {
    const o = normalizeOrder(order);
    const w = window.open("", "_blank", "width=1000,height=850");
    if (!w) throw new Error("Please allow pop-ups to preview/print PDF.");

    const doc = w.document;
    doc.open();
    doc.write(`<!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${esc(o.orderNo)} - PETRO OMS</title>
        <style>
          *{box-sizing:border-box}
          body{margin:0;padding:18px;background:#eef3f5;font-family:Arial,sans-serif}
          .petro-preview-toolbar{
            position:sticky;top:8px;z-index:50;max-width:794px;margin:0 auto 10px;
            display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap
          }
          .petro-preview-toolbar button{
            border:0;border-radius:22px;padding:10px 15px;color:#fff;
            font-weight:700;cursor:pointer
          }
          .p-download{background:#108082}.p-share{background:#25d366}.p-print{background:#334155}
          .petro-preview-wrap{width:794px;margin:auto;background:#fff;box-shadow:0 12px 30px #0002}
          ${styles().replaceAll(".petro-pdf-root", ".petro-preview-wrap")}
          @media print{
            body{padding:0;background:#fff}
            .petro-preview-toolbar{display:none!important}
            .petro-preview-wrap{box-shadow:none;margin:0;width:100%}
            .petro-pdf-sheet{width:100%;max-width:770px;margin:0 auto;border:1px solid #108082}
          }
          @media(max-width:820px){
            body{padding:8px}
            .petro-preview-wrap{transform-origin:top left}
          }
        </style>
      </head>
      <body>
        <div class="petro-preview-toolbar">
          <button class="p-download" id="petroPreviewDownload">Download PDF</button>
          <button class="p-share" id="petroPreviewShare">Share PDF</button>
          <button class="p-print" id="petroPreviewPrint">Print</button>
        </div>
        <div class="petro-preview-wrap">${sheetHTML(o, options)}</div>
      </body>
      </html>`);
    doc.close();

    doc.getElementById("petroPreviewPrint")?.addEventListener("click", () => w.print());
    doc.getElementById("petroPreviewDownload")?.addEventListener("click", () => {
      w.opener.PetroPDF.download(order, options).catch((e) => w.alert(e.message));
    });
    doc.getElementById("petroPreviewShare")?.addEventListener("click", () => {
      w.opener.PetroPDF.share(order, options).catch((e) => w.alert(e.message));
    });

    if (options.autoPrint) {
      w.addEventListener("load", () => setTimeout(() => w.print(), 350));
    }
    return w;
  }

  global.PetroPDF = {
    normalizeOrder,
    filename,
    createBlob,
    download,
    share,
    preview
  };
})(window);