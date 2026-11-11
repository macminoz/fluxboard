// Tile "cronologia": una riga per elemento (stanza, servizio…) con i tratti di tempo in cui era
// "acceso", come la state timeline di Grafana ma compatta e con lo stato di adesso in fondo.
// HTML e CSS, niente SVG: le righe restano nitide a ogni larghezza e le scritte della loro misura.
//
// I dati: righe con il tempo (asse, predefinito _time), il campo che dice la riga (gruppo) e i
// campi di stato. Un dato vale finché non ne arriva un altro per la stessa riga; i campi vuoti
// tengono il valore precedente, così una riga "di adesso" con solo la temperatura non spegne nulla.

import { proteggi, riempi, comeData } from './formato.js';
import { compilaCondizione } from './condizione.js';

const DURATE = { m: 60_000, h: 3_600_000, d: 86_400_000 };
const durata = (testo, base) => {
  const m = String(testo ?? '').match(/^(\d+)([mhd])$/);
  return m ? Number(m[1]) * DURATE[m[2]] : base;
};
const vuoto = (v) => v === '' || v == null;

function tacche(t0, t1, fuso) {
  const ore = (t1 - t0) / 3_600_000;
  const passo = ([1, 2, 3, 6, 12, 24, 48, 168].find((h) => ore / h <= 4) || 168) * 3_600_000;
  const formato = passo >= 86_400_000 ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' };
  const fuori = [];
  // Tacche sulle ore "tonde" del fuso della dashboard (non di UTC).
  const scarto = -new Date(t0).getTimezoneOffset() * 60_000;
  for (let t = Math.ceil((t0 + scarto) / passo) * passo - scarto; t < t1; t += passo) {
    fuori.push({ t, testo: new Date(t).toLocaleString('it-IT', { ...formato, timeZone: fuso }) });
  }
  return fuori;
}

// Finestra scelta da chi guarda fra quelle della tile ("finestre: [6h, 12h, 24h]"): resta in
// questo browser. La query deve leggere la più lunga; qui si mostra solo il tratto scelto.
export function finestraScelta(t) {
  let scelta = null;
  try { scelta = localStorage.getItem(`fluxboard.finestra.${t.id}`); } catch { /* niente memoria */ }
  return (t.finestre || []).map(String).includes(scelta) ? scelta : (t.finestra || t.finestre?.at(-1) || '24h');
}
// I pulsanti dei periodi: stanno nell'intestazione della tile, sulla riga del titolo.
export function selettoreFinestre(t) {
  if ((t.finestre || []).length < 2) return '';
  const scelta = finestraScelta(t);
  return `<span class="cr-finestre" role="group" aria-label="Periodo">${t.finestre.map((f) => `<button type="button" data-finestra="${proteggi(f)}" aria-pressed="${String(f) === scelta}">${proteggi(f)}</button>`).join('')}</span>`;
}

export function scegliFinestra(id, valore) {
  try { localStorage.setItem(`fluxboard.finestra.${id}`, valore); } catch { /* niente memoria */ }
}

