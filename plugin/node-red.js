// Node-RED: flussi e stato dei nodi (il pallino colorato sotto il nodo nell'editor), in sola lettura.
//
// sorgente: { tipo: node-red, url: http://192.168.1.40:1880, utente, password: ${NODERED_PASSWORD} }
//           utente/password solo se Node-RED ha adminAuth; senza, si legge senza credenziali.
// dati:     { sorgente: <nome>, risorsa: stati | nodi | flussi }
//
// Righe "stati" (i nodi che mostrano uno stato) e "nodi" (tutti):
//   { id, nome, tipo, flusso, disattivato, stato, colore (green|yellow|red|blue|grey|—), forma, codice }
//   codice: 1 ok (verde) · 2 attenzione (giallo) · 0 problema (rosso) · 3 informativo (blu/grigio) · null senza stato
// Righe "flussi": { id, nome, attivo, nodi, con_stato, problemi }
//
// Per una tile su un nodo solo: `elabora: [ { filtra: "nome == MQTT broker" } ]`.
// Lo stato si legge come fa l'editor: dal canale /comms (WebSocket), dove Node-RED ripete
// l'ultimo stato di ogni nodo a chi si iscrive.

import { apriWebSocket } from '../server/websocket.js';

export const tipo = 'node-red';
export const nome = 'Node-RED';
export const gruppo = 'Automazioni';
export const descrizione = 'Flussi e stato dei nodi (connesso, in errore…) come li mostra l\'editor. Sola lettura';
export const moduloSorgente = [
  { nome: 'url', etichetta: 'Indirizzo', tipo: 'url', obbligatorio: true, esempio: 'http://192.168.1.40:1880' },
  { nome: 'utente', etichetta: 'Utente (se Node-RED ha adminAuth)', tipo: 'testo' },
  { nome: 'password', etichetta: 'Password (se Node-RED ha adminAuth)', tipo: 'segreto' },
  { nome: 'timeout', etichetta: 'Tempo massimo', tipo: 'durata', predefinito: '10s' },
];
export const moduloDati = [
  { nome: 'risorsa', etichetta: 'Cosa leggere', tipo: 'scelta', predefinito: 'stati',
    valori: { stati: 'Nodi con uno stato (connesso, in errore…)', nodi: 'Tutti i nodi', flussi: 'Flussi (schede)' },
    aiuto: 'Per un nodo solo: filtra per nome in "Elaborazione".' },
];
export const campiSorgente = ['url'];
export const campiDati = [];

const TESTI = {
  connected: 'connesso', connecting: 'in connessione', disconnected: 'disconnesso', 'not-connected': 'non connesso',
  error: 'errore', waiting: 'in attesa', running: 'in esecuzione', ok: 'ok',
};
const CODICI = { green: 1, yellow: 2, red: 0, blue: 3, grey: 3 };
// "node-red:common.status.connected" → "connesso"; i testi liberi restano come sono.
const testo = (t) => (typeof t === 'string' && /^[\w-]+:[\w.-]+$/.test(t) ? TESTI[t.split('.').pop()] || t.split('.').pop() : t ?? '');

async function token(sorgente, signal) {
  if (!sorgente.utente) return null;
  const r = await fetch(new URL('auth/token', sorgente.url.replace(/\/?$/, '/')), {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'node-red-admin', grant_type: 'password', scope: 'read', username: sorgente.utente, password: sorgente.password || '' }),
  });
  if (!r.ok) throw new Error(`Node-RED rifiuta utente o password (${r.status})`);
  return (await r.json()).access_token;
}

async function flussi(sorgente, chiave, signal) {
  const r = await fetch(new URL('flows', sorgente.url.replace(/\/?$/, '/')), {
    signal, headers: { Accept: 'application/json', 'Node-RED-API-Version': 'v1', ...(chiave ? { Authorization: `Bearer ${chiave}` } : {}) },
  });
  if (r.status === 401) throw new Error('Node-RED chiede le credenziali (adminAuth): aggiungi utente e password alla sorgente');
  if (!r.ok) throw new Error(`Node-RED ${r.status}`);
  return r.json();
}

// Iscrizione a status/#: Node-RED rimanda subito l'ultimo stato di ogni nodo, poi si chiude.
async function stati(sorgente, chiave, signal, attesa = 1500) {
  const raccolti = new Map();
  const indirizzo = new URL('comms', sorgente.url.replace(/\/?$/, '/')).href.replace(/^http/, 'ws');
  let ws;
  try {
    ws = await apriWebSocket(indirizzo, {
      signal,
      suMessaggio: (testo) => {
        let d;
        try { d = JSON.parse(testo); } catch { return; }
        for (const x of Array.isArray(d) ? d : [d]) if (x?.topic?.startsWith('status/')) raccolti.set(x.topic.slice(7), x.data || {});
      },
    });
  } catch (e) { throw new Error(`canale /comms di Node-RED non raggiungibile: ${e.message}`); }
  if (chiave) ws.invia(JSON.stringify({ auth: chiave }));
  ws.invia(JSON.stringify({ subscribe: 'status/#' }));
  await new Promise((fatto) => setTimeout(fatto, attesa));
  ws.chiudi();
  return raccolti;
}

export async function leggi(sorgente, dati, { signal }) {
  const risorsa = dati.risorsa || 'stati';
  const chiave = await token(sorgente, signal);
  const [elenco, st] = await Promise.all([flussi(sorgente, chiave, signal), risorsa === 'flussi' || risorsa === 'stati' || risorsa === 'nodi' ? stati(sorgente, chiave, signal) : new Map()]);
  const nodi = Array.isArray(elenco) ? elenco : elenco.flows || [];
  const schede = new Map(nodi.filter((n) => n.type === 'tab').map((n) => [n.id, n]));
  const righe = nodi.filter((n) => n.z && schede.has(n.z)).map((n) => {
    const s = st.get(n.id);
    return {
      id: n.id, nome: n.name || n.label || n.type, tipo: n.type, flusso: schede.get(n.z)?.label,
      disattivato: Boolean(n.d || schede.get(n.z)?.disabled),
      stato: s ? testo(s.text) : '', colore: s?.fill || '', forma: s?.shape || '', codice: s ? (CODICI[s.fill] ?? 3) : null,
    };
  });
  if (risorsa === 'flussi') {
    return [...schede.values()].map((t) => {
      const suoi = righe.filter((r) => nodi.find((n) => n.id === r.id)?.z === t.id);
      return { id: t.id, nome: t.label, attivo: !t.disabled, nodi: suoi.length, con_stato: suoi.filter((r) => r.codice !== null).length,
        problemi: suoi.filter((r) => r.codice === 0 || r.codice === 2).length };
    });
  }
  return risorsa === 'stati' ? righe.filter((r) => r.codice !== null && !r.disattivato) : righe;
}

export async function prova(sorgente, { signal }) {
  const chiave = await token(sorgente, signal);
  const r = await fetch(new URL('settings', sorgente.url.replace(/\/?$/, '/')), { signal, headers: chiave ? { Authorization: `Bearer ${chiave}` } : {} });
  const v = r.ok ? (await r.json()).version : null;
  const nodi = await flussi(sorgente, chiave, signal);
  return `Node-RED ${v || ''}: ${(Array.isArray(nodi) ? nodi : nodi.flows || []).filter((n) => n.type === 'tab').length} flussi leggibili${chiave ? '' : ' (senza credenziali: l\'API di amministrazione è aperta)'}`;
}
