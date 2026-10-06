/**
 * datos.mjs
 *
 * Prepara los datos que lee la app web (carpeta datos/), porque las fuentes originales no se pueden
 * leer directamente desde un navegador:
 *   - datos/canales.json: canales de las listas de listas.json, sin los excluidos y solo de
 *     servidores verificados ("dominios").
 *   - datos/guia.json: guía de programación compacta (unas 30 horas) de TDTChannels y, para los
 *     canales de "guiaComplementaria", de la guía comunitaria configurada.
 *
 * Si una fuente falla se reutiliza la última versión publicada, para no dejar la web sin datos.
 *
 * Uso: node tools/datos.mjs [carpeta de salida]   (por defecto ./datos)
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { idDeUrl, limitar, logoValido, normalizarNombre, servidorPermitido } from '../app/js/nucleo/texto.js';
import { clavesGuia } from '../app/js/nucleo/guia.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICADO = 'https://raulcalvo.github.io/telepapa-canales/datos/';
const GUIA_PRINCIPAL = 'https://www.tdtchannels.com/epg/TV.xml.gz';
const VENTANA_ATRAS = 2 * 3600000;
const VENTANA_ADELANTE = 30 * 3600000;
const MAX_DESCRIPCION = 160;
const AGENTE = 'Mozilla/5.0 (compatible; telepapa-canales/1.0; +https://github.com/raulcalvo/telepapa-canales)';

// ---------------------------------------------------------------------------
// Descargas
// ---------------------------------------------------------------------------

async function descargar(url, { binario = false } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (binario) return buf;
  return buf.toString('utf-8');
}

/** Descarga un XML que puede venir comprimido con gzip. */
async function descargarXml(url) {
  const buf = await descargar(url, { binario: true });
  const gz = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  return (gz ? zlib.gunzipSync(buf) : buf).toString('utf-8');
}

