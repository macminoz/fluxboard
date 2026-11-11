// Allerta: le tile che in questo momento segnalano qualcosa di grave, di tutti i workspace.
// Alimenta il segnale lampeggiante in testata (con il suono, se acceso nel browser) e le notifiche
// push verso l'esterno (Node-RED, ntfy, un webhook qualsiasi).
//
// Quando una tile è in allerta:
//   - di suo: quando `colore_se` la accende di `rosso` (o con l'etichetta `allarmi`) → grave;
//   - con `allerta:` nella tile si decide a mano:
//       allerta: grave     ogni volta che colore_se la accende, di qualunque colore
//       allerta: avviso    idem, ma solo segnale giallo in testata (niente suono, niente push)
//       allerta: no        mai (anche se diventa rossa)
// Le righe nascoste con Ack o Ignora non contano: un Ack spegne anche il segnale.
//
// Notifiche, in global.yaml (facoltative):
//   notifiche:
//     - url: http://192.168.1.40:1880/fluxboard/allerta   # webhook: riceve un JSON
//       formato: json            # json (predefinito) · ntfy (url = server ntfy + /argomento) · testo
//       livello: grave           # grave (predefinito) o avviso
//       anche_risolte: false     # true = avvisa anche quando l'allerta finisce
//       ripeti_dopo: 15m         # un'allerta che va e viene non manda più di una notifica ogni 15m
//       intestazioni: { Authorization: "Bearer ${NTFY_TOKEN}" }

import { EventEmitter } from 'node:events';
import { compilaCondizione } from '../public/condizione.js';

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
    this.inviate = new Map();   // id tile → ultima notifica mandata (ms)
    this.pronta = false;        // la prima valutazione (dopo un riavvio) non manda notifiche
  }

  #colore(nome) {
    const a = this.config.globale.argomenti?.[nome];
    return typeof a === 'string' ? a : a?.colore || nome;
  }

  // La tile adesso: null o { livello, dettaglio, colore }.
  #valutaTile(t, s) {
    if (!t.colore_se || !s?.righe?.length || t.allerta === 'no' || t.allerta === false) return null;
    const righe = t.tipo === 'grafico' ? [s.righe.at(-1)] : s.righe;
    for (const [condizione, scelta] of Object.entries(t.colore_se)) {
      let f;
      try { f = compilaCondizione(condizione); } catch { continue; }
      const riga = righe.find((r) => { try { return f(r); } catch { return false; } });
      if (!riga) continue;
      // Di suo è grave solo il rosso scritto come colore, o l'etichetta "allarmi": un'etichetta che
      // per caso è rossa (es. "riscaldamento" quando una valvola scalda) non è un allarme.
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
    // ${NOME} nelle notifiche (es. un token) viene dai Segreti, come nelle sorgenti.
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
    const titolo = `${risolta ? '✓ Risolto' : x.livello === 'grave' ? '🚨' : '⚠️'} ${x.titolo}`;
    const messaggio = x.dettaglio ? `${x.dettaglio}${x.quante > 1 ? ` (e altre ${x.quante - 1})` : ''}` : (risolta ? 'tornato normale' : 'in allerta');
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
