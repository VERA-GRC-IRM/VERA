const reads = new Map();
const snapshots = new Map();
const keyFor = (userId, notificationId) => `${userId}:${notificationId}`;

const getForUser = (userId) => [...reads.entries()]
  .filter(([key, readAt]) => key.startsWith(`${userId}:`) && readAt)
  .map(([key, readAt]) => ({ notificationId: key.slice(String(userId).length + 1), readAt }));
const markRead = (userId, notificationId) => {
  const key = keyFor(userId, notificationId);
  const readAt = reads.get(key) || new Date().toISOString();
  reads.set(key, readAt);
  return readAt;
};
const markUnread = (userId, notificationId) => { reads.delete(keyFor(userId, notificationId)); };
const syncForUser = (userId, notifications) => {
  for (const notification of notifications) {
    const key = keyFor(userId, notification.id);
    if (!snapshots.has(key)) snapshots.set(key, { userId, notification, storedAt: new Date().toISOString() });
  }
  return getForUser(userId);
};
const getStoredForUser = (userId) => [...snapshots.entries()]
  .filter(([key]) => key.startsWith(`${userId}:`))
  .map(([key, value]) => ({ ...value.notification, readAt: reads.get(key) || null,
    storedAt: value.storedAt }));

module.exports = process.env.VERA_NOTIFICATION_STORE === "supabase"
  ? require("./supabaseNotificationReadRepository")
  : { getForUser, getStoredForUser, markRead, markUnread, syncForUser };
