// Piezas compartidas por varias pantallas.

import { esEmision } from '../nucleo/texto.js';
import { indiceActual } from '../nucleo/guia.js';
import * as almacen from '../almacen.js';
import * as datos from '../datos.js';
import * as reproductor from '../reproductor.js';
import { avisar, botonIcono, el, hora, logoCanal, textoRestante } from '../ui.js';

/** Fila de un canal: logo, nombre, programa actual con su progreso y estrella de favorito. */
export function filaCanal(canal, { extra = [], siguiente = true } = {}) {
  const ahora = Date.now();
  const progs = datos.programas(canal);
  const i = indiceActual(progs, ahora);
  const info = [el('div', { class: 'nombre-canal' }, canal.nombre)];
  if (i >= 0) {
    const p = progs[i];
    const avance = Math.min(100, ((ahora - p.inicio) / Math.max(1, p.fin - p.inicio)) * 100);
    info.push(
      el('div', { class: 'programa-actual' }, p.titulo),
      el('div', { class: 'progreso', 'aria-label': textoRestante(p.fin - ahora) }, el('span', { style: { width: `${avance}%` } })),
    );
    if (siguiente && progs[i + 1]) {
      info.push(el('div', { class: 'programa-siguiente' }, `Después, ${hora(progs[i + 1].inicio)}: ${progs[i + 1].titulo}`));
    }
  } else if (!esEmision(canal.url)) {
    info.push(el('span', { class: 'etiqueta-enlace' }, 'Se abre con otra app'));
  }

  const fav = almacen.esFavorito(canal.id);
  return el(
    'li',
    { class: 'fila-canal' },
    el('button', { type: 'button', class: 'principal', onclick: () => reproductor.abrir(canal) },
      logoCanal(canal),
      el('div', { class: 'datos-canal' }, info),
    ),
    extra,
    botonIcono(fav ? 'estrella' : 'estrellaVacia', fav ? 'Quitar de favoritos' : 'Añadir a favoritos', (ev) => {
      ev.stopPropagation();
      const ahoraFav = almacen.alternarFavorito(canal);
      avisar(ahoraFav ? `«${canal.nombre}» añadido a favoritos` : `«${canal.nombre}» quitado de favoritos`);
    }, { class: `boton-icono${fav ? ' activo' : ''}` }),
  );
}

/** Fila de chips de selección única. */
export function chips(opciones, seleccionada, alElegir) {
  return el(
    'div',
    { class: 'chips', role: 'group' },
    opciones.map(([valor, texto]) =>
      el('button', { type: 'button', class: 'chip', 'aria-pressed': String(valor === seleccionada), onclick: () => alElegir(valor) }, texto),
    ),
  );
}

export function vacio(texto) {
  return el('p', { class: 'vacio' }, texto);
}
