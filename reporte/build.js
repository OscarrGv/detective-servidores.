const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, HeadingLevel, WidthType, ShadingType, BorderStyle, LevelFormat,
  Footer, PageNumber, PageBreak, TabStopType, TabStopPosition, PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
} = require("docx");

const RES = process.env.RES || "public/descargas/resultados";
const NAVY = "1F3864";
const W = 9406; // ancho útil (Carta, márgenes 2.5 cm)

// ---------- ayudantes ----------
// Texto con **negritas** y _cursivas_ en línea
function runs(text, base = {}) {
  const out = [];
  const parts = text.split(/(\*\*[^*]+\*\*|~~[^~]+~~)/g).filter(Boolean);
  for (const p of parts) {
    if (p.startsWith("**")) out.push(new TextRun({ ...base, text: p.slice(2, -2), bold: true }));
    else if (p.startsWith("~~"))
      out.push(new TextRun({ ...base, text: p.slice(2, -2), italics: true }));
    else out.push(new TextRun({ ...base, text: p }));
  }
  return out;
}
const P = (text, opts = {}) =>
  new Paragraph({
    children: runs(text, opts.run || {}),
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 110, line: 264 },
    ...(opts.para || {}),
  });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const B = (t) =>
  new Paragraph({ numbering: { reference: "vinetas", level: 0 }, children: runs(t),
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 50, line: 264 } });
let numRef = 0;
function numbered(items) {
  const ref = "num" + numRef++;
  numConfigs.push({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.",
    alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] });
  return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t),
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 288 } }));
}
const numConfigs = [];
const caption = (t) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 160 },
    children: runs(t, { italics: true, size: 19, color: "444444" }) });

const border = { style: BorderStyle.SINGLE, size: 4, color: "B4BCC8" };
const borders = { top: border, bottom: border, left: border, right: border };

function table(headers, rows, widths, opts = {}) {
  const center = opts.center || [];
  const sum = widths.reduce((a, b) => a + b, 0);
  const cell = (text, w, i, header, shade, last) =>
    new TableCell({
      borders, width: { size: w, type: WidthType.DXA },
      margins: { top: 35, bottom: 35, left: 90, right: 90 },
      shading: header ? { fill: NAVY, type: ShadingType.CLEAR, color: "auto" }
        : shade ? { fill: "EEF2F8", type: ShadingType.CLEAR, color: "auto" } : undefined,
      children: [new Paragraph({
        keepNext: !last, keepLines: true,
        alignment: header || center.includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: runs(String(text), header ? { bold: true, color: "FFFFFF", size: 18 } : { size: 18 }),
      })],
    });
  return new Table({
    width: { size: sum, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], i, true)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true,
        children: r.map((c, i) => cell(c, widths[i], i, false, ri % 2 === 1, ri === rows.length - 1)) })),
    ],
  });
}
const space = (after = 160) => new Paragraph({ spacing: { after }, children: [] });

function image(file, wIn) {
  const buf = fs.readFileSync(path.join(RES, file));
  const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
  const w = wIn * 96, h = Math.round((w * ph) / pw);
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 },
    children: [new ImageRun({ type: "png", data: buf, transformation: { width: w, height: h },
      altText: { title: file, description: file, name: file } })] });
}

// Recuadro de nota (una celda sombreada)
function box(lines, fill = "FFF4E5", edge = "E0A458") {
  const b = { style: BorderStyle.SINGLE, size: 8, color: edge };
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      borders: { top: b, bottom: b, right: b, left: { style: BorderStyle.SINGLE, size: 24, color: edge } },
      shading: { fill, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 80, bottom: 80, left: 180, right: 180 },
      children: lines.map((t, i) => new Paragraph({ alignment: AlignmentType.JUSTIFIED,
        spacing: { after: i === lines.length - 1 ? 0 : 100, line: 288 }, children: runs(t) })),
    })] })],
  });
}
const mono = (t) => new Paragraph({ spacing: { after: 0 },
  children: [new TextRun({ text: t === "" ? " " : t, font: "Courier New", size: 16 })] });

// ---------- portada ----------
const cover = (t, size, bold, after) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after },
    children: [new TextRun({ text: t, bold, size })] });

