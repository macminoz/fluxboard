// Generi di tile: modelli. Un genere dice quali campi chiedere e com'è fatta la tile; una tile di
// genere scrive solo `genere:` e i valori dei campi, più quello che vuole cambiare del modello.
//
//   generi/<id>.yaml              i generi di base, distribuiti con Fluxboard
//   config/generi/<id>.yaml       i propri (anche creati da una tile: "Salva come genere");
//                                 lo stesso id sostituisce quello di base
//
// File di un genere:
//   genere:
//     nome: Versione software
//     descrizione: …
//     icona: server
//     campi:                      # quello che l'editor chiede (stessi tipi dei moduli delle sorgenti)
//       - { nome: software, etichetta: Software da controllare, tipo: query, obbligatorio: true, esempio: … }
//   modello:                      # la tile, con {{campo}} dove vanno i valori
//     tipo: elenco
//     dati: { sorgente: "{{sorgente}}", software: "{{software}}" }
//
// File di una tile di genere:
//   genere: versione
//   titolo: Aggiornamenti disponibili
//   campi: { software: [ … ] }
//   ogni: 2h                      # tutto il resto vince sul modello (gli oggetti si fondono)
//
// Un segnaposto che è tutto il valore ("{{software}}") prende il valore col suo tipo (un elenco
// resta un elenco); dentro un testo viene sostituito come testo. Un campo con `tipo: query` scritto
// come testo YAML viene letto come YAML se il modello lo usa intero.

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const SEGNAPOSTO = /\{\{(\w+)\}\}/g;
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const oggetto = (x) => x && typeof x === 'object' && !Array.isArray(x);

// Fonde b su a: gli oggetti si fondono chiave per chiave, tutto il resto (elenchi compresi) lo sostituisce b.
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
  // Anche le chiavi: le regole di colore hanno la condizione nella chiave ("percentuale >= {{soglia}}").
  if (oggetto(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [String(sostituisci(k, valori)), sostituisci(v, valori)]));
  return x;
}

// Segnaposto rimasti senza valore (campi non compilati): servono al validatore.
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

export class Generi {
  constructor() { this.voci = new Map(); this.problemi = {}; }

  // cartelle: [{ dir, origine: 'base' | 'propri' }] in ordine (le ultime vincono).
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

  // La tile scritta (genere + campi + ritocchi) → la tile completa. { tile, errori }
  espandi(scritta) {
    const g = this.voci.get(scritta.genere);
    if (!g) return { tile: scritta, errori: [`genere "${scritta.genere}" sconosciuto (disponibili: ${[...this.voci.keys()].join(', ')})`] };
    const { genere, campi: dati = {}, ...ritocchi } = scritta;
    const valori = {};
    for (const c of g.campi) {
      let v = dati[c.nome];
      if (v === undefined || v === '') v = c.predefinito;
      // Un elenco scritto nel modulo come testo YAML torna un elenco.
      if (typeof v === 'string' && ['query', 'elenco'].includes(c.tipo) && /^\s*-\s|^\s*[[{]/.test(v)) { try { v = YAML.parse(v); } catch { /* resta testo */ } }
      if (v !== undefined) valori[c.nome] = v;
    }
    const errori = g.campi.filter((c) => c.obbligatorio && (valori[c.nome] === undefined || valori[c.nome] === '')).map((c) => `manca "${c.etichetta || c.nome}" (campo del genere ${g.nome})`);
    // Campi facoltativi non compilati: le chiavi del modello che li usano interi spariscono (anche
    // quando il segnaposto è la chiave, come in colore_se), e con loro gli oggetti rimasti vuoti
    // (un passo di "elabora" senza la sua condizione).
    const vuoto = (s) => typeof s === 'string' && /^\{\{(\w+)\}\}$/.test(s);
    const pulisci = (x) => {
      if (Array.isArray(x)) return x.map(pulisci).filter((v) => v !== undefined);
      if (oggetto(x)) {
        const voci = Object.entries(x).filter(([k]) => !vuoto(k)).map(([k, v]) => [k, pulisci(v)]).filter(([, v]) => v !== undefined);
        return voci.length || !Object.keys(x).length ? Object.fromEntries(voci) : undefined;
      }
      return vuoto(x) ? undefined : x;
    };
    // Due passate: il valore di un campo può citarne un altro (es. le colonne predefinite di "Shell
    // output" usano {{guasto}}).
    const tile = fondi(pulisci(sostituisci(sostituisci(g.modello, valori), valori)), ritocchi);
    const vuoti = [...rimasti(tile)].filter((n) => g.campi.some((c) => c.nome === n));
    if (vuoti.length) errori.push(`campi senza valore nel modello: ${vuoti.join(', ')}`);
    return { tile: { ...tile, genere: g.id }, errori };
  }

  // Un genere nuovo dalla tile: il modello è la tile così com'è (senza campi: si aggiungono dopo).
  static daTile(tile, { nome, descrizione = '' }) {
    const { genere, campi, ...resto } = tile;
    const modello = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== null && v !== undefined));
    return { genere: { nome, descrizione, icona: tile.icona || null, campi: [] }, modello };
  }
}

export const generi = new Generi();
