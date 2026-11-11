// "Chart" tile: lines over time, drawn in SVG without libraries (the touch panel does not go on the
// Internet). Rules: a single vertical axis, 2 px lines, a thin grid, legend above with two or more
// series, final value written next to each line, crosshair with a box on hover and a hidden table
// for screen readers. Series colours come from --serie-1… in stile.css, in a fixed order and
// checked for colour blindness.

import { locale } from './lingua.js';
import { proteggi, comeData } from './formato.js';
import { compilaCondizione } from './condizione.js';

const M = { su: 10, destra: 58, giu: 24, sinistra: 40 };

function pulito(passo) {                      // 1, 2, 5 × 10^n
  const e = 10 ** Math.floor(Math.log10(passo));
  return [1, 2, 5, 10].map((m) => m * e).find((m) => m >= passo);
}

function scalaY(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const passo = pulito((max - min) / n);
  const da = Math.floor(min / passo) * passo, a = Math.ceil(max / passo) * passo;
  const tacche = [];
  for (let v = da; v <= a + passo / 2; v += passo) tacche.push(Number(v.toFixed(6)));
  return { da, a, tacche };
}

// passoFisso: ms between one tick and the next (tiles with `tacche: 3h`); without it, as many as
// fit.
function tacchetempo(t0, t1, fuso, quante = 5, passoFisso = 0) {
  const ore = (t1 - t0) / 3_600_000;
  const passo = passoFisso || ([1, 2, 3, 6, 12, 24, 48, 168].find((h) => ore / h <= quante) || 168) * 3_600_000;
  const tacche = [];
  // Ticks on the "round" hours of local time (00, 03, 06…), not UTC.
  const scarto = -new Date(t0).getTimezoneOffset() * 60_000;
  for (let t = Math.ceil((t0 + scarto) / passo) * passo - scarto; t <= t1; t += passo) tacche.push(t);
  const formato = passo >= 86_400_000 ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' };
  return tacche.map((t) => ({ t, testo: new Date(t).toLocaleString(locale(), { ...formato, timeZone: fuso }) }));
}

// An empty field is not zero: Number('') would be 0 and draw a drop that never happened.
const num = (v) => (v === '' || v == null ? NaN : Number(v));
const numero = (v, decimali) => Number(v).toLocaleString(locale(), { minimumFractionDigits: decimali, maximumFractionDigits: decimali });