const portada = [
  space(400),
  cover("Tecnológico Nacional de México", 32, true, 40),
  cover("Instituto Tecnológico de Veracruz", 32, true, 600),
  cover("Materia: Inteligencia Artificial", 26, false, 40),
  cover("Unidad 2", 26, false, 800),
  cover("Modelo de Red Bayesiana para el diagnóstico probabilístico de problemas de rendimiento y disponibilidad en un servidor de base de datos", 36, true, 200),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 },
    children: [new TextRun({ text: "¿Por qué se pone lento o deja de responder un servidor de base de datos?", italics: true, size: 26, color: "444444" })] }),
  cover("Integrantes:", 24, true, 40),
  cover("Oscar Gómez Vásquez", 24, false, 40),
  cover("Said Rosas Vera", 24, false, 40),
  cover("Brayan Apolinar Ávila", 24, false, 400),
  cover("Grupo: 9J1B", 24, false, 40),
  cover("Docente: Sergio Ríos González", 24, false, 40),
  cover("Fecha: 25 de septiembre de 2026", 24, false, 400),
  cover("Veracruz, Ver.", 24, false, 0),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- índice ----------
// Las páginas se calculan en una primera pasada (pages.json) y se escriben aquí.
const PAGES = fs.existsSync(path.join(__dirname, "pages.json")) ? JSON.parse(fs.readFileSync(path.join(__dirname, "pages.json"), "utf8")) : {};
const SECCIONES = [
  "1. Introducción", "2. Planteamiento del problema", "3. Objetivo", "4. Variables",
  "5. Modelo de Red Bayesiana", "6. Justificación de las relaciones", "7. Probabilidades",
  "8. Tablas de probabilidad condicional", "9. Consultas", "10. Resultados", "11. Análisis",
  "12. Conclusiones individuales", "Anexo A. Archivos entregados", "Anexo B. Evidencia de ejecución",
];
const indice = [
  new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 300 },
    children: [new TextRun({ text: "Índice", bold: true, size: 32 })] }),
  ...SECCIONES.map((t) => new Paragraph({ style: "TOC1", spacing: { after: 140 },
    tabStops: [{ type: TabStopType.RIGHT, position: W, leader: "dot" }],
    children: [new TextRun(t + "\t" + String(PAGES[t] ?? "0"))] })),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- cuerpo ----------
const c = [];

c.push(H1("1. Introducción"));
c.push(P("Casi todos los sistemas que usamos a diario (una tienda en línea, el sistema escolar, la aplicación del banco) guardan su información en un **servidor de base de datos**. Cuando ese servidor falla, todo lo que depende de él se vuelve lento o deja de funcionar. El reto es que un mismo síntoma puede tener causas muy distintas, y el administrador casi nunca ve la causa directamente, solo sus efectos, igual que un médico ve la fiebre pero no el virus."));
c.push(P("Una **Red Bayesiana** es un mapa que une causas y efectos con flechas y le asigna una probabilidad a cada relación. Encaja bien con este problema porque **hay incertidumbre** (un síntoma no señala una sola causa), **las relaciones tienen dirección clara** (la causa provoca el síntoma) y **la información llega poco a poco**. Con cada dato nuevo la red recalcula qué causa es la más probable usando el **Teorema de Bayes**, una regla para actualizar lo que creemos cuando aparece información nueva."));
c.push(table(["Término", "Qué significa"], [
  ["Índice", "Como el índice de un libro: permite encontrar un dato sin revisar todo. Sin índice, el servidor revisa la tabla fila por fila."],
  ["Procesador (CPU)", "La parte de la computadora que hace los cálculos. «Al máximo» = trabajando a toda su capacidad."],
  ["Bloqueo", "Una operación que espera a que otra termine de usar los mismos datos."],
  ["Pista o evidencia", "Algo que sí podemos observar, como una alerta del monitor."],
  ["Probabilidad a priori / posterior", "Qué tan probable es una causa antes / después de ver las pistas."],
], [2600, W - 2600]));

