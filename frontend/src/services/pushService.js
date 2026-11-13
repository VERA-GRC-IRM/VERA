const API = "/api/push";
const OWNER_KEY = "vera:push:owner";
const currentUserId = () => {
  try { return Number(JSON.parse(localStorage.getItem("user") || "null")?.id); }
  catch { return null; }
};
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("token") || ""}` });
const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, { ...options,
    headers: { ...auth(), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "No se pudieron configurar los avisos.");
  return data;
};
const bytes = (base64) => {
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};
const readyWorker = () => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("No está disponible el servicio de avisos.")), 5000);
  navigator.serviceWorker.ready.then((worker) => { clearTimeout(timer); resolve(worker); },
    (error) => { clearTimeout(timer); reject(error); });
});
export const pushAvailable = () => "serviceWorker" in navigator && "PushManager" in window &&
  "Notification" in window && location.protocol === "https:";
export const currentPushSubscription = async () => {
  if (!pushAvailable()) return null;
  const registration = await readyWorker();
  const subscription = await registration.pushManager.getSubscription();
  const owner = localStorage.getItem(OWNER_KEY);
  if (subscription && owner && owner !== String(currentUserId())) {
    await subscription.unsubscribe();
    localStorage.removeItem(OWNER_KEY);
    return null;
  }
  return owner === String(currentUserId()) ? subscription : null;
};
export const enablePush = async () => {
  if (!pushAvailable()) throw new Error("Este navegador no admite avisos con VERA cerrada.");
  const { publicKey } = await request("/config");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("El navegador no concedió permiso para avisos.");
  const registration = await readyWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: bytes(publicKey)
  });
  try { await request("/subscription", { method: "POST", body: JSON.stringify(subscription.toJSON()) }); }
  catch (error) { if (!existing) await subscription.unsubscribe(); throw error; }
  localStorage.setItem(OWNER_KEY, String(currentUserId()));
  return true;
};
export const disablePush = async () => {
  const subscription = await currentPushSubscription();
  if (!subscription) return false;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  localStorage.removeItem(OWNER_KEY);
  try { await request("/subscription", { method: "DELETE", body: JSON.stringify({ endpoint }),
    signal: AbortSignal.timeout(5_000) }); }
  catch { /* La suscripción local ya quedó revocada. La entrega remota expira o responde 410. */ }
  return false;
};
