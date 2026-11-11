// Caricamento, validazione, scrittura e osservazione della cartella di configurazione.
//
//   config/global.yaml          impostazioni della cornice (titolo, tema, display, livelli)
//   config/sorgenti/<nome>.yaml una connessione riusabile (database, API, ...)
//   config/tile/<nome>.yaml     una tile: cosa legge, quando compare, come si legge
//   config/layout/<display>.yaml ordine e dimensioni delle tile su un display (modalità Modifica)
//   config/generi/<nome>.yaml   generi di tile propri (modelli), oltre a quelli di base in generi/
//   config/workspace/<nome>/tile/, …/layout/  gli altri workspace: tile e disposizioni proprie,
//                               sorgenti e cornice in comune. Le tile e le disposizioni in radice
//                               sono il workspace "default".
//   config/.storico/            copie automatiche delle versioni precedenti
//   config/.cestino/            file eliminati dall'editor

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import YAML from 'yaml';
import { sostituisciEnv } from './util.js';
import { validaGlobale, validaSorgente, validaTile, validaLayout } from './schema.js';
import { generi, validaGenere } from './generi.js';

const NOME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const COPIE_PER_FILE = 20;

export const PREDEFINITO_GLOBALE = {
  titolo: 'Fluxboard',
  livello: 'intermedia',
  tema: 'auto',
  fuso: 'Europe/Rome',
  aggiornamento: '1m',
  display: { browser: { colonne: 12 }, mobile: { colonne: 1 } },
};

export const WORKSPACE_PREDEFINITO = 'default';
export const nomeValido = (n) => NOME.test(n || '');
let scritture = 0;

// Una tile si identifica con la sua "chiave": l'id per il workspace default ("meteo"),
// "workspace/id" per gli altri ("prove/meteo"). Da qui il file e viceversa.
export function percorsoTile(chiave) {
  const [ws, id] = String(chiave).includes('/') ? String(chiave).split('/') : [WORKSPACE_PREDEFINITO, chiave];
  return ws === WORKSPACE_PREDEFINITO ? `tile/${id}.yaml` : `workspace/${ws}/tile/${id}.yaml`;
}
export function percorsoLayout(ws, display) {
  return !ws || ws === WORKSPACE_PREDEFINITO ? `layout/${display}.yaml` : `workspace/${ws}/layout/${display}.yaml`;
}
export const workspaceDi = (chiave) => (String(chiave).includes('/') ? String(chiave).split('/')[0] : WORKSPACE_PREDEFINITO);
export const idNelWorkspace = (chiave) => String(chiave).split('/').at(-1);

// Da un percorso relativo ("tile/riscaldamento.yaml") al genere di file, al nome e al workspace.
export function classifica(rel) {
  const r = rel.replace(/\\/g, '/');
  if (r === 'global.yaml') return { genere: 'globale', nome: 'global' };
  const w = r.match(/^workspace\/([^/]+)\/(tile|layout)\/([^/]+)\.yaml$/);
  if (w) {
    if (!NOME.test(w[1]) || w[1] === WORKSPACE_PREDEFINITO || !NOME.test(w[3])) return null;
    return { genere: w[2], nome: w[3], workspace: w[1], chiave: w[2] === 'tile' ? `${w[1]}/${w[3]}` : w[3] };
  }
  const m = r.match(/^(sorgenti|tile|layout|generi)\/([^/]+)\.yaml$/);
  if (!m || !NOME.test(m[2])) return null;
  return { genere: { tile: 'tile', sorgenti: 'sorgente', layout: 'layout', generi: 'modello' }[m[1]], nome: m[2], workspace: WORKSPACE_PREDEFINITO, chiave: m[2] };
}

