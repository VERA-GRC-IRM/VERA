const records = [];
const clone = (record) => ({ ...record, unitIds: [...record.unitIds],
  relationships: (record.relationships || []).map((link) => ({ ...link, sharedUnitIds: [...(link.sharedUnitIds || [])] })),
  createdBy: { ...record.createdBy } });

const getAll = () => records.map(clone);
const findByCode = (kind, code) => {
  const record = records.find((item) => item.kind === kind && item.code === code && item.revision === 1);
  return record ? clone(record) : null;
};
const create = (record) => {
  if (records.some((item) => item.id === record.id)) {
    throw Object.assign(new Error("La ficha cambió mientras se publicaba. Actualiza y vuelve a intentar."), { status: 409 });
  }
  const saved = { ...clone(record), storageVersion: 1 };
  records.push(saved);
  return clone(saved);
};

module.exports = process.env.VERA_BUSINESS_CONTEXT_STORE === "supabase"
  ? require("./supabaseBusinessContextRepository")
  : { getAll, findByCode, create };
