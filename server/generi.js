// Kinds of tile: models. A kind says which fields to ask for and what the tile looks like; a tile
// of a kind writes only `genere:` and the values of the fields, plus whatever it wants to change
// from the model.
//
//   generi/<id>.yaml              the basic kinds, shipped with Fluxboard
//   config/generi/<id>.yaml       your own (also created from a tile: "Save as kind");
//                                 the same id replaces the basic one
//
// File of a kind:
//   genere:
//     nome: Software version
//     descrizione: …
//     icona: server
//     campi:                      # what the editor asks for (same types as the source forms)
//       - { nome: software, etichetta: Software to check, tipo: query, obbligatorio: true, esempio: … }
//   modello:                      # the tile, with {{field}} where the values go
//     tipo: elenco
//     dati: { sorgente: "{{sorgente}}", software: "{{software}}" }
//
// File of a tile of a kind:
//   genere: versione
//   titolo: Updates available
//   campi: { software: [ … ] }
//   ogni: 2h                      # everything else wins over the model (objects merge)
//
// A placeholder that is the whole value ("{{software}}") takes the value with its type (a list
// stays a list); inside a text it is replaced as text. A field with `tipo: query` written as YAML
// text is read as YAML if the model uses it whole.

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { CAMPI_GENERE, normalizza } from './alias.js';
import { traduci, linguaAttuale } from '../public/lingua.js';

const SEGNAPOSTO = /\{\{(\w+)\}\}/g;
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const oggetto = (x) => x && typeof x === 'object' && !Array.isArray(x);

// Merges b onto a: objects merge key by key, everything else (lists included) is replaced by b.
export function fondi(a, b) {
  if (!oggetto(a) || !oggetto(b)) return b === undefined ? a : b;
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) r[k] = oggetto(v) && oggetto(a[k]) ? fondi(a[k], v) : v;
  return r;
}

function sostituisci(x, valori) {
  if (typeof x === 'string') {
    const intero = x.match(/^\{\{(\w+)\}\}$/);
    if (intero && intero[1] in valori) return valori[intero[1]];
    return x.replace(SEGNAPOSTO, (s, n) => (n in valori && valori[n] != null ? (typeof valori[n] === 'object' ? JSON.stringify(valori[n]) : String(valori[n])) : s));
  }
  if (Array.isArray(x)) return x.map((v) => sostituisci(v, valori));
  // Keys too: colour rules have the condition in the key ("percentuale >= {{soglia}}").
  if (oggetto(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [String(sostituisci(k, valori)), sostituisci(v, valori)]));
  return x;
}

// Placeholders left without a value (fields not filled in): needed by the validator.
function rimasti(x, trovati = new Set()) {
  if (typeof x === 'string') for (const m of x.matchAll(SEGNAPOSTO)) trovati.add(m[1]);
  else if (Array.isArray(x)) x.forEach((v) => rimasti(v, trovati));
  else if (oggetto(x)) Object.entries(x).forEach(([k, v]) => { rimasti(k, trovati); rimasti(v, trovati); });
  return trovati;
}

export function validaGenere(o) {
  const errori = [];
  if (!oggetto(o?.genere)) errori.push('manca il blocco "genere" (nome, descrizione, campi)');
  else {
    if (!o.genere.nome) errori.push('"genere.nome" è obbligatorio');
    if (o.genere.campi !== undefined && !Array.isArray(o.genere.campi)) errori.push('"genere.campi" deve essere un elenco di { nome, etichetta, tipo }');
    for (const [i, c] of (o.genere.campi || []).entries()) if (!c?.nome || !/^\w+$/.test(c.nome)) errori.push(`campi[${i}]: serve un "nome" (lettere, cifre, _)`);
  }
  if (!oggetto(o?.modello)) errori.push('manca il blocco "modello" (la tile, con {{campo}} dove vanno i valori)');
  else if (!o.modello.tipo) errori.push('"modello.tipo" è obbligatorio (elenco, valori, grafico…)');
  return { errori, avvisi: [] };
}

