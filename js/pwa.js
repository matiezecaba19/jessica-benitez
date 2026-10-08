/* Registra el service worker para que la página se pueda instalar como app. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* Sin service worker la página funciona igual, solo que no se instala. */
    });
  });
}
