import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const backendRequire = createRequire(resolve(root, "backend/package.json"));
const jwt = backendRequire("jsonwebtoken");
const ExcelJS = backendRequire("exceljs");
const { startTestServer } = backendRequire("./tests/helpers/testServer");
const { buildTeamsShareUrl } = await import("../frontend/src/utils/teamsShare.js");
const output = resolve(root, "microsoft-proof");
const tests = [];
const started = performance.now();
const stamp = randomBytes(4).toString("hex").toUpperCase();

// The proof is isolated from production and never reads a real user's token.
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.VERA_MANAGED_AUTH_ENABLED = "false";
for (const name of [
  "VERA_PLANNING_STORE", "VERA_USER_STORE", "VERA_RISK_CONTROL_STORE",
  "VERA_EVIDENCE_COMMENT_STORE", "VERA_AUDIT_STORE", "VERA_NOTIFICATION_STORE",
  "VERA_ORG_STORE", "VERA_RISK_LIBRARY_STORE", "VERA_BUSINESS_CONTEXT_STORE",
  "VERA_RISK_METHOD_STORE", "VERA_WORKSPACE_STORE", "VERA_JOB_STORE",
  "VERA_PUSH_STORE", "VERA_RESUMABLE_STORE", "VERA_PRESENCE_STORE"
]) process.env[name] = "memory";
const app = backendRequire("./server");
const closers = [];

