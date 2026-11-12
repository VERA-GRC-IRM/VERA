const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");

process.env.JWT_SECRET ||= "report-jobs-test-secret-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });

test("report jobs survive navigation, isolate owners and enforce idempotency", async (context) => {
  const previous = { enabled: process.env.VERA_JOBS_ENABLED, secret: process.env.CRON_SECRET };
  process.env.VERA_JOBS_ENABLED = "true";
  process.env.CRON_SECRET = "report-jobs-worker-test-secret";
  context.after(() => {
    if (previous.enabled === undefined) delete process.env.VERA_JOBS_ENABLED;
    else process.env.VERA_JOBS_ENABLED = previous.enabled;
    if (previous.secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous.secret;
  });
  const root = await startTestServer(context, app);
  const url = `${root}/api/jobs`;
  const requestKey = randomUUID();
  const input = { format: "csv", filters: { quarter: "Q1" }, requestKey };
  const post = () => fetch(`${url}/report`, { method: "POST", headers: { ...auth(1),
    "Content-Type": "application/json" }, body: JSON.stringify(input) });
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(`${url}/worker`)).status, 401);
  assert.equal((await fetch(`${url}/report`, { method: "POST", headers: { ...auth(1),
    "Content-Type": "application/json" }, body: JSON.stringify({ ...input, format: "xlsx" }) })).status, 400);
  assert.equal((await fetch(`${url}/report`, { method: "POST", headers: { ...auth(1),
    "Content-Type": "application/json" }, body: JSON.stringify({ ...input, filters: { quarter: "Q5" } }) })).status, 400);
  const created = await post();
  assert.equal(created.status, 202);
  const job = (await created.json()).job;
  assert.equal(job.status, "QUEUED");
  assert.equal((await (await post()).json()).job.id, job.id);
  assert.equal((await (await fetch(url, { headers: auth(1) })).json()).jobs[0].id, job.id);
  assert.equal((await fetch(`${url}/no-es-un-uuid`, { headers: auth(1) })).status, 404);
  assert.equal((await fetch(`${url}/${job.id}`, { headers: auth(3) })).status, 404);
  assert.equal((await fetch(`${url}/${job.id}/download`, { headers: auth(1) })).status, 409);
  const run = await fetch(`${url}/worker`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.equal(run.status, 200);
  assert.equal((await run.json()).completed, 1);
  assert.equal((await (await fetch(`${url}/worker`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  })).json()).processed, 0);
  const done = await fetch(`${url}/${job.id}`, { headers: auth(1) });
  assert.equal((await done.json()).job.status, "COMPLETED");
  const downloaded = await fetch(`${url}/${job.id}/download`, { headers: auth(1) });
  assert.equal(downloaded.status, 200);
  assert.match(await downloaded.text(), /ID auditoría/);
  assert.equal((await fetch(`${url}/${job.id}/download`, { headers: auth(3) })).status, 404);

  input.requestKey = randomUUID();
  const queued = (await (await post()).json()).job;
  const cancelled = await fetch(`${url}/${queued.id}`, { method: "DELETE", headers: auth(1) });
  assert.equal((await cancelled.json()).job.status, "CANCELLED");
  assert.equal((await fetch(`${url}/${queued.id}/download`, { headers: auth(1) })).status, 409);
});