c.push(H1("2. Planteamiento del problema"));
c.push(P("Un servidor de base de datos (por ejemplo MySQL o PostgreSQL) atiende a una aplicación web y a veces los usuarios se quejan de que va lento o de que no pueden entrar. El administrador tiene un panel de monitoreo que muestra el uso del procesador, alertas de espacio en disco y errores de conexión, y con eso debe decidir qué arreglar."));
c.push(P("**¿Qué se diagnostica?** La causa más probable de que el servicio falle (lentitud o errores de conexión) a partir de lo que se observa en el servidor."));
c.push(P("**¿Por qué hace falta?** Cada causa se arregla distinto y arreglar la equivocada cuesta tiempo y dinero: crear índices no sirve si el disco está lleno, y un servidor más potente no arregla una falla de red."));
c.push(P("**¿Qué lo provoca?** Demasiados usuarios a la vez, tablas sin índices, un disco lleno o lento, fallas en la red y operaciones que se estorban por querer modificar los mismos datos (bloqueos)."));
c.push(P("**¿Qué se puede observar?** Que el sistema está lento, que el procesador está al máximo, errores al conectarse y alertas de poco espacio en disco."));
c.push(P("**¿Qué decisión se apoya?** Qué corregir primero: crear índices, dar más capacidad o limitar conexiones, liberar espacio en disco o pasar el caso al área de redes."));
c.push(box(["**Pregunta que responde la red:** ~~«Si el servidor está lento y con el procesador al máximo, pero no hay errores de conexión ni alertas de espacio, ¿qué tan probable es que falten índices en las tablas?»~~"], "EEF2F8", "1F3864"));

c.push(H1("3. Objetivo"));
c.push(P("Construir y probar una Red Bayesiana que, a partir de lo que se observa en el servidor, calcule qué tan probable es cada una de las cuatro causas principales (muchos usuarios, tablas sin índices, disco lleno o lento y falla de red), y analizar cómo cambian esas probabilidades al aparecer pistas nuevas."));

c.push(H1("4. Variables"));
c.push(P("La red usa **9 variables**, cada una con dos valores (**Sí / No**): 4 **causas** que queremos descubrir, 1 **causa intermedia** (provocada por otra causa) y 4 **pistas** que sí se pueden ver. La columna «En el código» es el nombre que usa el programa."));
c.push(table(["Variable", "En el código", "Tipo", "Por qué se incluye"], [
  ["Muchos usuarios a la vez", "CargaAlta", "Causa", "Carga al procesador, llena las conexiones y provoca choques entre operaciones."],
  ["Tablas sin índices", "IndicesFaltantes", "Causa", "El servidor revisa la tabla completa: consultas lentas y procesador cansado."],
  ["Disco lleno o lento", "DiscoSaturado", "Causa", "Leer y guardar datos se vuelve lento."],
  ["Falla de red", "FallaRed", "Causa", "Los usuarios no logran llegar al servidor."],
  ["Operaciones en espera", "Bloqueos", "Intermedia", "Una operación espera a otra; pasa sobre todo con muchos usuarios."],
  ["Procesador al máximo", "CPUAlta", "Pista", "Separa las causas que cargan al procesador de las que no."],
  ["Sistema lento", "ConsultasLentas", "Pista", "Es lo que reportan los usuarios y lo que inicia el diagnóstico."],
  ["Errores al conectarse", "ErroresConexion", "Pista", "Distingue problemas de red de exceso de usuarios."],
  ["Alerta de poco espacio", "AlertaEspacio", "Pista", "Aviso automático del monitor; señal directa del disco."],
], [2050, 1550, 1050, W - 4650]));

c.push(H1("5. Modelo de Red Bayesiana"));
c.push(P("La red se programó en **Python** con **pgmpy**, una biblioteca especializada en Redes Bayesianas, y el diagrama se generó desde el mismo código. Cada flecha va de la causa hacia lo que provoca."));
c.push(image("diagrama_red.png", 6.0));
c.push(caption("Figura 1. Rojo: causas. Amarillo: causa intermedia. Verde: pistas observables."));
c.push(P("«Sistema lento» recibe tres flechas, así que su tabla tiene 8 combinaciones (2 × 2 × 2). «Muchos usuarios» lo vuelve lento solo de forma indirecta, a través de las operaciones en espera. Además, varias causas apuntan a un mismo síntoma, lo que produce el efecto «ya está explicado» (sección 11)."));

