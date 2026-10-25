const { createStore } = require("./supabaseDocumentStore");
const store = createStore("vera_risk_methods");

module.exports = {
  getAll: store.getAll,
  create: (record) => store.create(record, { method_id: record.methodId, revision: record.revision })
};
