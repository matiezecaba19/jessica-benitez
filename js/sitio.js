/* Menú del celular y consejo del día. */
(function () {
  "use strict";

  // Menú desplegable para pantallas chicas.
  const boton = document.querySelector(".menu-boton");
  const menu = document.getElementById("menu");

  function cerrarMenu() {
    menu.classList.remove("menu--abierto");
    boton.setAttribute("aria-expanded", "false");
    boton.setAttribute("aria-label", "Abrir menú");
  }

  boton.addEventListener("click", () => {
    const abierto = menu.classList.toggle("menu--abierto");
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
  });
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) cerrarMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarMenu();
  });

  // Un consejo distinto cada día.
  const CONSEJOS = [
    "Los tiempos de atención sostenida cambian mucho entre niños: adaptar la duración de la tarea suele rendir más que insistir con la misma consigna.",
    "Leer en voz alta todos los días, aunque sean diez minutos, fortalece la conciencia fonológica mucho más que las planillas de repaso.",
    "Antes de pensar en «trastorno», vale la pena revisar el contexto: cambios familiares, escolares o de rutina también impactan en el aprendizaje.",
    "Los límites claros y sostenidos en el tiempo dan más seguridad que las reglas estrictas pero inconsistentes.",
    "Celebrar el proceso —el intento, la estrategia— y no solo el resultado ayuda a sostener la motivación frente a una dificultad de aprendizaje.",
  ];
  const dia = Math.floor(Date.now() / 86400000);
  document.getElementById("consejo").textContent = CONSEJOS[dia % CONSEJOS.length];
})();
