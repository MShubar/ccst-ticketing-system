const pdfkit = require("pdfkit");
// Node resolves pdfkit's CommonJS build, which is the constructor itself and
// loads standard fonts on demand. The Workers bundle resolves its ESM build:
// the constructor sits on `default` and every face has to be handed over up
// front. These reports draw in Helvetica only — another face needs a line here.
const PDFDocument = pdfkit.default || pdfkit;
if (typeof pdfkit.registerStdFonts === "function") {
  const helvetica = require("pdfkit/standard-fonts/Helvetica");
  pdfkit.registerStdFonts(helvetica.default || helvetica);
}

const COLORS = {
  navy: "#163047",
  teal: "#1f6b5c",
  muted: "#5a7380",
  line: "#c9d5dd",
  paper: "#f4f7f9",
  pass: "#1f7a4c",
  warn: "#c98a00",
  bad: "#b42318",
  critical: "#b42318",
  high: "#c45c26",
  medium: "#c98a00",
  low: "#3d7ea6",
  none: "#8a97a3"
};

function minutesLabel(n) {
  if (n == null) return "—";
  if (n < 60) return `${n} min`;
  return `${Math.floor(n / 60)}h ${n % 60}m`;
}

function pct(n) {
  return n == null ? "—" : `${n}%`;
}

function when(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function pageWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc, need = 80) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + need > bottom) doc.addPage();
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 36);
  doc.moveDown(0.55);
  // Absolute-positioned values above (score, %, counts) leave doc.x on the
  // right edge; without resetting here, the title wraps into a thin column.
  const left = doc.page.margins.left;
  doc.x = left;
  doc.fontSize(12).fillColor(COLORS.navy).text(title, left, doc.y, { width: pageWidth(doc) });
  doc.moveDown(0.2);
  const y = doc.y;
  doc
    .strokeColor(COLORS.line)
    .lineWidth(1)
    .moveTo(left, y)
    .lineTo(left + pageWidth(doc), y)
    .stroke();
  doc.moveDown(0.45);
  doc.x = left;
}

function roundedRect(doc, x, y, w, h, r = 6) {
  doc.roundedRect(x, y, w, h, r);
}

function drawHeader(doc, { meta, className, student, generatedAt, pageTitle }) {
  const x = doc.page.margins.left;
  const w = pageWidth(doc);
  const y = doc.y;
  roundedRect(doc, x, y, w, 78, 8);
  doc.fillColor(COLORS.navy).fill();
  doc.fillColor("#ffffff").fontSize(9).text(meta?.center || "ProCloud Training Center", x + 16, y + 12, {
    width: w - 32
  });
  doc.fontSize(18).text(pageTitle || "Student KPI report", x + 16, y + 28, { width: w - 32 });
  doc
    .fontSize(10)
    .fillColor("#cfe0ea")
    .text(`${className || "—"}  ·  ${student.fullName} (${student.username})  ·  ${when(generatedAt)}`, x + 16, y + 54, {
      width: w - 32
    });
  doc.y = y + 90;
}

function drawGradeBanner(doc, grade) {
  if (!grade) return;
  ensureSpace(doc, 110);
  const x = doc.page.margins.left;
  const w = pageWidth(doc);
  const y = doc.y;
  const band = grade.band || {};
  const color = band.color || COLORS.muted;

  roundedRect(doc, x, y, w, 72, 8);
  doc.fillColor(COLORS.paper).fill();
  roundedRect(doc, x, y, 8, 72, 0);
  doc.fillColor(color).fill();

  doc.fillColor(color).fontSize(22).text(band.label || "—", x + 24, y + 14, { width: 220 });
  doc.fillColor(COLORS.navy).fontSize(28).text(grade.score == null ? "—" : String(grade.score), x + w - 110, y + 12, {
    width: 90,
    align: "right"
  });
  doc.fontSize(9).fillColor(COLORS.muted).text("/ 100", x + w - 110, y + 42, { width: 90, align: "right" });
  doc.fontSize(10).fillColor(COLORS.muted).text(grade.summary || "", x + 24, y + 44, { width: w - 160 });
  doc.y = y + 86;

  // Component bars
  (grade.parts || []).forEach((p) => {
    ensureSpace(doc, 28);
    const rowY = doc.y;
    const barX = x + 130;
    const barW = w - 210;
    const barY = rowY + 4;
    doc.fontSize(9).fillColor(COLORS.navy).text(p.label, x, rowY, { width: 125, lineBreak: false });
    doc.roundedRect(barX, barY, barW, 10, 4).fillColor("#e6eef2").fill();
    if (p.raw != null) {
      const fillW = Math.max(2, (barW * p.raw) / 100);
      const fillColor = p.raw >= 70 ? COLORS.pass : p.raw >= 40 ? COLORS.warn : COLORS.bad;
      doc.roundedRect(barX, barY, fillW, 10, 4).fillColor(fillColor).fill();
      doc.fontSize(9).fillColor(COLORS.navy).text(`${p.raw}%`, barX + barW + 8, rowY, {
        width: 50,
        lineBreak: false
      });
    } else {
      doc.fontSize(9).fillColor(COLORS.muted).text("n/a", barX + barW + 8, rowY, {
        width: 50,
        lineBreak: false
      });
    }
    doc.x = x;
    doc.y = rowY + 18;
  });
}

