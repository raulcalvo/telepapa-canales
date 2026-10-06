// Estado del usuario guardado en el propio navegador (localStorage): favoritos, canales añadidos
// a mano o por enlace y preferencias. No sale del dispositivo salvo que el usuario lo exporte.

import { idDeUrl, limitar, logoValido, motivoUrlNoValida } from './nucleo/texto.js';

const CLAVE = 'telepapa.estado.v1';
const VERSION = 1;

const oyentes = new Set();
let estado = leer();

function vacio() {
  return { version: VERSION, favoritos: [], propios: [], preferencias: {} };
}

function leer() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    return guardado ? sanear(guardado) : vacio();
  } catch {
    return vacio();
  }
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {
    // Sin almacenamiento (modo privado o lleno): se sigue con el estado en memoria
  }
  for (const f of oyentes) f(estado);
}

/** Canal en el formato guardado; null si no es válido. */
export function canalValido(c, origen) {
  if (!c || typeof c !== 'object') return null;
  const url = limitar(c.url, 4096);
  if (motivoUrlNoValida(url)) return null;
  const nombre = limitar(c.nombre, 80) || 'Canal';
  return {
    id: typeof c.id === 'string' && /^[0-9a-f]{16}$/.test(c.id) ? c.id : idDeUrl(url),
    nombre,
    url,
    logo: logoValido(c.logo) || undefined,
    grupo: limitar(c.grupo, 60) || undefined,
    epg: limitar(c.epg, 80) || undefined,
    origen: origen || (c.origen === 'lista' ? 'lista' : 'propio'),
  };
}

function sanear(e) {
  const r = vacio();
  const unicos = (lista, origen) => {
    const vistos = new Set();
    const salida = [];
    for (const c of Array.isArray(lista) ? lista : []) {
      const v = canalValido(c, origen);
      if (v && !vistos.has(v.id)) {
        vistos.add(v.id);
        salida.push(v);
      }
    }
    return salida;
  };
  r.favoritos = unicos(e.favoritos);
  r.propios = unicos(e.propios, 'propio');
  r.preferencias = e.preferencias && typeof e.preferencias === 'object' ? e.preferencias : {};
  return r;
}

export function obtener() {
  return estado;
}

export function suscribir(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export function esFavorito(id) {
  return estado.favoritos.some((c) => c.id === id);
}

export function alternarFavorito(canal) {
  if (esFavorito(canal.id)) {
    estado.favoritos = estado.favoritos.filter((c) => c.id !== canal.id);
  } else {
    const v = canalValido(canal, canal.origen);
    if (v) estado.favoritos.push(v);
  }
  guardar();
  return esFavorito(canal.id);
}

export function moverFavorito(id, desplazamiento) {
  const i = estado.favoritos.findIndex((c) => c.id === id);
  const j = i + desplazamiento;
  if (i < 0 || j < 0 || j >= estado.favoritos.length) return;
  const [c] = estado.favoritos.splice(i, 1);
  estado.favoritos.splice(j, 0, c);
  guardar();
}

/** Guarda (o actualiza) un canal añadido por el usuario; los favoritos con el mismo id se actualizan. */
function guardarPropioSinAvisar(canal) {
  const v = canalValido(canal, 'propio');
  if (!v) return null;
  const i = estado.propios.findIndex((c) => c.id === v.id);
  if (i >= 0) estado.propios[i] = v;
  else estado.propios.push(v);
  estado.favoritos = estado.favoritos.map((c) => (c.id === v.id ? v : c));
  return v;
}

export function guardarPropio(canal) {
  const v = guardarPropioSinAvisar(canal);
  guardar();
  return v;
}

export function borrarPropio(id) {
  estado.propios = estado.propios.filter((c) => c.id !== id);
  estado.favoritos = estado.favoritos.filter((c) => c.id !== id);
  guardar();
}

/** Añade varios canales; como favoritos si se pide. */
export function anadirLote(canales, comoFavoritos) {
  for (const c of canales) {
    const v = guardarPropioSinAvisar(c);
    if (v && comoFavoritos && !esFavorito(v.id)) estado.favoritos.push(v);
  }
  guardar();
}

/** Guarda los canales y deja los favoritos exactamente como la lista (en su orden). */
export function sustituirFavoritos(canales) {
  const nuevos = [];
  for (const c of canales) {
    const v = guardarPropioSinAvisar(c);
    if (v && !nuevos.some((x) => x.id === v.id)) nuevos.push(v);
  }
  estado.favoritos = nuevos;
  guardar();
}

export function preferencia(clave, porDefecto) {
  return clave in estado.preferencias ? estado.preferencias[clave] : porDefecto;
}

export function guardarPreferencia(clave, valor) {
  estado.preferencias[clave] = valor;
  guardar();
}

/** Copia de seguridad en JSON. */
export function exportar() {
  return JSON.stringify({ app: 'telepapa', ...estado, exportado: new Date().toISOString() }, null, 2);
}

/** Restaura una copia de seguridad. Lanza un error si el contenido no es válido. */
export function importar(texto) {
  const datos = JSON.parse(texto);
  if (!datos || datos.app !== 'telepapa') throw new Error('El archivo no es una copia de TelePapa');
  estado = sanear(datos);
  guardar();
  return estado;
}

/** Pide al navegador que no borre los datos de la app por falta de espacio. */
export async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // No disponible
  }
}
