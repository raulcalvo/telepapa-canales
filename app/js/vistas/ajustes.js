import { esEmision, motivoUrlNoValida, servidorPermitido } from '../nucleo/texto.js';
import * as almacen from '../almacen.js';
import * as datos from '../datos.js';
import { enlaceParaCompartir } from '../enlaces.js';
import { avisar, botonIcono, confirmar, copiar, el, logoCanal } from '../ui.js';
import { mostrarAvisoLegal } from './legal.js';

export const titulo = 'Ajustes';

let solicitudInstalacion = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  solicitudInstalacion = e;
});

const fmtFechaHora = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Motivo por el que no se acepta la dirección de un canal añadido por el usuario, o null. */
export function motivoCanalNoValido(url) {
  const motivo = motivoUrlNoValida(url);
  if (motivo) return motivo;
  if (esEmision(url) && !servidorPermitido(url, datos.dominios())) {
    return 'Solo se pueden añadir emisiones de servidores verificados (los de las cadenas oficiales).';
  }
  return null;
}

function tarjeta(tituloTarjeta, ...hijos) {
  return el('section', { class: 'tarjeta' }, el('h2', {}, tituloTarjeta), ...hijos);
}

function formularioAnadir() {
  const nombre = el('input', { class: 'campo', id: 'nuevo-nombre', maxlength: 80, autocomplete: 'off', required: true });
  const url = el('input', { class: 'campo', id: 'nuevo-url', inputmode: 'url', autocomplete: 'off', placeholder: 'https://… o enlace de otra app', required: true });
  const logo = el('input', { class: 'campo', id: 'nuevo-logo', inputmode: 'url', autocomplete: 'off', placeholder: 'https://… (opcional)' });
  const error = el('p', { class: 'pequeno', role: 'alert', style: { color: 'var(--directo)' } });
  const form = el(
    'form',
    {
      onsubmit: (ev) => {
        ev.preventDefault();
        const motivo = !nombre.value.trim() ? 'Escribe un nombre para el canal.' : motivoCanalNoValido(url.value);
        if (motivo) {
          error.textContent = motivo;
          return;
        }
        const canal = almacen.guardarPropio({ nombre: nombre.value, url: url.value, logo: logo.value });
        if (!canal) {
          error.textContent = 'No se pudo guardar el canal.';
          return;
        }
        almacen.esFavorito(canal.id) || almacen.alternarFavorito(canal);
        avisar(`«${canal.nombre}» añadido a favoritos`);
      },
    },
    el('label', { class: 'etiqueta', for: 'nuevo-nombre' }, 'Nombre'), nombre,
    el('label', { class: 'etiqueta', for: 'nuevo-url' }, 'Dirección'), url,
    el('label', { class: 'etiqueta', for: 'nuevo-logo' }, 'Logo'), logo,
    error,
    el('button', { type: 'submit', class: 'boton principal' }, 'Añadir'),
  );
  return tarjeta(
    'Añadir un canal',
    el('p', { class: 'suave pequeno' }, 'Puede ser una emisión oficial (https) o un enlace que abre otra app del dispositivo.'),
    form,
  );
}

function misCanales() {
  const propios = almacen.obtener().propios;
  if (!propios.length) return null;
  return tarjeta(
    'Canales añadidos por ti',
    el('ul', { class: 'lista' },
      propios.map((c) =>
        el('li', { class: 'fila-canal' },
          el('div', { class: 'principal' }, logoCanal(c), el('div', { class: 'datos-canal' }, el('div', { class: 'nombre-canal' }, c.nombre))),
          botonIcono('compartir', `Compartir ${c.nombre}`, async () => avisar((await copiar(enlaceParaCompartir([c]))) ? 'Enlace copiado' : 'No se pudo copiar')),
          botonIcono('borrar', `Borrar ${c.nombre}`, async () => {
            if (await confirmar('Borrar canal', `¿Borrar «${c.nombre}»? También se quita de favoritos.`, 'Borrar')) almacen.borrarPropio(c.id);
          }),
        ),
      ),
    ),
  );
}

function copiaDeSeguridad() {
  const archivo = el('input', { type: 'file', accept: 'application/json,.json', class: 'oculto' });
  archivo.addEventListener('change', async () => {
    const f = archivo.files?.[0];
    archivo.value = '';
    if (!f) return;
    if (!(await confirmar('Restaurar copia', 'Se sustituirán tus favoritos y canales por los de la copia.', 'Restaurar'))) return;
    try {
      almacen.importar(await f.text());
      avisar('Copia restaurada');
    } catch (e) {
      avisar(e.message || 'El archivo no es válido');
    }
  });
  const exportar = () => {
    const blob = new Blob([almacen.exportar()], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `telepapa-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const favoritos = almacen.obtener().favoritos;
  return tarjeta(
    'Tus datos',
    el('p', { class: 'suave pequeno' }, 'Favoritos y canales se guardan solo en este navegador. Haz una copia para pasarlos a otro dispositivo o no perderlos si borras los datos del navegador.'),
    el('div', { class: 'barra' },
      el('button', { type: 'button', class: 'boton', onclick: exportar }, 'Guardar copia'),
      el('button', { type: 'button', class: 'boton', onclick: () => archivo.click() }, 'Restaurar copia'),
      favoritos.length
        ? el('button', {
            type: 'button',
            class: 'boton',
            onclick: async () => avisar((await copiar(enlaceParaCompartir(favoritos))) ? 'Enlace con tus favoritos copiado' : 'No se pudo copiar'),
          }, 'Compartir favoritos')
        : null,
      archivo,
    ),
  );
}

function instalar() {
  const enApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (enApp) return null;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return tarjeta(
    'Instalar TelePapa',
    solicitudInstalacion
      ? el('button', {
          type: 'button',
          class: 'boton principal',
          onclick: async () => {
            solicitudInstalacion.prompt();
            await solicitudInstalacion.userChoice.catch(() => null);
            solicitudInstalacion = null;
          },
        }, 'Instalar en este dispositivo')
      : el('p', { class: 'suave' }, ios
        ? 'En Safari, pulsa Compartir y después «Añadir a pantalla de inicio».'
        : 'Abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».'),
  );
}

function acercaDe() {
  const d = datos.obtener();
  const generada = d.guia?.generado ? `Guía actualizada el ${fmtFechaHora.format(new Date(d.guia.generado))}.` : 'Guía no disponible.';
  const listas = (d.canales?.listas || []).map((l) => el('a', { href: l.web, target: '_blank', rel: 'noopener noreferrer' }, l.nombre));
  return tarjeta(
    'Acerca de',
    el('p', {}, 'TelePapa no aloja ni emite canales: reproduce las emisiones oficiales que publican las propias cadenas.'),
    listas.length ? el('p', {}, 'Canales: ', listas) : null,
    el('p', { class: 'suave pequeno' }, generada),
    el('div', { class: 'barra' },
      el('button', { type: 'button', class: 'boton', onclick: () => mostrarAvisoLegal() }, 'Información legal'),
      el('a', { class: 'boton', href: '../privacidad.html' }, 'Privacidad'),
      el('a', { class: 'boton', href: '../' }, 'Web'),
    ),
  );
}

export function pintar(contenedor) {
  contenedor.replaceChildren(...[formularioAnadir(), misCanales(), copiaDeSeguridad(), instalar(), acercaDe()].filter(Boolean));
}
