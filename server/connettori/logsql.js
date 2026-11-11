// VictoriaLogs: runs a LogsQL query. Each JSON line of the answer becomes a row. source: { tipo:
// logsql, url } · dati: { sorgente: <name>, query: <LogsQL>, limite: 100 }

import { numeroSePossibile } from '../util.js';

export const tipo = 'logsql';
export const nome = 'VictoriaLogs';
export const gruppo = 'Syslog e log';
export const descrizione = 'Il syslog di tutta la casa (server, firewall, NAS, centrale…) raccolto in VictoriaLogs: query LogsQL';
export const moduloSorgente = [
  { nome: 'url', etichetta: 'Indirizzo', tipo: 'url', obbligatorio: true, esempio: 'http://192.168.1.35:9428' },
  { nome: 'timeout', etichetta: 'Tempo massimo', tipo: 'durata', predefinito: '15s' },
];
export const moduloDati = [
  { nome: 'query', etichetta: 'Query LogsQL', tipo: 'query', obbligatorio: true, esempio: '_time:1h severita:err | stats by (host) count() n' },
  { nome: 'limite', etichetta: 'Righe al massimo', tipo: 'numero', predefinito: 100 },
];
export const campiSorgente = ['url'];
export const campiDati = ['query'];

export async function prova(sorgente, { signal }) {
  const r = await fetch(new URL('/health', sorgente.url), { signal });
  if (!r.ok) throw new Error(`VictoriaLogs risponde ${r.status}`);
  return 'VictoriaLogs raggiungibile';
}

// Functions like row_max(...) return a JSON object inside a string: if it holds a single field it
// is "unrolled", so in the template {ultimo_msg} is enough.
function normalizza(valore) {
  if (typeof valore === 'string' && valore.startsWith('{')) {
    try {
      const o = JSON.parse(valore);
      const chiavi = Object.keys(o);
      return chiavi.length === 1 ? o[chiavi[0]] : o;
    } catch { /* non è JSON */ }
  }
  return numeroSePossibile(valore);
}

export async function leggi(sorgente, dati, { signal }) {
  if (!dati.query) throw new Error('manca "query"');
  const corpo = new URLSearchParams({ query: dati.query });
  if (dati.limite) corpo.set('limit', String(dati.limite));
  const risposta = await fetch(new URL('/select/logsql/query', sorgente.url), {
    method: 'POST', body: corpo, signal,
  });
  const testo = await risposta.text();
  if (!risposta.ok) throw new Error(`VictoriaLogs ${risposta.status}: ${testo.slice(0, 300)}`);
  return testo.split('\n').filter(Boolean).map((linea) => {
    const o = JSON.parse(linea);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, normalizza(v)]));
  });
}
