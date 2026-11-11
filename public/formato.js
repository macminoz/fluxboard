// Template delle tile: "{campo}", "{campo:1}" (decimali), "{campo:rel}" (tempo relativo),
// "{campo:durata}" ("5m", "3h", "2g"), "{campo:ora}", "{campo:data}", "{campo:%}" (percentuale),
// "{campo:nome}" (nome host breve: "nas.casa.lan" → "nas", gli IP restano interi)
// "{campo:casella}" (indirizzo email senza dominio) e "{a|b}" (il primo dei campi che ha un valore). Il risultato è HTML già protetto.

export function proteggi(testo) {
  return String(testo).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function comeData(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === 'string' && v) { const d = new Date(v); if (!Number.isNaN(d.getTime())) return d; }
  return null;
}

// Compatto, per stare nelle colonne: "40s", "20m", "3h", "2g".
function tempo(a) {
  return a < 60 ? `${Math.max(1, a)}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}g`;
}

export function relativo(quando, ora = Date.now()) {
  const d = comeData(quando);
  if (!d) return '—';
  const s = Math.round((ora - d.getTime()) / 1000);
  return s < 0 ? `fra ${tempo(-s)}` : `${tempo(s)} fa`;
}

// Quanto tempo è passato, senza "fa": "giù da {dal:durata}" → "giù da 5m".
export function durata(quando, ora = Date.now()) {
  const d = comeData(quando);
  return d ? tempo(Math.abs(Math.round((ora - d.getTime()) / 1000))) : '—';
}

function formattaValore(v, formato, fuso) {
  if (v === undefined || v === null || v === '') return '—';
  if (!formato) return typeof v === 'number' ? v.toLocaleString('it-IT') : v;
  if (/^\d$/.test(formato)) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('it-IT', { minimumFractionDigits: +formato, maximumFractionDigits: +formato }) : v;
  }
  if (formato === '%') return `${Math.round(Number(v) * 100)}%`;
  // "mario@posta.lan" → "mario": la casella senza dominio, anche dentro un testo più lungo.
  if (formato === 'casella') return String(v).replace(/([^\s@<>"]+)@[\w-]+(\.[\w-]+)+/g, '$1');
  if (formato === 'nome') return /^[\d.]+$|:/.test(String(v)) ? v : String(v).split('.')[0];
  const d = comeData(v);
  if (formato === 'rel') return relativo(d);
  if (formato === 'durata') return durata(d);
  if (formato === 'ora') return d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: fuso }) : v;
  if (formato === 'data') return d ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: fuso }) : v;
  return v;
}

const vuoto = (v) => v === undefined || v === null || v === '';
const unCampo = (riga, campo) => campo.split('.').reduce((o, k) => (o == null ? undefined : o[k]), riga);
// "host|origine_ip": il primo che ha un valore.
const valoreDi = (riga, campi) => campi.split('|').map((c) => unCampo(riga, c)).find((v) => !vuoto(v));
const SEGNAPOSTO = /\{([\w.|]+)(?::([\w%]+))?\}/g;

// Le parti fra [quadre] sono facoltative: spariscono se uno dei loro campi manca.
// Esempio: "{stanza} · {live:1}°[ · fino alle {spegnimento:ora}]"
export function riempi(modello, riga, fuso) {
  const conFacoltative = String(modello).replace(/\[([^\]]*)\]/g, (_, parte) =>
    [...parte.matchAll(SEGNAPOSTO)].some(([, campo]) => vuoto(valoreDi(riga, campo))) ? '' : parte);
  return proteggi(conFacoltative).replace(SEGNAPOSTO, (_, campo, formato) =>
    proteggi(formattaValore(valoreDi(riga, campo), formato, fuso)));
}

// Un testo può essere una stringa oppure { base, intermedia, avanzata }: si prende il livello
// richiesto, altrimenti il più vicino (prima verso il basso, poi verso l'alto).
export function perLivello(testo, livello, livelli) {
  if (testo == null || typeof testo === 'string') return testo;
  const i = livelli.indexOf(livello);
  for (let j = i; j >= 0; j--) if (testo[livelli[j]] != null) return testo[livelli[j]];
  for (let j = i + 1; j < livelli.length; j++) if (testo[livelli[j]] != null) return testo[livelli[j]];
  return null;
}
