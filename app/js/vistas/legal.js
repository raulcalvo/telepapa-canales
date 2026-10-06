import * as datos from '../datos.js';
import { dialogo, el } from '../ui.js';

/** Aviso sobre marcas, escudos y fuentes, con la vía para pedir que se retire algo. */
export function textoLegal() {
  const fuentes = datos.fuentesGuia().map((f) => f.nombre);
  const guia = fuentes.length > 1
    ? `${fuentes[0]} y, para los canales que no están en ella, la guía comunitaria ${fuentes.slice(1).join(', ')}`
    : fuentes[0] || 'TDTChannels';
  const correo = datos.correoContacto();
  return [
    'Los nombres y escudos de equipos, competiciones y plataformas pertenecen a sus titulares y se muestran solo para identificarlos. TelePapa no tiene relación con ellos.',
    `Calendario de fútbol: football-data.org. Guía de programación: ${guia}. Las emisiones son las oficiales de cada cadena y llegan directamente desde sus servidores.`,
    correo
      ? `Si eres titular y quieres que se retire algún contenido, escribe a ${correo}.`
      : 'Si eres titular y quieres que se retire algún contenido, usa el contacto de la web.',
  ];
}

export function mostrarAvisoLegal() {
  const correo = datos.correoContacto();
  const contenido = el('div', {}, textoLegal().map((t) => el('p', {}, t)));
  const botones = [{ texto: 'Cerrar', valor: null }];
  if (correo) botones.unshift({ texto: 'Escribir', valor: 'correo' });
  dialogo('Información legal', contenido, botones).then((v) => {
    if (v === 'correo') {
      location.href = `mailto:${correo}?subject=${encodeURIComponent('TelePapa: solicitud de retirada de contenido')}`;
    }
  });
}
