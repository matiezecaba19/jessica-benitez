/* Service worker: permite instalar la página como app y abrir lo ya visitado sin conexión.
   Estrategia: primero la red (así siempre se ve la versión más nueva) y, si no hay internet,
   lo último guardado. Solo guarda archivos de este mismo sitio: Firebase, las tipografías
   y los pagos nunca pasan por acá. Para forzar una actualización, subir el número de VERSION. */
const VERSION = "v4";
const CACHE = `jessica-benitez-${VERSION}`;

const BASICOS = [
  "./",
  "index.html",
  "servicios.html",
  "sobre-mi.html",
  "cursos.html",
  "contacto.html",
  "campus.html",
  "privacidad.html",
  "css/estilos.css",
  "css/campus.css",
  "js/tema.js",
  "assets/logo.png",
  "assets/favicon.png",
  "assets/icons/icon-192.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(BASICOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(pedido)
      .then((respuesta) => {
        if (respuesta.ok && respuesta.type === "basic") {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(pedido, copia));
        }
        return respuesta;
      })
      .catch(() =>
        caches.match(pedido).then((guardado) => {
          if (guardado) return guardado;
          if (pedido.mode === "navigate") return caches.match("index.html");
          return Response.error();
        })
      )
  );
});
