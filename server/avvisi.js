// Alert centre: critical messages stay until someone acknowledges them ("Seen").
//
// They are produced by any tile with an `avvisi:` block (each row matching `quando` becomes an
// alert); they are shown by a tile with `dati: { tipo: avvisi }`. The same alert (same `chiave`) is
// not repeated: it is counted (`volte`) and its last time updated. An acknowledged alert
// disappears; if the problem comes back after the acknowledgement, so does the alert. Alerts live
// in cache/avvisi.json, so they survive a restart.
//
// An item: { chiave, messaggio, host, gravita: critico|attenzione, origine (tile id),
//           primo, ultimo, volte, attivo (the problem is still there), confermato (date or null),
//           ignorato (date or null: "Ignore" removes it for good, until it is restored) }

import fs from 'node:fs/promises';
import path from 'node:path';
import { compilaCondizione } from '../public/condizione.js';
import { riempi, comeData } from '../public/formato.js';

const TENUTA_CONFERMATI = 7 * 24 * 3600_000;   // an acknowledged and resolved alert is forgotten after 7 days
const SOSPENSIONE = 24 * 3600_000;              // un Ack sospende l'avviso per 24 ore
const MASSIMO = 500;

// riempi() produces escaped HTML: here we need the text.
const testo = (modello, riga) => riempi(modello, riga).replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]))
  .replace(/^—$/, '');

export class Avvisi {
  constructor() { this.voci = new Map(); this.file = null; this.ascoltatori = new Set(); }

  async carica(file) {
    this.file = file;
    try {
      for (const v of JSON.parse(await fs.readFile(file, 'utf8'))) this.voci.set(v.chiave, v);
    } catch { /* prima volta */ }
  }

