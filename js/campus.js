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
  return ts.toDate().toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
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
  busqueda: "",
  opiniones: [],
  previa: false,             // Jessica viendo un curso "como alumno"
  leidasHasta: 0,            // segundos: hasta cuándo leyó las notificaciones
  notifAbiertas: false,
  resaltadas: new Set(),
  cursoPendiente: params.get("curso"),
};
let cortarInscripciones = null;
let cortarPanel = null;

onAuthStateChanged(auth, (usuario) => {
  estado.usuario = usuario;
  estado.admin = !!(usuario && usuario.emailVerified && ADMINS.includes((usuario.email || "").toLowerCase()));
  if (cortarInscripciones) { cortarInscripciones(); cortarInscripciones = null; }
  if (cortarPanel) { cortarPanel(); cortarPanel = null; }
  if (cortarOpiniones) { cortarOpiniones(); cortarOpiniones = null; }
  if (cortarLeidas) { cortarLeidas(); cortarLeidas = null; }
  estado.inscripciones = [];
  estado.todas = [];
  estado.opiniones = [];
  estado.vista = "inicio";
  estado.previa = false;
  estado.notifAbiertas = false;
  avisadas = null;
  cargado = { leidas: false, inscripciones: false, admin: !estado.admin };
  pintarBarra();
  if (!usuario) {
    pintarIngreso();
    return;
  }
  cortarLeidas = onSnapshot(doc(db, "usuarios", usuario.uid), (snap) => {
    const datos = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : {};
    estado.leidasHasta = datos.notificacionesLeidas ? datos.notificacionesLeidas.seconds : 0;
    cargado.leidas = true;
    actualizarNotificaciones();
  }, () => { cargado.leidas = true; });
  if (estado.admin) escucharAdmin();
  const q = query(collection(db, "inscripciones"), where("uid", "==", usuario.uid));
  let primera = true;
  cortarInscripciones = onSnapshot(q, (snap) => {
    estado.inscripciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cargado.inscripciones = true;
    if (estado.vista === "inicio") pintarInicio();
    actualizarNotificaciones();
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
        <button type="button" data-ir="inicio" ${estado.vista !== "panel" && !estado.previa ? 'aria-current="page"' : ""}>Mis cursos</button>
        <button type="button" data-ir="panel" ${estado.vista === "panel" || estado.previa ? 'aria-current="page"' : ""}>Panel de Jessica</button>
      </nav>` : ""}
    <div class="notif">
      <button class="notif__boton" type="button" data-notif aria-expanded="${estado.notifAbiertas}" aria-controls="notif-panel" aria-label="Notificaciones">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-1.7 1.7A1 1 0 0 0 4 19.4h16a1 1 0 0 0 .7-1.7L19 16Z"/></svg>
        <span class="notif__contador" data-contador hidden></span>
      </button>
      <div class="notif__panel" id="notif-panel" data-notif-panel ${estado.notifAbiertas ? "" : "hidden"}></div>
    </div>
    <span class="campus__nombre">${esc(u.displayName || u.email)}</span>
    <button class="btn btn--chico btn--linea" type="button" data-salir>Salir</button>`;
  actualizarNotificaciones();
}

barra.addEventListener("click", (e) => {
  if (e.target.closest("[data-salir]")) { signOut(auth); return; }
  if (e.target.closest("[data-notif]")) { alternarNotificaciones(); return; }
  const item = e.target.closest("[data-notif-item]");
  if (item) {
    const n = listaNotificaciones().find((x) => x.id === item.dataset.notifItem);
    cerrarNotificaciones();
    if (n) n.accion();
    return;
  }
  const ir = e.target.closest("[data-ir]");
  if (ir) {
    if (ir.dataset.ir === "panel") abrirPanel(); else irAInicio();
  }
});

/* ---------- Notificaciones ---------- */
/* Salen del estado de las inscripciones y opiniones: no hace falta guardarlas aparte.
   Lo único que se guarda es hasta cuándo se leyeron, en usuarios/{uid}. */

let cortarLeidas = null;
let avisadas = null;   // notificaciones ya vistas en esta sesión, para avisar solo las que llegan nuevas
let cargado = {};      // qué datos ya llegaron desde que entró: hasta entonces no se avisa nada

function listaNotificaciones() {
  const lista = [];
  const titulo = (id) => (cursoPorId(id) || {}).titulo || id;
  for (const i of estado.inscripciones) {
    if (i.estado === "aprobada") {
      lista.push({
        id: `aprobada-${i.id}`, fecha: i.actualizada, tipo: "aprobada",
        texto: `¡Listo! Tu inscripción a ${titulo(i.curso)} fue aprobada. Ya podés cursar.`,
        accion: () => abrirCurso(i.curso),
      });
    } else if (i.estado === "rechazada") {
      lista.push({
        id: `rechazada-${i.id}`, fecha: i.actualizada, tipo: "rechazada",
        texto: `Jessica necesita que vuelvas a subir el comprobante de ${titulo(i.curso)}.${i.nota ? ` Motivo: ${i.nota}` : ""}`,
        accion: () => { irAInicio(); ventanaPago(i); },
      });
    }
  }
  if (estado.admin) {
    for (const i of estado.todas.filter((x) => x.estado === "pendiente_aprobacion")) {
      lista.push({
        id: `comprobante-${i.id}`, fecha: i.actualizada, tipo: "comprobante",
        texto: `${i.nombre} subió el comprobante de ${titulo(i.curso)}.`,
        accion: () => { estado.panelPestana = "solicitudes"; estado.filtro = "pendiente_aprobacion"; estado.busqueda = ""; abrirPanel(); },
      });
    }
    for (const o of estado.opiniones.filter((x) => !x.publicada)) {
      lista.push({
        id: `opinion-${o.id}`, fecha: o.actualizada, tipo: "opinion",
        texto: `${o.nombre} dejó una opinión sobre ${titulo(o.curso)}.`,
        accion: () => { estado.panelPestana = "opiniones"; abrirPanel(); },
      });
    }
  }
  return lista
    .filter((n) => n.fecha && n.fecha.seconds)
    .sort((a, b) => b.fecha.seconds - a.fecha.seconds)
    .slice(0, 20);
}

const esNueva = (n) => n.fecha.seconds > estado.leidasHasta;

function actualizarNotificaciones() {
  const contador = barra.querySelector("[data-contador]");
  if (!contador || !estado.usuario) return;
  const lista = listaNotificaciones();
  const nuevas = lista.filter(esNueva);
  contador.hidden = !nuevas.length;
  contador.textContent = nuevas.length > 9 ? "9+" : String(nuevas.length);
  barra.querySelector("[data-notif]").setAttribute("aria-label", nuevas.length ? `Notificaciones: ${nuevas.length} sin leer` : "Notificaciones");

  // Aviso en pantalla cuando llega una nueva mientras la persona está en el campus
  // (las que ya estaban al entrar solo suman al contador).
  if (cargado.leidas && cargado.inscripciones && cargado.admin) {
    const claves = new Set(lista.map((n) => `${n.id}@${n.fecha.seconds}`));
    if (avisadas) {
      const llegada = lista.find((n) => esNueva(n) && !avisadas.has(`${n.id}@${n.fecha.seconds}`));
      if (llegada) mostrarAviso(llegada.texto);
    }
    avisadas = claves;
  }

  if (estado.notifAbiertas) pintarPanelNotificaciones(lista);
}

function pintarPanelNotificaciones(lista = listaNotificaciones()) {
  const panel = barra.querySelector("[data-notif-panel]");
  if (!panel) return;
  const iconos = { aprobada: "✓", rechazada: "!", comprobante: "$", opinion: "★" };
  panel.innerHTML = `
    <p class="notif__titulo">Notificaciones</p>
    ${lista.length ? `<ul>${lista.map((n) => `
      <li><button type="button" class="notif__item notif__item--${n.tipo} ${estado.resaltadas.has(n.id) ? "notif__item--nueva" : ""}" data-notif-item="${esc(n.id)}">
        <span class="notif__icono" aria-hidden="true">${iconos[n.tipo]}</span>
        <span><span class="notif__texto">${esc(n.texto)}</span><span class="notif__fecha">${esc(fecha(n.fecha))}</span></span>
      </button></li>`).join("")}</ul>`
      : `<p class="notif__vacio">No tenés notificaciones. Acá te vamos a avisar ${estado.admin ? "cuando alguien suba un comprobante o deje una opinión" : "cuando Jessica revise tu pago"}.</p>`}`;
}

function alternarNotificaciones() {
  if (estado.notifAbiertas) { cerrarNotificaciones(); return; }
  const lista = listaNotificaciones();
  estado.resaltadas = new Set(lista.filter(esNueva).map((n) => n.id));
  estado.notifAbiertas = true;
  barra.querySelector("[data-notif]").setAttribute("aria-expanded", "true");
  barra.querySelector("[data-notif-panel]").hidden = false;
  pintarPanelNotificaciones(lista);
  // Al abrir el panel, todas quedan leídas (en esta y en cualquier otra sesión).
  if (estado.resaltadas.size) {
    setDoc(doc(db, "usuarios", estado.usuario.uid), { notificacionesLeidas: serverTimestamp() }).catch(() => {});
  }
}

function cerrarNotificaciones() {
  estado.notifAbiertas = false;
  const boton = barra.querySelector("[data-notif]");
  const panel = barra.querySelector("[data-notif-panel]");
  if (boton) boton.setAttribute("aria-expanded", "false");
  if (panel) panel.hidden = true;
}

document.addEventListener("click", (e) => {
  if (estado.notifAbiertas && !e.target.closest(".notif")) cerrarNotificaciones();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && estado.notifAbiertas) cerrarNotificaciones();
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
        <p class="acceso__legal">Al ingresar o crear tu cuenta aceptás los <a href="privacidad.html#terminos">términos de uso</a> y la <a href="privacidad.html#privacidad">política de privacidad</a>. Si sos menor de 18 años, necesitás la autorización de un adulto a cargo.</p>
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
  estado.previa = false;
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
    case "pendiente_aprobacion": return `Jessica está revisando tu comprobante. Te avisamos acá cuando esté aprobado. <a href="${enlaceAviso(i)}" target="_blank" rel="noopener">Avisarle por WhatsApp</a>`;
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
      <p>Para que lo revise más rápido, avisale que ya lo subiste:</p>
      <div class="revision__acciones">
        <a class="btn btn--whatsapp" href="${enlaceAviso(i)}" target="_blank" rel="noopener">Avisarle a Jessica por WhatsApp</a>
        <button class="btn btn--linea" type="button" data-cerrar>Listo</button>
      </div>
    </div>`);
  ventanaContenido.querySelector("[data-cerrar]").addEventListener("click", cerrarVentana);
}

// Mensaje ya escrito para que el alumno le avise a Jessica que subió el comprobante.
function enlaceAviso(i) {
  const c = cursoPorId(i.curso);
  const nombre = estado.usuario.displayName || estado.usuario.email || "";
  const texto = `Hola Jessica, soy ${nombre}. Ya subí al campus el comprobante de pago del curso ${c.titulo}. Mi código es ${i.codigo}.`;
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

/* ---------- Lector de clases ---------- */

async function abrirCurso(cursoId) {
  cerrarVentana();
  const c = cursoPorId(cursoId);
  estado.previa = false;
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
  await cargarProgreso(cursoId);
  estado.modulo = Math.min(Math.max(estado.progreso.modulo, 0), Math.max(estado.contenido.length - 1, 0));
  pintarCurso();
}

/* Progreso: se guarda en la cuenta, así se sigue en cualquier dispositivo. */

function refProgreso(cursoId) {
  return doc(db, "progreso", estado.usuario.uid, "cursos", cursoId);
}

async function cargarProgreso(cursoId) {
  const progreso = { vistos: new Set(), modulo: 0, evaluaciones: {} };
  try {
    const snap = await getDoc(refProgreso(cursoId));
    if (snap.exists()) {
      const d = snap.data();
      (d.vistos || []).forEach((n) => progreso.vistos.add(n));
      progreso.modulo = d.modulo || 0;
      progreso.evaluaciones = d.evaluaciones || {};
    }
  } catch { /* sin conexión: arranca de cero y se guarda después */ }
  // Suma lo que se había guardado solo en este dispositivo (versión anterior del campus).
  try {
    JSON.parse(localStorage.getItem(`jb-vistos-${cursoId}`) || "[]").forEach((n) => progreso.vistos.add(n));
  } catch { /* sin almacenamiento local */ }
  estado.progreso = progreso;
}

function guardarProgreso() {
  if (estado.previa) return;
  const c = estado.cursoAbierto;
  const p = estado.progreso;
  setDoc(refProgreso(c.id), {
    vistos: [...p.vistos].sort((a, b) => a - b),
    modulo: estado.modulo,
    evaluaciones: p.evaluaciones,
    actualizada: serverTimestamp(),
  }).catch(() => { /* se reintenta en el próximo cambio de módulo */ });
}

/* Autoevaluación: en el texto de cada módulo, una pregunta por bloque:
   "? pregunta", "- opción", "* opción correcta" y "= explicación". */
function leerAutoevaluacion(texto) {
  const preguntas = [];
  let actual = null;
  for (const cruda of String(texto || "").split("\n")) {
    const linea = cruda.trim();
    if (linea.startsWith("? ")) { actual = { pregunta: linea.slice(2), opciones: [], correcta: -1, explicacion: "" }; preguntas.push(actual); }
    else if (actual && (linea.startsWith("- ") || linea.startsWith("* "))) {
      if (linea.startsWith("* ")) actual.correcta = actual.opciones.length;
      actual.opciones.push(linea.slice(2));
    } else if (actual && linea.startsWith("= ")) actual.explicacion = linea.slice(2);
  }
  return preguntas.filter((p) => p.opciones.length > 1 && p.correcta >= 0);
}

function cursoCompleto() {
  return estado.contenido.length > 0 && estado.contenido.every((_, i) => estado.progreso.vistos.has(i));
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
  const vistosCurso = estado.progreso.vistos;
  vistosCurso.add(n);
  guardarProgreso();
  const ultimo = n === modulos.length - 1;
  const completo = cursoCompleto();
  const faltan = modulos.length - vistosCurso.size;
  const preguntas = leerAutoevaluacion(m.autoevaluacion);
  const resultado = estado.progreso.evaluaciones[String(n)];

  app.innerHTML = `
    ${estado.previa ? `
      <div class="previa">
        <p><strong>Vista previa.</strong> Así ven este curso tus alumnos, incluidos los cambios que todavía no guardaste. Nada de lo que hagas acá se guarda.</p>
        <button class="btn btn--chico" type="button" data-volver>Volver al editor</button>
      </div>` : ""}
    <div class="lector">
      <aside class="lector__indice">
        <button class="lector__volver" type="button" data-volver>${estado.previa ? "← Volver al editor" : "← Mis cursos"}</button>
        <p class="rotulo">Curso</p>
        <h2>${esc(c.titulo)}</h2>
        <p class="lector__progreso">${vistosCurso.size} de ${modulos.length} módulos vistos</p>
        <div class="lector__barra"><span style="width:${Math.round((vistosCurso.size / modulos.length) * 100)}%"></span></div>
        <ol>
          ${modulos.map((mod, i) => `
            <li><button type="button" data-modulo="${i}" ${i === n ? 'aria-current="step"' : ""} class="${vistosCurso.has(i) ? "visto" : ""}">
              <span>Módulo ${i + 1}</span>${esc(mod.titulo)}</button></li>`).join("")}
        </ol>
        ${completo ? `<button class="btn btn--chico lector__certificado" type="button" data-certificado>🎓 Mi certificado</button>` : ""}
      </aside>
      <article class="lector__clase clase">
        <p class="rotulo">Módulo ${n + 1} de ${modulos.length}</p>
        <h1>${esc(m.titulo)}</h1>
        ${textoAHtml(m.texto)}
        ${preguntas.length ? `
          <form class="autoeval" data-autoeval>
            <h2>Autoevaluación</h2>
            <p class="autoeval__ayuda">${resultado !== undefined
              ? `Tu último resultado: <strong>${resultado} de ${preguntas.length}</strong>. Podés volver a intentarlo.`
              : "Respondé para repasar lo que viste. No tiene nota: es para vos."}</p>
            ${preguntas.map((p, i) => `
              <fieldset class="autoeval__pregunta" data-pregunta="${i}">
                <legend>${i + 1}. ${esc(p.pregunta)}</legend>
                ${p.opciones.map((o, j) => `
                  <label class="autoeval__opcion"><input type="radio" name="p${i}" value="${j}" /> <span>${esc(o)}</span></label>`).join("")}
                <p class="autoeval__devolucion" hidden></p>
              </fieldset>`).join("")}
            <p class="acceso__error" role="alert" data-error></p>
            <button class="btn" type="submit">Comprobar respuestas</button>
            <p class="autoeval__total" role="status" hidden></p>
          </form>` : ""}
        ${ultimo ? `
          <div class="clase__fin">
            <h3>${completo ? "¡Terminaste el curso!" : "Llegaste al último módulo"}</h3>
            ${completo
              ? `<p>Felicitaciones por llegar hasta acá. Ya podés descargar tu certificado de finalización.</p>
                 <div class="clase__fin-acciones">
                   <button class="btn" type="button" data-certificado>Descargar mi certificado</button>
                   ${estado.previa ? "" : `<button class="btn btn--linea" type="button" data-opinion>Dejar mi opinión</button>`}
                 </div>`
              : `<p>Para obtener el certificado te ${faltan === 1 ? "falta ver 1 módulo" : `faltan ver ${faltan} módulos`}. Los que ya viste aparecen marcados en verde en el índice.</p>`}
          </div>` : ""}
        <nav class="lector__nav" aria-label="Cambiar de módulo">
          <button class="btn btn--linea" type="button" data-paso="-1" ${n === 0 ? "disabled" : ""}>← Anterior</button>
          ${ultimo ? "" : `<button class="btn" type="button" data-paso="1">Siguiente módulo →</button>`}
        </nav>
      </article>
    </div>`;

  app.querySelectorAll("[data-volver]").forEach((b) => b.addEventListener("click", estado.previa ? volverAlEditor : irAInicio));
  app.querySelectorAll("[data-modulo]").forEach((b) => b.addEventListener("click", () => irAModulo(Number(b.dataset.modulo))));
  app.querySelectorAll("[data-paso]").forEach((b) => b.addEventListener("click", () => irAModulo(n + Number(b.dataset.paso))));
  app.querySelectorAll("[data-certificado]").forEach((b) => b.addEventListener("click", ventanaCertificado));
  app.querySelectorAll("[data-opinion]").forEach((b) => b.addEventListener("click", ventanaOpinion));

  const form = app.querySelector("[data-autoeval]");
  if (form) form.addEventListener("submit", (e) => {
    e.preventDefault();
    const respuestas = preguntas.map((_, i) => form.querySelector(`input[name="p${i}"]:checked`));
    const error = form.querySelector("[data-error]");
    if (respuestas.some((r) => !r)) { error.textContent = "Respondé todas las preguntas antes de comprobar."; return; }
    error.textContent = "";
    let aciertos = 0;
    preguntas.forEach((p, i) => {
      const elegida = Number(respuestas[i].value);
      const bien = elegida === p.correcta;
      if (bien) aciertos++;
      const caja = form.querySelector(`[data-pregunta="${i}"]`);
      caja.classList.toggle("autoeval__pregunta--bien", bien);
      caja.classList.toggle("autoeval__pregunta--mal", !bien);
      caja.querySelectorAll(".autoeval__opcion").forEach((op, j) => op.classList.toggle("autoeval__opcion--correcta", j === p.correcta));
      const devolucion = caja.querySelector(".autoeval__devolucion");
      devolucion.hidden = false;
      const correcta = p.opciones[p.correcta].replace(/[.!?…]+$/, "");
      devolucion.innerHTML = `<strong>${bien ? "¡Bien!" : `La correcta es: ${esc(correcta)}.`}</strong> ${esc(p.explicacion)}`;
    });
    const total = form.querySelector(".autoeval__total");
    total.hidden = false;
    total.textContent = `Acertaste ${aciertos} de ${preguntas.length}.` + (aciertos === preguntas.length ? " ¡Excelente!" : " Repasá las que quedaron y probá de nuevo cuando quieras.");
    estado.progreso.evaluaciones[String(n)] = aciertos;
    guardarProgreso();
  });
}

function irAModulo(i) {
  estado.modulo = Math.min(Math.max(i, 0), estado.contenido.length - 1);
  pintarCurso();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- Opinión del alumno ---------- */

// Nombre que se muestra en la página: nombre de pila e inicial del apellido.
function nombrePublico(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "Alumna/o del campus";
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.` : partes[0];
}

async function ventanaOpinion() {
  const c = estado.cursoAbierto;
  const id = `${estado.usuario.uid}_${c.id}`;
  let previa = null;
  try {
    const snap = await getDoc(doc(db, "opiniones", id));
    if (snap.exists()) previa = snap.data();
  } catch { /* si no se puede leer, se arranca en blanco */ }
  abrirVentana(`
    <p class="rotulo">Tu opinión</p>
    <h2 id="ventana-titulo">¿Qué te pareció ${esc(c.titulo)}?</h2>
    <p>Tu comentario ayuda a Jessica a mejorar los cursos y a otras personas a decidirse.</p>
    <form data-form-opinion>
      <fieldset class="estrellas">
        <legend>Puntaje</legend>
        <div class="estrellas__fila">
          ${[5, 4, 3, 2, 1].map((n) => `
            <input type="radio" id="estrella-${n}" name="estrellas" value="${n}" ${previa && previa.estrellas === n ? "checked" : ""} />
            <label for="estrella-${n}" title="${n} de 5"><span class="sr-only">${n} de 5</span>★</label>`).join("")}
        </div>
      </fieldset>
      <label class="campo"><span>Comentario</span>
        <textarea name="comentario" rows="4" maxlength="500" placeholder="¿Qué te sirvió? ¿Qué cambiarías?">${esc(previa ? previa.comentario : "")}</textarea></label>
      <label class="opinion__permiso"><input type="checkbox" name="autoriza" ${previa && previa.autoriza ? "checked" : ""} />
        <span>Acepto que se muestre en la página de Jessica como <strong>${esc(nombrePublico(estado.usuario.displayName))}</strong>.</span></label>
      <p class="acceso__error" role="alert" data-error></p>
      <div class="programa__pie"><button class="btn" type="submit">${previa ? "Actualizar mi opinión" : "Enviar opinión"}</button></div>
    </form>`);
  const form = ventanaContenido.querySelector("[data-form-opinion]");
  form.addEventListener("change", () => { form.querySelector("[data-error]").textContent = ""; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = new FormData(form);
    const estrellas = Number(datos.get("estrellas"));
    const comentario = String(datos.get("comentario") || "").trim();
    const error = form.querySelector("[data-error]");
    if (!estrellas) { error.textContent = "Elegí un puntaje de 1 a 5 estrellas."; return; }
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      await setDoc(doc(db, "opiniones", id), {
        uid: estado.usuario.uid,
        curso: c.id,
        nombre: nombrePublico(estado.usuario.displayName),
        estrellas,
        comentario,
        autoriza: datos.get("autoriza") === "on",
        publicada: false,
        actualizada: serverTimestamp(),
      });
      cerrarVentana();
      mostrarAviso("¡Gracias por tu opinión!");
    } catch {
      boton.disabled = false;
      error.textContent = "No pudimos guardar tu opinión. Probá de nuevo.";
    }
  });
}

function volverAlEditor() {
  estado.panelPestana = "clases";
  abrirPanel();
}

/* ---------- Certificado ---------- */

// Deja registrado el certificado (nombre, curso y fecha) para que se pueda verificar con el código en verificar.html.
// Si ya estaba registrado se usa ese, así la fecha de emisión es siempre la misma.
async function registrarCertificado(inscripcion) {
  const ref = doc(db, "certificados", inscripcion.codigo);
  const existente = await getDoc(ref);
  if (existente.exists()) return existente.data();
  try {
    await setDoc(ref, { nombre: inscripcion.nombre, curso: inscripcion.curso, emitida: serverTimestamp() });
  } catch (error) {
    const otra = await getDoc(ref); // por ejemplo, si se hizo clic dos veces seguidas
    if (otra.exists()) return otra.data();
    throw error;
  }
  return (await getDoc(ref)).data();
}

async function ventanaCertificado() {
  const c = estado.cursoAbierto;
  if (!cursoCompleto() && !estado.previa) return;
  const inscripcion = estado.inscripciones.find((i) => i.curso === c.id);
  // El nombre sale siempre de la inscripción, que la alumna no puede modificar (solo Jessica, desde el panel).
  // Así nadie puede emitirse un certificado a nombre de otra persona.
  const nombre = inscripcion ? inscripcion.nombre : "Nombre de la alumna";
  const codigo = inscripcion ? inscripcion.codigo : "";
  const mensaje = `Hola Jessica, quiero corregir mi nombre para el certificado del curso ${c.titulo}.${codigo ? ` Mi código es ${codigo}.` : ""}`;
  const encabezado = `
    <p class="rotulo">Certificado de finalización</p>
    <h2 id="ventana-titulo">${esc(c.titulo)}</h2>`;
  let fecha = new Date();
  if (inscripcion && !estado.previa) {
    abrirVentana(`${encabezado}<p>Preparando tu certificado…</p>`);
    try {
      fecha = (await registrarCertificado(inscripcion)).emitida.toDate();
    } catch {
      abrirVentana(`${encabezado}<p>No pudimos registrar tu certificado. Revisá tu conexión y volvé a intentarlo en un rato. Si sigue fallando, escribile a Jessica.</p>`);
      return;
    }
  }
  abrirVentana(`${encabezado}
    <p>El certificado se emite a nombre de <strong>${esc(nombre)}</strong>, tal como figura en tu inscripción.
      ¿Hay un error de escritura? <a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">Escribile a Jessica</a>
      y lo corrige. Después podés imprimirlo o guardarlo como PDF.</p>
    <div class="certificado-vista" data-vista></div>
    <div class="programa__pie"><button class="btn" type="button" data-imprimir>Imprimir o guardar en PDF</button></div>`);
  ventanaContenido.querySelector("[data-vista]").innerHTML = certificadoHtml(nombre, c, codigo, fecha);
  ventanaContenido.querySelector("[data-imprimir]").addEventListener("click", () => {
    let hoja = document.getElementById("impresion");
    if (!hoja) {
      hoja = document.createElement("div");
      hoja.id = "impresion";
      document.body.appendChild(hoja);
    }
    hoja.innerHTML = certificadoHtml(nombre, c, codigo, fecha);
    const titulo = document.title;
    document.title = `Certificado - ${c.titulo} - ${nombre}`;
    window.print();
    document.title = titulo;
  });
}

function certificadoHtml(nombre, curso, codigo, fecha) {
  const hoy = fecha.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  const enlace = new URL("verificar.html", location.href);
  return `
    <div class="certificado">
      <div class="certificado__borde">
        <img class="certificado__logo" src="assets/logo.png" alt="" width="110" height="110" />
        <p class="certificado__rotulo">Certificado de finalización</p>
        <p class="certificado__texto">Se certifica que</p>
        <p class="certificado__nombre">${esc(nombre)}</p>
        <p class="certificado__texto">completó el curso online</p>
        <p class="certificado__curso">${esc(curso.titulo)}</p>
        <p class="certificado__detalle">${curso.modulos.length} módulos · ${curso.semanas} semanas de cursada</p>
        <div class="certificado__pie">
          <div><span class="certificado__linea"></span>Jessica M. Benitez<br />Psicopedagoga · M.P. 1007</div>
          <div>Posadas, Misiones<br />${esc(hoy)}</div>
        </div>
        ${codigo ? `<p class="certificado__codigo">Código de verificación: ${esc(codigo)} · Verificalo en ${esc(enlace.host + enlace.pathname)}</p>` : ""}
      </div>
    </div>`;
}

/* ---------- Panel de Jessica ---------- */

// Jessica escucha todas las inscripciones y opiniones desde que entra: así le llegan las notificaciones.
function escucharAdmin() {
  if (!cortarPanel) {
    const q = query(collection(db, "inscripciones"), orderBy("actualizada", "desc"));
    cortarPanel = onSnapshot(q, (snap) => {
      estado.todas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cargado.admin = true;
      if (estado.vista === "panel" && estado.panelPestana === "solicitudes") {
        if (document.activeElement && document.activeElement.matches("[data-buscar]")) pintarListaPanel();
        else pintarPanel();
      }
      actualizarNotificaciones();
    }, () => { if (estado.vista === "panel") app.innerHTML = `<p class="campus__aviso">No tenés permiso para ver el panel.</p>`; });
  }
  if (!cortarOpiniones) {
    cortarOpiniones = onSnapshot(collection(db, "opiniones"), (snap) => {
      estado.opiniones = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.actualizada?.seconds || 0) - (a.actualizada?.seconds || 0));
      if (estado.vista === "panel" && estado.panelPestana === "opiniones") pintarPanel();
      actualizarNotificaciones();
    }, () => {});
  }
}

