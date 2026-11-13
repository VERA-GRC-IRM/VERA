const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../repositories/pushRepository");

test("private Supabase adapter transfers device ownership and deduplicates delivery", async (context) => {
  const previous = { store: process.env.VERA_PUSH_STORE, url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY, fetch: global.fetch };
  process.env.VERA_PUSH_STORE = "supabase";
  process.env.SUPABASE_URL = "https://qa.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_synthetic_test";
  context.after(() => {
    global.fetch = previous.fetch;
    for (const [name, value] of Object.entries({ VERA_PUSH_STORE: previous.store,
      SUPABASE_URL: previous.url, SUPABASE_SECRET_KEY: previous.key })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  let row = null;
  const deliveryKeys = new Set();
  global.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.hostname, "qa.supabase.co");
    assert.equal(options.headers.apikey, "sb_secret_synthetic_test");
    assert.equal(options.headers.Authorization, undefined);
    const body = options.body ? JSON.parse(options.body) : null;
    let result = [];
    if (url.pathname.endsWith("vera_push_subscriptions")) {
      if (options.method === "GET") result = row &&
        (!url.searchParams.has("user_id") || url.searchParams.get("user_id") === `eq.${row.user_id}`)
        ? [row] : [];
      if (options.method === "POST") { row = body; result = [row]; }
      if (options.method === "PATCH") { row = { ...row, ...body }; result = [row]; }
      if (options.method === "DELETE") {
        const owned = row && url.searchParams.get("user_id") === `eq.${row.user_id}`;
        result = owned ? [{ id: row.id }] : [];
        if (owned) row = null;
      }
    } else if (url.pathname.endsWith("vera_push_deliveries")) {
      if (options.method === "POST") {
        const key = `${body.subscription_id}:${body.event_key}`;
        if (deliveryKeys.has(key)) return new Response("{}", { status: 409 });
        deliveryKeys.add(key); result = [body];
      } else result = [{ subscription_id: url.searchParams.get("subscription_id") }];
    }
    return new Response(JSON.stringify(result), { status: 200,
      headers: { "content-type": "application/json" } });
  };
  const data = { endpoint: "https://fcm.googleapis.com/fcm/send/qa-private",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } };
  const first = await repository.upsert(1, data);
  assert.equal((await repository.list(1)).length, 1);
  assert.equal(await repository.claimed(first.id, "event-1"), true);
  assert.equal(await repository.claimed(first.id, "event-1"), false);
  await repository.mark(first.id, "event-1", "SENT");
  const transferred = await repository.upsert(3, data);
  assert.equal(transferred.id, first.id);
  assert.equal((await repository.list(1)).length, 0);
  assert.equal((await repository.list(3)).length, 1);
  assert.equal(await repository.remove(1, data.endpoint), false);
  assert.equal(await repository.remove(3, data.endpoint), true);
  assert.equal((await repository.list(3)).length, 0);
});
