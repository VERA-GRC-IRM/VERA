const { createHash } = require("node:crypto");
const { parse } = require("csv-parse/sync");
const repository = require("../repositories/businessContextRepository");
const { availableScopesFor } = require("./scopeAccessService");
const { KINDS, definitionFrom, createForUser } = require("./businessContextService");
const { logActivity } = require("./auditLogger");
const { ROLES } = require("../config/roles");
const yauzl = require("yauzl");

const HEADERS = ["kind", "code", "name", "description", "effectiveFrom", "effectiveTo", "unitCodes"];
const errorFor = (message, status = 400, preview) => Object.assign(new Error(message), { status, preview });
const digest = (value) => createHash("sha256").update(value).digest("hex");
const text = (value) => String(value ?? "").trim();
const validKeys = (row) => row && typeof row === "object" && !Array.isArray(row) &&
  Object.keys(row).every((key) => HEADERS.includes(key)) &&
  HEADERS.filter((key) => key !== "effectiveTo").every((key) => Object.hasOwn(row, key));

const readWorkbookRows = async (bytes) => {
  if (!bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw errorFor("El archivo no es un libro Excel válido.");
  }
  const zip = await yauzl.fromBufferPromise(bytes, { validateEntrySizes: true, strictFileNames: true });
  try {
    if (zip.entryCount > 80) throw errorFor("El libro Excel contiene demasiadas partes.");
    let total = 0;
    let actualTotal = 0;
    for await (const entry of zip.eachEntry()) {
      total += entry.uncompressedSize;
      if (total > 2_000_000 || /(^|\/)vbaProject\.bin$|^xl\/externalLinks\//iu.test(entry.fileName)) {
        throw errorFor("El libro Excel supera el límite o contiene contenido externo no permitido.");
      }
      if (entry.fileName.endsWith("/")) continue;
      const stream = await zip.openReadStreamPromise(entry);
      for await (const chunk of stream) {
        actualTotal += chunk.length;
        if (actualTotal > 2_000_000) {
          stream.destroy();
          throw errorFor("El libro Excel supera el límite permitido.");
        }
      }
    }
  } finally { zip.close(); }
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet("Catalogo");
  if (workbook.worksheets.length !== 1 || !sheet || sheet.rowCount < 2 || sheet.rowCount > 51) {
    throw errorFor("El libro debe tener una hoja Catalogo y de 1 a 50 filas.");
  }
  const scalar = (cell) => {
    const value = cell.value;
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    throw errorFor("El libro contiene fórmulas o valores no permitidos.");
  };
  let extraHeader = false;
  sheet.getRow(1).eachCell((cell, column) => {
    if (column > HEADERS.length && cell.value !== null) extraHeader = true;
  });
  if (extraHeader) throw errorFor("El libro contiene columnas adicionales.");
  if (HEADERS.some((header, index) => scalar(sheet.getRow(1).getCell(index + 1)) !== header)) {
    throw errorFor("Las columnas Excel no corresponden a la plantilla.");
  }
  const rows = [];
  for (let line = 2; line <= sheet.rowCount; line += 1) {
    const row = sheet.getRow(line);
    let extra = false;
    row.eachCell((cell, column) => { if (column > HEADERS.length && cell.value !== null) extra = true; });
    if (extra) {
      throw errorFor("El libro contiene columnas adicionales.");
    }
    rows.push(Object.fromEntries(HEADERS.map((header, index) => [header, scalar(row.getCell(index + 1))])));
  }
  return rows;
};

const parseInput = async (user, input) => {
  if (user.role !== ROLES.SUPER_ADMIN) throw errorFor("Tu rol no puede importar el catálogo.", 403);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw errorFor("Envía un archivo válido.");
  const format = text(input.format).toLowerCase();
  const sourceName = text(input.sourceName);
  const raw = input.content;
  if (!["csv", "json", "xlsx"].includes(format)) throw errorFor("Selecciona CSV, JSON o Excel.");
  if (sourceName.length < 3 || sourceName.length > 120 || /[\x00-\x1f\x7f]/.test(sourceName)) {
    throw errorFor("Identifica la fuente en 3 a 120 caracteres.");
  }
  if (typeof raw !== "string" || !raw.trim()) throw errorFor("El archivo debe contener datos.");
  let fileDigest;
  if (format === "xlsx") {
    if (raw.length > 74_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(raw)) {
      throw errorFor("El archivo Excel no es válido o supera 55 KB.", 413);
    }
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.length || bytes.length > 55_000) throw errorFor("El archivo Excel supera 55 KB.", 413);
    fileDigest = digest(bytes);
  } else {
    if (Buffer.byteLength(raw, "utf8") > 55_000) {
      throw errorFor("El archivo debe ocupar como máximo 55 KB.", 413);
    }
    if (raw.includes("\uFFFD")) throw errorFor("El archivo contiene caracteres inválidos. Guárdalo como UTF-8 y vuelve a intentarlo.");
    fileDigest = digest(raw);
  }
  let rows;
  try {
    if (format === "xlsx") rows = await readWorkbookRows(Buffer.from(raw, "base64"));
    else if (format === "csv") {
      rows = parse(raw, { bom: true, columns: (columns) => {
        if (columns.length !== HEADERS.length || columns.some((column, index) => column !== HEADERS[index])) {
          throw new Error("Las columnas CSV no corresponden a la plantilla.");
        }
        return columns;
      }, skip_empty_lines: true, trim: true });
    } else rows = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (cause) {
    throw errorFor(cause.status ? cause.message : "No se pudo leer el archivo. Revisa el formato y la plantilla.");
  }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 50 || rows.some((row) => !validKeys(row))) {
    throw errorFor("El archivo debe tener de 1 a 50 filas con las columnas de la plantilla.");
  }
  return { format, sourceName, fileDigest,
    previewDigest: digest(`${format}\n${sourceName}\n${fileDigest}`), rows };
};

