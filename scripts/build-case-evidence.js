#!/usr/bin/env node
"use strict";

// Traceability links point to related test code, not to a case-level PASS.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const planPath = path.join(root, "docs/testing/test-plan.md");
const registerPath = path.join(root, "docs/testing/case-evidence-register.md");
const reportPath = path.join(root, "quality-report/case-evidence.json");

const relatedSources = {
  "backend/tests/users.integration.test.js": [1, 2, 29, 39, 58],
  "backend/tests/auth.integration.test.js": [3, 4, 5, 6, 9, 29, 36, 38, 58, 69],
  "backend/tests/accountRules.test.js": [1, 36, 38],
  "backend/tests/auditLog.integration.test.js": [7, 51, 59],
  "backend/tests/planning.integration.test.js": [10, 11, 12, 15, 30, 54, 55, 56],
  "backend/tests/planningRules.test.js": [11, 12, 15, 54, 55, 56],
  "backend/tests/auditEdit.integration.test.js": [13, 14, 30],
  "backend/tests/risks.integration.test.js": [16, 17, 44, 45],
  "backend/tests/riskRules.test.js": [17, 45],
  "backend/tests/controls.integration.test.js": [46, 47],
  "backend/tests/findings.integration.test.js": [47, 48, 49, 50],
  "backend/tests/evidenceFiles.integration.test.js": [18, 19, 75],
  "backend/tests/notifications.integration.test.js": [20, 21],
  "backend/tests/notificationRead.integration.test.js": [20, 21],
  "backend/tests/notificationService.test.js": [20],
  "backend/tests/supabaseNotificationReads.test.js": [20, 21],
  "backend/tests/auditSearch.integration.test.js": [22, 23, 24, 25],
  "backend/tests/portfolioReport.integration.test.js": [26, 27, 28, 53],
  "backend/tests/dashboard.integration.test.js": [7, 15, 16, 40, 41, 42, 43, 67],
  "backend/tests/planningHistory.integration.test.js": [51, 52],
  "backend/tests/loginLogger.test.js": [59],
  "frontend/e2e/login.spec.js": [3, 4, 8, 9, 37, 69, 70, 72],
  "frontend/e2e/sidebar.spec.js": [8, 9, 29, 58, 71],
  "frontend/e2e/dashboard.spec.js": [7, 15, 16, 35, 37, 40, 41, 43, 67, 70],
  "frontend/e2e/active-audits.spec.js": [42],
  "frontend/e2e/portfolio-report.spec.js": [26, 27, 28, 53],
  "frontend/e2e/finding-closure.spec.js": [50],
  "frontend/e2e/proposals.spec.js": [10, 54, 55, 56],
  "performance/dashboard-load.js": [31, 32, 63, 67],
  "backend/scripts/benchmark-portfolio-pdf.js": [68],
  "scripts/production-smoke.mjs": [57, 61],
  "scripts/local-supabase-rehearsal.sh": [62, 66, 74]
};

function coverageState(note) {
  if (/^Bloqueado parcialmente/i.test(note)) return "Parcial / bloqueado";
  if (/^Bloqueado/i.test(note)) return "Bloqueado";
  if (/^Pendiente/i.test(note)) return "Pendiente";
  if (/^Parcial/i.test(note)) return "Parcial";
  if (/^(Cubierto|Existente)/i.test(note)) return "Código relacionado";
  if (/^(Implementación preparada|No ejecutad)/i.test(note)) return "Preparado / no ejecutado";
  return "Revisar";
}

