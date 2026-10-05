/* Estadísticas de visitas con Cloudflare Web Analytics: sin cookies y sin identificar a nadie.
   Para activarlas, pegá acá el token que da Cloudflare (Analytics → Web Analytics → Add a site). */
(function () {
  "use strict";
  const TOKEN = "";
  if (!TOKEN || ["localhost", "127.0.0.1"].includes(location.hostname)) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN }));
  document.head.appendChild(script);
})();
