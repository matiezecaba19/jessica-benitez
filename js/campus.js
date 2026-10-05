/* Campus de cursos: cuentas, inscripción con pago por transferencia, lector de clases
   y panel para que Jessica apruebe pagos y edite las clases.
   Los datos viven en Firebase; lo que protege el contenido son las reglas de firestore.rules. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, collection,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const { CURSOS, ALIAS, WHATSAPP } = window.DATOS_CURSOS;
// Solo cambia lo que se muestra; quién es administrador lo deciden las reglas.
const ADMINS = ["psp.jessicabenitez@gmail.com", "matiezecaba19@gmail.com"];

const ESTADOS = {
  pendiente_pago: { texto: "Falta el pago", clase: "pendiente" },
  pendiente_aprobacion: { texto: "Pago en revisión", clase: "revision" },
  aprobada: { texto: "Inscripción aprobada", clase: "aprobada" },
  rechazada: { texto: "Comprobante rechazado", clase: "rechazada" },
};

const app = document.getElementById("app");
const barra = document.getElementById("usuario-barra");
const ventana = document.getElementById("ventana");
const ventanaContenido = document.getElementById("ventana-contenido");
const aviso = document.getElementById("aviso");
const params = new URLSearchParams(location.search);
const usaEmulador = params.has("emulador");

/* ---------- Utilidades ---------- */

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function cursoPorId(id) {
  return CURSOS.find((c) => c.id === id);
}

function mostrarAviso(texto) {
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(mostrarAviso.t);
  mostrarAviso.t = setTimeout(() => { aviso.hidden = true; }, 3500);
}

function abrirVentana(html) {
  ventanaContenido.innerHTML = html;
  if (!ventana.open) ventana.showModal();
  ventanaContenido.scrollTop = 0;
}

function cerrarVentana() {
  if (ventana.open) ventana.close();
}

ventana.querySelector(".programa__cerrar").addEventListener("click", cerrarVentana);
ventana.addEventListener("click", (e) => { if (e.target === ventana) cerrarVentana(); });

function fecha(ts) {
  if (!ts || !ts.toDate) return "";
  return ts.toDate().toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function codigoNuevo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "JB-";
  for (let i = 0; i < 5; i++) c += letras[Math.floor(Math.random() * letras.length)];
  return c;
}

// Texto de las clases: párrafos separados por una línea en blanco,
// "## " para subtítulos, "- " para listas, "> " para un recuadro y **negrita**.
function textoAHtml(texto) {
  const formato = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const html = [];
  for (const bloque of String(texto || "").trim().split(/\n\s*\n/)) {
    // Dentro de un bloque, agrupa líneas seguidas del mismo tipo.
    let grupo = null;
    const cerrar = () => {
      if (!grupo) return;
      if (grupo.tipo === "lista") html.push(`<ul>${grupo.lineas.map((l) => `<li>${formato(l)}</li>`).join("")}</ul>`);
      else if (grupo.tipo === "recuadro") html.push(`<aside class="clase__recuadro">${formato(grupo.lineas.join(" "))}</aside>`);
      else html.push(`<p>${formato(grupo.lineas.join(" "))}</p>`);
      grupo = null;
    };
    for (const cruda of bloque.split("\n")) {
      const linea = cruda.trim();
      if (!linea) continue;
      if (linea.startsWith("## ")) { cerrar(); html.push(`<h3>${formato(linea.slice(3))}</h3>`); continue; }
      const tipo = linea.startsWith("- ") ? "lista" : linea.startsWith("> ") ? "recuadro" : "parrafo";
      const contenido = tipo === "parrafo" ? linea : linea.slice(2);
      if (!grupo || grupo.tipo !== tipo) { cerrar(); grupo = { tipo, lineas: [] }; }
      grupo.lineas.push(contenido);
    }
    cerrar();
  }
  return html.join("");
}

// Achica la foto del comprobante para guardarla junto con la inscripción.
async function comprimirImagen(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("imagen"));
      i.src = url;
    });
    let lado = 1200;
    for (let intento = 0; intento < 6; intento++) {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
      const datos = lienzo.toDataURL("image/jpeg", 0.72);
      if (datos.length < 850000) return datos;
      lado = Math.round(lado * 0.75);
    }
    throw new Error("grande");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const ERRORES_AUTH = {
  "auth/invalid-email": "El mail no es válido.",
  "auth/missing-password": "Escribí tu contraseña.",
  "auth/weak-password": "La contraseña tiene que tener al menos 6 caracteres.",
  "auth/email-already-in-use": "Ya hay una cuenta con ese mail. Probá ingresar.",
  "auth/invalid-credential": "El mail o la contraseña no coinciden.",
  "auth/wrong-password": "El mail o la contraseña no coinciden.",
  "auth/user-not-found": "No hay una cuenta con ese mail.",
  "auth/too-many-requests": "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
  "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
  "auth/network-request-failed": "No hay conexión. Revisá tu internet.",
};

