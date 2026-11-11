// Fluxboard: server HTTP. Serve la pagina, l'editor delle configurazioni, le API e il flusso
// di aggiornamenti in tempo reale (Server-Sent Events). Nessuna dipendenza dall'host su cui gira:
// tutto lo stato sta in FLUXBOARD_CONFIG e FLUXBOARD_CACHE, i segreti in variabili d'ambiente.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Configurazione, classifica, percorsoTile, percorsoLayout, workspaceDi, idNelWorkspace, nomeValido, WORKSPACE_PREDEFINITO } from './config.js';
import { caricaConnettori } from './connettori/index.js';
import { Motore } from './motore.js';
import { TIPI_TILE, LIVELLI } from './schema.js';
import { MODELLI_TILE, MODELLI_SORGENTE, modelloGenerico } from './modelli.js';
import { Catalogo } from './catalogo.js';
import { generi, Generi } from './generi.js';
import { avvisi } from './avvisi.js';
import { Allerta } from './allerta.js';
import { nascoste, OPERAZIONI as OPERAZIONI_RIGHE } from './nascoste.js';
import { durata, sostituisciEnv, leggiPercorso } from './util.js';
import { Segreti } from './segreti.js';
import { Snapshot } from './snapshot.js';
import { Immagini } from './immagini.js';
import fsSync from 'node:fs';
import { COLORI } from './schema.js';
import { compilaCondizione } from '../public/condizione.js';
import YAML from 'yaml';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(RADICE, '.env')); } catch { /* nessun .env: si usano le variabili già presenti */ }

const PORTA = Number(process.env.FLUXBOARD_PORT || 8080);
const INDIRIZZO = process.env.FLUXBOARD_HOST || '0.0.0.0';
const CARTELLA_CONFIG = path.resolve(RADICE, process.env.FLUXBOARD_CONFIG || 'config');
const CARTELLA_CACHE = path.resolve(RADICE, process.env.FLUXBOARD_CACHE || 'cache');
const CARTELLA_PUBBLICA = path.join(RADICE, 'public');
// Letta ogni volta: si può impostare o cambiare da Impostazioni avanzate → Segreti.
const passwordEditor = () => process.env.FLUXBOARD_ADMIN_PASSWORD || '';

const TIPI_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
};

const catalogo = new Catalogo(path.join(RADICE, 'catalogo'));
const connettori = await caricaConnettori([path.join(RADICE, 'server/connettori'), path.join(RADICE, 'plugin')]);
const config = new Configurazione(CARTELLA_CONFIG, connettori);
config.cartellaGeneriBase = path.join(RADICE, 'generi');
const segreti = new Segreti(path.resolve(RADICE, process.env.FLUXBOARD_SEGRETI || path.join(CARTELLA_CONFIG, 'segreti.env')));
await segreti.carica();
const motore = new Motore(config, connettori, CARTELLA_CACHE);
const allerta = new Allerta(config, motore);
await avvisi.carica(path.join(CARTELLA_CACHE, 'avvisi.json'));
await nascoste.carica(path.join(CARTELLA_CACHE, 'nascoste.json'));
// Un avviso nuovo o confermato: le tile che mostrano gli avvisi si rileggono subito.
let rilettura = null;
avvisi.quandoCambia(() => {
  clearTimeout(rilettura);
  rilettura = setTimeout(() => { for (const [id, t] of Object.entries(config.tile)) if (t.dati?.tipo === 'avvisi') motore.aggiorna(id); }, 300);
});
const VERSIONE = JSON.parse(fsSync.readFileSync(path.join(RADICE, 'package.json'), 'utf8')).version;
const snapshot = new Snapshot(config, segreti, VERSIONE);
const immagini = new Immagini(config);
await motore.ripristinaCache();
allerta.valuta();   // la situazione di partenza: dopo un riavvio niente notifiche per le allerte già in corso
await config.carica();
motore.programma();
// Tile che producono avvisi: se una sparisce (eliminata, spenta), i suoi avvisi diventano "risolti".
const origini = () => new Set(Object.entries(config.tile).filter(([, t]) => t.avvisi && t.attiva !== false)
  .flatMap(([id, t]) => ([].concat(t.avvisi).length > 1 ? [].concat(t.avvisi).map((_, i) => `${id}#${i}`) : [id])));
config.on('ricaricata', () => { motore.programma(); avvisi.dimentica(origini()); trasmetti('config', {}); });
avvisi.dimentica(origini());
config.osserva();

// ---------------------------------------------------------------- flusso di aggiornamenti

const clienti = new Set();
function trasmetti(evento, dati) {
  const messaggio = `event: ${evento}\ndata: ${JSON.stringify(dati)}\n\n`;
  for (const c of clienti) c.write(messaggio);
}
motore.on('stato', (id, stato) => { trasmetti('stato', { id, stato }); programmaAllerta(); });
// Il segnale in testata: si ricalcola poco dopo ogni lettura (le letture arrivano a gruppi).
let attesaAllerta = null;
function programmaAllerta() { clearTimeout(attesaAllerta); attesaAllerta = setTimeout(() => allerta.valuta(), 400); }
allerta.on('cambiata', (lista) => trasmetti('allerta', lista));
config.on('ricaricata', programmaAllerta);
setInterval(() => { for (const c of clienti) c.write(': battito\n\n'); }, 25_000);

// ---------------------------------------------------------------- la pagina

// ---------------------------------------------------------------- chi si collega
// Ogni schermo che apre la pagina viene ricordato (indirizzo, browser, profilo usato): serve a
// riconoscere i pannelli a muro e a decidere che profilo dargli. Regole in global.yaml:
//   schermi:
//     - { indirizzo: 192.168.1.60, display: pannello }  # IP esatto, o inizio ("192.168.1.")
//     - { browser: "Android", display: pannello }      # un pezzo del nome del browser (User-Agent)
// Una regola vale quando l'indirizzo della pagina non sceglie già un display (?display=...).
const schermiVisti = new Map();
const FILE_SCHERMI = path.join(CARTELLA_CACHE, 'schermi.json');
try { for (const s of JSON.parse(fsSync.readFileSync(FILE_SCHERMI, 'utf8'))) schermiVisti.set(`${s.indirizzo}|${s.browser}`, s); } catch { /* prima volta */ }
let attesaSchermi = null;
function chiSiCollega(req) {
  const indirizzo = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const browser = String(req.headers['user-agent'] || '').slice(0, 300);
  return { indirizzo, browser };
}
function displayPerSchermo({ indirizzo, browser }) {
  for (const r of [].concat(config.globale.schermi || [])) {
    if (!r?.display) continue;
    const ip = r.indirizzo && String(r.indirizzo);
    if (ip && !(indirizzo === ip || (ip.endsWith('.') && indirizzo.startsWith(ip)))) continue;
    if (r.browser && !browser.toLowerCase().includes(String(r.browser).toLowerCase())) continue;
    if (!ip && !r.browser) continue;
    return String(r.display);
  }
  return null;
}
function ricordaSchermo(chi, display, regola) {
  const k = `${chi.indirizzo}|${chi.browser}`;
  const prima = schermiVisti.get(k);
  schermiVisti.set(k, { ...chi, display, regola: Boolean(regola), visto: Date.now(), primo: prima?.primo || Date.now(), volte: (prima?.volte || 0) + 1 });
  if (schermiVisti.size > 60) {
    const vecchio = [...schermiVisti.values()].sort((a, b) => a.visto - b.visto)[0];
    schermiVisti.delete(`${vecchio.indirizzo}|${vecchio.browser}`);
  }
  clearTimeout(attesaSchermi);
  attesaSchermi = setTimeout(() => fs.writeFile(FILE_SCHERMI, JSON.stringify([...schermiVisti.values()])).catch(() => {}), 2000);
}

