// Enlaces para añadir canales a la app desde fuera: https://…/app/#anadir?… . Cualquiera puede
// generarlos; la app siempre pide confirmación antes de guardar nada.
//
//   Uno:    #anadir?nombre=…&url=…&logo=…&epg=…
//   Varios: #anadir-varios?canales=[{"n":nombre,"u":url,"l":logo,"e":epg}]&sincronizar=1
//           ("sincronizar=1" deja los favoritos exactamente como la lista)
//
// Los parámetros van detrás de "#", así que no llegan al servidor de la web.

import { limitar } from './nucleo/texto.js';
import { canalValido } from './almacen.js';

export const MAX_CANALES_LOTE = 500;

const BASE = new URL('./', location.href).href;

function canalDe(nombre, url, logo, epg) {
  return canalValido({ nombre: limitar(nombre, 80), url, logo, epg }, 'propio');
}

/**
 * Lee un enlace de añadir canales a partir del hash de la dirección.
 * @returns {{canales: object[], sincronizar: boolean, rechazados: number}|null}
 */
export function leerEnlace(hash) {
  const m = /^#(anadir|anadir-varios)\?(.*)$/s.exec(hash || '');
  if (!m) return null;
  const p = new URLSearchParams(m[2]);
  if (m[1] === 'anadir') {
    const c = canalDe(p.get('nombre'), p.get('url'), p.get('logo'), p.get('epg'));
    return { canales: c ? [c] : [], sincronizar: false, rechazados: c ? 0 : 1 };
  }
  let lista;
  try {
    lista = JSON.parse(p.get('canales') || '[]');
  } catch {
    lista = null;
  }
  if (!Array.isArray(lista)) return { canales: [], sincronizar: false, rechazados: 1 };
  const porId = new Map();
  let rechazados = 0;
  for (const o of lista.slice(0, MAX_CANALES_LOTE)) {
    const c = o && typeof o === 'object' ? canalDe(o.n, o.u, o.l, o.e) : null;
    if (!c) rechazados++;
    else if (!porId.has(c.id)) porId.set(c.id, c);
  }
  return { canales: [...porId.values()], sincronizar: p.get('sincronizar') === '1', rechazados };
}

/** Enlace para compartir uno o varios canales con otra persona. */
export function enlaceParaCompartir(canales) {
  const sinIncrustar = (logo) => (logo && !logo.startsWith('data:') ? logo : undefined);
  if (canales.length === 1) {
    const c = canales[0];
    const p = new URLSearchParams({ nombre: c.nombre, url: c.url });
    if (sinIncrustar(c.logo)) p.set('logo', c.logo);
    if (c.epg) p.set('epg', c.epg);
    return `${BASE}#anadir?${p}`;
  }
  const lista = canales.map((c) => ({ n: c.nombre, u: c.url, l: sinIncrustar(c.logo), e: c.epg || undefined }));
  return `${BASE}#anadir-varios?${new URLSearchParams({ canales: JSON.stringify(lista) })}`;
}
