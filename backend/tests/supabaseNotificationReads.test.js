const test = require("node:test");
const assert = require("node:assert/strict");
const reads = require("../repositories/supabaseNotificationReadRepository");

test("HU-17: Supabase separa lecturas por usuario y conserva cambios", async (context) => {
  const before = { fetch: global.fetch, url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };
  context.after(() => {
    global.fetch = before.fetch;
    for (const [name, value] of [["SUPABASE_URL", before.url], ["SUPABASE_SECRET_KEY", before.secret]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const rows = new Map();
  global.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.pathname, "/rest/v1/vera_notification_reads");
    assert.equal(options.headers.apikey, "sb_secret_test");
    const id = url.searchParams.get("id")?.slice(3);
    const userId = url.searchParams.get("user_id")?.slice(3);
    if (options.method === "GET") return Response.json(
      (id ? [rows.get(id)] : [...rows.values()].filter((row) => !userId || String(row.user_id) === userId))
        .filter(Boolean).map(({ payload, version }) => ({ payload, version }))
    );
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      const row = { ...body, version: 1 };
      rows.set(body.id, row);
      return Response.json([{ payload: row.payload, version: row.version }], { status: 201 });
    }
    if (options.method === "PATCH") {
      const body = JSON.parse(options.body);
      const current = rows.get(id);
      assert.equal(current.version, Number(url.searchParams.get("version")?.slice(3)));
      const row = { ...current, ...body };
      rows.set(id, row);
      return Response.json([{ payload: row.payload, version: row.version }]);
    }
    throw new Error(`Unexpected method ${options.method}`);
  };
  const notification = { id: "PROPOSAL_REVIEW:AUD-01", type: "PROPOSAL_REVIEW",
    title: "Propuesta pendiente", entityId: "AUD-01", path: "/planificacion" };
  await reads.syncForUser(2, [notification]);
  await reads.syncForUser(2, [notification]);
  assert.equal(rows.size, 1);
  assert.deepEqual(rows.get("2:PROPOSAL_REVIEW:AUD-01").payload.notification, notification);
  assert.equal(rows.get("2:PROPOSAL_REVIEW:AUD-01").payload.readAt, null);
  const first = await reads.markRead(2, "PROPOSAL_REVIEW:AUD-01");
  assert.ok(first);
  assert.equal((await reads.getForUser(2))[0].readAt, first);
  assert.deepEqual(await reads.getForUser(1), []);
  await reads.markUnread(2, "PROPOSAL_REVIEW:AUD-01");
  assert.deepEqual(await reads.getForUser(2), []);
  assert.ok(rows.get("2:PROPOSAL_REVIEW:AUD-01").payload.notification);
  assert.ok(await reads.markRead(2, "PROPOSAL_REVIEW:AUD-01"));
});