export function disegnaCronologia(t, s, ctx) {
  const asse = t.asse || '_time';
  const t1 = Date.now();
  const finestra = finestraScelta(t);
  const t0 = t1 - durata(finestra, 86_400_000);
  const ora = (x) => new Date(x).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: ctx.fuso });
  const pos = (x) => ((Math.min(Math.max(x, t0), t1) - t0) / (t1 - t0)) * 100;
  let acceso;
  try { acceso = compilaCondizione(t.se); } catch { return '<p class="vuoto">Condizione "se" non valida</p>'; }

  // Righe raggruppate, ognuna in ordine di tempo.
  const gruppi = new Map((t.ordine || []).map((n) => [String(n), []]));
  for (const r of s?.righe || []) {
    const tempo = comeData(r[asse])?.getTime();
    const g = r[t.gruppo];
    if (!Number.isFinite(tempo) || vuoto(g)) continue;
    if (!gruppi.has(String(g))) gruppi.set(String(g), []);
    gruppi.get(String(g)).push({ tempo, r });
  }
  if (![...gruppi.values()].some((x) => x.length)) return `<p class="vuoto">${proteggi(t.vuoto || 'Niente da mostrare')}</p>`;

  const tono = proteggi(t.tono || 'caldo');
  const nomeSe = t.etichetta_se || 'Acceso';
  // In fondo a ogni riga: una o più colonne (in_fondo: [{ etichetta, valore, tenue }]); senza,
  // la sola colonna "stato". Lo "stato_se" degli elementi accesi va sotto il grafico, una riga
  // per elemento, così le colonne in fondo restano allineate.
  const inFondo = Array.isArray(t.in_fondo) && t.in_fondo.length
    ? t.in_fondo.map((c) => (typeof c === 'string' ? { valore: c } : c))
    : [{ valore: t.stato ?? '' }];
  const attivi = [];
  const righe = [...gruppi].map(([nome, dati]) => {
    dati.sort((a, b) => a.tempo - b.tempo);
    let stato = {}, da = null;
    const bande = [];
    for (const { tempo, r } of dati) {
      for (const [k, v] of Object.entries(r)) if (!vuoto(v)) stato[k] = v;
      const si = Boolean(acceso(stato));
      if (si && da === null) da = tempo;
      if (!si && da !== null) { bande.push([da, tempo]); da = null; }
    }
    const adesso = da !== null;
    if (adesso) bande.push([da, t1]);
    // _da: da quando è acceso adesso; vuoto se lo era già all'inizio della finestra (non si sa da quando).
    const riga = { ...stato, _da: adesso && da > t0 + 1000 ? da : null, _nome: nome };
    if (adesso && t.stato_se) attivi.push(`<li><b>${proteggi(nome)}</b> ${riempi(t.stato_se, riga, ctx.fuso)}</li>`);
    const html = bande.filter(([a, b]) => b > t0).map(([a, b]) => {
      const titolo = `${nome} · ${nomeSe} ${ora(Math.max(a, t0))}–${b >= t1 ? 'adesso' : ora(b)}`;
      return `<i class="cr-fascia" data-tono="${tono}" style="left:${pos(a).toFixed(2)}%;width:${Math.max(pos(b) - pos(a), 0.4).toFixed(2)}%" title="${proteggi(titolo)}"></i>`;
    }).join('');
    return `<div class="cr-riga${adesso ? ' attiva' : ''}" data-tono="${tono}"><span class="cr-nome">${proteggi(nome)}</span>`
      + `<span class="cr-barra" role="img" aria-label="${proteggi(`${nome}: ${bande.length ? `${nomeSe} ${bande.map(([a, b]) => `${ora(Math.max(a, t0))}–${b >= t1 ? 'adesso' : ora(b)}`).join(', ')}` : 'mai'}`)}">${html}</span>`
      + inFondo.map((c) => `<span class="cr-stato${c.tenue ? ' tenue' : ''}">${riempi(c.valore ?? '', riga, ctx.fuso)}</span>`).join('') + '</div>';
  }).join('');

  const vuote = inFondo.map(() => '<span></span>').join('');
  const testa = inFondo.some((c) => c.etichetta)
    ? `<div class="cr-riga cr-testa"><span></span><span></span>${inFondo.map((c) => `<span class="cr-stato">${proteggi(c.etichetta || '')}</span>`).join('')}</div>`
    : '';
  const asseX = tacche(t0, t1, ctx.fuso).map(({ t: x, testo }) => `<span style="left:${pos(x).toFixed(2)}%">${proteggi(testo)}</span>`).join('');
  return `<div class="cronologia" style="--cr-colonne:${inFondo.length}">${testa}${righe}<div class="cr-riga cr-asse"><span></span><span class="cr-tacche">${asseX}</span>${vuote}</div></div>`
    + (attivi.length ? `<ul class="cr-attivi" data-tono="${tono}">${attivi.join('')}</ul>` : '');
}