function drawMetricCards(doc, kpis) {
  drawSectionTitle(doc, "Performance snapshot");
  ensureSpace(doc, 90);
  const cards = [
    { label: "Assigned", value: String(kpis.total), color: COLORS.navy },
    { label: "Open", value: String(kpis.backlog), color: COLORS.warn },
    { label: "Resolved", value: String(kpis.resolved), color: COLORS.pass },
    { label: "SLA", value: pct(kpis.slaCompliance), color: COLORS.teal },
    { label: "Avg response", value: minutesLabel(kpis.avgResponseMinutes), color: COLORS.navy },
    { label: "Avg resolve", value: minutesLabel(kpis.avgResolutionMinutes), color: COLORS.navy }
  ];
  const x0 = doc.page.margins.left;
  const gap = 8;
  const cardW = (pageWidth(doc) - gap * 2) / 3;
  const cardH = 52;
  const startY = doc.y;

  cards.forEach((card, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = x0 + col * (cardW + gap);
    const y = startY + row * (cardH + gap);
    roundedRect(doc, x, y, cardW, cardH, 8);
    doc.fillColor(COLORS.paper).fill();
    doc.rect(x, y, 4, cardH).fillColor(card.color).fill();
    doc.fillColor(COLORS.muted).fontSize(8).text(card.label.toUpperCase(), x + 12, y + 10, { width: cardW - 20 });
    doc.fillColor(COLORS.navy).fontSize(16).text(card.value, x + 12, y + 24, { width: cardW - 20 });
  });

  doc.y = startY + 2 * (cardH + gap) + 4;
}

function drawPriorityBars(doc, kpis) {
  drawSectionTitle(doc, "Open work by priority");
  ensureSpace(doc, 90);
  const pri = kpis.byPriority || {};
  const rows = [
    ["Unassigned", pri.unassigned || 0, COLORS.none],
    ["Critical", pri.critical || 0, COLORS.critical],
    ["High", pri.high || 0, COLORS.high],
    ["Medium", pri.medium || 0, COLORS.medium],
    ["Low", pri.low || 0, COLORS.low]
  ];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const x = doc.page.margins.left;
  const barMax = pageWidth(doc) - 120;

  rows.forEach(([label, count, color]) => {
    const y = doc.y;
    doc.fontSize(9).fillColor(COLORS.navy).text(label, x, y, { width: 70, lineBreak: false });
    doc.roundedRect(x + 75, y + 2, barMax, 10, 4).fillColor("#e6eef2").fill();
    const w = Math.max(count ? 4 : 0, (barMax * count) / max);
    if (w) doc.roundedRect(x + 75, y + 2, w, 10, 4).fillColor(color).fill();
    doc.fontSize(9).fillColor(COLORS.muted).text(String(count), x + 80 + barMax, y, {
      width: 30,
      lineBreak: false
    });
    doc.x = x;
    doc.y = y + 16;
  });
}

function slaLabel(t) {
  if (!t.sla) return { text: "—", color: COLORS.muted };
  if (t.sla.pending) return { text: "Awaiting", color: COLORS.warn };
  if (t.sla.breached) return { text: "Breached", color: COLORS.bad };
  return { text: "On track", color: COLORS.pass };
}

function reviewChip(t) {
  if (!t.review?.body) return { text: "—", color: COLORS.muted };
  if (t.review.mark === "good") return { text: "Good", color: COLORS.pass };
  if (t.review.mark === "incomplete") return { text: "Incomplete", color: COLORS.bad };
  return { text: "Needs work", color: COLORS.warn };
}

function yn(v) {
  if (v === true) return { text: "Yes", color: COLORS.pass };
  if (v === false) return { text: "No", color: COLORS.bad };
  return { text: "—", color: COLORS.muted };
}