  #salva() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        await fs.writeFile(this.file, JSON.stringify([...this.voci.values()]), 'utf8');
      } catch (e) { console.error('[avvisi]', e.message); }
    }, 1000);
    for (const f of this.ascoltatori) f();
  }

  quandoCambia(f) { this.ascoltatori.add(f); }

  // The rows just read by a tile, filtered and transformed according to its `avvisi` block.
  registra(origine, regola, righe) {
    const quando = regola.quando ? compilaCondizione(regola.quando) : () => true;
    const gravitaDi = (r) => {
      if (typeof regola.gravita === 'object' && regola.gravita) {
        for (const [cond, g] of Object.entries(regola.gravita)) if (compilaCondizione(cond)(r)) return g;
        return 'attenzione';
      }
      return regola.gravita || 'critico';
    };
    const adesso = Date.now();
    const viste = new Set();
    for (const r of righe) {
      if (!quando(r)) continue;
      const chiave = `${origine}|${testo(regola.chiave || regola.messaggio || '{_msg}', r)}`;
      viste.add(chiave);
      const istante = comeData(regola.ora ? r[regola.ora] : null)?.getTime() || adesso;
      const volteLette = regola.volte ? Number(r[regola.volte]) || 1 : null;
      const v = this.voci.get(chiave);
      const messaggio = testo(regola.messaggio || '{_msg}', r);
      const host = regola.host ? testo(regola.host, r) : '';
      if (!v) {
        this.voci.set(chiave, { chiave, origine, messaggio, host, gravita: gravitaDi(r), primo: istante, ultimo: istante, volte: volteLette || 1, attivo: true, confermato: null });
        continue;
      }
      // Again after the last recorded time: another occurrence. An acknowledged alert comes back
      // only if the problem had ended and came back: a message repeating all the time (e.g. every 3
      // minutes) stays quiet after the acknowledgement until it stops and starts again.
      const nuovo = istante > v.ultimo;
      const eraFinito = !v.attivo;
      Object.assign(v, { messaggio, host, gravita: gravitaDi(r), attivo: true });
      if (nuovo) {
        v.ultimo = istante;
        v.volte = volteLette ? Math.max(v.volte + 1, volteLette) : v.volte + 1;
        if (v.confermato && eraFinito && istante > v.confermato) { v.confermato = null; v.primo = istante; v.volte = volteLette || 1; }
      } else if (volteLette && volteLette > v.volte) v.volte = volteLette;
    }
    // The ones of this tile that are gone now: the problem is over, but the alert stays (without an
    // acknowledgement it does not disappear) marked as resolved.
    for (const v of this.voci.values()) if (v.origine === origine && !viste.has(v.chiave)) v.attivo = false;
    this.#pulisci(adesso);
    this.#salva();
  }

  #pulisci(adesso) {
    for (const [k, v] of this.voci) if (!v.ignorato && v.confermato && !v.attivo && adesso - v.confermato > TENUTA_CONFERMATI) this.voci.delete(k);
    // Past the maximum the oldest are forgotten, the ignored ones last (otherwise they would come
    // back).
    if (this.voci.size > MASSIMO) {
      const vecchi = [...this.voci.values()].sort((a, b) => (Boolean(a.ignorato) - Boolean(b.ignorato)) || (a.ultimo - b.ultimo)).slice(0, this.voci.size - MASSIMO);
      for (const v of vecchi) this.voci.delete(v.chiave);
    }
  }

  // Origins that no longer exist (deleted tiles) must not leave active orphan alerts.
  dimentica(origini) {
    let cambiato = false;
    for (const v of this.voci.values()) if (!origini.has(v.origine) && v.attivo) { v.attivo = false; cambiato = true; }
    if (cambiato) this.#salva();
  }

  conferma(chiave) {
    const v = this.voci.get(chiave);
    if (!v) throw new Error('avviso non trovato: ricarica la pagina');
    v.confermato = Date.now();
    this.#salva();
    return `Ack: «${v.messaggio.slice(0, 60)}» sospeso per 24 ore`;
  }

  // Ignore: a harmless message nobody knows how to fix. It disappears for good (even when it
  // repeats), until the ignored ones are restored.
  ignora(chiave) {
    const v = this.voci.get(chiave);
    if (!v) throw new Error('avviso non trovato: ricarica la pagina');
    v.ignorato = Date.now();
    this.#salva();
    return `Ignorato: «${v.messaggio.slice(0, 60)}» non comparirà più`;
  }

  // History of the ignored alerts, for the tile showing the alerts: they are readmitted one by one.
  ignorati() {
    return [...this.voci.values()].filter((v) => v.ignorato)
      .map((v) => ({ chiave: v.chiave, testo: `${v.host ? `${v.host} · ` : ''}${v.messaggio}`, dal: v.ignorato, fino: null }))
      .sort((a, b) => b.dal - a.dal);
  }

  riammetti(chiave) {
    const v = this.voci.get(chiave);
    if (!v?.ignorato) throw new Error('non è (più) fra gli ignorati');
    v.ignorato = null; v.confermato = null;
    this.#salva();
    return `Riammesso: «${v.messaggio.slice(0, 60)}»`;
  }

  ripristinaIgnorati() {
    let n = 0;
    for (const v of this.voci.values()) if (v.ignorato) { v.ignorato = null; v.confermato = null; n++; }
    this.#salva();
    return n ? `Ripristinat${n === 1 ? 'o 1 messaggio ignorato' : `i ${n} messaggi ignorati`}` : 'Nessun messaggio ignorato';
  }

  confermaTutti() {
    let n = 0;
    for (const v of this.voci.values()) if (!v.confermato && !v.ignorato) { v.confermato = Date.now(); n++; }
    this.#salva();
    return `Ack: ${n} avvis${n === 1 ? 'o sospeso' : 'i sospesi'} per 24 ore`;
  }

  // Unseen first, then the most severe, then the most recent. An Ack snoozes the alert for 24
  // hours: after that, if the problem is still there (attivo) the alert is back among the unseen.
  elenco() {
    const peso = { critico: 0, attenzione: 1 };
    const adesso = Date.now();
    return [...this.voci.values()].map((v) => ({ ...v, da_vedere: !v.ignorato && (!v.confermato || (v.attivo && adesso - v.confermato > SOSPENSIONE)), ignorato: v.ignorato || null,
      sospeso_fino: v.confermato ? v.confermato + SOSPENSIONE : null }))
      .sort((a, b) => (b.da_vedere - a.da_vedere) || ((peso[a.gravita] ?? 2) - (peso[b.gravita] ?? 2)) || (b.ultimo - a.ultimo));
  }
}

export const avvisi = new Avvisi();