function mensajeError(e) {
  return ERRORES_AUTH[e && e.code] || "Algo salió mal. Probá de nuevo en un rato.";
}

/* ---------- Arranque ---------- */

let config = firebaseConfig;
if (!config.apiKey && usaEmulador) {
  config = { apiKey: "demo", authDomain: "demo-campus.firebaseapp.com", projectId: "demo-campus" };
}

if (!config.apiKey) {
  app.innerHTML = `
    <section class="campus__vacio">
      <h1>El campus está en preparación</h1>
      <p>Muy pronto vas a poder inscribirte y cursar desde acá. Mientras tanto, escribile a Jessica por WhatsApp.</p>
      <a class="btn" href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">Escribir por WhatsApp</a>
    </section>`;
  throw new Error("Falta configurar Firebase en js/firebase-config.js");
}

const firebase = initializeApp(config);
const auth = getAuth(firebase);
auth.languageCode = "es";
const db = getFirestore(firebase);
if (usaEmulador) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const estado = {
  usuario: null,
  admin: false,
  inscripciones: [],
  vista: "inicio",          // "inicio" | "curso" | "panel"
  cursoAbierto: null,
  contenido: null,
  modulo: 0,
  panelPestana: "solicitudes",
  filtro: "pendiente_aprobacion",
  todas: [],
  cursoPendiente: params.get("curso"),
};
let cortarInscripciones = null;
let cortarPanel = null;

onAuthStateChanged(auth, (usuario) => {
  estado.usuario = usuario;
  estado.admin = !!(usuario && usuario.emailVerified && ADMINS.includes((usuario.email || "").toLowerCase()));
  if (cortarInscripciones) { cortarInscripciones(); cortarInscripciones = null; }
  if (cortarPanel) { cortarPanel(); cortarPanel = null; }
  estado.inscripciones = [];
  estado.vista = "inicio";
  pintarBarra();
  if (!usuario) {
    pintarIngreso();
    return;
  }
  const q = query(collection(db, "inscripciones"), where("uid", "==", usuario.uid));
  let primera = true;
  cortarInscripciones = onSnapshot(q, (snap) => {
    estado.inscripciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (estado.vista === "inicio") pintarInicio();
    if (primera) {
      primera = false;
      const pedido = estado.cursoPendiente && cursoPorId(estado.cursoPendiente);
      estado.cursoPendiente = null;
      if (pedido) {
        history.replaceState(null, "", location.pathname + (usaEmulador ? "?emulador" : ""));
        const ya = estado.inscripciones.find((i) => i.curso === pedido.id);
        if (ya) accionInscripcion(ya); else confirmarInscripcion(pedido.id);
      }
    }
  }, () => {
    app.innerHTML = `<p class="campus__aviso">No pudimos cargar tus cursos. Revisá tu conexión y recargá la página.</p>`;
  });
});

/* ---------- Barra superior ---------- */

function pintarBarra() {
  const u = estado.usuario;
  if (!u) { barra.innerHTML = `<a class="btn btn--chico btn--linea" href="index.html">Volver a la página</a>`; return; }
  barra.innerHTML = `
    ${estado.admin ? `
      <nav class="campus__pestanas" aria-label="Secciones del campus">
        <button type="button" data-ir="inicio" ${estado.vista !== "panel" ? 'aria-current="page"' : ""}>Mis cursos</button>
        <button type="button" data-ir="panel" ${estado.vista === "panel" ? 'aria-current="page"' : ""}>Panel de Jessica</button>
      </nav>` : ""}
    <span class="campus__nombre">${esc(u.displayName || u.email)}</span>
    <button class="btn btn--chico btn--linea" type="button" data-salir>Salir</button>`;
}

barra.addEventListener("click", (e) => {
  if (e.target.closest("[data-salir]")) { signOut(auth); return; }
  const ir = e.target.closest("[data-ir]");
  if (ir) {
    if (ir.dataset.ir === "panel") abrirPanel(); else irAInicio();
  }
});

/* ---------- Ingreso y registro ---------- */

