// The engine: reads each tile's sources periodically, applies `elabora` and keeps the last result.
// Each tile lives on its own: an error or a timeout does not touch the others, and on error the
// last good data stays visible (with its age), never an empty tile.

import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { durata } from './util.js';
import { elabora } from './elabora.js';

const TIMEOUT_PREDEFINITO = 15_000;

import { avvisi } from './avvisi.js';
import { nascoste } from './nascoste.js';

const RIPROVA = 5 * 60_000;

export class Motore extends EventEmitter {
  constructor(config, connettori, cartellaCache) {
    super();
    this.config = config;
    this.connettori = connettori;
    this.fileCache = path.join(cartellaCache, 'stato.json');
    this.stato = new Map();   // tile id → { righe, aggiornato, errore, erroreDal }
    this.timer = new Map();
    this.riprova = new Map();   // tile id → retry after an error (for slow tiles)
    this.inCorso = new Set();
    this.firma = new Map();   // tile id → JSON of the data block, so unchanged ones are not re-read
    this.salvataggio = null;
  }

  async ripristinaCache() {
    try {
      const salvato = JSON.parse(await fs.readFile(this.fileCache, 'utf8'));
      for (const [id, s] of Object.entries(salvato)) this.stato.set(id, s);
    } catch { /* prima esecuzione, o cache illeggibile: si riparte vuoti */ }
  }

  #salvaCache() {
    clearTimeout(this.salvataggio);
    this.salvataggio = setTimeout(async () => {
      try {
        await fs.mkdir(path.dirname(this.fileCache), { recursive: true });
        await fs.writeFile(this.fileCache, JSON.stringify(Object.fromEntries(this.stato)), 'utf8');
      } catch (e) { console.error('[cache]', e.message); }
    }, 2000);
  }

  // Runs a tile's read (without saving it) and returns the rows already processed. With `id`,
  // without the rows hidden with Ack or Ignore (server/nascoste.js), before `elabora`: so a
  // "limita: 8" still shows eight rows.
  async leggiTile(tile, id) {
    const d = tile.dati;
    let sorgente = {}, connettore;
    if (d.sorgente) {
      sorgente = this.config.sorgenteRisolta(d.sorgente);
      connettore = this.connettori.get(sorgente.tipo);
    } else connettore = this.connettori.get(d.tipo);
    if (!connettore) throw new Error('connettore non disponibile');
    const timeout = durata(sorgente.timeout, TIMEOUT_PREDEFINITO);
    // `sorgenti`: for connectors relying on another source (e.g. versioni → AdGuard).
    const righe = await connettore.leggi(sorgente, d, { signal: AbortSignal.timeout(timeout), sorgenti: (nome) => this.config.sorgenteRisolta(nome) });
    return elabora(id ? nascoste.filtra(id, righe) : righe, tile.elabora);
  }

  async aggiorna(id) {
    const tile = this.config.tile[id];
    if (!tile?.dati || this.inCorso.has(id)) return;
    this.inCorso.add(id);
    const precedente = this.stato.get(id) || {};
    let nuovo;
    try {
      const righe = await this.leggiTile(tile, id);
      nuovo = { righe, aggiornato: Date.now(), errore: null, erroreDal: null };
      // History of what was hidden with Ack or Ignore: readmitted from the tile.
      const storico = tile.dati.tipo === 'avvisi' ? avvisi.ignorati() : nascoste.elenco(id);
      if (storico.length) nuovo.ignorati = storico.slice(0, 50);
      // The rows matching the tile's `avvisi` block go to the alert centre.
      if (tile.avvisi) for (const regola of [].concat(tile.avvisi)) avvisi.registra([].concat(tile.avvisi).length > 1 ? `${id}#${[].concat(tile.avvisi).indexOf(regola)}` : id, regola, righe);
    } catch (e) {
      const messaggio = e.name === 'TimeoutError' ? 'la sorgente non ha risposto in tempo' : e.message;
      nuovo = { ...precedente, righe: precedente.righe ?? null, errore: messaggio, erroreDal: precedente.erroreDal || Date.now() };
      // A tile that reads rarely (e.g. every hour) does not wait for the next round: it retries in
      // 5 minutes.
      const ogni = durata(tile.ogni, durata(this.config.globale.aggiornamento, 60_000));
      if (ogni > RIPROVA && !this.riprova.has(id)) {
        this.riprova.set(id, setTimeout(() => { this.riprova.delete(id); this.aggiorna(id); }, RIPROVA));
      }
    } finally {
      this.inCorso.delete(id);
    }
    this.stato.set(id, nuovo);
    this.emit('stato', id, nuovo);
    this.#salvaCache();
  }

  // To call at every configuration reload: reschedules only the tiles that changed.
  programma() {
    const predefinito = durata(this.config.globale.aggiornamento, 60_000);
    const attive = new Set();
    for (const [id, tile] of Object.entries(this.config.tile)) {
      if (!tile.dati || tile.attiva === false) continue;
      attive.add(id);
      const firma = JSON.stringify([tile.dati, tile.elabora, tile.ogni, this.config.sorgenti[tile.dati.sorgente]]);
      if (this.firma.get(id) === firma && this.timer.has(id)) continue;
      clearInterval(this.timer.get(id));
      this.firma.set(id, firma);
      const ogni = Math.max(5_000, durata(tile.ogni, predefinito));
      this.timer.set(id, setInterval(() => this.aggiorna(id), ogni));
      this.aggiorna(id);
    }
    for (const id of [...this.timer.keys()]) {
      if (attive.has(id)) continue;
      clearInterval(this.timer.get(id));
      clearTimeout(this.riprova.get(id));
      this.riprova.delete(id);
      this.timer.delete(id);
      this.firma.delete(id);
      this.stato.delete(id);
    }
  }
}
