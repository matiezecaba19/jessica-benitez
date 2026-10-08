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
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, collection,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const { CURSOS, ALIAS, WHATSAPP, duracion } = window.DATOS_CURSOS;
// Solo cambia lo que se muestra; quién es administrador lo deciden las reglas.
const ADMINS = ["psp.jessicabenitez@gmail.com", "matiezecaba19@gmail.com"];

// Trabajo final: el PDF se guarda partido en trozos de texto dentro de Firestore (así no hace falta Firebase Storage).
// Estos límites tienen que coincidir con firestore.rules: hasta 6 partes de 700.000 caracteres.
const MAX_PDF = 3000000;       // bytes
const TAMANO_PARTE = 700000;   // caracteres de base64 por parte

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
  misEntregas: [],           // trabajos finales de la persona que entró
  entregas: [],              // todos los trabajos finales (solo Jessica)
  filtroTrabajos: "entregada",
  previa: false,             // Jessica viendo un curso "como alumno"
  leidasHasta: 0,            // segundos: hasta cuándo leyó las notificaciones
  notifAbiertas: false,
  resaltadas: new Set(),
  cursoPendiente: params.get("curso"),
};
let cortarInscripciones = null;
let cortarPanel = null;
let cortarMisEntregas = null;
let cortarEntregas = null;

