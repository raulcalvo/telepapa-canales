import * as almacen from '../almacen.js';
import * as datos from '../datos.js';
import * as reproductor from '../reproductor.js';
import { dialogo, el, hora, logoCanal } from '../ui.js';
import { chips, vacio } from './comun.js';

const FAVORITOS = 'favoritos';
const TODOS = '*';
const MEDIA_HORA = 30 * 60000;
const HORAS_VISIBLES = 24;

export const titulo = 'Programación';

let scrollGuardado = null;

export function pintar(contenedor) {
  // Sin favoritos, se empieza por todos los canales para que la parrilla no salga vacía
  const porDefecto = almacen.obtener().favoritos.length ? FAVORITOS : TODOS;
  const filtro = almacen.preferencia('programacion.filtro', porDefecto);
  const opciones = [[FAVORITOS, 'Favoritos'], [TODOS, 'Todos'], ...datos.grupos().map((g) => [g, g])];

  const base = filtro === FAVORITOS ? almacen.obtener().favoritos : datos.todosLosCanales();
  const filas = [];
  const vistos = new Set();
  for (const c of base) {
    if (filtro !== FAVORITOS && filtro !== TODOS && c.grupo !== filtro) continue;
    const progs = datos.programas(c);
    if (!progs || !progs.length || vistos.has(c.id)) continue;
    vistos.add(c.id);
    filas.push({ canal: c, progs });
  }

  const cabecera = chips(opciones, filtro, (v) => {
    scrollGuardado = null;
    almacen.guardarPreferencia('programacion.filtro', v);
  });
  if (!datos.obtener().guia) {
    contenedor.replaceChildren(cabecera, vacio('No se pudo cargar la guía de programación.'));
    return;
  }
  if (filas.length === 0) {
    contenedor.replaceChildren(
      cabecera,
      vacio(filtro === FAVORITOS ? 'Ninguno de tus favoritos tiene guía de programación.' : 'No hay guía para estos canales.'),
    );
    return;
  }

  const ahora = Date.now();
  const inicio = Math.floor((ahora - MEDIA_HORA) / MEDIA_HORA) * MEDIA_HORA;
  const ultimo = Math.max(...filas.map((f) => f.progs[f.progs.length - 1].fin));
  const fin = Math.min(ultimo, inicio + HORAS_VISIBLES * 3600000);
  const minutos = Math.max(60, Math.ceil((fin - inicio) / 60000));

  const parrilla = el('div', { class: 'parrilla' });
  const ancho = (min) => `calc(var(--minuto) * ${min})`;

  const horas = el('div', { class: 'parrilla-horas', style: { width: ancho(minutos) } });
  for (let t = inicio; t < inicio + minutos * 60000; t += MEDIA_HORA) horas.append(el('span', {}, hora(t)));

  const interior = el('div', { class: 'parrilla-interior' }, horas);
  for (const { canal, progs } of filas) {
    const programas = el('div', { class: 'parrilla-programas', style: { width: ancho(minutos) } });
    for (const p of progs) {
      if (p.fin <= inicio || p.inicio >= inicio + minutos * 60000) continue;
      const desde = Math.max(0, (p.inicio - inicio) / 60000);
      const duracion = Math.min(minutos, (p.fin - inicio) / 60000) - desde;
      const enEmision = p.inicio <= ahora && ahora < p.fin;
      programas.append(
        el('button', {
          type: 'button',
          class: `parrilla-programa${enEmision ? ' ahora' : ''}`,
          style: { left: ancho(desde), width: `calc(${ancho(duracion)} - 2px)` },
          title: `${hora(p.inicio)} ${p.titulo}`,
          onclick: () => mostrarPrograma(canal, p),
        }, el('b', {}, p.titulo), el('small', {}, `${hora(p.inicio)} - ${hora(p.fin)}`)),
      );
    }
    interior.append(
      el('div', { class: 'parrilla-fila' },
        el('button', { type: 'button', class: 'parrilla-canal', onclick: () => reproductor.abrir(canal), title: `Ver ${canal.nombre}` },
          logoCanal(canal), el('span', {}, canal.nombre)),
        programas,
      ),
    );
  }
  const linea = el('div', { class: 'parrilla-ahora', style: { left: `calc(var(--columna) + ${ancho((ahora - inicio) / 60000)})` } });
  interior.append(linea);
  parrilla.append(interior);
  parrilla.addEventListener('scroll', () => {
    scrollGuardado = { x: parrilla.scrollLeft, y: parrilla.scrollTop };
  }, { passive: true });

  // La parrilla empieza en la media hora anterior a la actual: "Ahora" es volver al principio
  const irAhora = () => {
    parrilla.scrollLeft = 0;
  };
  const botonAhora = el('button', { type: 'button', class: 'boton', onclick: () => irAhora() }, 'Ahora');

  contenedor.replaceChildren(cabecera, el('div', { class: 'barra' }, botonAhora), parrilla);
  requestAnimationFrame(() => {
    if (scrollGuardado) {
      parrilla.scrollLeft = scrollGuardado.x;
      parrilla.scrollTop = scrollGuardado.y;
    } else {
      irAhora();
    }
  });
}

function mostrarPrograma(canal, p) {
  const contenido = el('div', {},
    el('p', { class: 'suave' }, `${canal.nombre} · ${hora(p.inicio)} - ${hora(p.fin)}${p.categoria ? ` · ${p.categoria}` : ''}`),
    p.descripcion ? el('p', {}, p.descripcion) : null,
  );
  dialogo(p.titulo, contenido, [
    { texto: 'Cerrar', valor: null },
    { texto: 'Ver canal', valor: 'ver', clase: 'principal' },
  ]).then((v) => {
    if (v === 'ver') reproductor.abrir(canal);
  });
}
