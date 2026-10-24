/*
 * Service worker de notificaciones Web Push (JS plano, sin build).
 * Recibe {title, body, url, tag} y muestra la notificación; al tocarla
 * enfoca la app o abre la ruta indicada.
 */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "DuqueLabs";
  const url = payload.url || "/dashboard";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [120, 60, 120],
      data: { url },
      tag: payload.tag,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Si hay una ventana abierta de la app, enfócala; si no, ábrela.
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});
