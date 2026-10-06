# telepapa-canales

Web pública (GitHub Pages) de la app **TelePapa** para Android y Android TV:

- [`listas.json`](listas.json): qué listas públicas de canales carga la app, qué canales se excluyen, servidores verificados y correo de contacto (`contacto.correo`, lo usan la app y esta web).
- [`index.html`](index.html): explicación, fuentes y protocolo `telepapa://anadir`.
- [`derechos.json`](derechos.json): qué plataforma oficial tiene los derechos de cada competición en España (mantenido a mano).
- [`partidos.json`](partidos.json): calendario de esas competiciones, de [football-data.org](https://www.football-data.org). Lo genera cada 6 horas `.github/workflows/partidos.yml` con `tools/partidos.js` (necesita el secreto `FOOTBALL_DATA_TOKEN`).
- [`app/`](app/): versión web (PWA) de TelePapa. HTML, CSS y JavaScript sin dependencias de compilación; `app/js/nucleo/` tiene la lógica pura (validación de direcciones, guía y agenda), que también usan las herramientas y las pruebas (`node --test tools/test/*.test.mjs`). Reproduce HLS con [hls.js](https://github.com/video-dev/hls.js) (`app/vendor/`, licencia Apache-2.0).
- `datos/`: canales y guía de programación en un formato que la web puede leer. No se guarda en el repositorio: lo genera `tools/datos.mjs` en `.github/workflows/publicar.yml`, que publica la web en GitHub Pages cada 4 horas y en cada cambio.
- [`privacidad.html`](privacidad.html): política de privacidad (enlazada desde Google Play).

TelePapa no aloja ni emite canales. Las listas pertenecen a sus autores (TDTChannels).
