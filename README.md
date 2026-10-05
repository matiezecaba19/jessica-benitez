# Jessica Benitez · Psicopedagoga

Página pública de Jessica Benitez, psicopedagoga en Posadas, Misiones, con un campus de cursos online.
HTML, CSS y JavaScript sin dependencias ni compilación. Se publica con GitHub Pages.

## Archivos

- `index.html`: la landing (portada, sobre mí, servicios, cómo trabajo, cursos, preguntas y contacto).
- `campus.html`: el campus: cuentas, inscripción con pago por transferencia, lector de clases y panel de Jessica.
- `css/estilos.css` y `css/campus.css`: estilos con la paleta de la marca.
- `js/datos-cursos.js`: los cursos (programa, precio, alias de pago). Lo usan la landing y el campus.
- `js/cursos.js` y `js/sitio.js`: fichas de cursos, programa, menú del celular y consejo del día.
- `js/campus.js`: la lógica del campus (Firebase).
- `js/firebase-config.js`: los datos de conexión del proyecto de Firebase.
- `firestore.rules`: las reglas de seguridad de la base de datos.
- `assets/`: logo, fotos, imagen para compartir e ilustraciones.

## Cómo funciona el campus

1. El alumno crea su cuenta (con Google o con mail) y elige un curso.
2. Ve el alias, el monto y su código de inscripción, y transfiere.
3. Sube la captura del comprobante.
4. Jessica la revisa en el «Panel de Jessica» y aprueba o rechaza (con un motivo).
5. Con la inscripción aprobada, el alumno cursa en el lector de clases.

Además:
- Cada módulo puede cerrar con una **autoevaluación** y el progreso queda guardado en la cuenta del alumno.
- Al ver todos los módulos, el alumno descarga su **certificado** (imprimible o en PDF).
- Al terminar, puede dejar su **opinión**. Jessica decide desde el panel cuáles se muestran en la landing.
- En el panel, Jessica busca alumnos, ve su avance y descarga las inscripciones en una planilla para Excel.
- **Notificaciones** (campanita arriba): al alumno le avisa cuando le aprueban o rechazan el pago; a Jessica, cuando
  alguien sube un comprobante o deja una opinión. Lo leído queda marcado en la cuenta.
- En el editor de clases, **«Ver como alumno»** muestra el curso tal como lo ve un alumno, con los cambios sin guardar.

Las clases se guardan en Firebase y **no** están en este repositorio: las reglas solo dejan leerlas
a quien tiene la inscripción aprobada. Jessica las carga y las edita desde el panel
(pestaña «Clases de los cursos», o «Importar clases» con el archivo `.json`).

Las cuentas administradoras están en `firestore.rules` (y en `js/campus.js`, solo para mostrar el panel).

## Configurar Firebase (una sola vez)

1. En <https://console.firebase.google.com> crear un proyecto.
2. **Authentication → Método de acceso:** activar «Correo electrónico/contraseña» y «Google».
3. **Authentication → Configuración → Dominios autorizados:** agregar `matiezecaba19.github.io`.
4. **Firestore Database → Crear base de datos** (modo producción, región `southamerica-east1`).
5. **Firestore Database → Reglas:** pegar el contenido de `firestore.rules` y publicar.
6. **Configuración del proyecto → Tus apps → Web (`</>`):** registrar la app y copiar los datos en `js/firebase-config.js`.

## Estadísticas de visitas

Usan Cloudflare Web Analytics (sin cookies). Para activarlas, en <https://dash.cloudflare.com>
ir a **Analytics & Logs → Web Analytics → Add a site**, poner `matiezecaba19.github.io`
y pegar el token en `js/estadisticas.js`.

## Probar en la computadora

Con el emulador de Firebase (`firebase emulators:start --project demo-campus --only auth,firestore`)
y un servidor local (`python3 -m http.server`), abrir `campus.html?emulador`.
