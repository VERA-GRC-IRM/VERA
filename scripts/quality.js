const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");
const reportDirectory = path.join(root, "quality-report");
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath
  ? process.execPath
  : process.platform === "win32" ? "npm.cmd" : "npm";
const startedAt = new Date();

const stages = [
  { area: "Trazabilidad", name: "78 casos y fuentes de evidencia", args: ["run", "traceability"] },
  { area: "Backend", name: "Sintaxis JavaScript", args: ["run", "lint", "--prefix", "backend"] },
  { area: "Backend", name: "Pruebas y cobertura", args: ["run", "test:coverage", "--prefix", "backend"] },
  { area: "Backend", name: "Auditoría de dependencias", args: ["run", "audit", "--prefix", "backend"] },
  { area: "IA", name: "Regresión sintética sin red", args: ["run", "ai:eval:offline", "--prefix", "backend"] },
  { area: "Frontend", name: "ESLint", args: ["run", "lint", "--prefix", "frontend"] },
  { area: "Frontend", name: "Pruebas unitarias de voz", args: ["run", "test:unit", "--prefix", "frontend"] },
  { area: "Frontend", name: "Build de producción", args: ["run", "build", "--prefix", "frontend"] },
  { area: "Frontend", name: "Auditoría de dependencias", args: ["run", "audit", "--prefix", "frontend"] }
];

const results = [];
const coverageMinimums = { linesPercent: 90, branchesPercent: 75, functionsPercent: 90 };

const runStage = (stage) => new Promise((resolve) => {
  const output = { stdout: "", stderr: "" };
  const start = performance.now();
  const child = spawn(npmCommand, npmExecPath ? [npmExecPath, ...stage.args] : stage.args, {
    cwd: root,
    shell: !npmExecPath && process.platform === "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  process.stdout.write(`\n▶ ${stage.area}: ${stage.name}\n`);

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    output.stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    output.stderr += text;
    process.stderr.write(text);
  });

  child.on("error", (error) => {
    output.stderr += error.message;
    resolve({ ...stage, status: "FAIL", exitCode: 1, durationSeconds: elapsed(start), ...output });
  });
  child.on("close", (code) => {
    resolve({ ...stage, status: code === 0 ? "PASS" : "FAIL", exitCode: code, durationSeconds: elapsed(start), ...output });
  });
});

function elapsed(start) {
  return Number(((performance.now() - start) / 1000).toFixed(2));
}

