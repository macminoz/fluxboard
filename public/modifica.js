// Modalità "Modifica" della dashboard, sul modello delle dashboard più diffuse (Home Assistant,
// Grafana, schermata Home di iOS): un pulsante la attiva, ogni tile mostra i suoi comandi
// (modifica, duplica, elimina), si trascina per spostarla e si tira l'angolo per ridimensionarla,
// "+ Aggiungi tile" apre la scelta del tipo. Ogni modifica è salvata subito; l'eliminazione si può
// annullare dall'avviso che compare in basso, senza finestre di conferma.

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

const SOGLIA_TRASCINAMENTO = 6;   // px prima che un clic diventi un trascinamento
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
    // In Allarmi e Completa si dispone la vista stessa: la sua disposizione è a parte e non tocca
    // quella delle altre viste (né degli altri workspace).
    disposizionePropria();
    stato.attiva = true;
    stato.nascoste = false;
    misura.textContent = SUGGERIMENTO;
    document.body.classList.add('disponendo');
    barra.hidden = false;
    componi();
    // Il giro dei workspace si ferma finché si modifica (app.js).
    document.dispatchEvent(new CustomEvent('fluxboard:modifica', { detail: true }));
  }
  function esci() {
    stato.attiva = false;
    document.body.classList.remove('disponendo');
    barra.hidden = true;
    componi();
    document.dispatchEvent(new CustomEvent('fluxboard:modifica', { detail: false }));
  }

  // ------------------------------------------------------------ avvisi con "Annulla"


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

  // ------------------------------------------------------------ disposizione, salvata subito

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

  // Sposta la tile nella cella sotto la copia che segue il puntatore: colonna e riga dell'angolo in
  // alto a sinistra della copia. Le tile che stanno lì scendono (o salgono, se la si trascina oltre
  // il loro centro), poi tutto risale a chiudere i vuoti. Sopra un'altra sezione la tile ne prende
  // l'etichetta e ci entra nella stessa cella.
  function sposta(e) {
    const sotto = document.elementsFromPoint(e.clientX, e.clientY);
    const sezione = sotto.find((el) => el.classList?.contains('sezione'));
    // Con le sezioni, fra una sezione e l'altra non c'è una griglia dove posarla: si aspetta.
    if (!sezione && griglia.classList.contains('con-sezioni')) return;
    const contenitore = sezione ? sezione.querySelector('.griglia-sezione') : griglia;
    if (!contenitore || (sezione && sezione.classList.contains('chiusa'))) return;
    const mossa = tileDi(gesto.id);
    gesto.ultimoEvento = e;
    // Un'altra sezione diventa la destinazione solo se il puntatore ci resta un attimo: passandoci
    // sopra per arrivare più in là, la tile non deve prenderne l'etichetta.
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

  // FLIP: si misurano le tile prima e dopo il riordino e ognuna scivola dal posto vecchio al nuovo.
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

  // La tile "sollevata": una copia che segue il puntatore. Al suo posto resta una sagoma.
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
  // Al rilascio la copia vola nel posto nuovo, poi sparisce e la tile vera ricompare.
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

  // Larghezza in colonne della griglia che contiene la tile (la sezione o la pagina).
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
    // Posizione riletta a ogni movimento: la pagina può spostarsi durante il gesto.
    const r = gesto.el.getBoundingClientRect();
    const colonne = Math.round((e.clientX - r.left + gap) / (colonna + gap));
    const altezza = Math.round((e.clientY - r.top) / PASSO_ALTEZZA) * PASSO_ALTEZZA;
    // Oltre il bordo della sezione: la sezione si allarga con la tile, fino alla pagina intera.
    // Le colonne della sezione sono quelle della pagina, quindi la tile cresce allo stesso passo.
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
    // Allargando solo in orizzontale l'altezza resta com'era (automatica, se lo era): così la tile
    // continua ad adattarsi al suo contenuto. L'altezza si fissa solo tirando anche in verticale.
    // Le tile di testo e tabelle sono sempre alte quanto il contenuto (si "zippano" con Riduci).
    const verticale = Math.abs(e.clientY - gesto.y) > 16 && !ALTEZZA_AUTOMATICA.has(t.tipo);
    const alta = verticale ? Math.max(ALTEZZA_MINIMA, altezza) : gesto.altezzaIniziale;
    if (nuove === gesto.ultime?.c && alta === gesto.ultime?.h) return;
    gesto.ultime = { c: nuove, h: alta };
    t.colonne = nuove;
    t.altezza_px = alta;
    // Una tile ridotta mostra solo l'inizio e ignorerebbe l'altezza: tirarla vuol dire volerla così.
    if (t.ridotta) { t.ridotta = false; gesto.el.classList.remove('ridotta'); }
    applicaDimensioni(gesto.el, t);
    // Le tile che la nuova misura copre scendono sotto; nessuna cambia larghezza.
    ridisponi({ mosso: t.id });
    mostraMisura(`${t.colonne} di ${totale} colonne · ${t.altezza_px ? `${t.altezza_px} px` : 'altezza automatica'}`, e);
    gesto.cambiato = true;
  }

  // Sezioni: si allargano dall'angolo (a colonne della pagina) e si riordinano trascinandone
  // l'intestazione; l'ordine è quello delle etichette nelle Impostazioni.
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

  // Una sezione si trascina dall'intestazione dove si vuole nella pagina, anche lasciando spazio
  // libero a sinistra o sopra: le altre le fanno posto come fanno le tile.
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

  // Durante un ridimensionamento fuori da Modifica la misura compare vicino al puntatore.
  function mostraMisura(testo, e) {
    misura.textContent = testo;
    if (stato.attiva) return;
    const bolla = document.getElementById('misura-volante');
    bolla.hidden = false;
    bolla.textContent = testo;
    // Accanto al puntatore, ma sempre dentro la finestra: vicino al bordo destro (o in basso) passa
    // dall'altra parte del puntatore invece di uscire dallo schermo.
    const { width: l, height: a } = bolla.getBoundingClientRect();
    const margine = 8;
    const x = e.clientX + 14 + l > innerWidth - margine ? e.clientX - 14 - l : e.clientX + 14;
    const y = e.clientY + 14 + a > innerHeight - margine ? e.clientY - 14 - a : e.clientY + 14;
    bolla.style.left = `${Math.max(margine, Math.min(x, innerWidth - l - margine))}px`;
    bolla.style.top = `${Math.max(margine, Math.min(y, innerHeight - a - margine))}px`;
  }

  // Il ridimensionamento funziona anche fuori da Modifica (angolo ◢ al passaggio del mouse), così
  // si vede la disposizione vera, senza le tile nascoste che in Modifica occupano posto.
  griglia.addEventListener('pointerdown', (e) => {
    // L'etichetta sulla tile è un pulsante (click = menu) ma da lì si può anche trascinare.
    if (e.button > 0 || e.target.closest('.strumenti, .aggiungi-tile, .aggiungi-qui, .icona-qui, .maniglia-colonna')) return;
    const maniglia = e.target.classList.contains('maniglia');
    const presa = e.target.classList.contains('presa');
    if (!stato.attiva && !((maniglia || presa) && pagina().globale.editor)) return;
    // Allarmi e Completa si dispongono da sole, a misure fisse: lì non si sposta né si ridimensiona.
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

  // Doppio click sulla maniglia: torna all'altezza automatica (la larghezza resta).
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

  // Etichetta della tile. Se il file usava ancora "colore: <etichetta>" (0.1), quel colore si
  // toglie, altrimenti continuerebbe a valere.
  async function impostaEtichetta(id, n, { ricarica: rileggi = true } = {}) {
    const { oggetto } = await api(`/tile?id=${encodeURIComponent(id)}`, 'GET');
    const etichette = pagina().globale.argomenti || {};
    const campi = { etichetta: n === ALTRO ? null : n };
    if (oggetto.colore && oggetto.colore in etichette) campi.colore = null;
    await api('/tile', 'PUT', { id, campi });
    avvisa(`«${oggetto.titolo || id}» → ${nomeEtichetta(n)}`);
    if (rileggi) await ricarica();
  }

  // Icona di un'etichetta (vale per tutte le sue tile e per la sezione).
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

  // Dove compare la tile (👁), senza aprire l'editor: le viste, oppure da nessuna parte (esclusa,
  // resta salvata); per una tile di un altro workspace, toglierla da questo.
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

  // ------------------------------------------------------------ comandi delle tile

  async function modificaTile(id) {
    const { livello, fuso } = contesto();
    const esito = await apriEditor({ id, livello, fuso });
    if (esito) { avvisa('Tile salvata'); await ricarica(); }
  }

  // Aggiungi tile = il market: un genere da zero (editor con i campi del genere), una tile pronta
  // (aggiunta subito: si vede evidenziata, anche se adesso non ha niente da dire), una tile libera.
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

  // Riordina: prima gli argomenti nell'ordine delle Impostazioni (la loro priorità), poi le tile
  // senza argomento; dentro ogni argomento la "priorita" della tile, poi il titolo. Le escluse in
  // fondo. Tutte della stessa misura: un terzo di pagina (due terzi le tabelle larghe), altezza
  // automatica; ogni sezione larga quanto le sue tile, così le sezioni si affiancano. "Annulla"
  // riporta tutto com'era.
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
    // Sezioni: tante colonne quante ne servono per le loro tile in fila, fino alla pagina intera.
    const perSezione = {};
    for (const t of p.tile.filter((x) => !x.spenta)) perSezione[t.argomento || ALTRO] = (perSezione[t.argomento || ALTRO] || 0) + t.colonne;
    p.sezioni = Object.fromEntries(Object.entries(perSezione).map(([n, c]) => [n, { colonne: Math.min(totale, c) }]));
    componi();
    salvaDisposizione();
    // Dopo il salvataggio la pagina si ricarica: l'annullamento rimette l'ordine per id su quella attuale.
    avvisa('Tile riordinate per argomento, tutte della stessa misura', async () => {
      const ora = pagina();
      ora.tile.sort((a, b) => (prima.indexOf(a.id) + 1 || 1e9) - (prima.indexOf(b.id) + 1 || 1e9));
      for (const t of ora.tile) Object.assign(t, posizioni.get(t.id) || {});
      ora.sezioni = sezioniPrima;
      componi();
      salvaDisposizione();
    });
  }

  // Occhio sulla tile: spegne/riaccende la tile; se viene da un altro workspace la toglie da qui.
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
    if (comando?.closest('.tile').dataset.appenaRidimensionata) return;   // era un trascinamento
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

  // "Nascoste": le tile che adesso non si vedono compaiono al loro posto, in trasparenza.
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