function profiloDisplay(nome) {
  const profili = config.globale.display || {};
  const scelto = profili[nome] ? nome : Object.keys(profili)[0] || 'browser';
  return { nome: scelto, ...(profili[scelto] || { colonne: 4 }), disponibili: Object.keys(profili) };
}

// ---------------------------------------------------------------- azioni
// Il browser manda solo: quale tile, quale azione, quale riga (per chiave) e i campi compilati.
// Cosa eseguire e con quali parametri sta nel file della tile; la riga è quella letta dal server.
const compila = (modello, contesto) => String(modello).replace(/\{([\w.]+)\}/g, (_, c) => String(leggiPercorso(contesto, c) ?? ''));

async function eseguiAzione({ tile: id, azione, riga: chiave, campi = {} }) {
  const t = config.tile[id];
  const a = t?.azioni?.find((x) => x.id === azione);
  if (!a) return { ok: false, messaggio: 'azione sconosciuta' };
  // Ack e Ignora delle righe (server/nascoste.js): valgono per ogni tile, senza password.
  if (OPERAZIONI_RIGHE.includes(a.operazione)) {
    const campo = a.chiave || 'id';
    if (!a.globale && !(motore.stato.get(id)?.righe || []).some((r) => String(r[campo]) === String(chiave))) return { ok: false, messaggio: 'la riga non c\'è più: ricarica la pagina' };
    const messaggio = await nascoste.esegui(a.operazione, id, campo, chiave);
    console.log(`[azione] ${id}/${azione} ${campo}=${chiave ?? ''} → ${messaggio}`);
    motore.aggiorna(id);
    return { ok: true, messaggio };
  }
  // Tile senza sorgente (es. il centro avvisi): le operazioni sono del suo tipo di dati.
  const nomeSorgente = a.sorgente || t.dati?.sorgente;
  const c = nomeSorgente ? connettori.get(config.sorgenti[nomeSorgente]?.tipo) : connettori.get(t.dati?.tipo);
  const operazione = c?.azioni?.[a.operazione];
  if (!operazione) return { ok: false, messaggio: `la sorgente "${nomeSorgente || t.dati?.tipo}" non sa fare "${a.operazione}"` };
  // Alcune operazioni non toccano niente fuori da Fluxboard (segnare un avviso come visto): niente password.
  const libera = (c.azioniLibere || []).includes(a.operazione);
  if (!libera && !passwordEditor()) return { ok: false, messaggio: 'Le azioni sono disattivate finché non c\'è una password: impostala in Impostazioni avanzate → Segreti (FLUXBOARD_ADMIN_PASSWORD).' };
  if (!libera && config.globale.azioni === false) return { ok: false, messaggio: 'Azioni disattivate in global.yaml' };
  let riga = {};
  if (!a.globale) {
    riga = (motore.stato.get(id)?.righe || []).find((r) => String(r[a.chiave || 'id']) === String(chiave));
    if (!riga) return { ok: false, messaggio: 'la riga non c\'è più: ricarica la pagina' };
    if (a.quando && !compilaCondizione(a.quando)(riga)) return { ok: false, messaggio: 'l\'azione non vale più per questa riga (lo stato è cambiato)' };
  }
  const valori = {};
  for (const def of a.campi || []) {
    const v = String(campi[def.nome] ?? '').trim();
    if (!v && def.obbligatorio !== false) return { ok: false, messaggio: `manca "${def.etichetta || def.nome}"` };
    if (def.valori && !def.valori.map(String).includes(v)) return { ok: false, messaggio: `"${def.etichetta || def.nome}": valore non ammesso` };
    if (def.formato && !new RegExp(def.formato).test(v)) return { ok: false, messaggio: `"${def.etichetta || def.nome}": formato non valido` };
    valori[def.nome] = v;
  }
  const contesto = { ...riga, ...valori };
  const parametri = Object.fromEntries(Object.entries(a.parametri || {}).map(([k, v]) => [k, compila(v, contesto)]));
  try {
    const messaggio = await operazione(nomeSorgente ? config.sorgenteRisolta(nomeSorgente) : {}, parametri, {
      signal: AbortSignal.timeout(30_000), azione: a, url: a.url ? compila(a.url, contesto) : undefined,
    });
    console.log(`[azione] ${id}/${azione} ${JSON.stringify(parametri)} → ${messaggio}`);
    setTimeout(() => motore.aggiorna(id), 3_000);
    return { ok: true, messaggio };
  } catch (e) {
    console.log(`[azione] ${id}/${azione} ${JSON.stringify(parametri)} ✕ ${e.message}`);
    return { ok: false, messaggio: e.message };
  }
}

function tileDellaSorgente(nome) {
  return Object.entries(config.tile).filter(([, t]) => t.dati?.sorgente === nome).map(([id]) => id);
}