const extractMetrics = () => {
  const testOutput = results.find((result) => result.name === "Pruebas y cobertura")?.stdout ?? "";
  const allOutput = results.map((result) => `${result.stdout}\n${result.stderr}`).join("\n");
  const readCount = (label) => Number(testOutput.match(new RegExp(`(?:ℹ\\s+|#\\s*)${label}\\s+(\\d+)`, "i"))?.[1] ?? 0);
  const coverage = testOutput.match(/all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
  const auditMatches = [...allOutput.matchAll(/found\s+(\d+)\s+vulnerabilities?/gi)];
  const jsBundle = allOutput.match(/index-[^\s]+\.js\s+([\d.]+)\s*kB/i);
  let traceability = null;
  if (results.some((result) => result.name === "78 casos y fuentes de evidencia" && result.status === "PASS")) {
    try {
      const register = JSON.parse(fs.readFileSync(path.join(reportDirectory, "case-evidence.json"), "utf8"));
      traceability = { totalCases: register.totalCases,
        casesWithRelatedSources: register.cases.filter((item) => item.relatedSources.length > 0).length,
        caseLevelProductionPassesClaimed: register.caseLevelProductionPassesClaimed };
    } catch { /* The traceability stage has already reported its own result. */ }
  }

  return {
    tests: { total: readCount("tests"), passed: readCount("pass"), failed: readCount("fail") },
    backendCoverage: coverage ? {
      linesPercent: Number(coverage[1]),
      branchesPercent: Number(coverage[2]),
      functionsPercent: Number(coverage[3])
    } : null,
    auditedVulnerabilities: auditMatches.map((match) => Number(match[1])),
    frontendJavaScriptBundleKb: jsBundle ? Number(jsBundle[1]) : null,
    traceability
  };
};

const makeMarkdown = (report) => {
  const stageRows = report.stages.map((stage) =>
    `| ${stage.area} | ${stage.name} | ${stage.status} | ${stage.durationSeconds.toFixed(2)} s | ${stage.exitCode} |`
  ).join("\n");
  const coverage = report.metrics.backendCoverage;
  const coverageText = coverage
    ? `${coverage.linesPercent}% líneas · ${coverage.branchesPercent}% ramas · ${coverage.functionsPercent}% funciones`
    : "Sin datos (la etapa no generó resumen de cobertura).";
  const auditText = report.metrics.auditedVulnerabilities.length
    ? report.metrics.auditedVulnerabilities.map((count, index) => `Auditoría ${index + 1}: ${count}`).join("; ")
    : "Sin resultados reportados.";
  const bundleText = report.metrics.frontendJavaScriptBundleKb === null
    ? "No disponible."
    : `${report.metrics.frontendJavaScriptBundleKb} kB JavaScript (sin gzip).`;

  return [
    "# VERA — Reporte de calidad",
    "",
    `- **Resultado:** ${report.status}`,
    `- **Inicio (UTC):** ${report.startedAt}`,
    `- **Fin (UTC):** ${report.finishedAt}`,
    `- **Duración total:** ${report.durationSeconds.toFixed(2)} s`,
    `- **Commit de la rama:** ${report.commit ?? "no disponible"}`,
    ...(report.testedSha && report.testedSha !== report.commit ? [`- **Revisión probada por Actions:** ${report.testedSha} (candidato de merge del PR).`] : []),
    "",
    "## Etapas",
    "",
    "| Área | Verificación | Estado | Duración | Código |",
    "|---|---|---:|---:|---:|",
    stageRows,
    "",
    "## Señales",
    "",
    `- **Pruebas backend:** ${report.metrics.tests.passed}/${report.metrics.tests.total} aprobadas; ${report.metrics.tests.failed} fallidas.`,
    report.metrics.traceability
      ? `- **Trazabilidad:** ${report.metrics.traceability.totalCases}/78 casos inventariados; ${report.metrics.traceability.casesWithRelatedSources} con archivos relacionados; ${report.metrics.traceability.caseLevelProductionPassesClaimed} aprobaciones individuales de Production afirmadas.`
      : "- **Trazabilidad:** sin informe válido; revisar la etapa correspondiente.",
    `- **Cobertura backend:** ${coverageText}`,
    "- **Piso de cobertura backend:** 90% líneas, 75% ramas y 90% funciones; si falta la medición o cae por debajo, el control falla.",
    "- **IA:** evaluación sintética sin llamadas al modelo incluida como etapa obligatoria.",
    `- **Vulnerabilidades altas/críticas bloqueantes:** ${auditText}`,
    `- **Bundle JavaScript frontend:** ${bundleText}`,
    "",
    "El reporte refleja únicamente las verificaciones y métricas que este flujo ejecuta; no representa una medición de disponibilidad, carga ni rendimiento en producción."
  ].join("\n");
};

const main = async () => {
  const started = performance.now();
  for (const stage of stages) results.push(await runStage(stage));

  const observedCoverage = extractMetrics().backendCoverage;
  const unmetMinimums = Object.entries(coverageMinimums)
    .filter(([metric, minimum]) => observedCoverage?.[metric] === undefined || observedCoverage[metric] < minimum)
    .map(([metric, minimum]) => `${metric}: ${observedCoverage?.[metric] ?? "sin datos"} < ${minimum}`);
  const coverageMessage = unmetMinimums.length
    ? `Cobertura mínima incumplida: ${unmetMinimums.join("; ")}`
    : `Cobertura mínima aprobada: líneas >= 90%, ramas >= 75%, funciones >= 90%`;
  results.push({ area: "Backend", name: "Umbral de cobertura", status: unmetMinimums.length ? "FAIL" : "PASS",
    exitCode: unmetMinimums.length ? 1 : 0, durationSeconds: 0, stdout: coverageMessage, stderr: "" });
  process.stdout.write(`\n${coverageMessage}\n`);

  let commit = process.env.QUALITY_COMMIT ?? process.env.GITHUB_SHA ?? null;
  if (!commit) {
    try {
      const { execFileSync } = require("node:child_process");
      commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    } catch {
      commit = null;
    }
  }

  const report = {
    schemaVersion: 1,
    status: results.every((result) => result.status === "PASS") ? "PASS" : "FAIL",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: elapsed(started),
    commit,
    testedSha: process.env.GITHUB_SHA ?? null,
    stages: results.map(({ stdout, stderr, ...stage }) => stage),
    metrics: { ...extractMetrics(), coverageMinimums }
  };
  const markdown = makeMarkdown(report);

  fs.mkdirSync(reportDirectory, { recursive: true });
  fs.writeFileSync(path.join(reportDirectory, "quality-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(reportDirectory, "quality-report.md"), `${markdown}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }

  process.stdout.write(`\n${markdown}\n`);
  process.exitCode = report.status === "PASS" ? 0 : 1;
};

main().catch((error) => {
  process.stderr.write(`Quality runner failed: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