function main() {
  const plan = fs.readFileSync(planPath, "utf8");
  const cases = plan.split(/\r?\n/).filter((line) => /^\| TC-\d{2} \|/.test(line)).map((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 6) throw new Error(`Fila de caso mal formada: ${line}`);
    const [id, scenario, level, priority, plannedPr, baseline] = cells;
    return { id, scenario, level, priority, plannedPr, baseline,
      coverageState: coverageState(baseline), relatedSources: [],
      deployedCaseVerdict: "Sin dictamen individual" };
  });
  const expected = Array.from({ length: 78 }, (_, index) => `TC-${String(index + 1).padStart(2, "0")}`);
  if (cases.map((item) => item.id).join() !== expected.join()) {
    throw new Error("El plan debe contener TC-01 a TC-78, una vez cada uno y en orden.");
  }

  const byId = new Map(cases.map((item) => [item.id, item]));
  for (const [source, numbers] of Object.entries(relatedSources)) {
    if (!fs.existsSync(path.join(root, source))) throw new Error(`Fuente de prueba inexistente: ${source}`);
    for (const number of numbers) {
      const id = `TC-${String(number).padStart(2, "0")}`;
      const item = byId.get(id);
      if (!item) throw new Error(`Caso de origen inválido: ${id}`);
      item.relatedSources.push(source);
    }
  }
  for (const item of cases) {
    item.relatedSources.sort();
    if (item.coverageState === "Código relacionado" && item.relatedSources.length === 0) {
      throw new Error(`${item.id} figura como cubierto sin una prueba relacionada vinculada.`);
    }
  }

  const counts = Object.fromEntries([...new Set(cases.map((item) => item.coverageState))].sort()
    .map((state) => [state, cases.filter((item) => item.coverageState === state).length]));
  const report = { schemaVersion: 1, source: "docs/testing/test-plan.md",
    workflowSha: process.env.GITHUB_SHA ?? null, totalCases: cases.length,
    caseLevelProductionPassesClaimed: 0, coverageCounts: counts, cases };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const header = [
    "# Registro de evidencia de los 78 casos",
    "",
    "Este registro se genera desde [el plan de pruebas](test-plan.md) y vincula cada caso con código de prueba relacionado cuando existe. **Un archivo relacionado o una suite verde no equivalen a un PASS individual en Production.** La columna de cobertura es la línea base documentada en el plan; puede requerir actualización tras cambios del producto.",
    "",
    "Para ejecuciones, SHA y tiempos vigentes consulta el [portal de calidad](https://vera-grc-irm.github.io/VERA/). Los cierres funcionales y operativos con evidencia desplegada se registran en la [issue #113](https://github.com/VERA-GRC-IRM/VERA/issues/113). Ninguno de los 78 casos tiene aquí un dictamen individual de aceptación en Production.",
    "",
    "| Caso | Escenario | Prioridad | Cobertura de la línea base | Detalle de la línea base | Fuente relacionada | Dictamen desplegado |",
    "|---|---|---|---|---|---|---|"
  ];
  const lines = cases.map((item) => {
    const links = item.relatedSources.length
      ? item.relatedSources.map((source) => `[${path.basename(source)}](../../${source.replaceAll("\\", "/")})`).join(", ")
      : "Sin prueba vinculada";
    return `| ${item.id} | ${item.scenario.replaceAll("|", "\\|")} | ${item.priority} | ${item.coverageState} | ${item.baseline.replaceAll("|", "\\|")} | ${links} | Sin dictamen individual |`;
  });
  const markdown = [...header, ...lines, "", "## Para cerrar un caso", "",
    "Registrar versión desplegada, ambiente, datos sintéticos, pasos y resultado esperado, evidencia del resultado real, duración y enlace al run o bitácora. Si la función o el ambiente no existe, conservar el estado bloqueado y su motivo; no convertirlo en aprobado por una prueba relacionada.", ""].join("\n");
  if (process.argv.includes("--write")) fs.writeFileSync(registerPath, markdown, "utf8");
  if (process.argv.includes("--check") && (!fs.existsSync(registerPath) ||
      fs.readFileSync(registerPath, "utf8").replaceAll("\r\n", "\n") !== markdown)) {
    throw new Error("El registro de casos está desactualizado; ejecuta node scripts/build-case-evidence.js --write.");
  }
  const message = `Casos trazados: ${cases.length}/78; fuentes relacionadas: ${cases.filter((item) => item.relatedSources.length > 0).length}; dictámenes individuales de Production afirmados: 0.\n`;
  process.stdout.write(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Trazabilidad de casos\n\n${message}\nConsulta el artifact case-evidence.json y docs/testing/case-evidence-register.md.\n`);
  }
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