function abrirPanel() {
  if (!estado.admin) return;
  cerrarVentana();
  estado.vista = "panel";
  estado.previa = false;
  pintarBarra();
  escucharAdmin();
  pintarPanel();
}

function pintarPanel() {
  const pestanas = `
    <div class="panel__pestanas" role="tablist">
      <button type="button" role="tab" data-pestana="solicitudes" aria-selected="${estado.panelPestana === "solicitudes"}">Inscripciones y pagos</button>
      <button type="button" role="tab" data-pestana="clases" aria-selected="${estado.panelPestana === "clases"}">Clases de los cursos</button>
      <button type="button" role="tab" data-pestana="opiniones" aria-selected="${estado.panelPestana === "opiniones"}">Opiniones</button>
    </div>`;
  const conectarPestanas = () => app.querySelectorAll("[data-pestana]").forEach((b) => b.addEventListener("click", () => {
    estado.panelPestana = b.dataset.pestana;
    pintarPanel();
  }));
  if (estado.panelPestana === "clases") { pintarEditor(pestanas); return; }
  if (estado.panelPestana === "opiniones") { pintarOpiniones(pestanas, conectarPestanas); return; }

  const cuenta = (e) => estado.todas.filter((i) => i.estado === e).length;
  const filtros = [
    ["pendiente_aprobacion", "Por revisar"], ["pendiente_pago", "Esperando pago"],
    ["aprobada", "Aprobadas"], ["rechazada", "Rechazadas"], ["todas", "Todas"],
  ];

  app.innerHTML = `
    <section class="campus__bienvenida">
      <p class="rotulo">Panel de Jessica</p>
      <h1>Inscripciones</h1>
      <p>${cuenta("pendiente_aprobacion") ? `Tenés <strong>${cuenta("pendiente_aprobacion")}</strong> comprobante${cuenta("pendiente_aprobacion") === 1 ? "" : "s"} para revisar.` : "No hay comprobantes para revisar."}</p>
    </section>
    ${pestanas}
    <div class="panel__herramientas">
      <label class="panel__buscar"><span class="sr-only">Buscar</span>
        <input type="search" data-buscar placeholder="Buscar por nombre, mail o código" value="${esc(estado.busqueda)}" /></label>
      <button class="btn btn--chico btn--linea" type="button" data-exportar>Descargar para Excel</button>
    </div>
    <div class="panel__filtros">
      ${filtros.map(([v, t]) => `<button type="button" data-filtro="${v}" aria-pressed="${estado.filtro === v}">${t}${v !== "todas" ? ` <span>${cuenta(v)}</span>` : ""}</button>`).join("")}
    </div>
    <div class="panel__lista" id="panel-lista"></div>`;

  conectarPestanas();
  app.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { estado.filtro = b.dataset.filtro; pintarPanel(); }));
  app.querySelector("[data-buscar]").addEventListener("input", (e) => { estado.busqueda = e.target.value; pintarListaPanel(); });
  app.querySelector("[data-exportar]").addEventListener("click", exportarInscripciones);
  pintarListaPanel();
}

