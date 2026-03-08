// client/src/utils/pdfGenerator.js
// Genera PDFs de recibos de pago y remitos de envío
// Requiere: npm install jspdf

import { jsPDF } from "jspdf";

const NAVY = [15, 27, 45];
const LEMON = [245, 230, 66];
const ORANGE = [255, 138, 0];
const WHITE = [255, 255, 255];
const GRAY = [160, 170, 185];
const LIGHT_BG = [22, 38, 60];

function addHeader(doc, title, subtitle, number) {
  // Fondo header
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 38, "F");

  // Acento lemon
  doc.setFillColor(...LEMON);
  doc.rect(0, 0, 4, 38, "F");

  // Logo texto
  doc.setTextColor(...LEMON);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("LEMON'S", 14, 16);

  doc.setTextColor(...GRAY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Logística Internacional", 14, 22);
  doc.text("lemonsarg.com", 14, 27);

  // Título documento
  doc.setTextColor(...WHITE);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 210 - 14, 14, { align: "right" });

  doc.setTextColor(...LEMON);
  doc.setFontSize(10);
  doc.text(number, 210 - 14, 22, { align: "right" });

  doc.setTextColor(...GRAY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 210 - 14, 29, { align: "right" });

  return 48; // y position después del header
}

function addSectionTitle(doc, text, y) {
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(14, y, 182, 8, 2, 2, "F");
  doc.setFillColor(...LEMON);
  doc.rect(14, y, 3, 8, "F");
  doc.setTextColor(...LEMON);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(text.toUpperCase(), 21, y + 5.5);
  return y + 14;
}

function addRow(doc, label, value, y, highlight = false) {
  if (highlight) {
    doc.setFillColor(...LIGHT_BG);
    doc.rect(14, y - 4, 182, 9, "F");
  }
  doc.setTextColor(...GRAY);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(label, 18, y);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", highlight ? "bold" : "normal");
  doc.text(String(value ?? "-"), 120, y, { align: "left" });
  return y + 8;
}

function addDivider(doc, y) {
  doc.setDrawColor(40, 60, 90);
  doc.setLineWidth(0.3);
  doc.line(14, y, 196, y);
  return y + 6;
}

function addFooter(doc, pageHeight) {
  const y = pageHeight - 18;
  doc.setFillColor(...NAVY);
  doc.rect(0, y - 4, 210, 22, "F");
  doc.setFillColor(...LEMON);
  doc.rect(0, y - 4, 4, 22, "F");
  doc.setTextColor(...GRAY);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("LEMON'S Logística Internacional — lemonsarg.com", 14, y + 4);
  doc.text(`Generado el ${new Date().toLocaleString("es-AR")}`, 14, y + 9);
  doc.setTextColor(...LEMON);
  doc.text("Documento no válido como factura fiscal", 210 - 14, y + 4, { align: "right" });
}

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
  return `USD ${Number(v).toFixed(2)}`;
}

function fmtARS(v) {
  if (v == null || v === "") return "-";
  return `ARS ${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

// ─── RECIBO DE PAGO ──────────────────────────────────────────────────────────
export function generatePaymentReceipt(payment, shipments = []) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageH = doc.internal.pageSize.height;

  const receiptNumber = `REC-${String(payment.id || "").padStart(6, "0")}`;
  const dateStr = fmtDate(payment.created_at);

  let y = addHeader(doc, "RECIBO DE PAGO", dateStr, receiptNumber);

  // ── Info del cliente ──────────────────────────────────────────────────────
  y = addSectionTitle(doc, "Datos del cliente", y);
  y = addRow(doc, "Cliente", payment.client_name || payment.client_number, y, true);
  y = addRow(doc, "Nº de cliente", `#${payment.client_number}`, y);
  y = addRow(doc, "Email", payment.client_email || "-", y, true);
  y += 4;

  // ── Detalle del pago ──────────────────────────────────────────────────────
  y = addSectionTitle(doc, "Detalle del pago", y);
  y = addRow(doc, "Fecha", dateStr, y, true);
  y = addRow(doc, "Método de pago", formatMethod(payment.method), y);
  y = addRow(doc, "Importe USD", fmtUSD(payment.amount_usd), y, true);

  if (payment.exchange_rate) {
    y = addRow(doc, "Tipo de cambio", `$${Number(payment.exchange_rate).toFixed(2)} ARS/USD`, y);
    y = addRow(doc, "Importe ARS", fmtARS(payment.amount_ars), y, true);
  }

  if (payment.notes) {
    y = addRow(doc, "Notas", payment.notes, y);
  }

  y = addDivider(doc, y + 2);
  y += 2;

  // ── Envíos incluidos ──────────────────────────────────────────────────────
  if (shipments.length > 0) {
    y = addSectionTitle(doc, `Envíos incluidos (${shipments.length})`, y);

    // Cabecera tabla
    doc.setFillColor(...NAVY);
    doc.rect(14, y - 3, 182, 8, "F");
    doc.setTextColor(...LEMON);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("CÓDIGO", 18, y + 2);
    doc.text("DESCRIPCIÓN", 55, y + 2);
    doc.text("ORIGEN", 115, y + 2);
    doc.text("PESO", 145, y + 2);
    doc.text("IMPORTE", 175, y + 2);
    y += 10;

    shipments.forEach((s, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(...LIGHT_BG);
        doc.rect(14, y - 4, 182, 8, "F");
      }
      doc.setTextColor(...WHITE);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text(String(s.code || s.package_code || "-"), 18, y);
      doc.text(String(s.description || "-").slice(0, 30), 55, y);
      doc.text(String(s.origin || "-"), 115, y);
      doc.text(s.weight_kg ? `${Number(s.weight_kg).toFixed(2)} kg` : "-", 145, y);
      doc.setTextColor(...LEMON);
      doc.setFont("helvetica", "bold");
      doc.text(fmtUSD(s.amount_usd ?? s.estimated_usd), 175, y);
      y += 8;

      if (y > pageH - 40) {
        doc.addPage();
        y = 20;
      }
    });

    y += 4;
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  y = addDivider(doc, y);
  doc.setFillColor(...LEMON);
  doc.roundedRect(120, y, 76, 14, 3, 3, "F");
  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL PAGADO", 125, y + 5.5);
  doc.setFontSize(12);
  doc.text(fmtUSD(payment.amount_usd), 194, y + 10, { align: "right" });

  addFooter(doc, pageH);

  doc.save(`${receiptNumber}.pdf`);
}

