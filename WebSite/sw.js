/* eslint-disable no-restricted-globals */
/* pwaBgCpu2: sw.js legacy — self-uninstall, push solo via /sw-m1.js */
/* 20260929pwaBgCpu2 */

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      try {
        await self.registration.unregister();
      } catch (eUn) {}
      try {
        var list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        (list || []).forEach(function (c) {
          try {
            c.postMessage({ type: "vc:push-resubscribe" });
          } catch (eMsg) {}
        });
      } catch (eCl) {}
      })(),
  );
});

self.addEventListener("push", function () {});
self.addEventListener("notificationclick", function () {});
self.addEventListener("message", function () {});
