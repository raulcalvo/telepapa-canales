// Arranque de la app: navegación entre secciones, enlaces para añadir canales y refresco periódico.

import * as almacen from './almacen.js';
import * as datos from './datos.js';
import * as reproductor from './reproductor.js';
import { leerEnlace } from './enlaces.js';
import { avisar, dialogo, el, logoCanal, pintarIconos } from './ui.js';
import { motivoCanalNoValido } from './vistas/ajustes.js';
import * as ajustes from './vistas/ajustes.js';
import * as agenda from './vistas/agenda.js';
import * as canales from './vistas/canales.js';
import * as favoritos from './vistas/favoritos.js';
import * as programacion from './vistas/programacion.js';

const SECCIONES = { favoritos, programacion, canales, agenda, ajustes };
const PORTADA = 'favoritos';
const REFRESCO_DATOS = 30 * 60000;

const contenido = document.getElementById('contenido');
const tituloSeccion = document.getElementById('titulo-seccion');
let seccionActual = null;

function seccionDelHash() {
  const nombre = location.hash.replace(/^#/, '').split('?')[0];
  return SECCIONES[nombre] ? nombre : null;
}

function pintar({ conservarScroll = true } = {}) {
  const nombre = seccionActual || PORTADA;
  const vista = SECCIONES[nombre];
  const scroll = window.scrollY;
  tituloSeccion.textContent = vista.titulo;
  document.title = `${vista.titulo} · TelePapa`;
  for (const a of document.querySelectorAll('.navegacion a')) {
    if (a.dataset.seccion === nombre) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  vista.pintar(contenido);
  if (conservarScroll) window.scrollTo(0, scroll);
}

function irA(nombre) {
  const cambia = nombre !== seccionActual;
  seccionActual = nombre;
  pintar({ conservarScroll: !cambia });
  if (cambia) window.scrollTo(0, 0);
}

/** Pide confirmación antes de guardar los canales de un enlace #anadir / #anadir-varios. */
async function procesarEnlace(hash) {
  const enlace = leerEnlace(hash);
  if (!enlace) return false;
  history.replaceState(null, '', `#${PORTADA}`);
  const validos = enlace.canales.filter((c) => !motivoCanalNoValido(c.url));
  const rechazados = enlace.rechazados + enlace.canales.length - validos.length;
  if (!validos.length) {
    await dialogo('Añadir canales', el('p', {}, 'El enlace no contiene ningún canal válido.'));
    return true;
  }
  const lista = el('ul', { class: 'lista' },
    validos.slice(0, 50).map((c) => el('li', { class: 'fila-canal' }, logoCanal(c), el('div', { class: 'datos-canal' }, el('div', { class: 'nombre-canal' }, c.nombre)))),
  );
  const contenidoDialogo = el('div', {},
    el('p', {}, enlace.sincronizar
      ? `Tus favoritos pasarán a ser exactamente estos ${validos.length} canales.`
      : validos.length === 1 ? 'Se añadirá este canal a tus favoritos:' : `Se añadirán estos ${validos.length} canales a tus favoritos:`),
    lista,
    validos.length > 50 ? el('p', { class: 'suave' }, `…y ${validos.length - 50} más.`) : null,
    rechazados ? el('p', { class: 'suave pequeno' }, `${rechazados} no se añadirán porque su dirección no es válida o no es de un servidor verificado.`) : null,
  );
  const ok = await dialogo('Añadir canales', contenidoDialogo, [
    { texto: 'Cancelar', valor: false },
    { texto: enlace.sincronizar ? 'Sustituir favoritos' : 'Añadir', valor: true, clase: 'principal' },
  ]);
  if (ok) {
    if (enlace.sincronizar) almacen.sustituirFavoritos(validos);
    else almacen.anadirLote(validos, true);
    avisar(validos.length === 1 ? `«${validos[0].nombre}» añadido` : `${validos.length} canales añadidos`);
  }
  return true;
}

async function alCambiarHash() {
  if (await procesarEnlace(location.hash)) {
    irA(PORTADA);
    return;
  }
  const nombre = seccionDelHash();
  if (nombre) irA(nombre);
  else if (!seccionActual) irA(PORTADA);
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function iniciar() {
  pintarIconos();
  almacen.suscribir(() => pintar());
  datos.suscribir(() => seccionActual && pintar());
  window.addEventListener('hashchange', alCambiarHash);

  await datos.cargar();
  const d = datos.obtener();
  if (!d.canales && !d.guia) avisar('No se pudieron cargar los canales. Revisa la conexión.', 6000);
  await alCambiarHash();

  // Refresco del "ahora" cada minuto (salvo si se está escribiendo) y de los datos cada media hora
  setInterval(() => {
    const escribiendo = document.activeElement?.matches?.('input, textarea, select');
    if (!escribiendo && !reproductor.abierto() && !document.hidden && !document.querySelector('dialog[open]')) pintar();
  }, 60000);
  setInterval(() => !document.hidden && datos.cargar(), REFRESCO_DATOS);

  registrarServiceWorker();
  almacen.pedirAlmacenamientoPersistente();
}

iniciar();