onAuthStateChanged(auth, (usuario) => {
  estado.usuario = usuario;
  estado.admin = !!(usuario && usuario.emailVerified && ADMINS.includes((usuario.email || "").toLowerCase()));
  if (cortarInscripciones) { cortarInscripciones(); cortarInscripciones = null; }
  if (cortarPanel) { cortarPanel(); cortarPanel = null; }
  if (cortarOpiniones) { cortarOpiniones(); cortarOpiniones = null; }
  if (cortarLeidas) { cortarLeidas(); cortarLeidas = null; }
  if (cortarMisEntregas) { cortarMisEntregas(); cortarMisEntregas = null; }
  if (cortarEntregas) { cortarEntregas(); cortarEntregas = null; }
  estado.inscripciones = [];
  estado.todas = [];
  estado.opiniones = [];
  estado.misEntregas = [];
  estado.entregas = [];
  estado.vista = "inicio";
  estado.previa = false;
  estado.notifAbiertas = false;
  avisadas = null;
  cargado = { leidas: false, inscripciones: false, admin: !estado.admin, entregas: false, adminEntregas: !estado.admin };
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
  // Los trabajos finales de esta persona: para mostrar su estado y avisarle cuando Jessica los corrige.
  cortarMisEntregas = onSnapshot(query(collection(db, "entregas"), where("uid", "==", usuario.uid)), (snap) => {
    const antes = entregaActual() ? entregaActual().estado : null;
    estado.misEntregas = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    cargado.entregas = true;
    actualizarNotificaciones();
    alCambiarEntrega(antes);
  }, () => { cargado.entregas = true; });
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
  for (const t of estado.misEntregas) {
    if (!["aprobada", "desaprobada", "devuelta"].includes(t.estado) || !t.calificada) continue;
    lista.push({
      id: `trabajo-${t.id}`, fecha: t.calificada, tipo: t.estado === "aprobada" ? "aprobada" : "rechazada",
      texto: t.estado === "aprobada"
        ? `Jessica aprobó tu trabajo final de ${titulo(t.curso)}. Nota: ${t.nota}.`
        : t.estado === "devuelta"
          ? `Jessica te pidió correcciones en tu trabajo final de ${titulo(t.curso)}.`
          : `Tu trabajo final de ${titulo(t.curso)} quedó desaprobado. Nota: ${t.nota}.`,
      accion: () => abrirCurso(t.curso),
    });
  }
  if (estado.admin) {
    for (const t of estado.entregas.filter((x) => x.estado === "entregada")) {
      lista.push({
        id: `entrega-${t.id}`, fecha: t.enviada, tipo: "entrega",
        texto: `${t.nombre} entregó el trabajo final de ${titulo(t.curso)}.`,
        accion: () => { estado.panelPestana = "trabajos"; estado.filtroTrabajos = "entregada"; abrirPanel(); },
      });
    }
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
  if (cargado.leidas && cargado.inscripciones && cargado.admin && cargado.entregas && cargado.adminEntregas) {
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
  const iconos = { aprobada: "✓", rechazada: "!", comprobante: "$", opinion: "★", entrega: "▤" };
  panel.innerHTML = `
    <p class="notif__titulo">Notificaciones</p>
    ${lista.length ? `<ul>${lista.map((n) => `
      <li><button type="button" class="notif__item notif__item--${n.tipo} ${estado.resaltadas.has(n.id) ? "notif__item--nueva" : ""}" data-notif-item="${esc(n.id)}">
        <span class="notif__icono" aria-hidden="true">${iconos[n.tipo]}</span>
        <span><span class="notif__texto">${esc(n.texto)}</span><span class="notif__fecha">${esc(fecha(n.fecha))}</span></span>
      </button></li>`).join("")}</ul>`
      : `<p class="notif__vacio">No tenés notificaciones. Acá te vamos a avisar ${estado.admin ? "cuando alguien suba un comprobante, entregue un trabajo o deje una opinión" : "cuando Jessica revise tu pago o corrija tu trabajo final"}.</p>`}`;
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
  const otros = CURSOS.filter((c) => !c.retirado && !tomados.has(c.id));
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
              <p class="campus__detalle">${esc(duracion(c))} · <strong>${c.proximamente ? "Próximamente" : esc(c.precio)}</strong></p>
              ${c.proximamente
                ? `<a class="btn btn--chico btn--linea" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola Jessica, quiero consultarte por el curso ${c.titulo}.`)}" target="_blank" rel="noopener">Consultar</a>`
                : `<button class="btn btn--chico" type="button" data-inscribir="${c.id}">Inscribirme</button>`}
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
  if (c.proximamente) { mostrarAviso("La inscripción a este curso todavía no está abierta."); return; }
  if (c.retirado) { mostrarAviso("Este curso ya no se ofrece. Mirá los cursos disponibles en el campus."); return; }
  abrirVentana(`
    <img class="programa__ilustracion" src="assets/ilustraciones/cursos/${c.id}.svg" alt="" width="400" height="200" />
    <p class="rotulo">Inscripción</p>
    <h2 id="ventana-titulo">${esc(c.titulo)}</h2>
    <p class="programa__resumen">${esc(c.resumen)}</p>
    <dl class="programa__datos">
      <div><dt>Valor</dt><dd>${esc(c.precio)}</dd></div>
      <div><dt>Duración</dt><dd>${esc(duracion(c))}</dd></div>
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
  const vistosTodos = cursoCompleto();
  const completo = vistosTodos && trabajoFinalOk();   // en los cursos con trabajo final, también tiene que estar aprobado
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
          ${c.trabajoFinal ? `
            <li><button type="button" data-ir-trabajo class="${entregaActual() && entregaActual().estado === "aprobada" ? "visto" : ""}">
              <span>Trabajo final</span>${esc(textoEstadoTrabajo())}</button></li>` : ""}
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
        ${ultimo && c.trabajoFinal ? htmlTrabajoFinal() : ""}
        ${ultimo ? `
          <div class="clase__fin">
            <h3>${completo ? "¡Terminaste el curso!" : vistosTodos ? "Ya viste todos los módulos" : "Llegaste al último módulo"}</h3>
            ${completo
              ? `<p>Felicitaciones por llegar hasta acá. Ya podés descargar tu certificado de finalización.</p>
                 <div class="clase__fin-acciones">
                   <button class="btn" type="button" data-certificado>Descargar mi certificado</button>
                   ${estado.previa ? "" : `<button class="btn btn--linea" type="button" data-opinion>Dejar mi opinión</button>`}
                 </div>`
              : vistosTodos
                ? `<p>Para obtener el certificado falta que tu trabajo final esté aprobado. Estado: ${esc(textoEstadoTrabajo().toLowerCase())}.</p>`
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
  app.querySelectorAll("[data-ir-trabajo]").forEach((b) => b.addEventListener("click", irAlTrabajoFinal));
  conectarTrabajo();

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

/* ---------- Trabajo final ---------- */

// La entrega de la persona en el curso que tiene abierto.
function entregaActual() {
  const c = estado.cursoAbierto;
  return (c && estado.misEntregas.find((t) => t.curso === c.id)) || null;
}

// En los cursos con trabajo final, el certificado exige que esté aprobado (las reglas lo controlan también).
function trabajoFinalOk() {
  const c = estado.cursoAbierto;
  if (!c || !c.trabajoFinal || estado.previa) return true;
  const e = entregaActual();
  return !!e && e.estado === "aprobada";
}

function textoEstadoTrabajo() {
  const e = entregaActual();
  if (!e) return "Sin entregar";
  switch (e.estado) {
    case "entregada": return "Entregado, en revisión";
    case "devuelta": return "Con correcciones";
    case "aprobada": return `Aprobado · nota ${e.nota}`;
    case "desaprobada": return `Desaprobado · nota ${e.nota}`;
    default: return "";
  }
}

// En megas decimales, como los muestra Windows al elegir un archivo: «3 MB», «2,95 MB», «3,3 MB».
function formatoTamano(bytes) {
  if (bytes < 1000000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1000000).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} MB`;
}

function htmlTrabajoFinal() {
  const c = estado.cursoAbierto;
  const e = entregaActual();
  let cuerpo;
  if (estado.previa) {
    cuerpo = `<p>Acá cada alumna entrega su trabajo final en PDF y después ve la nota y la devolución de Jessica. En la vista previa no se puede entregar.</p>`;
  } else {
    const devolucion = e && e.devolucion ? `<p class="trabajo__devolucion"><strong>Devolución de Jessica:</strong> ${esc(e.devolucion)}</p>` : "";
    const descargar = e ? `<button class="btn btn--chico btn--linea" type="button" data-descargar-entrega>Descargar mi entrega</button>` : "";
    const formulario = (texto) => `
      <p>${texto}</p>
      <form class="trabajo__form" data-trabajo-form>
        <label class="campo"><span>Tu trabajo en PDF (hasta ${formatoTamano(MAX_PDF)})</span>
          <input type="file" accept="application/pdf,.pdf" data-trabajo-archivo /></label>
        <p class="acceso__error" role="alert" data-trabajo-error></p>
        <button class="btn" type="submit">Entregar trabajo</button>
      </form>`;
    if (!e && !cursoCompleto()) {
      cuerpo = `<p>Vas a poder entregar tu trabajo final cuando hayas visto todos los módulos. Seguí la consigna que está más arriba, en este módulo, y entregalo en un único archivo PDF.</p>`;
    } else if (!e) {
      cuerpo = formulario("Seguí la consigna de este módulo y entregalo en un único archivo PDF. Jessica lo corrige y acá mismo vas a ver la nota y su devolución.");
    } else if (e.estado === "devuelta") {
      cuerpo = `<p><span class="trabajo__estado trabajo__estado--aviso">Con correcciones</span></p>${devolucion}`
        + formulario(`Corregí tu trabajo y entregá la nueva versión (intento ${(e.intentos || 1) + 1}).`);
    } else if (e.estado === "entregada") {
      cuerpo = `<p><span class="trabajo__estado trabajo__estado--revision">Entregado, en revisión</span></p>
        <p>Entregaste <strong>${esc(e.archivo)}</strong> (${formatoTamano(e.tamano)}) el ${esc(fecha(e.enviada))}. Jessica lo va a corregir y vas a ver acá la nota y su devolución.</p>${descargar}`;
    } else if (e.estado === "aprobada") {
      cuerpo = `<p><span class="trabajo__estado trabajo__estado--ok">Aprobado · Nota ${esc(e.nota)} sobre 10</span></p>${devolucion}${descargar}`;
    } else {
      const aviso = `Hola Jessica, quiero consultarte por la corrección de mi trabajo final del curso ${c.titulo}.`;
      cuerpo = `<p><span class="trabajo__estado trabajo__estado--no">Desaprobado · Nota ${esc(e.nota)} sobre 10</span></p>${devolucion}
        <p>Si querés conversar la corrección o ver cómo seguir, <a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(aviso)}" target="_blank" rel="noopener">escribile a Jessica</a>.</p>${descargar}`;
    }
  }
  return `<section class="trabajo" id="trabajo-final"><h2>Trabajo final integrador</h2>${cuerpo}</section>`;
}