// testa: HTML to put on the same row as the legend (the "items" of an all-in-one chart). ctx.misure
// { l, a }: the real pixels of the space, measured by the page after the first drawing. So the text
// keeps its size even in a narrow tile, and in a fixed-height tile the chart takes the space left
// instead of scrolling. Without sizes: 640 × 190.
export function disegnaGrafico(t, s, ctx, testa = '') {
  const L = Math.round(Math.max(ctx.misure?.l || 640, 160));
  const A = Math.round(Math.min(Math.max(ctx.misure?.a || 190, 64), 600));
  const serie = (t.serie || []).filter((x) => x?.campo);
  const asse = t.asse || '_time';
  const decimali = Number.isInteger(t.decimali) ? t.decimali : 1;
  const unita = t.unita || '';
  const punti = (s?.righe || []).map((r) => ({ t: comeData(r[asse])?.getTime(), r })).filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  if (punti.length < 2 || !serie.length) return `${testa}<p class="vuoto">${proteggi(t.vuoto || 'Pochi dati per un grafico')}</p>`;

  // "soglie": horizontal reference lines (e.g. the meter limit), always inside the scale.
  const soglie = (Array.isArray(t.soglie) ? t.soglie : []).filter((x) => Number.isFinite(Number(x?.valore)));
  const valori = [...punti.flatMap((p) => serie.map((x) => num(p.r[x.campo]))), ...soglie.map((x) => Number(x.valore))].filter(Number.isFinite);
  const y = scalaY(Math.min(...valori), Math.max(...valori), Math.min(Math.max(Math.floor((A - M.su - M.giu) / 22), 2), 4));
  const t0 = punti[0].t, t1 = punti.at(-1).t;
  const px = (tt) => M.sinistra + ((tt - t0) / (t1 - t0)) * (L - M.sinistra - M.destra);
  const py = (v) => M.su + (1 - (v - y.da) / (y.a - y.da)) * (A - M.su - M.giu);

  const griglia = y.tacche.map((v) => `<line class="g-griglia" x1="${M.sinistra}" x2="${L - M.destra}" y1="${py(v)}" y2="${py(v)}"/>
    <text class="g-asse" x="${M.sinistra - 6}" y="${py(v) + 4}" text-anchor="end">${numero(v, Math.max(0, -Math.floor(Math.log10(y.tacche[1] - y.tacche[0]))))}</text>`).join('');
  const righeSoglia = soglie.map((x) => {
    const Y = py(Number(x.valore)).toFixed(1);
    return `<line class="g-soglia" data-tono="${proteggi(x.tono || 'allarme')}" x1="${M.sinistra}" x2="${L - M.destra}" y1="${Y}" y2="${Y}"/>
      <text class="g-scritta-soglia" data-tono="${proteggi(x.tono || 'allarme')}" x="${L - M.destra - 4}" y="${Number(Y) - 5}" text-anchor="end">${proteggi(x.etichetta || `${numero(x.valore, decimali)}${unita}`)}</text>`;
  }).join('');
  const tacche = String(t.tacche || '').match(/^(\d+)([mhd])$/);
  const passoTacche = tacche ? Number(tacche[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[tacche[2]] : 0;
  const asseX = tacchetempo(t0, t1, ctx.fuso, Math.max(Math.floor((L - M.sinistra - M.destra) / 70), 2), passoTacche).map(({ t: tt, testo }) =>
    `<text class="g-asse" x="${px(tt)}" y="${A - 6}" text-anchor="middle">${proteggi(testo)}</text>`).join('');

  // Labels at the end of the lines do not overlap: if two final values are close, they move apart
  // vertically as much as needed to read both (the dot stays on the real point).
  const fini = serie.map((x, i) => {
    const pts = punti.filter((p) => Number.isFinite(num(p.r[x.campo])));
    return pts.length ? { i, y: py(num(pts.at(-1).r[x.campo])) } : null;
  }).filter(Boolean).sort((a, b) => a.y - b.y);
  for (let j = 1; j < fini.length; j++) if (fini[j].y - fini[j - 1].y < 13) fini[j].y = fini[j - 1].y + 13;
  const yScritta = Object.fromEntries(fini.map((f) => [f.i, f.y]));

  const linee = serie.map((x, i) => {
    const pts = punti.filter((p) => Number.isFinite(num(p.r[x.campo])));
    if (!pts.length) return '';
    let d = '';
    pts.forEach((p, j) => {
      const X = px(p.t).toFixed(1), Y = py(num(p.r[x.campo])).toFixed(1);
      if (!j) d += `M${X},${Y}`;
      else if (x.gradino) d += `H${X}V${Y}`;    // a setpoint changes in steps, not diagonally
      else d += `L${X},${Y}`;
    });
    const ultimo = pts.at(-1);
    const ex = px(ultimo.t), ey = py(num(ultimo.r[x.campo]));
    return `<path class="g-linea" style="--c: var(--serie-${(i % 8) + 1})" d="${d}"/>
      <circle class="g-fine" style="--c: var(--serie-${(i % 8) + 1})" cx="${ex}" cy="${ey}" r="4"/>
      <text class="g-etichetta" x="${ex + 8}" y="${(yScritta[i] ?? ey) + 4}" style="--c: var(--serie-${(i % 8) + 1})">${numero(ultimo.r[x.campo], decimali)}${proteggi(unita)}</text>`;
  }).join('');

  // "fasce": the stretches of time when a condition is true (e.g. the valve open), as vertical
  // bands behind the lines. Each point holds until the next; the last until the end of the chart.
  const fasce = (Array.isArray(t.fasce) ? t.fasce : t.fasce ? [t.fasce] : []).filter((f) => f?.se);
  const bande = fasce.map((f) => {
    let vera;
    try { vera = compilaCondizione(f.se); } catch { return ''; }
    const tono = f.tono || 'caldo';
    let html = '', da = null;
    punti.forEach((p, j) => {
      const si = vera(p.r);
      if (si && da === null) da = p.t;
      if ((!si || j === punti.length - 1) && da !== null) {
        html += `<rect class="g-fascia" data-tono="${proteggi(tono)}" x="${px(da).toFixed(1)}" width="${Math.max(px(p.t) - px(da), 2).toFixed(1)}" y="${M.su}" height="${A - M.su - M.giu}"/>`;
        da = null;
      }
    });
    return html;
  }).join('');

  const legenda = ctx.legendaInTesta ? '' : legendaGrafico(t);

  // Data for the crosshair: times and values already in coordinates, so hovering does not
  // recompute.
  const dati = {
    l: L, x: punti.map((p) => px(p.t)), t: punti.map((p) => p.t), fuso: ctx.fuso, unita, decimali,
    fasce: fasce.map((f) => { let v = () => false; try { v = compilaCondizione(f.se); } catch { /* segnalata dal validatore */ } return { nome: f.etichetta || f.se, v: punti.map((p) => Boolean(v(p.r))) }; }),
    serie: serie.map((x, i) => ({ nome: x.etichetta || x.campo, colore: `var(--serie-${(i % 8) + 1})`, v: punti.map((p) => p.r[x.campo] ?? null), y: punti.map((p) => (Number.isFinite(num(p.r[x.campo])) ? py(num(p.r[x.campo])) : null)) })),
  };
  const tabella = `<table class="solo-lettore"><caption>${proteggi(t.titolo || 'Grafico')}</caption><thead><tr><th>Ora</th>${serie.map((x) => `<th>${proteggi(x.etichetta || x.campo)}</th>`).join('')}</tr></thead><tbody>${
    punti.map((p) => `<tr><td>${new Date(p.t).toLocaleString(locale(), { timeZone: ctx.fuso })}</td>${serie.map((x) => `<td>${p.r[x.campo] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  const capo = testa || legenda ? `<div class="g-capo">${testa}${legenda}</div>` : '';
  return `<div class="grafico" data-grafico='${proteggi(JSON.stringify(dati))}'>${capo}
    <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="${proteggi(t.titolo || 'Grafico')}">
      ${bande}${griglia}${righeSoglia}${asseX}${linee}
      <g class="g-mirino" hidden><line y1="${M.su}" y2="${A - M.giu}"/></g>
    </svg><div class="g-riquadro" hidden></div>${tabella}</div>`;
}

// The legend depends only on the configuration (series and bands), not on the data: the page puts
// it on the tile's title row, where there is free space, and the drawing gets one more row.
export function legendaGrafico(t) {
  const serie = (t.serie || []).filter((x) => x?.campo);
  const fasce = (Array.isArray(t.fasce) ? t.fasce : t.fasce ? [t.fasce] : []).filter((f) => f?.se);
  if (serie.length < 2 && !fasce.length) return '';
  return `<div class="g-legenda">${serie.map((x, i) =>
    `<span><i style="--c: var(--serie-${(i % 8) + 1})"></i>${proteggi(x.etichetta || x.campo)}</span>`).join('')}${fasce.map((f) =>
    `<span><i class="fascia" data-tono="${proteggi(f.tono || 'caldo')}"></i>${proteggi(f.etichetta || f.se)}</span>`).join('')}</div>`;
}

// A single listener for the whole page: the crosshair follows the pointer and snaps to the nearest
// point; the box lists every series at that moment.
export function attivaGrafici(radice = document) {
  radice.addEventListener('pointermove', (e) => {
    const g = e.target.closest?.('.grafico');
    for (const altro of radice.querySelectorAll('.grafico.mirando')) if (altro !== g) nascondi(altro);
    if (!g) return;
    const dati = JSON.parse(g.dataset.grafico);
    const svg = g.querySelector('svg');
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * dati.l;
    let i = 0;
    for (let j = 1; j < dati.x.length; j++) if (Math.abs(dati.x[j] - x) < Math.abs(dati.x[i] - x)) i = j;
    const mirino = g.querySelector('.g-mirino');
    mirino.hidden = false;
    mirino.querySelector('line').setAttribute('x1', dati.x[i]);
    mirino.querySelector('line').setAttribute('x2', dati.x[i]);
    mirino.querySelectorAll('circle').forEach((c) => c.remove());
    for (const s of dati.serie) {
      if (s.y[i] == null) continue;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', dati.x[i]); c.setAttribute('cy', s.y[i]); c.setAttribute('r', 4);
      c.style.setProperty('--c', s.colore);
      mirino.append(c);
    }
    const riquadro = g.querySelector('.g-riquadro');
    riquadro.hidden = false;
    // textContent: series names can come from an external source.
    riquadro.replaceChildren();
    const ora = document.createElement('b');
    ora.textContent = new Date(dati.t[i]).toLocaleString(locale(), { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: dati.fuso });
    riquadro.append(ora);
    for (const s of dati.serie) {
      const r = document.createElement('span');
      const chiave = document.createElement('i'); chiave.style.setProperty('--c', s.colore);
      r.append(chiave, document.createTextNode(`${s.nome}: ${s.v[i] == null ? '—' : numero(s.v[i], dati.decimali) + dati.unita}`));
      riquadro.append(r);
    }
    for (const f of dati.fasce || []) if (f.v[i]) {
      const r = document.createElement('span');
      r.className = 'g-in-fascia';
      r.textContent = f.nome;
      riquadro.append(r);
    }
    const sinistra = (dati.x[i] / dati.l) * box.width;
    riquadro.style.left = `${Math.min(Math.max(sinistra + 12, 0), box.width - riquadro.offsetWidth - 4)}px`;
    if (sinistra + 12 + riquadro.offsetWidth > box.width) riquadro.style.left = `${Math.max(sinistra - riquadro.offsetWidth - 12, 0)}px`;
    g.classList.add('mirando');
  });
}

function nascondi(g) {
  g.classList.remove('mirando');
  g.querySelector('.g-mirino').hidden = true;
  g.querySelector('.g-riquadro').hidden = true;
}
