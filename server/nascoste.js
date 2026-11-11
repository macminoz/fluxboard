// Hidden rows: Ack and Ignore for the tiles that do not go through the alert centre (e.g. "Top
// syslog writers"). A row is recognised by the value of one of its fields (the action's `chiave`,
// e.g. host): with Ack it disappears for 24 hours, with Ignore for good, until restored.
//
// Internal operations, valid for any tile and without a password (they touch nothing outside
// Fluxboard; English names: hide_row, ignore_row, restore_rows):
//   { id: ack, etichetta: Ack, operazione: nascondi_riga, chiave: host, subito: true }
//   { id: ignora, etichetta: Ignora, operazione: ignora_riga, chiave: host }
//   { id: ripristina, etichetta: Ripristina, operazione: ripristina_righe, globale: true }
// The history (elenco) goes into the tile's state: rows are readmitted one at a time from the tile.
//
// Stored in cache/nascoste.json: { <tile>: { campo, valori: { <value>: { dal, fino (ms) | null } } } }

import fs from 'node:fs/promises';
import path from 'node:path';

export const SOSPENSIONE = 24 * 3600_000;
export const OPERAZIONI = ['nascondi_riga', 'ignora_riga', 'ripristina_righe'];

export class Nascoste {
  constructor() { this.voci = {}; this.file = null; }

  async carica(file) {
    this.file = file;
    try { this.voci = JSON.parse(await fs.readFile(file, 'utf8')) || {}; } catch { /* prima volta */ }
  }

  salva() { return this.#salva(); }

  async #salva() {
    if (!this.file) return;
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp-${process.pid}`;
      await fs.writeFile(tmp, JSON.stringify(this.voci), 'utf8');
      await fs.rename(tmp, this.file);
    } catch (e) { console.error('[nascoste]', e.message); }
  }

  // The tile's rows without the hidden ones (and forgets expired Acks).
  filtra(tile, righe) {
    const n = this.voci[tile];
    if (!n || !Array.isArray(righe)) return righe;
    const adesso = Date.now();
    for (const [v, x] of Object.entries(n.valori)) { const fino = typeof x === 'object' && x ? x.fino : x; if (fino !== null && fino < adesso) delete n.valori[v]; }
    return righe.filter((r) => !(String(r?.[n.campo]) in n.valori));
  }

  async esegui(operazione, tile, campo, valore) {
    if (operazione === 'ripristina_righe') {
      const quante = Object.keys(this.voci[tile]?.valori || {}).length;
      delete this.voci[tile];
      await this.#salva();
      return quante ? `Ripristinat${quante === 1 ? 'a 1 riga' : `e ${quante} righe`}` : 'Nessuna riga nascosta';
    }
    if (!this.voci[tile] || this.voci[tile].campo !== campo) this.voci[tile] = { campo, valori: {} };
    const perSempre = operazione === 'ignora_riga';
    this.voci[tile].valori[String(valore)] = { dal: Date.now(), fino: perSempre ? null : Date.now() + SOSPENSIONE };
    await this.#salva();
    return perSempre ? `Ignorato: «${valore}» non comparirà più` : `Ack: «${valore}» nascosto per 24 ore`;
  }
}

// History for the tile: [{ chiave, testo, dal, fino }] (fino null = ignored for good), most recent
// first.
Nascoste.prototype.elenco = function elenco(tile) {
  const n = this.voci[tile];
  if (!n) return [];
  const adesso = Date.now();
  return Object.entries(n.valori).map(([v, x]) => (typeof x === 'object' && x ? { chiave: v, testo: v, dal: x.dal ?? null, fino: x.fino } : { chiave: v, testo: v, dal: null, fino: x }))
    .filter((x) => x.fino === null || x.fino > adesso)
    .sort((a, b) => (b.dal ?? 0) - (a.dal ?? 0));
};

// Readmits a row (problem fixed): it is back in the list at the next read.
Nascoste.prototype.riammetti = async function riammetti(tile, chiave) {
  const n = this.voci[tile];
  if (!n || !(String(chiave) in n.valori)) throw new Error('non è (più) fra le righe nascoste');
  delete n.valori[String(chiave)];
  if (!Object.keys(n.valori).length) delete this.voci[tile];
  await this.salva();
  return `Riammessa: «${String(chiave).slice(0, 60)}»`;
};

export const nascoste = new Nascoste();
