import { paraBuscar } from '../nucleo/texto.js';
import * as almacen from '../almacen.js';
import * as datos from '../datos.js';
import { el } from '../ui.js';
import { chips, filaCanal, vacio } from './comun.js';

const TODOS = '*';
const PROPIOS = 'propios';
const MAX_FILAS = 400;

let busqueda = '';

export const titulo = 'Canales';

export function pintar(contenedor) {
  const filtro = almacen.preferencia('canales.filtro', TODOS);
  const propios = almacen.obtener().propios;
  const opciones = [[TODOS, 'Todos']];
  if (propios.length) opciones.push([PROPIOS, 'Añadidos por ti']);
  for (const g of datos.grupos()) opciones.push([g, g]);

  const buscador = el('input', {
    class: 'campo',
    type: 'search',
    placeholder: 'Buscar canal',
    'aria-label': 'Buscar canal',
    value: busqueda,
  });
  const lista = el('ul', { class: 'lista' });
  const pintarLista = () => {
    const q = paraBuscar(busqueda);
    const visibles = datos
      .todosLosCanales()
      .filter((c) => filtro === TODOS || (filtro === PROPIOS ? c.origen === 'propio' : c.grupo === filtro))
      .filter((c) => !q || paraBuscar(c.nombre).includes(q));
    if (visibles.length === 0) {
      lista.replaceChildren(vacio(datos.obtener().canales ? 'No hay canales que coincidan.' : 'No se pudieron cargar los canales.'));
      return;
    }
    lista.replaceChildren(...visibles.slice(0, MAX_FILAS).map((c) => filaCanal(c, { siguiente: false })));
  };
  buscador.addEventListener('input', () => {
    busqueda = buscador.value;
    pintarLista();
  });

  contenedor.replaceChildren(
    el('div', { class: 'barra' }, buscador),
    chips(opciones, filtro, (v) => {
      almacen.guardarPreferencia('canales.filtro', v);
    }),
    lista,
  );
  pintarLista();
}
