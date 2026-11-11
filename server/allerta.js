// Alert: the tiles signalling something serious right now, across every workspace. It feeds
// the blinking signal in the header (with sound, if turned on in the browser) and the push
// notifications to the outside (Node-RED, ntfy, any webhook).
//
// When a tile is in alert:
//   - by itself: when `colore_se` lights it up `rosso` (or with the `allarmi` label) → critical;
//   - with `allerta:` in the tile it is decided by hand:
//       allerta: grave     every time colore_se lights it up, whatever the colour
//       allerta: avviso    the same, but only a yellow signal in the header (no sound, no push)
//       allerta: no        never (even if it turns red)
// Rows hidden with Ack or Ignore do not count: an Ack turns the signal off too.
//
// Notifications, in global.yaml (optional; English keys work too):
//   notifiche:
//     - url: http://192.168.1.40:1880/fluxboard/allerta   # webhook: receives a JSON
//       formato: json            # json (default) · ntfy (url = ntfy server + /topic) · testo
//       livello: grave           # grave (default) or avviso
//       anche_risolte: false     # true = notifies also when the alert ends
//       ripeti_dopo: 15m         # an alert that comes and goes sends at most one notification every 15m
//       intestazioni: { Authorization: "Bearer ${NTFY_TOKEN}" }

import { EventEmitter } from 'node:events';
import { compilaCondizione } from '../public/condizione.js';
import { t } from '../public/lingua.js';

import { workspaceDi, idNelWorkspace } from './config.js';
import { durata, sostituisciEnv } from './util.js';

const PESO = { grave: 2, avviso: 1 };
const testoRiga = (r) => {
  for (const k of ['messaggio', '_msg', 'nome', 'host', 'titolo']) if (r?.[k] !== undefined && r[k] !== null && r[k] !== '') return String(r[k]);
  return '';
};

export class Allerta extends EventEmitter {
  constructor(config, motore) {
    super();
    this.config = config;
    this.motore = motore;
    this.lista = [];
    this.inviate = new Map();   // tile id → last notification sent (ms)
    this.pronta = false;        // the first evaluation (after a restart) sends no notifications
  }