export class Configurazione extends EventEmitter {
  constructor(cartella, connettori) {
    super();
    this.cartella = path.resolve(cartella);
    this.connettori = connettori;
    this.cartellaGeneriBase = null;   // generi/ accanto al codice (la imposta index.js)
    this.globale = { ...PREDEFINITO_GLOBALE };
    this.sorgenti = {};   // nome → oggetto così com'è scritto (con ${VAR})
    this.tile = {};       // nome → oggetto, oppure { errore } se il file non è valido
    this.layout = {};     // workspace → display → [{ id, colonne, altezza }]
    this.sezioni = {};    // workspace → display → { etichetta: { colonne } }
    this.workspace = [WORKSPACE_PREDEFINITO];
    this.problemi = {};   // percorso → { errori, avvisi }
  }

  percorso(rel) {
    if (!classifica(rel)) throw new Error(`percorso non ammesso: ${rel}`);
    return path.join(this.cartella, rel);
  }

  async #leggiCartella(sotto) {
    try {
      return (await fs.readdir(path.join(this.cartella, sotto))).filter((f) => f.endsWith('.yaml') && !f.startsWith('.')).sort();
    } catch { return []; }
  }

  static analizza(testo) {
    const doc = YAML.parseDocument(testo, { prettyErrors: true });
    if (doc.errors.length) return { errore: doc.errors.map((e) => e.message.split('\n')[0]).join('; ') };
    return { oggetto: doc.toJS() ?? {} };
  }

  // Valida un testo come se fosse il file `rel`, senza scriverlo.
  valida(rel, testo) {
    const c = classifica(rel);
    if (!c) return { errori: [`percorso non ammesso: ${rel}`], avvisi: [] };
    const { oggetto, errore } = Configurazione.analizza(testo);
    if (errore) return { errori: [`YAML non valido: ${errore}`], avvisi: [] };
    if (c.genere === 'globale') return { ...validaGlobale(oggetto), oggetto };
    if (c.genere === 'sorgente') return { ...validaSorgente(oggetto, this.connettori), oggetto };
    if (c.genere === 'layout') return { ...validaLayout(oggetto, this.tileDelWorkspace(c.workspace)), oggetto };
    if (c.genere === 'modello') return { ...validaGenere(oggetto), oggetto };
    // Tile di un genere: si espande il modello con i suoi campi, poi si valida come le altre.
    if (oggetto?.genere) {
      const { tile, errori } = generi.espandi(oggetto);
      const v = validaTile(tile, this.sorgenti, this.connettori, this.globale?.argomenti);
      return { errori: [...errori, ...v.errori], avvisi: v.avvisi, oggetto: tile, scritta: oggetto };
    }
    return { ...validaTile(oggetto, this.sorgenti, this.connettori, this.globale?.argomenti), oggetto };
  }

  // Le tile di un workspace, per id senza prefisso (come le citano le disposizioni).
  tileDelWorkspace(ws) {
    return Object.fromEntries(Object.entries(this.tile).filter(([k]) => workspaceDi(k) === ws).map(([k, t]) => [idNelWorkspace(k), t]));
  }

  async #elencoWorkspace() {
    try {
      const voci = await fs.readdir(path.join(this.cartella, 'workspace'), { withFileTypes: true });
      return voci.filter((v) => v.isDirectory() && NOME.test(v.name) && v.name !== WORKSPACE_PREDEFINITO).map((v) => v.name).sort();
    } catch { return []; }
  }

  // Cartelle (relative) delle tile e delle disposizioni di ogni workspace.
  #cartelle(ws, tipo) { return ws === WORKSPACE_PREDEFINITO ? tipo : `workspace/${ws}/${tipo}`; }

  async creaWorkspace(nome) {
    if (!NOME.test(nome || '') || nome === WORKSPACE_PREDEFINITO) throw Object.assign(new Error('nome non valido: minuscole, cifre e trattini'), { codice: 400 });
    if (this.workspace.includes(nome)) throw Object.assign(new Error(`il workspace "${nome}" esiste già`), { codice: 409 });
    for (const t of ['tile', 'layout']) await fs.mkdir(path.join(this.cartella, 'workspace', nome, t), { recursive: true });
    await this.carica();
  }

  async eliminaWorkspace(nome) {
    if (!this.workspace.includes(nome) || nome === WORKSPACE_PREDEFINITO) throw Object.assign(new Error('workspace inesistente o non eliminabile'), { codice: 400 });
    const cestino = path.join(this.cartella, '.cestino', 'workspace');
    await fs.mkdir(cestino, { recursive: true });
    await fs.rename(path.join(this.cartella, 'workspace', nome), path.join(cestino, `${nome}.${new Date().toISOString().replace(/[:.]/g, '-')}`));
    await this.carica();
  }

  async carica() {
    const problemi = {};
    const leggi = async (rel) => {
      const testo = await fs.readFile(path.join(this.cartella, rel), 'utf8');
      return testo;
    };

    // 1. globale: se non è valido si tiene la versione precedente, mai una pagina vuota
    try {
      const v = this.valida('global.yaml', await leggi('global.yaml'));
      problemi['global.yaml'] = { errori: v.errori, avvisi: v.avvisi };
      if (!v.errori.length) this.globale = { ...PREDEFINITO_GLOBALE, ...v.oggetto };
    } catch (e) {
      if (e.code !== 'ENOENT') problemi['global.yaml'] = { errori: [e.message], avvisi: [] };
    }

    // 2. sorgenti (prima delle tile, che le richiamano per nome)
    const sorgenti = {};
    for (const f of await this.#leggiCartella('sorgenti')) {
      const rel = `sorgenti/${f}`;
      const c = classifica(rel);
      if (!c) { problemi[rel] = { errori: ['nome del file non valido (minuscole, cifre e trattini)'], avvisi: [] }; continue; }
      const v = this.valida(rel, await leggi(rel));
      problemi[rel] = { errori: v.errori, avvisi: v.avvisi };
      if (!v.errori.length) sorgenti[c.nome] = v.oggetto;
    }
    this.sorgenti = sorgenti;

    // 3a. generi: quelli di base (con il codice) e i propri (config/generi), che vincono
    await generi.carica([{ dir: this.cartellaGeneriBase, origine: 'base' }, { dir: path.join(this.cartella, 'generi'), origine: 'propri' }]);
    for (const [f, p] of Object.entries(generi.problemi)) problemi[f.startsWith('propri/') ? `generi/${f.slice(7)}` : f] = p;

    // 3. tile di ogni workspace: una tile non valida resta in elenco con il suo errore
    const elencoWs = [WORKSPACE_PREDEFINITO, ...await this.#elencoWorkspace()];
    const tile = {};
    for (const ws of elencoWs) {
      for (const f of await this.#leggiCartella(this.#cartelle(ws, 'tile'))) {
        const rel = `${this.#cartelle(ws, 'tile')}/${f}`;
        const c = classifica(rel);
        if (!c) { problemi[rel] = { errori: ['nome del file non valido (minuscole, cifre e trattini)'], avvisi: [] }; continue; }
        const v = this.valida(rel, await leggi(rel));
        problemi[rel] = { errori: v.errori, avvisi: v.avvisi };
        tile[c.chiave] = v.errori.length ? { tipo: 'errore', errore: v.errori.join('; '), titolo: c.nome } : v.oggetto;
      }
    }
    this.tile = tile;
    this.workspace = elencoWs;

    // 4. disposizioni dei display (dopo le tile, per segnalare quelle che non esistono più)
    const layout = {}, sezioni = {};   // sezioni: workspace → display → { etichetta: { colonne } }
    for (const ws of elencoWs) {
      layout[ws] = {}; sezioni[ws] = {};
      for (const f of await this.#leggiCartella(this.#cartelle(ws, 'layout'))) {
        const rel = `${this.#cartelle(ws, 'layout')}/${f}`;
        const c = classifica(rel);
        if (!c) continue;
        const v = this.valida(rel, await leggi(rel));
        problemi[rel] = { errori: v.errori, avvisi: v.avvisi };
        if (!v.errori.length) { layout[ws][c.nome] = v.oggetto.tile; sezioni[ws][c.nome] = v.oggetto.sezioni || {}; }
      }
    }
    this.layout = layout;
    this.sezioni = sezioni;
    this.problemi = problemi;
    this.emit('ricaricata');
  }

  // La sorgente con le variabili d'ambiente risolte: si usa solo lato server, mai inviata ai client.
  sorgenteRisolta(nome) {
    const mancanti = new Set();
    const risolta = sostituisciEnv(this.sorgenti[nome], mancanti);
    if (mancanti.size) throw new Error(`variabili d'ambiente mancanti: ${[...mancanti].join(', ')}`);
    // Per i connettori che leggono file accanto alla config (es. un certificato CA).
    return { ...risolta, _cartella: this.cartella };
  }

  async elenco() {
    const voci = [];
    const aggiungi = (rel, genere, nome, extra = {}) => voci.push({ percorso: rel, genere, nome, ...(this.problemi[rel] || { errori: [], avvisi: [] }), ...extra });
    aggiungi('global.yaml', 'globale', 'global');
    for (const f of await this.#leggiCartella('sorgenti')) {
      const n = f.replace(/\.yaml$/, '');
      aggiungi(`sorgenti/${f}`, 'sorgente', n, { tipo: this.sorgenti[n]?.tipo });
    }
    for (const ws of this.workspace) {
      for (const f of await this.#leggiCartella(this.#cartelle(ws, 'tile'))) {
        const c = classifica(`${this.#cartelle(ws, 'tile')}/${f}`);
        if (!c) continue;
        const t = this.tile[c.chiave] || {};
        aggiungi(`${this.#cartelle(ws, 'tile')}/${f}`, 'tile', c.chiave, { tipo: t.tipo, attiva: t.attiva !== false, workspace: ws, titolo: typeof t.titolo === 'string' ? t.titolo : c.nome, anche_in: t.anche_in || [] });
      }
      for (const f of await this.#leggiCartella(this.#cartelle(ws, 'layout'))) {
        const n = f.replace(/\.yaml$/, '');
        aggiungi(`${this.#cartelle(ws, 'layout')}/${f}`, 'layout', ws === WORKSPACE_PREDEFINITO ? n : `${ws}/${n}`, { workspace: ws });
      }
    }
    return voci;
  }

  async leggiFile(rel) {
    return fs.readFile(this.percorso(rel), 'utf8');
  }

  async #copiaInStorico(rel) {
    const origine = this.percorso(rel);
    if (!fss.existsSync(origine)) return;
    const cartella = path.join(this.cartella, '.storico', path.dirname(rel));
    await fs.mkdir(cartella, { recursive: true });
    const base = path.basename(rel, '.yaml');
    const marca = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.copyFile(origine, path.join(cartella, `${base}.${marca}.yaml`));
    const copie = (await fs.readdir(cartella)).filter((f) => f.startsWith(`${base}.`)).sort();
    for (const vecchia of copie.slice(0, Math.max(0, copie.length - COPIE_PER_FILE))) {
      await fs.unlink(path.join(cartella, vecchia));
    }
  }

  async scriviFile(rel, testo) {
    const v = this.valida(rel, testo);
    if (v.errori.length) return { ok: false, errori: v.errori, avvisi: v.avvisi };
    const destinazione = this.percorso(rel);
    await fs.mkdir(path.dirname(destinazione), { recursive: true });
    await this.#copiaInStorico(rel);
    // Un nome per ogni scrittura: due salvataggi quasi insieme dello stesso file non si pestano.
    const temporaneo = `${destinazione}.tmp-${process.pid}-${(scritture += 1)}`;
    await fs.writeFile(temporaneo, testo.endsWith('\n') ? testo : `${testo}\n`, 'utf8');
    await fs.rename(temporaneo, destinazione);
    await this.carica();
    return { ok: true, errori: [], avvisi: v.avvisi };
  }

  async eliminaFile(rel) {
    if (rel === 'global.yaml') throw new Error('il file globale non si può eliminare');
    const origine = this.percorso(rel);
    const cestino = path.join(this.cartella, '.cestino', path.dirname(rel));
    await fs.mkdir(cestino, { recursive: true });
    const marca = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.rename(origine, path.join(cestino, `${path.basename(rel, '.yaml')}.${marca}.yaml`));
    await this.carica();
  }

  // Modifica dei campi di un file dall'editor visuale della dashboard, conservando commenti e
  // formattazione di tutto ciò che non viene toccato. `campi`: { chiave: valore }; un oggetto
  // semplice viene applicato chiave per chiave (es. dati.query), null toglie la chiave.
  // sostituisci: percorsi (es. [['dati', 'campi']]) da rimpiazzare interi invece che fondere,
  // per le mappe chiave → valore dei moduli, dove una chiave tolta deve sparire dal file.
  async aggiornaCampi(rel, campi, { nuovo = false, sostituisci = [] } = {}) {
    const esiste = fss.existsSync(this.percorso(rel));
    if (nuovo && esiste) return { ok: false, errori: [`${rel} esiste già`], avvisi: [] };
    if (!nuovo && !esiste) return { ok: false, errori: [`${rel} non esiste`], avvisi: [] };
    // Un file nuovo parte da una mappa a blocchi (non "{}", che lascerebbe tutto su una riga) e
    // con "genere" per primo, se c'è.
    const doc = esiste ? YAML.parseDocument(await fs.readFile(this.percorso(rel), 'utf8')) : new YAML.Document(campi.genere ? { genere: campi.genere } : {});
    if (doc.errors.length) return { ok: false, errori: ['il file attuale non è YAML valido: correggilo dal codice'], avvisi: [] };
    if (!YAML.isMap(doc.contents)) doc.contents = doc.createNode({});
    const applica = (percorso, valore) => {
      const semplice = valore && typeof valore === 'object' && !Array.isArray(valore)
        && !sostituisci.some((p) => p.join('.') === percorso.join('.'));
      if (valore === null || valore === undefined) doc.deleteIn(percorso);
      else if (semplice && YAML.isMap(doc.getIn(percorso, true))) {
        for (const [k, v] of Object.entries(valore)) applica([...percorso, k], v);
      } else doc.setIn(percorso, valore);
    };
    for (const [k, v] of Object.entries(campi)) applica([k], v);
    return this.scriviFile(rel, doc.toString({ lineWidth: 0 }));
  }

  async ripristina(rel) {
    const cartella = path.join(this.cartella, '.cestino', path.dirname(rel));
    const base = path.basename(rel, '.yaml');
    let copie = [];
    try { copie = (await fs.readdir(cartella)).filter((f) => f.startsWith(`${base}.`)).sort(); } catch { /* cestino vuoto */ }
    if (!copie.length) throw new Error('nel cestino non c\'è una copia da ripristinare');
    if (fss.existsSync(this.percorso(rel))) throw new Error(`${rel} esiste già`);
    await fs.rename(path.join(cartella, copie.at(-1)), this.percorso(rel));
    await this.carica();
  }

  // Ricarica quando i file cambiano anche fuori dall'editor (vim, git pull, copia da backup).
  osserva() {
    let attesa = null;
    try {
      const osservatore = fss.watch(this.cartella, { recursive: true }, (_evento, nome) => {
        if (!nome || nome.startsWith('.') || nome.includes('.tmp-') || !nome.endsWith('.yaml')) return;
        clearTimeout(attesa);
        attesa = setTimeout(() => this.carica().catch((e) => console.error('[config]', e.message)), 300);
      });
      // Un file appena copiato e non ancora leggibile (es. durante un'installazione) non deve
      // fermare il servizio: si avvisa e si continua (il 7/11/2026 era un errore non gestito).
      osservatore.on('error', (e) => console.warn(`[config] osservazione dei file: ${e.message}`));
    } catch (e) {
      console.warn(`[config] osservazione dei file non disponibile (${e.message}): le modifiche fatte a mano richiedono un riavvio`);
    }
  }
}
