// Utilidades de texto y validación de direcciones. Sin dependencias del navegador:
// las usan tanto la app como las herramientas de tools/ (Node).

/** Minúsculas y sin acentos. */
export function sinAcentos(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/** Texto para buscar: minúsculas, sin acentos y con los espacios simplificados. */
export function paraBuscar(texto) {
  return sinAcentos(texto).replace(/\s+/g, ' ').trim();
}

const SUFIJOS_CALIDAD = [' hd', ' fhd', ' uhd', ' sd', ' 4k', ' tv'];

/** "Antena 3 HD" -> "antena3": sin acentos, sin símbolos y sin sufijos de calidad. */
export function normalizarNombre(nombre) {
  let s = sinAcentos(nombre)
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  let cambiado = true;
  while (cambiado) {
    cambiado = false;
    for (const sufijo of SUFIJOS_CALIDAD) {
      if (s.endsWith(sufijo) && s.length > sufijo.length) {
        s = s.slice(0, -sufijo.length).trim();
        cambiado = true;
      }
    }
  }
  return s.replace(/ /g, '');
}

/** Recorta un texto recibido de fuera a una longitud razonable. */
export function limitar(texto, max) {
  const t = String(texto ?? '').trim();
  return t.length > max ? t.slice(0, max) : t;
}

/** Esquema en minúsculas ("https", "algo"...) o null si la dirección no tiene uno válido. */
export function esquema(url) {
  const u = String(url ?? '').trim();
  const i = u.indexOf(':');
  if (i <= 0) return null;
  const e = u.slice(0, i).toLowerCase();
  return /^[a-z][a-z0-9+.-]*$/.test(e) ? e : null;
}

/** Emisión que reproduce la propia app (http/https). */
export function esEmision(url) {
  const e = esquema(url);
  return e === 'http' || e === 'https';
}

/** Esquemas que nunca se aceptan: dan acceso a ficheros, ejecutan código o abren cosas arbitrarias. */
const ESQUEMAS_PROHIBIDOS = new Set([
  'javascript', 'vbscript', 'data', 'blob', 'file', 'filesystem', 'content', 'intent',
  'about', 'chrome', 'view-source', 'android-app', 'jar', 'ws', 'wss', 'telepapa',
]);

export const MAX_URL = 4096;

/**
 * Comprueba si la dirección de un canal añadido (a mano o por enlace) es aceptable: una emisión
 * http/https o un enlace de otra app (algo://...), que abre el sistema.
 * @returns {string|null} null si es válida, o el motivo por el que se rechaza
 */
export function motivoUrlNoValida(url) {
  const u = String(url ?? '').trim();
  if (!u) return 'Falta la dirección del canal';
  if (u.length > MAX_URL) return 'La dirección es demasiado larga';
  if (/[\s<>"]/.test(u)) return 'La dirección no es válida';
  const e = esquema(u);
  if (!e) return 'La dirección no es válida';
  if (ESQUEMAS_PROHIBIDOS.has(e)) return 'Este tipo de dirección no está permitido';
  if (e === 'http' || e === 'https') {
    try {
      const p = new URL(u);
      return p.hostname ? null : 'La dirección no es válida';
    } catch {
      return 'La dirección no es válida';
    }
  }
  return u.length > e.length + 1 ? null : 'La dirección no es válida';
}

/** Servidor de una dirección http/https, en minúsculas, o null. */
export function servidor(url) {
  if (!esEmision(url)) return null;
  try {
    const h = new URL(String(url).trim()).hostname.toLowerCase().replace(/\.$/, '');
    return h && !h.startsWith('[') ? h : null;
  } catch {
    return null;
  }
}

/**
 * true si la dirección es http/https y su servidor está en la lista blanca (el propio servidor o
 * un subdominio de una entrada). Sin lista no se admite nada.
 */
export function servidorPermitido(url, dominios) {
  const h = servidor(url);
  if (!h || !dominios || dominios.length === 0) return false;
  return dominios.some((d) => {
    const dl = String(d).trim().toLowerCase();
    return dl && (h === dl || h.endsWith('.' + dl));
  });
}

export const MAX_LOGO_INCRUSTADO = 64 * 1024;

/** Logo aceptable (https/http o imagen pequeña incrustada); "" si no se acepta. */
export function logoValido(logo) {
  const l = String(logo ?? '').trim();
  if (/^https?:\/\//i.test(l)) return l.length <= 2048 ? l : '';
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(l)) {
    return l.length <= MAX_LOGO_INCRUSTADO ? l : '';
  }
  return '';
}

/** Dirección de correo con forma válida. */
export function esCorreo(s) {
  return typeof s === 'string' && s.length <= 120 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s);
}

/** Identificador estable de un canal a partir de su dirección (FNV-1a de 64 bits en hexadecimal). */
export function idDeUrl(url) {
  let h = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(String(url ?? ''));
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
