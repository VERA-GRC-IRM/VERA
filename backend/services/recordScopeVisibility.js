const { availableScopesFor } = require("./scopeAccessService");

// A legacy record without an organisational assignment keeps its current visibility.
// This is an additional restriction: callers must still apply their module role rules.
const filterByVisibleScope = async (user, records) => {
  if (!records.some((record) => record?.orgUnitId)) return records;
  const available = new Set((await availableScopesFor(user)).map((unit) => unit.id));
  return records.filter((record) => !record.orgUnitId || available.has(record.orgUnitId));
};

const canViewRecordScope = async (user, record) => {
  if (!record) return false;
  return (await filterByVisibleScope(user, [record])).length === 1;
};

module.exports = { filterByVisibleScope, canViewRecordScope };