c.push(H1("6. Justificación de las relaciones"));
c.push(P("Cada flecha significa «esto provoca directamente aquello»; ninguna se agregó sin razón.", { after: 80 }));
c.push(table(["Relación", "Por qué existe"], [
  ["Muchos usuarios → Operaciones en espera", "Más gente cambiando datos a la vez = más choques y esperas."],
  ["Muchos usuarios → Procesador al máximo", "Más peticiones por segundo = más trabajo para el procesador."],
  ["Muchos usuarios → Errores al conectarse", "Se rebasa el límite de conexiones (max_connections) y el servidor rechaza a los nuevos."],
  ["Tablas sin índices → Procesador al máximo", "Revisar fila por fila requiere muchísimos cálculos."],
  ["Tablas sin índices → Sistema lento", "Leer toda la tabla tarda más que ir directo al dato."],
  ["Operaciones en espera → Sistema lento", "Una operación que espera su turno tarda más."],
  ["Disco lleno o lento → Sistema lento", "Si el disco tarda en leer y guardar, todo se vuelve lento."],
  ["Disco lleno o lento → Alerta de poco espacio", "El monitor avisa cuando el espacio baja de un límite."],
  ["Falla de red → Errores al conectarse", "La información no llega y la conexión se cancela."],
], [3600, W - 3600]));
c.push(space(80));
c.push(P("**No se incluyeron:** disco → procesador (con un disco lento el procesador se queda esperando, trabaja menos) ni red → sistema lento (si la red falla, la gente ni siquiera llega al servidor)."));

c.push(H1("7. Probabilidades"));
c.push(P("Se usó la **Opción B (datos hipotéticos)** porque no tenemos registros reales de fallas. Los valores reflejan qué tan seguido ocurre cada problema en un servidor típico. Estas son las **probabilidades a priori**, es decir, antes de ver cualquier pista:", { after: 80 }));
c.push(table(["Causa", "P(Sí)", "P(No)", "De dónde sale"], [
  ["Muchos usuarios a la vez", "0.25", "0.75", "Unas 6 horas pico de 24 al día (≈ 25 %)."],
  ["Tablas sin índices", "0.20", "0.80", "Común en sistemas que crecen sin revisión; 1 de cada 5 casos."],
  ["Disco lleno o lento", "0.10", "0.90", "El espacio suele planearse y vigilarse."],
  ["Falla de red", "0.05", "0.95", "La red suele tener respaldo; es lo más raro."],
], [2400, 800, 800, W - 4000], { center: [1, 2] }));
c.push(space(80));
c.push(P("El orden refleja la práctica: los problemas de uso y de software son más frecuentes que las fallas del equipo físico."));

c.push(H1("8. Tablas de probabilidad condicional"));
c.push(P("Estas tablas (CPT) responden «si estas causas están o no, ¿qué tan probable es el efecto?». Se muestra la probabilidad de **Sí**; la de **No** es 1 menos ese valor."));
c.push(table(["Variable", "Combinación de causas", "P(Sí)", "Razón"], [
  ["Operaciones en espera", "Muchos usuarios: Sí / No", "0.40 / 0.05", "Con mucha gente los choques son comunes; con uso normal, raros."],
  ["Procesador al máximo", "Usuarios y sin índices: ambos", "0.95", "Las dos causas juntas casi siempre lo saturan."],
  ["", "Solo muchos usuarios", "0.70", "La carga pesa más que un recorrido de tabla, que también depende del disco."],
  ["", "Solo tablas sin índices", "0.60", ""],
  ["", "Ninguna", "0.05", "Solo tareas de fondo, como respaldos."],
  ["Errores al conectarse", "Falla de red (con / sin muchos usuarios)", "0.95 / 0.90", "Una falla de red casi siempre da errores."],
  ["", "Solo muchos usuarios", "0.30", "Solo en picos que rebasan el límite de conexiones."],
  ["", "Ninguna", "0.02", "Errores ocasionales del lado del usuario."],
  ["Alerta de poco espacio", "Disco lleno: Sí / No", "0.90 / 0.03", "El monitor falla 10 % de las veces y da 3 % de falsas alarmas."],
], [1900, 2500, 1100, W - 5500], { center: [2] }));
c.push(space(80));
c.push(P("**Sistema lento (tres causas).** Para no inventar 8 valores sueltos usamos el **modelo Noisy-OR**: cada causa puede volver lento el sistema por su cuenta (sin índices 70 %, operaciones en espera 60 %, disco 50 %, más 3 % de otras causas), y el sistema solo sigue rápido si **ninguna** lo logra. Ejemplo con índices faltantes y disco lleno: sigue rápido con 0.97 × 0.30 × 0.50 = 0.1455, así que está lento con 1 − 0.1455 ≈ **0.85**. Así, agregar una causa nunca baja la probabilidad de lentitud.", { after: 80 }));
c.push(table(["Sin índices", "Op. en espera", "Disco lleno", "P(Lento = Sí)", "Sin índices", "Op. en espera", "Disco lleno", "P(Lento = Sí)"], [
  ["Sí", "Sí", "Sí", "0.94", "No", "Sí", "Sí", "0.81"],
  ["Sí", "Sí", "No", "0.88", "No", "Sí", "No", "0.61"],
  ["Sí", "No", "Sí", "0.85", "No", "No", "Sí", "0.52"],
  ["Sí", "No", "No", "0.71", "No", "No", "No", "0.03"],
], [1175, 1176, 1176, 1176, 1175, 1176, 1176, 1176], { center: [0, 1, 2, 3, 4, 5, 6, 7] }));

