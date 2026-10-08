// Pruebas del núcleo de la app web y de tools/datos.mjs. Ejecutar con: node --test tools/test/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  idDeUrl, logoValido, motivoUrlNoValida, normalizarNombre, servidorPermitido,
} from '../../app/js/nucleo/texto.js';
import { clavesBusqueda, clavesGuia, indiceActual, programasDe } from '../../app/js/nucleo/guia.js';
import {
  combinarConCalendario, esPartido, esRetransmision, eventosDesdeGuia, iniciales, leerDerechos,
} from '../../app/js/nucleo/agenda.js';
import { construirGuia, fechaXmltv, leerXmltv } from '../datos.mjs';

const MIN = 60000;

test('normaliza nombres de canal', () => {
  assert.equal(normalizarNombre('Antena 3 HD'), 'antena3');
  assert.equal(normalizarNombre('La 1 (1080p)'), 'la1');
  assert.equal(normalizarNombre('Telemadrid TV'), 'telemadrid');
  assert.equal(normalizarNombre('Canal Sur Andalucía'), 'canalsurandalucia');
});

test('valida direcciones de canal', () => {
  assert.equal(motivoUrlNoValida('https://ztnr.rtve.es/ztnr/1688877.m3u8'), null);
  assert.equal(motivoUrlNoValida('otraapp://canal?id=5'), null);
  for (const mala of ['javascript:alert(1)', 'data:text/html,hola', 'file:///etc/passwd', 'intent://x#Intent;end', 'sin esquema', '', 'https://']) {
    assert.notEqual(motivoUrlNoValida(mala), null, mala);
  }
});

test('lista blanca de servidores', () => {
  const dominios = ['rtve.es', 'eitb.eus'];
  assert.ok(servidorPermitido('https://ztnr.rtve.es/x.m3u8', dominios));
  assert.ok(servidorPermitido('https://rtve.es/x.m3u8', dominios));
  assert.ok(!servidorPermitido('https://rtve.es.malo.com/x.m3u8', dominios));
  assert.ok(!servidorPermitido('https://usuario@otro.com/x.m3u8', dominios));
  assert.ok(!servidorPermitido('otraapp://canal', dominios));
  assert.ok(!servidorPermitido('https://ztnr.rtve.es/x.m3u8', []));
});