// ─── REMITO DE ENVÍO ─────────────────────────────────────────────────────────
export function generateShipmentRemito(shipment, events = []) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageH = doc.internal.pageSize.height;

  const remitoNumber = `REM-${String(shipment.id || "").padStart(6, "0")}`;
  const dateStr = fmtDate(shipment.created_at || shipment.date_in);

  let y = addHeader(doc, "REMITO DE ENVÍO", dateStr, remitoNumber);

  // ── Info del cliente ──────────────────────────────────────────────────────
  y = addSectionTitle(doc, "Datos del cliente", y);
  y = addRow(doc, "Cliente", shipment.client_name || "-", y, true);
  y = addRow(doc, "Nº de cliente", `#${shipment.client_number}`, y);
  y = addRow(doc, "Email", shipment.email || shipment.client_email || "-", y, true);
  y += 4;

  // ── Detalle del envío ─────────────────────────────────────────────────────
  y = addSectionTitle(doc, "Detalle del envío", y);
  y = addRow(doc, "Código de paquete", shipment.code || shipment.package_code, y, true);
  y = addRow(doc, "Descripción", shipment.description, y);
  if (shipment.box_code) y = addRow(doc, "Código de caja", shipment.box_code, y, true);
  if (shipment.tracking) y = addRow(doc, "Tracking", shipment.tracking, y);
  y = addRow(doc, "Origen", shipment.origin, y, true);
  y = addRow(doc, "Servicio", shipment.service, y);
  y = addRow(doc, "Peso real", shipment.weight_kg ? `${Number(shipment.weight_kg).toFixed(3)} kg` : "-", y, true);
  y = addRow(doc, "Peso facturable", shipment.weight_kg ? `${Math.max(Number(shipment.weight_kg), 1).toFixed(3)} kg` : "-", y);
  y += 4;

  // ── Estado y tarifa ───────────────────────────────────────────────────────
  y = addSectionTitle(doc, "Estado y costos", y);
  y = addRow(doc, "Estado actual", shipment.status, y, true);
  y = addRow(doc, "Fecha ingreso", fmtDate(shipment.created_at || shipment.date_in), y);
  if (shipment.rate_usd_per_kg != null) {
    y = addRow(doc, "Tarifa aplicada", `USD ${Number(shipment.rate_usd_per_kg).toFixed(2)}/kg`, y, true);
  }
  y += 4;

  // Total estimado
  if (shipment.estimated_usd != null) {
    y = addDivider(doc, y);
    doc.setFillColor(...LEMON);
    doc.roundedRect(120, y, 76, 14, 3, 3, "F");
    doc.setTextColor(...NAVY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("ESTIMADO USD", 125, y + 5.5);
    doc.setFontSize(12);
    doc.text(fmtUSD(shipment.estimated_usd), 194, y + 10, { align: "right" });
    y += 20;
  }

  // ── Historial de estados ──────────────────────────────────────────────────
  if (events.length > 0) {
    y = addSectionTitle(doc, "Historial de estados", y);

    events.forEach((e, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(...LIGHT_BG);
        doc.rect(14, y - 4, 182, 8, "F");
      }
      doc.setTextColor(...GRAY);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(fmtDate(e.created_at), 18, y);
      doc.setTextColor(...GRAY);
      doc.text(String(e.old_status || "Inicio"), 72, y);
      doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      doc.text("→", 112, y);
      doc.setTextColor(...WHITE);
      doc.setFont("helvetica", "bold");
      doc.text(String(e.new_status || "-"), 118, y);
      y += 8;

      if (y > pageH - 40) {
        doc.addPage();
        y = 20;
      }
    });
  }

  addFooter(doc, pageH);
  doc.save(`${remitoNumber}.pdf`);
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatMethod(method) {
  const map = {
    USD_CASH: "USD Efectivo",
    USDT: "USDT",
    ARS_TRANSFER: "Transferencia ARS",
    ARS_CASH: "Efectivo ARS",
  };
  return map[method] || method || "-";
}
