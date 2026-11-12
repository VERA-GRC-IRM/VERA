/* Only generic text is shown outside the authenticated application. */
self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("VERA · nueva actividad", {
    body: "Tienes una actividad para revisar en VERA.",
    icon: "/vera-logo.png",
    tag: "vera-activity",
    data: { path: "/notificaciones" }
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/notificaciones"));
});
