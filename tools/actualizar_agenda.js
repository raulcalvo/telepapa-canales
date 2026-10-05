/**
 * actualizar_agenda.js
 * 
 * Script desatendido para actualizar la agenda deportiva de TelePapa:
 * 1. Descarga la programación web desde futbolenlatv.es/deporte
 * 2. Carga los canales del usuario desde Firebase Realtime Database (/canales y /admin/m3u_lists)
 * 3. Empareja los canales de cada evento usando la API de Gemini (o fallback heurístico local)
 * 4. Guarda los eventos ordenados cronológicamente en Firebase (/agenda/eventos)
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_AGENDA_URL = "https://www.futbolenlatv.es/deporte";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const DEFAULT_DATABASE_URL = "https://telepapa-default-rtdb.europe-west1.firebasedatabase.app";

const GEMINI_FREE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const NVIDIA_FREE_MODELS = [
  "meta/llama-3.3-70b-instruct",
  "mistralai/mistral-large-2407",
];



// ==========================================
// 1. INICIALIZACIÓN DE FIREBASE ADMIN SDK
// ==========================================
function inicializarFirebase() {
  // Carga diferida: agenda_publica.js reutiliza este fichero sin Firebase
  const admin = require("firebase-admin");
  let serviceAccount = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    try {
      if (raw.startsWith("{")) {
        serviceAccount = JSON.parse(raw);
      } else {
        // Posible codificación en Base64
        const decoded = Buffer.from(raw, "base64").toString("utf-8");
        serviceAccount = JSON.parse(decoded);
      }
    } catch (e) {
      console.error("Error parseando FIREBASE_SERVICE_ACCOUNT:", e.message);
      process.exit(1);
    }
  } else {
    // Buscar archivo local para ejecución manual o en VPS
    const posiblesRutas = [
      path.join(__dirname, "serviceAccountKey.json"),
      path.join(__dirname, "..", "serviceAccountKey.json"),
    ];
    for (const r of posiblesRutas) {
      if (fs.existsSync(r)) {
        try {
          serviceAccount = JSON.parse(fs.readFileSync(r, "utf-8"));
          console.log(`Usando credenciales locales desde: ${r}`);
          break;
        } catch (ignored) {}
      }
    }
  }

  if (!serviceAccount) {
    console.error("ERROR: No se proporcionaron credenciales de Firebase.");
    console.error("Configura el secret FIREBASE_SERVICE_ACCOUNT en GitHub o crea serviceAccountKey.json localmente.");
    process.exit(1);
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: databaseURL,
  });

  console.log("Firebase Admin SDK inicializado correctamente.");
  return admin.database();
}

// ==========================================
// 2. UTILIDADES DE PARSING Y DECODIFICACIÓN
// ==========================================
function decodificarHtml(str) {
  if (!str) return "";
  let s = str.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .trim();
}

function normalizarDeporteYCompeticion(rawDeporte, rawCompeticion) {
  let dep = (rawDeporte || "").trim();
  let comp = (rawCompeticion || "").trim();

  const depLower = dep.toLowerCase();
  const compLower = comp.toLowerCase();

  // Motociclismo
  const esMoto = /motogp|moto2|moto3|motociclismo|superbike|sportbike|supersport|worldwcr|motocross|enduro|trial/i;
  if (esMoto.test(depLower) || esMoto.test(compLower)) {
    if (!comp || comp.toLowerCase() === "motociclismo") {
      comp = dep && dep.toLowerCase() !== "motociclismo" ? dep : "MotoGP";
    }
    dep = "Motociclismo";
    return { deporte: dep, competicion: comp };
  }

  // Automovilismo
  const esAuto = /automovilismo|f[oó]rmula\s*1|formula1|f1|f[oó]rmula\s*2|f2|indycar|nascar|rally|wrc|dtm|wec|f1\s*academy|horas\s*de|qatar\s*1812/i;
  if (esAuto.test(depLower) || esAuto.test(compLower)) {
    if (!comp || comp.toLowerCase() === "automovilismo") {
      comp = dep && dep.toLowerCase() !== "automovilismo" ? dep : "Fórmula 1";
    }
    dep = "Automovilismo";
    return { deporte: dep, competicion: comp };
  }

  // Fútbol Americano
  if (/f[uú]tbol\s*americano|nfl/i.test(depLower)) {
    return { deporte: "Fútbol Americano", competicion: comp || "NFL" };
  }

  // Fútbol Sala
  if (/f[uú]tbol\s*sala/i.test(depLower) || /futsal/i.test(depLower)) {
    return { deporte: "Fútbol Sala", competicion: comp || "Primera División Futsal" };
  }

  // Fútbol
  if (/f[uú]tbol/i.test(depLower) || /soccer/i.test(depLower)) {
    return { deporte: "Fútbol", competicion: comp || "Fútbol" };
  }

  // Baloncesto
  if (/baloncesto|basket|nba|acb|euroliga/i.test(depLower)) {
    if (!comp || comp.toLowerCase() === "baloncesto") {
      comp = dep && dep.toLowerCase() !== "baloncesto" ? dep : "Liga Endesa";
    }
    return { deporte: "Baloncesto", competicion: comp };
  }

  // Tenis
  if (/tenis|tennis|atp|wta/i.test(depLower)) {
    if (!comp || comp.toLowerCase() === "tenis") {
      comp = dep && dep.toLowerCase() !== "tenis" ? dep : "ATP";
    }
    return { deporte: "Tenis", competicion: comp };
  }

  // Ciclismo
  if (/ciclismo|cycling|tour|vuelta|giro/i.test(depLower)) {
    return { deporte: "Ciclismo", competicion: comp || "Ciclismo" };
  }

  // Pádel
  if (/p[aá]del/i.test(depLower)) {
    return { deporte: "Pádel", competicion: comp || "Premier Padel" };
  }

  return { deporte: dep || "Otros Deportes", competicion: comp || dep || "Otros" };
}

function limpiarNombreCanalWeb(rawName) {
  if (!rawName) return "";
  return rawName
    .replace(/:\s*ver\s*(partido)?/gi, "")
    .replace(/\s*\(s[íi]guelo en directo\)/gi, "")
    .replace(/\s*\(ver en directo\)/gi, "")
    .replace(/\s*\(ver gratis\)/gi, "")
    .replace(/\s*\(acceder\)/gi, "")
    .replace(/\s*\(registrarse\)/gi, "")
    .trim();
}

function esCanalDescartable(rawName) {
  if (!rawName || !rawName.trim()) return true;
  const s = rawName.toLowerCase().trim();

  // Descartar streams web y redes sociales (no son canales lineales de TV sintonizables)
  if (
    s.includes("youtube") ||
    s.includes("twitch") ||
    s.includes("facebook live") ||
    s.includes("twitter") ||
    s.includes("por confirmar") ||
    s.includes("web directo") ||
    s.includes("replay")
  ) {
    return true;
  }

  if (
    /.*dazn\s*(app\s*gratis)?\s*\(ver\s*(en directo|gratis)\).*/i.test(s) ||
    s === "dazn" ||
    s === "dazn app gratis" ||
    s === "dazn app" ||
    s === "dazn ver en directo" ||
    s === "dazn ver gratis"
  ) {
    return true;
  }

  if (
    s.includes("(ver en directo)") ||
    s.includes("(ver gratis)") ||
    s.includes("(acceder)") ||
    s.includes("(registrarse)")
  ) {
    const base = limpiarNombreCanalWeb(rawName).toLowerCase().trim();
    if (base === "dazn" || base === "fanatiz" || base === "amazon prime video" || base === "") {
      return true;
    }
  }

  return false;
}

