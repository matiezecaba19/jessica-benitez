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
      titulo: "Fundamentos de la Psicopedagogía",
      id: "fundamentos",
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

  return { WHATSAPP, ALIAS, INCLUYE, CURSOS };
})();
