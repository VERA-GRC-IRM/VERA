const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const webPush = require("web-push");

process.env.JWT_SECRET ||= "push-test-secret-with-32-characters";
const app = require("../server");
const service = require("../services/pushService");
const { startTestServer } = require("./helpers/testServer");
const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });

test("push enrollment is private, generic and idempotent", async (context) => {
  const previous = { enabled: process.env.VERA_PUSH_ENABLED, public: process.env.VERA_VAPID_PUBLIC_KEY,
    private: process.env.VERA_VAPID_PRIVATE_KEY, subject: process.env.VERA_VAPID_SUBJECT };
  const keys = webPush.generateVAPIDKeys();
  process.env.VERA_PUSH_ENABLED = "true";
  process.env.VERA_VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VERA_VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VERA_VAPID_SUBJECT = "mailto:qa@example.test";
  const sent = [];
  const send = async (subscription, payload) => { sent.push({ subscription, payload }); };
  context.after(() => {
    for (const [name, value] of Object.entries({ VERA_PUSH_ENABLED: previous.enabled,
      VERA_VAPID_PUBLIC_KEY: previous.public, VERA_VAPID_PRIVATE_KEY: previous.private,
      VERA_VAPID_SUBJECT: previous.subject })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const base = await startTestServer(context, app);
  const url = `${base}/api/push`;
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/qa-subscription",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } };
  assert.equal((await fetch(`${url}/config`)).status, 401);
  assert.equal((await fetch(`${url}/config`, { headers: auth(1) })).status, 200);
  const post = (id, body) => fetch(`${url}/subscription`, { method: "POST", headers: { ...auth(id),
    "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post(1, { ...subscription, endpoint: "http://localhost/admin" })).status, 400);
  assert.equal((await post(1, { ...subscription, keys: { ...subscription.keys, auth: "short" } })).status, 400);
  assert.equal(service.validEndpoint("https://127.0.0.1/"), false);
  assert.equal(service.validEndpoint("https://web.push.apple.com/qa"), true);
  assert.equal((await post(1, subscription)).status, 200);
  await service.deliver(1, "QA_EVENT:1", send);
  await service.deliver(1, "QA_EVENT:1", send);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subscription.endpoint, subscription.endpoint);
  assert.doesNotMatch(sent[0].payload, /qa-subscription|admin|risk|audit/i);
  const removeOther = await fetch(`${url}/subscription`, { method: "DELETE", headers: { ...auth(3),
    "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
  assert.equal(removeOther.status, 200);
  await service.deliver(1, "QA_EVENT:2", send);
  assert.equal(sent.length, 2);
  const removed = await fetch(`${url}/subscription`, { method: "DELETE", headers: { ...auth(1),
    "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
  assert.equal(removed.status, 200);
  await service.deliver(1, "QA_EVENT:3", send);
  assert.equal(sent.length, 2);
  await service.deliver(1, "", send);
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await post(1, { ...subscription,
      endpoint: `${subscription.endpoint}-${index}` })).status, 200);
  }
  assert.equal((await post(1, { ...subscription,
    endpoint: `${subscription.endpoint}-extra` })).status, 429);
  const expired = async () => { throw { statusCode: 410 }; };
  await service.deliver(1, "QA_EVENT:EXPIRED", expired);
  assert.equal((await post(1, { ...subscription,
    endpoint: `${subscription.endpoint}-extra` })).status, 200);
  assert.equal((await fetch(`${url}/subscription`, { method: "DELETE", headers: { ...auth(1),
    "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: "https://bad.example/" }) })).status, 400);
});
