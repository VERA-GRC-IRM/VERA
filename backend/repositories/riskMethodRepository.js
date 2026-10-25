const records = [];
const clone = (record) => JSON.parse(JSON.stringify(record));

const getAll = () => records.map(clone);
const create = (record) => {
  if (records.some((item) => item.id === record.id)) {
    throw Object.assign(new Error("La versión ya existe. Actualiza el catálogo."), { status: 409 });
  }
  const saved = { ...clone(record), storageVersion: 1 };
  records.push(saved);
  return clone(saved);
};

module.exports = process.env.VERA_RISK_METHOD_STORE === "supabase"
  ? require("./supabaseRiskMethodRepository") : { getAll, create };
