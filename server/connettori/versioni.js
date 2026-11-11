// Nuove versioni dei software di casa: per ogni software, l'ultima versione pubblicata su GitHub
// e (se si sa leggere) quella installata, letta dal servizio stesso. Una riga per software:
//   { nome, installata, ultima, uscita, da_aggiornare, stato, link, come }
//   stato: "aggiornato" · "da aggiornare" · "installata più nuova" · "installata sconosciuta"
//   come:  da dove viene la versione installata ("letta" dal servizio o "scritta a mano")
//
// sorgente: { tipo: versioni, token: ${GITHUB_TOKEN} }   // token facoltativo: senza, 60 letture l'ora
// dati:     { sorgente: <nome>, software: [ … ] } (senza software: l'elenco "software" della sorgente), dove ogni software ha:
//   nome, repo (proprietario/nome su GitHub), ramo (es. "v2." per restare sulla serie 2),
//   tag: true          per i progetti che non pubblicano release ma solo tag (es. Mosquitto)
//   prefisso: "b"      solo i tag che iniziano così (llama.cpp: b12000, non master-…)
//   installata:        come leggere la versione installata
//     "2.0.11"                                        scritta a mano (da aggiornare a ogni upgrade)
//     { url, campo: version }                         JSON senza credenziali
//     { url, campo: [major, minor, patch] }           più campi, uniti con i punti (Immich)
//     { url, cerca: "tags-(v[0-9.]+)" }               testo qualsiasi, il primo gruppo dell'espressione
//     { sorgente: adguard, url: control/status }      attraverso una sorgente http (con le sue credenziali)
//     { url, cerca: …, decodifica: base64, campo: … } valore nascosto in base64 dentro una pagina
//     certificato_ca: certificati/home-root-ca.pem, nome_certificato: …   https con la CA di casa
//     verifica_certificato: false                     solo per leggere un numero da un certificato scaduto
//
// Le release in anteprima (rc, beta…) non contano. Una tile che legge ogni 6 ore basta e avanza.

import fs from 'node:fs/promises';
import path from 'node:path';
import { setMaxListeners } from 'node:events';
import YAML from 'yaml';
import { preparaRichiesta, senzaSegreti } from './http.js';
import { richiestaJson, leggiPercorso } from '../util.js';

export const tipo = 'versioni';
export const nome = 'Nuove versioni (GitHub)';
export const gruppo = 'Software e aggiornamenti';
export const descrizione = 'Per ogni software: versione installata, ultima uscita su GitHub e se conviene aggiornare';
export const moduloSorgente = [
  { nome: 'token', etichetta: 'Token GitHub (facoltativo)', tipo: 'segreto', aiuto: 'Senza token GitHub concede 60 letture l\'ora: bastano per una decina di software letti ogni ora. Un token senza permessi (sola lettura pubblica) alza il limite a 5000.' },
  { nome: 'timeout', etichetta: 'Tempo massimo', tipo: 'durata', predefinito: '15s' },
  { nome: 'software', etichetta: 'Software di casa (elenco condiviso)', tipo: 'query', aiuto: 'Lo stesso formato del campo della tile: lo usano le tile che non hanno un elenco proprio.' },
];
export const moduloDati = [
  { nome: 'software', etichetta: 'Software da controllare', tipo: 'query',
    esempio: '- { nome: Grafana, repo: grafana/grafana, installata: { url: "http://192.168.1.31:3000/api/health", campo: version } }',
    aiuto: 'Vuoto = l\'elenco scritto nella sorgente (condiviso da più tile). Un elenco YAML: <code>nome</code>, <code>repo</code> GitHub (proprietario/nome), <code>ramo</code> per restare su una serie (es. <code>v2.</code>) e <code>installata</code>: un testo, oppure <code>url</code> + <code>campo</code> (JSON) o <code>cerca</code> (espressione con un gruppo).' },
];
export const campiSorgente = [];
export const campiDati = [];   // senza "software" nella tile vale quello della sorgente

const ANTEPRIMA = /(alpha|beta|rc|pre|preview|nightly|dev)/i;

