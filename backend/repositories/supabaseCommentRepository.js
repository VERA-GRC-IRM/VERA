const { randomUUID } = require("node:crypto");
const { createStore } = require("./supabaseDocumentStore");

const store = createStore("vera_audit_comments");
const listByProposal = async (proposalId) =>
  (await store.getAll({ proposal_id: `eq.${proposalId}` }))
    .filter((comment) => comment.proposalId === proposalId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
const create = ({ proposalId, text, author, aiOperationId, orgUnitId }) => store.create({
  id: `CMT-${randomUUID()}`,
  proposalId, text, orgUnitId: orgUnitId || null, ...(aiOperationId ? { aiOperationId } : {}),
  author: { ...author }, createdAt: new Date().toISOString()
}, { proposal_id: proposalId });

module.exports = { listByProposal, create };