function normalizarNombreCanal(raw) {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();

  // Eliminar contenido entre corchetes y paréntesis (calidades, codecs, diales de operador como M72, O110, etc.)
  s = s.replace(/\[[^\]]*\]/g, " ").replace(/\([^\)]*\)/g, " ");

  // Decodificar entidades HTML si las hubiera
  s = s.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

  // Limpiar sufijos o tags habituales de listas IPTV y webs
  s = s.replace(/\b(4k|uhd|fhd|hd|sd|fps|\d+fps|hevc|h\.?264|h\.?265|x264|x265|avc)\b/gi, " ");
  s = s.replace(/\b\d{3,4}p?\b/gi, " ");
  s = s.replace(/\b(new loop|backup|directo|canal|television|en vivo)\b/gi, " ");
  s = s.replace(/\b(es|spa|esp|multi|feed)\b/gi, " ");
  s = s.replace(/[-_./,+]/g, " ");
  s = s.replace(/#/g, " ");

  // Normalizaciones de marcas y nombres
  s = s.replace(/\bpor movistar plus\+?\b/gi, " ");
  s = s.replace(/\bmovistar\s*plus\+?\b/gi, "m+");
  s = s.replace(/\bmovistar\+?\b/gi, "m+");
  s = s.replace(/\bformula\s*1\b/gi, "f1");
  s = s.replace(/\bdanz\b/gi, "dazn");

  // TDP <-> Teledeporte
  s = s.replace(/\btdp\b/gi, "teledeporte");

  // TVE 1 / La 1 / TVE 2 / La 2
  s = s.replace(/\btve\s*1\b/gi, "la 1");
  s = s.replace(/\btve\s*2\b/gi, "la 2");

  // RMTV <-> Real Madrid TV
  s = s.replace(/\brmtv\b/gi, "real madrid tv");

  // GOL PLAY <-> GOL
  s = s.replace(/\bgol\s*play\b/gi, "gol");

  // Unificar espacios
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function extraerNumeroDial(rawName) {
  if (!rawName) return null;
  let s = rawName.toLowerCase();

  // Eliminar contenido en paréntesis o corchetes que suele contener diales de operador (ej: M72, O110, 1080p, etc.)
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/[-_./,+]/g, " ");
  s = s.replace(/\b\d{3,4}p?\b/gi, " ");
  s = s.replace(/\b(4k|uhd|fhd|hd|sd|fps|\d+fps|hevc|h264|h265|x264|x265)\b/gi, " ");
  s = s.replace(/\bf1\b/gi, " ").replace(/\bformula\s*1\b/gi, " ");

  // 1. Temático + número (ej: dazn 1, laliga 2, campeones 2, deportes 1, vamos 2, eurosport 1)
  const matchClave = s.match(/(?:dazn|laliga|campeones|deportes|vamos|eurosport|gol|orange f[uú]tbol|liga)\s*(\d{1,2})\b/i);
  if (matchClave) return matchClave[1];

  // 2. Prefijo M (ej: laligatvm2 -> 2)
  const matchM = s.match(/\bm(\d{1,2})\b/i);
  if (matchM) return matchM[1];

  // 3. Número aislado al final o delimitado (1 a 16)
  const matchAislado = s.match(/\b(\d{1,2})\b/);
  if (matchAislado) {
    const n = parseInt(matchAislado[1], 10);
    if (n >= 1 && n <= 16) return String(n);
  }

  return null;
}

function sonCanalesCoincidentes(rawWeb, rawUser) {
  if (!rawWeb || !rawUser || !rawWeb.trim() || !rawUser.trim()) return false;

  const normWeb = normalizarNombreCanal(rawWeb);
  const normUser = normalizarNombreCanal(rawUser);

  if (!normWeb || !normUser) return false;

  const cleanWeb = normWeb.replace(/[^a-z0-9]/g, "");
  const cleanUser = normUser.replace(/[^a-z0-9]/g, "");

  if (cleanWeb === cleanUser) return true;

  const dialWeb = extraerNumeroDial(rawWeb);
  const dialUser = extraerNumeroDial(rawUser);

  if (dialWeb !== null || dialUser !== null) {
    if (dialWeb !== dialUser) return false;
  }

  if (cleanWeb === "dazn" && cleanUser !== "dazn") return false;
  if (cleanUser === "dazn" && cleanWeb !== "dazn") return false;

  if (cleanWeb === "eurosport" && cleanUser !== "eurosport") return false;
  if (cleanUser === "eurosport" && cleanWeb !== "eurosport") return false;

  const isTeledeporteWeb = cleanWeb.includes("teledeporte");
  const isTeledeporteUser = cleanUser.includes("teledeporte");
  if (isTeledeporteWeb !== isTeledeporteUser) {
    return false;
  }

  const qualifiers = [
    "f1", "laliga", "campeones", "ligadecampeones", "baloncesto",
    "golf", "deportes", "vamos", "ellas", "bar", "hypermotion", "motogp",
    "la1", "la2", "realmadrid", "etb1", "esport3"
  ];
  for (const q of qualifiers) {
    const webHas = cleanWeb.includes(q);
    const userHas = cleanUser.includes(q);
    if (webHas !== userHas) return false;
  }

  return cleanUser.includes(cleanWeb) || cleanWeb.includes(cleanUser);
}

function matchCanalesHeuristico(webChannels, canalesDisponibles) {
  const result = {};
  if (!webChannels || !canalesDisponibles) return result;

  for (const wc of webChannels) {
    const cleanWeb = limpiarNombreCanalWeb(wc);
    if (esCanalDescartable(cleanWeb)) continue;

    const matches = [];
    for (let i = 0; i < canalesDisponibles.length; i++) {
      const c = canalesDisponibles[i];
      if (!c || !c.nombre) continue;
      if (sonCanalesCoincidentes(cleanWeb, c.nombre)) {
        matches.push(i);
      }
    }
    if (matches.length > 0) {
      result[wc] = matches;
    }
  }
  return result;
}

function estimarDuracionMinutos(deporte, competicion, titulo) {
  const dep = (deporte || "").toLowerCase();
  const comp = (competicion || "").toLowerCase();
  const tit = (titulo || "").toLowerCase();

  if (dep.includes("fútbol") || dep.includes("futbol")) return 120;
  if (dep.includes("baloncesto") || dep.includes("basket") || comp.includes("nba") || comp.includes("acb")) return 135;
  if (dep.includes("motor") || dep.includes("f1") || dep.includes("fórmula 1") || dep.includes("motogp")) return 150;
  if (dep.includes("tenis") || dep.includes("padel") || dep.includes("pádel")) return 180;
  if (dep.includes("ciclismo") || comp.includes("tour") || comp.includes("vuelta") || comp.includes("giro")) return 240;
  if (dep.includes("golf")) return 300;
  if (dep.includes("boxeo") || dep.includes("mma") || dep.includes("ufc") || dep.includes("lucha")) return 210;
  if (dep.includes("rugby") || dep.includes("fútbol americano") || comp.includes("nfl")) return 160;
  if (dep.includes("balonmano") || dep.includes("voleibol") || dep.includes("waterpolo")) return 110;
  if (dep.includes("béisbol") || dep.includes("beisbol") || comp.includes("mlb")) return 200;

  return 120;
}

function formatearFechaLegible(fechaIso) {
  try {
    if (!fechaIso || typeof fechaIso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
      return fechaIso || "";
    }
    const [y, m, d] = fechaIso.split("-").map((v) => parseInt(v, 10));
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0));
    if (isNaN(date.getTime())) return fechaIso;
    const formatter = new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Madrid",
    });
    const str = formatter.format(date);
    return str.charAt(0).toUpperCase() + str.slice(1);
  } catch (e) {
    return fechaIso || "";
  }
}

