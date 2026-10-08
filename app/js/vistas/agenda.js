import { combinarConCalendario, eventosDesdeGuia, fechaDe, iniciales, leerDerechos } from '../nucleo/agenda.js';
import { esEmision, paraBuscar } from '../nucleo/texto.js';
import * as almacen from '../almacen.js';
import * as datos from '../datos.js';
import * as reproductor from '../reproductor.js';
import { botonIcono, el, icono, logoCanal } from '../ui.js';
import { chips, vacio } from './comun.js';
import { mostrarAvisoLegal } from './legal.js';

const TODOS = '*';
const fmtDia = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' });

let busqueda = '';
let cache = { clave: null, eventos: [] };

export const titulo = 'Agenda';

/** Eventos de la agenda (se recalculan solo si cambian los datos o los canales). */
function eventos() {
  const d = datos.obtener();
  const canales = datos.todosLosCanales();
  const clave = [d.guia?.generado, d.partidos?.actualizado, d.motor?.actualizado, d.derechos?.version, canales.length, almacen.obtener().favoritos.length].join('|');
  if (cache.clave === clave) return cache.eventos;
  const vistos = new Set();
  const entradas = [];
  for (const c of [...almacen.obtener().favoritos, ...canales]) {
    // Solo canales que se reproducen en la propia app: los enlaces que abren otra app no se asocian a eventos
    if (vistos.has(c.id) || !esEmision(c.url)) continue;
    vistos.add(c.id);
    const programas = datos.programas(c);
    if (programas) entradas.push({ canal: c, programas });
  }
  const lista = combinarConCalendario(eventosDesdeGuia(entradas), leerDerechos(d.derechos), d.partidos, d.motor);
  cache = { clave, eventos: lista };
  return lista;
}

function etiquetaDia(fecha, hoy, manana) {
  if (fecha === hoy) return 'Hoy';
  if (fecha === manana) return 'Mañana';
  const [a, m, d] = fecha.split('-').map(Number);
  const texto = fmtDia.format(new Date(Date.UTC(a, m - 1, d, 12)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function pintar(contenedor) {
  const ahora = Date.now();
  const hoy = fechaDe(ahora);
  const manana = fechaDe(ahora + 86400000);
  const todos = eventos().filter((e) => e.fin > ahora);

  const dia = almacen.preferencia('agenda.dia', TODOS);
  const deporte = almacen.preferencia('agenda.deporte', TODOS);
  const soloAbierto = almacen.preferencia('agenda.soloAbierto', false);

  const dias = [...new Set(todos.map((e) => e.fecha))];
  const deportes = [...new Set(todos.map((e) => e.deporte))].sort((a, b) => a.localeCompare(b, 'es'));

  const buscador = el('input', { class: 'campo', type: 'search', placeholder: 'Buscar equipo o competición', 'aria-label': 'Buscar en la agenda', value: busqueda });
  const lista = el('div', { class: 'lista' });
  const pintarLista = () => {
    const q = paraBuscar(busqueda);
    const visibles = todos.filter(
      (e) =>
        (dia === TODOS || e.fecha === dia) &&
        (deporte === TODOS || e.deporte === deporte) &&
        (!soloAbierto || e.canales.length > 0) &&
        (!q || paraBuscar(`${e.titulo} ${e.competicion} ${e.deporte}`).includes(q)),
    );
    if (!visibles.length) {
      lista.replaceChildren(vacio(todos.length ? 'No hay eventos con estos filtros.' : 'No hay eventos deportivos en la guía para los próximos días.'));
      return;
    }
    const nodos = [];
    let fechaActual = null;
    for (const e of visibles) {
      if (e.fecha !== fechaActual) {
        fechaActual = e.fecha;
        nodos.push(el('h2', { class: 'dia-agenda' }, etiquetaDia(e.fecha, hoy, manana)));
      }
      nodos.push(tarjetaEvento(e, ahora));
    }
    lista.replaceChildren(...nodos);
  };
  buscador.addEventListener('input', () => {
    busqueda = buscador.value;
    pintarLista();
  });

  const conmutador = el('button', {
    type: 'button',
    class: 'chip',
    'aria-pressed': String(soloAbierto),
    onclick: () => almacen.guardarPreferencia('agenda.soloAbierto', !soloAbierto),
  }, 'Solo en abierto');

  contenedor.replaceChildren(
    el('div', { class: 'barra' }, buscador, botonIcono('info', 'Información legal', () => mostrarAvisoLegal())),
    chips([[TODOS, 'Todos los días'], ...dias.map((f) => [f, etiquetaDia(f, hoy, manana)])], dias.includes(dia) ? dia : TODOS,
      (v) => almacen.guardarPreferencia('agenda.dia', v)),
    el('div', { class: 'chips' },
      conmutador,
      ...[[TODOS, 'Todos los deportes'], ...deportes.map((d) => [d, d])].map(([v, t]) =>
        el('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === deporte), onclick: () => almacen.guardarPreferencia('agenda.deporte', v) }, t),
      ),
    ),
    lista,
  );
  pintarLista();
}

function equipo(nombre, escudo, clase) {
  const imagen = escudo
    ? el('img', { class: 'escudo', src: escudo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
    : el('span', { class: 'iniciales', 'aria-hidden': 'true' }, iniciales(nombre));
  if (escudo) imagen.addEventListener('error', () => imagen.replaceWith(el('span', { class: 'iniciales', 'aria-hidden': 'true' }, iniciales(nombre))), { once: true });
  return el('div', { class: `equipo ${clase}` }, imagen, el('span', {}, nombre));
}

function tarjetaEvento(e, ahora) {
  const enDirecto = e.estado === 'EN_DIRECTO' || (e.estado !== 'FINALIZADO' && e.inicio <= ahora && ahora < e.fin);
  const porId = new Map(datos.todosLosCanales().map((c) => [c.id, c]));
  for (const c of almacen.obtener().favoritos) porId.set(c.id, c);

  const cuerpo = e.local && e.visitante
    ? el('div', { class: 'partido' }, equipo(e.local, e.escudoLocal, 'local'), el('span', { class: 'suave' }, '-'), equipo(e.visitante, e.escudoVisitante, 'visitante'))
    : el('div', { class: 'evento-titulo' }, e.titulo);

  const acciones = el('div', { class: 'evento-acciones' });
  for (const id of e.canales) {
    const c = porId.get(id);
    if (c) acciones.append(el('button', { type: 'button', class: 'boton', onclick: () => reproductor.abrir(c) }, logoCanal(c), c.nombre));
  }
  for (const p of e.plataformas) {
    acciones.append(el('a', { class: 'boton', href: p.web, target: '_blank', rel: 'noopener noreferrer' }, `Ver en ${p.nombre}`, icono('abrir')));
  }

  return el(
    'article',
    { class: 'evento' },
    el('div', { class: 'evento-cabecera' },
      el('span', { class: 'evento-hora' }, e.hora),
      enDirecto ? el('span', { class: 'evento-directo' }, 'EN DIRECTO') : null,
      el('span', {}, e.competicion !== e.deporte ? `${e.deporte} · ${e.competicion}` : e.deporte),
    ),
    cuerpo,
    acciones.childElementCount ? acciones : null,
  );
}
