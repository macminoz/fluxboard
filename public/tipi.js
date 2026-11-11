// Come si disegna il corpo di ogni tipo di tile. Per aggiungere un tipo nuovo basta una voce
// qui (e una in server/schema.js). Ogni funzione riceve la tile, lo stato e il contesto, e
// restituisce l'HTML del corpo.

import { proteggi, riempi, perLivello, comeData } from './formato.js';
import { compilaCondizione } from './condizione.js';
import { disegnaGrafico } from './grafico.js';
import { disegnaCronologia } from './cronologia.js';
import { pulsantiRiga, pulsantiTile } from './azioni.js';

function testoTile(t, ctx, chiave) {
  return perLivello(t[chiave], ctx.livello, ctx.livelli);
}

// mostra_se di una voce: assente = sempre; altrimenti una condizione sulla riga ("valvola == acceso").
function condizioneVera(condizione, riga) {
  if (!condizione) return true;
  try { return compilaCondizione(condizione)(riga); } catch { return true; }
}

// Un valore come "21,5°" o "840 W": il numero grande, l'unità più piccola e chiara, così l'occhio
// legge prima il numero. Un valore che non comincia con un numero ("pioggia debole") è testo:
// più piccolo, per non pesare quanto una misura.
function valoreLeggibile(html) {
  const m = html.match(/^([−+-]?\d[\d.,]*)(\s*)([^\d<]{1,8})$/);
  // Il simbolo dei gradi resta attaccato e grande: "21,5°" si legge come una parola sola.
  if (m && !m[3].startsWith('°')) return { html: `<span class="n">${m[1]}</span><span class="u">${m[2] ? '&nbsp;' : ''}${m[3]}</span>`, testo: false };
  return { html, testo: !/^[−+-]?\d/.test(html) };
}

// Livello, condizione: le voci (o le colonne) che valgono adesso.
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

// La riga che descrive "adesso": la prima per le tile normali, la più recente per un grafico.
export function rigaAttuale(t, s) {
  const righe = s?.righe || [];
  if (t.tipo !== 'grafico' || righe.length < 2) return righe[0] || {};
  const asse = t.asse || '_time';
  let migliore = righe[0], tm = comeData(migliore[asse])?.getTime() ?? -Infinity;
  for (const r of righe) { const x = comeData(r[asse])?.getTime() ?? -Infinity; if (x >= tm) { migliore = r; tm = x; } }
  return migliore;
}

// Le voci affiancate (al massimo 4 per riga) e, sotto, quelle raccolte in un "gruppo".
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
    // Con "tabella" l'elenco diventa una tabella: colonne allineate, numeri a destra.
    if (Array.isArray(t.tabella) && t.tabella.length) {
      const colonne = vociValide(t.tabella, {}, ctx);
      const conAzioni = (t.azioni || []).some((a) => !a.globale);
      // L'allineamento si decide per colonna, non per cella: a destra solo se tutti i valori sono
      // numeri (o se lo chiede `allinea`). Così "13.1.0" e "v2.9.1" stanno nella stessa colonna.
      const valori = colonne.map((c) => righe.map((r) => valoreLeggibile(riempi(perLivello(c.valore, ctx.livello, ctx.livelli) ?? '', r, ctx.fuso))));
      const aDestra = colonne.map((c, i) => c.allinea === 'destra'
        || (c.allinea !== 'sinistra' && valori[i].some((v) => v.html !== '') && valori[i].every((v) => v.html === '' || !v.testo)));
      // Colonne allargabili: si trascina il bordo destro dell'intestazione (doppio click = automatica).
      // Le larghezze stanno nella disposizione del display, per intestazione (t.larghezze).
      const nomi = colonne.map((c) => String(perLivello(c.etichetta, ctx.livello, ctx.livelli) ?? ''));
      const larghezze = t.larghezze || {};
      // Una colonna con larghezza ha il contenuto in un riquadro di quella misura: le altre restano automatiche.
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

  // Più valori affiancati: etichetta piccola sopra, valore grande sotto (come le card di HA).
  valori(t, s, ctx) {
    const riga = s?.righe?.[0] || {};
    return `${vociHtml(t, riga, ctx)}${pulsantiRiga(t, riga, ctx)}${pulsantiTile(t, ctx, s)}`;
  },

  // Un grafico può avere in testa le stesse "voci" di una tile "valori", lette dal punto più
  // recente (l'ultima riga nel tempo): così una tile sola dice com'è adesso e com'è andata.
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
    const hh = ora.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: ctx.fuso });
    const giorno = ora.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: ctx.fuso });
    return `<p class="orologio"><span class="ora">${hh}</span> <span class="giorno">${giorno}</span></p>`;
  },

  // Di norma l'immagine passa da Fluxboard (/api/immagine): si vede anche da reti che non
  // raggiungono la telecamera. Con "diretto: true" il browser la chiede direttamente.
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

// I tipi il cui corpo non va ridisegnato a ogni aggiornamento (stream, pagine incorporate).
export const STABILI = new Set(['immagine', 'iframe']);