c.push(H1("9. Consultas"));
c.push(P("Los cálculos se hicieron con pgmpy (método de **eliminación de variables**, una forma ordenada de hacer las cuentas del Teorema de Bayes). Se hicieron **siete consultas**: C1 a C4 suman pistas una por una y C5 a C7 prueban otras situaciones. P(A | B) se lee «probabilidad de A sabiendo B».", { after: 80 }));
c.push(table(["#", "Qué sabemos", "Cómo se escribe"], [
  ["C1", "Nada todavía", "P(Causa)"],
  ["C2", "Sistema lento", "P(Causa | Lento)"],
  ["C3", "Lento + procesador al máximo", "P(Causa | Lento, CPU)"],
  ["C4", "Lento + procesador al máximo + sin errores + sin alerta", "P(Causa | Lento, CPU, ¬Errores, ¬Alerta)"],
  ["C5", "Lento + alerta de espacio", "P(Causa | Lento, Alerta)"],
  ["C6", "Errores al conectarse", "P(Causa | Errores)"],
  ["C7", "Errores + procesador normal", "P(Causa | Errores, ¬CPU)"],
], [600, 4600, W - 5200], { center: [0] }));
c.push(space(80));
c.push(P("**C4** es la consulta con **evidencia múltiple** y responde la pregunta de la sección 2 (el símbolo ¬ significa «no»)."));
c.push(P("**Comprobación a mano.** Para verificar el programa, C2 también se resolvió revisando las 2⁹ = 512 combinaciones posibles: se calcula qué tan probable es cada una, se conservan las que tienen el sistema lento y se ve qué parte tiene además tablas sin índices, es decir ~~P(sin índices | lento) = P(sin índices y lento) ÷ P(lento)~~. El resultado, **0.5466**, es idéntico al de pgmpy (función calcular_a_mano() del código)."));

c.push(H1("10. Resultados"));
c.push(P("Probabilidad de cada causa en cada consulta; en negritas, la más probable.", { after: 80 }));
c.push(table(["Consulta", "Muchos usuarios", "Tablas sin índices", "Disco lleno o lento", "Falla de red"], [
  ["C1", "**25.0 %**", "20.0 %", "10.0 %", "5.0 %"],
  ["C2", "36.4 %", "**54.7 %**", "22.7 %", "5.0 %"],
  ["C3", "53.5 %", "**69.6 %**", "15.1 %", "5.0 %"],
  ["C4", "44.3 %", "**76.2 %**", "1.8 %", "0.5 %"],
  ["C5", "28.8 %", "31.3 %", "**89.8 %**", "5.0 %"],
  ["C6", "**63.4 %**", "20.0 %", "10.0 %", "34.8 %"],
  ["C7", "34.0 %", "7.6 %", "10.0 %", "**51.3 %**"],
], [1406, 2000, 2000, 2000, 2000], { center: [0, 1, 2, 3, 4] }));
c.push(image("evolucion_probabilidades.png", 5.6));
c.push(caption("Figura 2. Cómo cambia la sospecha sobre cada causa al sumar pistas (C1 a C4)."));
c.push(P("Sin pistas gana «muchos usuarios» solo por ser la más común. Al saber que el sistema está lento y el procesador al máximo, las tablas sin índices toman la delantera, y con las cuatro pistas de C4 llegan a **76.2 %**, mientras disco y red quedan descartados. Si en vez de eso aparece la alerta de espacio (C5), el diagnóstico cambia a **disco lleno (89.8 %)**. Con errores al conectarse (C6) se sospecha de los muchos usuarios, pero si el procesador está normal (C7) la **falla de red** pasa al frente (51.3 %)."));