async function ultimaPublicada(nombre) {
  try {
    const json = JSON.parse(await descargar(PUBLICADO + nombre));
    console.log(`  Se reutiliza la versión publicada de ${nombre}.`);
    return json;
  } catch (e) {
    console.log(`  Tampoco se pudo leer la versión publicada de ${nombre}: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Listas de canales
// ---------------------------------------------------------------------------

/** Solo emisiones que se reproducen directamente (HLS/DASH); los enlaces a webs se descartan. */
function primeraEmisionDirecta(opciones) {
  for (const o of opciones || []) {
    const u = String(o?.url || '').trim();
    const f = String(o?.format || '').toLowerCase();
    const ul = u.toLowerCase();
    if (!/^https?:\/\//.test(ul)) continue;
    if (f === 'm3u8' || f === 'mpd' || ul.includes('.m3u8') || ul.includes('.mpd')) return u;
  }
  return null;
}

/** Formato JSON de TDTChannels: countries -> ambits -> channels -> options. */
function canalesTdtChannels(texto) {
  const r = [];
  const raiz = JSON.parse(texto);
  const paises = raiz.countries || [];
  for (const pais of paises) {
    const nombrePais = String(pais.name || '').toLowerCase();
    if (paises.length > 1 && !nombrePais.includes('españa') && !nombrePais.includes('spain')) continue;
    for (const ambito of pais.ambits || []) {
      for (const ch of ambito.channels || []) {
        const url = primeraEmisionDirecta(ch.options);
        const nombre = String(ch.name || '').trim();
        if (!url || !nombre) continue;
        r.push({ nombre, url, logo: ch.logo, grupo: ambito.name, epg: ch.epg_id });
      }
    }
  }
  return r;
}

/** Lista M3U (#EXTINF con tvg-logo, tvg-id y group-title). */
function canalesM3u(texto) {
  const r = [];
  let actual = null;
  const atributo = (linea, nombre) => (new RegExp(`${nombre}="([^"]*)"`, 'i').exec(linea) || [])[1] || '';
  for (const bruta of texto.split(/\r?\n/)) {
    const s = bruta.trim();
    if (!s) continue;
    if (s.startsWith('#EXTINF:')) {
      const coma = s.lastIndexOf(',');
      const nombre = coma >= 0 ? s.slice(coma + 1).replace(/\s*\(\d{3,4}[pi]\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim() : '';
      actual = nombre ? { nombre, logo: atributo(s, 'tvg-logo'), grupo: atributo(s, 'group-title'), epg: atributo(s, 'tvg-id') } : null;
    } else if (!s.startsWith('#')) {
      if (actual && /^https?:\/\//i.test(s)) r.push({ ...actual, url: s });
      actual = null;
    }
  }
  return r;
}

async function generarCanales(config) {
  const excluir = new Set((config.excluir || []).map(normalizarNombre));
  const dominios = config.dominios || [];
  const canales = [];
  const ids = new Set();
  for (const lista of config.listas || []) {
    console.log(`Lista ${lista.id}: ${lista.url}`);
    const texto = await descargar(lista.url);
    const brutos = lista.formato === 'tdtchannels' ? canalesTdtChannels(texto) : canalesM3u(texto);
    let descartados = 0;
    for (const c of brutos) {
      if (excluir.has(normalizarNombre(c.nombre)) || !servidorPermitido(c.url, dominios)) {
        descartados++;
        continue;
      }
      const id = idDeUrl(c.url);
      if (ids.has(id)) continue;
      ids.add(id);
      canales.push({
        id,
        nombre: limitar(c.nombre, 80),
        url: c.url,
        logo: logoValido(c.logo) || undefined,
        grupo: limitar(c.grupo, 60) || undefined,
        epg: limitar(c.epg, 80) || undefined,
        lista: lista.id,
      });
    }
    console.log(`  ${brutos.length} canales, ${descartados} descartados.`);
  }
  if (canales.length === 0) throw new Error('No se obtuvo ningún canal');
  return {
    version: 1,
    generado: Date.now(),
    listas: (config.listas || []).map(({ id, nombre, web }) => ({ id, nombre, web })),
    canales,
  };
}

// ---------------------------------------------------------------------------
// Guía XMLTV
// ---------------------------------------------------------------------------

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodificar(texto) {
  return String(texto)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTIDADES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function primerTexto(xml, etiqueta) {
  const m = new RegExp(`<${etiqueta}\\b[^>]*>([\\s\\S]*?)</${etiqueta}>`).exec(xml);
  return m ? decodificar(m[1]) : '';
}

function atributo(attrs, nombre) {
  const m = new RegExp(`\\b${nombre}="([^"]*)"`).exec(attrs);
  return m ? decodificar(m[1]) : '';
}

/** "20261006083000 +0200" -> milisegundos. */
export function fechaXmltv(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?(\d{2})?/.exec(String(s).trim());
  if (!m) return 0;
  const [, a, mes, d, h, min, seg = '00', signo, zh = '00', zm = '00'] = m;
  let ms = Date.UTC(+a, +mes - 1, +d, +h, +min, +seg);
  if (signo) ms -= (signo === '-' ? -1 : 1) * (+zh * 60 + +zm) * 60000;
  return ms;
}

/**
 * Lee un XMLTV y devuelve los canales con sus nombres y programas dentro de la ventana.
 * @returns {Map<string, {nombres: string[], programas: Array}>}
 */
export function leerXmltv(xml, desde, hasta) {
  const canales = new Map();
  const canal = (id) => {
    let c = canales.get(id);
    if (!c) {
      c = { nombres: [id], programas: [] };
      canales.set(id, c);
    }
    return c;
  };
  for (const m of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/g)) {
    const id = atributo(m[1], 'id');
    if (!id) continue;
    const c = canal(id);
    for (const dn of m[2].matchAll(/<display-name\b[^>]*>([\s\S]*?)<\/display-name>/g)) {
      const n = decodificar(dn[1]);
      if (n && !c.nombres.includes(n)) c.nombres.push(n);
    }
  }
  for (const m of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/g)) {
    const id = atributo(m[1], 'channel');
    const inicio = fechaXmltv(atributo(m[1], 'start'));
    const fin = fechaXmltv(atributo(m[1], 'stop'));
    if (!id || !inicio || fin <= inicio || fin < desde || inicio > hasta) continue;
    const titulo = primerTexto(m[2], 'title');
    if (!titulo) continue;
    canal(id).programas.push({
      inicio,
      fin,
      titulo: limitar(titulo, 140),
      categoria: limitar(primerTexto(m[2], 'category'), 40),
      descripcion: limitar(primerTexto(m[2], 'desc'), MAX_DESCRIPCION),
    });
  }
  for (const c of canales.values()) c.programas.sort((a, b) => a.inicio - b.inicio);
  return canales;
}

/** Formato compacto para la app: [inicio en minutos, duración en minutos, título, categoría, descripción]. */
function compactar(programas) {
  return programas.map((p) => {
    const ini = Math.round(p.inicio / 60000);
    const fila = [ini, Math.max(1, Math.round(p.fin / 60000) - ini), p.titulo];
    if (p.categoria || p.descripcion) fila.push(p.categoria);
    if (p.descripcion) fila.push(p.descripcion);
    return fila;
  });
}

/**
 * Une la guía principal y la complementaria (solo los canales permitidos que la principal no tenga)
 * en el formato de datos/guia.json.
 */
export function construirGuia(principal, complementaria, canalesComplementaria, fuentes) {
  const guia = { version: 1, generado: Date.now(), fuentes, canales: {}, claves: {} };
  let siguiente = 0;
  const anadir = (nombre, programas, claves) => {
    const gid = String(siguiente++);
    guia.canales[gid] = { nombre, programas: compactar(programas) };
    for (const clave of claves) {
      // Si dos canales comparten clave, gana el que tiene más programas
      const previo = guia.claves[clave];
      if (previo == null || guia.canales[previo].programas.length < programas.length) guia.claves[clave] = gid;
    }
  };
  for (const c of principal.values()) {
    if (!c.programas.length) continue;
    anadir(c.nombres[1] || c.nombres[0], c.programas, c.nombres.flatMap(clavesGuia));
  }
  if (complementaria) {
    for (const nombre of canalesComplementaria) {
      const claves = clavesGuia(nombre);
      if (!claves.length || claves.some((k) => guia.claves[k] != null)) continue;
      const encontrado = [...complementaria.values()].find(
        (c) => c.programas.length && c.nombres.some((n) => clavesGuia(n).some((k) => claves.includes(k))),
      );
      if (encontrado) anadir(nombre, encontrado.programas, claves);
    }
  }
  return guia;
}

async function generarGuia(config) {
  const ahora = Date.now();
  const desde = ahora - VENTANA_ATRAS;
  const hasta = ahora + VENTANA_ADELANTE;
  console.log(`Guía principal: ${GUIA_PRINCIPAL}`);
  const principal = leerXmltv(await descargarXml(GUIA_PRINCIPAL), desde, hasta);
  console.log(`  ${principal.size} canales.`);
  const fuentes = [{ nombre: 'TDTChannels', web: 'https://www.tdtchannels.com' }];

  let complementaria = null;
  const extra = config.guiaComplementaria || {};
  const canalesExtra = Array.isArray(extra.canales) ? extra.canales : [];
  if (extra.activa && /^https:\/\//.test(extra.url || '') && canalesExtra.length) {
    try {
      console.log(`Guía complementaria: ${extra.url}`);
      complementaria = leerXmltv(await descargarXml(extra.url), desde, hasta);
      console.log(`  ${complementaria.size} canales.`);
      fuentes.push({ nombre: new URL(extra.url).hostname.replace(/^www\./, ''), web: new URL(extra.url).origin });
    } catch (e) {
      console.log(`  No se pudo descargar: ${e.message}`);
    }
  }
  return construirGuia(principal, complementaria, canalesExtra, fuentes);
}

// ---------------------------------------------------------------------------

async function main() {
  const salida = path.resolve(process.argv[2] || path.join(RAIZ, 'datos'));
  fs.mkdirSync(salida, { recursive: true });
  const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'listas.json'), 'utf-8'));
  let fallos = 0;

  for (const [nombre, generar] of [
    ['canales.json', () => generarCanales(config)],
    ['guia.json', () => generarGuia(config)],
  ]) {
    let datos;
    try {
      datos = await generar();
    } catch (e) {
      fallos++;
      console.log(`Error generando ${nombre}: ${e.message}`);
      datos = await ultimaPublicada(nombre);
    }
    if (datos) {
      const texto = JSON.stringify(datos);
      fs.writeFileSync(path.join(salida, nombre), texto);
      console.log(`${nombre}: ${(texto.length / 1024).toFixed(0)} KB`);
    }
  }
  if (fallos === 2) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