// "v2.9.1", "victoria-logs-…-v1.53.0", "13.1.0+security-01" → [2,9,1]
export function numeri(v) {
  // Prima un numero con i punti ("n8n@2.8.4" → 2.8.4, non l'8 di "n8n"), solo dopo un numero isolato.
  const t = String(v ?? '');
  const m = t.match(/\d+(?:\.\d+)+/) || t.match(/\d+/);
  return m ? m[0].split('.').map(Number) : null;
}
export function confronta(a, b) {
  const x = numeri(a), y = numeri(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

// Le risposte di GitHub si ricordano: per un'ora non si richiedono, poi si chiede "è cambiato?"
// (If-None-Match), e le risposte 304 GitHub non le conta nel limite di 60 letture l'ora. Se il
// limite è raggiunto lo stesso, vale l'ultima risposta buona invece di un errore.
const ricordate = new Map();   // url → { etag, dati, quando }
const FRESCA = 60 * 60 * 1000;

async function json(url, { signal, intestazioni = {} } = {}) {
  const r0 = ricordate.get(url);
  if (r0 && Date.now() - r0.quando < FRESCA) return r0.dati;
  const r = await fetch(url, { signal, headers: { Accept: 'application/json', 'User-Agent': 'fluxboard', ...(r0?.etag ? { 'If-None-Match': r0.etag } : {}), ...intestazioni } });
  if (r.status === 304 && r0) { r0.quando = Date.now(); return r0.dati; }
  if (r.status === 403 || r.status === 429) {
    if (r0) return r0.dati;
    throw new Error('GitHub: limite di letture raggiunto (aggiungi un token alla sorgente o leggi meno spesso)');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${new URL(url).host}`);
  const dati = await r.json();
  ricordate.set(url, { etag: r.headers.get('etag'), dati, quando: Date.now() });
  return dati;
}

async function ultima(sw, sorgente, signal) {
  const intestazioni = sorgente.token ? { Authorization: `Bearer ${sorgente.token}` } : {};
  const base = `https://api.github.com/repos/${sw.repo}`;
  const elenco = sw.tag
    ? (await json(`${base}/tags?per_page=50`, { signal, intestazioni })).map((t) => ({ tag_name: t.name, published_at: null, html_url: `https://github.com/${sw.repo}/releases/tag/${t.name}` }))
    : await json(`${base}/releases?per_page=30`, { signal, intestazioni });
  const ramo = sw.ramo == null ? null : String(sw.ramo).replace(/^v/, '');
  const buone = elenco.filter((r) => !r.draft && !r.prerelease && !ANTEPRIMA.test(r.tag_name) && numeri(r.tag_name)
    && (!ramo || numeri(r.tag_name).join('.').startsWith(ramo))
    && (!sw.prefisso || r.tag_name.startsWith(sw.prefisso)));
  // La più alta per numero, non la più recente per data (le serie vecchie ricevono ancora patch).
  buone.sort((a, b) => confronta(b.tag_name, a.tag_name));
  const r = buone[0];
  return r ? { ultima: r.tag_name, uscita: r.published_at, link: r.html_url } : { ultima: null, uscita: null, link: `https://github.com/${sw.repo}/releases` };
}

async function testoDa(i, { signal, sorgenti, cartella }) {
  if (i.sorgente) {
    const s = sorgenti?.(i.sorgente);
    if (!s) throw new Error(`sorgente "${i.sorgente}" non trovata`);
    if (s.tipo !== 'http') throw new Error(`la sorgente "${i.sorgente}" non è di tipo http`);
    const { url, intestazioni } = preparaRichiesta(s, i.url || '');
    const r = await fetch(url, { signal, headers: { ...intestazioni, Accept: '*/*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} da ${senzaSegreti(url)}`);
    return r.text();
  }
  // Certificato della CA di casa (servizi interni in https), relativo alla cartella della configurazione.
  const ca = i.certificato_ca ? await fs.readFile(path.resolve(cartella || '.', i.certificato_ca), 'utf8') : undefined;
  const r = await richiestaJson(new URL(i.url), { signal, ca, nomeServer: i.nome_certificato, verifica: i.verifica_certificato !== false, intestazioni: { Accept: 'application/json, text/plain, */*' } });
  if (r.stato >= 400) throw new Error(`HTTP ${r.stato}`);
  return r.testo;
}

async function installata(sw, ctx) {
  const i = sw.installata;
  if (i == null) return null;
  if (typeof i !== 'object') return String(i);
  let testo = await testoDa(i, ctx);
  if (i.cerca) {
    testo = testo.match(new RegExp(i.cerca))?.[1];
    if (testo == null) return null;
    if (i.decodifica === 'base64') testo = Buffer.from(testo, 'base64').toString('utf8');
    if (!i.campo) return testo;
  }
  const o = JSON.parse(testo);
  if (typeof o !== 'object' || o === null) return String(o);   // es. Vaultwarden: "1.34.3-a2ad1dc7"
  // Più campi (es. Immich: major, minor, patch) diventano una versione con i punti.
  if (Array.isArray(i.campo)) { const parti = i.campo.map((c) => leggiPercorso(o, c)); return parti.some((x) => x == null) ? null : parti.join('.'); }
  const v = leggiPercorso(o, i.campo || 'version');
  return v == null ? null : String(v);
}

export async function leggi(sorgente, dati, { signal, sorgenti }) {
  // Molte richieste in parallelo sullo stesso segnale: oltre 10 Node avvisa di una (finta) perdita.
  if (signal) setMaxListeners(200, signal);
  // Dal modulo dell'editor l'elenco arriva come testo YAML; scritto nel file è già un elenco.
  // L'elenco può stare nella tile oppure nella sorgente, condiviso da più tile (aggiornamenti e inventario).
  const scritto = dati.software ?? sorgente.software;
  const elenco = typeof scritto === 'string' ? YAML.parse(scritto) || [] : Array.isArray(scritto) ? scritto : [];
  if (!elenco.length) throw new Error('manca "software": un elenco di { nome, repo, installata }');
  const righe = await Promise.all(elenco.map(async (sw) => {
    // "link: https://github.com/owner/repo" basta al posto di "repo".
    if (!sw.repo && /github\.com\/[\w.-]+\/[\w.-]+/.test(String(sw.link || ''))) sw = { ...sw, repo: String(sw.link).match(/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?(?:[/?#]|$)/)[1] };
    const riga = { nome: sw.nome || sw.repo, installata: null, ultima: null, uscita: null, link: sw.link || null, errore: null,
      come: sw.installata == null ? null : typeof sw.installata === 'object' ? 'letta' : 'scritta a mano' };
    const [u, i] = await Promise.allSettled([sw.repo ? ultima(sw, sorgente, signal) : Promise.resolve({}), installata(sw, { signal, sorgenti, cartella: sorgente._cartella })]);
    if (u.status === 'fulfilled') Object.assign(riga, u.value, sw.link ? { link: sw.link } : {});
    else riga.errore = u.reason.message;
    if (i.status === 'fulfilled') riga.installata = i.value;
    else riga.errore = [riga.errore, `installata: ${i.reason.message}`].filter(Boolean).join(' · ');
    const c = confronta(riga.installata, riga.ultima);
    riga.da_aggiornare = c === -1;
    riga.stato = !riga.ultima ? 'ultima sconosciuta' : c == null ? 'installata sconosciuta' : c < 0 ? 'da aggiornare' : c > 0 ? 'installata più nuova' : 'aggiornato';
    return riga;
  }));
  // GitHub ha rifiutato tutto (limite di letture): meglio un errore, così la tile tiene l'ultimo
  // dato buono invece di sostituirlo con una tabella di "ultima sconosciuta".
  const daGithub = righe.filter((r, i) => elenco[i].repo);
  if (daGithub.length && daGithub.every((r) => /limite di letture/.test(r.errore || ''))) {
    throw new Error('GitHub: limite di letture raggiunto, riprovo più tardi (con un token nella sorgente il limite sale a 5000 l\'ora)');
  }
  return righe;
}

export async function prova(sorgente, { signal }) {
  const intestazioni = sorgente.token ? { Authorization: `Bearer ${sorgente.token}` } : {};
  // Diretta, senza la memoria: deve dire quante letture restano adesso (e non consuma il limite).
  const r = await (await fetch('https://api.github.com/rate_limit', { signal, headers: { Accept: 'application/json', 'User-Agent': 'fluxboard', ...intestazioni } })).json();
  return `GitHub raggiungibile: ${r.rate?.remaining ?? '?'} letture disponibili su ${r.rate?.limit ?? '?'} ${sorgente.token ? '(con token)' : '(senza token)'}`;
}
