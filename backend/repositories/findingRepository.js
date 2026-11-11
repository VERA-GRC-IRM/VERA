const findings = [];

const clone = (item) => item ? ({ ...item, createdBy: { ...item.createdBy },
  closedBy: item.closedBy ? { ...item.closedBy } : null,
  closureHistory: (item.closureHistory || []).map((entry) => ({ ...entry,
    requestedBy: entry.requestedBy ? { ...entry.requestedBy } : null,
    decidedBy: entry.decidedBy ? { ...entry.decidedBy } : null })),
  evidenceIds: [...(item.evidenceIds || [])] }) : null;
const getAll = () => findings.map(clone);
const findById = (id) => clone(findings.find((item) => item.id === id));
const create = (data) => {
  const next = findings.reduce((max, item) => Math.max(max, Number(item.id.slice(4)) || 0), 0) + 1;
  const finding = { ...data, id: `FDG-${String(next).padStart(3, "0")}`, status: "OPEN",
    createdAt: new Date().toISOString(), storageVersion: 1 };
  findings.unshift(finding);
  return clone(finding);
};

const mutate = (id, changes, expectedVersion) => {
  const finding = findings.find((item) => item.id === id);
  if (!finding) return null;
  if (finding.storageVersion !== expectedVersion) {
    const error = new Error("El hallazgo cambió mientras lo editabas. Actualiza y vuelve a intentar.");
    error.status = 409;
    error.domainStorage = true;
    throw error;
  }
  Object.assign(finding, changes, { storageVersion: finding.storageVersion + 1, updatedAt: new Date().toISOString() });
  return clone(finding);
};

module.exports = process.env.VERA_RISK_CONTROL_STORE === "supabase"
  ? require("./supabaseFindingRepository")
  : { getAll, findById, create, mutate };
