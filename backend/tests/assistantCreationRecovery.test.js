const test = require("node:test");
const assert = require("node:assert/strict");
const { recoverCommittedCreation } = require("../services/assistantCreationRecovery");

test("creation recovery replays authorization instead of returning raw repository data", async () => {
  let reads = 0;
  let replays = 0;
  const repository = { getAll: async () => { reads += 1; return [{ aiOperationId: "op-1", title: "Privado" }]; } };
  const replay = async () => { replays += 1; return { title: "Autorizado" }; };
  assert.equal(await recoverCommittedCreation({ status: 403 }, repository, "op-1", replay), null);
  assert.equal(reads, 0);
  assert.deepEqual(await recoverCommittedCreation(new Error("Falló la bitácora"), repository,
    "op-1", replay), { title: "Autorizado" });
  assert.equal(replays, 1);
  assert.equal(await recoverCommittedCreation(new Error("Falló la bitácora"), repository,
    "op-2", replay), null);
  assert.equal(replays, 1);
  assert.equal(await recoverCommittedCreation(new Error("Falló la bitácora"), repository,
    "op-1", async () => { throw Object.assign(new Error("Acceso revocado"), { status: 403 }); }), null);
});
