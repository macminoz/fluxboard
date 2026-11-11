// Passaggi di elaborazione dichiarati nel YAML di una tile (`elabora:`), applicati alle righe
// restituite da qualunque connettore. Servono a rendere le tile indipendenti dalla sorgente:
// se cambia il database o l'API, si adatta la forma dei dati qui, non nel codice.
//
//   elabora:
//     - rinomina: { source: apparato }
//     - scala: { set: 0.1, live: 0.1 }
//     - traduci: { stanza: { BagnoPT: "Bagno PT" } }
//     - filtra: "codice % 2 == 1"
//     - ordina: "-n"                          // o più chiavi: "-n, nome"
//     - limita: 5
//     - seleziona: [stanza, set, live]
//     - aggiungi: [ { nome: prova, codice: 0 } ]     // righe finte in coda, per prove

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
  // Una o più chiavi separate da virgola: "-da_aggiornare, nome" (la seconda decide a parità).
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
  // Righe scritte a mano in coda a quelle vere: per vedere com'è una tile in una situazione che
  // adesso non c'è (un host giù, un allarme). Da togliere quando la prova è finita.
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