function pintarIngreso(modo = "ingresar", mensaje = "") {
  const pedido = estado.cursoPendiente && cursoPorId(estado.cursoPendiente);
  app.innerHTML = `
    <section class="acceso">
      <div class="acceso__texto">
        <p class="rotulo">Campus de cursos</p>
        <h1>${pedido ? `Inscribite a <em>${esc(pedido.titulo)}</em>` : "Cursá desde donde estés"}</h1>
        <p>${pedido ? "Primero ingresá o creá tu cuenta. Después te mostramos cómo pagar y, cuando Jessica aprueba el pago, empezás a cursar acá mismo."
          : "Ingresá para ver tus cursos, inscribirte a uno nuevo o seguir donde lo dejaste."}</p>
        <img src="assets/ilustraciones/online.svg" alt="" width="400" height="300" />
      </div>
      <div class="acceso__tarjeta">
        <div class="acceso__modos" role="tablist">
          <button type="button" role="tab" data-modo="ingresar" aria-selected="${modo === "ingresar"}">Ingresar</button>
          <button type="button" role="tab" data-modo="registro" aria-selected="${modo === "registro"}">Crear cuenta</button>
        </div>
        <button class="btn btn--google" type="button" data-google>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"/></svg>
          Continuar con Google
        </button>
        <p class="acceso__o"><span>o con tu mail</span></p>
        <form id="form-acceso" novalidate>
          ${modo === "registro" ? `
          <label class="campo"><span>Nombre y apellido</span>
            <input name="nombre" autocomplete="name" required maxlength="100" /></label>` : ""}
          <label class="campo"><span>Mail</span>
            <input name="email" type="email" autocomplete="email" required /></label>
          <label class="campo"><span>Contraseña</span>
            <input name="clave" type="password" autocomplete="${modo === "registro" ? "new-password" : "current-password"}" required minlength="6" /></label>
          <p class="acceso__error" role="alert">${esc(mensaje)}</p>
          <button class="btn acceso__enviar" type="submit">${modo === "registro" ? "Crear mi cuenta" : "Ingresar"}</button>
          ${modo === "ingresar" ? `<button class="acceso__olvido" type="button" data-olvido>Me olvidé la contraseña</button>` : ""}
        </form>
      </div>
    </section>`;

  app.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => pintarIngreso(b.dataset.modo)));
  app.querySelector("[data-google]").addEventListener("click", async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { pintarIngreso(modo, mensajeError(e)); }
  });
  const form = app.querySelector("#form-acceso");
  const error = form.querySelector(".acceso__error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = new FormData(form);
    const email = String(datos.get("email") || "").trim();
    const clave = String(datos.get("clave") || "");
    const nombre = String(datos.get("nombre") || "").trim();
    if (modo === "registro" && !nombre) { error.textContent = "Escribí tu nombre y apellido."; return; }
    const boton = form.querySelector(".acceso__enviar");
    boton.disabled = true;
    try {
      if (modo === "registro") {
        const cred = await createUserWithEmailAndPassword(auth, email, clave);
        await updateProfile(cred.user, { displayName: nombre });
        estado.usuario = auth.currentUser;
        pintarBarra();
        pintarInicio();
      } else {
        await signInWithEmailAndPassword(auth, email, clave);
      }
    } catch (err) {
      error.textContent = mensajeError(err);
      boton.disabled = false;
    }
  });
  const olvido = form.querySelector("[data-olvido]");
  if (olvido) olvido.addEventListener("click", async () => {
    const email = String(new FormData(form).get("email") || "").trim();
    if (!email) { error.textContent = "Escribí tu mail arriba y volvé a tocar «Me olvidé la contraseña»."; return; }
    try {
      await sendPasswordResetEmail(auth, email);
      error.textContent = "";
      mostrarAviso("Te mandamos un mail para crear una contraseña nueva.");
    } catch (err) { error.textContent = mensajeError(err); }
  });
}

/* ---------- Inicio del alumno ---------- */

function irAInicio() {
  estado.vista = "inicio";
  if (cortarPanel) { cortarPanel(); cortarPanel = null; }
  pintarBarra();
  pintarInicio();
}