function drawTicketTable(doc, tickets) {
  drawSectionTitle(doc, "Assigned tickets");
  const left = doc.page.margins.left;
  if (!tickets.length) {
    doc.x = left;
    doc.fontSize(10).fillColor(COLORS.muted).text("No tickets assigned to this student yet.", left, doc.y, {
      width: pageWidth(doc)
    });
    return;
  }

  const cols = [
    { label: "Ticket", w: 58 },
    { label: "Title", w: 130 },
    { label: "Priority", w: 52 },
    { label: "SLA", w: 52 },
    { label: "Priority OK", w: 52 },
    { label: "Process OK", w: 52 },
    { label: "Review", w: 58 }
  ];
  const bottom = doc.page.height - doc.page.margins.bottom - 16;

  const header = () => {
    let x = left;
    const y = doc.y;
    doc.fontSize(8).fillColor(COLORS.muted);
    cols.forEach((c) => {
      doc.text(c.label, x, y, { width: c.w, lineBreak: false });
      x += c.w;
    });
    doc.x = left;
    doc.y = y;
    doc.moveDown(0.3);
    doc
      .strokeColor(COLORS.line)
      .lineWidth(0.8)
      .moveTo(left, doc.y)
      .lineTo(left + cols.reduce((s, c) => s + c.w, 0), doc.y)
      .stroke();
    doc.moveDown(0.25);
  };

  header();

  for (const t of tickets) {
    if (doc.y > bottom) {
      doc.addPage();
      header();
    }
    const sla = slaLabel(t);
    const rev = reviewChip(t);
    const pOk = yn(t.review?.priorityOk);
    const prOk = yn(t.review?.processOk);
    const cells = [
      { text: t.id, color: COLORS.navy },
      { text: String(t.title || "").slice(0, 34), color: COLORS.navy },
      { text: t.priority || "none", color: COLORS[t.priority] || COLORS.none },
      sla,
      pOk,
      prOk,
      rev
    ];
    const y = doc.y;
    let x = left;
    cells.forEach((cell, i) => {
      doc.fontSize(8).fillColor(cell.color).text(String(cell.text), x, y, {
        width: cols[i].w - 4,
        lineBreak: false
      });
      x += cols[i].w;
    });
    doc.x = left;
    doc.y = y + 13;
  }
}

function drawStudentPage(doc, { meta, className, student, kpis, tickets, grade, generatedAt, pageTitle }) {
  drawHeader(doc, { meta, className, student, generatedAt, pageTitle });
  drawGradeBanner(doc, grade);
  drawMetricCards(doc, kpis);
  drawPriorityBars(doc, kpis);
  drawTicketTable(doc, tickets);
  ensureSpace(doc, 40);
  doc.moveDown(0.8);
  const left = doc.page.margins.left;
  doc.x = left;
  doc.fontSize(8).fillColor(COLORS.muted).text(
    "Grade weights: tickets resolved 45 · SLA 20 · overall review mark 20 · correct priority 10 · correct process 5. Unresolved assigned tickets hit the score hard. Pass ≥ 70, Needs work 40–69, Incomplete below 40. Missing parts are omitted and the rest are rescaled. Priority/process scores come from instructor checks on each ticket.",
    left,
    doc.y,
    { width: pageWidth(doc) }
  );
}

function collectBuffers(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

async function buildStudentKpiPdf(payload) {
  const doc = new PDFDocument({
    margin: 42,
    size: "A4",
    info: { Title: "Student KPI report", Author: "CCST Ticketing" }
  });
  const done = collectBuffers(doc);
  drawStudentPage(doc, payload);
  doc.end();
  return done;
}

async function buildClassKpiPdf({ meta, className, students, generatedAt }) {
  const doc = new PDFDocument({
    margin: 42,
    size: "A4",
    info: { Title: "Class KPI report", Author: "CCST Ticketing" }
  });
  const done = collectBuffers(doc);
  students.forEach((row, i) => {
    if (i > 0) doc.addPage();
    drawStudentPage(doc, {
      meta,
      className,
      student: row.student,
      kpis: row.kpis,
      tickets: row.tickets,
      grade: row.grade,
      generatedAt,
      pageTitle: `Student KPI report (${i + 1} of ${students.length})`
    });
  });
  if (!students.length) {
    doc.fontSize(14).fillColor(COLORS.navy).text("Class KPI report");
    doc.fontSize(10).fillColor(COLORS.muted).text("No students in this class yet.");
  }
  doc.end();
  return done;
}

module.exports = {
  buildStudentKpiPdf,
  buildClassKpiPdf,
  minutesLabel
};
