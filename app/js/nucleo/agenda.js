// Agenda deportiva: retransmisiones sacadas de la guía de programación de los canales en abierto,
// más los partidos (partidos.json) y las carreras de motor (motor.json) del calendario con las
// plataformas que tienen sus derechos (derechos.json). Sin dependencias del navegador.

import { sinAcentos } from './texto.js';

const ZONA = 'Europe/Madrid';
const MAX_CANALES = 4;
const MIN_DURACION = 15 * 60000;
const MAX_DURACION = 10 * 3600000;
const MARGEN_FUSION = 30 * 60000;
const DURACION_PARTIDO = 120 * 60000;
/** Solo se muestran escudos de este servidor. */
export const SERVIDOR_ESCUDOS = 'https://crests.football-data.org/';

/** Canales temáticos de deporte: casi todo lo que emiten es deporte. */
const CANAL_DEPORTIVO = /teledeporte|\btdp\b|esport ?3|deport|sport|real madrid|\bbarca\b|\bgol\b/;

/** Programas que no son retransmisiones aunque hablen de deporte. */
const NO_RETRANSMISION = new RegExp(
  'noticia|telediario|informativ|resumen|reportaje|documental|magazin|tertulia|' +
    'el tiempo|teletienda|cierre de emision|fin de emision|carta de ajuste|sorteo|' +
    'repeticion|diferido|reemision|lo mejor de|highlights|avance|previa|' +
    'estudio estadio|tablero deportivo|el dia despues|programacion|rueda de prensa|' +
    '^deportes \\d|estadio 2|juego de naciones|desmarque|partidazo|^la jornada$|' +
    'all the goals|the album|^origins|documentary|combates historicos|historia que tu hiciste|' +
    'esport club|3catinfo|zona zaping|^onze$|tot costa|liga bbva',
);

const DIRECTO = /\bdirecto\b|\ben vivo\b|\blive\b|retransmissio|en directe/;
const COMPETICION = new RegExp(
  'gran premio|\\betapa\\b|\\bfinal\\b|semifinal|cuartos de final|jornada|campeonato|mundial|' +
    'europeo|\\bcopa\\b|\\bliga\\b|\\bopen\\b|\\btorneo\\b|clasificacion|olimpic|' +
    '\\bvuelta\\b|\\btour\\b|\\bgiro\\b|\\bderbi\\b',
);
/** "Equipo A - Equipo B", "A vs B", "A contra B". */
const PARTIDO = /^(.{2,60}?)\s+(?:-|–|vs\.?|v\.|contra)\s+(.{2,60})$/i;
const PREFIJO = /^(.{3,50}?):\s+(.+)$/;

/** Deporte por palabras clave (de lo más concreto a lo más general). "" = no interesa. */
const DEPORTES = [
  [/motogp|moto ?gp|moto ?2|moto ?3|motociclismo|superbike|motocross/, 'Motociclismo'],
  [/formula ?1|\bf1\b|formula ?2|automovilismo|rally|\bwrc\b|indycar|nascar|\bdakar\b/, 'Automovilismo'],
  [/futbol americano|\bnfl\b/, 'Fútbol Americano'],
  [/futbol sala|futsal/, 'Fútbol Sala'],
  [/baloncesto|basket|basquet|\bnba\b|\bwnba\b|\bacb\b|euroliga|eurocup|liga endesa|lf endesa/, 'Baloncesto'],
  [/balonmano|handball|liga asobal|\behf\b/, 'Balonmano'],
  [
    /futbol|laliga|liga f\b|champions|europa league|conference league|copa del rey|copa de la reina|supercopa|nations league|\buefa\b|\bfifa\b|federacion|segunda division|hypermotion|seleccion/,
    'Fútbol',
  ],
  [/tenis|\batp\b|\bwta\b|copa davis|billie jean/, 'Tenis'],
  [/padel/, 'Pádel'],
  [/ciclismo|vuelta a espana|tour de francia|giro de italia|\betapa\b/, 'Ciclismo'],
  [/atletismo|maraton|\bmilla\b|cross\b/, 'Atletismo'],
  [/triatlon|duatlon/, 'Triatlón'],
  [/natacion|waterpolo|saltos de trampolin/, 'Natación'],
  [/voleibol|voley/, 'Voleibol'],
  [/rugby/, 'Rugby'],
  [/hockey/, 'Hockey'],
  [/golf/, 'Golf'],
  [/boxeo|\bufc\b|\bmma\b|artes marciales|judo|taekwondo|karate|lucha/, 'Deportes de combate'],
  [/\besqui\b|snowboard|patinaje/, 'Deportes de invierno'],
  [/gimnasia/, 'Gimnasia'],
  [/remo|piraguismo|vela\b|regata|surf/, 'Deportes acuáticos'],
  [/toros|tauromaquia|corrida/, ''],
];

