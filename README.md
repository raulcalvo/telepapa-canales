# telepapa-canales

Web pública (GitHub Pages) de la app **TelePapa** para Android y Android TV:

- [`listas.json`](listas.json): qué listas públicas de canales carga la app, qué canales se excluyen, servidores verificados y correo de contacto (`contacto.correo`, lo usan la app y esta web).
- [`index.html`](index.html): explicación, fuentes y protocolo `telepapa://anadir`.
- [`derechos.json`](derechos.json): qué plataforma oficial tiene los derechos de cada competición en España (mantenido a mano).
- [`partidos.json`](partidos.json): calendario de esas competiciones, de [football-data.org](https://www.football-data.org). Lo genera cada 6 horas `.github/workflows/partidos.yml` con `tools/partidos.js` (necesita el secreto `FOOTBALL_DATA_TOKEN`).
- [`privacidad.html`](privacidad.html): política de privacidad (enlazada desde Google Play).

TelePapa no aloja ni emite canales. Las listas pertenecen a sus autores (TDTChannels).