test('logos aceptados', () => {
  assert.equal(logoValido('https://x.com/a.png'), 'https://x.com/a.png');
  assert.equal(logoValido('javascript:alert(1)'), '');
  assert.equal(logoValido('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(logoValido('data:image/svg+xml;base64,AAAA'), '');
});

test('id estable por dirección', () => {
  assert.equal(idDeUrl('https://a/b'), idDeUrl('https://a/b'));
  assert.notEqual(idDeUrl('https://a/b'), idDeUrl('https://a/c'));
  assert.match(idDeUrl('x'), /^[0-9a-f]{16}$/);
});

test('claves de la guía casan ids de TDTChannels con nombres', () => {
  assert.ok(clavesGuia('La1.TV').includes('la1'));
  assert.ok(clavesGuia('TDP.TV').includes('teledeporte'));
  assert.ok(clavesGuia('E3.TV').includes('esport3'));
  assert.ok(clavesGuia('FDF Telecinco').includes('fdf'));
  assert.ok(clavesBusqueda(null, 'Teledeporte').includes('teledeporte'));
  assert.ok(clavesBusqueda(null, 'Factoría de Ficción').includes('fdf'));
});

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="La1.TV"><display-name>La 1</display-name></channel>
  <channel id="TDP.TV"><display-name>Teledeporte</display-name></channel>
  <programme start="20261006180000 +0200" stop="20261006190000 +0200" channel="La1.TV">
    <title>Telediario 1</title><desc>Informativo &amp; más</desc><category>Noticias</category>
  </programme>
  <programme start="20261006190000 +0200" stop="20261006210000 +0200" channel="TDP.TV">
    <title>Fútbol - Liga F: Real Madrid - FC Barcelona</title><category>Deportes</category>
  </programme>
  <programme start="20261006210000 +0200" stop="20261006220000 +0200" channel="TDP.TV">
    <title>Estadio 2</title><category>Deportes</category>
  </programme>
</tv>`;

test('fechas XMLTV con zona horaria', () => {
  assert.equal(fechaXmltv('20261006180000 +0200'), Date.UTC(2026, 9, 6, 16, 0, 0));
  assert.equal(fechaXmltv('20261006180000 -0130'), Date.UTC(2026, 9, 6, 19, 30, 0));
  assert.equal(fechaXmltv('nada'), 0);
});

test('lee el XMLTV y construye la guía compacta', () => {
  const canales = leerXmltv(XML, 0, Number.MAX_SAFE_INTEGER);
  assert.equal(canales.get('La1.TV').programas[0].descripcion, 'Informativo & más');
  const guia = construirGuia(canales, null, [], []);
  const progs = programasDe(guia, { nombre: 'Teledeporte' });
  assert.equal(progs.length, 2);
  assert.equal(progs[0].inicio, Date.UTC(2026, 9, 6, 17, 0, 0));
  assert.equal(programasDe(guia, { nombre: 'La 1 HD' })[0].titulo, 'Telediario 1');
  assert.equal(programasDe(guia, { nombre: 'Otro canal' }), null);
  assert.equal(indiceActual(progs, Date.UTC(2026, 9, 6, 18, 0, 0)), 0);
  assert.equal(indiceActual(progs, Date.UTC(2026, 9, 6, 23, 0, 0)), -1);
});

test('la guía complementaria solo añade canales permitidos que faltan', () => {
  const principal = leerXmltv(XML, 0, Number.MAX_SAFE_INTEGER);
  const extra = leerXmltv(
    XML.replaceAll('La1.TV', 'Antena3.es').replace('<display-name>La 1</display-name>', '<display-name>Antena 3 HD</display-name>'),
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const guia = construirGuia(principal, extra, ['Antena 3', 'Teledeporte'], []);
  assert.equal(programasDe(guia, { nombre: 'Antena 3' })[0].titulo, 'Telediario 1');
  // Teledeporte ya estaba en la principal: no se duplica
  assert.equal(Object.keys(guia.canales).length, 3);
});

test('detecta retransmisiones deportivas', () => {
  const p = (titulo, categoria, horas = 2) => ({ inicio: 0, fin: horas * 3600000, titulo, categoria });
  assert.ok(esRetransmision(p('Fútbol - Liga F: Real Madrid - FC Barcelona', 'Deportes'), true));
  assert.ok(!esRetransmision(p('Estadio 2', 'Deportes'), true));
  assert.ok(!esRetransmision(p('Telediario', 'Noticias'), false));
  assert.ok(esRetransmision(p('Baloncesto: Final de la Copa del Rey', ''), false));
  assert.ok(!esRetransmision(p('Toros: Corrida de la feria', ''), true));
  assert.ok(esPartido('Real Madrid - FC Barcelona'));
  assert.ok(!esPartido('ALL THE GOALS - Pedri'));
});

test('agenda desde la guía con plataformas y partidos', () => {
  const inicio = Date.UTC(2026, 9, 10, 19, 0, 0);
  const programas = [{ inicio, fin: inicio + 120 * MIN, titulo: 'Fútbol - LaLiga: Real Madrid - Villarreal', categoria: 'Deportes' }];
  const eventos = eventosDesdeGuia([
    { canal: { id: 'a', nombre: 'Teledeporte' }, programas },
    { canal: { id: 'b', nombre: 'La 1' }, programas },
  ]);
  assert.equal(eventos.length, 1);
  assert.deepEqual(eventos[0].canales, ['a', 'b']);
  assert.equal(eventos[0].competicion, 'LaLiga');
  assert.equal(eventos[0].hora, '21:00');
  assert.equal(eventos[0].fecha, '2026-10-10');

  const derechos = leerDerechos({
    escudos: { activos: true, retirados: [99] },
    plataformas: {
      p1: { nombre: 'Plataforma', web: 'https://plataforma.example/' },
      mala: { nombre: 'Mala', web: 'http://inseguro.example/' },
    },
    competiciones: [{ codigo: 'PD', nombre: 'LaLiga', deporte: 'Fútbol', alias: ['Primera División'], plataformas: ['p1', 'mala'] }],
  });
  const partidos = {
    partidos: [
      { id: 'fd_1', codigo: 'PD', inicio: inicio + 10 * MIN, local: 'Real Madrid', visitante: 'Villarreal', localId: 86, escudoLocal: 'https://crests.football-data.org/86.png' },
      { id: 'fd_2', codigo: 'PD', inicio: inicio + 3 * 3600000, local: 'Getafe', visitante: 'Barça', localId: 99, escudoLocal: 'https://crests.football-data.org/99.png', estado: 'IN_PLAY' },
      { id: 'fd_3', codigo: 'XX', inicio, local: 'A', visitante: 'B' },
    ],
  };
  const r = combinarConCalendario(eventos, derechos, partidos);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].plataformas.map((p) => p.id), ['p1']);
  assert.equal(r[0].escudoLocal, 'https://crests.football-data.org/86.png');
  assert.equal(r[1].escudoLocal, null, 'escudo retirado');
  assert.equal(r[1].estado, 'EN_DIRECTO');
  assert.deepEqual(r[1].canales, []);
});

test('agenda con las carreras de motor', () => {
  const inicio = Date.UTC(2026, 9, 11, 12, 0, 0);
  const derechos = leerDerechos({
    plataformas: { p1: { nombre: 'Plataforma', web: 'https://plataforma.example/' } },
    competiciones: [
      { codigo: 'MOTOGP', nombre: 'MotoGP', deporte: 'Motociclismo', alias: ['Moto GP'], plataformas: ['p1'], calendario: { serie: 'motogp', sesiones: ['race'] } },
    ],
  });
  const guia = [{ id: 'g', inicio, fin: inicio + 60 * MIN, titulo: 'GP de Indonesia', competicion: 'Moto GP', deporte: 'Motociclismo', canales: ['a'], plataformas: [] }];
  const motor = {
    eventos: [
      { id: 'mt_1', codigo: 'MOTOGP', inicio: inicio + 5 * MIN, duracion: 60, titulo: 'GP de Indonesia · Carrera' },
      { id: 'mt_2', codigo: 'MOTOGP', inicio: inicio - 5 * 3600000, duracion: 45, titulo: 'GP de Indonesia · Sprint' },
      { id: 'mt_3', codigo: 'XX', inicio, titulo: 'Otra' },
    ],
  };
  const r = combinarConCalendario(guia, derechos, null, motor);
  assert.equal(r.length, 2, 'la carrera se fusiona con la emisión de la guía');
  assert.equal(r[0].id, 'mt_2');
  assert.equal(r[0].deporte, 'Motociclismo');
  assert.equal(r[0].hora, '09:00');
  assert.equal(r[0].fin - r[0].inicio, 45 * MIN);
  assert.deepEqual(r[0].plataformas.map((p) => p.id), ['p1']);
  assert.deepEqual(r[1].plataformas.map((p) => p.id), ['p1']);
});

test('iniciales de equipos', () => {
  assert.equal(iniciales('Real Madrid'), 'RM');
  assert.equal(iniciales('Getafe CF'), 'GE');
  assert.equal(iniciales('Atlético de Madrid'), 'AM');
  assert.equal(iniciales(''), '?');
});