// Headings, titles, empty messages and confirmations of a model, translated (public/lingua.js).
// Template formats get their English names too ("{x:durata}" → "{x:duration}").
const FORMATI_EN = { durata: 'duration', nome: 'name', ora: 'time', data: 'date', casella: 'mailbox' };
function testiNellaLingua(x, dentroElenco = false) {
  if (linguaAttuale() === 'it') return x;
  if (Array.isArray(x)) return x.map((v) => testiNellaLingua(v, true));
  if (!oggetto(x)) return x;
  return Object.fromEntries(Object.entries(x).map(([k, v]) => {
    if (typeof v === 'string' && !/\{\{/.test(v) && (['titolo', 'vuoto', 'conferma', 'messaggio'].includes(k) || (k === 'etichetta' && dentroElenco) || k === 'valore')) {
      return [k, v.split(/\n\n+/).map((p) => traduci(p)).join('\n\n').replace(/\{([^{}:|]+(?:\|[^{}:]+)?):(durata|nome|ora|data|casella)\}/g, (_, c, f) => `{${c}:${FORMATI_EN[f]}}`)];
    }
    return [k, testiNellaLingua(v, dentroElenco)];
  }));
}

export class Generi {
  constructor() { this.voci = new Map(); this.problemi = {}; }

  // folders: [{ dir, origine: 'base' | 'propri' }] in order (the last ones win).
  async carica(cartelle) {
    const voci = new Map(), problemi = {};
    for (const { dir, origine } of cartelle) {
      let nomi = [];
      try { nomi = (await fs.readdir(dir)).filter((f) => f.endsWith('.yaml')); } catch { continue; }
      for (const f of nomi.sort()) {
        const id = f.replace(/\.yaml$/, '');
        if (!ID.test(id)) continue;
        try {
          const o = YAML.parse(await fs.readFile(path.join(dir, f), 'utf8')) || {};
          const v = validaGenere(o);
          if (v.errori.length) { problemi[`${origine}/${f}`] = v; continue; }
          voci.set(id, { id, origine, ...o.genere, campi: o.genere.campi || [], modello: o.modello });
        } catch (e) { problemi[`${origine}/${f}`] = { errori: [e.message.split('\n')[0]], avvisi: [] }; }
      }
    }
    this.voci = voci;
    this.problemi = problemi;
  }

  elenco() {
    return [...this.voci.values()].map(({ modello, ...g }) => ({ ...g, tipo: modello.tipo }))
      .sort((a, b) => (a.ordine ?? 99) - (b.ordine ?? 99) || String(a.nome).localeCompare(String(b.nome), 'it'));
  }

  get(id) { return this.voci.get(id); }

  // The written tile (kind + fields + tweaks) → the complete tile. { tile, errori }
  espandi(scritta) {
    const g = this.voci.get(scritta.genere);
    if (!g) return { tile: scritta, errori: [`genere "${scritta.genere}" sconosciuto (disponibili: ${[...this.voci.keys()].join(', ')})`] };
    const { genere, campi: campiScritti = {}, ...ritocchi } = scritta;
    const dati = { ...campiScritti };
    const valori = {};
    // English names of the fields work too ("columns" for "colonne", see server/alias.js).
    const inglesi = Object.entries(CAMPI_GENERE).filter(([, it]) => g.campi.some((c) => c.nome === it));
    for (const [en, it] of inglesi) if (dati[it] === undefined && dati[en] !== undefined) dati[it] = dati[en];
    for (const c of g.campi) {
      let v = dati[c.nome];
      if (v === undefined || v === '') v = c.predefinito;
      // A list written in the form as YAML text becomes a list again.
      if (typeof v === 'string' && ['query', 'elenco'].includes(c.tipo) && /^\s*-\s|^\s*[[{]/.test(v)) { try { v = YAML.parse(v); } catch { /* resta testo */ } }
      // Lists and objects may be written in English too (columns with label/value…).
      if (v !== undefined) valori[c.nome] = v && typeof v === 'object' ? normalizza(v) : v;
    }
    const errori = g.campi.filter((c) => c.obbligatorio && (valori[c.nome] === undefined || valori[c.nome] === '')).map((c) => `manca "${c.etichetta || c.nome}" (campo del genere ${g.nome})`);
    // Optional fields not filled in: the model keys using them whole disappear (also when the
    // placeholder is the key, as in colore_se), and with them the objects left empty (an "elabora"
    // step without its condition).
    const vuoto = (s) => typeof s === 'string' && /^\{\{(\w+)\}\}$/.test(s);
    const pulisci = (x) => {
      if (Array.isArray(x)) return x.map(pulisci).filter((v) => v !== undefined);
      if (oggetto(x)) {
        const voci = Object.entries(x).filter(([k]) => !vuoto(k)).map(([k, v]) => [k, pulisci(v)]).filter(([, v]) => v !== undefined);
        return voci.length || !Object.keys(x).length ? Object.fromEntries(voci) : undefined;
      }
      return vuoto(x) ? undefined : x;
    };
    // Two passes: a field's value can quote another one (e.g. the default columns of "Shell output"
    // use {{guasto}}).
    // The model's human text (headings, empty message, confirmations) in the interface language;
    // whatever the tile writes itself (ritocchi) stays as written.
    const tile = fondi(pulisci(sostituisci(sostituisci(testiNellaLingua(g.modello), valori), valori)), ritocchi);
    const vuoti = [...rimasti(tile)].filter((n) => g.campi.some((c) => c.nome === n));
    if (vuoti.length) errori.push(`campi senza valore nel modello: ${vuoti.join(', ')}`);
    return { tile: { ...tile, genere: g.id }, errori };
  }

  // A new kind from a tile: the model is the tile as it is (no fields: they are added later).
  static daTile(tile, { nome, descrizione = '' }) {
    const { genere, campi, ...resto } = tile;
    const modello = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== null && v !== undefined));
    return { genere: { nome, descrizione, icona: tile.icona || null, campi: [] }, modello };
  }
}

export const generi = new Generi();
