// How the body of each tile type is drawn. Adding a new type takes an entry here (and one in
// server/schema.js). Each function gets the tile, the state and the context, and returns the body's
// HTML.

import { locale } from './lingua.js';
import { proteggi, riempi, perLivello, comeData } from './formato.js';
import { compilaCondizione } from './condizione.js';
import { disegnaGrafico } from './grafico.js';
import { disegnaCronologia } from './cronologia.js';
import { pulsantiRiga, pulsantiTile } from './azioni.js';

function testoTile(t, ctx, chiave) {
  return perLivello(t[chiave], ctx.livello, ctx.livelli);
}

// mostra_se of an item: absent = always; otherwise a condition on the row ("valve == on").
function condizioneVera(condizione, riga) {
  if (!condizione) return true;
  try { return compilaCondizione(condizione)(riga); } catch { return true; }
}

// A value like "21.5°" or "840 W": the number large, the unit smaller and lighter, so the eye reads
// the number first. A value not starting with a number ("light rain") is text: smaller, so it does
// not weigh as much as a measurement.
function valoreLeggibile(html) {
  const m = html.match(/^([−+-]?\d[\d.,]*)(\s*)([^\d<]{1,8})$/);
  // The degree sign stays attached and large: "21.5°" reads as a single word.
  if (m && !m[3].startsWith('°')) return { html: `<span class="n">${m[1]}</span><span class="u">${m[2] ? '&nbsp;' : ''}${m[3]}</span>`, testo: false };
  return { html, testo: !/^[−+-]?\d/.test(html) };
}

// Level, condition: the items (or columns) that apply now.
function vociValide(voci, riga, ctx) {
  const livello = ctx.livelli.indexOf(ctx.livello);
  return (voci || []).filter((v) => (!v.livello || ctx.livelli.indexOf(v.livello) <= livello) && condizioneVera(v.mostra_se, riga));
}

function tonoDi(tono, riga) {
  if (!tono) return null;
  if (typeof tono === 'string') return tono;
  for (const [condizione, nome] of Object.entries(tono)) {
    try { if (compilaCondizione(condizione)(riga)) return nome; } catch { /* segnalata dal validatore */ }
  }
  return null;
}

// The row describing "now": the first for normal tiles, the most recent for a chart.
export function rigaAttuale(t, s) {
  const righe = s?.righe || [];
  if (t.tipo !== 'grafico' || righe.length < 2) return righe[0] || {};
  const asse = t.asse || '_time';
  let migliore = righe[0], tm = comeData(migliore[asse])?.getTime() ?? -Infinity;
  for (const r of righe) { const x = comeData(r[asse])?.getTime() ?? -Infinity; if (x >= tm) { migliore = r; tm = x; } }
  return migliore;
}

// The items side by side (at most 4 per row) and, below, those gathered in a "group".
function vociHtml(t, riga, ctx) {
  const voci = vociValide(t.voci, riga, ctx);
  const griglia = (elenco, classe = '') => {
    const n = Math.min(Math.max(elenco.length, 1), 4);
    return `<dl class="valori${classe}" data-n="${n}" style="--n: ${n}">${elenco.map((v) => {
      const tono = tonoDi(v.tono, riga);
      const val = valoreLeggibile(riempi(perLivello(v.valore, ctx.livello, ctx.livelli) ?? '', riga, ctx.fuso));
      return `<div class="voce${val.testo ? ' testuale' : ''}"${tono ? ` data-tono="${proteggi(tono)}"` : ''}><dt>${riempi(perLivello(v.etichetta, ctx.livello, ctx.livelli) ?? '', riga, ctx.fuso)}</dt>`
        + `<dd>${val.html}</dd></div>`;
    }).join('')}</dl>`;
  };
  const principali = voci.filter((v) => !v.gruppo);
  const gruppi = [];
  for (const v of voci.filter((x) => x.gruppo)) {
    const g = gruppi.find((x) => x.nome === v.gruppo) || gruppi[gruppi.push({ nome: v.gruppo, voci: [] }) - 1];
    g.voci.push(v);
  }
  return `${principali.length ? griglia(principali) : ''}${gruppi.map((g) => `<div class="gruppo-voci"><h3>${riempi(String(g.nome), riga, ctx.fuso)}</h3>${griglia(g.voci, ' piccoli')}</div>`).join('')}`;
}