let cortarOpiniones = null;

function pintarOpiniones(pestanas, conectarPestanas) {
  const estrellas = (n) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
  const publicadas = estado.opiniones.filter((o) => o.publicada).length;
  app.innerHTML = `
    <section class="campus__bienvenida">
      <p class="rotulo">Panel de Jessica</p>
      <h1>Opiniones</h1>
      <p>Las que publiques aparecen en la página principal. Solo se pueden publicar las de quienes dieron permiso. Publicadas: <strong>${publicadas}</strong>.</p>
    </section>
    ${pestanas}
    <div class="panel__lista">
      ${estado.opiniones.length ? estado.opiniones.map((o) => {
        const c = cursoPorId(o.curso);
        return `
        <article class="opinion-panel">
          <div>
            <p class="opinion-panel__estrellas" aria-label="${o.estrellas} de 5">${estrellas(o.estrellas)}</p>
            <p class="opinion-panel__texto">${o.comentario ? esc(o.comentario) : "<em>Sin comentario</em>"}</p>
            <p class="opinion-panel__autor">${esc(o.nombre)} · ${esc(c ? c.titulo : o.curso)} · ${esc(fecha(o.actualizada))}</p>
            <p class="opinion-panel__permiso">${o.autoriza ? "Dio permiso para mostrarla" : "No dio permiso para mostrarla"}</p>
          </div>
          <div class="solicitud__acciones">
            ${o.publicada
              ? `<span class="estado estado--aprobada">En la página</span><button class="btn btn--chico btn--linea" type="button" data-publicar="${esc(o.id)}" data-valor="no">Quitar de la página</button>`
              : o.autoriza ? `<button class="btn btn--chico" type="button" data-publicar="${esc(o.id)}" data-valor="si">Publicar</button>` : ""}
          </div>
        </article>`;
      }).join("") : `<p class="campus__aviso">Todavía no hay opiniones. Aparecen cuando alguien termina un curso y la deja.</p>`}
    </div>`;
  conectarPestanas();
  app.querySelectorAll("[data-publicar]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await updateDoc(doc(db, "opiniones", b.dataset.publicar), { publicada: b.dataset.valor === "si" });
      mostrarAviso(b.dataset.valor === "si" ? "Opinión publicada en la página." : "Opinión quitada de la página.");
    } catch { b.disabled = false; mostrarAviso("No se pudo cambiar. Probá de nuevo."); }
  }));
}

