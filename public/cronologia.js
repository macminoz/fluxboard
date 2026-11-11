// "Timeline" tile: one row per item (room, service…) with the stretches of time when it was "on",
// like Grafana's state timeline but compact and with the current state at the end. HTML and CSS, no
// SVG: rows stay sharp at any width and the text at its size. The data: rows with the time (axis,
// default _time), the field naming the row (gruppo) and the status fields. A data point holds until
// another one arrives for the same row; empty fields keep the previous value, so a "now" row with
// only the temperature turns nothing off.

import { locale } from './lingua.js';
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
  // Ticks on the "round" hours of the dashboard's time zone (not UTC).
  const scarto = -new Date(t0).getTimezoneOffset() * 60_000;
  for (let t = Math.ceil((t0 + scarto) / passo) * passo - scarto; t < t1; t += passo) {
    fuori.push({ t, testo: new Date(t).toLocaleString(locale(), { ...formato, timeZone: fuso }) });
  }
  return fuori;
}

// Window chosen by the viewer among the tile's ("finestre: [6h, 12h, 24h]"): it stays in this
// browser. The query must read the longest; only the chosen stretch is shown here.
export function finestraScelta(t) {
  let scelta = null;
  try { scelta = localStorage.getItem(`fluxboard.finestra.${t.id}`); } catch { /* niente memoria */ }
  return (t.finestre || []).map(String).includes(scelta) ? scelta : (t.finestra || t.finestre?.at(-1) || '24h');
}
// The period buttons: in the tile header, on the title row.
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
  const ora = (x) => new Date(x).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: ctx.fuso });
  const pos = (x) => ((Math.min(Math.max(x, t0), t1) - t0) / (t1 - t0)) * 100;
  let acceso;
  try { acceso = compilaCondizione(t.se); } catch { return '<p class="vuoto">Condizione "se" non valida</p>'; }

  // Rows grouped, each in time order.
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
  // At the end of each row: one or more columns (in_fondo: [{ etichetta, valore, tenue }]); without
  // it, the single "stato" column. The "stato_se" of the items that are on goes below the chart,
  // one line per item, so the end columns stay aligned.
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
    // _da: since when it is on now; empty if it already was at the start of the window (unknown
    // since when).
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
