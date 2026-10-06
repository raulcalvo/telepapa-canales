// Guía de programación: claves para encontrar un canal en la guía por su id o por su nombre,
// y consultas sobre el formato compacto que genera tools/datos.js. Sin dependencias del navegador.

import { sinAcentos } from './texto.js';

const TOKENS_RUIDO = new Set([
  'hd', 'fhd', 'uhd', 'sd', '4k', 'hevc', 'h265', '1080', '1080p', '720', '720p', 'hdr',
  'es', 'esp', 'spain', 'espana', 'backup', 'alt', 'directo', 'live',
]);

/** Nombres alternativos habituales de canales de la TDT (clave normalizada -> clave de la guía). */
const ALIAS = {
  tve1: 'la1', tve: 'la1', la1tve: 'la1', rtve1: 'la1',
  tve2: 'la2', la2tve: 'la2',
  a3: 'antena3', sexta: 'lasexta', la6: 'lasexta',
  tele5: 'telecinco', t5: 'telecinco',
  factoriadeficcion: 'fdf', fdftelecinco: 'fdf',
  tdp: 'teledeporte',
  '24h': '24horas', canal24horas: '24horas',
  a3series: 'atreseries',
  '13tv': 'trece', 13: 'trece',
  e3: 'esport3',
  rmtv: 'realmadridtv',
  324: '3catinfo',
};

/** "La 1 HD", "La1.TV" -> "la1hd"/"la1tv": sin acentos, símbolos ni etiquetas de calidad. */
export function normalizar(texto) {
  let n = sinAcentos(texto).replace(/&amp;/g, '&');
  n = n.replace(/\+/g, ' plus ');
  // Prefijos de listas tipo "ES: ", "ES | ", "[ES] "
  n = n.replace(/^\s*\[?(es|esp|spain)\]?\s*[:|\-·]\s*/, '');
  n = n.replace(/\(.*?\)|\[.*?\]/g, ' ');
  return n
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t && !TOKENS_RUIDO.has(t))
    .join('');
}

function anadir(claves, clave) {
  if (clave && !claves.includes(clave)) claves.push(clave);
}

function anadirConVariantes(claves, clave) {
  if (!clave) return;
  anadir(claves, clave);
  anadir(claves, ALIAS[clave]);
  // "La 1 TVE", "Antena 3 TV" -> también sin el sufijo
  for (const sufijo of ['tve', 'tv', 'canal']) {
    if (clave.endsWith(sufijo) && clave.length > sufijo.length + 1) {
      const sin = clave.slice(0, -sufijo.length);
      anadir(claves, sin);
      anadir(claves, ALIAS[sin]);
    }
  }
}

/**
 * Claves con las que se guarda un canal de la guía (su id y sus nombres). La de TDTChannels usa ids
 * como "La1.TV" o "TDP.TV": además de "la1tv" se guarda "la1" y el alias ("tdp" -> "teledeporte"),
 * para que se encuentren por nombre los canales que no traen id de guía.
 */
export function clavesGuia(nombre) {
  const claves = [];
  const clave = normalizar(nombre);
  if (!clave) return claves;
  claves.push(clave);
  for (const sufijo of ['tv', 'tve']) {
    if (clave.endsWith(sufijo) && clave.length > sufijo.length + 1) anadir(claves, clave.slice(0, -sufijo.length));
  }
  for (const c of [...claves]) anadir(claves, ALIAS[c]);
  return claves;
}

/** Claves con las que se busca un canal de la app: primero su id de guía, después su nombre. */
export function clavesBusqueda(idGuia, nombre) {
  const claves = [];
  if (idGuia) anadirConVariantes(claves, normalizar(idGuia));
  anadirConVariantes(claves, normalizar(nombre));
  return claves;
}

/**
 * Programas de un canal en la guía compacta, o null.
 * Cada programa: { inicio, fin, titulo, categoria, descripcion } con tiempos en milisegundos.
 */
export function programasDe(guia, canal) {
  if (!guia || !guia.claves || !canal) return null;
  for (const clave of clavesBusqueda(canal.epg, canal.nombre)) {
    const gid = guia.claves[clave];
    if (gid != null && guia.canales[gid]) return expandir(guia, gid);
  }
  return null;
}

const cacheExpandidos = new WeakMap();

/** Convierte los programas compactos de un canal ([inicioMin, duracionMin, titulo, categoria, desc]). */
function expandir(guia, gid) {
  let porCanal = cacheExpandidos.get(guia);
  if (!porCanal) {
    porCanal = new Map();
    cacheExpandidos.set(guia, porCanal);
  }
  let lista = porCanal.get(gid);
  if (!lista) {
    lista = guia.canales[gid].programas.map(([ini, dur, titulo, categoria, descripcion]) => ({
      inicio: ini * 60000,
      fin: (ini + dur) * 60000,
      titulo,
      categoria: categoria || '',
      descripcion: descripcion || '',
    }));
    porCanal.set(gid, lista);
  }
  return lista;
}

/** Índice del programa en emisión en `ahora`, o -1. */
export function indiceActual(programas, ahora) {
  if (!programas) return -1;
  for (let i = 0; i < programas.length; i++) {
    if (programas[i].inicio <= ahora && ahora < programas[i].fin) return i;
  }
  return -1;
}