// Nome della variabile per un segreto scritto nel modulo: quello già usato, se c'è, altrimenti
// SORGENTE_CAMPO (es. dns-technitium + autenticazione.segreto → DNS_TECHNITIUM_SEGRETO).
function nomeSegreto(sorgente, campo, attuale) {
  const m = typeof attuale === 'string' && attuale.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (m) return m[1];
  return `${sorgente}_${campo.split('.').at(-1)}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function impostaPercorso(oggetto, percorso, valore) {
  const chiavi = percorso.split('.');
  let o = oggetto;
  for (const k of chiavi.slice(0, -1)) o = (o[k] && typeof o[k] === 'object') ? o[k] : (o[k] = {});
  o[chiavi.at(-1)] = valore;
}

// L'etichetta (temperatura, allarmi…) dice a quale sezione appartiene la tile e ne dà colore,
// icona e sfondo; "colore" resta per un colore diretto. Per compatibilità "colore: <etichetta>"
// vale come etichetta.
function coloreTile(t) {
  const etichette = config.globale.argomenti || {};
  const etichetta = t.etichetta ?? (t.colore in etichette ? t.colore : undefined);
  const coloreDi = (n) => (typeof etichette[n] === 'string' ? etichette[n] : etichette[n]?.colore);
  const a = etichette[etichetta];
  const colore = t.colore && !(t.colore in etichette) ? t.colore : coloreDi(etichetta);
  // sfondoEtichetta: lo sfondo pieno chiesto dall'etichetta vale solo senza sezioni (con le sezioni il
  // colore lo dà già il riquadro, e lo sfondo pieno resta per gli allarmi veri, cioè colore_se).
  return { colore, argomento: etichetta, icona: t.icona, sfondo: t.sfondo ?? null, sfondoEtichetta: typeof a === 'object' ? Boolean(a?.sfondo) : false };
}

// Quello che il browser riceve di una tile: niente query, niente sorgenti, niente segreti.
function tilePerClient(id, t) {
  const tipo = TIPI_TILE[t.tipo];
  const predefinito = durata(config.globale.aggiornamento, 60_000);
  const ogni = durata(t.ogni, predefinito);
  return {
    percorso: percorsoTile(id),
    id,
    tipo: t.tipo,
    genere: t.genere || null,
    titolo: t.titolo ?? id,
    priorita: t.priorita ?? 50,
    larghezza: t.larghezza || 'stretta',
    // nascondi_vuote: false in global.yaml = le tile con dati restano anche quando sono vuote.
    mostra_se: t.mostra_se || (tipo?.mostraSe === 'dati' && config.globale.nascondi_vuote === false ? 'sempre' : tipo?.mostraSe) || 'sempre',
    livello_minimo: t.livello_minimo || 'base',
    conDati: Boolean(t.dati),
    scadenza: durata(t.scadenza, ogni * 3),
    ogni: t.dati ? Math.max(5_000, ogni) : undefined,   // come il motore: mai meno di 5 s
    finestre: t.finestre,
    riga: t.riga, testo: t.testo, vuoto: t.vuoto, voci: t.voci, ...coloreTile(t),
    serie: t.serie, fasce: t.fasce, soglie: t.soglie, tacche: t.tacche, gruppo: t.gruppo, se: t.se, ordine: t.ordine, finestra: t.finestra, tono: t.tono, etichetta_se: t.etichetta_se, stato: t.stato, stato_se: t.stato_se, in_fondo: t.in_fondo, intensita: t.intensita, viste: t.viste, asse: t.asse, unita: t.unita, decimali: t.decimali, tabella: t.tabella, colore_se: t.colore_se,
    // Delle azioni il browser riceve solo come mostrarle: cosa fanno resta sul server.
    azioni: (t.azioni || []).map((a) => ({ id: a.id, etichetta: a.etichetta, quando: a.quando, conferma: a.conferma, tono: a.tono,
      globale: Boolean(a.globale), chiave: a.chiave || 'id', livello: a.livello || 'intermedia', campi: a.campi, subito: a.subito === true })),
    url: t.url, diretto: t.diretto === true, altezza: t.altezza, aggiorna_ogni: durata(t.aggiorna_ogni, 0),
    link: t.link, errore: t.errore,
  };
}

// Ordine e dimensioni: prima le tile elencate nella disposizione del display, nell'ordine
// scelto; poi tutte le altre (per esempio una tile appena creata) per priorità.
function pagina(nomeDisplay, nomeWorkspace) {
  const display = profiloDisplay(nomeDisplay);
  const ws = config.workspace.includes(nomeWorkspace) ? nomeWorkspace : WORKSPACE_PREDEFINITO;
  const disposizione = config.layout[ws]?.[display.nome] || [];
  // Nella disposizione le tile si citano per id; la chiave della tile ha anche il workspace.
  const posizione = new Map(disposizione.map((v, i) => [v.id, i]));
  const pos = (chiave) => posizione.get(idNelWorkspace(chiave));
  // Una tile sta nel suo workspace e in quelli elencati in "anche_in". Le tile spente arrivano
  // lo stesso, segnate: si vedono solo in modalità Modifica, per riaccenderle con un click.
  const tile = Object.entries(config.tile)
    .filter(([id, t]) => (workspaceDi(id) === ws || (t.anche_in || []).includes(ws))
      && (!display.includi || display.includi.includes(idNelWorkspace(id)))
      && !(display.escludi || []).includes(idNelWorkspace(id)))
    .map(([id, t]) => {
      const v = disposizione[pos(id)];
      return { ...tilePerClient(id, t), ...vocePerClient(v),
        spenta: t.attiva === false, ospite: workspaceDi(id) !== ws ? workspaceDi(id) : undefined, anche_in: t.anche_in };
    })
    .sort((a, b) => (pos(a.id) ?? Infinity) - (pos(b.id) ?? Infinity)
      || b.priorita - a.priorita || a.id.localeCompare(b.id));
  const stato = Object.fromEntries(tile.filter((t) => motore.stato.has(t.id)).map((t) => [t.id, motore.stato.get(t.id)]));
  const { titolo, tema, fuso, livello, lingua } = config.globale;
  return {
    globale: { titolo, tema, fuso, argomenti: config.globale.argomenti || {}, sezioni: config.globale.sezioni !== false, lingua: lingua || 'it', livello: display.livello || livello, livelli: LIVELLI, editor: config.globale.editor !== false && display.pannello !== true },
    display, tile, stato, ora: Date.now(),
    sezioni: config.sezioni[ws]?.[display.nome] || {},
    // Allarmi e Completa: una disposizione propria, se è stata fatta in Modifica (altrimenti si
    // dispongono da sole). Per id della tile come li conosce la pagina.
    versione: VERSIONE,
    allerte: allerta.lista,
    disposizioniViste: Object.fromEntries(['allarmi', 'completa'].map((v) => {
      const l = config.layout[ws]?.[`${display.nome}--${v}`];
      if (!l) return [v, null];
      const perId = new Map(l.map((x) => [x.id, x]));
      return [v, { tile: Object.fromEntries(tile.map((t) => [t.id, perId.has(idNelWorkspace(t.id)) ? vocePerClient(perId.get(idNelWorkspace(t.id))) : null])), sezioni: config.sezioni[ws]?.[`${display.nome}--${v}`] || {} }];
    })),
    workspace: { attuale: ws, elenco: config.workspace, vuoto: !Object.entries(config.tile).some(([k, t]) => workspaceDi(k) === ws || (t.anche_in || []).includes(ws)) },
  };
}

// Una voce del file di disposizione come la usa la pagina (altezza → altezza_px).
const vocePerClient = (v) => ({ colonne: v?.colonne, altezza_px: v?.altezza, ridotta: v?.ridotta, chiusa: v?.chiusa, x: v?.x, y: v?.y, larghezze: v?.colonne_tabella });

// Larghezze delle colonne di una tabella: { "Host": 160 } (pixel), solo valori sensati.
function pulisciLarghezze(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const r = Object.fromEntries(Object.entries(o).filter(([k, v]) => k && k.length <= 60 && Number.isInteger(v) && v >= 30 && v <= 1500).slice(0, 20));
  return Object.keys(r).length ? r : undefined;
}

function testoLayout(display, voci, sezioni = {}) {
  const intero = (n) => (Number.isInteger(n) && n >= 0 ? n : undefined);
  const pulite = Object.fromEntries(Object.entries(sezioni || {}).filter(([, v]) => v && (Number.isInteger(v.colonne) || Number.isInteger(v.x)))
    .map(([k, v]) => [k, Object.fromEntries(Object.entries({ colonne: v.colonne, x: intero(v.x), y: intero(v.y) }).filter(([, x]) => x !== undefined))]));
  return `# Disposizione del display "${display}": ordine e dimensioni delle tile.\n`
    + '# Scritta dalla modalità "Modifica" della pagina; si può modificare anche a mano.\n'
    + '# colonne = larghezza in colonne · altezza = pixel (assente = automatica) · ridotta = mostra solo l\'inizio\n'
    + '# x = colonna (da 0) · y = riga da 8 px (da 0): dove sta la tile nella sua sezione; le tile salgono da sole a chiudere i vuoti\n'
    + '# colonne_tabella = larghezza in pixel delle colonne delle tabelle, per intestazione (si trascina il bordo della colonna)\n'
    + '# sezioni = per ogni etichetta la larghezza della sezione (colonne) e dove sta nella pagina (x, y), quando le tile sono raggruppate\n'
    + '# Le viste Allarmi e Completa possono avere una disposizione propria: <display>--allarmi.yaml, <display>--completa.yaml\n'
    + YAML.stringify({ tile: voci, ...(Object.keys(pulite).length ? { sezioni: pulite } : {}) }, { flowLevel: 2 });
}

