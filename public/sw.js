// Service worker de GrúaYa: recibe las notificaciones push (nueva solicitud para
// el piloto) y abre la app al tocarlas. No guarda nada en caché.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let datos = {};
  try {
    datos = e.data ? e.data.json() : {};
  } catch {
    datos = { titulo: 'GrúaYa', cuerpo: e.data ? e.data.text() : '' };
  }
  const opciones = {
    body: datos.cuerpo || '',
    icon: './iconos/icono-192.png',
    badge: './iconos/icono-192.png',
    tag: datos.etiqueta || 'gruaya',
    renotify: true,
    requireInteraction: !!datos.urgente,
    vibrate: datos.urgente ? [300, 100, 300, 100, 300] : [150],
    data: { url: datos.url || './' },
  };
  e.waitUntil(self.registration.showNotification(datos.titulo || 'GrúaYa', opciones));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => 'focus' in v);
      if (abierta) return abierta.focus();
      return self.clients.openWindow(url);
    }),
  );
});
