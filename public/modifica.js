// The dashboard's "Edit" mode, modelled on the most common dashboards (Home Assistant, Grafana, the
// iOS Home screen): a button turns it on, each tile shows its tools (edit, duplicate, delete), drag
// to move it and pull the corner to resize it, "+ Add tile" opens the choice of type. Every change
// is saved right away; a deletion can be undone from the notice at the bottom, without confirmation
// windows.

import { scegliTipo, apriEditor } from './editor-tile.js';
import { gestisciSorgenti } from './editor-sorgente.js';
import { avvisa } from './avvisi.js';
import { gestisciSnapshot } from './snapshot.js';
import { apriMercato } from './mercato.js';
import { sceltaIcona, sceltaViste } from './scelte.js';
import { VISTE, voceDisposizione, ALTEZZA_AUTOMATICA, nomeLayout, disposizionePropria } from './app.js';
import { apriImpostazioni } from './impostazioni.js';
import { apriMenu } from './menu.js';
import { ALTRO, COLORI, nomeEtichetta, creaEtichetta, salvaEtichette, chiediNuovaEtichetta } from './etichette.js';

const SOGLIA_TRASCINAMENTO = 6;   // px before a click becomes a drag
const PASSO_ALTEZZA = 8;
const ALTEZZA_MINIMA = 60;
const SOSTA_SEZIONE = 300;          // ms sopra un'altra sezione prima che diventi la destinazione
const SUGGERIMENTO = 'trascina per spostare · tira l\'angolo per ridimensionare';

