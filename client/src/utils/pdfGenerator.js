// client/src/utils/pdfGenerator.js
import { jsPDF } from "jspdf";

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  navy:       [11,  16,  32],
  navyMid:    [17,  28,  52],
  navyLight:  [26,  42,  74],
  navyBorder: [38,  58,  100],
  lemon:      [245, 230, 66],
  orange:     [255, 138, 0],
  white:      [255, 255, 255],
  gray:       [140, 155, 180],
  grayLight:  [190, 200, 220],
  green:      [34,  197, 94],
};

const METHOD_LABELS = {
  USD_CASH:     "USD Efectivo",
  USDT:         "USDT",
  ARS_TRANSFER: "Transferencia ARS",
  ARS_CASH:     "Efectivo ARS",
};
const METHOD_COLORS = {
  USD_CASH:     [34,  197, 94],
  USDT:         [59,  130, 246],
  ARS_TRANSFER: [167, 139, 250],
  ARS_CASH:     [245, 230, 66],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(v) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(v); }
}
function fmtUSD(v) {
  if (v == null || v === "") return "-";
  return `USD ${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtARS(v) {
  if (v == null || v === "") return "-";
  return `ARS ${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;
}

// ── Fondo completo ────────────────────────────────────────────────────────────
function paintBackground(doc, w, h) {
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, w, h, "F");
}

// ── Header ────────────────────────────────────────────────────────────────────
function drawHeader(doc, w, docTitle, docNumber, dateStr) {
  // Banda fondo
  doc.setFillColor(...C.navyMid);
  doc.rect(0, 0, w, 56, "F");

  // Acento izquierdo lemon
  doc.setFillColor(...C.lemon);
  doc.rect(0, 0, 5, 56, "F");

  // Acento derecho naranja
  doc.setFillColor(...C.orange);
  doc.rect(w - 5, 0, 5, 56, "F");

  // Bloque decorativo esquina superior derecha
  doc.setFillColor(...C.navyLight);
  doc.roundedRect(w - 90, 0, 85, 56, 0, 0, "F");

  // ── LEMON'S logo ──
  doc.setTextColor(...C.lemon);
  doc.setFontSize(28); doc.setFont("helvetica", "bold");
  doc.text("LEMON'S", 14, 25);

  doc.setTextColor(...C.gray);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("Logística Internacional", 14, 33);
  doc.text("lemonsarg.com", 14, 39);

  // Línea separadora vertical
  doc.setDrawColor(...C.navyBorder);
  doc.setLineWidth(0.5);
  doc.line(w - 92, 8, w - 92, 48);

  // ── Título documento ──
  doc.setTextColor(...C.white);
  doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text(docTitle, w - 14, 16, { align: "right" });

  // Número prominente con fondo lemon
  doc.setFillColor(...C.lemon);
  doc.roundedRect(w - 14 - 60, 20, 60, 12, 3, 3, "F");
  doc.setTextColor(...C.navy);
  doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text(docNumber, w - 14 - 30, 28.5, { align: "center" });

  // Fecha
  doc.setTextColor(...C.gray);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text(dateStr, w - 14, 42, { align: "right" });

  return 66;
}

// ── Título de sección ─────────────────────────────────────────────────────────
function drawSection(doc, w, y, title) {
  doc.setFillColor(...C.navyMid);
  doc.roundedRect(14, y, w - 28, 9, 2, 2, "F");
  doc.setFillColor(...C.lemon);
  doc.roundedRect(14, y, 4, 9, 1, 1, "F");
  doc.setTextColor(...C.lemon);
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
  doc.text(title.toUpperCase(), 22, y + 6.2);
  return y + 15;
}

// ── Fila dato ─────────────────────────────────────────────────────────────────
function drawRow(doc, w, label, value, y, shade = false) {
  if (shade) {
    doc.setFillColor(...C.navyLight);
    doc.rect(14, y - 5, w - 28, 9, "F");
  }
  doc.setTextColor(...C.gray);
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  doc.text(label, 20, y);
  doc.setTextColor(...C.white);
  doc.text(String(value ?? "-"), w - 20, y, { align: "right" });
  return y + 9;
}