  #colore(nome) {
    const a = this.config.globale.argomenti?.[nome];
    return typeof a === 'string' ? a : a?.colore || nome;
  }

  // The tile right now: null or { livello, dettaglio, colore }.
  #valutaTile(t, s) {
    if (!t.colore_se || !s?.righe?.length || t.allerta === 'no' || t.allerta === false) return null;
    const righe = t.tipo === 'grafico' ? [s.righe.at(-1)] : s.righe;
    for (const [condizione, scelta] of Object.entries(t.colore_se)) {
      let f;
      try { f = compilaCondizione(condizione); } catch { continue; }
      const riga = righe.find((r) => { try { return f(r); } catch { return false; } });
      if (!riga) continue;
      // By itself only red written as a colour is critical, or the "allarmi" label: a label that
      // happens to be red (e.g. "riscaldamento" while a valve is heating) is not an alarm.
      const nome = typeof scelta === 'string' ? scelta : scelta?.colore;
      const colore = this.#colore(nome);
      const livello = t.allerta === 'grave' || t.allerta === 'avviso' ? t.allerta : nome === 'rosso' || nome === 'allarmi' ? 'grave' : null;
      if (!livello) return null;
      const quante = t.tipo === 'grafico' ? 1 : righe.filter((r) => { try { return f(r); } catch { return false; } }).length;
      return { livello, colore, dettaglio: testoRiga(riga), quante };
    }
    return null;
  }

  valuta() {
    const nuova = [];
    for (const [id, t] of Object.entries(this.config.tile)) {
      if (t.attiva === false || t.mostra_se === 'mai') continue;
      const v = this.#valutaTile(t, this.motore.stato.get(id));
      if (v) nuova.push({ id, workspace: workspaceDi(id), tile: idNelWorkspace(id), titolo: t.titolo || id, ...v, dal: this.lista.find((x) => x.id === id)?.dal || Date.now() });
    }
    nuova.sort((a, b) => (PESO[b.livello] - PESO[a.livello]) || (a.dal - b.dal));
    const firma = (l) => JSON.stringify(l.map((x) => [x.id, x.livello, x.dettaglio, x.quante]));
    const prima = this.lista;
    this.lista = nuova;
    if (firma(prima) !== firma(nuova)) {
      this.emit('cambiata', nuova);
      if (this.pronta) this.#notifica(prima, nuova);
    }
    this.pronta = true;
  }

  #notifica(prima, dopo) {
    // ${NAME} in the notifications (e.g. a token) comes from the Secrets, as in the sources.
    const regole = [].concat(this.config.globale.notifiche || []).filter((n) => n?.url).map((n) => sostituisciEnv(n, new Set()));
    if (!regole.length) return;
    const adesso = Date.now();
    const nuove = dopo.filter((x) => !prima.some((p) => p.id === x.id && PESO[p.livello] >= PESO[x.livello]));
    const finite = prima.filter((p) => !dopo.some((x) => x.id === p.id));
    for (const n of regole) {
      const minimo = PESO[n.livello] || PESO.grave;
      const ripeti = durata(n.ripeti_dopo, 15 * 60_000);
      for (const x of nuove) {
        if (PESO[x.livello] < minimo) continue;
        const chiave = `${n.url}|${x.id}`;
        if (adesso - (this.inviate.get(chiave) || 0) < ripeti) continue;
        this.inviate.set(chiave, adesso);
        this.#manda(n, x, false);
      }
      if (n.anche_risolte) for (const x of finite) if (PESO[x.livello] >= minimo) this.#manda(n, x, true);
    }
  }

  async #manda(n, x, risolta) {
    const titolo = `${risolta ? t('✓ Risolto') : x.livello === 'grave' ? '🚨' : '⚠️'} ${x.titolo}`;
    const messaggio = x.dettaglio ? (x.quante > 1 ? t('{} (e altre {})', x.dettaglio, x.quante - 1) : x.dettaglio) : t(risolta ? 'tornato normale' : 'in allerta');
    const pagina = this.config.globale.indirizzo ? `${String(this.config.globale.indirizzo).replace(/\/$/, '')}/${x.workspace === 'default' ? '' : `?workspace=${encodeURIComponent(x.workspace)}`}` : undefined;
    let corpo, tipo = 'application/json';
    if (n.formato === 'testo') { corpo = `${titolo}: ${messaggio}`; tipo = 'text/plain; charset=utf-8'; }
    else if (n.formato === 'ntfy') {
      const u = new URL(n.url);
      const argomento = u.pathname.replace(/^\/+/, '');
      corpo = JSON.stringify({ topic: argomento, title: titolo, message: messaggio, priority: risolta ? 3 : x.livello === 'grave' ? 5 : 4, tags: [risolta ? 'white_check_mark' : 'rotating_light'], ...(pagina ? { click: pagina } : {}) });
    } else corpo = JSON.stringify({ evento: risolta ? 'risolta' : 'allerta', livello: x.livello, titolo: x.titolo, messaggio, tile: x.tile, workspace: x.workspace, quante: x.quante, dal: new Date(x.dal).toISOString(), pagina });
    const url = n.formato === 'ntfy' ? new URL(n.url).origin : n.url;
    try {
      const r = await fetch(url, { method: n.metodo || 'POST', headers: { 'Content-Type': tipo, ...(n.intestazioni || {}) }, body: corpo, signal: AbortSignal.timeout(10_000) });
      console.log(`[notifica] ${x.id} ${risolta ? 'risolta' : x.livello} → ${url} ${r.status}`);
    } catch (e) { console.warn(`[notifica] ${x.id} → ${url} ✕ ${e.message}`); }
  }
}
