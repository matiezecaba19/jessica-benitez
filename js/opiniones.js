/* Muestra en la landing las opiniones que Jessica publicó desde el panel del campus.
   Si Firebase no está configurado o no hay opiniones publicadas, la sección queda oculta. */
import { firebaseConfig } from "./firebase-config.js";

const params = new URLSearchParams(location.search);
const usaEmulador = params.has("emulador");
let config = firebaseConfig;
if (!config.apiKey && usaEmulador) config = { apiKey: "demo", projectId: "demo-campus" };

if (config.apiKey) mostrarOpiniones().catch(() => { /* sin opiniones: la sección sigue oculta */ });

async function mostrarOpiniones() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const { getFirestore, connectFirestoreEmulator, collection, query, where, limit, getDocs } =
    await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js");
  const db = getFirestore(initializeApp(config));
  if (usaEmulador) connectFirestoreEmulator(db, "127.0.0.1", 8080);

  const snap = await getDocs(query(collection(db, "opiniones"), where("publicada", "==", true), limit(12)));
  const opiniones = snap.docs.map((d) => d.data())
    .filter((o) => o.comentario)
    .sort((a, b) => (b.actualizada?.seconds || 0) - (a.actualizada?.seconds || 0))
    .slice(0, 6);
  if (!opiniones.length) return;

  const cursos = Object.fromEntries((window.DATOS_CURSOS?.CURSOS || []).map((c) => [c.id, c.titulo]));
  const lista = document.getElementById("opiniones-lista");
  lista.replaceChildren(...opiniones.map((o) => {
    const figura = document.createElement("figure");
    figura.className = "opinion";
    const estrellas = document.createElement("p");
    estrellas.className = "opinion__estrellas";
    estrellas.setAttribute("aria-label", `${o.estrellas} de 5 estrellas`);
    estrellas.textContent = "★★★★★".slice(0, o.estrellas) + "☆☆☆☆☆".slice(0, 5 - o.estrellas);
    const cita = document.createElement("blockquote");
    cita.textContent = `«${o.comentario}»`;
    const autor = document.createElement("figcaption");
    const nombre = document.createElement("strong");
    nombre.textContent = o.nombre;
    autor.append(nombre, ` · ${cursos[o.curso] || "Curso online"}`);
    figura.append(estrellas, cita, autor);
    return figura;
  }));
  document.getElementById("opiniones").hidden = false;
}
