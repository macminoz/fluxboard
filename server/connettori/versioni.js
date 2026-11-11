// New versions of your software: for each program, the latest version published on GitHub
// and (if it can be read) the installed one, read from the service itself. One row per program:
//   { nome, installata, ultima, uscita, da_aggiornare, stato, link, come }
//   stato: "aggiornato" · "da aggiornare" · "installata più nuova" · "installata sconosciuta"
//   come:  where the installed version comes from ("letta" from the service or "scritta a mano")
//
// source: { tipo: versioni, token: ${GITHUB_TOKEN} }   // optional token: without it, 60 reads an hour
// dati:   { sorgente: <name>, software: [ … ] } (without software: the source's "software" list), where each program has:
//   nome, repo (owner/name on GitHub), ramo (e.g. "v2." to stay on the 2.x series),
//   tag: true          for projects that publish only tags, not releases (e.g. Mosquitto)
//   prefisso: "b"      only the tags starting like this (llama.cpp: b12000, not master-…)
//   installata:        how to read the installed version
//     "2.0.11"                                        written by hand (update it after each upgrade)
//     { url, campo: version }                         JSON without credentials
//     { url, campo: [major, minor, patch] }           several fields, joined with dots (Immich)
//     { url, cerca: "tags-(v[0-9.]+)" }               any text, the first group of the expression
//     { sorgente: adguard, url: control/status }      through an http source (with its credentials)
//     { url, cerca: …, decodifica: base64, campo: … } value hidden as base64 inside a page
//     certificato_ca: certificati/home-root-ca.pem, nome_certificato: …   https with your home CA
//     verifica_certificato: false                     only to read a number behind an expired certificate
//
// Pre-releases (rc, beta…) do not count. A tile reading every 6 hours is more than enough.

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
export const campiDati = [];   // without "software" in the tile the source's list applies

const ANTEPRIMA = /(alpha|beta|rc|pre|preview|nightly|dev)/i;

// "v2.9.1", "victoria-logs-…-v1.53.0", "13.1.0+security-01" → [2,9,1]
export function numeri(v) {
  // First a dotted number ("n8n@2.8.4" → 2.8.4, not the 8 of "n8n"), only then a lone number.
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

// GitHub's answers are remembered: for an hour they are not asked again, then "has it changed?" is
// asked (If-None-Match), and GitHub does not count 304 answers in the 60 reads an hour. If the
// limit is reached anyway, the last good answer is used instead of an error.
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
  // The highest by number, not the most recent by date (old series still get patches).
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
  // Your home CA certificate (internal https services), relative to the configuration folder.
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
  if (typeof o !== 'object' || o === null) return String(o);   // e.g. Vaultwarden: "1.34.3-a2ad1dc7"
  // Several fields (e.g. Immich: major, minor, patch) become a dotted version.
  if (Array.isArray(i.campo)) { const parti = i.campo.map((c) => leggiPercorso(o, c)); return parti.some((x) => x == null) ? null : parti.join('.'); }
  const v = leggiPercorso(o, i.campo || 'version');
  return v == null ? null : String(v);
}

export async function leggi(sorgente, dati, { signal, sorgenti }) {
  // Many requests in parallel on the same signal: past 10 Node warns about a (false) leak.
  if (signal) setMaxListeners(200, signal);
  // From the editor's form the list arrives as YAML text; written in the file it is already a list.
  // The list can be in the tile or in the source, shared by several tiles.
  const scritto = dati.software ?? sorgente.software;
  const elenco = typeof scritto === 'string' ? YAML.parse(scritto) || [] : Array.isArray(scritto) ? scritto : [];
  if (!elenco.length) throw new Error('manca "software": un elenco di { nome, repo, installata }');
  const righe = await Promise.all(elenco.map(async (sw) => {
    // "link: https://github.com/owner/repo" is enough instead of "repo".
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
  // GitHub refused everything (read limit): better an error, so the tile keeps the last good data
  // instead of replacing it with a table of "latest unknown".
  const daGithub = righe.filter((r, i) => elenco[i].repo);
  if (daGithub.length && daGithub.every((r) => /limite di letture/.test(r.errore || ''))) {
    throw new Error('GitHub: limite di letture raggiunto, riprovo più tardi (con un token nella sorgente il limite sale a 5000 l\'ora)');
  }
  return righe;
}

export async function prova(sorgente, { signal }) {
  const intestazioni = sorgente.token ? { Authorization: `Bearer ${sorgente.token}` } : {};
  // Direct, without the memory: it must tell how many reads are left now (and it does not use up
  // the limit).
  const r = await (await fetch('https://api.github.com/rate_limit', { signal, headers: { Accept: 'application/json', 'User-Agent': 'fluxboard', ...intestazioni } })).json();
  return `GitHub raggiungibile: ${r.rate?.remaining ?? '?'} letture disponibili su ${r.rate?.limit ?? '?'} ${sorgente.token ? '(con token)' : '(senza token)'}`;
}