function pintarInicio() {
  const u = estado.usuario;
  if (!u) return;
  const mias = estado.inscripciones
    .filter((i) => cursoPorId(i.curso))
    .sort((a, b) => (b.actualizada?.seconds || 0) - (a.actualizada?.seconds || 0));
  const tomados = new Set(mias.map((i) => i.curso));
  const otros = CURSOS.filter((c) => !tomados.has(c.id));
  const nombre = (u.displayName || "").split(" ")[0];

  app.innerHTML = `
    <section class="campus__bienvenida">
      <p class="rotulo">Campus de cursos</p>
      <h1>Hola${nombre ? `, ${esc(nombre)}` : ""}</h1>
      <p>${mias.length ? "Acá tenés tus cursos y el estado de cada inscripción." : "Todavía no te inscribiste a ningún curso. Elegí uno para empezar."}</p>
    </section>

    ${mias.length ? `
    <section class="campus__bloque">
      <h2>Mis cursos</h2>
      <div class="campus__grilla">
        ${mias.map((i) => {
          const c = cursoPorId(i.curso);
          const e = ESTADOS[i.estado] || ESTADOS.pendiente_pago;
          return `
          <article class="campus__curso">
            <img src="assets/ilustraciones/cursos/${c.id}.svg" alt="" width="400" height="200" />
            <div class="campus__curso-cuerpo">
              <span class="estado estado--${e.clase}">${e.texto}</span>
              <h3>${esc(c.titulo)}</h3>
              <p class="campus__detalle">${detalleEstado(i)}</p>
              <button class="btn btn--chico ${i.estado === "pendiente_aprobacion" ? "btn--linea" : ""}" type="button" data-inscripcion="${esc(i.id)}">
                ${{ pendiente_pago: "Pagar y subir comprobante", pendiente_aprobacion: "Ver mi inscripción", aprobada: "Entrar al curso", rechazada: "Subir otro comprobante" }[i.estado] || "Ver"}
              </button>
            </div>
          </article>`;
        }).join("")}
      </div>
    </section>` : ""}

    ${otros.length ? `
    <section class="campus__bloque">
      <h2>${mias.length ? "Más cursos" : "Cursos disponibles"}</h2>
      <div class="campus__grilla">
        ${otros.map((c) => `
          <article class="campus__curso">
            <img src="assets/ilustraciones/cursos/${c.id}.svg" alt="" width="400" height="200" />
            <div class="campus__curso-cuerpo">
              <p class="curso__para">${esc(c.para)}</p>
              <h3>${esc(c.titulo)}</h3>
              <p class="campus__detalle">${c.modulos.length} módulos · ${c.semanas} semanas · <strong>${esc(c.precio)}</strong></p>
              <button class="btn btn--chico" type="button" data-inscribir="${c.id}">Inscribirme</button>
            </div>
          </article>`).join("")}
      </div>
    </section>` : ""}`;

  app.querySelectorAll("[data-inscripcion]").forEach((b) => b.addEventListener("click", () => {
    accionInscripcion(estado.inscripciones.find((i) => i.id === b.dataset.inscripcion));
  }));
  app.querySelectorAll("[data-inscribir]").forEach((b) => b.addEventListener("click", () => confirmarInscripcion(b.dataset.inscribir)));
}

function detalleEstado(i) {
  switch (i.estado) {
    case "pendiente_pago": return `Transferí y subí el comprobante. Tu código: <strong>${esc(i.codigo)}</strong>`;
    case "pendiente_aprobacion": return "Jessica está revisando tu comprobante. Te avisamos acá cuando esté aprobado.";
    case "aprobada": return "¡Listo! Ya podés cursar.";
    case "rechazada": return i.nota ? `Motivo: ${esc(i.nota)}` : "Revisá el comprobante y volvé a subirlo.";
    default: return "";
  }
}

function accionInscripcion(i) {
  if (!i) return;
  if (i.estado === "aprobada") abrirCurso(i.curso);
  else if (i.estado === "pendiente_aprobacion") ventanaEnRevision(i);
  else ventanaPago(i);
}

/* ---------- Inscripción y pago ---------- */

function confirmarInscripcion(cursoId) {
  const c = cursoPorId(cursoId);
  if (!c) return;
  abrirVentana(`
    <img class="programa__ilustracion" src="assets/ilustraciones/cursos/${c.id}.svg" alt="" width="400" height="200" />
    <p class="rotulo">Inscripción</p>
    <h2 id="ventana-titulo">${esc(c.titulo)}</h2>
    <p class="programa__resumen">${esc(c.resumen)}</p>
    <dl class="programa__datos">
      <div><dt>Valor</dt><dd>${esc(c.precio)}</dd></div>
      <div><dt>Duración</dt><dd>${c.semanas} semanas · ${c.modulos.length} módulos</dd></div>
    </dl>
    <h3>Cómo sigue</h3>
    <ol class="programa__lista">
      <li>Te mostramos el alias y tu código de inscripción.</li>
      <li>Hacés la transferencia desde tu banco o billetera.</li>
      <li>Subís acá la captura del comprobante.</li>
      <li>Jessica lo aprueba y se habilitan las clases.</li>
    </ol>
    <div class="programa__pie"><button class="btn" type="button" data-confirmar>Quiero inscribirme</button></div>`);
  ventanaContenido.querySelector("[data-confirmar]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    const u = estado.usuario;
    const id = `${u.uid}_${c.id}`;
    const nueva = {
      uid: u.uid,
      email: u.email || "",
      nombre: (u.displayName || u.email || "Sin nombre").slice(0, 100),
      curso: c.id,
      estado: "pendiente_pago",
      codigo: codigoNuevo(),
      creada: serverTimestamp(),
      actualizada: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, "inscripciones", id), nueva);
      ventanaPago({ id, ...nueva });
    } catch (err) {
      e.target.disabled = false;
      mostrarAviso("No pudimos registrar la inscripción. Probá de nuevo.");
    }
  });
}

