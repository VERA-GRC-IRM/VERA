const test = require("node:test");
const assert = require("node:assert/strict");

const evidence = require("../repositories/supabaseEvidenceRepository");
const comments = require("../repositories/supabaseCommentRepository");

test("Supabase evidence and comments keep their entity links and exclude server keys from responses", async (context) => {
  const previous = {
    fetch: global.fetch, url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    legacy: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  context.after(() => {
    global.fetch = previous.fetch;
    for (const [name, value] of [
      ["SUPABASE_URL", previous.url], ["SUPABASE_SECRET_KEY", previous.secret],
      ["SUPABASE_SERVICE_ROLE_KEY", previous.legacy]
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const tables = { vera_evidence: new Map(), vera_audit_comments: new Map() };
  global.fetch = async (input, options) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    assert.ok(tables[table]);
    assert.equal(options.headers.apikey, "sb_secret_test");
    assert.equal(options.headers.Authorization, undefined);
    if (options.method === "GET") {
      if (table === "vera_audit_comments") assert.ok(url.searchParams.has("proposal_id"));
      return Response.json([...tables[table].values()]);
    }
    if (options.method === "POST") {
      const { id, payload, entity_type, entity_id, proposal_id } = JSON.parse(options.body);
      if (table === "vera_evidence") {
        assert.equal(entity_type, payload.entityType);
        assert.equal(entity_id, payload.entityId);
      } else {
        assert.equal(proposal_id, payload.proposalId);
      }
      const row = { payload, version: 1 };
      tables[table].set(id, row);
      return Response.json([row], { status: 201 });
    }
    throw new Error(`Unexpected method ${options.method}`);
  };

  const item = await evidence.create({
    title: "Documento", entityType: "RISK", entityId: "RSK-1", orgUnitId: "ORG-A",
    aiOperationId: "11111111-1111-4111-8111-111111111111",
    author: { id: 1001, username: "auditor" }
  });
  assert.match(item.id, /^EVD-[0-9a-f-]{36}$/);
  assert.equal((await evidence.getAll())[0].entityId, "RSK-1");
  assert.equal((await evidence.getAll())[0].orgUnitId, "ORG-A");
  assert.equal((await evidence.getAll())[0].aiOperationId, "11111111-1111-4111-8111-111111111111");

  const comment = await comments.create({
    proposalId: "AUD-1", text: "Revisión completa.", orgUnitId: "ORG-A",
    aiOperationId: "22222222-2222-4222-8222-222222222222",
    author: { id: 1001, username: "auditor" }
  });
  assert.match(comment.id, /^CMT-[0-9a-f-]{36}$/);
  assert.equal((await comments.listByProposal("AUD-1"))[0].text, "Revisión completa.");
  assert.equal((await comments.listByProposal("AUD-1"))[0].orgUnitId, "ORG-A");
  assert.equal((await comments.listByProposal("AUD-1"))[0].aiOperationId,
    "22222222-2222-4222-8222-222222222222");
  assert.equal((await comments.listByProposal("AUD-2")).length, 0);
  assert.ok(!JSON.stringify(item).includes("sb_secret_test"));
  assert.ok(!JSON.stringify(comment).includes("sb_secret_test"));
});
