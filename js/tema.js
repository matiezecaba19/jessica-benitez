/* Modo claro y oscuro.
   Se carga en el <head>, sin defer, para pintar el tema correcto antes de mostrar la página (sin parpadeo).
   Si la persona nunca eligió, se usa el de su celular o computadora; si elige, se acuerda de la elección. */
(function () {
  "use strict";

  const CLAVE = "tema";
  const sistema = window.matchMedia("(prefers-color-scheme: dark)");

  function elegido() {
    try {
      const valor = localStorage.getItem(CLAVE);
      return valor === "claro" || valor === "oscuro" ? valor : null;
    } catch (error) {
      return null; // navegación privada o almacenamiento bloqueado
    }
  }

  function actual() {
    return elegido() || (sistema.matches ? "oscuro" : "claro");
  }

  function aplicar(tema) {
    document.documentElement.dataset.tema = tema;

    const barra = document.querySelector('meta[name="theme-color"]');
    if (barra) barra.setAttribute("content", tema === "oscuro" ? "#0f1b2d" : "#1d3557");

    const texto = tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    document.querySelectorAll("[data-tema-boton]").forEach((boton) => {
      boton.setAttribute("aria-label", texto);
      boton.title = texto;
    });
  }

  aplicar(actual());
  document.addEventListener("DOMContentLoaded", () => aplicar(actual()));

  document.addEventListener("click", (evento) => {
    if (!evento.target.closest("[data-tema-boton]")) return;
    const nuevo = actual() === "oscuro" ? "claro" : "oscuro";
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch (error) {
      /* sin almacenamiento: el cambio vale solo para esta visita */
    }
    aplicar(nuevo);
  });

  // Si nunca eligió, acompañar los cambios del sistema (por ejemplo, el modo oscuro automático de la noche).
  sistema.addEventListener("change", () => {
    if (!elegido()) aplicar(actual());
  });
})();