function getMadridTimestamp(fechaIso, hora) {
  try {
    let y = 2026, m = 1, d = 1;
    if (fechaIso && typeof fechaIso === "string") {
      const parts = fechaIso.split("-").map((v) => parseInt(v, 10));
      if (!isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        y = parts[0];
        m = parts[1];
        d = parts[2];
      }
    }

    let h = 0, min = 0;
    if (hora && typeof hora === "string") {
      const match = hora.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        h = parseInt(match[1], 10);
        min = parseInt(match[2], 10);
      }
    }

    // Calcular con precisión el offset de Europe/Madrid para esa fecha/hora
    const refDate = new Date(Date.UTC(y, m - 1, d, h, min));
    if (isNaN(refDate.getTime())) {
      return Date.now();
    }

    const invdate = new Date(refDate.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
    if (isNaN(invdate.getTime())) {
      return refDate.getTime();
    }

    const diff = refDate.getTime() - invdate.getTime();
    const finalTs = refDate.getTime() + diff;
    return isNaN(finalTs) ? Date.now() : finalTs;
  } catch (e) {
    return Date.now();
  }
}


// ==========================================
// 3. DESCARGA Y PARSING DE M3U/JSON Y CANALES
// ==========================================
function parsearCanalesDeTexto(text, url, defaultSourceName, nombresVistos, canales) {
  if (!text || !text.trim()) return;
  const trimmed = text.trim();
  const isJson = (url && url.toLowerCase().endsWith(".json")) || trimmed.startsWith("{") || trimmed.startsWith("[");

  if (isJson) {
    try {
      if (trimmed.startsWith("{")) {
        const root = JSON.parse(trimmed);
        if (root.countries && Array.isArray(root.countries)) {
          // Formato TDTChannels (countries -> ambits -> channels -> options)
          for (const country of root.countries) {
            const isSpain = /españa|spain/i.test(country.name || "");
            if (root.countries.length > 1 && !isSpain) continue;
            if (country.ambits && Array.isArray(country.ambits)) {
              for (const ambit of country.ambits) {
                if (ambit.channels && Array.isArray(ambit.channels)) {
                  for (const ch of ambit.channels) {
                    const name = ch.name ? ch.name.trim() : "";
                    const logo = ch.logo ? ch.logo.trim() : "";
                    let streamUrl = "";
                    if (ch.options && Array.isArray(ch.options)) {
                      for (const opt of ch.options) {
                        if (opt && opt.url && opt.url.trim().startsWith("http")) {
                          streamUrl = opt.url.trim();
                          break;
                        }
                      }
                    }
                    if (name && streamUrl) {
                      const clave = `${name.toLowerCase()}|${streamUrl}`;
                      if (!nombresVistos.has(clave)) {
                        nombresVistos.add(clave);
                        canales.push({
                          id: String(canales.length),
                          nombre: name,
                          url: streamUrl,
                          source: defaultSourceName || "TDTChannels",
                          logo: logo,
                        });
                      }
                    }
                  }
                }
              }
            }
          }
          return;
        }
        if (root.channels && Array.isArray(root.channels)) {
          for (const c of root.channels) {
            const name = (c.name || c.nombre || c.title || "").trim();
            const streamUrl = (c.url || c.stream || c.uri || "").trim();
            const logo = (c.logo || c.icon || "").trim();
            if (name && streamUrl) {
              const clave = `${name.toLowerCase()}|${streamUrl}`;
              if (!nombresVistos.has(clave)) {
                nombresVistos.add(clave);
                canales.push({
                  id: String(canales.length),
                  nombre: name,
                  url: streamUrl,
                  source: defaultSourceName || "JSON",
                  logo: logo,
                });
              }
            }
          }
          return;
        }
      } else if (trimmed.startsWith("[")) {
        const arr = JSON.parse(trimmed);
        for (const c of arr) {
          const name = (c.name || c.nombre || c.title || "").trim();
          const streamUrl = (c.url || c.stream || c.uri || "").trim();
          const logo = (c.logo || c.icon || "").trim();
          if (name && streamUrl) {
            const clave = `${name.toLowerCase()}|${streamUrl}`;
            if (!nombresVistos.has(clave)) {
              nombresVistos.add(clave);
              canales.push({
                id: String(canales.length),
                nombre: name,
                url: streamUrl,
                source: defaultSourceName || "JSON",
                logo: logo,
              });
            }
          }
        }
        return;
      }
    } catch (e) {
      console.warn(`Error parseando lista JSON (${defaultSourceName}):`, e.message);
    }
  }

  // Parseo formato M3U / M3U8
  const lines = trimmed.split(/\r?\n/);
  let tempName = "Canal Desconocido";
  let tempLogo = "";

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const logoMatch = line.match(/tvg-logo=["']([^"']+)["']/i);
      tempLogo = logoMatch ? logoMatch[1] : "";
      const idx = line.lastIndexOf(",");
      if (idx !== -1 && idx < line.length - 1) {
        tempName = line.substring(idx + 1).trim();
      }
    } else if (!line.startsWith("#")) {
      const clave = `${tempName.toLowerCase()}|${line}`;
      if (!nombresVistos.has(clave)) {
        nombresVistos.add(clave);
        canales.push({
          id: String(canales.length),
          nombre: tempName,
          url: line,
          source: defaultSourceName || "M3U",
          logo: tempLogo,
        });
      }
      tempName = "Canal Desconocido";
      tempLogo = "";
    }
  }
}