// ---------------------------------------------------------------- utilità HTTP

function json(res, codice, corpo) {
  res.writeHead(codice, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

async function leggiCorpo(req, limite = 1_000_000) {
  let dimensione = 0; const pezzi = [];
  for await (const pezzo of req) {
    dimensione += pezzo.length;
    if (dimensione > limite) throw Object.assign(new Error('richiesta troppo grande'), { codice: 413 });
    pezzi.push(pezzo);
  }
  const testo = Buffer.concat(pezzi).toString('utf8');
  return testo ? JSON.parse(testo) : {};
}

function autorizzato(req) {
  if (!passwordEditor()) return true;
  const [schema, valore] = (req.headers.authorization || '').split(' ');
  if (schema !== 'Basic' || !valore) return false;
  const password = Buffer.from(valore, 'base64').toString('utf8').split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(passwordEditor()).digest();
  return crypto.timingSafeEqual(a, b);
}

async function serviFile(res, file) {
  const completo = path.resolve(CARTELLA_PUBBLICA, file);
  if (!completo.startsWith(CARTELLA_PUBBLICA + path.sep)) return json(res, 404, { errore: 'non trovato' });
  try {
    const contenuto = await fs.readFile(completo);
    res.writeHead(200, { 'Content-Type': TIPI_MIME[path.extname(completo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contenuto);
  } catch { json(res, 404, { errore: 'non trovato' }); }
}

// ---------------------------------------------------------------- API dell'editor

async function apiConfig(req, res, url) {
  const percorso = url.searchParams.get('percorso');
  const metodo = req.method;
  const rotta = url.pathname.replace(/^\/api\/config/, '') || '/';

  if (rotta === '/' && metodo === 'GET') {
    return json(res, 200, {
      file: await config.elenco(),
      connettori: [...connettori.values()].map((c) => ({
        tipo: c.tipo, nome: c.nome || c.tipo, gruppo: c.gruppo || 'Altro', descrizione: c.descrizione,
        senzaSorgente: Boolean(c.senzaSorgente), campiDati: c.campiDati || [],
        moduloSorgente: c.moduloSorgente || (c.campiSorgente || []).map((n) => ({ nome: n, etichetta: n, tipo: 'testo', obbligatorio: true })),
        moduloDati: c.moduloDati || (c.campiDati || []).map((n) => ({ nome: n, etichetta: n, tipo: n === 'query' ? 'query' : 'testo', obbligatorio: true })),
        azioni: Object.keys(c.azioni || {}),
      })),
      segreti: segreti.elenco(config.sorgenti),
      sorgenti: Object.entries(config.sorgenti).map(([nome, s]) => ({ nome, tipo: s.tipo })),
      tipiTile: Object.entries(TIPI_TILE).map(([tipo, t]) => ({ tipo, descrizione: t.descrizione })),
      protetto: Boolean(passwordEditor()),
      workspace: config.workspace,
      nascondiVuote: config.globale.nascondi_vuote !== false,
      colori: COLORI,
      argomenti: config.globale.argomenti || {},
    });
  }
  // Snapshot ed export: tutta la configurazione in un file, senza segreti.
  if (rotta === '/schermi' && metodo === 'GET') {
    return json(res, 200, { schermi: [...schermiVisti.values()].sort((a, b) => b.visto - a.visto), regole: config.globale.schermi || [] });
  }
  if (rotta === '/snapshot' && metodo === 'GET') return json(res, 200, { snapshot: await snapshot.elenco() });
  if (rotta === '/snapshot' && metodo === 'POST') {
    const { nome } = await leggiCorpo(req);
    try { return json(res, 200, { ok: true, ...await snapshot.crea(String(nome || '').trim().slice(0, 80)) }); }
    catch (e) { return json(res, e.codice || 500, { errore: e.message }); }
  }
  if (rotta === '/snapshot' && metodo === 'DELETE') { await snapshot.elimina(url.searchParams.get('id')); return json(res, 200, { ok: true }); }
  if (rotta === '/snapshot/ripristina' && metodo === 'POST') {
    const { id } = await leggiCorpo(req);
    const p = await snapshot.leggi(id);
    return json(res, 200, await snapshot.applica(p, `ripristino di "${p.nome}"`));
  }
  if (rotta === '/esporta' && metodo === 'GET') {
    const id = url.searchParams.get('id');
    const p = id ? await snapshot.leggi(id) : await snapshot.pacchetto('export');
    const nome = `fluxboard-${(p.creato || '').slice(0, 10)}${id ? `-${id.split('--')[1] || 'snapshot'}` : ''}.json`;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(p, null, 1));
  }
  if (rotta === '/importa' && metodo === 'POST') {
    const p = await leggiCorpo(req, 10_000_000);
    return json(res, 200, await snapshot.applica(p, `import${p.nome ? ` di "${p.nome}"` : ''}`));
  }
  // Impostazioni della dashboard dal modulo: solo le chiavi di global.yaml che il modulo conosce.
  if (rotta === '/globale' && metodo === 'GET') return json(res, 200, { globale: config.globale });
  if (rotta === '/globale' && metodo === 'PUT') {
    const { campi = {} } = await leggiCorpo(req);
    const ammesse = ['titolo', 'livello', 'tema', 'aggiornamento', 'nascondi_vuote', 'sezioni', 'argomenti', 'schermi'];
    const filtrati = Object.fromEntries(Object.entries(campi).filter(([k]) => ammesse.includes(k)));
    return json(res, 200, await config.aggiornaCampi('global.yaml', filtrati, { sostituisci: [['argomenti'], ['schermi']] }));
  }
  if (rotta === '/workspace' && metodo === 'POST') {
    const { nome } = await leggiCorpo(req);
    await config.creaWorkspace(nome);
    return json(res, 200, { ok: true, workspace: config.workspace });
  }
  if (rotta === '/workspace' && metodo === 'DELETE') {
    await config.eliminaWorkspace(url.searchParams.get('nome'));
    return json(res, 200, { ok: true, workspace: config.workspace });
  }
  // Riammette una riga nascosta con Ack o Ignora (dallo storico della tile).
  if (rotta === '/riammetti' && metodo === 'POST') {
    const { tile: id, chiave } = await leggiCorpo(req);
    const t = config.tile[id];
    if (!t || typeof chiave !== 'string') return json(res, 400, { ok: false, messaggio: 'servono "tile" e "chiave"' });
    try {
      const messaggio = t.dati?.tipo === 'avvisi' ? avvisi.riammetti(chiave) : await nascoste.riammetti(id, chiave);
      console.log(`[riammetti] ${id} ${chiave.slice(0, 80)} → ${messaggio}`);
      motore.aggiorna(id);
      return json(res, 200, { ok: true, messaggio });
    } catch (e) { return json(res, 200, { ok: false, messaggio: e.message }); }
  }
  if (rotta === '/azione' && metodo === 'POST') return json(res, 200, await eseguiAzione(await leggiCorpo(req)));
  if (rotta === '/segreti' && metodo === 'GET') return json(res, 200, { segreti: segreti.elenco(config.sorgenti) });
  if (rotta === '/segreti' && metodo === 'PUT') {
    const { nome, valore } = await leggiCorpo(req);
    await segreti.imposta(nome, valore);
    // Rilegge subito le tile che usano una sorgente con quel segreto.
    const sorgentiToccate = Object.entries(config.sorgenti).filter(([, s]) => JSON.stringify(s).includes(`\${${nome}}`)).map(([n]) => n);
    for (const [id, t] of Object.entries(config.tile)) if (sorgentiToccate.includes(t.dati?.sorgente)) motore.aggiorna(id);
    return json(res, 200, { ok: true, segreti: segreti.elenco(config.sorgenti) });
  }
  if (rotta === '/file' && metodo === 'GET') {
    if (!classifica(percorso || '')) return json(res, 400, { errore: 'percorso non ammesso' });
    try { return json(res, 200, { testo: await config.leggiFile(percorso) }); }
    catch { return json(res, 404, { errore: 'file inesistente' }); }
  }
  if (rotta === '/file' && metodo === 'PUT') {
    const { percorso: p, testo } = await leggiCorpo(req);
    if (!classifica(p || '')) return json(res, 400, { errore: 'percorso non ammesso: usa global.yaml, sorgenti/<nome>.yaml o tile/<nome>.yaml (minuscole, cifre, trattini)' });
    return json(res, 200, await config.scriviFile(p, String(testo ?? '')));
  }
  if (rotta === '/file' && metodo === 'DELETE') {
    if (!classifica(percorso || '')) return json(res, 400, { errore: 'percorso non ammesso' });
    await config.eliminaFile(percorso);
    return json(res, 200, { ok: true });
  }
  // Larghezze delle colonne di una tabella: solo quelle di una tile, nella disposizione del display
  // (valgono in tutte le viste), senza toccare posizioni e misure.
  if (rotta === '/layout/colonne' && metodo === 'PUT') {
    const { display, id, larghezze, workspace = WORKSPACE_PREDEFINITO } = await leggiCorpo(req);
    if (!nomeValido(display) || typeof id !== 'string' || !config.workspace.includes(workspace)) return json(res, 400, { errore: 'servono "display", "id" e un workspace esistente' });
    const voci = (config.layout[workspace]?.[display] || []).map((v) => ({ ...v }));
    const nome = idNelWorkspace(id);
    let voce = voci.find((v) => v.id === nome);
    if (!voce) voci.push(voce = { id: nome });
    const pulite = pulisciLarghezze(larghezze);
    if (pulite) voce.colonne_tabella = pulite; else delete voce.colonne_tabella;
    return json(res, 200, await config.scriviFile(percorsoLayout(workspace, display), testoLayout(display, voci, config.sezioni[workspace]?.[display] || {})));
  }
  if (rotta === '/layout' && metodo === 'PUT') {
    const { display, tile, sezioni, workspace = WORKSPACE_PREDEFINITO } = await leggiCorpo(req);
    if (!nomeValido(display) || !Array.isArray(tile) || !config.workspace.includes(workspace)) return json(res, 400, { errore: 'servono "display", "tile" e un workspace esistente' });
    const intero = (n, max) => (Number.isInteger(n) && n >= 0 && n <= max ? n : undefined);
    const voci = tile.map((v) => Object.fromEntries(Object.entries({ id: idNelWorkspace(v.id), colonne: v.colonne, altezza: v.altezza, ridotta: v.ridotta === true ? true : undefined, chiusa: v.chiusa === true ? true : undefined, x: intero(v.x, 11), y: intero(v.y, 100_000), colonne_tabella: pulisciLarghezze(v.colonne_tabella) })
      .filter(([, x]) => x !== undefined && x !== null)));
    // Le sezioni non citate restano come sono.
    const tutte = { ...(config.sezioni[workspace]?.[display] || {}), ...(sezioni && typeof sezioni === 'object' ? sezioni : {}) };
    return json(res, 200, await config.scriviFile(percorsoLayout(workspace, display), testoLayout(display, voci, tutte)));
  }
  // ---- editor visuale delle tile, usato direttamente dalla dashboard
  if (rotta === '/tile' && metodo === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!classifica(percorsoTile(id))) return json(res, 400, { errore: 'id non valido' });
    try {
      const testo = await config.leggiFile(percorsoTile(id));
      const oggetto = YAML.parse(testo) ?? {};
      // Tile di un genere: anche il genere (i campi da chiedere) e la tile espansa (per l'anteprima).
      const g = oggetto.genere ? generi.get(oggetto.genere) : null;
      return json(res, 200, { id, testo, oggetto, genere: g ? { id: g.id, nome: g.nome, descrizione: g.descrizione, icona: g.icona, campi: g.campi } : null,
        espansa: g ? generi.espandi(oggetto).tile : null });
    } catch { return json(res, 404, { errore: 'tile inesistente' }); }
  }
  if (rotta === '/tile' && metodo === 'PUT') {
    const { id, campi, testo, nuovo, sostituisci } = await leggiCorpo(req);
    const rel = percorsoTile(id);
    if (!classifica(rel)) return json(res, 400, { errore: 'nome non valido: minuscole, cifre e trattini' });
    if (typeof testo === 'string') {
      if (nuovo && config.tile[id]) return json(res, 200, { ok: false, errori: [`la tile "${id}" esiste già`], avvisi: [] });
      return json(res, 200, await config.scriviFile(rel, testo));
    }
    // Tile di genere: gli elenchi scritti nel modulo come testo YAML tornano elenchi nel file.
    const genereScritto = campi?.genere || (!nuovo && config.tile[id]?.genere);
    if (genereScritto && campi?.campi && typeof campi.campi === 'object') {
      const g = generi.get(genereScritto);
      for (const c of g?.campi || []) {
        const v = campi.campi[c.nome];
        if (typeof v === 'string' && ['query', 'elenco'].includes(c.tipo) && /^\s*-\s|^\s*[[{]/.test(v)) { try { campi.campi[c.nome] = YAML.parse(v); } catch { /* resta testo */ } }
        // Il campo "dati": gli elenchi della sorgente (software, servizi…) scritti come testo YAML.
        if (c.tipo === 'dati' && v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && /^\s*-\s/.test(x)) { try { v[k] = YAML.parse(x); } catch { /* resta testo */ } }
        }
      }
    }
    return json(res, 200, await config.aggiornaCampi(rel, campi || {}, { nuovo: Boolean(nuovo), sostituisci: sostituisci || [] }));
  }

  // Sorgenti dal modulo (come le "data source" di Grafana): tipo, campi, segreti, prova.
  if (rotta === '/sorgente' && metodo === 'GET') {
    const nome = url.searchParams.get('nome');
    const rel = `sorgenti/${nome}.yaml`;
    if (!classifica(rel)) return json(res, 400, { errore: 'nome non valido' });
    const testo = await config.leggiFile(rel);
    return json(res, 200, { nome, testo, oggetto: YAML.parse(testo) || {}, usataDa: tileDellaSorgente(nome) });
  }
  if (rotta === '/sorgente' && metodo === 'PUT') {
    const { nome, campi = {}, segreti: nuovi = {}, nuovo, sostituisci } = await leggiCorpo(req);
    const rel = `sorgenti/${nome}.yaml`;
    if (!classifica(rel)) return json(res, 400, { errore: 'nome non valido: minuscole, cifre e trattini' });
    const attuale = config.sorgenti[nome] || {};
    // Un segreto scritto nel modulo va in segreti.env; nel file resta solo ${NOME}.
    for (const [campo, valore] of Object.entries(nuovi)) {
      if (!valore) continue;
      const variabile = nomeSegreto(nome, campo, leggiPercorso(attuale, campo));
      await segreti.imposta(variabile, valore);
      impostaPercorso(campi, campo, `\${${variabile}}`);
    }
    const esito = await config.aggiornaCampi(rel, campi, { nuovo: Boolean(nuovo), sostituisci: sostituisci || [] });
    if (esito.ok) for (const id of tileDellaSorgente(nome)) motore.aggiorna(id);
    return json(res, 200, esito);
  }
  // Rinominare una sorgente: file nuovo, tutte le tile (di ogni workspace) puntate sul nome nuovo,
  // vecchio file nel cestino. I segreti restano come sono (${NOME} nel file non cambia).
  if (rotta === '/sorgente/rinomina' && metodo === 'POST') {
    const { da, a } = await leggiCorpo(req);
    if (!config.sorgenti[da]) return json(res, 404, { errore: `la sorgente "${da}" non esiste` });
    if (!nomeValido(a)) return json(res, 400, { errore: 'nome non valido: minuscole, cifre e trattini' });
    if (config.sorgenti[a]) return json(res, 409, { errore: `esiste già una sorgente "${a}"` });
    const creata = await config.scriviFile(`sorgenti/${a}.yaml`, await config.leggiFile(`sorgenti/${da}.yaml`));
    if (!creata.ok) return json(res, 200, creata);
    const toccate = [];
    for (const [id, t] of Object.entries(config.tile)) {
      const usa = t.dati?.sorgente === da || (t.azioni || []).some((x) => x.sorgente === da);
      if (!usa) continue;
      const doc = YAML.parseDocument(await config.leggiFile(percorsoTile(id)));
      if (doc.getIn(['dati', 'sorgente']) === da) doc.setIn(['dati', 'sorgente'], a);
      const azioni = doc.get('azioni');
      if (YAML.isSeq(azioni)) for (const voce of azioni.items) if (YAML.isMap(voce) && voce.get('sorgente') === da) voce.set('sorgente', a);
      await config.scriviFile(percorsoTile(id), doc.toString({ lineWidth: 0 }));
      toccate.push(id);
    }
    await config.eliminaFile(`sorgenti/${da}.yaml`);
    return json(res, 200, { ok: true, tile: toccate });
  }
  if (rotta === '/sorgente/prova' && metodo === 'POST') {
    const { nome, oggetto = {}, segreti: nuovi = {} } = await leggiCorpo(req);
    const c = connettori.get(oggetto.tipo);
    if (!c) return json(res, 200, { ok: false, messaggio: `tipo sconosciuto: ${oggetto.tipo}` });
    const prova = structuredClone(oggetto);
    const mancanti = new Set();
    const risolta = sostituisciEnv(prova, mancanti);
    for (const [campo, valore] of Object.entries(nuovi)) if (valore) impostaPercorso(risolta, campo, valore);
    // Un segreto non ritoccato nel modulo vale quello già salvato.
    for (const campo of Object.keys(nuovi)) if (!nuovi[campo] && nome && config.sorgenti[nome]) {
      try { impostaPercorso(risolta, campo, leggiPercorso(config.sorgenteRisolta(nome), campo)); } catch { /* resta vuoto */ }
    }
    const inizio = Date.now();
    try {
      const controllo = AbortSignal.timeout(durata(risolta.timeout, 10_000));
      const messaggio = c.prova ? await c.prova(risolta, { signal: controllo }) : 'nessuna prova disponibile per questo tipo';
      return json(res, 200, { ok: true, messaggio, ms: Date.now() - inizio });
    } catch (e) {
      return json(res, 200, { ok: false, messaggio: e.name === 'TimeoutError' ? 'nessuna risposta entro il tempo massimo' : e.message, ms: Date.now() - inizio });
    }
  }
  if (rotta === '/duplica' && metodo === 'POST') {
    const { id, display } = await leggiCorpo(req);
    const rel = percorsoTile(id);
    if (!classifica(rel) || !config.tile[id]) return json(res, 404, { errore: 'tile inesistente' });
    let nuovoId = `${id}-copia`;
    for (let n = 2; config.tile[nuovoId]; n++) nuovoId = `${id}-copia-${n}`;
    const doc = YAML.parseDocument(await config.leggiFile(rel));
    const titolo = doc.get('titolo');
    if (typeof titolo === 'string' && titolo) doc.set('titolo', `${titolo} (copia)`);
    const esito = await config.scriviFile(percorsoTile(nuovoId), doc.toString({ lineWidth: 0 }));
    // Nella disposizione del display la copia va subito dopo l'originale, non in fondo.
    const ws = workspaceDi(id);
    const disposizione = config.layout[ws]?.[display];
    if (esito.ok && disposizione) {
      const i = disposizione.findIndex((v) => v.id === idNelWorkspace(id));
      const voci = [...disposizione];
      voci.splice(i < 0 ? voci.length : i + 1, 0, { ...(voci[i] || {}), id: idNelWorkspace(nuovoId) });
      await config.scriviFile(percorsoLayout(ws, display), testoLayout(display, voci, config.sezioni[ws]?.[display]));
    }
    return json(res, 200, { ...esito, id: nuovoId, percorso: percorsoTile(nuovoId) });
  }
  if (rotta === '/ripristina' && metodo === 'POST') {
    const { percorso: p } = await leggiCorpo(req);
    if (!classifica(p || '')) return json(res, 400, { errore: 'percorso non ammesso' });
    await config.ripristina(p);
    return json(res, 200, { ok: true });
  }
  if (rotta === '/valida' && metodo === 'POST') {
    const { percorso: p, testo } = await leggiCorpo(req);
    const { errori, avvisi } = config.valida(p || '', String(testo ?? ''));
    return json(res, 200, { errori, avvisi });
  }
  if (rotta === '/prova' && metodo === 'POST') {
    const corpo = await leggiCorpo(req);
    const p = corpo.percorso || 'tile/anteprima.yaml';
    const testo = corpo.oggetto ? YAML.stringify(corpo.oggetto) : corpo.testo;
    const c = classifica(p);
    if (c?.genere !== 'tile') return json(res, 400, { errore: 'si possono provare solo le tile' });
    const v = config.valida(p, String(testo ?? ''));
    if (v.errori.length) return json(res, 200, { errori: v.errori });
    if (!v.oggetto.dati) return json(res, 200, { righe: [], nota: 'questa tile non legge dati' });
    const inizio = Date.now();
    try {
      const righe = await motore.leggiTile(v.oggetto);
      return json(res, 200, { righe: righe.slice(0, 100), totale: righe.length, ms: Date.now() - inizio });
    } catch (e) {
      return json(res, 200, { errore: e.name === 'TimeoutError' ? 'la sorgente non ha risposto in tempo' : e.message, ms: Date.now() - inizio });
    }
  }
  const stessoSito = (a, b) => { try { return new URL(a).host === new URL(b).host; } catch { return false; } };
  // Generi di tile (modelli): l'elenco con i campi, e "Salva come genere" da una tile.
  if (rotta === '/generi' && metodo === 'GET') return json(res, 200, { generi: generi.elenco() });
  if (rotta === '/generi/espandi' && metodo === 'POST') {
    const { oggetto } = await leggiCorpo(req);
    if (!oggetto?.genere) return json(res, 400, { errore: 'serve { oggetto: { genere, campi } }' });
    return json(res, 200, generi.espandi(oggetto));
  }
  if (rotta === '/generi/da-tile' && metodo === 'POST') {
    const { id, nome, descrizione } = await leggiCorpo(req);
    const t = config.tile[id];
    if (!t || t.tipo === 'errore') return json(res, 404, { errore: 'tile inesistente o non valida' });
    const slug = String(nome || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (!slug) return json(res, 400, { errore: 'serve un nome per il genere' });
    if (generi.get(slug)) return json(res, 409, { errore: `esiste già un genere "${slug}": scegli un altro nome` });
    const testo = `# Genere creato dalla tile "${id}" il ${new Date().toLocaleDateString('it-IT')}.\n# Per chiedere dei valori nell'editor: aggiungi dei campi e scrivi {{nome}} nel modello dove vanno.\n${YAML.stringify(Generi.daTile(t, { nome: String(nome).trim(), descrizione }), { lineWidth: 0 })}`;
    const esito = await config.scriviFile(`generi/${slug}.yaml`, testo);
    return json(res, 200, { ...esito, id: slug });
  }
  // Tile market: il catalogo dei modelli pronti e le tile del workspace, con il loro interruttore.
  if (rotta === '/mercato' && metodo === 'GET') {
    const ws = url.searchParams.get('workspace') || WORKSPACE_PREDEFINITO;
    const delWs = Object.entries(config.tile).filter(([k]) => workspaceDi(k) === ws);
    const titolo = (t, k) => (typeof t.titolo === 'string' ? t.titolo : t.titolo?.base || t.titolo?.intermedia || idNelWorkspace(k));
    const voci = (await catalogo.elenco()).map((v) => ({
      ...v,
      nomeSorgente: v.sorgente ? (connettori.get(v.sorgente)?.nome || v.sorgente) : null,
      // Un modello per un'API esterna (es. Open-Meteo) propone solo le sorgenti con quell'indirizzo:
      // mai una sorgente con le credenziali di un altro servizio.
      sorgenti: v.sorgente ? Object.entries(config.sorgenti).filter(([, x]) => x.tipo === v.sorgente
        && (!v.indirizzo || stessoSito(x.url, v.indirizzo))).map(([n]) => n) : [],
      aggiunte: delWs.filter(([, t]) => t.da_catalogo === v.id).map(([k]) => k),
    }));
    const tile = delWs.map(([k, t]) => ({ id: k, titolo: titolo(t, k), tipo: t.tipo, attiva: t.attiva !== false, etichetta: t.etichetta || null, da_catalogo: t.da_catalogo || null, sorgente: t.dati?.sorgente || null }))
      .sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
    return json(res, 200, { catalogo: voci, tile, generi: generi.elenco() });
  }
  if (rotta === '/mercato/aggiungi' && metodo === 'POST') {
    const { id, sorgente, parametri, workspace = WORKSPACE_PREDEFINITO } = await leggiCorpo(req);
    if (!config.workspace.includes(workspace)) return json(res, 400, { errore: 'workspace inesistente' });
    let costruita;
    try {
      const voce = (await catalogo.elenco()).find((v) => v.id === id);
      if (!voce) return json(res, 404, { errore: `il modello "${id}" non è nel catalogo` });
      if (voce.sorgente && config.sorgenti[sorgente]?.tipo !== voce.sorgente) return json(res, 200, { ok: false, errori: [`serve una sorgente di tipo "${voce.sorgente}"`] });
      if (voce.indirizzo && !stessoSito(config.sorgenti[sorgente]?.url, voce.indirizzo)) return json(res, 200, { ok: false, errori: [`serve una sorgente che punti a ${voce.indirizzo}`] });
      costruita = await catalogo.costruisci(id, { sorgente, parametri });
    } catch (e) { return json(res, 200, { ok: false, errori: [e.message] }); }
    // Nome del file: quello del modello, con un numero se c'è già (si può aggiungere più volte).
    const prefisso = workspace === WORKSPACE_PREDEFINITO ? '' : `${workspace}/`;
    let chiave = `${prefisso}${id}`;
    for (let n = 2; config.tile[chiave]; n++) chiave = `${prefisso}${id}-${n}`;
    const esito = await config.scriviFile(percorsoTile(chiave), costruita.testo);
    return json(res, 200, { ...esito, id: chiave, titolo: costruita.tile.titolo });
  }
  if (rotta === '/modello' && metodo === 'GET') {
    const genere = url.searchParams.get('genere'), tipo = url.searchParams.get('tipo');
    const testo = genere === 'tile' ? MODELLI_TILE[tipo] : (MODELLI_SORGENTE[tipo] || (connettori.has(tipo) ? modelloGenerico(tipo) : null));
    return testo ? json(res, 200, { testo }) : json(res, 404, { errore: 'modello inesistente' });
  }
  if (rotta === '/storico' && metodo === 'GET') {
    const c = classifica(percorso || '');
    if (!c) return json(res, 400, { errore: 'percorso non ammesso' });
    const cartella = path.join(CARTELLA_CONFIG, '.storico', path.dirname(percorso));
    const base = path.basename(percorso, '.yaml');
    const versione = url.searchParams.get('versione');
    if (versione) {
      if (!/^[\w.-]+\.yaml$/.test(versione) || !versione.startsWith(`${base}.`)) return json(res, 400, { errore: 'versione non valida' });
      return json(res, 200, { testo: await fs.readFile(path.join(cartella, versione), 'utf8') });
    }
    let versioni = [];
    try { versioni = (await fs.readdir(cartella)).filter((f) => f.startsWith(`${base}.`)).sort().reverse(); } catch { /* nessuna copia */ }
    return json(res, 200, { versioni });
  }
  return json(res, 404, { errore: 'rotta sconosciuta' });
}

// ---------------------------------------------------------------- router

const server = http.createServer(async (req, res) => {
  // Un indirizzo malformato (es. "//") è un errore della richiesta, non deve fermare il server.
  let url;
  try { url = new URL(req.url.replace(/^\/{2,}/, '/'), 'http://localhost'); } catch { return json(res, 400, { errore: 'indirizzo non valido' }); }
  try {
    if (url.pathname === '/api/pagina') {
      // Il display scritto nell'indirizzo vince; se il browser lo ha solo indovinato (auto=1,
      // dalla larghezza dello schermo) vale prima una regola di `schermi:` per chi si collega.
      const chi = chiSiCollega(req);
      const chiesto = url.searchParams.get('display');
      const regola = (!chiesto || url.searchParams.has('auto')) ? displayPerSchermo(chi) : null;
      const p = pagina(regola || chiesto, url.searchParams.get('workspace'));
      ricordaSchermo(chi, p.display.nome, regola);
      return json(res, 200, p);
    }
    if (url.pathname === '/api/eventi') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 5000\n\n');
      clienti.add(res);
      req.on('close', () => clienti.delete(res));
      return;
    }
    if (url.pathname === '/api/immagine') return immagini.servi(url.searchParams.get('id'), req, res, { fotogramma: url.searchParams.has('fotogramma') });
    if (url.pathname === '/salute') return json(res, 200, { ok: true, tile: Object.keys(config.tile).length });

    if (url.pathname === '/config' || url.pathname.startsWith('/api/config')) {
      if (config.globale.editor === false) return json(res, 403, { errore: 'editor disattivato in global.yaml' });
      if (!autorizzato(req)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Fluxboard"' });
        return res.end();
      }
      if (url.pathname === '/config') return serviFile(res, 'config.html');
      return await apiConfig(req, res, url);
    }

    if (req.method !== 'GET') return json(res, 405, { errore: 'metodo non ammesso' });
    return serviFile(res, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  } catch (e) {
    console.error(`[http] ${req.method} ${url.pathname}: ${e.message}`);
    if (!res.headersSent) json(res, e.codice || 500, { errore: e.message });
  }
});

server.listen(PORTA, INDIRIZZO, () => {
  console.log(`Fluxboard in ascolto su http://${INDIRIZZO}:${PORTA}  (config: ${CARTELLA_CONFIG})`);
  console.log(`Connettori: ${[...connettori.keys()].join(', ')}`);
  if (!passwordEditor()) console.log('Editor /config senza password (imposta FLUXBOARD_ADMIN_PASSWORD per proteggerlo)');
});