// ── Divider ───────────────────────────────────────────────────────────────────
function drawDivider(doc, w, y) {
  doc.setDrawColor(...C.navyBorder);
  doc.setLineWidth(0.3);
  doc.line(14, y, w - 14, y);
  return y + 8;
}

// ── Footer ────────────────────────────────────────────────────────────────────
function drawFooter(doc, w, h) {
  doc.setFillColor(...C.navyMid);
  doc.rect(0, h - 22, w, 22, "F");
  doc.setFillColor(...C.lemon);
  doc.rect(0, h - 22, 5, 22, "F");
  doc.setFillColor(...C.orange);
  doc.rect(w - 5, h - 22, 5, 22, "F");

  doc.setTextColor(...C.gray);
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
  doc.text("LEMON'S Logística Internacional  ·  lemonsarg.com", 14, h - 12);
  doc.text(`Generado el ${new Date().toLocaleString("es-AR")}`, 14, h - 7);

  doc.setTextColor(...C.lemon);
  doc.text("Documento no válido como factura fiscal", w - 14, h - 7, { align: "right" });
}

// ── Tarjeta cliente ───────────────────────────────────────────────────────────
function drawClientCard(doc, w, y, name, clientNumber, email, badgeLabel) {
  const cardH = 34;
  doc.setFillColor(...C.navyMid);
  doc.roundedRect(14, y, w - 28, cardH, 4, 4, "F");
  doc.setFillColor(...C.lemon);
  doc.roundedRect(14, y, 5, cardH, 2, 2, "F");

  // Avatar círculo
  doc.setFillColor(...C.lemon);
  doc.circle(32, y + cardH / 2, 9, "F");
  doc.setTextColor(...C.navy);
  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text(String(name || "?")[0].toUpperCase(), 32, y + cardH / 2 + 4, { align: "center" });

  // Datos
  doc.setTextColor(...C.white);
  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text(name || "-", 47, y + 11);

  doc.setTextColor(...C.gray);
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  if (clientNumber) doc.text(`Cliente #${clientNumber}`, 47, y + 19);
  if (email && email !== "-") doc.text(email, 47, y + 26);

  // Badge derecha
  if (badgeLabel) {
    doc.setTextColor(...C.lemon);
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text(badgeLabel, w - 20, y + 14, { align: "right" });
    doc.setTextColor(...C.gray);
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text("N° DE DOCUMENTO", w - 20, y + 21, { align: "right" });
  }

  return y + cardH + 8;
}

// ── Bloque total ──────────────────────────────────────────────────────────────
function drawTotalBlock(doc, w, y, label, valueUSD, valueARS, accentColor) {
  const accent = accentColor || C.lemon;
  doc.setFillColor(...C.navyMid);
  doc.roundedRect(w - 14 - 85, y, 85, 24, 4, 4, "F");
  doc.setFillColor(...accent);
  doc.roundedRect(w - 14 - 85, y, 5, 24, 2, 2, "F");

  doc.setTextColor(...C.gray);
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text(label, w - 14 - 40, y + 8, { align: "center" });

  doc.setTextColor(...accent);
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text(valueUSD, w - 18, y + 19, { align: "right" });

  if (valueARS) {
    doc.setTextColor(...C.gray);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`= ${valueARS}`, w - 18, y + 28, { align: "right" });
    return y + 36;
  }
  return y + 30;
}

