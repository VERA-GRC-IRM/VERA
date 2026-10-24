const records = [];
const clone = (record) => JSON.parse(JSON.stringify(record));
const getAll = () => records.map(clone);
const findById = (id) => {
  const record = records.find((item) => item.id === id);
  return record ? clone(record) : null;
};
const findCategoryByCode = (code) => {
  const record = records.find((item) => item.kind === "CATEGORY" && item.code === code);
  return record ? clone(record) : null;
};
const listRevisions = (templateId) => records.filter((item) =>
  item.kind === "TEMPLATE" && item.templateId === templateId).map(clone);
const create = (record) => {
  const saved = { ...record, storageVersion: 1 };
  records.push(saved);
  return clone(saved);
};

module.exports = process.env.VERA_RISK_LIBRARY_STORE === "supabase"
  ? require("./supabaseRiskLibraryRepository")
  : { getAll, findById, findCategoryByCode, listRevisions, create };
