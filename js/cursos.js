/* Cursos online: arma las fichas de la sección «Cursos» y el programa completo de cada uno.
   Los datos están en datos-cursos.js. */
(function () {
  "use strict";

  const { WHATSAPP, INCLUYE, CURSOS, duracion } = window.DATOS_CURSOS;
  // Los cursos retirados ya no se ofrecen (siguen en los datos para quienes los cursaron).
  const VISIBLES = CURSOS.filter((c) => !c.retirado);

  // La inscripción y el pago se hacen en el campus.
  function enlaceInscripcion(curso) {
    return `campus.html?curso=${curso.id}`;
  }

  // Para los cursos que todavía no abrieron la inscripción.
  function enlaceConsulta(curso) {
    const texto = `Hola Jessica, quiero consultarte por el curso ${curso.titulo}.`;
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
  }

  function leyendaAval(curso) {
    if (!curso.tipo) return "";
    const partes = [`<strong>${curso.tipo}</strong>`];
    if (curso.aval) partes.push(curso.aval);
    if (curso.resolucion) partes.push(`Res. N.º ${curso.resolucion}`);
    return `<p class="curso__aval">${partes.join(" · ")}</p>`;
  }

  function ficha(curso, i) {
    const botones = curso.proximamente
      ? `<button class="btn btn--chico btn--linea" type="button" data-programa="${i}">Ver programa</button>
            <a class="btn btn--chico" href="${enlaceConsulta(curso)}" target="_blank" rel="noopener">Consultar</a>`
      : `<button class="btn btn--chico btn--linea" type="button" data-programa="${i}">Ver programa</button>
            <a class="btn btn--chico" href="${enlaceInscripcion(curso)}">Inscribirme</a>`;
    return `
      <article class="curso">
        <img class="curso__ilustracion" src="assets/ilustraciones/cursos/${curso.id}.svg" alt="" width="400" height="200" loading="lazy" />
        <p class="curso__para">${curso.para}</p>
        <h3>${curso.titulo}</h3>
        <p>${curso.resumen}</p>
        ${leyendaAval(curso)}
        <p class="curso__datos">${duracion(curso)} · Online, a tu ritmo</p>
        <div class="curso__pie">
          <span class="curso__precio">${curso.proximamente ? "Próximamente" : curso.precio}</span>
          <div class="curso__acciones">
            ${botones}
          </div>
        </div>
      </article>`;
  }

  function programa(curso) {
    const filas = [
      `<div><dt>Para quién</dt><dd>${curso.para}</dd></div>`,
      curso.tipo ? `<div><dt>Tipo de curso</dt><dd>${curso.tipo}${curso.aval ? `. ${curso.aval}` : ""}</dd></div>` : "",
      curso.resolucion ? `<div><dt>Resolución</dt><dd>N.º ${curso.resolucion}</dd></div>` : "",
      curso.horas ? `<div><dt>Carga horaria</dt><dd>${curso.horas} horas</dd></div>` : "",
      `<div><dt>Duración</dt><dd>${curso.semanas} semanas · ${curso.modulos.length} módulos</dd></div>`,
      `<div><dt>Modalidad</dt><dd>Online, a tu ritmo</dd></div>`,
      `<div><dt>Valor</dt><dd>${curso.precio}</dd></div>`,
    ].filter(Boolean).join("");
    const pie = curso.proximamente
      ? `<p class="programa__resumen">La inscripción todavía no está abierta. Escribinos y te avisamos cuando se habilite.</p>
        <a class="btn" href="${enlaceConsulta(curso)}" target="_blank" rel="noopener">Consultar por este curso</a>`
      : `<a class="btn" href="${enlaceInscripcion(curso)}">Inscribirme</a>`;
    return `
      <img class="programa__ilustracion" src="assets/ilustraciones/cursos/${curso.id}.svg" alt="" width="400" height="200" />
      <p class="rotulo">Programa completo</p>
      <h2 id="programa-titulo">${curso.titulo}</h2>
      <p class="programa__resumen">${curso.resumen}</p>
      <dl class="programa__datos">${filas}</dl>
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
      <ul class="programa__lista">${(curso.incluye || INCLUYE).map((x) => `<li>${x}</li>`).join("")}</ul>
      <div class="programa__pie">
        ${pie}
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

  lista.innerHTML = VISIBLES.map(ficha).join("") + otroTema;

  lista.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-programa]");
    if (!boton) return;
    contenido.innerHTML = programa(VISIBLES[Number(boton.dataset.programa)]);
    dialogo.showModal();
    contenido.scrollTop = 0;
  });

  dialogo.querySelector(".programa__cerrar").addEventListener("click", () => dialogo.close());
  // Clic fuera del cuadro (en el fondo oscuro) también cierra.
  dialogo.addEventListener("click", (e) => {
    if (e.target === dialogo) dialogo.close();
  });
})();
