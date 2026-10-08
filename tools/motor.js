/**
 * motor.js
 *
 * Genera motor.json con el calendario de las carreras de motor (Fórmula 1, MotoGP...) de las
 * competiciones de derechos.json que tienen "calendario", para la agenda de la app TelePapa.
 * Fuente: los calendarios abiertos de F1 Calendar (https://github.com/sportstimes/f1, licencia MIT).
 * Solo fecha, gran premio y sesión: la app añade la plataforma oficial con derechos.json.
 *
 * Uso: node tools/motor.js [salida]   (por defecto ./motor.json)
 */

const fs = require("fs");
const path = require("path");

const DIAS = 30;
const DATOS = "https://raw.githubusercontent.com/sportstimes/f1/main";

/** Nombre y duración (minutos) de cada sesión. */
const SESIONES = {
  fp1: ["Libres 1", 60],
  fp2: ["Libres 2", 60],
  fp3: ["Libres 3", 60],
  practice: ["Entrenamientos", 60],
  sprintQualifying: ["Clasificación al sprint", 45],
  qualifying: ["Clasificación", 60],
  qualifying1: ["Clasificación", 45],
  qualifying2: ["Clasificación 2", 20],
  warmup: ["Calentamiento", 15],
  sprint: ["Sprint", 45],
  feature: ["Carrera larga", 60],
  gp: ["Carrera", 120],
  race: ["Carrera", 60],
  race1: ["Carrera 1", 45],
  race2: ["Carrera 2", 45],
};

/** Nombres en español de los grandes premios que el calendario da en inglés (sobre todo MotoGP). */
const LUGARES = {
  thailand: "Tailandia",
  brasil: "Brasil",
  brazil: "Brasil",
  americas: "las Américas",
  espana: "España",
  spain: "España",
  france: "Francia",
  catalunya: "Cataluña",
  italy: "Italia",
  hungria: "Hungría",
  hungary: "Hungría",
  "czeck republiky": "la República Checa",
  czechia: "la República Checa",
  netherlands: "los Países Bajos",
  germany: "Alemania",
  "great britain": "Gran Bretaña",
  "san marino": "San Marino",
  austria: "Austria",
  japan: "Japón",
  indonesia: "Indonesia",
  australia: "Australia",
  malaysia: "Malasia",
  qatar: "Catar",
  portugal: "Portugal",
  valencia: "Valencia",
  argentina: "Argentina",
  india: "India",
  kazakhstan: "Kazajistán",
};

function normalizar(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Gran Premio de Australia" -> "GP de Australia"; los nombres sin traducir quedan "GP de <nombre>". */
function granPremio(carrera, traducciones) {
  const t = traducciones[carrera.localeKey] || traducciones[carrera.slug];
  if (t) return t.replace(/^Gran Premio/, "GP");
  const nombre = String(carrera.name || "").trim();
  if (/e-?prix|grand prix|gran premio|\d/i.test(nombre)) return nombre;
  return `GP de ${LUGARES[normalizar(nombre)] || nombre}`;
}

async function leerJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} respondió HTTP ${res.status}`);
  return res.json();
}

function eventosDeSerie(comp, temporadas, traducciones, desde, hasta) {
  const { serie, sesiones } = comp.calendario;
  const eventos = [];
  for (const [anio, datos] of temporadas) {
    for (const carrera of (datos && datos.races) || []) {
      if (carrera.canceled) continue;
      const gp = granPremio(carrera, traducciones);
      for (const clave of sesiones) {
        const inicio = Date.parse((carrera.sessions || {})[clave]);
        if (isNaN(inicio) || inicio < desde || inicio > hasta) continue;
        const [nombre, duracion] = SESIONES[clave] || [clave, 60];
        eventos.push({
          id: `mt_${serie}_${anio}_${carrera.round}_${clave}`,
          codigo: comp.codigo,
          competicion: comp.nombre,
          inicio,
          duracion,
          titulo: `${gp} · ${nombre}`,
          // Fecha u hora aún sin confirmar
          provisional: !!carrera.tbc,
        });
      }
    }
  }
  return eventos;
}

async function main() {
  const raiz = path.join(__dirname, "..");
  const salida = path.resolve(process.argv[2] || path.join(raiz, "motor.json"));
  const derechos = JSON.parse(fs.readFileSync(path.join(raiz, "derechos.json"), "utf-8"));
  const comps = (derechos.competiciones || []).filter(
    (c) => c.codigo && c.calendario && c.calendario.serie && Array.isArray(c.calendario.sesiones),
  );
  if (comps.length === 0) {
    console.log("derechos.json no tiene competiciones con calendario.");
    return;
  }

  // Si una serie falla se reutilizan sus eventos de la última versión, para no vaciar la agenda
  let anterior = [];
  try {
    anterior = JSON.parse(fs.readFileSync(salida, "utf-8")).eventos || [];
  } catch (e) {
    anterior = [];
  }

  let traducciones = {};
  try {
    const es = await leerJson(`${DATOS}/locales/es/localization.json`);
    traducciones = (es && es.All && es.All.races) || {};
  } catch (e) {
    console.log("Sin nombres en español:", e.message);
  }

  const ahora = Date.now();
  const desde = ahora - 24 * 3600 * 1000;
  const hasta = ahora + DIAS * 24 * 3600 * 1000;
  const anios = [...new Set([new Date(desde).getUTCFullYear(), new Date(hasta).getUTCFullYear()])];

  const eventos = [];
  for (const comp of comps) {
    const serie = String(comp.calendario.serie);
    if (!/^[a-z0-9-]+$/.test(serie)) continue;
    try {
      const temporadas = [];
      for (const anio of anios) temporadas.push([anio, await leerJson(`${DATOS}/_db/${serie}/${anio}.json`)]);
      const deSerie = eventosDeSerie(comp, temporadas, traducciones, desde, hasta);
      eventos.push(...deSerie);
      console.log(`${comp.nombre}: ${deSerie.length} sesiones.`);
    } catch (e) {
      const viejos = anterior.filter((ev) => ev.codigo === comp.codigo && ev.inicio >= desde);
      eventos.push(...viejos);
      console.log(`${comp.nombre}: error (${e.message}); se mantienen ${viejos.length} sesiones anteriores.`);
    }
  }
  eventos.sort((a, b) => a.inicio - b.inicio);

  // Sin cambios en las sesiones se conserva la fecha, para no publicar una versión nueva cada vez
  let actualizado = Date.now();
  try {
    const previo = JSON.parse(fs.readFileSync(salida, "utf-8"));
    if (JSON.stringify(previo.eventos) === JSON.stringify(eventos) && previo.actualizado) actualizado = previo.actualizado;
  } catch (e) {
    // primera vez
  }
  const json = {
    version: 1,
    actualizado,
    fuente: "F1 Calendar",
    fuenteWeb: "https://www.f1calendar.com",
    eventos,
  };
  fs.writeFileSync(salida, JSON.stringify(json, null, 1) + "\n", "utf-8");
  console.log(`motor.json: ${eventos.length} sesiones.`);
}

main().catch((e) => {
  console.error("Error generando motor.json:", e.message);
  process.exit(1);
});