function listaFiltrada() {
  const texto = estado.busqueda.trim().toLowerCase();
  return estado.todas
    .filter((i) => estado.filtro === "todas" || i.estado === estado.filtro)
    .filter((i) => !texto || [i.nombre, i.email, i.codigo].some((v) => String(v || "").toLowerCase().includes(texto)));
}

function pintarListaPanel() {
  const contenedor = document.getElementById("panel-lista");
  if (!contenedor) return;
  const lista = listaFiltrada();
  contenedor.innerHTML = lista.length ? lista.map((i) => {
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
        ${i.estado === "aprobada" ? `<p class="solicitud__avance">${textoAvance(i)}</p>` : ""}
      </div>
      ${tieneImagen ? `<button class="solicitud__comprobante" type="button" data-ver="${esc(i.id)}"><img src="${i.comprobante}" alt="Comprobante de ${esc(i.nombre)}" /></button>`
        : `<p class="solicitud__sin">Sin comprobante</p>`}
      <div class="solicitud__acciones">
        ${i.estado !== "aprobada" ? `<button class="btn btn--chico" type="button" data-aprobar="${esc(i.id)}">Aprobar</button>` : ""}
        ${i.estado !== "rechazada" && i.estado !== "aprobada" ? `<button class="btn btn--chico btn--linea" type="button" data-rechazar="${esc(i.id)}">Rechazar</button>` : ""}
        <button class="btn btn--chico btn--linea" type="button" data-nombre="${esc(i.id)}">Corregir nombre</button>
      </div>
    </article>`;
  }).join("") : `<p class="campus__aviso">${estado.busqueda.trim() ? "No hay resultados para esa búsqueda." : "No hay inscripciones en esta lista."}</p>`;

  contenedor.querySelectorAll("[data-ver]").forEach((b) => b.addEventListener("click", () => {
    const i = estado.todas.find((x) => x.id === b.dataset.ver);
    abrirVentana(`<p class="rotulo">Comprobante</p><h2 id="ventana-titulo">${esc(i.nombre)} · ${esc(i.codigo)}</h2><img class="comprobante-grande" src="${i.comprobante}" alt="Comprobante" />`);
  }));
  contenedor.querySelectorAll("[data-aprobar]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await updateDoc(doc(db, "inscripciones", b.dataset.aprobar), { estado: "aprobada", nota: "", actualizada: serverTimestamp() });
      mostrarAviso("Inscripción aprobada: ya puede cursar.");
    } catch { b.disabled = false; mostrarAviso("No se pudo aprobar. Probá de nuevo."); }
  }));
  contenedor.querySelectorAll("[data-rechazar]").forEach((b) => b.addEventListener("click", () => ventanaRechazo(b.dataset.rechazar)));
  contenedor.querySelectorAll("[data-nombre]").forEach((b) => b.addEventListener("click", () => ventanaNombre(b.dataset.nombre)));
  cargarProgresos(lista.filter((i) => i.estado === "aprobada"));
}

/* Avance de cada alumno aprobado (se lee una vez y queda guardado mientras el panel está abierto). */
const progresos = {};

function textoAvance(i) {
  const p = progresos[i.id];
  if (p === undefined) return "Cargando avance…";
  const c = cursoPorId(i.curso);
  const total = c ? c.modulos.length : 0;
  if (!p) return "Todavía no empezó el curso.";
  const vistos = (p.vistos || []).length;
  const evaluaciones = Object.values(p.evaluaciones || {});
  const aciertos = evaluaciones.reduce((a, b) => a + Number(b || 0), 0);
  return `${vistos >= total ? "✓ Terminó el curso" : `Avance: ${vistos} de ${total} módulos`}`
    + (evaluaciones.length
      ? ` · Autoevaluación: ${evaluaciones.length} ${evaluaciones.length === 1 ? "módulo" : "módulos"}, ${aciertos} ${aciertos === 1 ? "respuesta correcta" : "respuestas correctas"}`
      : "");
}

async function cargarProgresos(aprobadas) {
  const faltan = aprobadas.filter((i) => progresos[i.id] === undefined);
  if (!faltan.length) return;
  await Promise.all(faltan.map(async (i) => {
    try {
      const snap = await getDoc(doc(db, "progreso", i.uid, "cursos", i.curso));
      progresos[i.id] = snap.exists() ? snap.data() : null;
    } catch { progresos[i.id] = null; }
  }));
  pintarListaPanel();
}

// Planilla para Excel: separada por punto y coma y con BOM para que respete los acentos.
function exportarInscripciones() {
  const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = [["Fecha", "Nombre", "Mail", "Curso", "Precio", "Código", "Estado", "Nota"]];
  listaFiltrada().forEach((i) => {
    const c = cursoPorId(i.curso);
    const f = i.actualizada && i.actualizada.toDate
      ? i.actualizada.toDate().toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      : "";
    filas.push([f, i.nombre, i.email, c ? c.titulo : i.curso, c ? c.precio : "", i.codigo, (ESTADOS[i.estado] || {}).texto || i.estado, i.nota || ""]);
  });
  const csv = "﻿" + filas.map((fila) => fila.map(celda).join(";")).join("\r\n");
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  enlace.download = `inscripciones-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

// El nombre de la inscripción es el que se imprime en el certificado. Solo Jessica puede corregirlo.
function ventanaNombre(id) {
  const i = estado.todas.find((x) => x.id === id);
  abrirVentana(`
    <p class="rotulo">Corregir nombre</p>
    <h2 id="ventana-titulo">${esc(i.nombre)}</h2>
    <p>Este es el nombre que va a aparecer en el certificado de ${esc(i.email)}. Revisalo con el comprobante y el mail antes de cambiarlo.</p>
    <label class="campo"><span>Nombre y apellido</span>
      <input data-nuevo-nombre maxlength="100" value="${esc(i.nombre)}" /></label>
    <div class="programa__pie"><button class="btn" type="button" data-confirmar>Guardar nombre</button></div>`);
  const input = ventanaContenido.querySelector("[data-nuevo-nombre]");
  input.focus();
  ventanaContenido.querySelector("[data-confirmar]").addEventListener("click", async (e) => {
    const nombre = input.value.trim().replace(/\s+/g, " ");
    if (!nombre) { input.focus(); return; }
    e.target.disabled = true;
    try {
      // No se toca "actualizada": así la alumna no recibe un aviso nuevo por este cambio.
      await updateDoc(doc(db, "inscripciones", id), { nombre });
      // Si el certificado ya se había emitido, se corrige también el registro que usa la verificación.
      let avisoFinal = "Nombre actualizado.";
      try {
        const registro = doc(db, "certificados", i.codigo);
        if ((await getDoc(registro)).exists()) await updateDoc(registro, { nombre });
      } catch { avisoFinal = "Nombre actualizado, pero no se pudo corregir el certificado ya emitido. Probá de nuevo."; }
      cerrarVentana();
      mostrarAviso(avisoFinal);
    } catch { e.target.disabled = false; mostrarAviso("No se pudo guardar. Probá de nuevo."); }
  });
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
        : c.modulos.map((m) => ({ titulo: m.titulo, texto: "", autoevaluacion: "" }));
    } catch {
      app.innerHTML = `${pestanas}<p class="campus__aviso">No se pudieron cargar las clases.</p>`;
      return;
    }
  }

  app.innerHTML = `
    <section class="campus__bienvenida">
      <p class="rotulo">Panel de Jessica</p>
      <h1>Clases de los cursos</h1>
      <p>Lo que escribas acá es lo que ven los alumnos aprobados. Separá los párrafos con una línea en blanco; usá <code>## </code> para un subtítulo, <code>- </code> para una lista, <code>&gt; </code> para un recuadro y <code>**así**</code> para negrita. En la autoevaluación, cada pregunta empieza con <code>? </code>, las opciones con <code>- </code> (la correcta con <code>* </code>) y la explicación con <code>= </code>.</p>
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
          <label class="campo"><span>Autoevaluación (opcional)</span><textarea data-autoeval="${i}" rows="6" placeholder="? ¿Pregunta?&#10;- Opción incorrecta&#10;* Opción correcta&#10;= Explicación">${esc(m.autoevaluacion || "")}</textarea></label>
          <button class="editor__quitar" type="button" data-quitar="${i}">Quitar este módulo</button>
        </fieldset>`).join("")}
    </div>
    <div class="editor__acciones">
      <button class="btn btn--linea" type="button" data-agregar>+ Agregar módulo</button>
      <div class="editor__guardar">
        <button class="btn btn--linea" type="button" data-previa>Ver como alumno</button>
        <button class="btn" type="button" data-guardar>Guardar cambios</button>
      </div>
    </div>`;

  const leerFormulario = () => {
    editor.modulos = editor.modulos.map((m, i) => ({
      titulo: app.querySelector(`[data-titulo="${i}"]`).value.trim(),
      texto: app.querySelector(`[data-texto="${i}"]`).value,
      autoevaluacion: app.querySelector(`[data-autoeval="${i}"]`).value,
    }));
  };
  app.querySelectorAll("[data-pestana]").forEach((b) => b.addEventListener("click", () => { estado.panelPestana = b.dataset.pestana; pintarPanel(); }));
  app.querySelector("[data-curso]").addEventListener("change", (e) => {
    editor = { curso: e.target.value, modulos: null };
    pintarPanel();
  });
  app.querySelector("[data-agregar]").addEventListener("click", () => {
    leerFormulario();
    editor.modulos.push({ titulo: "", texto: "", autoevaluacion: "" });
    pintarPanel();
  });
  app.querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("¿Quitar este módulo? Se borra cuando guardes.")) return;
    leerFormulario();
    editor.modulos.splice(Number(b.dataset.quitar), 1);
    pintarPanel();
  }));
  app.querySelector("[data-previa]").addEventListener("click", () => {
    leerFormulario();
    const modulos = editor.modulos.filter((m) => m.titulo || m.texto);
    if (!modulos.length) { mostrarAviso("Este curso todavía no tiene clases para mostrar."); return; }
    estado.previa = true;
    estado.vista = "curso";
    estado.cursoAbierto = cursoPorId(editor.curso);
    estado.contenido = modulos;
    estado.progreso = { vistos: new Set(), modulo: 0, evaluaciones: {} };
    estado.modulo = 0;
    pintarBarra();
    pintarCurso();
    window.scrollTo(0, 0);
  });
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
        modulos: datos[id].modulos.map((m) => ({ titulo: String(m.titulo || ""), texto: String(m.texto || ""), autoevaluacion: String(m.autoevaluacion || "") })),
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
