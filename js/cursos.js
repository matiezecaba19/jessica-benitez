/* Cursos online: arma las fichas de la sección «Cursos» y el programa completo de cada uno.
   Los datos están en datos-cursos.js. */
(function () {
  "use strict";

  const { WHATSAPP, INCLUYE, CURSOS } = window.DATOS_CURSOS;

  // La inscripción y el pago se hacen en el campus.
  function enlaceInscripcion(curso) {
    return `campus.html?curso=${curso.id}`;
  }

  function ficha(curso, i) {
    return `
      <article class="curso">
        <img class="curso__ilustracion" src="assets/ilustraciones/cursos/${curso.id}.svg" alt="" width="400" height="200" loading="lazy" />
        <p class="curso__para">${curso.para}</p>
        <h3>${curso.titulo}</h3>
        <p>${curso.resumen}</p>
        <p class="curso__datos">${curso.modulos.length} módulos · ${curso.semanas} semanas · Online, a tu ritmo</p>
        <div class="curso__pie">
          <span class="curso__precio">${curso.precio}</span>
          <div class="curso__acciones">
            <button class="btn btn--chico btn--linea" type="button" data-programa="${i}">Ver programa</button>
            <a class="btn btn--chico" href="${enlaceInscripcion(curso)}">Inscribirme</a>
          </div>
        </div>
      </article>`;
  }

  function programa(curso) {
    return `
      <img class="programa__ilustracion" src="assets/ilustraciones/cursos/${curso.id}.svg" alt="" width="400" height="200" />
      <p class="rotulo">Programa completo</p>
      <h2 id="programa-titulo">${curso.titulo}</h2>
      <p class="programa__resumen">${curso.resumen}</p>
      <dl class="programa__datos">
        <div><dt>Para quién</dt><dd>${curso.para}</dd></div>
        <div><dt>Duración</dt><dd>${curso.semanas} semanas · ${curso.modulos.length} módulos</dd></div>
        <div><dt>Modalidad</dt><dd>Online, a tu ritmo</dd></div>
        <div><dt>Valor</dt><dd>${curso.precio}</dd></div>
      </dl>
      <h3>Qué vas a lograr</h3>
      <ul class="programa__lista">${curso.objetivos.map((o) => `<li>${o}</li>`).join("")}</ul>
      <h3>Módulos</h3>
      <ol class="programa__modulos">
        ${curso.modulos.map((m) => `
          <li>
            <strong>${m.titulo}</strong>
            <ul>${m.temas.map((t) => `<li>${t}</li>`).join("")}</ul>
          </li>`).join("")}
      </ol>
      <h3>Incluye</h3>
      <ul class="programa__lista">${INCLUYE.map((x) => `<li>${x}</li>`).join("")}</ul>
      <div class="programa__pie">
        <a class="btn" href="${enlaceInscripcion(curso)}">Inscribirme</a>
      </div>`;
  }

  const lista = document.getElementById("lista-cursos");
  const dialogo = document.getElementById("programa");
  const contenido = document.getElementById("programa-contenido");

  const otroTema = `
      <article class="curso curso--otro">
        <h3>¿Buscás otro tema?</h3>
        <p>También armo talleres y capacitaciones a medida para escuelas, equipos docentes y grupos de familias.</p>
        <a class="btn btn--chico" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hola Jessica, quiero consultarte por un taller o capacitación.")}" target="_blank" rel="noopener">Consultar</a>
      </article>`;

  lista.innerHTML = CURSOS.map(ficha).join("") + otroTema;

  lista.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-programa]");
    if (!boton) return;
    contenido.innerHTML = programa(CURSOS[Number(boton.dataset.programa)]);
    dialogo.showModal();
    contenido.scrollTop = 0;
  });

  dialogo.querySelector(".programa__cerrar").addEventListener("click", () => dialogo.close());
  // Clic fuera del cuadro (en el fondo oscuro) también cierra.
  dialogo.addEventListener("click", (e) => {
    if (e.target === dialogo) dialogo.close();
  });
})();