async function cargarCanalesDisponibles(db) {
  console.log("Cargando canales desde Firebase Realtime Database y listas configuradas...");
  const canales = [];
  const nombresVistos = new Set();

  // 1. Canales manuales o guardados en /canales
  try {
    const snapshotCanales = await db.ref("canales").once("value");
    if (snapshotCanales.exists()) {
      snapshotCanales.forEach((child) => {
        const c = child.val();
        if (c && c.nombre && c.url) {
          const clave = `${c.nombre.toLowerCase()}|${c.url}`;
          if (!nombresVistos.has(clave)) {
            nombresVistos.add(clave);
            canales.push({
              id: child.key || String(canales.length),
              nombre: c.nombre.trim(),
              url: c.url.trim(),
              source: c.source || "Firebase",
              logo: c.logo || "",
            });
          }
        }
      });
    }
  } catch (e) {
    console.warn("Aviso al leer /canales:", e.message);
  }

  // 2. Listas M3U y JSON configuradas en /admin/m3u_lists
  const listas = [];
  try {
    const snapshotM3u = await db.ref("admin/m3u_lists").once("value");
    if (snapshotM3u.exists()) {
      snapshotM3u.forEach((child) => {
        const item = child.val();
        if (item && item.url) {
          listas.push(item);
        }
      });
    }
  } catch (e) {
    console.warn("Aviso al leer /admin/m3u_lists:", e.message);
  }

  // Si no hay listas configuradas o faltan las de España (TDTChannels y iptv-org), incluirlas como base y persistirlas en Firebase
  const listasRecomendadasEspana = [
    { nombre: "TDTChannels España (JSON)", url: "https://www.tdtchannels.com/lists/tv.json" },
    { nombre: "IPTV-org España (M3U)", url: "https://iptv-org.github.io/iptv/countries/es.m3u" }
  ];
  for (const rec of listasRecomendadasEspana) {
    const yaExiste = listas.some((l) => (l.url || "").trim().toLowerCase() === rec.url.toLowerCase());
    if (!yaExiste) {
      listas.push(rec);
      try {
        const newRef = db.ref("admin/m3u_lists").push();
        await newRef.set({
          id: newRef.key,
          nombre: rec.nombre,
          url: rec.url,
          visible: true
        });
        console.log(`[INIT] Auto-registrada lista recomendada en Firebase (/admin/m3u_lists): "${rec.nombre}"`);
      } catch (errReg) {
        console.warn(`No se pudo persistir "${rec.nombre}" en /admin/m3u_lists:`, errReg.message);
      }
    }
  }

  console.log(`Se procesarán ${listas.length} listas de canales (M3U / JSON)...`);
  for (const list of listas) {
    try {
      console.log(`Descargando lista: "${list.nombre}" (${list.url})...`);
      const res = await fetch(list.url, {
        headers: { "User-Agent": "Mozilla/5.0 TelePapa/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        console.warn(`Error HTTP ${res.status} descargando ${list.nombre}`);
        continue;
      }
      const text = await res.text();
      parsearCanalesDeTexto(text, list.url, list.nombre, nombresVistos, canales);
    } catch (e) {
      console.warn(`Error procesando lista "${list.nombre}":`, e.message);
    }
  }

  console.log(`Total de canales disponibles recopilados: ${canales.length}`);
  return canales;
}

// ==========================================
// 4. PARSEO DE PROGRAMACIÓN WEB
// ==========================================
function parseHtmlFutbolEnLaTv(html) {
  const eventos = [];
  if (!html) return eventos;

  const tableRegex = /<table[^>]*class=["'][^"']*tablaPrincipal[^"']*["'][^>]*>(.*?)<\/table>/gsi;
  const headerRegex = /<tr[^>]*class=["'][^"']*cabeceraTabla[^"']*["'][^>]*>.*?<td[^>]*>(.*?)<\/td>/si;
  const dateIsoRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
  const rowRegex = /<tr>(.*?)<\/tr>/gsi;
  const horaRegex = /<td[^>]*class=["'][^"']*hora[^"']*["'][^>]*>(.*?)<\/td>/si;
  const sportRegex = /<div[^>]*class=["'][^"']*contenedorImgCompeticion[^"']*["'][^>]*>.*?<img[^>]*alt=["']([^"']+)["']/si;
  const sportImgRegex = /<div[^>]*class=["'][^"']*contenedorImgCompeticion[^"']*["'][^>]*>.*?<img[^>]*src=["']([^"']+)["']/si;
  const compRegex = /<span[^>]*class=["'][^"']*ajusteDoslineas[^"']*["'][^>]*>.*?<label[^>]*>(.*?)<\/label>/si;
  const compSpanRegex = /<span[^>]*class=["'][^"']*ajusteDoslineas[^"']*["'][^>]*>(.*?)<\/span>/si;
  const localRegex = /<td[^>]*class=["'][^"']*local[^"']*["'][^>]*>.*?<span[^>]*>(.*?)<\/span>/si;
  const localImgRegex = /<td[^>]*class=["'][^"']*local[^"']*["'][^>]*>.*?<img[^>]*src=["']([^"']+)["']/si;
  const visRegex = /<td[^>]*class=["'][^"']*visitante[^"']*["'][^>]*>.*?<span[^>]*>(.*?)<\/span>/si;
  const visImgRegex = /<td[^>]*class=["'][^"']*visitante[^"']*["'][^>]*>.*?<img[^>]*src=["']([^"']+)["']/si;
  const colRegex = /<td[^>]*class=["'][^"']*(?:eventoUnaColumna|eventoUnico)[^"']*["'][^>]*>(.*?)<\/td>/si;
  const metaNameRegex = /<meta[^>]*itemprop=["']name["'][^>]*content=["']([^"']+)["']/si;
  const canalTitleRegex = /<li[^>]*class=["'][^"']*canal-[^"']*["'][^>]*title=["']([^"']+)["']/gsi;
  const listaCanalesRegex = /<ul[^>]*class=["'][^"']*listaCanales[^"']*["'][^>]*>(.*?)<\/ul>/si;
  const liRegex = /<li[^>]*>(.*?)<\/li>/gsi;
  const tagStripRegex = /<[^>]+>/g;

  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];
    let headerText = "";
    let fechaIso = "";

    const headerMatch = tableContent.match(headerRegex);
    if (headerMatch) {
      headerText = decodificarHtml(headerMatch[1].replace(tagStripRegex, "").trim());
      headerText = headerText.replace(/\bpartidos\b/gi, "Eventos");
      headerText = headerText.replace(/\b(?:eventos|partidos)\s+de\s+hoy\b/gi, "Eventos");
      const dMatch = headerText.match(dateIsoRegex);
      if (dMatch) {
        const d = dMatch[1].padStart(2, "0");
        const m = dMatch[2].padStart(2, "0");
        const y = dMatch[3];
        fechaIso = `${y}-${m}-${d}`;
      }
    }

    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const rowHtml = rowMatch[1];
      if (rowHtml.includes("cabeceraTabla")) continue;

      let hora = "";
      const hMatch = rowHtml.match(horaRegex);
      if (hMatch) {
        hora = decodificarHtml(hMatch[1].replace(tagStripRegex, "").trim());
      }

      let deporte = "Deporte";
      const sMatch = rowHtml.match(sportRegex);
      if (sMatch) {
        deporte = decodificarHtml(sMatch[1].trim());
      }
      if (!deporte || deporte.toLowerCase() === "deporte") {
        const sLinkMatch = rowHtml.match(/\/deporte\/([a-zA-Z0-9\-]+)/i);
        if (sLinkMatch) {
          const slug = sLinkMatch[1].replace(/-/g, " ").trim();
          if (slug) deporte = slug.charAt(0).toUpperCase() + slug.slice(1);
        }
      }

      let iconoDeporte = "";
      const siMatch = rowHtml.match(sportImgRegex);
      if (siMatch) iconoDeporte = siMatch[1].trim();

      let competicion = "";
      const cMatch = rowHtml.match(compRegex);
      if (cMatch) {
        competicion = decodificarHtml(cMatch[1].replace(tagStripRegex, "").trim());
      } else {
        const csMatch = rowHtml.match(compSpanRegex);
        if (csMatch) {
          const titleM = csMatch[0].match(/title=["']([^"']+)["']/i);
          competicion = titleM
            ? decodificarHtml(titleM[1].trim())
            : decodificarHtml(csMatch[1].replace(tagStripRegex, "").trim());
        }
      }

      let local = "";
      const lMatch = rowHtml.match(localRegex);
      if (lMatch) local = decodificarHtml(lMatch[1].replace(tagStripRegex, "").trim());

      let imagenLocal = "";
      const liMatch = rowHtml.match(localImgRegex);
      if (liMatch) imagenLocal = liMatch[1].trim();

      let visitante = "";
      const vMatch = rowHtml.match(visRegex);
      if (vMatch) visitante = decodificarHtml(vMatch[1].replace(tagStripRegex, "").trim());

      let imagenVisitante = "";
      const viMatch = rowHtml.match(visImgRegex);
      if (viMatch) imagenVisitante = viMatch[1].trim();

      let titulo = "";
      if (local && visitante) {
        titulo = `${local} - ${visitante}`;
      } else {
        const colMatch = rowHtml.match(colRegex);
        if (colMatch) {
          let col = colMatch[1].replace(/<br\s*\/?>/gi, " - ").replace(tagStripRegex, " ");
          titulo = decodificarHtml(col.replace(/\s+/g, " ").trim());
        }
        if (!titulo) {
          const mnMatch = rowHtml.match(metaNameRegex);
          if (mnMatch) titulo = decodificarHtml(mnMatch[1].trim());
          else if (local) titulo = local;
          else if (visitante) titulo = visitante;
        }
      }

      const canalesWeb = [];
      let ctMatch;
      while ((ctMatch = canalTitleRegex.exec(rowHtml)) !== null) {
        const cName = limpiarNombreCanalWeb(decodificarHtml(ctMatch[1].trim()));
        if (cName && !esCanalDescartable(cName) && !canalesWeb.includes(cName)) {
          canalesWeb.push(cName);
        }
      }

      if (canalesWeb.length === 0) {
        const lcMatch = rowHtml.match(listaCanalesRegex);
        if (lcMatch) {
          let liMatch;
          while ((liMatch = liRegex.exec(lcMatch[1])) !== null) {
            const rawLi = liMatch[1];
            const tMatch = rawLi.match(/title=["']([^"']+)["']/i);
            const cName = limpiarNombreCanalWeb(
              decodificarHtml(tMatch ? tMatch[1].trim() : rawLi.replace(tagStripRegex, "").trim())
            );
            if (cName && !esCanalDescartable(cName) && !canalesWeb.includes(cName)) {
              canalesWeb.push(cName);
            }
          }
        }
      }

      if (titulo && hora) {
        const norm = normalizarDeporteYCompeticion(deporte, competicion);
        eventos.push({
          fecha: fechaIso,
          fechaDisplay: headerText,
          hora: hora,
          deporte: norm.deporte,
          competicion: norm.competicion,
          titulo: titulo,
          equipoLocal: local,
          equipoVisitante: visitante,
          imagenLocal: imagenLocal,
          imagenVisitante: imagenVisitante,
          iconoDeporte: iconoDeporte,
          canalesWeb: canalesWeb,
        });
      }
    }
  }

  return eventos;
}

// ==========================================
// 5. ASIGNACIÓN DE CANALES CON GEMINI, NVIDIA NIM O HEURÍSTICO
// ==========================================
function construirPromptMapeo(canalesValidos, canalesDisponibles) {
  const canalesJson = JSON.stringify(
    canalesDisponibles.map((c, idx) => ({ id: idx, name: c.nombre }))
  );

  return `Eres un experto en televisión deportiva en España y el mundo.
Tu tarea es mapear los siguientes nombres de canales de televisión encontrados en la programación con los canales disponibles del usuario.

### CANALES ENCONTRADOS EN LA PROGRAMACIÓN:
${JSON.stringify(canalesValidos)}

### CANALES DISPONIBLES DEL USUARIO:
${canalesJson}

### REGLAS ESTRICTAS DE COINCIDENCIA:
1. ¡CANAL PRINCIPAL SIN NÚMERO! Si en la programación aparece un canal temático sin número de dial (por ejemplo 'DAZN LaLiga', 'M+ LALIGA', 'M+ Liga de Campeones', 'M+ Deportes', 'M+ Vamos'), se refiere EXCLUSIVAMENTE al canal principal SIN NÚMERO. ¡ESTÁ TERMINANTEMENTE PROHIBIDO asignarle canales secundarios con número como 'DAZN LaLiga 2', 'DAZN LaLiga 3', 'M+ Liga de Campeones 2', 'M+ Deportes 2', etc.! Asigna únicamente el canal principal sin número.
2. ¡PROHIBIDO HACER COINCIDENCIAS GENÉRICAS! Si en la programación aparece 'DAZN' sin número ni temática, o enlaces OTT, NO LO ASIGNES a DAZN 1, DAZN 2, DAZN F1, DAZN LaLiga, DAZN Baloncesto, etc. Asigna un array vacío [].
3. ¡ATENCIÓN CON LOS DIALES! 'DAZN 1' y 'DAZN 2' son canales distintos. 'M+ LALIGA 2' y 'M+ LALIGA' son distintos. 'Eurosport 1' y 'Eurosport 2' son distintos. El número de dial debe coincidir con precisión.
4. ¡TEMÁTICAS DISTINTAS NO COINCIDEN! 'DAZN F1' NO coincide con 'DAZN 1' ni con 'DAZN LaLiga'. 'M+ LALIGA' NO coincide con 'M+ Liga de Campeones'. 'LaLiga TV Bar' es solo para canales que lleven 'Bar'.
5. En los canales del usuario, ignora texto superfluo: 'new loop', 'backup', 'directo', [ES], [SPA], calidades (1080, 720, FHD, HD, 4K, UHD, SD).
6. 'M+' equivale a 'Movistar' o 'Movistar Plus+'.
7. Devuelve EXCLUSIVAMENTE un objeto JSON donde cada clave es el nombre EXACTO del canal encontrado en la programación, y el valor es un array de enteros con los IDs de los canales del usuario que coinciden.
Si un canal no tiene coincidencias exactas con el dial o temática adecuada, asígnale un array vacío [].`;
}

function procesarRespuestaMapeo(textoRespuesta, canalesValidos, canalesDisponibles) {
  if (!textoRespuesta || typeof textoRespuesta !== "string") return null;

  let cleanJson = textoRespuesta.trim();
  if (cleanJson.startsWith("```json")) cleanJson = cleanJson.slice(7);
  if (cleanJson.startsWith("```")) cleanJson = cleanJson.slice(3);
  if (cleanJson.endsWith("```")) cleanJson = cleanJson.slice(0, -3);
  cleanJson = cleanJson.trim();

  const firstBrace = cleanJson.indexOf("{");
  const lastBrace = cleanJson.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
  }

  let root;
  try {
    root = JSON.parse(cleanJson);
  } catch (err) {
    console.warn("Error parseando JSON de respuesta del modelo:", err.message);
    return null;
  }

  if (!root || typeof root !== "object") return null;

  const mapeo = {};
  for (const canalWeb of canalesValidos) {
    const ids = root[canalWeb];
    if (Array.isArray(ids) && ids.length > 0) {
      const cleanWeb = limpiarNombreCanalWeb(canalWeb);
      const validIds = [];
      for (const id of ids) {
        if (typeof id === "number" && id >= 0 && id < canalesDisponibles.length) {
          const cand = canalesDisponibles[id];
          if (cand && cand.nombre && sonCanalesCoincidentes(cleanWeb, cand.nombre)) {
            validIds.push(id);
          }
        }
      }
      if (validIds.length > 0) {
        mapeo[canalWeb] = validIds;
      }
    }
  }

  return mapeo;
}

async function llamarGeminiConFallback(apiKey, modelos, prompt, canalesValidos, canalesDisponibles) {
  for (const model of modelos) {
    try {
      console.log(`Consultando a Gemini (${model}) para emparejar ${canalesValidos.length} canales web (timeout: 8s)...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Aviso: Gemini (${model}) HTTP ${res.status}: ${errText.slice(0, 150)}`);
        continue;
      }

      const data = await res.json();
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const mapeo = procesarRespuestaMapeo(candidateText, canalesValidos, canalesDisponibles);
      if (mapeo && Object.keys(mapeo).length > 0) {
        console.log(`Mapeo completado con Gemini (${model}): ${Object.keys(mapeo).length} canales enlazados.`);
        return mapeo;
      } else {
        console.warn(`Aviso: La respuesta de Gemini (${model}) no contenía un JSON de mapeo válido.`);
      }
    } catch (e) {
      console.warn(`Aviso: Excepción llamando a Gemini (${model}): ${e.message}`);
    }
  }
  return null;
}

async function llamarNvidiaConFallback(apiKey, modelos, prompt, canalesValidos, canalesDisponibles) {
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";

  for (const model of modelos) {
    try {
      console.log(`Consultando a NVIDIA NIM (${model}) para emparejar ${canalesValidos.length} canales web (timeout: 8s)...`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: "Eres un asistente experto en televisión deportiva y devuelves exclusivamente JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Aviso: NVIDIA NIM (${model}) HTTP ${res.status}: ${errText.slice(0, 150)}`);
        continue;
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || "";
      const mapeo = procesarRespuestaMapeo(content, canalesValidos, canalesDisponibles);
      if (mapeo && Object.keys(mapeo).length > 0) {
        console.log(`Mapeo completado con NVIDIA NIM (${model}): ${Object.keys(mapeo).length} canales enlazados.`);
        return mapeo;
      } else {
        console.warn(`Aviso: La respuesta de NVIDIA NIM (${model}) no contenía un JSON de mapeo válido.`);
      }
    } catch (e) {
      console.warn(`Aviso: Excepción llamando a NVIDIA NIM (${model}): ${e.message}`);
    }
  }
  return null;
}

async function obtenerMapeoCanales({
  geminiApiKey,
  geminiModel,
  nvidiaApiKey,
  nvidiaModel,
  canalesWebUnicos,
  canalesDisponibles,
}) {
  const canalesValidos = Array.from(canalesWebUnicos).filter((c) => !esCanalDescartable(c));
  if (canalesValidos.length === 0) return {};

  // 1. PASO HEURÍSTICO LOCAL INMEDIATO:
  // Resuelve localmente la gran mayoría de canales exactos (DAZN, Eurosport, Movistar, etc.)
  const mapeoResultado = matchCanalesHeuristico(canalesValidos, canalesDisponibles);
  const canalesResueltos = Object.keys(mapeoResultado);
  console.log(`Emparejamiento heurístico local previo: ${canalesResueltos.length} canales enlazados con éxito.`);

  // 2. IDENTIFICAR CANALES PENDIENTES QUE REQUIEREN INTELIGENCIA ARTIFICIAL:
  const canalesPendientes = canalesValidos.filter((c) => !mapeoResultado[c] || mapeoResultado[c].length === 0);
  if (canalesPendientes.length === 0) {
    console.log("Todos los canales se enlazaron con éxito mediante heurístico local. No se requiere consulta a IA.");
    return mapeoResultado;
  }

  console.log(`Canales pendientes para resolver con IA: ${canalesPendientes.length}`);

  // Construir prompt únicamente para los canales pendientes (mucho más rápido, ligero y evita 503/timeouts)
  const prompt = construirPromptMapeo(canalesPendientes, canalesDisponibles);

  // 3. INTENTAR CON GEMINI (modelos gratuitos Flash con reintentos para picos de demanda 503)
  if (geminiApiKey) {
    const modelosGemini = [
      geminiModel,
      ...GEMINI_FREE_MODELS,
    ].filter(
      (m, idx, arr) =>
        m &&
        arr.indexOf(m) === idx &&
        !m.toLowerCase().includes("pro") &&
        !m.toLowerCase().includes("ultra")
    );

    console.log(`Consultando a Gemini para canales pendientes (modelos: ${modelosGemini.join(", ")})...`);
    const mapeoGemini = await llamarGeminiConFallback(
      geminiApiKey,
      modelosGemini,
      prompt,
      canalesPendientes,
      canalesDisponibles
    );
    if (mapeoGemini) {
      for (const [k, v] of Object.entries(mapeoGemini)) {
        if (Array.isArray(v) && v.length > 0) {
          mapeoResultado[k] = v;
        }
      }
      return mapeoResultado;
    }
    console.warn("Todos los modelos gratuitos de Gemini fallaron o no estuvieron disponibles.");
  } else {
    console.log("Gemini API Key no configurada.");
  }

  // 4. INTENTAR CON NVIDIA NIM (build.nvidia.com)
  if (nvidiaApiKey) {
    const modelosNvidia = [
      nvidiaModel,
      ...NVIDIA_FREE_MODELS,
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    console.log(`Consultando a NVIDIA NIM para canales pendientes (modelos: ${modelosNvidia.join(", ")})...`);
    const mapeoNvidia = await llamarNvidiaConFallback(
      nvidiaApiKey,
      modelosNvidia,
      prompt,
      canalesPendientes,
      canalesDisponibles
    );
    if (mapeoNvidia) {
      for (const [k, v] of Object.entries(mapeoNvidia)) {
        if (Array.isArray(v) && v.length > 0) {
          mapeoResultado[k] = v;
        }
      }
      return mapeoResultado;
    }
    console.warn("Todos los modelos gratuitos de NVIDIA NIM fallaron o no estuvieron disponibles.");
  } else {
    console.log("NVIDIA API Key no configurada (se puede añadir como secret NVIDIA_API_KEY en GitHub o en Firebase /admin/agenda_config/nvidia_api_key).");
  }

  // Devolver el resultado acumulado (heurístico previo garantizado)
  return mapeoResultado;
}

// ==========================================
// 5.1 OBTENCIÓN DE EVENTOS DE THESPORTSDB (FREE TIER)
// ==========================================
async function obtenerEventosTheSportsDb(fechas) {
  const eventos = [];
  if (!fechas || fechas.length === 0) return eventos;

  console.log(`Consultando TheSportsDB (Free Tier) para ${fechas.length} fechas...`);
  for (const fecha of fechas) {
    try {
      const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${fecha}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (data.events && Array.isArray(data.events)) {
          for (const ev of data.events) {
            const h = ev.strTime ? ev.strTime.substring(0, 5) : "00:00";
            const norm = normalizarDeporteYCompeticion(ev.strSport || "Otros", ev.strLeague || "");
            eventos.push({
              fecha: fecha,
              hora: h,
              deporte: norm.deporte,
              competicion: norm.competicion,
              titulo: ev.strEvent || `${ev.strHomeTeam || ""} - ${ev.strAwayTeam || ""}`,
              equipoLocal: ev.strHomeTeam || "",
              equipoVisitante: ev.strAwayTeam || "",
              imagenLocal: ev.strHomeTeamBadge || "",
              imagenVisitante: ev.strAwayTeamBadge || "",
              iconoDeporte: "",
              thumb: ev.strThumb || "",
              poster: ev.strPoster || "",
              canalesWeb: [],
            });
          }
        }
      }
    } catch (e) {
      console.warn(`Aviso consultando TheSportsDB (${fecha}):`, e.message);
    }
  }
  console.log(`Eventos obtenidos desde TheSportsDB: ${eventos.length}`);
  return eventos;
}

// ==========================================
// 5.2 OBTENCIÓN DE EVENTOS DE XMLTV / EPG (epg_dobleM)
// ==========================================
async function obtenerEventosEpg(fechas) {
  const eventos = [];
  if (!fechas || fechas.length === 0) return eventos;
  const fechasSet = new Set(fechas);

  console.log("Descargando e integrando guía EPG XMLTV (epg_dobleM)...");
  try {
    const res = await fetch("https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiaiptv.xml", {
      headers: { "User-Agent": "Mozilla/5.0 TelePapa/1.0" },
      signal: AbortSignal.timeout(25000),
    });

    if (res.ok) {
      const xml = await res.text();
      const canalesMap = new Map();
      let startIdx = 0;
      while ((startIdx = xml.indexOf('<channel id="', startIdx)) !== -1) {
        const endId = xml.indexOf('"', startIdx + 13);
        const chId = xml.substring(startIdx + 13, endId);
        const endCh = xml.indexOf("</channel>", endId);
        const chBlock = xml.substring(endId, endCh);
        const dnMatch = chBlock.match(/<display-name>([^<]+)<\/display-name>/);
        canalesMap.set(chId, dnMatch ? dnMatch[1].trim() : chId);
        startIdx = endCh + 10;
      }

      let progIdx = 0;
      while ((progIdx = xml.indexOf("<programme ", progIdx)) !== -1) {
        const endProg = xml.indexOf("</programme>", progIdx);
        if (endProg === -1) break;
        const block = xml.substring(progIdx, endProg);
        progIdx = endProg + 12;

        const startMatch = block.match(/start="(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\d{2} \+\d{4}"/);
        const chMatch = block.match(/channel="([^"]+)"/);
        const titleMatch = block.match(/<title[^>]*>([^<]+)<\/title>/);

        if (!startMatch || !chMatch || !titleMatch) continue;

        const dateIso = `${startMatch[1]}-${startMatch[2]}-${startMatch[3]}`;
        if (!fechasSet.has(dateIso)) continue;

        const chId = chMatch[1];
        const chName = canalesMap.get(chId) || chId;
        const title = decodificarHtml(titleMatch[1].trim());
        const hora = `${startMatch[4]}:${startMatch[5]}`;

        const catMatch = block.match(/<category[^>]*>([^<]+)<\/category>/);
        const cat = catMatch ? catMatch[1].trim() : "";

        // Filtrar programas deportivos en directo o canales temáticos de deporte
        const isSportsChannel = /deport|dazn|laliga|campeones|eurosport|gol|vamos|teledeporte|liga|f1|motogp/i.test(chName);
        const isLiveOrMatch = /directo|en vivo|partido|liga|campeonato|gran premio|etapa|carrera/i.test(title);

        if (isSportsChannel && isLiveOrMatch) {
          const norm = normalizarDeporteYCompeticion(cat || "Deporte", title);
          eventos.push({
            fecha: dateIso,
            hora: hora,
            deporte: norm.deporte,
            competicion: norm.competicion,
            titulo: title,
            equipoLocal: "",
            equipoVisitante: "",
            imagenLocal: "",
            imagenVisitante: "",
            iconoDeporte: "",
            canalesWeb: [chName],
          });
        }
      }
      console.log(`Eventos deportivos procesados desde EPG XMLTV: ${eventos.length}`);
    }
  } catch (e) {
    console.warn("Aviso obteniendo EPG XMLTV:", e.message);
  }

  return eventos;
}


// ==========================================
// 6. FLUJO PRINCIPAL DE EJECUCIÓN
// ==========================================
async function main() {
  console.log("==================================================");
  console.log("  TelePapa - Actualización Desatendida de Agenda  ");
  console.log("==================================================");
  console.log(`Inicio: ${new Date().toISOString()}`);

  const db = inicializarFirebase();

  // 1. Obtener configuración
  let agendaUrl = (process.env.AGENDA_URL || "").trim() || null;
  let geminiApiKey = (process.env.GEMINI_API_KEY || "").trim() || null;
  let geminiModel = (process.env.GEMINI_MODEL || "").trim() || null;
  let nvidiaApiKey = (process.env.NVIDIA_API_KEY || "").trim() || null;
  let nvidiaModel = (process.env.NVIDIA_MODEL || "").trim() || null;

  try {
    const configSnap = await db.ref("admin/agenda_config").once("value");
    if (configSnap.exists()) {
      const conf = configSnap.val() || {};
      if (!agendaUrl && conf.agenda_url) agendaUrl = conf.agenda_url;
      if (!geminiApiKey && conf.gemini_api_key) geminiApiKey = conf.gemini_api_key;
      if (!geminiModel && conf.gemini_model) geminiModel = conf.gemini_model;
      if (!nvidiaApiKey && conf.nvidia_api_key) nvidiaApiKey = conf.nvidia_api_key;
      if (!nvidiaModel && conf.nvidia_model) nvidiaModel = conf.nvidia_model;
    }
  } catch (ignored) {}

  agendaUrl = agendaUrl || DEFAULT_AGENDA_URL;
  geminiModel = geminiModel || DEFAULT_GEMINI_MODEL;
  nvidiaModel = nvidiaModel || DEFAULT_NVIDIA_MODEL;

  console.log(`URL de programación: ${agendaUrl}`);
  console.log(`Modelo Gemini:       ${geminiModel} (fallbacks gratuitos: ${GEMINI_FREE_MODELS.join(", ")})`);
  console.log(`Gemini API Key:      ${geminiApiKey ? "Configurada (OK)" : "No configurada"}`);
  console.log(`Modelo NVIDIA NIM:   ${nvidiaModel} (fallbacks gratuitos: ${NVIDIA_FREE_MODELS.join(", ")})`);
  console.log(`NVIDIA API Key:      ${nvidiaApiKey ? "Configurada (OK)" : "No configurada"}`);

  // 2. Descargar canales disponibles del usuario
  const canalesDisponibles = await cargarCanalesDisponibles(db);
  if (canalesDisponibles.length === 0) {
    console.error("ERROR: No hay canales disponibles en Firebase ni en las listas M3U.");
    process.exit(1);
  }

  // 3. Descargar programación deportiva web
  console.log(`Descargando programación desde ${agendaUrl}...`);
  const webRes = await fetch(agendaUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TelePapa/1.0",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!webRes.ok) {
    console.error(`ERROR al descargar web de agenda: HTTP ${webRes.status}`);
    process.exit(1);
  }

  const html = await webRes.text();
  console.log(`Programación web descargada con éxito (${html.length} caracteres).`);

  // 4. Parsear eventos
  const eventosWeb = parseHtmlFutbolEnLaTv(html);
  console.log(`Eventos parseados desde la web general: ${eventosWeb.length}`);

  // 4.1 Descargar secciones especializadas de motor (motociclismo y automovilismo) para disponer del calendario completo
  const seccionesEspecializadas = [
    "https://www.futbolenlatv.es/deporte/motociclismo",
    "https://www.futbolenlatv.es/deporte/automovilismo",
  ];
  for (const urlSeccion of seccionesEspecializadas) {
    try {
      console.log(`Descargando calendario especializado desde ${urlSeccion}...`);
      const sRes = await fetch(urlSeccion, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TelePapa/1.0",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (sRes.ok) {
        const sHtml = await sRes.text();
        const sEvs = parseHtmlFutbolEnLaTv(sHtml);
        let nuevos = 0;
        for (const sev of sEvs) {
          const yaExiste = eventosWeb.some(
            (w) => w.fecha === sev.fecha && w.titulo.toLowerCase() === sev.titulo.toLowerCase()
          );
          if (!yaExiste) {
            eventosWeb.push(sev);
            nuevos++;
          }
        }
        console.log(`Eventos incorporados desde ${urlSeccion}: ${nuevos}`);
      }
    } catch (e) {
      console.warn(`Aviso descargando ${urlSeccion}:`, e.message);
    }
  }

  if (eventosWeb.length === 0) {
    console.error("ERROR: No se encontraron eventos en la estructura web.");
    process.exit(1);
  }

  // 4.2 Enriquecer y complementar con TheSportsDB y XMLTV / EPG
  const fechasDisponibles = [...new Set(eventosWeb.map((e) => e.fecha))].filter(Boolean);

  // TheSportsDB
  try {
    const evsSportsDb = await obtenerEventosTheSportsDb(fechasDisponibles);
    let sdbEnriquecidos = 0;
    let sdbNuevos = 0;
    for (const sdb of evsSportsDb) {
      const sdbNorm = normalizarNombreCanal(sdb.titulo);
      const match = eventosWeb.find((w) => {
        if (w.fecha !== sdb.fecha) return false;
        const wNorm = normalizarNombreCanal(w.titulo);
        if (wNorm === sdbNorm) return true;
        if (sdb.equipoLocal && sdb.equipoVisitante) {
          const locNorm = normalizarNombreCanal(sdb.equipoLocal);
          const visNorm = normalizarNombreCanal(sdb.equipoVisitante);
          if (wNorm.includes(locNorm) && wNorm.includes(visNorm)) return true;
        }
        return false;
      });

      if (match) {
        if (!match.imagenLocal && sdb.imagenLocal) match.imagenLocal = sdb.imagenLocal;
        if (!match.imagenVisitante && sdb.imagenVisitante) match.imagenVisitante = sdb.imagenVisitante;
        if (sdb.thumb) match.imagenEvento = sdb.thumb;
        sdbEnriquecidos++;
      } else {
        eventosWeb.push(sdb);
        sdbNuevos++;
      }
    }
    console.log(`TheSportsDB: ${sdbEnriquecidos} eventos enriquecidos, ${sdbNuevos} eventos nuevos incorporados.`);
  } catch (e) {
    console.warn("Aviso al procesar TheSportsDB:", e.message);
  }

  // XMLTV / EPG
  try {
    const evsEpg = await obtenerEventosEpg(fechasDisponibles);
    let epgEnriquecidos = 0;
    let epgNuevos = 0;
    for (const epg of evsEpg) {
      const epgNorm = normalizarNombreCanal(epg.titulo);
      const match = eventosWeb.find((w) => {
        if (w.fecha !== epg.fecha) return false;
        const wNorm = normalizarNombreCanal(w.titulo);
        return wNorm === epgNorm || (wNorm.length > 5 && epgNorm.includes(wNorm)) || (epgNorm.length > 5 && wNorm.includes(epgNorm));
      });

      if (match) {
        for (const ch of epg.canalesWeb) {
          if (!match.canalesWeb.includes(ch)) {
            match.canalesWeb.push(ch);
          }
        }
        epgEnriquecidos++;
      } else {
        eventosWeb.push(epg);
        epgNuevos++;
      }
    }
    console.log(`EPG XMLTV: ${epgEnriquecidos} eventos enriquecidos con canales, ${epgNuevos} eventos nuevos incorporados.`);
  } catch (e) {
    console.warn("Aviso al procesar EPG XMLTV:", e.message);
  }

  // 5. Recopilar canales web únicos y mapear con canales del usuario
  const canalesWebUnicos = new Set();
  for (const ew of eventosWeb) {
    for (const cw of ew.canalesWeb) {
      canalesWebUnicos.add(cw);
    }
  }

  const mapeoCanales = await obtenerMapeoCanales({
    geminiApiKey,
    geminiModel,
    nvidiaApiKey,
    nvidiaModel,
    canalesWebUnicos,
    canalesDisponibles,
  });

  // 6. Construir lista final de eventos
  const eventosFinales = [];
  let eventosConCanal = 0;

  for (let i = 0; i < eventosWeb.length; i++) {
    const ew = eventosWeb[i];
    const canalesAsignados = [];
    const urlsVistas = new Set();

    for (const cw of ew.canalesWeb) {
      const ids = mapeoCanales[cw] || [];
      for (const id of ids) {
        const canal = canalesDisponibles[id];
        if (canal && !urlsVistas.has(canal.url)) {
          urlsVistas.add(canal.url);
          canalesAsignados.push({
            id: canal.id,
            nombre: canal.nombre,
            url: canal.url,
            source: canal.source,
            logo: canal.logo,
          });
        }
      }
    }

    if (canalesAsignados.length > 0) {
      eventosConCanal++;
    }

    const timestamp = getMadridTimestamp(ew.fecha, ew.hora);
    const fechaDisplay = ew.fechaDisplay || formatearFechaLegible(ew.fecha);
    const duracion = estimarDuracionMinutos(ew.deporte, ew.competicion, ew.titulo);

    eventosFinales.push({
      id: "",
      fecha: ew.fecha,
      fechaDisplay: fechaDisplay,
      hora: ew.hora,
      timestamp: timestamp,
      duracionMinutos: duracion,
      deporte: ew.deporte,
      competicion: ew.competicion,
      titulo: ew.titulo,
      equipoLocal: ew.equipoLocal,
      equipoVisitante: ew.equipoVisitante,
      imagenLocal: ew.imagenLocal,
      imagenVisitante: ew.imagenVisitante,
      iconoDeporte: ew.iconoDeporte,
      canales: canalesAsignados,
    });
  }

  // 7. Recuperar histórico existente en Firebase RTDB para NUNCA borrar el pasado
  console.log("Recuperando eventos existentes en Firebase para preservar el histórico de días pasados...");
  const snapshot = await db.ref("agenda/eventos").once("value");

  const ahora = new Date();
  const hoyIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(ahora);
  console.log(`Fecha de hoy (Madrid): ${hoyIso}`);

  const eventosCombinados = [];
  const mapaExistentes = new Map();

  if (snapshot.exists()) {
    snapshot.forEach((child) => {
      const evViejo = child.val();
      if (evViejo) {
        const f = evViejo.fecha || "";
        const clave = `${f}_${(evViejo.titulo || "").toLowerCase().trim()}`;
        mapaExistentes.set(clave, evViejo);

        // Si el evento es de una fecha anterior a hoy, PRESERVARLO SIEMPRE en el histórico
        if (f && f < hoyIso) {
          eventosCombinados.push(evViejo);
        }
      }
    });
  }
  console.log(`Eventos históricos de días anteriores preservados: ${eventosCombinados.length}`);

  // Para los nuevos eventos de hoy en adelante, preservar resultados o detalles si ya los tenían
  for (const evNuevo of eventosFinales) {
    const f = evNuevo.fecha || "";
    const clave = `${f}_${(evNuevo.titulo || "").toLowerCase().trim()}`;
    const existente = mapaExistentes.get(clave);
    if (existente) {
      if (existente.resultado && !evNuevo.resultado) {
        evNuevo.resultado = existente.resultado;
      }
      if (existente.estadoEvento && !evNuevo.estadoEvento) {
        evNuevo.estadoEvento = existente.estadoEvento;
      }
      if (existente.detalleDirecto && !evNuevo.detalleDirecto) {
        evNuevo.detalleDirecto = existente.detalleDirecto;
      }
      if (
        existente.detalles &&
        Array.isArray(existente.detalles) &&
        existente.detalles.length > 0 &&
        (!evNuevo.detalles || evNuevo.detalles.length === 0)
      ) {
        evNuevo.detalles = existente.detalles;
      }
    }
    eventosCombinados.push(evNuevo);
  }

  // 8. Ordenar cronológicamente (pasados + presentes + futuros)
  eventosCombinados.sort((a, b) => {
    const tsA = typeof a.timestamp === "number" && !isNaN(a.timestamp) ? a.timestamp : 0;
    const tsB = typeof b.timestamp === "number" && !isNaN(b.timestamp) ? b.timestamp : 0;
    if (tsA > 0 && tsB > 0) {
      if (tsA !== tsB) return tsA - tsB;
    } else if (tsA > 0) {
      return -1;
    } else if (tsB > 0) {
      return 1;
    }

    const fComp = (a.fecha || "").localeCompare(b.fecha || "");
    if (fComp !== 0) return fComp;

    return (a.hora || "").localeCompare(b.hora || "");
  });

  // 9. Convertir a mapa indexado ev_00000 para Firebase
  const mapGuardar = {};
  for (let i = 0; i < eventosCombinados.length; i++) {
    const ev = eventosCombinados[i];
    // Garantizar que ningún campo numérico crítico sea NaN para que Firebase RTDB no falle
    if (typeof ev.timestamp !== "number" || isNaN(ev.timestamp)) {
      ev.timestamp = getMadridTimestamp(ev.fecha, ev.hora);
      if (typeof ev.timestamp !== "number" || isNaN(ev.timestamp)) {
        ev.timestamp = Date.now();
      }
    }
    if (typeof ev.duracionMinutos !== "number" || isNaN(ev.duracionMinutos)) {
      ev.duracionMinutos = 120;
    }
    const key = `ev_${String(i).padStart(5, "0")}`;
    ev.id = key;
    mapGuardar[key] = ev;
  }

  console.log(`Subiendo ${eventosCombinados.length} eventos (histórico + nuevos) a Firebase Realtime Database (/agenda)...`);
  console.log(`Eventos con canales sintonizables encontrados: ${eventosConCanal}`);

  await db.ref("agenda").set({
    eventos: mapGuardar,
    last_updated: Date.now(),
  });

  console.log("¡Agenda actualizada exitosamente en Firebase preservando el histórico!");
  console.log(`Fin: ${new Date().toISOString()}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Excepción crítica en actualizar_agenda:", err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_AGENDA_URL,
  parseHtmlFutbolEnLaTv,
  normalizarNombreCanal,
  obtenerEventosTheSportsDb,
  obtenerEventosEpg,
  getMadridTimestamp,
  formatearFechaLegible,
  estimarDuracionMinutos,
};