/** Palabras que no identifican a un equipo ("Real Madrid CF" -> "madrid"). */
const RELLENO_EQUIPO = new Set([
  'club', 'futbol', 'football', 'real', 'deportivo', 'sporting', 'atletico', 'sociedad',
  'union', 'united', 'city', 'calcio', 'olympique', 'athletic', 'racing', 'cf', 'fc', 'cd',
  'ud', 'sd', 'rcd', 'ca', 'sc', 'ac', 'as', 'afc', 'de', 'del', 'la', 'el', 'b',
]);

function normalizar(s) {
  return sinAcentos(s).replace(/\s+/g, ' ').trim();
}

export function esCanalDeportivo(nombreCanal) {
  return CANAL_DEPORTIVO.test(normalizar(nombreCanal));
}

/** null si no se reconoce; "" si se reconoce pero no interesa. */
export function detectarDeporte(textoNormalizado) {
  for (const [re, deporte] of DEPORTES) if (re.test(textoNormalizado)) return deporte;
  return null;
}

/** "Equipo A - Equipo B", pero no "ALL THE GOALS - Pedri" (nombre de programa en mayúsculas). */
export function esPartido(titulo) {
  const m = PARTIDO.exec(String(titulo).trim());
  if (!m) return false;
  let local = m[1].trim();
  const pos = local.lastIndexOf(':');
  if (pos >= 0) local = local.slice(pos + 1).trim();
  return !(local === local.toUpperCase() && /[A-Z]{2}/.test(local));
}

export function esRetransmision(programa, canalDeportivo) {
  const dur = programa.fin - programa.inicio;
  if (dur < MIN_DURACION || dur > MAX_DURACION) return false;
  const t = normalizar(programa.titulo);
  if (!t || NO_RETRANSMISION.test(t)) return false;
  const cat = normalizar(programa.categoria);
  const categoriaDeporte = cat.includes('deport') || cat.includes('sport');
  const deporte = detectarDeporte(t + ' ' + cat);
  if (deporte === '') return false;
  const partido = esPartido(programa.titulo);
  const directo = DIRECTO.test(t);
  const competicion = COMPETICION.test(t);
  if (canalDeportivo) return deporte !== null || partido || directo || competicion;
  return (deporte !== null || categoriaDeporte) && (partido || directo || competicion);
}

const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });

/** "2026-10-06" en hora de Madrid. */
export function fechaDe(ms) {
  return fmtFecha.format(new Date(ms));
}

/** "21:00" en hora de Madrid. */
export function horaDe(ms) {
  return fmtHora.format(new Date(ms));
}

