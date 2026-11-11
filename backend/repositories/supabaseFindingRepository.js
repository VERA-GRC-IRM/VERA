const { randomUUID } = require("node:crypto");
const { createStore } = require("./supabaseDocumentStore");

const store = createStore("vera_findings");
const create = (data) => store.create({
  ...data,
  id: `FDG-${randomUUID()}`,
  status: "OPEN",
  createdAt: new Date().toISOString(),
  createdBy: { ...data.createdBy }
}, { audit_id: data.auditId, control_id: data.controlId, risk_id: data.riskId });

module.exports = { getAll: store.getAll, findById: store.findById, create, mutate: store.mutate };