function conectarTrabajo() {
  const form = app.querySelector("[data-trabajo-form]");
  if (form) form.addEventListener("submit", enviarTrabajo);
  app.querySelectorAll("[data-descargar-entrega]").forEach((b) => b.addEventListener("click", () => descargarEntrega(entregaActual(), b)));
}

function irAlTrabajoFinal() {
  const ultimo = estado.contenido.length - 1;
  if (estado.modulo !== ultimo) {
    estado.modulo = ultimo;
    pintarCurso();
  }
  setTimeout(() => {
    const seccion = document.getElementById("trabajo-final");
    if (seccion) seccion.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);
}

// Si Jessica corrige mientras la alumna está leyendo, se actualiza lo que ve (sin perder el lugar de la página).
function alCambiarEntrega(antes) {
  const c = estado.cursoAbierto;
  if (estado.vista !== "curso" || estado.previa || !c || !c.trabajoFinal) return;
  const ahora = entregaActual() ? entregaActual().estado : null;
  if (ahora === antes) return;
  const y = window.scrollY;
  pintarCurso();
  window.scrollTo(0, y);
}

function bytesABase64(bytes) {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

function base64ABytes(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function enviarTrabajo(evento) {
  evento.preventDefault();
  const form = evento.target;
  const error = form.querySelector("[data-trabajo-error]");
  const boton = form.querySelector("button[type=submit]");
  const archivo = form.querySelector("[data-trabajo-archivo]").files[0];
  error.textContent = "";
  if (!archivo) { error.textContent = "Elegí el archivo PDF de tu trabajo."; return; }
  if (!/\.pdf$/i.test(archivo.name)) { error.textContent = "El archivo tiene que ser un PDF (termina en .pdf)."; return; }
  if (archivo.size > MAX_PDF) {
    error.textContent = `Tu PDF pesa ${formatoTamano(archivo.size)} y el máximo es ${formatoTamano(MAX_PDF)}. Probá guardarlo como «PDF optimizado» o reducir el tamaño de las imágenes.`;
    return;
  }
  const c = estado.cursoAbierto;
  const inscripcion = estado.inscripciones.find((i) => i.curso === c.id && i.estado === "aprobada");
  if (!inscripcion) { error.textContent = "No encontramos tu inscripción aprobada a este curso."; return; }

  boton.disabled = true;
  boton.textContent = "Entregando…";
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    // Todo PDF empieza con «%PDF-»: así se detecta un archivo con otra extensión.
    if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
      error.textContent = "El archivo no parece un PDF válido. Volvé a exportarlo desde tu procesador de texto con «Guardar como PDF».";
      boton.disabled = false;
      boton.textContent = "Entregar trabajo";
      return;
    }
    const base64 = bytesABase64(bytes);
    const partes = [];
    for (let i = 0; i < base64.length; i += TAMANO_PARTE) partes.push(base64.slice(i, i + TAMANO_PARTE));

    const id = `${estado.usuario.uid}_${c.id}`;
    const previa = entregaActual();
    const ref = doc(db, "entregas", id);
    const datos = {
      archivo: archivo.name.slice(0, 150),
      tamano: archivo.size,
      partes: partes.length,
      estado: "entregada",
      enviada: serverTimestamp(),
      intentos: previa ? (previa.intentos || 1) + 1 : 1,
    };
    // Un solo lote: o se guarda todo (el documento y todas las partes) o no se guarda nada.
    const lote = writeBatch(db);
    if (previa) lote.update(ref, datos);
    else lote.set(ref, { uid: estado.usuario.uid, curso: c.id, nombre: inscripcion.nombre, ...datos });
    partes.forEach((parte, i) => lote.set(doc(db, "entregas", id, "partes", String(i)), { datos: parte }));
    await lote.commit();
    mostrarAviso("Entregaste tu trabajo final. Jessica lo va a corregir.");
  } catch {
    boton.disabled = false;
    boton.textContent = "Entregar trabajo";
    error.textContent = "No pudimos entregar el trabajo. Revisá tu conexión e intentá de nuevo.";
  }
}

// Arma el PDF juntando sus partes y lo descarga. Lo usan la alumna (su entrega) y Jessica (la de cada alumna).
async function descargarEntrega(entrega, boton) {
  if (!entrega) return;
  const textoBoton = boton ? boton.textContent : "";
  if (boton) { boton.disabled = true; boton.textContent = "Preparando…"; }
  try {
    const snap = await getDocs(collection(db, "entregas", entrega.id, "partes"));
    const partes = snap.docs
      .map((d) => ({ n: Number(d.id), datos: d.data().datos }))
      .filter((p) => p.n < entrega.partes)
      .sort((a, b) => a.n - b.n);
    if (partes.length !== entrega.partes) throw new Error("incompleta");
    const url = URL.createObjectURL(new Blob([base64ABytes(partes.map((p) => p.datos).join(""))], { type: "application/pdf" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = entrega.archivo || "trabajo-final.pdf";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    mostrarAviso("No se pudo descargar el archivo. Probá de nuevo.");
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = textoBoton; }
  }
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
  if (!(cursoCompleto() && trabajoFinalOk()) && !estado.previa) return;
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
      const registro = await registrarCertificado(inscripcion);
      if (registro.retirado === true) {
        abrirVentana(`${encabezado}<p>Este certificado fue retirado y no se puede descargar. Si creés que es un error,
          <a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola Jessica, quiero consultar por mi certificado del curso ${c.titulo}. Mi código es ${codigo}.`)}" target="_blank" rel="noopener">escribile a Jessica</a>.</p>`);
        return;
      }
      fecha = registro.emitida.toDate();
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
        <p class="certificado__detalle">${esc(duracion(curso))} de cursada</p>
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
  if (!cortarEntregas) {
    cortarEntregas = onSnapshot(query(collection(db, "entregas"), orderBy("enviada", "desc")), (snap) => {
      estado.entregas = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
      cargado.adminEntregas = true;
      if (estado.vista === "panel" && estado.panelPestana === "trabajos") pintarPanel();
      actualizarNotificaciones();
    }, () => { cargado.adminEntregas = true; });
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
      <button type="button" role="tab" data-pestana="trabajos" aria-selected="${estado.panelPestana === "trabajos"}">Trabajos finales</button>
      <button type="button" role="tab" data-pestana="opiniones" aria-selected="${estado.panelPestana === "opiniones"}">Opiniones</button>
    </div>`;
  const conectarPestanas = () => app.querySelectorAll("[data-pestana]").forEach((b) => b.addEventListener("click", () => {
    estado.panelPestana = b.dataset.pestana;
    pintarPanel();
  }));
  if (estado.panelPestana === "clases") { pintarEditor(pestanas); return; }
  if (estado.panelPestana === "opiniones") { pintarOpiniones(pestanas, conectarPestanas); return; }
  if (estado.panelPestana === "trabajos") { pintarTrabajos(pestanas, conectarPestanas); return; }

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

/* Trabajos finales: Jessica descarga el PDF, lo corrige y le pone nota. */

const ETIQUETAS_TRABAJO = {
  entregada: ["Por corregir", "revision"],
  devuelta: ["Con correcciones", "pendiente"],
  aprobada: ["Aprobado", "aprobada"],
  desaprobada: ["Desaprobado", "rechazada"],
};

function pintarTrabajos(pestanas, conectarPestanas) {
  const cuenta = (e) => estado.entregas.filter((t) => t.estado === e).length;
  const filtros = [["entregada", "Por corregir"], ["devuelta", "Con correcciones"], ["aprobada", "Aprobados"], ["desaprobada", "Desaprobados"], ["todas", "Todos"]];
  const lista = estado.entregas.filter((t) => estado.filtroTrabajos === "todas" || t.estado === estado.filtroTrabajos);
  const pendientes = cuenta("entregada");
  app.innerHTML = `
    <section class="campus__bienvenida">
      <p class="rotulo">Panel de Jessica</p>
      <h1>Trabajos finales</h1>
      <p>${pendientes ? `Tenés <strong>${pendientes}</strong> trabajo${pendientes === 1 ? "" : "s"} para corregir.` : "No hay trabajos para corregir."}
        Descargá el PDF, corregilo y cargá la nota con tu devolución.</p>
    </section>
    ${pestanas}
    <div class="panel__filtros">
      ${filtros.map(([v, t]) => `<button type="button" data-filtro-trabajo="${v}" aria-pressed="${estado.filtroTrabajos === v}">${t}${v !== "todas" ? ` <span>${cuenta(v)}</span>` : ""}</button>`).join("")}
    </div>
    <div class="panel__lista">
      ${lista.length ? lista.map((t) => {
        const c = cursoPorId(t.curso);
        const [texto, clase] = ETIQUETAS_TRABAJO[t.estado] || ETIQUETAS_TRABAJO.entregada;
        return `
        <article class="solicitud solicitud--trabajo">
          <div class="solicitud__datos">
            <span class="estado estado--${clase}">${texto}</span>
            <h3>${esc(t.nombre)}</h3>
            <p><strong>${esc(c ? c.titulo : t.curso)}</strong></p>
            <p>${esc(t.archivo)} · ${formatoTamano(t.tamano)} · entregado el ${esc(fecha(t.enviada))}${t.intentos > 1 ? ` · intento ${t.intentos}` : ""}</p>
            ${t.nota ? `<p class="solicitud__avance">Nota: ${esc(t.nota)} sobre 10</p>` : ""}
            ${t.devolucion ? `<p>Tu devolución: ${esc(t.devolucion)}</p>` : ""}
          </div>
          <div class="solicitud__acciones">
            <button class="btn btn--chico btn--linea" type="button" data-descargar-trabajo="${esc(t.id)}">Descargar PDF</button>
            <button class="btn btn--chico" type="button" data-corregir="${esc(t.id)}">${t.estado === "entregada" ? "Corregir" : "Cambiar corrección"}</button>
          </div>
        </article>`;
      }).join("") : `<p class="campus__aviso">No hay trabajos en esta lista.</p>`}
    </div>`;
  conectarPestanas();
  app.querySelectorAll("[data-filtro-trabajo]").forEach((b) => b.addEventListener("click", () => { estado.filtroTrabajos = b.dataset.filtroTrabajo; pintarPanel(); }));
  app.querySelectorAll("[data-descargar-trabajo]").forEach((b) => b.addEventListener("click", () => descargarEntrega(estado.entregas.find((t) => t.id === b.dataset.descargarTrabajo), b)));
  app.querySelectorAll("[data-corregir]").forEach((b) => b.addEventListener("click", () => ventanaCorreccion(b.dataset.corregir)));
}

function ventanaCorreccion(id) {
  const t = estado.entregas.find((x) => x.id === id);
  if (!t) return;
  const c = cursoPorId(t.curso);
  abrirVentana(`
    <p class="rotulo">Corregir trabajo final</p>
    <h2 id="ventana-titulo">${esc(t.nombre)}</h2>
    <p>${esc(c ? c.titulo : t.curso)} · ${esc(t.archivo)} (${formatoTamano(t.tamano)}). Descargá el PDF antes de corregir.</p>
    <p><button class="btn btn--chico btn--linea" type="button" data-descargar>Descargar PDF</button></p>
    <label class="campo"><span>Resultado</span>
      <select data-resultado>
        <option value="aprobada">Aprobado</option>
        <option value="devuelta">Pedir correcciones (la alumna puede volver a entregar)</option>
        <option value="desaprobada">Desaprobado</option>
      </select></label>
    <label class="campo" data-campo-nota><span>Nota (de 1 a 10)</span>
      <input type="number" min="1" max="10" step="1" data-nota inputmode="numeric" /></label>
    <label class="campo"><span>Devolución para la alumna</span>
      <textarea rows="6" maxlength="2000" data-devolucion placeholder="Qué estuvo bien, qué hay que mejorar y cómo seguir."></textarea></label>
    <p class="acceso__error" role="alert" data-error></p>
    <div class="programa__pie"><button class="btn" type="button" data-guardar-correccion>Guardar corrección</button></div>`);
  const resultado = ventanaContenido.querySelector("[data-resultado]");
  const campoNota = ventanaContenido.querySelector("[data-campo-nota]");
  const nota = ventanaContenido.querySelector("[data-nota]");
  const devolucion = ventanaContenido.querySelector("[data-devolucion]");
  const error = ventanaContenido.querySelector("[data-error]");
  if (t.estado !== "entregada") {
    resultado.value = t.estado;
    if (t.nota) nota.value = t.nota;
    devolucion.value = t.devolucion || "";
  }
  const alternarNota = () => { campoNota.hidden = resultado.value === "devuelta"; };
  resultado.addEventListener("change", alternarNota);
  alternarNota();
  ventanaContenido.querySelector("[data-descargar]").addEventListener("click", (e) => descargarEntrega(t, e.target));
  ventanaContenido.querySelector("[data-guardar-correccion]").addEventListener("click", async (e) => {
    error.textContent = "";
    const valor = Number(nota.value);
    const texto = devolucion.value.trim();
    if (resultado.value !== "devuelta" && !(Number.isInteger(valor) && valor >= 1 && valor <= 10)) { error.textContent = "Poné una nota entera del 1 al 10."; return; }
    if (resultado.value !== "aprobada" && !texto) { error.textContent = "Escribí la devolución: la alumna tiene que saber qué corregir."; return; }
    e.target.disabled = true;
    try {
      await updateDoc(doc(db, "entregas", id), {
        estado: resultado.value,
        nota: resultado.value === "devuelta" ? deleteField() : valor,
        devolucion: texto,
        calificada: serverTimestamp(),
      });
      cerrarVentana();
      mostrarAviso("Corrección guardada. La alumna recibe un aviso.");
    } catch { e.target.disabled = false; mostrarAviso("No se pudo guardar. Probá de nuevo."); }
  });
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
        ${textoCertificado(i)}
      </div>
      ${tieneImagen ? `<button class="solicitud__comprobante" type="button" data-ver="${esc(i.id)}"><img src="${i.comprobante}" alt="Comprobante de ${esc(i.nombre)}" /></button>`
        : `<p class="solicitud__sin">Sin comprobante</p>`}
      <div class="solicitud__acciones">
        ${i.estado !== "aprobada" ? `<button class="btn btn--chico" type="button" data-aprobar="${esc(i.id)}">Aprobar</button>` : ""}
        ${i.estado !== "rechazada" && i.estado !== "aprobada" ? `<button class="btn btn--chico btn--linea" type="button" data-rechazar="${esc(i.id)}">Rechazar</button>` : ""}
        <button class="btn btn--chico btn--linea" type="button" data-nombre="${esc(i.id)}">Corregir nombre</button>
        ${certificados[i.codigo] ? `<button class="btn btn--chico btn--linea" type="button" data-cert-estado="${esc(i.id)}">${certificados[i.codigo].retirado ? "Restituir certificado" : "Retirar certificado"}</button>` : ""}
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
  contenedor.querySelectorAll("[data-cert-estado]").forEach((b) => b.addEventListener("click", () => ventanaRetiro(b.dataset.certEstado)));
  cargarProgresos(lista.filter((i) => i.estado === "aprobada"));
  cargarCertificados();
}

/* Certificados emitidos (se leen todos juntos, como mucho una vez cada 30 segundos mientras el panel está abierto). */
const certificados = {};
let certificadosLeidos = 0;

async function cargarCertificados(forzar = false) {
  if (!forzar && Date.now() - certificadosLeidos < 30000) return;
  certificadosLeidos = Date.now();
  try {
    const snap = await getDocs(collection(db, "certificados"));
    const antes = JSON.stringify(certificados);
    Object.keys(certificados).forEach((k) => delete certificados[k]);
    snap.forEach((d) => { certificados[d.id] = d.data(); });
    if (JSON.stringify(certificados) !== antes) pintarListaPanel();
  } catch { /* si falla, se vuelve a intentar en 30 segundos */ }
}

function textoCertificado(i) {
  const c = certificados[i.codigo];
  if (!c) return "";
  return c.retirado
    ? `<p class="solicitud__nota">Certificado retirado: ya no es válido.</p>`
    : `<p class="solicitud__avance">🎓 Certificado emitido · ${esc(fecha(c.emitida))}</p>`;
}

// Retirar un certificado no lo borra: queda marcado, la verificación dice que ya no es válido y la alumna
// no puede volver a descargarlo. Se puede restituir cuando se quiera.
function ventanaRetiro(id) {
  const i = estado.todas.find((x) => x.id === id);
  const c = i && certificados[i.codigo];
  if (!c) return;
  const retirar = !c.retirado;
  abrirVentana(`
    <p class="rotulo">${retirar ? "Retirar certificado" : "Restituir certificado"}</p>
    <h2 id="ventana-titulo">${esc(i.nombre)} · ${esc(i.codigo)}</h2>
    <p>${retirar
      ? "Al retirarlo, la página de verificación va a decir que este certificado ya no es válido y la alumna no va a poder volver a descargarlo. No se borra: podés restituirlo cuando quieras."
      : "Al restituirlo, el certificado vuelve a ser válido en la página de verificación y la alumna puede descargarlo de nuevo."}</p>
    <div class="programa__pie"><button class="btn" type="button" data-confirmar>${retirar ? "Retirar certificado" : "Restituir certificado"}</button></div>`);
  ventanaContenido.querySelector("[data-confirmar]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await updateDoc(doc(db, "certificados", i.codigo), { retirado: retirar });
      certificados[i.codigo] = { ...c, retirado: retirar };
      cerrarVentana();
      mostrarAviso(retirar ? "Certificado retirado." : "Certificado restituido.");
      pintarListaPanel();
    } catch { e.target.disabled = false; mostrarAviso("No se pudo cambiar. Probá de nuevo."); }
  });
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
        <select data-curso>${CURSOS.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.titulo)}${x.retirado ? " (retirado)" : ""}</option>`).join("")}</select></label>
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
