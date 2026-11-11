// Dependency-free helpers: durations, environment variables, JSON paths, CSV.

import { checkServerIdentity } from 'node:tls';

const UNITA = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

// "30s", "5m", "2h", 1500 → milliseconds. Returns `predefinita` when the value is missing or
// invalid.
export function durata(valore, predefinita = null) {
  if (valore === undefined || valore === null || valore === '') return predefinita;
  if (typeof valore === 'number') return valore;
  const m = String(valore).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/);
  return m ? Math.round(parseFloat(m[1]) * UNITA[m[2]]) : predefinita;
}

// Replaces ${NAME} with process.env.NAME in every string of the object. Missing variables are noted
// in `mancanti`, so the editor can report them instead of failing silently.
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

// Reads a value from an object with a dotted path: "current.temperature_2m", "list.0.name".
export function leggiPercorso(oggetto, percorso) {
  if (!percorso) return oggetto;
  return String(percorso).split('.').reduce((o, k) => (o == null ? undefined : o[k]), oggetto);
}

// Turns strings that are numbers into numbers, leaves the rest as it is.
export function numeroSePossibile(v) {
  if (typeof v !== 'string' || v.trim() === '') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

// Minimal CSV parser (quotes, commas and line breaks inside fields). Returns rows of cells.
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

// HTTPS request with a CA certificate of your own (e.g. your home CA) and a name to check other
// than the address: call by IP (DNS down) but check the name's certificate. fetch() does not allow
// this without dependencies, so node:https is used.
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

