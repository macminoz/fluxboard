// Tile templates: "{field}", "{field:1}" (decimals), "{field:rel}" (relative time),
// "{field:durata}" ("5m", "3h", "2d"), "{field:ora}", "{field:data}", "{field:%}" (percentage),
// "{field:nome}" (short host name: "nas.home.lan" → "nas", IPs stay whole), "{field:casella}"
// (email address without the domain) and "{a|b}" (the first of the fields that has a value). The
// result is already escaped HTML.

import { t, locale } from './lingua.js';

export function proteggi(testo) {
  return String(testo).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function comeData(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === 'string' && v) { const d = new Date(v); if (!Number.isNaN(d.getTime())) return d; }
  return null;
}

// Compact, to fit in columns: "40s", "20m", "3h", "2g".
function tempo(a) {
  return a < 60 ? `${Math.max(1, a)}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}g`;
}

export function relativo(quando, ora = Date.now()) {
  const d = comeData(quando);
  if (!d) return '—';
  const s = Math.round((ora - d.getTime()) / 1000);
  return s < 0 ? t('fra {}', tempo(-s)) : t('{} fa', tempo(s));
}

// How much time has passed, without "ago": "down for {since:duration}" → "down for 5m".
export function durata(quando, ora = Date.now()) {
  const d = comeData(quando);
  return d ? tempo(Math.abs(Math.round((ora - d.getTime()) / 1000))) : '—';
}

// English names of the formats: {x:duration}, {x:name}, {x:time}, {x:date}, {x:mailbox}.
const FORMATI = { duration: 'durata', name: 'nome', time: 'ora', date: 'data', mailbox: 'casella' };

function formattaValore(v, formato0, fuso) {
  const formato = FORMATI[formato0] || formato0;
  if (v === undefined || v === null || v === '') return '—';
  if (!formato) return typeof v === 'number' ? v.toLocaleString(locale()) : v;
  if (/^\d$/.test(formato)) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString(locale(), { minimumFractionDigits: +formato, maximumFractionDigits: +formato }) : v;
  }
  if (formato === '%') return `${Math.round(Number(v) * 100)}%`;
  // "mario@mail.lan" → "mario": the mailbox without the domain, also inside a longer text.
  if (formato === 'casella') return String(v).replace(/([^\s@<>"]+)@[\w-]+(\.[\w-]+)+/g, '$1');
  if (formato === 'nome') return /^[\d.]+$|:/.test(String(v)) ? v : String(v).split('.')[0];
  const d = comeData(v);
  if (formato === 'rel') return relativo(d);
  if (formato === 'durata') return durata(d);
  if (formato === 'ora') return d ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: fuso }) : v;
  if (formato === 'data') return d ? d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', timeZone: fuso }) : v;
  return v;
}

const vuoto = (v) => v === undefined || v === null || v === '';
const unCampo = (riga, campo) => campo.split('.').reduce((o, k) => (o == null ? undefined : o[k]), riga);
// "host|origine_ip": the first that has a value.
const valoreDi = (riga, campi) => campi.split('|').map((c) => unCampo(riga, c)).find((v) => !vuoto(v));
const SEGNAPOSTO = /\{([\w.|]+)(?::([\w%]+))?\}/g;

// Parts in [brackets] are optional: they disappear if one of their fields is missing. Example:
// "{room} · {live:1}°[ · until {off_at:time}]"
export function riempi(modello, riga, fuso) {
  const conFacoltative = String(modello).replace(/\[([^\]]*)\]/g, (_, parte) =>
    [...parte.matchAll(SEGNAPOSTO)].some(([, campo]) => vuoto(valoreDi(riga, campo))) ? '' : parte);
  return proteggi(conFacoltative).replace(SEGNAPOSTO, (_, campo, formato) =>
    proteggi(formattaValore(valoreDi(riga, campo), formato, fuso)));
}

// A text can be a string or { base, intermedia, avanzata }: the requested level is taken, otherwise
// the nearest (lower first, then higher).
export function perLivello(testo, livello, livelli) {
  if (testo == null || typeof testo === 'string') return testo;
  const i = livelli.indexOf(livello);
  for (let j = i; j >= 0; j--) if (testo[livelli[j]] != null) return testo[livelli[j]];
  for (let j = i + 1; j < livelli.length; j++) if (testo[livelli[j]] != null) return testo[livelli[j]];
  return null;
}
