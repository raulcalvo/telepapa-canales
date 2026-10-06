import * as almacen from '../almacen.js';
import { botonIcono, el } from '../ui.js';
import { filaCanal, vacio } from './comun.js';

let ordenando = false;

export const titulo = 'Favoritos';

export function pintar(contenedor) {
  const favoritos = almacen.obtener().favoritos;
  if (favoritos.length === 0) {
    ordenando = false;
    contenedor.replaceChildren(
      vacio('Aún no tienes favoritos. Pulsa la estrella de un canal en Canales para tenerlo aquí.'),
      el('p', { style: { textAlign: 'center' } }, el('a', { class: 'boton principal', href: '#canales' }, 'Ver canales')),
    );
    return;
  }
  const barra = el(
    'div',
    { class: 'barra' },
    el('button', { type: 'button', class: 'boton', 'aria-pressed': String(ordenando), onclick: () => { ordenando = !ordenando; pintar(contenedor); } },
      ordenando ? 'Listo' : 'Ordenar'),
  );
  const lista = el(
    'ul',
    { class: 'lista' },
    favoritos.map((c, i) =>
      filaCanal(c, {
        extra: ordenando
          ? [
              botonIcono('arriba', 'Subir', () => almacen.moverFavorito(c.id, -1), { disabled: i === 0 }),
              botonIcono('abajo', 'Bajar', () => almacen.moverFavorito(c.id, 1), { disabled: i === favoritos.length - 1 }),
            ]
          : [],
      }),
    ),
  );
  contenedor.replaceChildren(barra, lista);
}
