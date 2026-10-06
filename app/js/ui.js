// Utilidades de interfaz: creación de elementos (siempre con textContent, nunca HTML de terceros),
// iconos, diálogos y avisos.

const SVG = 'http://www.w3.org/2000/svg';

/** Iconos (Material Symbols, Apache-2.0), como trazados SVG. */
const ICONOS = {
  estrella: 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  estrellaVacia:
    'm22 9.24-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28z',
  guia: 'M3 5v14h18V5zm8 12H5V7h6zm8 0h-6v-4h6zm0-6h-6V7h6z',
  tele: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2m0 14H3V5h18z',
  calendario:
    'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 16H5V10h14zM9 14H7v-2h2zm4 0h-2v-2h2zm4 0h-2v-2h2zm-8 4H7v-2h2zm4 0h-2v-2h2zm4 0h-2v-2h2z',
  ajustes:
    'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6',
  cerrar: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  info: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8',
  arriba: 'M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z',
  abajo: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z',
  borrar: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z',
  abrir: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z',
  compartir:
    'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92',
};

export function icono(nombre) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONOS[nombre] || '');
  svg.append(path);
  return svg;
}

/** Rellena los <span data-icono="..."> del HTML estático. */
export function pintarIconos(raiz = document) {
  for (const span of raiz.querySelectorAll('[data-icono]')) {
    if (!span.firstChild) span.append(icono(span.dataset.icono));
  }
}

/**
 * Crea un elemento. `props`: atributos y propiedades (on* = eventos, class, dataset, style).
 * Los hijos pueden ser nodos, textos o listas; null/false se ignoran.
 */
export function el(etiqueta, props = {}, ...hijos) {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  anadirHijos(e, hijos);
  return e;
}

function anadirHijos(e, hijos) {
  for (const h of hijos) {
    if (h == null || h === false) continue;
    if (Array.isArray(h)) anadirHijos(e, h);
    else e.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
}

export function botonIcono(nombre, etiqueta, onclick, extra = {}) {
  return el('button', { type: 'button', class: 'boton-icono', 'aria-label': etiqueta, title: etiqueta, onclick, ...extra }, icono(nombre));
}

/** Logo de canal desde internet, con un icono genérico si no hay o no carga. */
export function logoCanal(canal, clase = 'logo') {
  const generico = () => el('span', { class: 'logo-generico', 'aria-hidden': 'true' }, icono('tele'));
  if (!canal.logo) return generico();
  const img = el('img', { class: clase, src: canal.logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(generico()), { once: true });
  return img;
}

/** Aviso breve en la parte de abajo. */
export function avisar(texto, ms = 3500) {
  const caja = document.getElementById('avisos');
  if (!caja) return;
  const a = el('div', { class: 'aviso' }, texto);
  caja.append(a);
  setTimeout(() => a.remove(), ms);
}

/**
 * Diálogo modal. `botones`: [{texto, valor, clase}]. Devuelve una promesa con el valor del botón
 * pulsado (o null si se cierra).
 */
export function dialogo(titulo, contenido, botones = [{ texto: 'Cerrar', valor: null }]) {
  return new Promise((resolver) => {
    const d = el('dialog', { 'aria-label': titulo });
    const pie = el('div', { class: 'dialogo-botones' });
    for (const b of botones) {
      pie.append(
        el('button', { type: 'button', class: `boton ${b.clase || ''}`, onclick: () => d.close(String(botones.indexOf(b))) }, b.texto),
      );
    }
    d.append(el('h2', {}, titulo), contenido, pie);
    d.addEventListener('close', () => {
      const i = Number.parseInt(d.returnValue, 10);
      d.remove();
      resolver(Number.isInteger(i) && botones[i] ? botones[i].valor : null);
    });
    d.addEventListener('click', (ev) => {
      if (ev.target === d) d.close();
    });
    document.body.append(d);
    d.showModal();
  });
}

export function confirmar(titulo, texto, aceptar = 'Aceptar') {
  return dialogo(titulo, el('p', {}, texto), [
    { texto: 'Cancelar', valor: false },
    { texto: aceptar, valor: true, clase: 'principal' },
  ]);
}

/** "Quedan 25 min", "Quedan 1 h 5 min". */
export function textoRestante(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min < 60) return `Quedan ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `Quedan ${h} h` : `Quedan ${h} h ${m} min`;
}

const fmtHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

export function hora(ms) {
  return fmtHora.format(new Date(ms));
}

/** Copia un texto al portapapeles. */
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