export function avviaModifica({ stato, griglia, pagina, componi, applicaDimensioni, colonneTile, ridisponi, colonneSezione, ricarica, contesto }) {
  const barra = document.getElementById('barra-modifica');
  const misura = document.getElementById('modifica-misura');
  let gesto = null;
  let attesaSalvataggio = null;

  const tileDi = (id) => pagina().tile.find((t) => t.id === id);

  function entra() {
    // In Alarms and Full the view itself is arranged: its layout is separate and does not touch the
    // other views' (nor the other workspaces').
    disposizionePropria();
    stato.attiva = true;
    stato.nascoste = false;
    misura.textContent = SUGGERIMENTO;
    document.body.classList.add('disponendo');
    barra.hidden = false;
    componi();
    // The workspace tour stops while editing (app.js).
    document.dispatchEvent(new CustomEvent('fluxboard:modifica', { detail: true }));
  }
  function esci() {
    stato.attiva = false;
    document.body.classList.remove('disponendo');
    barra.hidden = true;
    componi();
    document.dispatchEvent(new CustomEvent('fluxboard:modifica', { detail: false }));
  }

  // ------------------------------------------------------------ notices with "Undo"


  async function api(percorso, metodo, corpo) {
    const r = await fetch(`/api/config${percorso}`, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const esito = await r.json().catch(() => ({}));
    if (!r.ok || esito.ok === false) throw new Error(esito.errore || (esito.errori || []).join('; ') || `errore ${r.status}`);
    return esito;
  }

  // ------------------------------------------------------------ layout, saved right away

  function salvaDisposizione() {
    clearTimeout(attesaSalvataggio);
    attesaSalvataggio = setTimeout(async () => {
      const p = pagina();
      try {
        await api('/layout', 'PUT', {
          display: nomeLayout(),
          workspace: p.workspace.attuale,
          tile: p.tile.map(voceDisposizione),
          sezioni: p.sezioni,
        });
      } catch (e) { avvisa(`Disposizione non salvata: ${e.message}`); }
    }, 400);
  }

  // Moves the tile to the cell under the copy following the pointer: column and row of the copy's
  // top left corner. Tiles there move down (or up, if dragged past their centre), then everything
  // rises to close the gaps. Over another section the tile takes its label and enters it in the
  // same cell.
  function sposta(e) {
    const sotto = document.elementsFromPoint(e.clientX, e.clientY);
    const sezione = sotto.find((el) => el.classList?.contains('sezione'));
    // With sections, between one section and another there is no grid to drop it on: wait.
    if (!sezione && griglia.classList.contains('con-sezioni')) return;
    const contenitore = sezione ? sezione.querySelector('.griglia-sezione') : griglia;
    if (!contenitore || (sezione && sezione.classList.contains('chiusa'))) return;
    const mossa = tileDi(gesto.id);
    gesto.ultimoEvento = e;
    // Another section becomes the target only if the pointer stays on it for a moment: passing over
    // it on the way further, the tile must not take its label.
    const nuova = sezione?.dataset.etichetta;
    griglia.querySelectorAll('.sezione.destinazione').forEach((x) => { if (x !== sezione) x.classList.remove('destinazione'); });
    if (nuova && nuova !== (mossa.argomento || ALTRO)) {
      sezione.classList.add('destinazione');
      if (gesto.candidata !== nuova) {
        gesto.candidata = nuova;
        gesto.candidataDal = performance.now();
        clearTimeout(gesto.attesaSezione);
        const g = gesto;
        gesto.attesaSezione = setTimeout(() => { if (gesto === g && g.ultimoEvento) sposta(g.ultimoEvento); }, SOSTA_SEZIONE + 20);
        return;
      }
      if (performance.now() - gesto.candidataDal < SOSTA_SEZIONE) return;
      cambiaEtichetta(mossa, nuova);
      sezione.classList.remove('destinazione');
    } else gesto.candidata = null;
    const totale = parseInt(contenitore.style.getPropertyValue('--colonne'), 10) || pagina().display.colonne || 4;
    const { gr, gap, colonna } = misuraGriglia(contenitore, totale);
    const sinistra = e.clientX - gesto.presaX, alto = e.clientY - gesto.presaY;
    const larghezza = Math.min(totale, colonneTile(mossa, contenitore));
    const x = Math.max(0, Math.min(totale - larghezza, Math.round((sinistra - gr.left) / (colonna + gap))));
    const y = Math.max(0, Math.round((alto - gr.top) / PASSO_ALTEZZA));
    const chiave = `${sezione?.dataset.etichetta || ''}:${x}:${y}`;
    if (chiave === gesto.bersaglio) return;
    gesto.bersaglio = chiave;
    mossa.x = x;
    mossa.y = y;
    gesto.cambiato = true;
    animaRiordino(() => {
      if (gesto.el.parentElement !== contenitore) {
        componi();     // cambiata sezione: la tile va nell'altra griglia
        gesto.el = griglia.querySelector(`.tile[data-id="${CSS.escape(gesto.id)}"]`) || gesto.el;
        gesto.el.classList.add('segnaposto', 'trascinata');
        mossa.x = x;
        mossa.y = y;
      }
      ridisponi({ mosso: mossa.id });
    });
  }

  // FLIP: tiles are measured before and after reordering and each slides from the old place to the
  // new one.
  function animaRiordino(fai) {
    const prima = new Map([...griglia.querySelectorAll('.tile, .sezione')].map((el) => [el, el.getBoundingClientRect()]));
    fai();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [el, r] of prima) {
      if (!el.isConnected || el === gesto?.el) continue;
      const n = el.getBoundingClientRect();
      const dx = r.left - n.left, dy = r.top - n.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  // The "lifted" tile: a copy following the pointer. A silhouette stays in its place.
  function solleva(g) {
    const r = g.el.getBoundingClientRect();
    const f = g.el.cloneNode(true);
    f.classList.add('fantasma');
    f.classList.remove('entra');
    Object.assign(f.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.append(f);
    g.fantasma = f;
    g.presaX = g.x - r.left;
    g.presaY = g.y - r.top;
    g.el.classList.add('segnaposto');
  }
  function muoviFantasma(g, e) {
    const r0 = parseFloat(g.fantasma.style.left), t0 = parseFloat(g.fantasma.style.top);
    g.fantasma.style.transform = `translate(${e.clientX - g.presaX - r0}px, ${e.clientY - g.presaY - t0}px) rotate(.6deg) scale(1.02)`;
  }
  // On release the copy flies to the new place, then disappears and the real tile shows again.
  function posa(g) {
    const f = g.fantasma;
    if (!f) return;
    const r = g.el.getBoundingClientRect();
    const fine = () => { f.remove(); g.el.classList.remove('segnaposto'); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { fine(); return; }
    const dx = r.left - parseFloat(f.style.left), dy = r.top - parseFloat(f.style.top);
    f.classList.add('posata');
    f.style.width = `${r.width}px`;
    f.style.height = `${r.height}px`;
    f.style.transform = `translate(${dx}px, ${dy}px)`;
    f.addEventListener('transitionend', fine, { once: true });
    setTimeout(fine, 320);
  }

  function cambiaEtichetta(t, n) {
    if (!n || (t.argomento || ALTRO) === n) return;
    t.argomento = n === ALTRO ? undefined : n;
    const a = pagina().globale.argomenti?.[n];
    t.colore = typeof a === 'string' ? a : a?.colore;
    gesto.etichetta = n;
  }

  // Width in columns of the grid holding the tile (the section or the page).
  function misuraGriglia(contenitore, totale) {
    const gr = contenitore.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(contenitore).columnGap) || 0;
    return { gr, gap, colonna: (gr.width - gap * (totale - 1)) / totale };
  }

  function ridimensiona(e) {
    const t = tileDi(gesto.id);
    const contenitore = gesto.el.parentElement;
    const totale = parseInt(contenitore.style.getPropertyValue('--colonne'), 10) || pagina().display.colonne || 4;
    const { gr, gap, colonna } = misuraGriglia(contenitore, totale);
    // Position re-read at every move: the page can move during the gesture.
    const r = gesto.el.getBoundingClientRect();
    const colonne = Math.round((e.clientX - r.left + gap) / (colonna + gap));
    const altezza = Math.round((e.clientY - r.top) / PASSO_ALTEZZA) * PASSO_ALTEZZA;
    // Past the section's edge: the section widens with the tile, up to the whole page. The
    // section's columns are the page's, so the tile grows at the same step.
    const sezione = gesto.el.closest('.sezione');
    const pagina_ = pagina().display.colonne || 4;
    if (sezione && colonne > totale && totale < pagina_) {
      const n = sezione.dataset.etichetta;
      const nuove = Math.min(pagina_, colonne);
      pagina().sezioni = { ...(pagina().sezioni || {}), [n]: { colonne: nuove } };
      t.colonne = nuove;      // l'altezza resta: la tile si sposta ridisegnando, e la misura sarebbe falsa
      componi();
      gesto.el = griglia.querySelector(`.tile[data-id="${CSS.escape(gesto.id)}"]`) || gesto.el;
      gesto.el.classList.add('ridimensionata');
      mostraMisura(`${nuove} di ${pagina_} colonne · la sezione si allarga`, e);
      gesto.cambiato = true;
      return;
    }
    const nuove = Math.max(1, Math.min(totale, colonne));
    // Widening only horizontally the height stays as it was (automatic, if it was): the tile keeps
    // adapting to its content. The height is fixed only when pulling vertically too. Text tiles and
    // tables are always as tall as their content (they "zip" with Shrink).
    const verticale = Math.abs(e.clientY - gesto.y) > 16 && !ALTEZZA_AUTOMATICA.has(t.tipo);
    const alta = verticale ? Math.max(ALTEZZA_MINIMA, altezza) : gesto.altezzaIniziale;
    if (nuove === gesto.ultime?.c && alta === gesto.ultime?.h) return;
    gesto.ultime = { c: nuove, h: alta };
    t.colonne = nuove;
    t.altezza_px = alta;
    // A shrunk tile shows only the beginning and would ignore the height: pulling it means wanting
    // it that way.
    if (t.ridotta) { t.ridotta = false; gesto.el.classList.remove('ridotta'); }
    applicaDimensioni(gesto.el, t);
    // Tiles covered by the new size move below; none changes width.
    ridisponi({ mosso: t.id });
    mostraMisura(`${t.colonne} di ${totale} colonne · ${t.altezza_px ? `${t.altezza_px} px` : 'altezza automatica'}`, e);
    gesto.cambiato = true;
  }

  // Sections: widened from the corner (in page columns) and reordered by dragging their heading;
  // the order is the labels' in the Settings.
  function ridimensionaSezione(e) {
    const p = pagina();
    const totale = p.display.colonne || 4;
    const { gap, colonna } = misuraGriglia(griglia, totale);
    const r = gesto.el.getBoundingClientRect();
    const colonne = Math.max(1, Math.min(totale, Math.round((e.clientX - r.left + gap) / (colonna + gap))));
    if (colonne !== Number(gesto.el.style.getPropertyValue('--cs'))) {
      p.sezioni = { ...(p.sezioni || {}), [gesto.id]: { colonne } };
      componi();
      gesto.cambiato = true;
    }
    mostraMisura(`Sezione ${nomeEtichetta(gesto.id)}: ${colonne} di ${totale} colonne`, e);
  }

  // A section is dragged by its heading anywhere on the page, even leaving free space on the left
  // or above: the others make room for it as tiles do.
  function spostaSezione(e) {
    const p = pagina();
    const totale = p.display.colonne || 4;
    const { gr, gap, colonna } = misuraGriglia(griglia, totale);
    const w = parseInt(gesto.el.style.getPropertyValue('--cs'), 10) || totale;
    const x = Math.max(0, Math.min(totale - w, Math.round((e.clientX - gesto.presaX - gr.left) / (colonna + gap))));
    const y = Math.max(0, Math.round((e.clientY - gesto.presaY - gr.top) / PASSO_ALTEZZA));
    const chiave = `${x}:${y}`;
    if (chiave === gesto.bersaglio) return;
    gesto.bersaglio = chiave;
    p.sezioni = { ...(p.sezioni || {}), [gesto.id]: { ...(p.sezioni?.[gesto.id] || {}), x, y } };
    gesto.cambiato = true;
    animaRiordino(() => ridisponi({ sezioneMossa: gesto.id }));
    mostraMisura(`Sezione ${nomeEtichetta(gesto.id)}: colonna ${x + 1}`, e);
  }

  // While resizing outside Edit the size shows near the pointer.
  function mostraMisura(testo, e) {
    misura.textContent = testo;
    if (stato.attiva) return;
    const bolla = document.getElementById('misura-volante');
    bolla.hidden = false;
    bolla.textContent = testo;
    // Next to the pointer, but always inside the window: near the right (or bottom) edge it moves
    // to the other side of the pointer instead of leaving the screen.
    const { width: l, height: a } = bolla.getBoundingClientRect();
    const margine = 8;
    const x = e.clientX + 14 + l > innerWidth - margine ? e.clientX - 14 - l : e.clientX + 14;
    const y = e.clientY + 14 + a > innerHeight - margine ? e.clientY - 14 - a : e.clientY + 14;
    bolla.style.left = `${Math.max(margine, Math.min(x, innerWidth - l - margine))}px`;
    bolla.style.top = `${Math.max(margine, Math.min(y, innerHeight - a - margine))}px`;
  }

  // Resizing works outside Edit too (corner ◢ on hover), so the real layout is visible, without the
  // hidden tiles that take room in Edit.
  griglia.addEventListener('pointerdown', (e) => {
    // The label on the tile is a button (click = menu) but it can be dragged from there too.
    if (e.button > 0 || e.target.closest('.strumenti, .aggiungi-tile, .aggiungi-qui, .icona-qui, .maniglia-colonna')) return;
    const maniglia = e.target.classList.contains('maniglia');
    const presa = e.target.classList.contains('presa');
    if (!stato.attiva && !((maniglia || presa) && pagina().globale.editor)) return;
    // Alarms and Full arrange themselves, at fixed sizes: nothing is moved or resized there.
    if (['allarmi', 'completa'].includes(document.body.dataset.vista) && !stato.attiva) return;
    const sezione = e.target.closest('.sezione');
    let tipo, el;
    if (e.target.classList.contains('maniglia-sezione')) { tipo = 'larghezza-sezione'; el = sezione; }
    else if (e.target.closest('.testa-sezione')) { tipo = 'sposta-sezione'; el = sezione; }
    else { el = e.target.closest('.tile'); tipo = maniglia ? 'ridimensiona' : 'sposta'; }
    if (!el) return;
    e.preventDefault();
    const t0 = tipo === 'ridimensiona' ? tileDi(el.dataset.id) : null;
    gesto = { tipo, id: el.dataset.id || el.dataset.etichetta, el, x: e.clientX, y: e.clientY, avviato: false, cambiato: false, altezzaIniziale: t0?.altezza_px };
  });
  addEventListener('pointermove', (e) => {
    if (!gesto) return;
    if (!gesto.avviato) {
      if (Math.hypot(e.clientX - gesto.x, e.clientY - gesto.y) < SOGLIA_TRASCINAMENTO) return;
      gesto.avviato = true;
      gesto.el.classList.add(gesto.tipo.startsWith('sposta') ? 'trascinata' : 'ridimensionata');
      document.body.classList.add('in-gesto');
      if (gesto.tipo === 'sposta') { solleva(gesto); document.body.classList.add('trascinando'); }
      if (gesto.tipo === 'sposta-sezione') { const r = gesto.el.getBoundingClientRect(); gesto.presaX = gesto.x - r.left; gesto.presaY = gesto.y - r.top; }
    }
    if (gesto.fantasma) muoviFantasma(gesto, e);
    ({ sposta, ridimensiona, 'larghezza-sezione': ridimensionaSezione, 'sposta-sezione': spostaSezione })[gesto.tipo](e);
  });
  const finisciGesto = () => {
    if (!gesto) return;
    const g = gesto;
    gesto = null;
    g.el.classList.remove('trascinata', 'ridimensionata');
    document.body.classList.remove('trascinando');
    clearTimeout(g.attesaSezione);
    griglia.querySelectorAll('.sezione.destinazione').forEach((x) => x.classList.remove('destinazione'));
    posa(g);
    document.body.classList.remove('in-gesto');
    document.getElementById('misura-volante').hidden = true;
    if (g.avviato) { g.el.dataset.appenaRidimensionata = '1'; setTimeout(() => delete g.el.dataset.appenaRidimensionata, 50); }
    if (!g.cambiato) return;
    if (g.etichetta) impostaEtichetta(g.id, g.etichetta, { ricarica: false }).catch((err) => avvisa(err.message));
    salvaDisposizione();
  };
  addEventListener('pointerup', finisciGesto);
  addEventListener('pointercancel', finisciGesto);

  // Double click on the handle: back to the automatic height (the width stays).
  griglia.addEventListener('dblclick', (e) => {
    if (!e.target.classList.contains('maniglia') || !(stato.attiva || pagina().globale.editor)) return;
    const el = e.target.closest('.tile');
    const t = tileDi(el.dataset.id);
    t.altezza_px = undefined;
    applicaDimensioni(el, t);
    misura.textContent = `${colonneTile(t, el.parentElement)} colonne · altezza automatica`;
    if (!stato.attiva) avvisa('Altezza automatica');
    salvaDisposizione();
  });

  // Label of the tile. If the file still used "colore: <label>" (0.1), that colour is removed,
  // otherwise it would keep applying.
  async function impostaEtichetta(id, n, { ricarica: rileggi = true } = {}) {
    const { oggetto } = await api(`/tile?id=${encodeURIComponent(id)}`, 'GET');
    const etichette = pagina().globale.argomenti || {};
    const campi = { etichetta: n === ALTRO ? null : n };
    if (oggetto.colore && oggetto.colore in etichette) campi.colore = null;
    await api('/tile', 'PUT', { id, campi });
    avvisa(`«${oggetto.titolo || id}» → ${nomeEtichetta(n)}`);
    if (rileggi) await ricarica();
  }

  // Icon of a label (applies to all its tiles and to the section).
  async function iconaEtichetta(n, ancora) {
    if (!n || n === ALTRO) { avvisa('Le tile senza gruppo non hanno un\'etichetta'); return; }
    const etichette = pagina().globale.argomenti || {};
    const a = typeof etichette[n] === 'string' ? { colore: etichette[n] } : { ...(etichette[n] || {}) };
    const scelta = await sceltaIcona(ancora, { attuale: a.icona || '', titolo: `Colore e icona di «${nomeEtichetta(n)}»`, colori: COLORI, colore: a.colore || 'grigio' });
    if (scelta === null) return;
    if (typeof scelta === 'object') a.colore = scelta.colore;
    else if (scelta) a.icona = scelta; else delete a.icona;
    await salvaEtichette({ ...etichette, [n]: a });
    avvisa(typeof scelta === 'object' ? `«${nomeEtichetta(n)}» ora è ${scelta.colore}` : `Icona di «${nomeEtichetta(n)}» cambiata`);
    await ricarica();
  }

  // Where the tile shows (👁), without opening the editor: the views, or nowhere (excluded, it stays
  // saved); for a tile from another workspace, remove it from this one.
  async function visteTile(id, ancora) {
    const t = tileDi(id);
    const scelta = await sceltaViste(ancora, { scelte: t.viste || [], viste: VISTE, esclusa: Boolean(t.spenta), ospite: t.ospite });
    if (scelta === null) return;
    if (scelta.togli) { await includiTile(id); return; }
    if (scelta.esclusa !== Boolean(t.spenta)) { await includiTile(id); if (scelta.esclusa) return; }
    const viste = scelta.viste;
    if (JSON.stringify(viste) === JSON.stringify(t.viste || [])) return;
    await api('/tile', 'PUT', { id, campi: { viste: viste.length ? viste : null } });
    t.viste = viste.length ? viste : undefined;
    avvisa(viste.length ? `«${t.titolo || id}»: solo in ${viste.map((v) => VISTE[v].testo).join(', ')}` : `«${t.titolo || id}»: in tutte le viste`);
    componi();
  }

  async function menuEtichetta(id, ancora) {
    const t = tileDi(id);
    const etichette = pagina().globale.argomenti || {};
    const v = await apriMenu(ancora, [
      ...Object.keys(etichette).map((n) => ({ valore: n, testo: nomeEtichetta(n), scelto: t.argomento === n })),
      { valore: ALTRO, testo: 'Nessuna: tile sganciata, fuori dai gruppi', scelto: !t.argomento },
      { separatore: true }, { valore: '__nuova', testo: '+ Nuova etichetta…' },
      ...(t.argomento ? [{ valore: '__icona', testo: `Colore e icona di «${nomeEtichetta(t.argomento)}»…` }] : []),
    ]);
    if (!v) return;
    if (v === '__icona') { await iconaEtichetta(t.argomento, ancora); return; }
    let n = v;
    if (v === '__nuova') {
      n = chiediNuovaEtichetta();
      if (!n) return;
      if (!(n in etichette)) await creaEtichetta(n, etichette);
    }
    await impostaEtichetta(id, n);
  }

  // ------------------------------------------------------------ tile tools

  async function modificaTile(id) {
    const { livello, fuso } = contesto();
    const esito = await apriEditor({ id, livello, fuso });
    if (esito) { avvisa('Tile salvata'); await ricarica(); }
  }

  // Add tile = the market: a kind from scratch (editor with the kind's fields), a ready-made tile
  // (added right away: it shows highlighted, even if it has nothing to say now), a free tile.
  async function aggiungiTile({ etichetta } = {}) {
    const p = pagina();
    const ws = p.workspace.attuale;
    if (etichetta === ALTRO) etichetta = undefined;
    const esito = await apriMercato({ workspace: ws, ricarica });
    const { livello, fuso } = contesto();
    if (esito?.genere) {
      const fatto = await apriEditor({ genere: esito.genere, livello, fuso, workspace: ws, etichetta });
      if (fatto) { avvisa('Tile aggiunta: trascinala dove preferisci'); await ricarica(); }
      return;
    }
    if (esito?.libera) {
      const tipo = await scegliTipo({ workspace: ws });
      if (!tipo) return;
      if (tipo.esistente) {
        const f = (await api('/', 'GET')).file.find((x) => x.nome === tipo.esistente);
        await api('/tile', 'PUT', { id: tipo.esistente, campi: { anche_in: [...new Set([...(f?.anche_in || []), ws])] } });
        avvisa('Tile aggiunta da un altro workspace');
        await ricarica();
        return;
      }
      const fatto = await apriEditor({ tipo, livello, fuso, workspace: ws, etichetta });
      if (fatto) { avvisa('Tile aggiunta: trascinala dove preferisci'); await ricarica(); }
      return;
    }
    const nuove = esito?.aggiunte || [];
    if (!nuove.length) return;
    if (!stato.attiva) entra();
    stato.nascoste = true;
    componi();
    const el = griglia.querySelector(`.tile[data-id="${CSS.escape(nuove.at(-1))}"]`);
    for (const id of nuove) griglia.querySelector(`.tile[data-id="${CSS.escape(id)}"]`)?.classList.add('appena-aggiunta');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => griglia.querySelectorAll('.appena-aggiunta').forEach((x) => x.classList.remove('appena-aggiunta')), 4000);
    avvisa(nuove.length === 1 ? 'Tile aggiunta: trascinala dove preferisci' : `${nuove.length} tile aggiunte: trascinale dove preferisci`);
  }

  async function duplicaTile(id) {
    const esito = await api('/duplica', 'POST', { id, display: pagina().display.nome });
    avvisa('Tile duplicata', async () => { await api(`/file?percorso=${encodeURIComponent(esito.percorso)}`, 'DELETE'); await ricarica(); });
    await ricarica();
  }

  // Tidy up: first the labels in the Settings' order (their priority), then the tiles without a
  // label; inside each label the tile's "priorita", then the title. The excluded ones at the end.
  // All the same size: a third of the page (two thirds for wide tables), automatic height; each
  // section as wide as its tiles, so sections sit side by side. "Undo" puts everything back.
  async function riordina() {
    const p = pagina();
    const ordine = Object.keys(p.globale.argomenti || {});
    const rango = (t) => (t.spenta ? 2e3 : 0) + (t.argomento && ordine.includes(t.argomento) ? ordine.indexOf(t.argomento) : 1e3);
    const prima = p.tile.map((t) => t.id);
    const posizioni = new Map(p.tile.map((t) => [t.id, { x: t.x, y: t.y, colonne: t.colonne, altezza_px: t.altezza_px, ridotta: t.ridotta }]));
    const sezioniPrima = structuredClone(p.sezioni || {});
    p.tile.sort((a, b) => rango(a) - rango(b) || (b.priorita ?? 50) - (a.priorita ?? 50)
      || String(a.titolo || a.id).localeCompare(String(b.titolo || b.id), 'it'));
    const totale = p.display.colonne || 4;
    const terzo = Math.max(1, Math.round(totale / 3));
    const larghezza = (t) => (t.larghezza === 'larga' ? Math.min(totale, terzo * 2) : terzo);
    for (const t of p.tile) { t.x = undefined; t.y = undefined; t.colonne = larghezza(t); t.altezza_px = undefined; t.ridotta = undefined; }
    // Sections: as many columns as their tiles need in a row, up to the whole page.
    const perSezione = {};
    for (const t of p.tile.filter((x) => !x.spenta)) perSezione[t.argomento || ALTRO] = (perSezione[t.argomento || ALTRO] || 0) + t.colonne;
    p.sezioni = Object.fromEntries(Object.entries(perSezione).map(([n, c]) => [n, { colonne: Math.min(totale, c) }]));
    componi();
    salvaDisposizione();
    // After saving the page reloads: undo puts the order back by id on the current one.
    avvisa('Tile riordinate per argomento, tutte della stessa misura', async () => {
      const ora = pagina();
      ora.tile.sort((a, b) => (prima.indexOf(a.id) + 1 || 1e9) - (prima.indexOf(b.id) + 1 || 1e9));
      for (const t of ora.tile) Object.assign(t, posizioni.get(t.id) || {});
      ora.sezioni = sezioniPrima;
      componi();
      salvaDisposizione();
    });
  }

  // Eye on the tile: switches the tile off/on; if it comes from another workspace it removes it
  // from here.
  async function includiTile(id) {
    const t = tileDi(id);
    const ws = pagina().workspace.attuale;
    const campi = t.ospite
      ? { anche_in: (t.anche_in || []).filter((w) => w !== ws).length ? (t.anche_in || []).filter((w) => w !== ws) : null }
      : { attiva: t.spenta ? null : false };
    await api('/tile', 'PUT', { id, campi });
    avvisa(t.ospite ? `«${t.titolo || id}» tolta da questo workspace` : t.spenta ? `«${t.titolo || id}» di nuovo inclusa` : `«${t.titolo || id}» esclusa: si vede solo in Modifica`);
    await ricarica();
  }

  async function eliminaTile(id) {
    const t = tileDi(id);
    const { percorso } = t;
    await api(`/file?percorso=${encodeURIComponent(percorso)}`, 'DELETE');
    const p = pagina();
    p.tile.splice(p.tile.indexOf(t), 1);
    componi();
    avvisa(`«${t.titolo || id}» eliminata`, async () => { await api('/ripristina', 'POST', { percorso }); await ricarica(); });
  }

  griglia.addEventListener('click', (e) => {
    const iconaQui = e.target.closest('.icona-qui');
    if (iconaQui) { e.stopPropagation(); iconaEtichetta(iconaQui.closest('.sezione').dataset.etichetta, iconaQui).catch((err) => avvisa(err.message)); return; }
    const aggiungi = e.target.closest('.aggiungi-tile, .aggiungi-qui');
    const comando = e.target.closest('.strumenti button, .etichetta-tile');
    if (!aggiungi && !comando) return;
    e.stopPropagation();
    if (comando?.closest('.tile').dataset.appenaRidimensionata) return;   // it was a drag
    const id = comando?.closest('.tile').dataset.id;
    const azione = aggiungi ? aggiungiTile({ etichetta: aggiungi.dataset.etichetta || aggiungi.closest('.sezione')?.dataset.etichetta }) : ({
      modifica: () => modificaTile(id),
      duplica: () => duplicaTile(id),
      elimina: () => eliminaTile(id),
      viste: () => visteTile(id, comando),
      etichetta: () => menuEtichetta(id, comando),
    }[comando.dataset.azione])();
    Promise.resolve(azione).catch((err) => avvisa(err.message));
  }, true);

  // "Hidden": the tiles not visible now show in their place, faded.
  document.getElementById('modifica-nascoste').addEventListener('click', () => { stato.nascoste = !stato.nascoste; componi(); });

  document.getElementById('modifica').addEventListener('click', () => (stato.attiva ? esci() : entra()));
  document.getElementById('modifica-fatto').addEventListener('click', esci);
  document.getElementById('modifica-aggiungi').addEventListener('click', () => aggiungiTile().catch((err) => avvisa(err.message)));
  document.getElementById('modifica-snapshot').addEventListener('click', () => gestisciSnapshot({ ricarica: () => location.reload() }).catch((err) => avvisa(err.message)));
  document.getElementById('modifica-riordina').addEventListener('click', () => riordina().catch((err) => avvisa(err.message)));
  document.getElementById('modifica-impostazioni').addEventListener('click', () => apriImpostazioni({ ricarica: () => location.reload() }).catch((err) => avvisa(err.message)));
  document.getElementById('modifica-sorgenti').addEventListener('click', () => gestisciSorgenti().then(() => ricarica()).catch((err) => avvisa(err.message)));
  addEventListener('keydown', (e) => { if (stato.attiva && e.key === 'Escape' && !document.querySelector('dialog[open]')) esci(); });
  return { aggiungiTile: () => aggiungiTile().catch((err) => avvisa(err.message)) };
}