// ══════════════════════════════════════════════════════════════════════════════
// RECIBO DE PAGO
// ══════════════════════════════════════════════════════════════════════════════
export function generatePaymentReceipt(payment, shipments = []) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.width;
  const h = doc.internal.pageSize.height;

  paintBackground(doc, w, h);

  const recNum  = `REC-${String(payment.id || "").padStart(6, "0")}`;
  const dateStr = fmtDate(payment.created_at);
  const method  = payment.method || "";
  const mLabel  = METHOD_LABELS[method] || method || "-";
  const mColor  = METHOD_COLORS[method] || C.gray;

  let y = drawHeader(doc, w, "RECIBO DE PAGO", recNum, dateStr);

  // ── Cliente ───────────────────────────────────────────────────────────────
  y = drawSection(doc, w, y, "Datos del cliente");
  y = drawClientCard(doc, w, y,
    payment.client_name,
    payment.client_number,
    payment.client_email || payment.email || null,
    recNum
  );

  // ── Método de pago (badge visual) ─────────────────────────────────────────
  y = drawSection(doc, w, y, "Detalle del pago");

  // Tarjeta método destacada
  doc.setFillColor(...mColor);
  doc.roundedRect(14, y, 80, 14, 3, 3, "F");
  doc.setTextColor(...C.navy);
  doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text(mLabel, 54, y + 9, { align: "center" });

  // Info fecha a la derecha de la tarjeta
  doc.setTextColor(...C.gray);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("Fecha del cobro:", 100, y + 6);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.text(dateStr, 100, y + 12);

  y += 22;
  y = drawRow(doc, w, "Importe USD",    fmtUSD(payment.amount_usd),  y, true);
  if (payment.exchange_rate) {
    y = drawRow(doc, w, "Tipo de cambio", `ARS ${Number(payment.exchange_rate).toLocaleString("es-AR")} / USD`, y, false);
    y = drawRow(doc, w, "Importe ARS",    fmtARS(payment.amount_ars), y, true);
  }
  if (payment.notes) {
    y = drawRow(doc, w, "Notas", payment.notes, y, false);
  }
  y += 6;

  // ── Tabla envíos ──────────────────────────────────────────────────────────
  if (shipments.length > 0) {
    y = drawSection(doc, w, y, `Envíos incluidos — ${shipments.length} paquete${shipments.length !== 1 ? "s" : ""}`);

    // Header tabla
    doc.setFillColor(...C.navyBorder);
    doc.rect(14, y - 4, w - 28, 10, "F");
    doc.setFillColor(...C.lemon);
    doc.rect(14, y - 4, w - 28, 1.5, "F"); // línea top lemon
    doc.rect(14, y + 6, w - 28, 1.5, "F"); // línea bottom lemon

    const cx = { code: 20, desc: 62, origin: 120, peso: 148, imp: w - 18 };
    doc.setTextColor(...C.navy);
    doc.setFillColor(...C.lemon);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text("CÓDIGO",      cx.code,   y + 3.5);
    doc.text("DESCRIPCIÓN", cx.desc,   y + 3.5);
    doc.text("ORIGEN",      cx.origin, y + 3.5);
    doc.text("PESO",        cx.peso,   y + 3.5);
    doc.text("IMPORTE",     cx.imp,    y + 3.5, { align: "right" });
    y += 14;

    shipments.forEach((s, i) => {
      if (y > h - 42) {
        doc.addPage(); paintBackground(doc, w, h); y = 20;
      }

      const shade = i % 2 === 0;
      if (shade) {
        doc.setFillColor(...C.navyLight);
        doc.rect(14, y - 5, w - 28, 10, "F");
      }

      // Código destacado
      doc.setTextColor(...C.white);
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.text(String(s.code || s.package_code || "-"), cx.code, y);

      doc.setTextColor(...C.grayLight);
      doc.setFont("helvetica", "normal");
      const desc = String(s.description || "-");
      doc.text(desc.length > 26 ? desc.slice(0, 26) + "…" : desc, cx.desc, y);
      doc.text(String(s.origin || "-"), cx.origin, y);

      const peso = s.weight_kg ? `${Number(s.weight_kg).toFixed(2)} kg` : "-";
      doc.text(peso, cx.peso, y);

      doc.setTextColor(...C.lemon);
      doc.setFont("helvetica", "bold");
      doc.text(fmtUSD(s.amount_usd ?? s.estimated_usd), cx.imp, y, { align: "right" });
      y += 10;
    });

    // Línea cierre tabla
    doc.setDrawColor(...C.lemon);
    doc.setLineWidth(0.4);
    doc.line(14, y, w - 14, y);
    y += 12;
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  y = drawDivider(doc, w, y);
  y = drawTotalBlock(doc, w, y, "TOTAL PAGADO",
    fmtUSD(payment.amount_usd),
    payment.amount_ars ? fmtARS(payment.amount_ars) : null,
    C.lemon
  );

  drawFooter(doc, w, h);
  doc.save(`${recNum}.pdf`);
}

