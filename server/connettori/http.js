// Qualunque API HTTP che risponde in JSON (le API pubbliche, Technitium, Jellyfin, ...).
//
// sorgente: { tipo: http, url: <base, facoltativa>,
//             autenticazione: { tipo: nessuna|bearer|parametro|intestazione|basic, nome, utente, segreto },
//             parametri: { nome: valore },     // aggiunti a ogni richiesta (?nome=valore)
//             intestazioni: { Nome: valore } }
// dati:     { sorgente: <nome>, metodo: GET|POST, url: <assoluta o relativa alla base>,
//             parametri: { … }, corpo: <JSON per POST>,
//             elenco: <percorso dell'array nella risposta, facoltativo>,
//             campi:  { nome: <percorso dentro ogni elemento> } }
//
// Senza `campi` ogni elemento passa così com'è; senza `elenco` la risposta è una riga sola.
// Le tile leggono e basta: per scrivere (aggiungere un record DNS…) ci sono le azioni.

import { leggiPercorso } from '../util.js';
import { compilaCondizione } from '../../public/condizione.js';

export const tipo = 'http';
export const nome = 'API HTTP (JSON)';
export const gruppo = 'Web e API';
export const descrizione = 'Qualunque API che risponde in JSON: servizi di casa (DNS, Jellyfin…) o pubbliche';
export const moduloSorgente = [
  { nome: 'url', etichetta: 'Indirizzo base', tipo: 'url', esempio: 'http://192.168.1.1/', aiuto: 'Le tile scriveranno solo il percorso (es. <code>api/zones/list</code>).' },
  { nome: 'autenticazione.tipo', etichetta: 'Autenticazione', tipo: 'scelta', predefinito: 'nessuna',
    valori: { nessuna: 'Nessuna', bearer: 'Token (Authorization: Bearer)', parametro: 'Token nell\'indirizzo (?token=…)', intestazione: 'Token in un\'intestazione', basic: 'Utente e password' } },
  { nome: 'autenticazione.nome', etichetta: 'Nome del parametro o dell\'intestazione', tipo: 'testo', esempio: 'token', quando: { 'autenticazione.tipo': ['parametro', 'intestazione'] } },
  { nome: 'autenticazione.utente', etichetta: 'Utente', tipo: 'testo', quando: { 'autenticazione.tipo': ['basic'] } },
  { nome: 'autenticazione.segreto', etichetta: 'Token o password', tipo: 'segreto', quando: { 'autenticazione.tipo': ['bearer', 'parametro', 'intestazione', 'basic'] } },
  { nome: 'parametri', etichetta: 'Parametri fissi (aggiunti a ogni richiesta)', tipo: 'mappa' },
  { nome: 'intestazioni', etichetta: 'Intestazioni fisse', tipo: 'mappa' },
  { nome: 'timeout', etichetta: 'Tempo massimo', tipo: 'durata', predefinito: '10s' },
];
export const moduloDati = [
  { nome: 'metodo', etichetta: 'Metodo', tipo: 'scelta', predefinito: 'GET', valori: { GET: 'GET (leggere)', POST: 'POST (API che leggono con un corpo, es. GraphQL)' },
    aiuto: 'Una tile si rilegge da sola ogni pochi minuti, quindi può solo leggere: per creare, modificare o cancellare si usano le azioni.' },
  { nome: 'url', etichetta: 'Percorso', tipo: 'testo', obbligatorio: true, esempio: 'api/dashboard/stats/get?type=LastHour' },
  { nome: 'parametri', etichetta: 'Parametri', tipo: 'mappa' },
  { nome: 'corpo', etichetta: 'Corpo JSON', tipo: 'query', quando: { metodo: ['POST'] } },
  { nome: 'elenco', etichetta: 'Dove sta l\'elenco nella risposta', tipo: 'testo', esempio: 'response.zones', aiuto: 'Vuoto = la risposta è una riga sola. Ogni elemento dell\'elenco diventa una riga.' },
  { nome: 'campi', etichetta: 'Campi da estrarre (nome → percorso)', tipo: 'mappa', esempio: 'temperatura → current.temperature_2m' },
];
export const campiSorgente = [];
export const campiDati = ['url'];

export const METODI_LETTURA = ['GET', 'POST'];

