const jobs = require("../repositories/reportJobRepository");
const users = require("../repositories/userRepository");
const { parseAuditFilters } = require("./auditSearch");
const { buildPortfolioReport, reportToCsv } = require("./portfolioReportService");
const { reportToPdf } = require("./portfolioPdfService");

const MAX_RESULT_BYTES = 6 * 1024 * 1024;
const signature = (report) => report.rows.map((row) => ({ audit: row.audit.id,
  risks: row.risks.map((item) => item.id).sort(),
  controls: row.controls.map((item) => item.id).sort(),
  findings: row.findings.map((item) => item.id).sort(),
  evidence: row.evidence.map((item) => item.id).sort() })).sort((a, b) => a.audit.localeCompare(b.audit));

const enqueue = async (user, input) => {
  if (!input || !["csv", "pdf"].includes(input.format)) {
    throw new jobs.JobError("Selecciona CSV o PDF.", 400);
  }
  const parsed = parseAuditFilters(input.filters || {});
  if (parsed.error) throw new jobs.JobError(parsed.error, 400);
  return jobs.create(user, input.requestKey, input.format, parsed.filters);
};

const processNext = async () => {
  const claimed = await jobs.claim();
  if (!claimed) return "idle";
  try {
    const owner = await users.findById(claimed.owner_id);
    if (!owner || owner.status !== "ACTIVE" || owner.role !== claimed.owner_role) {
      await jobs.finish(claimed, "FAILED", { errorCode: "ACCESS_CHANGED" });
      return "failed";
    }
    const report = await buildPortfolioReport(owner, claimed.filters);
    const bytes = claimed.format === "csv"
      ? Buffer.from(reportToCsv(report), "utf8") : Buffer.from(await reportToPdf(report));
    if (bytes.length > MAX_RESULT_BYTES) {
      await jobs.finish(claimed, "FAILED", { errorCode: "RESULT_TOO_LARGE" });
      return "failed";
    }
    const saved = await jobs.finish(claimed, "COMPLETED", {
      base64: bytes.toString("base64"), sourceIds: signature(report)
    });
    return saved ? "completed" : "cancelled";
  } catch (error) {
    console.error("[REPORT_JOB_PROCESSING_FAILED]", { jobId: claimed.id, kind: error.name });
    await jobs.retryOrFail(claimed);
    return "failed";
  }
};
const runWorker = async () => {
  await jobs.clearExpired();
  const outcomes = [];
  for (let i = 0; i < 2; i += 1) {
    const result = await processNext();
    if (result === "idle") break;
    outcomes.push(result);
  }
  return { processed: outcomes.length, completed: outcomes.filter((item) => item === "completed").length };
};

const download = async (user, id) => {
  const row = await jobs.get(user, id, true);
  if (!row) throw new jobs.JobError("Trabajo no disponible.", 404);
  if (row.status !== "COMPLETED" || Date.parse(row.expires_at) <= Date.now()) {
    throw new jobs.JobError("El resultado aún no está disponible o expiró.", 409);
  }
  if (row.owner_role !== user.role) throw new jobs.JobError("Tu acceso cambió; genera el reporte de nuevo.", 403);
  const current = await buildPortfolioReport(user, row.filters);
  if (JSON.stringify(signature(current)) !== JSON.stringify(row.result_source_ids)) {
    throw new jobs.JobError("El alcance del reporte cambió; genera uno nuevo.", 403);
  }
  const bytes = Buffer.from(row.result_base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_RESULT_BYTES ||
      (row.format === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-")) {
    throw new jobs.JobError("El resultado almacenado no es válido.");
  }
  return { bytes, format: row.format };
};

module.exports = { enqueue, processNext, runWorker, download, signature };
