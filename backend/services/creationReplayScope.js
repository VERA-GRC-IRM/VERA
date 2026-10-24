// An operation ID is a retry key, not authority to read a record or attach it
// to a different source. Compare the actor and the complete creation intent.
const sameFields = (record, fields) => Object.entries(fields)
  .every(([key, value]) => record[key] === value);

const canReplayAction = (record, user, fields) =>
  record?.createdBy?.id === user.id &&
  (record.orgUnitId || null) === (fields.orgUnitId || null) &&
  sameFields(record, Object.fromEntries(Object.entries(fields)
    .filter(([key]) => key !== "orgUnitId")));

const canReplayEvidence = (record, user, fields) =>
  record?.author?.id === user.id &&
  (record.orgUnitId || null) === (fields.orgUnitId || null) && sameFields(record, Object.fromEntries(
    ["title", "description", "evidenceType", "reference", "entityType", "entityId"]
      .map((key) => [key, fields[key]])));

module.exports = { canReplayAction, canReplayEvidence };