function crearEventoGuia(programa) {
  let titulo = programa.titulo.trim();
  let prefijo = null;
  const sep = PREFIJO.exec(titulo);
  if (sep) {
    prefijo = sep[1].trim();
    titulo = sep[2].trim();
  }
  let deporte = detectarDeporte(normalizar(programa.titulo + ' ' + programa.categoria));
  if (!deporte) deporte = 'Otros deportes';
  let competicion = null;
  if (prefijo) {
    // "Fútbol - LaLiga" -> "LaLiga"
    const p = prefijo.replace(/^[^-–]{2,25}\s[-–]\s/, '');
    if (normalizar(p) !== normalizar(deporte)) competicion = p;
  }
  const ev = {
    id: 'g' + programa.inicio.toString(36) + '_' + hash(normalizar(programa.titulo)),
    inicio: programa.inicio,
    fin: programa.fin,
    fecha: fechaDe(programa.inicio),
    hora: horaDe(programa.inicio),
    titulo,
    deporte,
    competicion: competicion || deporte,
    local: null,
    visitante: null,
    escudoLocal: null,
    escudoVisitante: null,
    estado: 'PENDIENTE',
    canales: [],
    plataformas: [],
  };
  const m = PARTIDO.exec(titulo);
  if (m) {
    ev.local = m[1].trim();
    ev.visitante = m[2].trim();
  }
  return ev;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/**
 * Eventos deportivos de la guía.
 * @param {Array<{canal: object, programas: Array}>} entradas cada canal con sus programas; si dos
 *   canales comparten emisión, el evento sale una vez con los dos.
 */
export function eventosDesdeGuia(entradas) {
  const porClave = new Map();
  for (const { canal, programas } of entradas) {
    if (!programas) continue;
    const tematico = esCanalDeportivo(canal.nombre);
    for (const p of programas) {
      if (!esRetransmision(p, tematico)) continue;
      const clave = p.inicio + '|' + normalizar(p.titulo);
      let ev = porClave.get(clave);
      if (!ev) {
        ev = crearEventoGuia(p);
        porClave.set(clave, ev);
      }
      if (ev.canales.length < MAX_CANALES && !ev.canales.includes(canal.id)) ev.canales.push(canal.id);
    }
  }
  return [...porClave.values()].sort(cronologico);
}

export function cronologico(a, b) {
  return a.inicio - b.inicio || a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base' });
}

/** Lee derechos.json: plataformas oficiales por competición y control de escudos. */
export function leerDerechos(json) {
  if (!json || typeof json !== 'object') return null;
  const plataformas = new Map();
  for (const [id, p] of Object.entries(json.plataformas || {})) {
    const web = String(p?.web || '').trim();
    const nombre = String(p?.nombre || '').trim();
    // Solo webs https oficiales: nunca enlaces a emisiones
    if (web.startsWith('https://') && nombre) plataformas.set(id, { id, nombre, web });
  }
  const competiciones = [];
  for (const c of json.competiciones || []) {
    const comp = {
      codigo: String(c.codigo || ''),
      nombre: String(c.nombre || ''),
      deporte: String(c.deporte || ''),
      alias: new Set([normalizar(c.nombre), ...(c.alias || []).map(normalizar)].filter(Boolean)),
      plataformas: (c.plataformas || []).map((id) => plataformas.get(id)).filter(Boolean),
    };
    if (comp.plataformas.length) competiciones.push(comp);
  }
  const escudos = json.escudos || {};
  const retirados = new Set(
    (escudos.retirados || []).map((v) => (/^\d+$/.test(String(v).trim()) ? String(v).trim() : normalizar(v))),
  );
  return {
    competiciones,
    escudosActivos: escudos.activos !== false,
    retirados,
  };
}

function buscarCompeticion(derechos, codigo, nombre) {
  return (
    (codigo && derechos.competiciones.find((c) => c.codigo === codigo)) ||
    derechos.competiciones.find((c) => c.alias.has(normalizar(nombre))) ||
    null
  );
}

/** URL del escudo si se puede mostrar (activos, no retirado y del servidor permitido). */
export function escudoPermitido(derechos, url, idEquipo, nombre) {
  if (!derechos || !derechos.escudosActivos || typeof url !== 'string' || !url.startsWith(SERVIDOR_ESCUDOS)) return null;
  if (idEquipo != null && derechos.retirados.has(String(idEquipo))) return null;
  if (nombre && derechos.retirados.has(normalizar(nombre))) return null;
  return url;
}

function palabrasEquipo(equipo) {
  return normalizar(equipo)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !RELLENO_EQUIPO.has(w));
}

function mismosEquipos(ev, partido) {
  const palabras = new Set(normalizar(`${ev.titulo} ${ev.local || ''} ${ev.visitante || ''}`).split(/[^a-z0-9]+/));
  const contiene = (equipo) => palabrasEquipo(equipo).some((w) => palabras.has(w));
  return contiene(partido.local) && contiene(partido.visitante);
}