c.push(H1("11. Análisis"));
c.push(P("**¿Por qué subió o bajó cada probabilidad?** De C1 a C2 las tablas sin índices saltan de 20 % a 54.7 % porque son la causa que más fácil vuelve lento el sistema (70 %). La falla de red no se mueve (5 %): ninguna flecha la conecta con «sistema lento». De C2 a C3, los muchos usuarios suben más (36.4 % → 53.5 %) por ser los que más cargan al procesador, y el disco **baja** (22.7 % → 15.1 %) porque la lentitud ya queda explicada por otras causas. De C3 a C4, saber lo que **no** pasa también informa: sin alerta de espacio el disco cae a 1.8 % (el monitor lo habría detectado 90 % de las veces) y sin errores de conexión bajan los muchos usuarios (53.5 % → 44.3 %)."));
c.push(P("**Efecto «ya está explicado»** (en inglés, ~~explaining away~~). Si varias causas producen el mismo síntoma, confirmar una le quita fuerza a las demás. Es como un piso mojado: si sabes que alguien trapeó, ya no sospechas tanto de una fuga. Con solo «sistema lento» (C2) las tablas sin índices tienen 54.7 %; al aparecer la alerta de espacio (C5) el disco sube a 89.8 % y los índices **bajan** a 31.3 %. Lo mismo ocurre de C6 a C7: con procesador normal, los muchos usuarios bajan de 63.4 % a 34.0 % y la falla de red sube de 34.8 % a 51.3 %."));
c.push(P("**¿Qué pista influye más?** Se probó cada pista sola (entre paréntesis, los puntos que sube cada causa respecto a no saber nada):", { after: 80 }));
c.push(table(["Pista sola", "Muchos usuarios", "Tablas sin índices", "Disco lleno o lento", "Falla de red"], [
  ["Sistema lento", "36.4 % (+11.4)", "54.7 % (+34.7)", "22.7 % (+12.7)", "5.0 % (+0.0)"],
  ["Procesador al máximo", "61.0 % (+36.0)", "44.7 % (+24.7)", "10.0 % (+0.0)", "5.0 % (+0.0)"],
  ["Errores al conectarse", "63.4 % (+38.4)", "20.0 % (+0.0)", "10.0 % (+0.0)", "34.8 % (+29.8)"],
  ["Alerta de poco espacio", "25.0 % (+0.0)", "20.0 % (+0.0)", "**76.9 % (+66.9)**", "5.0 % (+0.0)"],
], [2106, 1825, 1825, 1825, 1825], { center: [1, 2, 3, 4] }));
c.push(space(80));
c.push(P("La **alerta de espacio** es la pista más poderosa porque solo la provoca una causa y casi no da falsas alarmas. «Sistema lento», en cambio, sube varias causas sin confirmar ninguna; por eso conviene revisar primero las pistas específicas."));
c.push(P("**¿Qué pasa si cambia una pista?** Entre C4 y C5, o entre C6 y C7, cambiar una sola pista basta para cambiar la causa más probable. El mismo síntoma principal puede llevar a decisiones distintas según la información extra disponible:", { after: 80 }));
c.push(table(["Situación", "Causa más probable", "Qué hacer"], [
  ["C4: lento + CPU alta, sin errores ni alertas", "Tablas sin índices", "Revisar las consultas más lentas (con EXPLAIN) y crear los índices que falten."],
  ["C5: lento + alerta de espacio", "Disco lleno o lento", "Liberar espacio (registros y respaldos viejos) o ampliar el disco."],
  ["C6: errores al conectarse", "Muchos usuarios", "Revisar conexiones activas y ajustar el límite o usar un pool de conexiones."],
  ["C7: errores + CPU normal", "Falla de red", "Probar la conexión (ping, firewall) y avisar al área de redes."],
], [3000, 1900, W - 4900]));

