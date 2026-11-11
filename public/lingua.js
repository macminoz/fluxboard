// Languages: English (default) and Italian.
//
// The interface text in the code is written once, in Italian (the language Fluxboard was born
// in); `public/lingua-en.js` maps it to English. A key may contain `{}` placeholders for the
// parts that change ("Ack: {} alerts snoozed for 24 hours"): it then matches any text of that
// shape, and the variable parts are translated too when they are themselves interface text.
// With `{1}`, `{2}`… the English value can reorder them.
//
// Two ways to use it:
//   t('Testo italiano', ...valori)     in code, for text built on the fly
//   traduciAlbero(elemento)           on a piece of page: translates its text nodes and the
//                                     title / placeholder / aria-label / data-tip / alt attributes
//   osservaPagina()                   translates the page now and whatever is added later
//                                     (dialogs, menus, toasts), except the content of the tiles
//                                     (user data and titles are never translated)
//
// Shared by the browser and the server (server messages, push notifications).

import EN from './lingua-en.js';

export const LINGUE = ['en', 'it'];
let lingua = 'en';
let fisse = new Map();      // key without placeholders → value
let modelli = [];           // [{ re, valore, n }] for keys with {}

function prepara(dizionario) {
  fisse = new Map();
  modelli = [];
  for (const [k, v] of Object.entries(dizionario)) {
    if (!k.includes('{}')) { fisse.set(k, v); continue; }
    const parti = k.split('{}').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    modelli.push({ re: new RegExp(`^${parti.join('([\\s\\S]+?)')}$`), valore: v, n: parti.length - 1, lunghezza: k.length });
  }
  // The more specific (longer) shapes first.
  modelli.sort((a, b) => b.lunghezza - a.lunghezza);
}

export function impostaLingua(l) {
  lingua = LINGUE.includes(l) ? l : 'en';
  if (lingua === 'en') prepara(EN); else { fisse = new Map(); modelli = []; }
  if (typeof document !== 'undefined') document.documentElement.lang = lingua;
}
export const linguaAttuale = () => lingua;
// Dates and numbers in the conventions of the language (English: British style, 24-hour clock).
export const locale = () => (lingua === 'it' ? 'it-IT' : 'en-GB');
impostaLingua('en');

function riempi(valore, parti) {
  let i = 0;
  return valore.replace(/\{(\d*)\}/g, (_, n) => {
    const p = n ? parti[Number(n) - 1] : parti[i++];
    return p === undefined ? '' : p;
  });
}

// Translates a whole text (trimmed spaces kept). Unknown text comes back unchanged.
export function traduci(testo) {
  if (lingua === 'it' || typeof testo !== 'string') return testo;
  const m = testo.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const [, prima, corpo, dopo] = m;
  if (!corpo || !/[A-Za-zÀ-ÿ]/.test(corpo)) return testo;
  const fisso = fisse.get(corpo);
  if (fisso !== undefined) return prima + fisso + dopo;
  for (const x of modelli) {
    const r = corpo.match(x.re);
    if (r) return prima + riempi(x.valore, r.slice(1).map((p) => traduci(p))) + dopo;
  }
  segnalaMancante(corpo);
  return testo;
}

// While testing: Italian text that has no English yet (window.__daTradurre in the browser console).
const ITALIANO = /[àèéìòù]|\b(il|la|le|di|da|del|della|che|non|per|con|una|sono|alla|nella|ogni|quando|sorgente|tile|dati|valore|righe|nessun[oa]?|aggiungi|salva|annulla|chiudi|modifica|vista|etichetta)\b/i;
function segnalaMancante(testo) {
  if (typeof window === 'undefined' || !ITALIANO.test(testo)) return;
  (window.__daTradurre ??= new Set()).add(testo);
}

// t('Ack: {} avvisi', 3): the Italian text with its values, in the current language.
export function t(testo, ...valori) {
  let i = 0;
  const italiano = testo.replace(/\{\}/g, () => String(valori[i++] ?? ''));
  if (lingua === 'it') return italiano;
  const fisso = fisse.get(testo);
  if (fisso !== undefined && !valori.length) return fisso;
  if (fisso !== undefined) return riempi(fisso, valori.map((v) => traduci(String(v))));
  return traduci(italiano);
}

// ------------------------------------------------------------------ the page
const ATTRIBUTI = ['title', 'placeholder', 'aria-label', 'data-tip', 'alt'];
// Never translated: tile content (user data and titles), code editors, user-typed fields.
const ESCLUSI = '.corpo, .titolo-tile, .etichetta-tile, textarea, input, select option[data-utente], code, pre, .codice, [data-non-tradurre]';

function escluso(nodo) {
  const el = nodo.nodeType === 1 ? nodo : nodo.parentElement;
  return !el || Boolean(el.closest(ESCLUSI));
}

export function traduciAlbero(radice) {
  if (lingua === 'it' || !radice) return;
  if (radice.nodeType === 3) { if (!escluso(radice)) { const n = traduci(radice.nodeValue); if (n !== radice.nodeValue) radice.nodeValue = n; } return; }
  if (radice.nodeType !== 1 && radice.nodeType !== 9 && radice.nodeType !== 11) return;
  // Inside a tile's content only a few interface pieces are translated (buttons, empty message).
  if (radice.nodeType === 1 && radice.closest('.corpo') && !radice.matches('.azione, .vuoto, .storico-ignorati, .azioni-tile, .azioni-riga')) {
    for (const b of radice.querySelectorAll('.azione, .vuoto')) traduciAlbero(b);
    return;
  }
  const elementi = radice.nodeType === 1 ? [radice, ...radice.querySelectorAll('*')] : [...radice.querySelectorAll('*')];
  for (const el of elementi) {
    if (el.closest(ESCLUSI) && !el.matches('.corpo .azione, .corpo .vuoto, .corpo .storico-ignorati')) continue;
    for (const a of ATTRIBUTI) {
      const v = el.getAttribute(a);
      if (v) { const n = traduci(v); if (n !== v) el.setAttribute(a, n); }
    }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) el.value = traduci(el.value);
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue.trim()) { const x = traduci(n.nodeValue); if (x !== n.nodeValue) n.nodeValue = x; }
    }
  }
}

let osservatore = null;
export function osservaPagina() {
  if (typeof document === 'undefined') return;
  osservatore?.disconnect();
  if (lingua === 'it') return;
  traduciAlbero(document.body);
  document.title = traduci(document.title);
  osservatore = new MutationObserver((mutazioni) => {
    osservatore.disconnect();   // our own changes must not wake us up again
    for (const m of mutazioni) {
      if (m.type === 'childList') for (const n of m.addedNodes) traduciAlbero(n);
      else if (m.type === 'characterData') { if (!escluso(m.target)) traduciAlbero(m.target); }
      else if (m.type === 'attributes' && !escluso(m.target)) {
        const v = m.target.getAttribute(m.attributeName);
        if (v) { const n = traduci(v); if (n !== v) m.target.setAttribute(m.attributeName, n); }
      }
    }
    collega();
  });
  const collega = () => osservatore.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTI });
  collega();
}
