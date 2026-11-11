// Funzioni di servizio senza dipendenze: durate, variabili d'ambiente, percorsi nei JSON, CSV.

import { checkServerIdentity } from 'node:tls';

const UNITA = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

// "30s", "5m", "2h", 1500 → millisecondi. Restituisce `predefinita` se il valore manca o non è valido.
export function durata(valore, predefinita = null) {
  if (valore === undefined || valore === null || valore === '') return predefinita;
  if (typeof valore === 'number') return valore;
  const m = String(valore).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/);
  return m ? Math.round(parseFloat(m[1]) * UNITA[m[2]]) : predefinita;
}

// Sostituisce ${NOME} con process.env.NOME in ogni stringa dell'oggetto. Le variabili mancanti
// vengono annotate in `mancanti`, così l'editor può segnalarle invece di fallire in silenzio.
export function sostituisciEnv(valore, mancanti = new Set()) {
  if (typeof valore === 'string') {
    return valore.replace(/\$\{([A-Z0-9_]+)\}/g, (_, nome) => {
      if (process.env[nome] === undefined) { mancanti.add(nome); return ''; }
      return process.env[nome];
    });
  }
  if (Array.isArray(valore)) return valore.map((v) => sostituisciEnv(v, mancanti));
  if (valore && typeof valore === 'object') {
    return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, sostituisciEnv(v, mancanti)]));
  }
  return valore;
}

// Legge un valore da un oggetto con un percorso puntato: "current.temperature_2m", "list.0.name".
export function leggiPercorso(oggetto, percorso) {
  if (!percorso) return oggetto;
  return String(percorso).split('.').reduce((o, k) => (o == null ? undefined : o[k]), oggetto);
}

// Converte in numero le stringhe che sono numeri, lascia il resto com'è.
export function numeroSePossibile(v) {
  if (typeof v !== 'string' || v.trim() === '') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

// Parser CSV minimale (virgolette, virgole e a capo dentro i campi). Restituisce righe di celle.
export function analizzaCsv(testo) {
  const righe = [];
  let riga = [], cella = '', virgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (virgolette) {
      if (c === '"' && testo[i + 1] === '"') { cella += '"'; i++; }
      else if (c === '"') virgolette = false;
      else cella += c;
    } else if (c === '"') virgolette = true;
    else if (c === ',') { riga.push(cella); cella = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++;
      riga.push(cella); righe.push(riga); riga = []; cella = '';
    } else cella += c;
  }
  if (cella !== '' || riga.length) { riga.push(cella); righe.push(riga); }
  return righe;
}

// Richiesta HTTPS con un certificato CA proprio (es. la CA di casa) e un nome da verificare
// diverso dall'indirizzo: si chiama per IP (DNS giù) ma si controlla il certificato del nome.
// fetch() non lo permette senza dipendenze, quindi si usa node:https.
export async function richiestaJson(indirizzo, { metodo = 'GET', intestazioni = {}, corpo, ca, nomeServer, verifica = true, signal } = {}) {
  const { request } = await import(indirizzo.protocol === 'https:' ? 'node:https' : 'node:http');
  return new Promise((risolvi, rifiuta) => {
    const req = request(indirizzo, {
      method: metodo, headers: { Accept: 'application/json', ...intestazioni }, signal,
      ca: ca || undefined, servername: nomeServer || undefined, rejectUnauthorized: verifica,
      ...(nomeServer ? { checkServerIdentity: (_host, cert) => checkServerIdentity(nomeServer, cert) } : {}),
    }, (risposta) => {
      let testo = '';
      risposta.setEncoding('utf8');
      risposta.on('data', (c) => { testo += c; });
      risposta.on('end', () => {
        let json = null;
        try { json = JSON.parse(testo); } catch { /* non è JSON */ }
        risolvi({ stato: risposta.statusCode, json, testo });
      });
    });
    req.on('error', rifiuta);
    if (corpo) req.write(corpo);
    req.end();
  });
}