const analyze = async (user, input) => {
  const parsed = await parseInput(user, input);
  const [scopes, records] = await Promise.all([availableScopesFor(user), repository.getAll()]);
  const unitByCode = new Map(scopes.map((scope) => [scope.code, scope.id]));
  const latest = new Map();
  for (const record of records) {
    const key = `${record.kind}:${record.code}`;
    if (!latest.has(key) || latest.get(key).revision < record.revision) latest.set(key, record);
  }
  const seen = new Set();
  const sourceNote = `Archivo ${parsed.sourceName} · SHA-256 ${parsed.fileDigest}`;
  const rows = parsed.rows.map((row, index) => {
    const result = { line: index + (["csv", "xlsx"].includes(parsed.format) ? 2 : 1),
      kind: text(row.kind).toUpperCase(), code: text(row.code).toUpperCase(), name: text(row.name) };
    try {
      if (!KINDS.includes(result.kind) || !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(result.code)) {
        throw errorFor("Tipo o código no válido.");
      }
      const key = `${result.kind}:${result.code}`;
      if (seen.has(key)) throw errorFor("El código se repite dentro del archivo.");
      seen.add(key);
      const unitCodes = Array.isArray(row.unitCodes) ? row.unitCodes : text(row.unitCodes).split("|");
      const normalizedCodes = unitCodes.map((value) => text(value).toUpperCase());
      if (!normalizedCodes.length || normalizedCodes.some((code) => !unitByCode.has(code))) {
        throw errorFor("Una unidad no existe o no está disponible para tu cuenta.");
      }
      const unitIds = normalizedCodes.map((code) => unitByCode.get(code));
      const data = definitionFrom({ name: row.name, description: row.description,
        effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo || null,
        unitIds, sourceNote });
      const existing = latest.get(key);
      const same = existing && ["name", "description", "effectiveFrom", "effectiveTo"]
        .every((field) => (existing[field] || null) === (data[field] || null)) &&
        [...existing.unitIds].sort().join("|") === [...data.unitIds].sort().join("|");
      return { ...result, status: !existing ? "CREATE" : same ? "UNCHANGED" : "CONFLICT",
        message: !existing ? "Lista para publicar" : same ? "Ya publicada con estos datos" :
          "El código existe con otra definición; revísalo manualmente", data };
    } catch (cause) {
      return { ...result, status: "INVALID", message: cause.message };
    }
  });
  const counts = Object.fromEntries(["CREATE", "UNCHANGED", "CONFLICT", "INVALID"]
    .map((status) => [status, rows.filter((row) => row.status === status).length]));
  return { format: parsed.format, sourceName: parsed.sourceName, fileDigest: parsed.fileDigest,
    previewDigest: parsed.previewDigest, counts, rows };
};

const publicPreview = (preview) => ({ ...preview,
  rows: preview.rows.map(({ data, ...row }) => row) });
const previewForUser = async (user, input) => publicPreview(await analyze(user, input));

const applyForUser = async (user, input) => {
  const preview = await analyze(user, input);
  if (input.expectedDigest !== preview.previewDigest) {
    throw errorFor("La vista previa ya no corresponde al archivo o la fuente.", 409);
  }
  if (preview.counts.CONFLICT || preview.counts.INVALID) {
    throw errorFor("Corrige los conflictos antes de publicar.", 409, publicPreview(preview));
  }
  const results = [];
  for (const row of preview.rows) {
    if (row.status === "UNCHANGED") {
      results.push({ line: row.line, code: row.code, status: "UNCHANGED" });
      continue;
    }
    try {
      const record = await createForUser(user, { kind: row.kind, code: row.code, ...row.data });
      results.push({ line: row.line, code: row.code, status: "CREATED", contextId: record.contextId });
    } catch (cause) {
      results.push({ line: row.line, code: row.code, status: "FAILED",
        message: cause.status ? cause.message : "No se pudo guardar el registro." });
      break;
    }
  }
  const failed = results.some(({ status }) => status === "FAILED");
  const summary = { created: results.filter(({ status }) => status === "CREATED").length,
    unchanged: results.filter(({ status }) => status === "UNCHANGED").length,
    failed: failed ? 1 : 0, notApplied: preview.rows.length - results.length };
  await logActivity({ actor: user, action: "BUSINESS_CONTEXT_IMPORT",
    details: { sourceName: preview.sourceName, fileDigest: preview.fileDigest, ...summary } });
  return { status: failed ? 207 : 200,
    result: { fileDigest: preview.fileDigest, summary, results } };
};

const templateToXlsx = async () => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Catalogo", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = HEADERS.map((header) => ({ header, width: Math.max(20, header.length + 3) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF143A48" } };
  return workbook.xlsx.writeBuffer();
};

module.exports = { HEADERS, previewForUser, applyForUser, templateToXlsx };