// ══════════════════════════════════════════════════════════════════════════════
// REMITO DE ENVÍO
// ══════════════════════════════════════════════════════════════════════════════
export function generateShipmentRemito(shipment, events = []) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.width;
  const h = doc.internal.pageSize.height;

  paintBackground(doc, w, h);

  const remNum  = `REM-${String(shipment.id || "").padStart(6, "0")}`;
  const dateStr = fmtDate(shipment.created_at || shipment.date_in);

  let y = drawHeader(doc, w, "REMITO DE ENVÍO", remNum, dateStr);

  // ── Cliente ───────────────────────────────────────────────────────────────
  y = drawSection(doc, w, y, "Datos del cliente");
  y = drawClientCard(doc, w, y,
    shipment.client_name,
    shipment.client_number,
    shipment.email || shipment.client_email || null,
    remNum
  );

  // ── Detalle envío en dos columnas ─────────────────────────────────────────
  y = drawSection(doc, w, y, "Detalle del envío");
  const mid = w / 2 + 4;
  const rows = [
    ["Código",      shipment.code || shipment.package_code, "Origen",   shipment.origin],
    ["Descripción", shipment.description,                   "Servicio", shipment.service],
    ["Caja",        shipment.box_code || "-",               "Peso real", shipment.weight_kg ? `${Number(shipment.weight_kg).toFixed(3)} kg` : "-"],
    ["Tracking",    shipment.tracking || "-",               "Estado",   shipment.status],
  ];
  rows.forEach((r, i) => {
    const ry = y + i * 10;
    const shade = i % 2 === 0;

    if (shade) {
      doc.setFillColor(...C.navyLight);
      doc.rect(14, ry - 5, mid - 20, 9, "F");
      doc.rect(mid, ry - 5, w - mid - 14, 9, "F");
    }

    doc.setTextColor(...C.gray); doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(r[0], 20, ry);
    doc.setTextColor(...C.white); doc.setFont("helvetica", "bold");
    const v1 = String(r[1] || "-"); doc.text(v1.length > 20 ? v1.slice(0,20)+"…" : v1, mid - 8, ry, { align: "right" });

    doc.setTextColor(...C.gray); doc.setFont("helvetica", "normal");
    doc.text(r[2], mid + 6, ry);
    doc.setTextColor(...C.white); doc.setFont("helvetica", "bold");
    doc.text(String(r[3] || "-"), w - 20, ry, { align: "right" });
  });
  y += rows.length * 10 + 8;

  // ── Estimado ──────────────────────────────────────────────────────────────
  if (shipment.estimated_usd != null) {
    y = drawDivider(doc, w, y);
    y = drawTotalBlock(doc, w, y, "ESTIMADO USD",
      fmtUSD(shipment.estimated_usd), null, C.orange
    );
    if (shipment.rate_usd_per_kg) {
      doc.setTextColor(...C.gray);
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
      doc.text(`Tarifa aplicada: USD ${Number(shipment.rate_usd_per_kg).toFixed(2)}/kg`, w - 18, y - 2, { align: "right" });
    }
  }

  // ── Historial ─────────────────────────────────────────────────────────────
  if (events.length > 0) {
    y = drawSection(doc, w, y + 4, "Historial de estados");

    doc.setFillColor(...C.navyBorder);
    doc.rect(14, y - 4, w - 28, 10, "F");
    doc.setFillColor(...C.lemon);
    doc.rect(14, y - 4, w - 28, 1.5, "F");
    doc.rect(14, y + 6, w - 28, 1.5, "F");
    doc.setTextColor(...C.navy);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text("FECHA",           20,  y + 3.5);
    doc.text("ESTADO ANTERIOR", 75,  y + 3.5);
    doc.text("NUEVO ESTADO",    145, y + 3.5);
    y += 14;

    events.forEach((e, i) => {
      if (y > h - 42) { doc.addPage(); paintBackground(doc, w, h); y = 20; }
      if (i % 2 === 0) {
        doc.setFillColor(...C.navyLight);
        doc.rect(14, y - 5, w - 28, 10, "F");
      }
      doc.setTextColor(...C.gray);   doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text(fmtDate(e.created_at), 20, y);
      doc.text(String(e.old_status || "Inicio"), 75, y);
      doc.setTextColor(...C.white);  doc.setFont("helvetica", "bold");
      doc.text(String(e.new_status || "-"), 145, y);
      y += 10;
    });
  }

  drawFooter(doc, w, h);
  doc.save(`${remNum}.pdf`);
}