function estadoDe(e) {
  if (['IN_PLAY', 'PAUSED', 'LIVE'].includes(e)) return 'EN_DIRECTO';
  if (['FINISHED', 'AWARDED'].includes(e)) return 'FINALIZADO';
  return 'PENDIENTE';
}

function anadirPlataformas(ev, plataformas) {
  for (const p of plataformas) if (!ev.plataformas.some((x) => x.id === p.id)) ev.plataformas.push(p);
}

/**
 * Añade las plataformas de pago: los eventos de la guía cuya competición tiene derechos las reciben,
 * y cada partido del calendario se fusiona con su evento de la guía (misma hora ±30 min y mismos
 * equipos) o se añade como evento nuevo sin canales en abierto. Las carreras de motor se fusionan
 * con la emisión de la guía de su competición a la misma hora (±30 min) o se añaden igual.
 */
export function combinarConCalendario(eventos, derechos, partidosJson, motorJson) {
  const r = [...eventos];
  if (!derechos) return r;
  for (const ev of eventos) {
    const c = buscarCompeticion(derechos, null, ev.competicion);
    if (c) anadirPlataformas(ev, c.plataformas);
  }
  for (const p of partidosJson?.partidos || []) {
    if (!p || !p.inicio || !p.local || !p.visitante) continue;
    const c = buscarCompeticion(derechos, p.codigo, p.competicion);
    if (!c) continue;
    const escLocal = escudoPermitido(derechos, p.escudoLocal, p.localId, p.local);
    const escVisit = escudoPermitido(derechos, p.escudoVisitante, p.visitanteId, p.visitante);
    const igual = eventos.find((ev) => Math.abs(ev.inicio - p.inicio) <= MARGEN_FUSION && mismosEquipos(ev, p));
    if (igual) {
      anadirPlataformas(igual, c.plataformas);
      igual.escudoLocal ||= escLocal;
      igual.escudoVisitante ||= escVisit;
      continue;
    }
    r.push({
      id: String(p.id || `p${p.inicio}`),
      inicio: p.inicio,
      fin: p.inicio + DURACION_PARTIDO,
      fecha: fechaDe(p.inicio),
      hora: horaDe(p.inicio),
      titulo: `${p.local} - ${p.visitante}`,
      deporte: c.deporte || 'Fútbol',
      competicion: c.nombre || p.competicion,
      local: p.local,
      visitante: p.visitante,
      escudoLocal: escLocal,
      escudoVisitante: escVisit,
      estado: estadoDe(p.estado),
      canales: [],
      plataformas: [...c.plataformas],
    });
  }
  for (const m of motorJson?.eventos || []) {
    if (!m || !m.inicio || !m.titulo) continue;
    const c = buscarCompeticion(derechos, m.codigo, m.competicion);
    if (!c) continue;
    const igual = eventos.find(
      (ev) => Math.abs(ev.inicio - m.inicio) <= MARGEN_FUSION && buscarCompeticion(derechos, null, ev.competicion) === c,
    );
    if (igual) continue; // ya tiene las plataformas de su competición
    const duracion = Math.min(Math.max(Number(m.duracion) || 60, 15), 300) * 60000;
    r.push({
      id: String(m.id || `m${m.inicio}`),
      inicio: m.inicio,
      fin: m.inicio + duracion,
      fecha: fechaDe(m.inicio),
      hora: horaDe(m.inicio),
      titulo: String(m.titulo),
      deporte: c.deporte || 'Automovilismo',
      competicion: c.nombre || m.competicion,
      estado: 'PENDIENTE',
      canales: [],
      plataformas: [...c.plataformas],
    });
  }
  return r.sort(cronologico);
}

/** Palabras que no cuentan para las iniciales de un equipo. */
const CONECTORES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'cf', 'fc', 'cd', 'ud', 'sd', 'rcd', 'sad', 'club']);

/** Iniciales para un equipo sin escudo: "Real Madrid" -> "RM", "Getafe CF" -> "GE". */
export function iniciales(nombre) {
  const palabras = normalizar(nombre)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !CONECTORES.has(w));
  if (!palabras.length) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}
