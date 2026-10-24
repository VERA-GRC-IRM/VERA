// A write may commit and then fail while recording its activity. Recover the
// result only by replaying the authorized, idempotent service operation.
// Never return a record obtained directly from an unrestricted repository scan.
const recoverCommittedCreation = async (error, repository, operationId, replay) => {
  if (error?.status && error.status < 500) return null;
  try {
    const committed = (await repository.getAll()).some((item) => item.aiOperationId === operationId);
    return committed ? await replay() : null;
  } catch {
    return null;
  }
};

module.exports = { recoverCommittedCreation };
