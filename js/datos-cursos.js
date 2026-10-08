/* Datos de los cursos: los usan la landing (cursos.js) y el campus (campus.js). */
window.DATOS_CURSOS = (function () {
  "use strict";

  const WHATSAPP = "5493764607696";
  const ALIAS = "psp.jessicabenitez";

  const INCLUYE = [
    "Material de lectura de cada módulo",
    "Actividades prácticas para aplicar lo visto",
    "Consultas con Jessica por WhatsApp o mail",
    "Certificado de finalización",
  ];

  const CURSOS = [
    {
      titulo: "Evaluación e Intervención Psicopedagógica Avanzada",
      id: "evaluacion",
      tipo: "Curso de extensión",
      // Completar con el número de la resolución del aval; mientras esté vacío no se muestra.
      aval: "Con aval de la Universidad Nacional de Misiones (UNaM)",
      resolucion: "",
      // Para cerrar temporalmente la inscripción (se muestra el curso, pero sin precio ni botón de inscripción),
      // agregar acá la línea:  proximamente: true,
      horas: 136,
      // Termina con un trabajo final: la alumna lo entrega en PDF, Jessica lo corrige con nota y el certificado exige que esté
      // aprobado. Tiene que coincidir con tieneTrabajoFinal() en firestore.rules.
      trabajoFinal: true,
      para: "Psicopedagogas y psicopedagogos recibidos",
      resumen: "Formación avanzada para quienes ya se recibieron: razonamiento clínico, marco ético y legal, evaluación de la lectura, la escritura, la matemática y las funciones ejecutivas, informes y devoluciones, intervención basada en la evidencia y trabajo con escuelas y familias.",
      precio: "$ 60.000",
      semanas: 16,
      objetivos: [
        "Formular y poner a prueba hipótesis con razonamiento clínico, reconociendo y reduciendo los sesgos.",
        "Planificar la evaluación de la lectura, la escritura, la matemática, la atención y los aspectos emocionales, y llegar a un diagnóstico diferencial con su grado de certeza.",
        "Redactar informes y conducir devoluciones adecuadas a cada destinatario, con criterios éticos y normativos.",
        "Diseñar, implementar y evaluar intervenciones basadas en la evidencia, en trabajo con escuelas, familias y otros profesionales.",
      ],
      incluye: [
        "Material de estudio de cada módulo, con casos para analizar",
        "Actividades prácticas y autoevaluación en cada módulo",
        "Trabajo final integrador",
        "Consultas con Jessica por WhatsApp o mail",
        "Constancia de finalización en el campus",
      ],
      modulos: [
        { titulo: "Razonamiento clínico y encuadre profesional", temas: ["Del motivo de consulta a la hipótesis", "Sesgos del razonamiento y cómo reducirlos", "Formulación del caso y encuadre profesional"] },
        { titulo: "Marco normativo y ético del ejercicio profesional", temas: ["Normas de educación, niñez, discapacidad, salud mental y datos personales", "Principios éticos y límites de la confidencialidad", "Registros, informes y datos sensibles"] },
        { titulo: "Neurodesarrollo y bases para la evaluación", temas: ["Lenguaje, atención, memoria y funciones ejecutivas", "Hitos del desarrollo y marcos diagnósticos (DSM-5-TR y CIE-11)", "Qué modifica la interpretación de una evaluación"] },
        { titulo: "Evaluación de la lectura y la escritura", temas: ["Modelo simple de lectura y perfiles", "Componentes a evaluar y particularidades del español", "Análisis de errores y producción escrita"] },
        { titulo: "Evaluación del pensamiento matemático", temas: ["Sentido numérico, conteo y valor posicional", "Cálculo, resolución de problemas y análisis de errores", "Discalculia y ansiedad matemática"] },
        { titulo: "Atención, funciones ejecutivas y autorregulación", temas: ["Atención y funciones ejecutivas", "Evaluación desde la psicopedagogía y rol frente al TDAH", "Apoyos de entorno y enseñanza de estrategias"] },
        { titulo: "Emoción, motivación y contexto en el aprendizaje", temas: ["Autoeficacia, autodeterminación y atribuciones", "Ansiedad, estrés y adversidad", "Qué se trabaja y cuándo derivar"] },
        { titulo: "Integración de resultados y diagnóstico diferencial", temas: ["Triangulación de la información", "Diagnóstico diferencial y comorbilidad", "Prevalencia, sobrediagnóstico y grado de certeza"] },
        { titulo: "El informe psicopedagógico y la devolución", temas: ["Estructura y redacción del informe", "Mensajes para la familia, la escuela y otros profesionales", "La devolución como intervención"] },
        { titulo: "Diseño de la intervención basada en la evidencia", temas: ["Objetivos medibles y niveles de apoyo", "Enseñanza explícita y estrategias por área", "Planificación de sesiones, generalización y retirada del apoyo"] },
        { titulo: "Trabajo con escuelas y familias: inclusión y trabajo interdisciplinario", temas: ["Colaboración con la escuela y diseño universal para el aprendizaje", "Adaptaciones, apoyos y trabajo con otros profesionales", "La familia como aliada"] },
        { titulo: "Seguimiento, evaluación de resultados y trabajo final integrador", temas: ["Medición del progreso y diseños de caso único", "Ajustar, dar el alta o derivar", "Práctica reflexiva y trabajo final integrador"] },
      ],
    },
    {
      titulo: "Educación Inclusiva y Trayectorias Escolares: Apoyos, Diseño Universal y Trabajo con Equipos Docentes",
      id: "inclusion",
      tipo: "Curso de extensión",
      // Completar con el número de la resolución del aval; mientras esté vacío no se muestra.
      aval: "Con aval de la Universidad Nacional de Misiones (UNaM)",
      resolucion: "",
      horas: 113,
      trabajoFinal: true,
      para: "Psicopedagogas y psicopedagogos recibidos",
      resumen: "Para acompañar procesos de inclusión en la escuela: marco normativo, trayectorias escolares, Diseño Universal para el Aprendizaje, configuraciones de apoyo y proyectos pedagógicos individuales, evaluación inclusiva y trabajo con equipos docentes y familias.",
      precio: "$ 50.000",
      semanas: 14,
      objetivos: [
        "Fundamentar las intervenciones en el modelo social de la discapacidad y en la normativa internacional, nacional y provincial.",
        "Analizar trayectorias escolares reales e identificar barreras para el aprendizaje y la participación.",
        "Diseñar ajustes desde el Diseño Universal para el Aprendizaje, configuraciones de apoyo y proyectos pedagógicos individuales con evaluación coherente.",
        "Trabajar con equipos docentes, de apoyo, familias y comunidad, con roles y acuerdos claros, y hacer el seguimiento de los apoyos.",
      ],
      incluye: [
        "Material de estudio de cada módulo, con casos para analizar",
        "Actividades prácticas y autoevaluación en cada módulo",
        "Trabajo final integrador",
        "Consultas con Jessica por WhatsApp o mail",
        "Constancia de finalización en el campus",
      ],
      modulos: [
        { titulo: "De la integración a la inclusión: conceptos y paradigmas", temas: ["Exclusión, segregación, integración e inclusión", "Del modelo médico al modelo social", "Barreras para el aprendizaje y la participación"] },
        { titulo: "Marco normativo de la educación inclusiva", temas: ["Normas internacionales con jerarquía constitucional", "Normas nacionales y del Consejo Federal de Educación", "La normativa provincial y su aplicación en la práctica"] },
        { titulo: "Trayectorias escolares: teóricas y reales", temas: ["Trayectorias teóricas y reales", "Repitencia, sobreedad, ausentismo y abandono", "Alerta temprana y acompañamiento de trayectorias"] },
        { titulo: "Diseño Universal para el Aprendizaje en el aula", temas: ["Los tres principios del DUA", "Analizar una planificación con el DUA", "Cambios sencillos para toda la clase"] },
        { titulo: "Configuraciones de apoyo, ajustes razonables y proyectos pedagógicos individuales", temas: ["Configuraciones de apoyo", "Ajustes de acceso y adecuaciones de contenido", "El proyecto pedagógico individual"] },
        { titulo: "Evaluar en la escuela inclusiva", temas: ["Evaluación formativa y principios de una evaluación inclusiva", "Rúbricas y retroalimentación", "Acreditación, promoción y certificación"] },
        { titulo: "Roles en la inclusión: equipos de orientación, docentes de apoyo y acompañantes", temas: ["Los actores y sus funciones", "Demanda y encargo", "Riesgos frecuentes y acuerdos de trabajo"] },
        { titulo: "Estrategias para estudiantes con discapacidad y neurodivergencias", temas: ["Autismo y discapacidad intelectual", "Discapacidad sensorial y motora", "Comunicación aumentativa y alternativa"] },
        { titulo: "Familias, comunidad y transiciones", temas: ["La familia como aliada", "Recursos de la comunidad", "Transiciones entre niveles y hacia la vida adulta"] },
        { titulo: "Seguimiento de trayectorias, documentación y trabajo final integrador", temas: ["Indicadores de participación, aprendizaje y bienestar", "Documentar sin burocratizar y evaluar los apoyos", "Trabajo final integrador"] },
      ],
    },
    {
      titulo: "Psicopedagogía en la Primera Infancia: Desarrollo, Detección Temprana y Estimulación",
      id: "infancia",
      tipo: "Curso de extensión",
      // Completar con el número de la resolución del aval; mientras esté vacío no se muestra.
      aval: "Con aval de la Universidad Nacional de Misiones (UNaM)",
      resolucion: "",
      horas: 113,
      trabajoFinal: true,
      para: "Psicopedagogas y psicopedagogos recibidos",
      resumen: "Para trabajar con niñas y niños de 0 a 6 años, sus familias y los jardines: desarrollo por áreas, señales de alerta y detección temprana, evaluación en el nivel inicial, intervención centrada en la familia, transición a la primaria y trabajo interdisciplinario.",
      precio: "$ 50.000",
      semanas: 14,
      objetivos: [
        "Reconocer el desarrollo esperable de 0 a 6 años en las áreas motora, comunicativa, cognitiva y socioemocional, y el lugar del juego.",
        "Identificar señales de alerta y usar con criterio herramientas de pesquisa y evaluación adecuadas a la edad.",
        "Diseñar intervenciones tempranas centradas en la familia y basadas en las rutinas, con objetivos funcionales.",
        "Articular con jardines, pediatría y otros profesionales, y acompañar la transición a la escuela primaria.",
      ],
      incluye: [
        "Material de estudio de cada módulo, con casos para analizar",
        "Actividades prácticas y autoevaluación en cada módulo",
        "Trabajo final integrador",
        "Consultas con Jessica por WhatsApp o mail",
        "Constancia de finalización en el campus",
      ],
      modulos: [
        { titulo: "La primera infancia: desarrollo, vínculos y ambiente", temas: ["Un período sensible", "El vínculo de apego y la co-regulación", "Factores que favorecen u obstaculizan el desarrollo"] },
        { titulo: "Desarrollo motor, sensorial y del juego", temas: ["Cómo leer los hitos del desarrollo", "Motricidad gruesa, fina y procesamiento sensorial", "El juego: de explorar a simbolizar"] },
        { titulo: "Desarrollo de la comunicación y el lenguaje", temas: ["Antes de las palabras", "De las primeras palabras a las frases", "Componentes a observar y bilingüismo"] },
        { titulo: "Desarrollo cognitivo, socioemocional y regulación", temas: ["El pensamiento en los primeros años", "Desarrollo socioemocional", "Berrinches, límites y cuándo prestar atención"] },
        { titulo: "Señales de alerta y detección temprana", temas: ["Pesquisa, evaluación y diagnóstico", "Señales de alerta que piden consulta sin demora", "Herramientas de pesquisa y cómo comunicar la preocupación"] },
        { titulo: "Evaluación psicopedagógica en el nivel inicial", temas: ["Observación del juego", "Entrevistas a familias y jardines", "Coordinación con pediatría y devolución"] },
        { titulo: "Estimulación e intervención temprana", temas: ["Intervención centrada en la familia y en entornos naturales", "Estrategias en las rutinas diarias", "Objetivos funcionales"] },
        { titulo: "Trabajo con familias y jardines", temas: ["Acompañar la crianza cotidiana", "Pantallas en la primera infancia", "Articulación con el jardín y talleres para familias"] },
        { titulo: "Transición a la primaria y bases de la alfabetización", temas: ["La transición como proceso", "Alfabetización emergente y conciencia fonológica", "Indicadores para seguir en primer grado"] },
        { titulo: "Interdisciplina, derivación, seguimiento y trabajo final integrador", temas: ["Trabajo interdisciplinario y derivación", "Seguimiento y marco de derechos", "Trabajo final integrador"] },
      ],
    },
    // Cursos anteriores: ya no se ofrecen (retirado: true los oculta de la página y del campus), pero se mantienen
    // para que quienes los cursaron sigan viendo sus clases y sus certificados.
    {
      titulo: "Fundamentos de la Psicopedagogía",
      id: "fundamentos",
      retirado: true,
      para: "Estudiantes, docentes y profesionales afines",
      resumen: "Un recorrido introductorio por los conceptos, marcos teóricos y herramientas básicas del acompañamiento psicopedagógico.",
      precio: "$ 15.000",
      semanas: 5,
      objetivos: [
        "Comprender qué estudia la psicopedagogía y en qué ámbitos interviene.",
        "Distinguir entre dificultades y trastornos del aprendizaje.",
        "Conocer las etapas del diagnóstico y las principales estrategias de intervención.",
      ],
      modulos: [
        { titulo: "¿Qué es la psicopedagogía?", temas: ["Objeto de estudio y breve historia de la disciplina", "Aportes de la psicología, la pedagogía y las neurociencias", "Ámbitos de intervención: escolar, clínico, comunitario y laboral"] },
        { titulo: "El sujeto que aprende", temas: ["Desarrollo y aprendizaje", "Dimensiones cognitiva, afectiva y social", "Modalidades de aprendizaje: cada persona aprende a su manera"] },
        { titulo: "Dificultades del aprendizaje", temas: ["Dificultad no es lo mismo que trastorno", "Factores familiares, escolares y del contexto", "Señales de alerta en cada nivel educativo"] },
        { titulo: "El diagnóstico psicopedagógico", temas: ["Entrevista inicial y motivo de consulta", "Observación, técnicas e instrumentos de evaluación", "La devolución a la familia y a la escuela"] },
        { titulo: "Estrategias de intervención", temas: ["Cómo planificar las sesiones según la edad y el motivo de consulta", "Trabajo en red con la familia y la escuela", "Seguimiento del proceso a lo largo del año"] },
      ],
    },
    {
      titulo: "Estimulación de la Lectoescritura",
      id: "lectoescritura",
      retirado: true,
      para: "Docentes de nivel inicial y primario, y familias",
      resumen: "Estrategias prácticas para acompañar el aprendizaje de la lectura y la escritura, con foco en detectar a tiempo las dificultades.",
      precio: "$ 12.500",
      semanas: 5,
      objetivos: [
        "Entender cómo se aprende a leer y a escribir.",
        "Diferenciar los errores esperables de las señales de alerta.",
        "Contar con un banco de actividades para el aula y la casa.",
      ],
      modulos: [
        { titulo: "Bases del proceso lector", temas: ["Conciencia fonológica", "Decodificación: de las letras a las palabras", "Comprensión lectora desde los primeros años"] },
        { titulo: "Cómo se aprende a escribir", temas: ["Las etapas de la escritura en la infancia", "Grafomotricidad: postura, prensión y trazo", "El valor de escribir con sentido"] },
        { titulo: "Dificultades frecuentes", temas: ["Errores propios del proceso y señales de alerta", "Dislexia y disgrafía: qué son y qué no son", "Cuándo y cómo consultar a un profesional"] },
        { titulo: "Estrategias para el aula", temas: ["Actividades según la edad y el nivel", "Juegos para trabajar sonidos, letras y palabras", "Adaptaciones para quienes necesitan más apoyo"] },
        { titulo: "Actividades para la sala y el hogar", temas: ["Banco de actividades lúdicas", "Lectura compartida en familia", "Cómo acompañar las tareas sin hacerlas por ellos"] },
      ],
    },
    {
      titulo: "Orientación Vocacional: acompañar la elección",
      id: "orientacion",
      retirado: true,
      para: "Docentes, familias y colegas que acompañan a adolescentes",
      resumen: "Herramientas para acompañar a adolescentes de los últimos años de la secundaria en la elección de una carrera, un estudio o un oficio.",
      precio: "$ 18.000",
      semanas: 6,
      objetivos: [
        "Entender la elección vocacional como un proceso y no como un momento puntual.",
        "Contar con actividades para que el adolescente se conozca y explore opciones.",
        "Saber cómo acompañar desde la familia y la escuela sin presionar.",
      ],
      modulos: [
        { titulo: "¿Qué es elegir?", temas: ["La elección como proceso", "Qué influye: familia, amigos, expectativas y contexto", "El rol de quien acompaña"] },
        { titulo: "Conocerse para elegir", temas: ["Intereses, habilidades y valores", "Actividades de autoconocimiento", "La historia personal y familiar con el estudio y el trabajo"] },
        { titulo: "Explorar estudios y trabajos", temas: ["Carreras universitarias, terciarias y oficios", "Cómo buscar información confiable", "Opciones de estudio en Misiones y la región"] },
        { titulo: "Miedos, presiones y dudas", temas: ["«¿Y si me equivoco?»: el miedo a elegir mal", "Mandatos y expectativas familiares", "Cambiar de carrera también es parte del camino"] },
        { titulo: "Familia y escuela", temas: ["Qué ayuda y qué no a la hora de acompañar", "Ideas concretas para conversar en casa", "Propuestas de orientación para el aula"] },
        { titulo: "Orientación en la cultura digital", temas: ["Redes sociales, influencers y nuevas profesiones", "Usar internet a favor de la elección", "Proyecto de vida: el primer plan concreto"] },
      ],
    },
    {
      titulo: "Técnicas de Estudio para Adolescentes",
      id: "estudio",
      retirado: true,
      para: "Estudiantes de secundaria y sus familias",
      resumen: "Aprender a organizarse, comprender lo que se lee y preparar exámenes con menos estrés y mejores resultados.",
      precio: "$ 14.000",
      semanas: 5,
      objetivos: [
        "Armar una rutina de estudio que se pueda sostener.",
        "Comprender y organizar la información de los textos.",
        "Preparar exámenes con un plan y manejar los nervios.",
      ],
      modulos: [
        { titulo: "Aprender a aprender", temas: ["Cómo funcionan la atención y la memoria", "Hábitos de estudio: lugar, horario y materiales", "Celular y distracciones: acuerdos para estudiar mejor"] },
        { titulo: "Organización del tiempo", temas: ["Agenda y planificación semanal", "Dividir las tareas grandes en pasos chicos", "Cómo dejar de postergar"] },
        { titulo: "Comprender lo que leo", temas: ["Lectura exploratoria y lectura profunda", "Subrayado e ideas principales", "Palabras clave y preguntas al texto"] },
        { titulo: "Organizar la información", temas: ["Resumen y síntesis", "Esquemas y cuadros sinópticos", "Mapas conceptuales"] },
        { titulo: "Preparar exámenes", temas: ["Plan de repaso y autoevaluación", "Exámenes orales y escritos", "Manejar los nervios el día de la prueba"] },
      ],
    },
    {
      titulo: "Límites y Hábitos en la Crianza",
      id: "crianza",
      retirado: true,
      para: "Madres, padres y cuidadores de chicos de 2 a 12 años",
      resumen: "Rutinas, pantallas, emociones y límites: herramientas para acompañar la crianza con más calma y menos gritos.",
      precio: "$ 15.000",
      semanas: 5,
      objetivos: [
        "Entender los límites como una forma de cuidado.",
        "Armar rutinas y acuerdos que funcionen en casa.",
        "Acompañar berrinches y emociones fuertes sin ceder ni gritar.",
      ],
      modulos: [
        { titulo: "Por qué los chicos necesitan límites", temas: ["Los límites como cuidado y no como castigo", "Estilos de crianza", "Qué esperar según cada edad"] },
        { titulo: "Rutinas y hábitos saludables", temas: ["Sueño, alimentación y horarios", "Rutinas visuales para la mañana y la noche", "Autonomía: tareas acordes a cada edad"] },
        { titulo: "Pantallas en casa", temas: ["Tiempos recomendados según la edad", "Acuerdos familiares sobre el uso de pantallas", "Alternativas de juego y encuentro"] },
        { titulo: "Las emociones", temas: ["Berrinches, frustración y enojo", "Acompañar sin ceder y sin gritar", "Inteligencia emocional en familia"] },
        { titulo: "Poner límites sin gritos", temas: ["Consignas claras y consecuencias coherentes", "Ponerse de acuerdo entre los adultos", "Reparar el vínculo después de un conflicto"] },
      ],
    },
  ];

  // «12 módulos · 136 horas · 16 semanas» (las horas solo aparecen si el curso las tiene definidas).
  function duracion(curso) {
    return `${curso.modulos.length} módulos${curso.horas ? ` · ${curso.horas} horas` : ""} · ${curso.semanas} semanas`;
  }

  return { WHATSAPP, ALIAS, INCLUYE, CURSOS, duracion };
})();
