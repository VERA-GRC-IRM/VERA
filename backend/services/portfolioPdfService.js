const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, PageSizes, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const assetDirectory = fs.existsSync(path.join(__dirname, "assets", "fonts", "Lato-Regular.woff"))
  ? path.join(__dirname, "assets", "fonts") : path.join(__dirname, "..", "assets", "fonts");
const regularBytes = fs.readFileSync(path.join(assetDirectory, "Lato-Regular.woff"));
const boldBytes = fs.readFileSync(path.join(assetDirectory, "Lato-Bold.woff"));
const PAGE_WIDTH = PageSizes.A4[0];
const PAGE_HEIGHT = PageSizes.A4[1];
const MARGIN = 48;
const BOTTOM = 58;
const INK = rgb(0.07, 0.16, 0.28);
const MUTED = rgb(0.34, 0.41, 0.48);
const ACCENT = rgb(0.03, 0.46, 0.39);

const printable = (value, supported) => Array.from(String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/gu, " ")
  .normalize("NFC"), (character) => supported.has(character.codePointAt(0)) ? character : "?").join("");

const wrapText = (value, font, size, width, supported) => {
  const words = printable(value, supported).replace(/\s+/gu, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return ["—"];
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
    if (current) { lines.push(current); current = ""; }
    let fragment = "";
    for (const character of word) {
      if (fragment && font.widthOfTextAtSize(fragment + character, size) > width) {
        lines.push(fragment);
        fragment = "";
      }
      fragment += character;
    }
    current = fragment;
  }
  if (current) lines.push(current);
  return lines;
};

const reportToPdf = async (report) => {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const regular = await document.embedFont(regularBytes, { subset: true });
  const bold = await document.embedFont(boldBytes, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  document.setTitle("VERA · Reporte del portafolio");
  document.setSubject("Auditorías y relaciones visibles para la cuenta autorizada");
  document.setCreator("VERA");

  let page;
  let y;
  const addPage = () => {
    page = document.addPage(PageSizes.A4);
    page.drawText("VERA", { x: MARGIN, y: PAGE_HEIGHT - 40, size: 14, font: bold, color: INK });
    page.drawText("REPORTE DEL PORTAFOLIO", {
      x: PAGE_WIDTH - MARGIN - 178, y: PAGE_HEIGHT - 38, size: 8.5, font: bold, color: ACCENT
    });
    page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 47 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 47 }, thickness: 1, color: ACCENT });
    y = PAGE_HEIGHT - 75;
  };
  const write = (value, { size = 10, strong = false, color = INK, indent = 0, gap = 5 } = {}) => {
    const font = strong ? bold : regular;
    for (const line of wrapText(value, font, size, PAGE_WIDTH - 2 * MARGIN - indent, supported)) {
      if (y < BOTTOM + size) addPage();
      page.drawText(line, { x: MARGIN + indent, y, size, font, color });
      y -= size * 1.35;
    }
    y -= gap;
  };
  const related = (label, records, detail) => {
    write(`${label}: ${records.length}`, { strong: true, size: 9.5, gap: 3 });
    for (const item of records) {
      const suffix = detail(item);
      write(`${item.id} · ${item.title}${suffix ? ` · ${suffix}` : ""}`, {
        size: 9, color: MUTED, indent: 12, gap: 2
      });
    }
  };

  addPage();
  write("Control ejecutivo del portafolio", { size: 17, strong: true, gap: 9 });
  write(`Generado: ${report.asOf} · ${report.scope}`, { size: 9, color: MUTED });
  const labels = { q: "Búsqueda", status: "Estado", risk: "Nivel de riesgo", type: "Tipo",
    quarter: "Trimestre", year: "Año", orgUnitId: "Unidad", responsibleId: "Responsable" };
  const selected = Object.entries(report.filters ?? {}).filter(([, value]) => value)
    .map(([key, value]) => `${labels[key] ?? key}: ${value}`);
  write(`Filtros: ${selected.length ? selected.join(" · ") : "Ninguno"}`, { size: 9, color: MUTED, gap: 10 });
  const totals = report.indicators;
  write(`${totals.audits} auditorías · ${totals.risks} riesgos · ${totals.controls} controles · ${totals.findings} hallazgos · ${totals.evidence} evidencias`,
    { size: 10, strong: true, gap: 5 });
  write(`Horas planeadas: ${totals.plannedHours} (${totals.auditsWithPlannedHours} expedientes) · ejecutadas: ${totals.executedHours} (${totals.auditsWithExecutedHours} expedientes)`,
    { size: 9, color: MUTED, gap: 12 });
  if (!report.rows.length) write("No hay expedientes visibles para estos filtros.");

  for (const { audit, risks, controls, findings, evidence } of report.rows) {
    if (y < BOTTOM + 85) addPage();
    page.drawLine({ start: { x: MARGIN, y: y + 5 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 5 },
      thickness: 0.6, color: ACCENT });
    write(`${audit.id} · ${audit.title}`, { size: 12, strong: true, gap: 5 });
    write(`Estado: ${audit.status ?? "Sin registrar"} · Área: ${audit.area ?? "Sin registrar"} · Responsable: ${audit.responsible ?? "Sin asignar"}`,
      { size: 9, gap: 3 });
    write(`Año: ${audit.year ?? "Sin registrar"} · Trimestre: ${audit.quarter ?? "Sin registrar"} · Unidad: ${audit.orgUnitId ?? "Sin asignar"}`,
      { size: 9, gap: 3 });
    write(`Horas planeadas: ${audit.plannedHours ?? "Sin registrar"} · ejecutadas: ${audit.executedHours ?? "Sin registrar"} · Avance: ${audit.progress ?? "Sin registrar"}`,
      { size: 9, gap: 3 });
    write(`Objetivo: ${audit.objective ?? "Sin registrar"}`, { size: 9, gap: 5 });
    related("Riesgos", risks, (item) => item.level);
    related("Controles", controls, (item) => item.effectiveness);
    related("Hallazgos", findings, (item) => item.status);
    related("Evidencias", evidence ?? [], (item) => item.entityType);
    y -= 8;
  }

  const pages = document.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    pages[index].drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 },
      thickness: 0.5, color: MUTED });
    pages[index].drawText("VERA · Uso según permisos de la cuenta", {
      x: MARGIN, y: 30, size: 8, font: regular, color: MUTED
    });
    const pageLabel = `Página ${index + 1} de ${pages.length}`;
    pages[index].drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(pageLabel, 8),
      y: 30, size: 8, font: bold, color: MUTED });
  }
  return Buffer.from(await document.save());
};

module.exports = { reportToPdf };
