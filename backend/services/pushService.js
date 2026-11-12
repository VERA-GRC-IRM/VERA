const webPush = require("web-push");
const repository = require("../repositories/pushRepository");

const validEndpoint = (value) => {
  if (typeof value !== "string" || value.length > 2048) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
    (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
      host === "web.push.apple.com" || host.endsWith(".notify.windows.com"));
};
const validKey = (value, min, max) => typeof value === "string" &&
  value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+={0,2}$/.test(value);
const parseSubscription = (input) => {
  if (!validEndpoint(input?.endpoint) || !validKey(input?.keys?.p256dh, 80, 100) ||
      !validKey(input?.keys?.auth, 16, 40)) {
    throw new repository.PushError("Suscripción push no válida para este navegador.", 400);
  }
  return { endpoint: input.endpoint, keys: { p256dh: input.keys.p256dh, auth: input.keys.auth } };
};
const config = () => {
  const publicKey = process.env.VERA_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VERA_VAPID_PRIVATE_KEY;
  const subject = process.env.VERA_VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new repository.PushError("Avisos push sin configurar.");
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return publicKey;
};
const subscribe = async (user, input) => {
  config();
  const data = parseSubscription(input);
  const existing = await repository.list(user.id);
  if (existing.length >= 5 && !existing.some((row) => row.endpoint_hash === repository.hash(data.endpoint))) {
    throw new repository.PushError("Ya hay cinco dispositivos inscritos. Desactiva uno antes de añadir otro.", 429);
  }
  await repository.upsert(user.id, data);
  return { enabled: true };
};
const unsubscribe = async (user, endpoint) => {
  if (!validEndpoint(endpoint)) throw new repository.PushError("Suscripción no válida.", 400);
  await repository.remove(user.id, endpoint);
  return { enabled: false };
};
const deliver = async (userId, eventKey, send = (...args) => webPush.sendNotification(...args)) => {
  if (process.env.VERA_PUSH_ENABLED !== "true") return;
  if (typeof eventKey !== "string" || !eventKey || eventKey.length > 180) return;
  config();
  const devices = await repository.list(userId);
  for (const device of devices) {
    if (!await repository.claimed(device.id, eventKey)) continue;
    try {
      await send({ endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth_secret } },
      JSON.stringify({ kind: "VERA_ACTIVITY" }), { TTL: 120 });
      await repository.mark(device.id, eventKey, "SENT");
    } catch (error) {
      await repository.mark(device.id, eventKey, "FAILED");
      if ([404, 410].includes(error.statusCode)) await repository.remove(userId, device.endpoint);
      console.error("[PUSH_DELIVERY_FAILED]", { userId, status: error.statusCode || "TRANSPORT" });
    }
  }
};
module.exports = { validEndpoint, parseSubscription, config, subscribe, unsubscribe, deliver };