function ventanaPago(i) {
  const c = cursoPorId(i.curso);
  abrirVentana(`
    <p class="rotulo">${i.estado === "rechazada" ? "Volvé a subir el comprobante" : "Pago por transferencia"}</p>
    <h2 id="ventana-titulo">${esc(c.titulo)}</h2>
    ${i.estado === "rechazada" && i.nota ? `<p class="pago__nota"><strong>Jessica te dejó este mensaje:</strong> ${esc(i.nota)}</p>` : ""}
    <p class="programa__resumen">Transferí el valor del curso a este alias y poné tu código en el concepto o mensaje de la transferencia.</p>
    <dl class="pago__datos">
      <div><dt>Alias</dt><dd><span>${esc(ALIAS)}</span><button class="pago__copiar" type="button" data-copiar="${esc(ALIAS)}">Copiar</button></dd></div>
      <div><dt>Monto</dt><dd><span>${esc(c.precio)}</span></dd></div>
      <div><dt>Tu código</dt><dd><span>${esc(i.codigo)}</span><button class="pago__copiar" type="button" data-copiar="${esc(i.codigo)}">Copiar</button></dd></div>
    </dl>
    <h3>¿Ya transferiste?</h3>
    <p>Subí una captura o foto del comprobante. Jessica lo revisa y te habilita el curso.</p>
    <label class="pago__archivo">
      <input type="file" accept="image/*" data-comprobante />
      <span>Elegir captura del comprobante</span>
    </label>
    <p class="acceso__error" role="alert" data-error></p>
    <p class="pago__ayuda">¿Dudas con el pago? <a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola Jessica, tengo una duda con el pago del curso ${c.titulo}. Mi código es ${i.codigo}.`)}" target="_blank" rel="noopener">Escribile a Jessica</a>.</p>`);

  ventanaContenido.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copiar); mostrarAviso("Copiado."); }
    catch { mostrarAviso("No se pudo copiar. Seleccionalo y copialo a mano."); }
  }));
  const input = ventanaContenido.querySelector("[data-comprobante]");
  const error = ventanaContenido.querySelector("[data-error]");
  input.addEventListener("change", async () => {
    const archivo = input.files && input.files[0];
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) { error.textContent = "Subí una imagen: una captura o una foto del comprobante."; return; }
    error.textContent = "";
    input.closest(".pago__archivo").querySelector("span").textContent = "Subiendo…";
    input.disabled = true;
    try {
      const comprobante = await comprimirImagen(archivo);
      await updateDoc(doc(db, "inscripciones", i.id), {
        estado: "pendiente_aprobacion",
        comprobante,
        actualizada: serverTimestamp(),
      });
      ventanaEnRevision({ ...i, estado: "pendiente_aprobacion" });
    } catch (err) {
      input.disabled = false;
      input.closest(".pago__archivo").querySelector("span").textContent = "Elegir captura del comprobante";
      error.textContent = err && err.message === "grande"
        ? "La imagen es muy grande. Probá con una captura de pantalla."
        : "No pudimos subir el comprobante. Probá de nuevo.";
    }
  });
}

function ventanaEnRevision(i) {
  const c = cursoPorId(i.curso);
  abrirVentana(`
    <div class="revision">
      <span class="revision__icono" aria-hidden="true">✓</span>
      <p class="rotulo">Comprobante recibido</p>
      <h2 id="ventana-titulo">¡Gracias! Jessica está revisando tu pago</h2>
      <p>Cuando lo apruebe, <strong>${esc(c.titulo)}</strong> aparece habilitado en «Mis cursos». Podés cerrar esta ventana y volver cuando quieras.</p>
      <p class="pago__ayuda">Tu código: <strong>${esc(i.codigo)}</strong></p>
      <div class="programa__pie"><button class="btn" type="button" data-cerrar>Entendido</button></div>
    </div>`);
  ventanaContenido.querySelector("[data-cerrar]").addEventListener("click", cerrarVentana);
}

/* ---------- Lector de clases ---------- */

async function abrirCurso(cursoId) {
  cerrarVentana();
  const c = cursoPorId(cursoId);
  estado.vista = "curso";
  estado.cursoAbierto = c;
  pintarBarra();
  app.innerHTML = `<p class="campus__aviso">Cargando las clases…</p>`;
  try {
    const snap = await getDoc(doc(db, "contenidos", cursoId));
    estado.contenido = snap.exists() ? (snap.data().modulos || []) : [];
  } catch (err) {
    app.innerHTML = `<p class="campus__aviso">No pudimos abrir el curso. Si tu inscripción ya fue aprobada, recargá la página. <button class="btn btn--chico btn--linea" type="button" data-volver>Volver a mis cursos</button></p>`;
    app.querySelector("[data-volver]").addEventListener("click", irAInicio);
    return;
  }
  const guardado = Number(localStorage.getItem(`jb-modulo-${cursoId}`) || 0);
  estado.modulo = Math.min(Math.max(guardado, 0), Math.max(estado.contenido.length - 1, 0));
  pintarCurso();
}

function vistos(cursoId) {
  try { return new Set(JSON.parse(localStorage.getItem(`jb-vistos-${cursoId}`) || "[]")); }
  catch { return new Set(); }
}

