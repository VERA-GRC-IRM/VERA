const { createStore } = require("./supabaseDocumentStore");
const store = createStore("vera_notification_reads");
const keyFor = (userId, notificationId) => `${userId}:${notificationId}`;

const getForUser = async (userId) => (await store.getAll({ user_id: `eq.${userId}` }))
  .filter((item) => item.readAt)
  .map(({ notificationId, readAt }) => ({ notificationId, readAt }));
const getStoredForUser = async (userId) => (await store.getAll({ user_id: `eq.${userId}` }))
  .filter((item) => item.notification)
  .map((item) => ({ ...item.notification, readAt: item.readAt || null, storedAt: item.storedAt }));

// Materialize each live, authorized event in the existing per-user ledger.
// Historical rows remain stored; the service decides what is still visible.
const syncForUser = async (userId, notifications) => {
  const existing = new Map((await store.getAll({ user_id: `eq.${userId}` }))
    .map((item) => [item.notificationId, item]));
  await Promise.all(notifications.map(async (notification) => {
    const current = existing.get(notification.id);
    if (current?.notification) return;
    const id = keyFor(userId, notification.id);
    if (current) {
      await store.mutate(id, { notification, storedAt: current.storedAt || new Date().toISOString() }, current.storageVersion);
    } else {
      try {
        await store.create({ id, userId, notificationId: notification.id, notification,
          readAt: null, storedAt: new Date().toISOString() }, { user_id: userId });
      } catch (error) {
        if (error.status !== 409 || !await store.findById(id)) throw error;
      }
    }
  }));
  return [...existing.values()].filter((item) => item.readAt)
    .map(({ notificationId, readAt }) => ({ notificationId, readAt }));
};

const markRead = async (userId, notificationId) => {
  const id = keyFor(userId, notificationId);
  const current = await store.findById(id);
  if (current?.readAt) return current.readAt;
  const readAt = new Date().toISOString();
  if (current) await store.mutate(id, { readAt }, current.storageVersion);
  else await store.create({ id, userId, notificationId, readAt }, { user_id: userId });
  return readAt;
};

const markUnread = async (userId, notificationId) => {
  const id = keyFor(userId, notificationId);
  const current = await store.findById(id);
  if (current?.readAt) await store.mutate(id, { readAt: null }, current.storageVersion);
};

module.exports = { getForUser, getStoredForUser, markRead, markUnread, syncForUser };
