/**
 * partidos.js
 *
 * Genera partidos.json con el calendario de las competiciones de derechos.json que tienen código
 * de football-data.org (https://www.football-data.org), para la agenda de la app TelePapa.
 * Solo equipos, fecha y competición: la app añade la plataforma oficial con derechos.json.
 *
 * Uso: FOOTBALL_DATA_TOKEN=... node tools/partidos.js [salida]   (por defecto ./partidos.json)
 */

const fs = require("fs");
const path = require("path");

const DIAS = 7;
const API = "https://api.football-data.org/v4/matches";

function https(u) {
  return typeof u === "string" && u.startsWith("https://") ? u : null;
}

async function main() {
  const token = (process.env.FOOTBALL_DATA_TOKEN || "").trim();
  if (!token) {
    console.log("Sin FOOTBALL_DATA_TOKEN: no se genera partidos.json.");
    return;
  }
  const raiz = path.join(__dirname, "..");
  const salida = path.resolve(process.argv[2] || path.join(raiz, "partidos.json"));
  const derechos = JSON.parse(fs.readFileSync(path.join(raiz, "derechos.json"), "utf-8"));
  const competiciones = new Map();
  // Las competiciones con "calendario" son de motor (tools/motor.js), no de football-data.org
  for (const c of derechos.competiciones || []) if (c.codigo && !c.calendario) competiciones.set(c.codigo, c);
  if (competiciones.size === 0) {
    console.log("derechos.json no tiene competiciones con código.");
    return;
  }

  const hoy = new Date();
  const hasta = new Date(hoy.getTime() + DIAS * 24 * 3600 * 1000);
  const fecha = (d) => d.toISOString().slice(0, 10);
  const url = `${API}?competitions=${[...competiciones.keys()].join(",")}&dateFrom=${fecha(hoy)}&dateTo=${fecha(hasta)}`;

  const res = await fetch(url, {
    headers: { "X-Auth-Token": token },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`football-data.org respondió HTTP ${res.status}`);
  const data = await res.json();

  const partidos = [];
  for (const m of data.matches || []) {
    const comp = competiciones.get(m.competition && m.competition.code);
    const inicio = Date.parse(m.utcDate);
    if (!comp || isNaN(inicio)) continue;
    if (m.status === "CANCELLED" || m.status === "POSTPONED") continue;
    const local = (m.homeTeam && (m.homeTeam.shortName || m.homeTeam.name)) || "";
    const visitante = (m.awayTeam && (m.awayTeam.shortName || m.awayTeam.name)) || "";
    if (!local || !visitante) continue;
    partidos.push({
      id: `fd_${m.id}`,
      codigo: comp.codigo,
      competicion: comp.nombre,
      inicio,
      local,
      visitante,
      localId: (m.homeTeam && m.homeTeam.id) || null,
      visitanteId: (m.awayTeam && m.awayTeam.id) || null,
      // Dirección del escudo que da football-data.org (no se copian imágenes a esta web)
      escudoLocal: https((m.homeTeam && m.homeTeam.crest) || ""),
      escudoVisitante: https((m.awayTeam && m.awayTeam.crest) || ""),
      jornada: m.matchday || null,
      estado: m.status || "",
    });
  }
  partidos.sort((a, b) => a.inicio - b.inicio);

  const json = {
    version: 1,
    actualizado: Date.now(),
    fuente: "football-data.org",
    fuenteWeb: "https://www.football-data.org",
    partidos,
  };
  fs.writeFileSync(salida, JSON.stringify(json, null, 1) + "\n", "utf-8");
  console.log(`partidos.json: ${partidos.length} partidos.`);
}

main().catch((e) => {
  console.error("Error generando partidos.json:", e.message);
  process.exit(1);
});
