# telepapa-canales

Web pública (GitHub Pages) de la app **TelePapa** para Android y Android TV:

- [`listas.json`](listas.json): qué listas públicas de canales carga la app y qué canales se excluyen.
- [`index.html`](index.html): explicación, fuentes y protocolo `telepapa://anadir`.
- [`agenda.json`](agenda.json): agenda deportiva (eventos y nombres de canal; la app empareja con canales públicos). La genera cada 3 horas el workflow `.github/workflows/agenda.yml` con `tools/agenda_publica.js`.
- [`privacidad.html`](privacidad.html): política de privacidad (enlazada desde Google Play).

TelePapa no aloja ni emite canales. Las listas pertenecen a sus autores (TDTChannels, iptv-org).
