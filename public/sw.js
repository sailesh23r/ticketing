/* Service worker to show notifications for Web Push
   Keep this file minimal — it will show incoming push events.
*/
self.addEventListener("push", function (event) {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
  icon: "/convex.svg",
  });
});