function pintarCurso() {
  const c = estado.cursoAbierto;
  const modulos = estado.contenido;
  if (!modulos.length) {
    app.innerHTML = `
      <section class="campus__vacio">
        <h1>${esc(c.titulo)}</h1>
        <p>Jessica todavía está cargando las clases de este curso. Volvé a mirar en unos días.</p>
        <button class="btn btn--linea" type="button" data-volver>Volver a mis cursos</button>
      </section>`;
    app.querySelector("[data-volver]").addEventListener("click", irAInicio);
    return;
  }
  const n = estado.modulo;
  const m = modulos[n];
  const vistosCurso = vistos(c.id);
  vistosCurso.add(n);
  try {
    localStorage.setItem(`jb-vistos-${c.id}`, JSON.stringify([...vistosCurso]));
    localStorage.setItem(`jb-modulo-${c.id}`, String(n));
  } catch { /* sin almacenamiento local: el curso igual funciona */ }
  const ultimo = n === modulos.length - 1;

  app.innerHTML = `
    <div class="lector">
      <aside class="lector__indice">
        <button class="lector__volver" type="button" data-volver>← Mis cursos</button>
        <p class="rotulo">Curso</p>
        <h2>${esc(c.titulo)}</h2>
        <p class="lector__progreso">${vistosCurso.size} de ${modulos.length} módulos vistos</p>
        <div class="lector__barra"><span style="width:${Math.round((vistosCurso.size / modulos.length) * 100)}%"></span></div>
        <ol>
          ${modulos.map((mod, i) => `
            <li><button type="button" data-modulo="${i}" ${i === n ? 'aria-current="step"' : ""} class="${vistosCurso.has(i) ? "visto" : ""}">
              <span>Módulo ${i + 1}</span>${esc(mod.titulo)}</button></li>`).join("")}
        </ol>
      </aside>
      <article class="lector__clase clase">
        <p class="rotulo">Módulo ${n + 1} de ${modulos.length}</p>
        <h1>${esc(m.titulo)}</h1>
        ${textoAHtml(m.texto)}
        ${ultimo ? `
          <div class="clase__fin">
            <h3>¡Terminaste el curso!</h3>
            <p>Felicitaciones por llegar hasta acá. Pedile a Jessica tu certificado de finalización.</p>
            <a class="btn" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola Jessica, terminé el curso ${c.titulo} y quiero pedir mi certificado.`)}" target="_blank" rel="noopener">Pedir mi certificado</a>
          </div>` : ""}
        <nav class="lector__nav" aria-label="Cambiar de módulo">
          <button class="btn btn--linea" type="button" data-paso="-1" ${n === 0 ? "disabled" : ""}>← Anterior</button>
          ${ultimo ? "" : `<button class="btn" type="button" data-paso="1">Siguiente módulo →</button>`}
        </nav>
      </article>
    </div>`;

  app.querySelector("[data-volver]").addEventListener("click", irAInicio);
  app.querySelectorAll("[data-modulo]").forEach((b) => b.addEventListener("click", () => irAModulo(Number(b.dataset.modulo))));
  app.querySelectorAll("[data-paso]").forEach((b) => b.addEventListener("click", () => irAModulo(n + Number(b.dataset.paso))));
}

function irAModulo(i) {
  estado.modulo = Math.min(Math.max(i, 0), estado.contenido.length - 1);
  pintarCurso();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- Panel de Jessica ---------- */

function abrirPanel() {
  if (!estado.admin) return;
  estado.vista = "panel";
  pintarBarra();
  if (!cortarPanel) {
    const q = query(collection(db, "inscripciones"), orderBy("actualizada", "desc"));
    cortarPanel = onSnapshot(q, (snap) => {
      estado.todas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (estado.vista === "panel" && estado.panelPestana === "solicitudes") pintarPanel();
    }, () => { app.innerHTML = `<p class="campus__aviso">No tenés permiso para ver el panel.</p>`; });
  }
  pintarPanel();
}

function pintarPanel() {
  const pestanas = `
    <div class="panel__pestanas" role="tablist">
      <button type="button" role="tab" data-pestana="solicitudes" aria-selected="${estado.panelPestana === "solicitudes"}">Inscripciones y pagos</button>
      <button type="button" role="tab" data-pestana="clases" aria-selected="${estado.panelPestana === "clases"}">Clases de los cursos</button>
    </div>`;
  if (estado.panelPestana === "clases") { pintarEditor(pestanas); return; }

  const cuenta = (e) => estado.todas.filter((i) => i.estado === e).length;
  const filtros = [
    ["pendiente_aprobacion", "Por revisar"], ["pendiente_pago", "Esperando pago"],
    ["aprobada", "Aprobadas"], ["rechazada", "Rechazadas"], ["todas", "Todas"],
  ];
  const lista = estado.todas.filter((i) => estado.filtro === "todas" || i.estado === estado.filtro);

  app.innerHTML = `
    <section class="campus__bienvenida">
      <p class="rotulo">Panel de Jessica</p>
      <h1>Inscripciones</h1>
      <p>${cuenta("pendiente_aprobacion") ? `Tenés <strong>${cuenta("pendiente_aprobacion")}</strong> comprobante${cuenta("pendiente_aprobacion") === 1 ? "" : "s"} para revisar.` : "No hay comprobantes para revisar."}</p>
    </section>
    ${pestanas}
    <div class="panel__filtros">
      ${filtros.map(([v, t]) => `<button type="button" data-filtro="${v}" aria-pressed="${estado.filtro === v}">${t}${v !== "todas" ? ` <span>${cuenta(v)}</span>` : ""}</button>`).join("")}
    </div>
    <div class="panel__lista">
      ${lista.length ? lista.map((i) => {
        const c = cursoPorId(i.curso);
        const e = ESTADOS[i.estado] || ESTADOS.pendiente_pago;
        const tieneImagen = typeof i.comprobante === "string" && i.comprobante.startsWith("data:image/");
        return `
        <article class="solicitud">
          <div class="solicitud__datos">
            <span class="estado estado--${e.clase}">${e.texto}</span>
            <h3>${esc(i.nombre)}</h3>
            <p>${esc(i.email)}</p>
            <p><strong>${esc(c ? c.titulo : i.curso)}</strong> · ${esc(c ? c.precio : "")}</p>
            <p>Código <strong>${esc(i.codigo)}</strong> · ${esc(fecha(i.actualizada))}</p>
            ${i.nota ? `<p class="solicitud__nota">Nota: ${esc(i.nota)}</p>` : ""}
          </div>
          ${tieneImagen ? `<button class="solicitud__comprobante" type="button" data-ver="${esc(i.id)}"><img src="${i.comprobante}" alt="Comprobante de ${esc(i.nombre)}" /></button>`
            : `<p class="solicitud__sin">Sin comprobante</p>`}
          <div class="solicitud__acciones">
            ${i.estado !== "aprobada" ? `<button class="btn btn--chico" type="button" data-aprobar="${esc(i.id)}">Aprobar</button>` : ""}
            ${i.estado !== "rechazada" && i.estado !== "aprobada" ? `<button class="btn btn--chico btn--linea" type="button" data-rechazar="${esc(i.id)}">Rechazar</button>` : ""}
          </div>
        </article>`;
      }).join("") : `<p class="campus__aviso">No hay inscripciones en esta lista.</p>`}
    </div>`;

  app.querySelectorAll("[data-pestana]").forEach((b) => b.addEventListener("click", () => { estado.panelPestana = b.dataset.pestana; pintarPanel(); }));
  app.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { estado.filtro = b.dataset.filtro; pintarPanel(); }));
  app.querySelectorAll("[data-ver]").forEach((b) => b.addEventListener("click", () => {
    const i = estado.todas.find((x) => x.id === b.dataset.ver);
    abrirVentana(`<p class="rotulo">Comprobante</p><h2 id="ventana-titulo">${esc(i.nombre)} · ${esc(i.codigo)}</h2><img class="comprobante-grande" src="${i.comprobante}" alt="Comprobante" />`);
  }));
  app.querySelectorAll("[data-aprobar]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await updateDoc(doc(db, "inscripciones", b.dataset.aprobar), { estado: "aprobada", nota: "", actualizada: serverTimestamp() });
      mostrarAviso("Inscripción aprobada: ya puede cursar.");
    } catch { b.disabled = false; mostrarAviso("No se pudo aprobar. Probá de nuevo."); }
  }));
  app.querySelectorAll("[data-rechazar]").forEach((b) => b.addEventListener("click", () => ventanaRechazo(b.dataset.rechazar)));
}

function ventanaRechazo(id) {
  const i = estado.todas.find((x) => x.id === id);
  abrirVentana(`
    <p class="rotulo">Rechazar comprobante</p>
    <h2 id="ventana-titulo">${esc(i.nombre)}</h2>
    <p>Contale qué pasó para que pueda volver a subirlo. Lo va a ver en el campus.</p>
    <label class="campo"><span>Motivo</span>
      <textarea rows="3" maxlength="300" data-motivo placeholder="Por ejemplo: no se ve el monto, o el monto no coincide."></textarea></label>
    <div class="programa__pie"><button class="btn" type="button" data-confirmar>Rechazar y avisarle</button></div>`);
  ventanaContenido.querySelector("[data-confirmar]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    const nota = ventanaContenido.querySelector("[data-motivo]").value.trim();
    try {
      await updateDoc(doc(db, "inscripciones", id), { estado: "rechazada", nota, actualizada: serverTimestamp() });
      cerrarVentana();
      mostrarAviso("Comprobante rechazado.");
    } catch { e.target.disabled = false; mostrarAviso("No se pudo rechazar. Probá de nuevo."); }
  });
}

/* Editor de clases */

let editor = { curso: CURSOS[0].id, modulos: null };

async function pintarEditor(pestanas) {
  const c = cursoPorId(editor.curso);
  if (editor.modulos === null) {
    app.innerHTML = `${pestanas}<p class="campus__aviso">Cargando las clases…</p>`;
    try {
      const snap = await getDoc(doc(db, "contenidos", c.id));
      editor.modulos = snap.exists() && snap.data().modulos?.length
        ? snap.data().modulos
        : c.modulos.map((m) => ({ titulo: m.titulo, texto: "" }));
    } catch {
      app.innerHTML = `${pestanas}<p class="campus__aviso">No se pudieron cargar las clases.</p>`;
      return;
    }
  }

  app.innerHTML = `
    <section class="campus__bienvenida">
      <p class="rotulo">Panel de Jessica</p>
      <h1>Clases de los cursos</h1>
      <p>Lo que escribas acá es lo que ven los alumnos aprobados. Separá los párrafos con una línea en blanco; usá <code>## </code> para un subtítulo, <code>- </code> para una lista, <code>&gt; </code> para un recuadro y <code>**así**</code> para negrita.</p>
    </section>
    ${pestanas}
    <div class="editor__barra">
      <label class="campo"><span>Curso</span>
        <select data-curso>${CURSOS.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.titulo)}</option>`).join("")}</select></label>
      <label class="btn btn--chico btn--linea editor__importar">Importar clases (.json)
        <input type="file" accept="application/json,.json" data-importar hidden /></label>
    </div>
    <div class="editor__modulos">
      ${editor.modulos.map((m, i) => `
        <fieldset class="editor__modulo">
          <legend>Módulo ${i + 1}</legend>
          <label class="campo"><span>Título</span><input data-titulo="${i}" value="${esc(m.titulo)}" maxlength="150" /></label>
          <label class="campo"><span>Contenido</span><textarea data-texto="${i}" rows="12">${esc(m.texto)}</textarea></label>
          <button class="editor__quitar" type="button" data-quitar="${i}">Quitar este módulo</button>
        </fieldset>`).join("")}
    </div>
    <div class="editor__acciones">
      <button class="btn btn--linea" type="button" data-agregar>+ Agregar módulo</button>
      <button class="btn" type="button" data-guardar>Guardar cambios</button>
    </div>`;

  const leerFormulario = () => {
    editor.modulos = editor.modulos.map((m, i) => ({
      titulo: app.querySelector(`[data-titulo="${i}"]`).value.trim(),
      texto: app.querySelector(`[data-texto="${i}"]`).value,
    }));
  };
  app.querySelectorAll("[data-pestana]").forEach((b) => b.addEventListener("click", () => { estado.panelPestana = b.dataset.pestana; pintarPanel(); }));
  app.querySelector("[data-curso]").addEventListener("change", (e) => {
    editor = { curso: e.target.value, modulos: null };
    pintarPanel();
  });
  app.querySelector("[data-agregar]").addEventListener("click", () => {
    leerFormulario();
    editor.modulos.push({ titulo: "", texto: "" });
    pintarPanel();
  });
  app.querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("¿Quitar este módulo? Se borra cuando guardes.")) return;
    leerFormulario();
    editor.modulos.splice(Number(b.dataset.quitar), 1);
    pintarPanel();
  }));
  app.querySelector("[data-guardar]").addEventListener("click", async (e) => {
    leerFormulario();
    e.target.disabled = true;
    try {
      await setDoc(doc(db, "contenidos", editor.curso), { modulos: editor.modulos.filter((m) => m.titulo || m.texto), actualizada: serverTimestamp() });
      mostrarAviso("Clases guardadas.");
    } catch { mostrarAviso("No se pudo guardar. Probá de nuevo."); }
    e.target.disabled = false;
  });
  app.querySelector("[data-importar]").addEventListener("change", async (e) => {
    const archivo = e.target.files && e.target.files[0];
    if (!archivo) return;
    try {
      const datos = JSON.parse(await archivo.text());
      const ids = Object.keys(datos).filter((id) => cursoPorId(id) && Array.isArray(datos[id].modulos));
      if (!ids.length) throw new Error("vacío");
      if (!confirm(`Se van a reemplazar las clases de ${ids.length} curso${ids.length === 1 ? "" : "s"}. ¿Seguimos?`)) return;
      const lote = writeBatch(db);
      ids.forEach((id) => lote.set(doc(db, "contenidos", id), {
        modulos: datos[id].modulos.map((m) => ({ titulo: String(m.titulo || ""), texto: String(m.texto || "") })),
        actualizada: serverTimestamp(),
      }));
      await lote.commit();
      editor.modulos = null;
      mostrarAviso(`Listo: se cargaron las clases de ${ids.length} curso${ids.length === 1 ? "" : "s"}.`);
      pintarPanel();
    } catch {
      mostrarAviso("No se pudo importar el archivo. Revisá que sea el .json de las clases.");
    }
  });
}
