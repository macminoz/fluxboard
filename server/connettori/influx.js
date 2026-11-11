// InfluxDB 2.x: esegue una query Flux e restituisce le righe della tabella risultante.
//
// sorgente: { tipo: influx, url, org, token }
// dati:     { sorgente: <nome>, query: <Flux> }

import { analizzaCsv, numeroSePossibile } from '../util.js';

export const tipo = 'influx';
export const nome = 'InfluxDB 2';
export const gruppo = 'Metriche e sensori';
export const descrizione = 'Serie temporali: temperature, consumi, metriche di Telegraf (query Flux)';
export const moduloSorgente = [
  { nome: 'url', etichetta: 'Indirizzo', tipo: 'url', obbligatorio: true, esempio: 'http://192.168.1.30:8086', aiuto: 'Meglio l\'IP del nome: funziona anche a DNS spento.' },
  { nome: 'org', etichetta: 'Organizzazione', tipo: 'testo', obbligatorio: true, esempio: 'casa' },
  { nome: 'token', etichetta: 'Token (basta di sola lettura)', tipo: 'segreto', obbligatorio: true },
  { nome: 'timeout', etichetta: 'Tempo massimo', tipo: 'durata', predefinito: '15s' },
];
export const moduloDati = [
  { nome: 'query', etichetta: 'Query Flux', tipo: 'query', obbligatorio: true, esempio: 'from(bucket: "casa")\n  |> range(start: -15m)\n  |> filter(fn: (r) => r._measurement == "…")\n  |> last()', aiuto: 'Ogni record del risultato diventa una riga. Con <code>pivot</code> si ottiene una riga con tutti i campi.' },
];
export const campiSorgente = ['url', 'org', 'token'];
export const campiDati = ['query'];

// Prova di connessione: /health dice se il server c'è, una query minima se il token vale.
export async function prova(sorgente, { signal }) {
  const salute = await fetch(new URL('/health', sorgente.url), { signal });
  if (!salute.ok) throw new Error(`InfluxDB risponde ${salute.status}`);
  const versione = (await salute.json()).version;
  await leggi(sorgente, { query: 'buckets() |> limit(n: 1)' }, { signal });
  return `InfluxDB ${versione}: raggiungibile, token valido`;
}

const COLONNE_INTERNE = new Set(['', 'result', 'table']);

// La risposta CSV di Influx contiene una o più tabelle separate da una riga vuota, ognuna con la
// propria intestazione. Le uniamo in un solo elenco di righe.
export function csvInfluxInRighe(testo) {
  const righe = [];
  for (const blocco of testo.split(/\r?\n\r?\n/)) {
    const celle = analizzaCsv(blocco.trim()).filter((r) => r.length > 1);
    if (!celle.length) continue;
    const [intestazione, ...valori] = celle;
    for (const v of valori) {
      const riga = {};
      intestazione.forEach((col, i) => { if (!COLONNE_INTERNE.has(col)) riga[col] = numeroSePossibile(v[i]); });
      righe.push(riga);
    }
  }
  return righe;
}

export async function leggi(sorgente, dati, { signal }) {
  if (!dati.query) throw new Error('manca "query"');
  const url = new URL('/api/v2/query', sorgente.url);
  if (sorgente.org) url.searchParams.set('org', sorgente.org);
  const risposta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${sorgente.token}`,
      'Content-Type': 'application/vnd.flux',
      Accept: 'application/csv',
    },
    body: dati.query,
    signal,
  });
  const testo = await risposta.text();
  if (!risposta.ok) {
    let messaggio = testo;
    try { messaggio = JSON.parse(testo).message; } catch { /* non è JSON */ }
    throw new Error(`InfluxDB ${risposta.status}: ${messaggio}`);
  }
  return csvInfluxInRighe(testo);
}