// Indirizzo e intestazioni di una richiesta, autenticazione compresa. Usata anche dalle azioni.
export function preparaRichiesta(sorgente, percorso, parametri = {}) {
  const url = sorgente.url ? new URL(percorso, sorgente.url) : new URL(percorso);
  for (const [k, v] of Object.entries({ ...(sorgente.parametri || {}), ...parametri })) url.searchParams.set(k, String(v));
  const intestazioni = { Accept: 'application/json', ...(sorgente.intestazioni || {}) };
  const a = sorgente.autenticazione || {};
  if (a.tipo === 'bearer') intestazioni.Authorization = `Bearer ${a.segreto}`;
  if (a.tipo === 'intestazione') intestazioni[a.nome || 'X-Api-Key'] = a.segreto;
  if (a.tipo === 'parametro') url.searchParams.set(a.nome || 'token', a.segreto);
  if (a.tipo === 'basic') intestazioni.Authorization = `Basic ${Buffer.from(`${a.utente || ''}:${a.segreto || ''}`).toString('base64')}`;
  return { url, intestazioni };
}

// Gli errori non devono mai mostrare il token: si toglie dall'indirizzo prima di citarlo.
export const senzaSegreti = (url) => `${url.host}${url.pathname}`;

export async function leggi(sorgente, dati, { signal }) {
  if (!dati.url) throw new Error('manca "url"');
  const metodo = (dati.metodo || 'GET').toUpperCase();
  if (!METODI_LETTURA.includes(metodo)) throw new Error(`una tile può solo leggere (GET o POST), non ${metodo}: per scrivere usa un'azione`);
  const { url, intestazioni } = preparaRichiesta(sorgente, dati.url, dati.parametri);
  const corpo = dati.corpo == null ? undefined : typeof dati.corpo === 'string' ? dati.corpo : JSON.stringify(dati.corpo);
  if (corpo) intestazioni['Content-Type'] = 'application/json';
  const risposta = await fetch(url, { method: metodo, headers: intestazioni, body: corpo, signal });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status} da ${senzaSegreti(url)}`);
  const json = await risposta.json();
  const base = leggiPercorso(json, dati.elenco);
  const elementi = Array.isArray(base) ? base : [base];
  if (!dati.campi) return elementi.map((e) => (e && typeof e === 'object' ? e : { valore: e }));
  return elementi.map((e) => Object.fromEntries(
    Object.entries(dati.campi).map(([nome, percorso]) => [nome, leggiPercorso(e, percorso)])));
}

// Azione "richiesta": una chiamata che scrive (creare un record DNS, avviare una sincronizzazione…).
// Metodo, percorso e parametri sono nel file della tile; `errore_se` è una condizione sulla risposta
// JSON per le API che rispondono 200 anche quando falliscono (es. Technitium: "status != ok").
export const azioni = {
  async richiesta(sorgente, parametri, { signal, azione, url }) {
    const metodo = (azione.metodo || 'POST').toUpperCase();
    const { url: indirizzo, intestazioni } = preparaRichiesta(sorgente, url || '', parametri);
    const r = await fetch(indirizzo, { method: metodo, headers: intestazioni, signal });
    const testo = await r.text();
    let json = null;
    try { json = JSON.parse(testo); } catch { /* non è JSON */ }
    if (!r.ok) throw new Error(`HTTP ${r.status} da ${senzaSegreti(indirizzo)}`);
    if (azione.errore_se && json && compilaCondizione(azione.errore_se)(json)) {
      throw new Error(json.errorMessage || json.message || json.error || `risposta di errore da ${senzaSegreti(indirizzo)}`);
    }
    return `fatto (${metodo} ${senzaSegreti(indirizzo)}, HTTP ${r.status})`;
  },
};

export async function prova(sorgente, { signal }) {
  if (!sorgente.url) return 'Nessun indirizzo base: ogni tile scrive l\'indirizzo completo';
  const { url, intestazioni } = preparaRichiesta(sorgente, '');
  const r = await fetch(url, { headers: intestazioni, signal });
  if (r.status === 401 || r.status === 403) throw new Error(`${senzaSegreti(url)} risponde ${r.status}: credenziali rifiutate`);
  return `${senzaSegreti(url)} risponde (HTTP ${r.status})`;
}
