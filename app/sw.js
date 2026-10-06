// Service worker: guarda la app para abrirla sin conexión y la última copia de los datos.
// Las emisiones y las imágenes de otros servidores no pasan por aquí.

const VERSION = 'telepapa-v1';
const APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/ui.js',
  './js/almacen.js',
  './js/datos.js',
  './js/enlaces.js',
  './js/reproductor.js',
  './js/nucleo/texto.js',
  './js/nucleo/guia.js',
  './js/nucleo/agenda.js',
  './js/vistas/comun.js',
  './js/vistas/favoritos.js',
  './js/vistas/canales.js',
  './js/vistas/programacion.js',
  './js/vistas/agenda.js',
  './js/vistas/ajustes.js',
  './js/vistas/legal.js',
  './vendor/hls.min.js',
  './iconos/icono-192.png',
  './iconos/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Red primero (para tener siempre lo último) y, sin conexión, la copia guardada. */
async function redPrimero(peticion) {
  const cache = await caches.open(VERSION);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (e) {
    const guardada = await cache.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;
    throw e;
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(redPrimero(e.request));
});