c.push(H1("12. Conclusiones individuales"));
c.push(P("**Oscar Gómez Vásquez.** Aprendí que una Red Bayesiana permite razonar al revés: partir de los efectos para estimar la causa. Me sorprendió que saber que algo **no** pasa también cambie las probabilidades. Su principal limitación es que los valores son supuestos; con registros reales de fallas sería más confiable."));
c.push(P("**Said Rosas Vera.** Entendí que cada flecha debe justificarse, porque una relación sin sentido cambia los resultados. Lo más útil fue el efecto «ya está explicado». Como limitación, cada variable solo es Sí o No, cuando en la realidad el procesador o el disco podrían dividirse en niveles (bajo, medio, alto)."));
c.push(P("**Brayan Apolinar Ávila.** Aprendí a armar tablas de probabilidad condicional y a usar Noisy-OR para llenarlas de forma coherente. Comprobar que el cálculo a mano coincide con pgmpy me ayudó a entender qué hace el programa por dentro. Una limitación es que faltan causas como consultas mal escritas, poca memoria RAM o mala configuración."));

c.push(H1("Anexo A. Archivos entregados"));
c.push(table(["Archivo", "Contenido"], [
  ["red_bayesiana_bd.py", "Programa completo y comentado: arma la red, hace las consultas, la comprobación a mano y las gráficas."],
  ["resultados/diagrama_red.png", "Diagrama de la red (Figura 1)."],
  ["resultados/evolucion_probabilidades.png", "Gráfica de la Figura 2."],
  ["resultados/consultas.txt", "Salida completa del programa."],
], [3700, W - 3700]));
c.push(space(80));
c.push(P("**Herramientas:** Python 3, pgmpy (red y cálculos), NetworkX y Matplotlib (gráficas). Para repetir los resultados: ~~pip install pgmpy matplotlib networkx~~ y luego ~~python red_bayesiana_bd.py~~. Si pgmpy no está instalado, el programa hace el cálculo a mano y obtiene los mismos resultados."));

c.push(H1("Anexo B. Evidencia de ejecución"));
c.push(P("Extracto de la salida del programa. El archivo completo (resultados/consultas.txt) muestra además cada valor con cuatro decimales y la tabla de influencia de cada pista.", { after: 80 }));
const salida = fs.readFileSync(path.join(RES, "consultas.txt"), "utf8").split("\n");
const ini = salida.findIndex((l) => l.startsWith("C1:"));
const fin = salida.findIndex((l) => l.startsWith("INFLUENCIA"));
const lineas = salida.slice(ini, fin - 1)
  .filter((l) => !l.includes("(sin pgmpy") && !l.includes("instala pgmpy") && !l.startsWith("====="))
  .map((l) => l.replace(/\s+\(P\(.*\)$/, "").replace(/^COMPROBACIÓN DE LA CONSULTA C2.*/, "COMPROBACIÓN DE C2 (cálculo a mano)"));
const corte = lineas.findIndex((l) => l.startsWith("C5:"));
const monoP = (t) => new Paragraph({ spacing: { after: 0 },
  children: [new TextRun({ text: t === "" ? " " : t, font: "Courier New", size: 15 })] });
const col = (ls, w) => new TableCell({ width: { size: w, type: WidthType.DXA },
  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
  margins: { left: 40, right: 120 }, children: ls.map(monoP) });
c.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2],
  rows: [new TableRow({ children: [col(lineas.slice(0, corte), W / 2), col(lineas.slice(corte), W / 2)] })] }));

// ---------- documento ----------
const doc = new Document({
  creator: "Oscar Gómez Vásquez, Said Rosas Vera, Brayan Apolinar Ávila",
  title: "Red Bayesiana - Diagnóstico de un servidor de base de datos",
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, color: "000000", font: "Calibri" },
        paragraph: { spacing: { before: 260, after: 100 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: NAVY, font: "Calibri" },
        paragraph: { spacing: { before: 180, after: 80 }, keepNext: true, outlineLevel: 1 } },
      { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { size: 23 } },
    ],
  },
  numbering: {
    config: [
      { reference: "vinetas", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ...numConfigs,
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 1417, right: 1417, bottom: 1417, left: 1417 } }, titlePage: true },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }),
      first: new Footer({ children: [new Paragraph({ children: [] })] }),
    },
    children: [...portada, ...indice, ...c],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.env.OUT || "raw.docx", buf);
  console.log("ok");
});
