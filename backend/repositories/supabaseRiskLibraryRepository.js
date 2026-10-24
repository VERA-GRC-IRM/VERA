const { createStore } = require("./supabaseDocumentStore");
const store = createStore("vera_risk_library");
const findCategoryByCode = async (code) =>
  (await store.getAll({ kind: "eq.CATEGORY", code: `eq.${code}` }))[0] || null;
const listRevisions = (templateId) => store.getAll({ kind: "eq.TEMPLATE", template_id: `eq.${templateId}` });
const create = (record) => store.create(record, {
  kind: record.kind,
  code: record.kind === "CATEGORY" ? record.code : null,
  parent_id: record.kind === "CATEGORY" ? record.parentId : null,
  template_id: record.kind === "TEMPLATE" ? record.templateId : null,
  revision: record.kind === "TEMPLATE" ? record.revision : null,
  category_id: record.kind === "TEMPLATE" ? record.categoryId : null
});

module.exports = { getAll: store.getAll, findById: store.findById,
  findCategoryByCode, listRevisions, create };
