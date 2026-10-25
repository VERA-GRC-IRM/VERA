const { createStore } = require("./supabaseDocumentStore");
const store = createStore("vera_business_context");

const findByCode = async (kind, code) =>
  (await store.getAll({ kind: `eq.${kind}`, code: `eq.${code}`, revision: "eq.1" }))[0] || null;
const create = (record) => store.create(record, {
  context_id: record.contextId,
  revision: record.revision,
  kind: record.kind,
  code: record.code
});

module.exports = { getAll: store.getAll, findByCode, create };
