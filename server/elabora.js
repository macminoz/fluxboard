// Processing steps declared in a tile's YAML (`elabora:`), applied to the rows returned by any
// connector. They make tiles independent from the source: if the database or the API changes,
// the shape of the data is adapted here, not in the code. English names work too (process,
// rename, scale, map, filter, sort, limit, select, append).
//
//   elabora:
//     - rinomina: { source: device }
//     - scala: { set: 0.1, live: 0.1 }
//     - traduci: { room: { BathGF: "Bath GF" } }
//     - filtra: "codice % 2 == 1"
//     - ordina: "-n"                          // or several keys: "-n, nome"
//     - limita: 5
//     - seleziona: [room, set, live]
//     - aggiungi: [ { nome: test, codice: 0 } ]     // fake rows at the end, for tests

import { compilaCondizione } from '../public/condizione.js';

export { compilaCondizione };

const PASSAGGI = {
  rinomina: (righe, mappa) => righe.map((r) => Object.fromEntries(
    Object.entries(r).map(([k, v]) => [mappa[k] ?? k, v]))),
  seleziona: (righe, campi) => righe.map((r) => Object.fromEntries(campi.map((c) => [c, r[c]]))),
  scala: (righe, fattori) => righe.map((r) => {
    const n = { ...r };
    for (const [c, f] of Object.entries(fattori)) if (typeof n[c] === 'number') n[c] = n[c] * f;
    return n;
  }),
  traduci: (righe, tabelle) => righe.map((r) => {
    const n = { ...r };
    for (const [c, t] of Object.entries(tabelle)) if (n[c] != null && t[n[c]] !== undefined) n[c] = t[n[c]];
    return n;
  }),
  filtra: (righe, cond) => righe.filter(compilaCondizione(cond)),
  // One or more keys separated by commas: "-da_aggiornare, nome" (the second breaks ties).
  ordina: (righe, campo) => {
    const chiavi = String(campo).split(',').map((k) => k.trim()).filter(Boolean)
      .map((k) => ({ desc: k.startsWith('-'), c: k.replace(/^-/, '') }));
    return [...righe].sort((a, b) => {
      for (const { desc, c } of chiavi) {
        const d = typeof a[c] === 'string' && typeof b[c] === 'string'
          ? a[c].localeCompare(b[c], 'it', { sensitivity: 'base', numeric: true })
          : a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0;
        if (d) return desc ? -d : d;
      }
      return 0;
    });
  },
  limita: (righe, n) => righe.slice(0, Number(n)),
  // Rows written by hand after the real ones: to see how a tile looks in a situation that is not
  // happening now (a host down, an alarm). Remove them when the test is over.
  aggiungi: (righe, nuove) => [...righe, ...(Array.isArray(nuove) ? nuove : [nuove]).filter((x) => x && typeof x === 'object')],
};

export const NOMI_PASSAGGI = Object.keys(PASSAGGI);

export function elabora(righe, passaggi = []) {
  let risultato = righe;
  for (const passo of passaggi || []) {
    const [nome, argomento] = Object.entries(passo)[0] || [];
    if (!PASSAGGI[nome]) throw new Error(`passaggio sconosciuto in "elabora": ${nome}`);
    risultato = PASSAGGI[nome](risultato, argomento);
  }
  return risultato;
}