export const TIPI = {
  elenco(t, s, ctx) {
    const righe = s?.righe || [];
    if (!righe.length) return `<p class="vuoto">${proteggi(t.vuoto || 'Niente da mostrare')}</p>${pulsantiTile(t, ctx, s)}`;
    // With "tabella" the list becomes a table: aligned columns, numbers on the right.
    if (Array.isArray(t.tabella) && t.tabella.length) {
      const colonne = vociValide(t.tabella, {}, ctx);
      const conAzioni = (t.azioni || []).some((a) => !a.globale);
      // Alignment is decided per column, not per cell: right only if every value is a number (or if
      // `allinea` asks for it). So "13.1.0" and "v2.9.1" sit in the same column.
      const valori = colonne.map((c) => righe.map((r) => valoreLeggibile(riempi(perLivello(c.valore, ctx.livello, ctx.livelli) ?? '', r, ctx.fuso))));
      const aDestra = colonne.map((c, i) => c.allinea === 'destra'
        || (c.allinea !== 'sinistra' && valori[i].some((v) => v.html !== '') && valori[i].every((v) => v.html === '' || !v.testo)));
      // Resizable columns: drag the right edge of the heading (double click = automatic). Widths
      // live in the display's layout, by heading (t.larghezze).
      const nomi = colonne.map((c) => String(perLivello(c.etichetta, ctx.livello, ctx.livelli) ?? ''));
      const larghezze = t.larghezze || {};
      // A column with a width has its content in a box of that size: the others stay automatic.
      const dentro = (html, n) => (larghezze[n] ? `<div class="cella-fissa" data-larghezza-di="${proteggi(n)}" style="width:${Number(larghezze[n])}px">${html}</div>` : html);
      const cella = (c, r, i, j) => {
        const v = valori[i][j];
        const tono = tonoDi(c.tono, r);
        return `<td class="${aDestra[i] ? 'a-destra' : ''}"${tono ? ` data-tono="${proteggi(tono)}"` : ''}>${dentro(v.html, nomi[i])}</td>`;
      };
      const maniglia = (n, i) => (n && (i < nomi.length - 1 || conAzioni) ? `<span class="maniglia-colonna" data-colonna="${proteggi(n)}" title="Trascina per allargare o stringere · doppio click: automatica" aria-hidden="true"></span>` : '');
      return `<table class="tabella"><thead><tr>${colonne.map((c, i) => `<th class="${aDestra[i] ? 'a-destra' : ''}">${dentro(proteggi(nomi[i]), nomi[i])}${maniglia(nomi[i], i)}</th>`).join('')}${conAzioni ? '<th></th>' : ''}</tr></thead>
        <tbody>${righe.map((r, j) => `<tr>${colonne.map((c, i) => cella(c, r, i, j)).join('')}${conAzioni ? `<td class="a-destra colonna-azioni">${pulsantiRiga(t, r, ctx)}</td>` : ''}</tr>`).join('')}</tbody></table>${pulsantiTile(t, ctx, s)}`;
    }
    const modello = testoTile(t, ctx, 'riga');
    return `<ul class="elenco">${righe.map((r) => `<li><span class="testo-riga">${modello
      ? riempi(modello, r, ctx.fuso)
      : Object.entries(r).map(([k, v]) => `<span class="campo">${proteggi(k)}</span> ${proteggi(v)}`).join(' · ')}</span>${pulsantiRiga(t, r, ctx)}</li>`).join('')}</ul>${pulsantiTile(t, ctx, s)}`;
  },

  valore(t, s, ctx) {
    const riga = s?.righe?.[0] || {};
    const modello = testoTile(t, ctx, 'testo') || '{valore}';
    return `<p class="valore">${riempi(modello, riga, ctx.fuso)}</p>${pulsantiTile(t, ctx, s)}`;
  },

  // Several values side by side: small label above, big value below (like HA cards).
  valori(t, s, ctx) {
    const riga = s?.righe?.[0] || {};
    return `${vociHtml(t, riga, ctx)}${pulsantiRiga(t, riga, ctx)}${pulsantiTile(t, ctx, s)}`;
  },

  // A chart can have at the top the same "items" as a "values" tile, read from the most recent
  // point (the last row in time): one tile says how it is now and how it went.
  grafico(t, s, ctx) {
    const riga = rigaAttuale(t, s);
    const testa = Array.isArray(t.voci) && t.voci.length ? vociHtml(t, riga, ctx) : '';
    return disegnaGrafico(t, s, ctx, testa);
  },


  cronologia: disegnaCronologia,

  testo(t, s, ctx) {
    const modello = testoTile(t, ctx, 'testo') || '';
    return `<div class="testo">${proteggi(modello).replace(/\n/g, '<br>')}</div>`;
  },

  orologio(_t, _s, ctx) {
    const ora = new Date();
    const hh = ora.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: ctx.fuso });
    const giorno = ora.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: ctx.fuso });
    return `<p class="orologio"><span class="ora">${hh}</span> <span class="giorno">${giorno}</span></p>`;
  },

  // Normally the image goes through Fluxboard (/api/immagine): it is visible from networks that
  // cannot reach the camera. With "diretto: true" the browser asks for it directly.
  immagine(t) {
    const origine = t.diretto ? t.url : `/api/immagine?id=${encodeURIComponent(t.id)}`;
    return `<div class="cornice-immagine"><img class="immagine" alt="${proteggi(t.titolo)}" data-src="${proteggi(origine)}" data-ogni="${t.aggiorna_ogni || 0}">
      <p class="immagine-assente" hidden>Immagine non disponibile: riprovo fra poco</p></div>`;
  },

  iframe(t) {
    return `<iframe class="incorporato" src="${proteggi(t.url)}" style="height:${Number(t.altezza) || 300}px" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
  },

  errore(t, _s, ctx) {
    return ctx.livello === 'avanzata' ? `<p class="errore">File non valido: ${proteggi(t.errore)}</p>` : '';
  },
};

// Types whose body is not redrawn at every update (streams, embedded pages).
export const STABILI = new Set(['immagine', 'iframe']);
