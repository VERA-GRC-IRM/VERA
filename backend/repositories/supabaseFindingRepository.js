const { randomUUID } = require("node:crypto");
const { createStore } = require("./supabaseDocumentStore");

const store = createStore("vera_findings");
const create = (data) => store.create({
  ...data,
  id: `FDG-${randomUUID()}`,
  status: "OPEN",
  createdAt: new Date().toISOString(),
  createdBy: { ...data.createdBy }
}, {
  control_id: data.controlId || null,
  risk_id: data.riskId || null,
  audit_id: data.auditId || null,
  assignee_id: data.assigneeId || null
});

module.exports = { getAll: store.getAll, findById: store.findById, create, mutate: store.mutate };
