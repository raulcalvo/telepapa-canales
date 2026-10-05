/**
 * agenda_publica.js
 *
 * Genera agenda.json para la app pública TelePapa (com.raulcalvo.telepapa.app), sin Firebase:
 * 1. Descarga la programación deportiva (misma fuente y parser que actualizar_agenda.js)
 * 2. La completa con TheSportsDB (escudos) y la guía XMLTV (canales)
 * 3. Escribe los eventos de hoy en adelante con los NOMBRES de canal tal como los da la web.
 *    El emparejamiento con canales lo hace la app en el dispositivo, solo contra canales públicos.
 *
 * Uso: node agenda_publica.js [ruta_salida]   (por defecto ../agenda.json)
 */

const fs = require("fs");
const path = require("path");
const {
  DEFAULT_AGENDA_URL,
  parseHtmlFutbolEnLaTv,
  normalizarNombreCanal,
  obtenerEventosTheSportsDb,
  obtenerEventosEpg,
  getMadridTimestamp,
  formatearFechaLegible,
  estimarDuracionMinutos,
} = require("./actualizar_agenda");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TelePapa/1.0";

const SECCIONES = [
  "https://www.futbolenlatv.es/deporte/motociclismo",
  "https://www.futbolenlatv.es/deporte/automovilismo",
];

async function descargar(url, timeoutMs) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.text();
}

function mismoEvento(a, b) {
  return a.fecha === b.fecha && (a.titulo || "").toLowerCase() === (b.titulo || "").toLowerCase();
}

function urlOVacio(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null;
}

async function main() {
  const salida = path.resolve(process.argv[2] || path.join(__dirname, "..", "agenda.json"));
  const agendaUrl = (process.env.AGENDA_URL || "").trim() || DEFAULT_AGENDA_URL;
  console.log(`Agenda pública: descargando ${agendaUrl}...`);

  const eventosWeb = parseHtmlFutbolEnLaTv(await descargar(agendaUrl, 30000));
  console.log(`Eventos de la web general: ${eventosWeb.length}`);

  for (const url of SECCIONES) {
    try {
      let nuevos = 0;
      for (const ev of parseHtmlFutbolEnLaTv(await descargar(url, 20000))) {
        if (!eventosWeb.some((w) => mismoEvento(w, ev))) {
          eventosWeb.push(ev);
          nuevos++;
        }
      }
      console.log(`Eventos añadidos desde ${url}: ${nuevos}`);
    } catch (e) {
      console.warn(`Aviso en ${url}:`, e.message);
    }
  }

  if (eventosWeb.length === 0) {
    // Sin eventos no se sobrescribe la agenda anterior
    console.error("ERROR: no se encontraron eventos; se mantiene la agenda publicada.");
    process.exit(1);
  }

  const fechas = [...new Set(eventosWeb.map((e) => e.fecha))].filter(Boolean);

  try {
    for (const sdb of await obtenerEventosTheSportsDb(fechas)) {
      const sdbNorm = normalizarNombreCanal(sdb.titulo);
      const match = eventosWeb.find((w) => {
        if (w.fecha !== sdb.fecha) return false;
        const wNorm = normalizarNombreCanal(w.titulo);
        if (wNorm === sdbNorm) return true;
        if (sdb.equipoLocal && sdb.equipoVisitante) {
          return wNorm.includes(normalizarNombreCanal(sdb.equipoLocal))
            && wNorm.includes(normalizarNombreCanal(sdb.equipoVisitante));
        }
        return false;
      });
      if (match) {
        if (!match.imagenLocal && sdb.imagenLocal) match.imagenLocal = sdb.imagenLocal;
        if (!match.imagenVisitante && sdb.imagenVisitante) match.imagenVisitante = sdb.imagenVisitante;
      } else {
        eventosWeb.push(sdb);
      }
    }
  } catch (e) {
    console.warn("Aviso TheSportsDB:", e.message);
  }

  try {
    for (const epg of await obtenerEventosEpg(fechas)) {
      const epgNorm = normalizarNombreCanal(epg.titulo);
      const match = eventosWeb.find((w) => {
        if (w.fecha !== epg.fecha) return false;
        const wNorm = normalizarNombreCanal(w.titulo);
        return wNorm === epgNorm || (wNorm.length > 5 && epgNorm.includes(wNorm)) || (epgNorm.length > 5 && wNorm.includes(epgNorm));
      });
      if (match) {
        for (const ch of epg.canalesWeb) if (!match.canalesWeb.includes(ch)) match.canalesWeb.push(ch);
      } else {
        eventosWeb.push(epg);
      }
    }
  } catch (e) {
    console.warn("Aviso EPG:", e.message);
  }

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const eventos = eventosWeb
    .filter((ew) => ew.fecha && ew.fecha >= hoy && ew.titulo)
    .map((ew) => {
      let timestamp = getMadridTimestamp(ew.fecha, ew.hora);
      if (typeof timestamp !== "number" || isNaN(timestamp)) timestamp = 0;
      return {
        id: "",
        fecha: ew.fecha,
        fechaDisplay: ew.fechaDisplay || formatearFechaLegible(ew.fecha),
        hora: ew.hora || "",
        timestamp,
        duracionMinutos: estimarDuracionMinutos(ew.deporte, ew.competicion, ew.titulo) || 120,
        deporte: ew.deporte || "",
        competicion: ew.competicion || "",
        titulo: ew.titulo,
        equipoLocal: ew.equipoLocal || "",
        equipoVisitante: ew.equipoVisitante || "",
        imagenLocal: urlOVacio(ew.imagenLocal),
        imagenVisitante: urlOVacio(ew.imagenVisitante),
        iconoDeporte: urlOVacio(ew.iconoDeporte),
        canales: [...new Set((ew.canalesWeb || []).filter(Boolean))],
      };
    })
    .sort((a, b) => (a.timestamp - b.timestamp) || a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));

  eventos.forEach((ev, i) => {
    ev.id = `ev_${String(i).padStart(5, "0")}`;
  });

  const json = { version: 1, actualizado: Date.now(), eventos };
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(json) + "\n", "utf-8");
  console.log(`Agenda pública escrita en ${salida}: ${eventos.length} eventos.`);
}

main().catch((err) => {
  console.error("Excepción en agenda_publica:", err);
  process.exit(1);
});