const check = async (label, work) => {
  const before = performance.now();
  try {
    const details = await work();
    tests.push({ label, status: "PASS", durationMs: Math.round(performance.now() - before), details });
    process.stdout.write(`✓ ${label}\n`);
    return details;
  } catch (error) {
    tests.push({ label, status: "FAIL", durationMs: Math.round(performance.now() - before), details: error.message });
    process.stderr.write(`✗ ${label}: ${error.message}\n`);
    throw error;
  }
};
const auth = (id, method = "GET", body) => ({
  method,
  headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
    ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const responseJson = async (response, status) => {
  const body = await response.json();
  assert.equal(response.status, status, `${response.status}: ${JSON.stringify(body)}`);
  return body;
};
const markdown = (proof) => [
  "# Comprobación automática · Excel, Power BI y Teams",
  "",
  `- Pruebas de API y enlace: **${proof.tests.every((item) => item.status === "PASS") ? "APROBADO" : "FALLÓ"}**`,
  `- Commit: \`${proof.commit}\``,
  `- Duración total: **${proof.durationMs} ms**`,
  "- Entorno: API local, datos sintéticos, almacenamiento temporal en memoria; sin cuentas ni secretos de producción.",
  "",
  "| Comprobación | Estado | Tiempo | Evidencia |",
  "| --- | --- | ---: | --- |",
  ...proof.tests.map((item) => `| ${item.label} | ${item.status} | ${item.durationMs} ms | ${item.details || "—"} |`),
  "",
  "## Archivos",
  "",
  "- `vera-portafolio-sintetico.xlsx`: descarga real del endpoint, filtrada para el usuario de prueba.",
  "- `vera-catalogo-sintetico.xlsx`: plantilla real usada en vista previa y publicación local.",
  "- `proof.json`: resultados y duraciones legibles por máquina.",
  "",
  "## Alcance de la evidencia",
  "",
  "El archivo contiene tablas relacionales listas para importar manualmente a Power BI Desktop. Esta corrida no publica ni actualiza un conjunto de datos en Power BI Service.",
  "La prueba de Teams valida el enlace seguro que abre el diálogo de compartir. No envía un mensaje ni comprueba un tenant de Teams.",
  "La persistencia y los permisos en Supabase Production requieren una aceptación autenticada aparte.",
  ""
].join("\n");

let failure;
try {
  await mkdir(output, { recursive: true });
  const base = await startTestServer({ after: (close) => closers.push(close) }, app);
  const title = `Demostración sintética ${stamp}`;
  let auditId;
  let riskId;
  let controlId;
  let findingId;

  await check("Datos sintéticos vinculados por API", async () => {
    const proposal = await responseJson(await fetch(`${base}/api/planning`, auth(3, "POST", {
      title, objective: "Comprobar exportación.", scope: "Solo datos sintéticos.",
      justification: "Ensayo automático.", area: "Operaciones", quarter: "Q4", year: 2026,
      responsibleId: 5, plannedHours: 40
    })), 201);
    auditId = proposal.proposal.id;
    assert.equal((await fetch(`${base}/api/planning/${auditId}/approve`, auth(3, "POST", { quarter: "Q4" }))).status, 200);
    assert.equal((await fetch(`${base}/api/planning/${auditId}/start`, auth(3, "POST", {}))).status, 200);
    assert.equal((await fetch(`${base}/api/planning/${auditId}/details`, auth(3, "PATCH", { executedHours: 12.5 }))).status, 200);
    const risk = await responseJson(await fetch(`${base}/api/risks`, auth(3, "POST", {
      title: `Riesgo sintético ${stamp}`, description: "Escenario de prueba con información sintética.", area: "Operaciones",
      ownerId: 5, linkedAuditId: auditId, likelihood: 3, impact: 2,
      note: "Se detectó una exposición durante el ensayo automático."
    })), 201);
    riskId = risk.risk.id;
    const control = await responseJson(await fetch(`${base}/api/controls`, auth(3, "POST", {
      title: `Control sintético ${stamp}`, description: "Revisión de prueba.", type: "DETECTIVE",
      frequency: "Monthly", ownerId: 3, riskIds: [riskId], rating: 2,
      note: "La muestra de prueba presentó una excepción para revisar."
    })), 201);
    controlId = control.control.id;
    const finding = await responseJson(await fetch(`${base}/api/findings`, auth(3, "POST", {
      controlId, riskId, title: `Hallazgo sintético ${stamp}`, description: "Excepción de prueba.",
      rootCause: "Causa sintética.", severity: "MEDIUM"
    })), 201);
    findingId = finding.finding.id;
    return "auditoría → riesgo → control → hallazgo";
  });

  await check("Excel exportado desde API y concordancia con JSON", async () => {
    const query = `q=${encodeURIComponent(auditId)}`;
    const report = await responseJson(await fetch(`${base}/api/planning/report?${query}`, auth(3)), 200);
    assert.equal(report.total, 1);
    assert.equal(report.rows[0].audit.id, auditId);
    assert.deepEqual(report.rows[0].risks.map((item) => item.id), [riskId]);
    assert.deepEqual(report.rows[0].controls.map((item) => item.id), [controlId]);
    assert.deepEqual(report.rows[0].findings.map((item) => item.id), [findingId]);
    assert.equal(report.indicators.plannedHours, 40);
    assert.equal(report.indicators.executedHours, 12.5);
    const response = await fetch(`${base}/api/planning/report?${query}&format=xlsx`, auth(3));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /spreadsheetml\.sheet/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b]);
    await writeFile(resolve(output, "vera-portafolio-sintetico.xlsx"), bytes);
    return "1 auditoría; 1 riesgo; 1 control; 1 hallazgo; horas 40 / 12.5";
  });

  await check("Permisos de descarga", async () => {
    assert.equal((await fetch(`${base}/api/planning/report?format=xlsx`)).status, 401);
    const response = await fetch(`${base}/api/planning/report?format=xlsx`, auth(5));
    assert.equal(response.status, 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
    assert.ok(!book.getWorksheet("BI_Audits").getColumn(1).values.includes("AUD-01"));
    assert.ok(book.getWorksheet("BI_Audits").getColumn(1).values.includes(auditId));
    return "401 sin sesión; AUDITOR ve asignación y no ve AUD-01";
  });

  await check("Importación Excel con vista previa y permiso", async () => {
    const path = `${base}/api/business-context/import/template.xlsx`;
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(path, auth(3))).status, 403);
    const template = await fetch(path, auth(1));
    assert.equal(template.status, 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await template.arrayBuffer()));
    const unit = await responseJson(await fetch(`${base}/api/org-units`, auth(1, "POST", {
      kind: "GROUP", code: `PRF_${stamp}`, name: "Grupo sintético", effectiveFrom: "2026-01-01"
    })), 201);
    const code = `PROC_${stamp}`;
    book.getWorksheet("Catalogo").addRow(["PROCESS", code, "Proceso sintético",
      "Proceso para comprobar Excel.", "2026-01-01", "", unit.unit.code]);
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    await writeFile(resolve(output, "vera-catalogo-sintetico.xlsx"), bytes);
    const input = { format: "xlsx", sourceName: "Ensayo automático", content: bytes.toString("base64") };
    const previewPath = `${base}/api/business-context/import/preview`;
    assert.equal((await fetch(previewPath, auth(3, "POST", input))).status, 403);
    const preview = await responseJson(await fetch(previewPath, auth(1, "POST", input)), 200);
    assert.equal(preview.counts.CREATE, 1);
    const applied = await responseJson(await fetch(`${base}/api/business-context/import/apply`,
      auth(1, "POST", { ...input, expectedDigest: preview.previewDigest })), 200);
    assert.equal(applied.summary.created, 1);
    const repeat = await responseJson(await fetch(previewPath, auth(1, "POST", input)), 200);
    assert.equal(repeat.counts.UNCHANGED, 1);
    return "plantilla → vista previa → 1 alta; segunda vista: sin cambios; otros roles: 403";
  });

  await check("Enlace para compartir en Teams", () => {
    const origin = "https://www.vera-digital-systems.com";
    const destination = `/auditorias?auditId=${encodeURIComponent(auditId)}`;
    const share = buildTeamsShareUrl(destination, origin);
    const url = new URL(share);
    assert.equal(url.origin, "https://teams.microsoft.com");
    assert.equal(url.searchParams.get("href"), `${origin}${destination}`);
    assert.equal(url.searchParams.get("preview"), "false");
    assert.equal(buildTeamsShareUrl("https://outside.example/", origin), null);
    return "destino oficial, URL propia, sin vista previa; dominio externo rechazado";
  });
} catch (error) {
  failure = error;
} finally {
  for (const close of closers) await close();
  const proof = { schemaVersion: 1, commit: process.env.GITHUB_SHA || "local",
    generatedAt: new Date().toISOString(), environment: "local-memory-synthetic",
    durationMs: Math.round(performance.now() - started), tests };
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "proof.json"), JSON.stringify(proof, null, 2) + "\n");
  await writeFile(resolve(output, "proof.md"), markdown(proof));
  process.stdout.write(`Resultado: ${tests.filter((item) => item.status === "PASS").length}/${tests.length} · ${proof.durationMs} ms\n`);
}
if (failure) process.exitCode = 1;
