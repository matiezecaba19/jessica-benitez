/* Verificación de certificados: se escribe el código y se consulta el registro que se guarda al emitir
   cada certificado (nombre, curso y fecha). Se puede consultar solo si se conoce el código. */
import { firebaseConfig } from "./firebase-config.js";

const { CURSOS = [], WHATSAPP = "", duracion = () => "" } = window.DATOS_CURSOS || {};

const formulario = document.getElementById("verificar-form");
const campo = document.getElementById("codigo");
const resultado = document.getElementById("resultado");

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Acepta "jb-ab12c", "JB AB12C" o solo "AB12C".
function normalizar(texto) {
  let t = String(texto || "").toUpperCase().replace(/[\s_]+/g, "");
  if (/^[A-Z0-9]{5}$/.test(t)) t = `JB-${t}`;
  t = t.replace(/^JB([A-Z0-9]{5})$/, "JB-$1");
  return /^JB-[A-Z0-9]{5}$/.test(t) ? t : "";
}

function mostrar(clase, html) {
  resultado.className = `verificar__resultado verificar__resultado--${clase}`;
  resultado.innerHTML = html;
  resultado.hidden = false;
}

function enlaceConsulta(codigo) {
  if (!WHATSAPP) return "";
  const texto = `Hola Jessica, quiero consultar por un certificado${codigo ? ` con el código ${codigo}` : ""}.`;
  return ` <a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Escribile a Jessica</a>.`;
}

async function verificar(codigo) {
  mostrar("espera", "<p>Consultando…</p>");
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js");
    const db = getFirestore(initializeApp(firebaseConfig));
    const snap = await getDoc(doc(db, "certificados", codigo));

    if (!snap.exists()) {
      mostrar("no", `
        <p class="rotulo">No encontrado</p>
        <h2>No encontramos ese código</h2>
        <p>Revisá que esté bien escrito. Los códigos no usan la letra I, la O, el 0 ni el 1. Si el certificado está bien copiado y igual no aparece, no podemos asegurar que sea auténtico.${enlaceConsulta(codigo)}</p>`);
      return;
    }

    const d = snap.data();
    if (d.retirado === true) {
      // No se muestran datos de la persona: el certificado ya no tiene validez.
      mostrar("no", `
        <p class="rotulo">Certificado retirado</p>
        <h2>Este certificado ya no es válido</h2>
        <p>Fue retirado y no tiene validez.${enlaceConsulta(codigo)}</p>`);
      return;
    }
    const curso = CURSOS.find((c) => c.id === d.curso);
    const fecha = d.emitida && d.emitida.toDate
      ? d.emitida.toDate().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
      : "";
    mostrar("ok", `
      <p class="rotulo">Certificado auténtico</p>
      <h2>${esc(d.nombre)}</h2>
      <dl class="verificar__datos">
        <div><dt>Completó el curso</dt><dd>${esc(curso ? curso.titulo : d.curso)}</dd></div>
        ${curso ? `<div><dt>Duración</dt><dd>${esc(duracion(curso))}</dd></div>` : ""}
        ${fecha ? `<div><dt>Fecha de emisión</dt><dd>${esc(fecha)}</dd></div>` : ""}
        <div><dt>Código</dt><dd>${esc(codigo)}</dd></div>
        <div><dt>Emitido por</dt><dd>Jessica M. Benitez · Psicopedagoga · M.P. 1007</dd></div>
      </dl>
      <p class="verificar__aviso">Compará el nombre y el curso con los del certificado que recibiste: tienen que coincidir.</p>`);
  } catch {
    mostrar("error", `
      <p class="rotulo">Sin conexión</p>
      <h2>No pudimos consultar ahora</h2>
      <p>Probá de nuevo en unos minutos.${enlaceConsulta(codigo)}</p>`);
  }
}

formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const codigo = normalizar(campo.value);
  if (!codigo) {
    mostrar("no", `
      <p class="rotulo">Código no válido</p>
      <h2>Revisá el código</h2>
      <p>Tiene que empezar con <strong>JB-</strong> y seguir con cinco letras o números, por ejemplo <strong>JB-AB12C</strong>.</p>`);
    campo.focus();
    return;
  }
  campo.value = codigo;
  verificar(codigo);
});

// Permite abrir la página con el código ya cargado: verificar.html?codigo=JB-AB12C
const desdeEnlace = normalizar(new URLSearchParams(location.search).get("codigo"));
if (desdeEnlace) {
  campo.value = desdeEnlace;
  verificar(desdeEnlace);
}
