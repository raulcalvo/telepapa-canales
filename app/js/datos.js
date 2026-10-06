// Datos públicos que lee la app desde esta misma web: configuración (listas.json), canales y guía
// preparados por tools/datos.mjs, derechos.json y partidos.json.

import { programasDe } from './nucleo/guia.js';
import { esCorreo } from './nucleo/texto.js';
import * as almacen from './almacen.js';

const RUTAS = {
  config: '../listas.json',
  canales: '../datos/canales.json',
  guia: '../datos/guia.json',
  derechos: '../derechos.json',
  partidos: '../partidos.json',
};

const datos = {
  config: null,
  canales: null,
  guia: null,
  derechos: null,
  partidos: null,
  errores: [],
};

const oyentes = new Set();

export function suscribir(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

async function leerJson(ruta) {
  const res = await fetch(ruta, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Carga todo en paralelo; lo que falle se queda a null y se apunta en `errores`. */
export async function cargar() {
  datos.errores = [];
  await Promise.all(
    Object.entries(RUTAS).map(async ([clave, ruta]) => {
      try {
        datos[clave] = await leerJson(ruta);
      } catch (e) {
        datos.errores.push(`${clave}: ${e.message}`);
      }
    }),
  );
  for (const f of oyentes) f(datos);
  return datos;
}

export function obtener() {
  return datos;
}

/** Canales de las listas públicas. */
export function canalesDeListas() {
  return (datos.canales?.canales || []).map((c) => ({ ...c, origen: 'lista' }));
}

/** Todos los canales: los añadidos por el usuario primero y después los de las listas. */
export function todosLosCanales() {
  const propios = almacen.obtener().propios;
  const ids = new Set(propios.map((c) => c.id));
  return [...propios, ...canalesDeListas().filter((c) => !ids.has(c.id))];
}

export function programas(canal) {
  return programasDe(datos.guia, canal);
}

/** Servidores de emisión verificados (para canales añadidos a mano o por enlace). */
export function dominios() {
  return Array.isArray(datos.config?.dominios) ? datos.config.dominios : [];
}

/** Correo de contacto publicado en listas.json ("contacto.correo"), o null. */
export function correoContacto() {
  const c = datos.config?.contacto?.correo;
  return esCorreo(c) ? c : null;
}

/** Grupos (ámbitos) de las listas, en su orden. */
export function grupos() {
  const vistos = [];
  for (const c of datos.canales?.canales || []) if (c.grupo && !vistos.includes(c.grupo)) vistos.push(c.grupo);
  return vistos;
}

export function fuentesGuia() {
  return datos.guia?.fuentes || [];
}
