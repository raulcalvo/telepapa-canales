// Reproductor: emisiones HLS (nativo en Safari, hls.js en el resto) y enlaces de otras apps,
// que se entregan al sistema para que los abra la app que corresponda.

import { esEmision, esquema, servidor, servidorPermitido } from './nucleo/texto.js';
import { indiceActual } from './nucleo/guia.js';
import * as almacen from './almacen.js';
import * as datos from './datos.js';
import { avisar, botonIcono, copiar, el, hora, icono } from './ui.js';
import { enlaceParaCompartir } from './enlaces.js';

let hlsCargado = null;
let actual = null;

function cargarHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  hlsCargado ||= new Promise((resolver, rechazar) => {
    const s = el('script', { src: 'vendor/hls.min.js' });
    s.onload = () => resolver(window.Hls);
    s.onerror = () => rechazar(new Error('No se pudo cargar el reproductor'));
    document.head.append(s);
  });
  return hlsCargado;
}

const esAndroid = /Android/i.test(navigator.userAgent);

/** Abre un canal: lo reproduce o, si es un enlace de otra app, se lo pasa al sistema. */
export function abrir(canal) {
  if (!esEmision(canal.url)) {
    abrirEnlaceExterno(canal);
    return;
  }
  reproducir(canal);
}

function abrirEnlaceExterno(canal) {
  // Debe ocurrir dentro del gesto del usuario (el toque en el canal)
  const a = el('a', { href: canal.url, rel: 'noopener noreferrer' });
  document.body.append(a);
  a.click();
  a.remove();
  avisar(`Abriendo «${canal.nombre}» en otra app. Si no se abre, instala una app que admita este enlace.`, 5000);
}

/** Enlace para abrir la emisión con otra app del móvil (reproductores de vídeo de Android). */
function enlaceOtraApp(url) {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};type=video/*;end`;
}

function reproducir(canal) {
  cerrar();
  const video = el('video', { controls: true, autoplay: true, playsinline: true });
  const titulo = el('div', { class: 'reproductor-titulo' }, el('b', {}, canal.nombre), el('small', {}, textoPrograma(canal)));
  const estado = el('div', { class: 'reproductor-estado' }, el('p', {}, 'Sintonizando…'));
  const fav = botonIcono(almacen.esFavorito(canal.id) ? 'estrella' : 'estrellaVacia', 'Favorito', () => {
    const ahora = almacen.alternarFavorito(canal);
    fav.replaceChildren(icono(ahora ? 'estrella' : 'estrellaVacia'));
    fav.classList.toggle('activo', ahora);
    avisar(ahora ? 'Añadido a favoritos' : 'Quitado de favoritos');
  }, { class: `boton-icono${almacen.esFavorito(canal.id) ? ' activo' : ''}` });
  const capa = el(
    'div',
    { class: 'reproductor', role: 'dialog', 'aria-label': `Reproduciendo ${canal.nombre}` },
    el('div', { class: 'reproductor-barra' },
      botonIcono('cerrar', 'Cerrar', () => history.back()),
      titulo,
      botonIcono('compartir', 'Compartir canal', () => compartir(canal)),
      fav,
    ),
    video,
    estado,
  );
  document.body.append(capa);
  document.body.style.overflow = 'hidden';
  history.pushState({ reproductor: true }, '');
  actual = { capa, video, hls: null };

  const fallo = (motivo) => mostrarFallo(estado, canal, motivo);
  video.addEventListener('playing', () => estado.replaceChildren(), { once: false });
  video.addEventListener('waiting', () => estado.replaceChildren(el('p', {}, 'Cargando…')));

  if (location.protocol === 'https:' && esquema(canal.url) === 'http') {
    fallo('Esta emisión no es segura (http) y el navegador no deja reproducirla dentro de una web.');
    return;
  }
  if (canal.origen !== 'lista' && !servidorPermitido(canal.url, datos.dominios())) {
    fallo(`El servidor ${servidor(canal.url) || ''} no está entre los verificados, así que no se reproduce aquí.`);
    return;
  }
  if (/\.mpd(\?|$)/i.test(canal.url)) {
    fallo('Este formato de emisión no se puede reproducir en el navegador.');
    return;
  }

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = canal.url;
    video.addEventListener('error', () => fallo('La emisión no está disponible ahora.'), { once: true });
    video.play().catch(() => {});
    return;
  }
  cargarHls()
    .then((Hls) => {
      if (!actual || actual.video !== video) return;
      if (!Hls.isSupported()) {
        fallo('Este navegador no puede reproducir emisiones en directo.');
        return;
      }
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      actual.hls = hls;
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        fallo(
          d.type === Hls.ErrorTypes.NETWORK_ERROR
            ? 'No se puede cargar la emisión desde la web. Puede que el canal no esté emitiendo o que su servidor no permita verlo desde un navegador.'
            : 'La emisión no está disponible ahora.',
        );
        hls.destroy();
      });
      hls.loadSource(canal.url);
      hls.attachMedia(video);
      video.play().catch(() => {});
    })
    .catch((e) => fallo(e.message));
}

function mostrarFallo(estado, canal, motivo) {
  const acciones = el('div', { class: 'acciones' });
  if (esAndroid) {
    acciones.append(el('a', { class: 'boton', href: enlaceOtraApp(canal.url), rel: 'noopener' }, icono('abrir'), 'Abrir con otra app'));
  }
  acciones.append(
    el('button', { type: 'button', class: 'boton', onclick: async () => avisar((await copiar(canal.url)) ? 'Dirección copiada' : 'No se pudo copiar') }, 'Copiar dirección'),
  );
  estado.replaceChildren(el('p', {}, motivo), acciones);
}

function textoPrograma(canal) {
  const progs = datos.programas(canal);
  const i = indiceActual(progs, Date.now());
  if (i < 0) return '';
  const p = progs[i];
  return `${p.titulo} · hasta las ${hora(p.fin)}`;
}

async function compartir(canal) {
  const url = enlaceParaCompartir([canal]);
  if (navigator.share) {
    try {
      await navigator.share({ title: canal.nombre, text: `Añade «${canal.nombre}» a TelePapa`, url });
      return;
    } catch {
      // Cancelado o no disponible: se copia
    }
  }
  avisar((await copiar(url)) ? 'Enlace copiado' : 'No se pudo copiar el enlace');
}

/** Cierra el reproductor si está abierto. */
export function cerrar() {
  if (!actual) return;
  actual.hls?.destroy();
  actual.video.pause();
  actual.video.removeAttribute('src');
  actual.video.load();
  actual.capa.remove();
  document.body.style.overflow = '';
  actual = null;
}

export function abierto() {
  return actual != null;
}

window.addEventListener('popstate', () => cerrar());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && actual) history.back();
});
