// La pagina: chiede al server la composizione, disegna le tile e le tiene aggiornate con il
// flusso di eventi. Ordine e dimensioni vengono dalla disposizione del display (modalità
// "Modifica", salvata in config/layout/<display>.yaml); le tile non ancora disposte si
// accodano per priorità, quindi aggiungerne una non sposta a mano nessun'altra.

import { compilaCondizione } from './condizione.js';
import { proteggi, relativo, perLivello } from './formato.js';
import { TIPI, STABILI, rigaAttuale } from './tipi.js';
import { avviaModifica } from './modifica.js';
import { attivaGrafici, legendaGrafico } from './grafico.js';
import { icona } from './icone.js';
import { apriMenu } from './menu.js';
import { attivaAzioni } from './azioni.js';
import { avvisa } from './avvisi.js';
import { aggiornaSegnale, attivaSegnale } from './segnale.js';
import { ALTRO, nomeEtichetta } from './etichette.js';
import { scegliFinestra, selettoreFinestre } from './cronologia.js';
import { disponi } from './disposizione.js';

const parametri = new URLSearchParams(location.search);
let workspace = parametri.get('workspace') || memoria('fluxboard.workspace') || 'default';
const griglia = document.getElementById('griglia');
const avviso = document.getElementById('avviso');

// Griglia "a mattoni": righe da UNITA px; l'altezza di una tile diventa un numero di righe.
const UNITA = 8;

// Comandi della tile, uguali in Modifica e al passaggio del mouse: ⚙ modifica, 👁 dove compare
// (viste, oppure esclusa), ⧉ duplica, ✕ elimina.
const ICONA = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const STRUMENTI = '<div class="strumenti">'
  + `<button type="button" data-azione="modifica" data-tip="Modifica" aria-label="Modifica la tile">${icona('ingranaggio', 'icona-barra')}</button>`
  + `<button type="button" data-azione="viste" data-tip="Dove compare" aria-label="Scegli dove compare la tile">${icona('occhio', 'icona-barra')}</button>`
  + `<button type="button" data-azione="duplica" data-tip="Duplica" aria-label="Duplica la tile">${ICONA('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>')}</button>`
  + `<button type="button" data-azione="elimina" data-tip="Elimina" aria-label="Elimina la tile">${ICONA('<path d="M18 6 6 18M6 6l12 12"/>')}</button>`
  + '</div>'
  // In Modifica: l'etichetta della tile, da cambiare con un click (o trascinandola in un'altra sezione).
  + '<button type="button" class="etichetta-tile" data-azione="etichetta" data-tip="Cambia etichetta (e sezione)"></button>'
  // Riduci / espandi le tile lunghe: passandoci sopra si vede l'altro stato, il click lo rende fisso.
  + '<button type="button" class="riduci" aria-expanded="true"><span class="freccia" aria-hidden="true"></span><span class="testo-riduci"></span></button>';
const SOGLIA_LUNGA = 280;         // px oltre i quali una tile si può ridurre
// Larghezze "a parole" come frazione della griglia, così valgono su qualunque numero di colonne.
const LARGHEZZE = { stretta: 1 / 4, media: 1 / 2, larga: 1 };

let pagina = null;      // { globale, display, tile, stato }
let livello = null;
// Viste: Base, Media e Avanzata sono i livelli di dettaglio; Allarmi e Completa filtrano le tile
// (con un loro livello di dettaglio) e si dispongono da sole, senza toccare le posizioni salvate.
export const VISTE = {
  base: { livello: 'base', testo: 'Base', icona: 'vista_base' },
  media: { livello: 'intermedia', testo: 'Media', icona: 'vista_media' },
  avanzata: { livello: 'avanzata', testo: 'Avanzata', icona: 'vista_avanzata' },
  allarmi: { livello: 'intermedia', testo: 'Allarmi', icona: 'allarme', filtro: true },
  completa: { livello: 'avanzata', testo: 'Completa', icona: 'vista_completa', filtro: true },
};
const DA_LIVELLO = { base: 'base', intermedia: 'media', avanzata: 'avanzata' };
let vista = 'media';
// Allarmi e Completa si dispongono da sole finché non le si dispone in Modifica: da lì hanno una
// disposizione propria (salvata a parte), che non tocca quella delle altre viste.
const chiaveDisposizione = (v = vista) => (VISTE[v]?.filtro ? v : '');
const vistaFiltro = () => Boolean(VISTE[vista]?.filtro) && !disposizione.attiva && !pagina?.disposizioni?.[vista];
// Nome del file di disposizione: quello del display, con la vista per Allarmi e Completa.
export const nomeLayout = () => (chiaveDisposizione() ? `${pagina.display.nome}--${chiaveDisposizione()}` : pagina.display.nome);

// Le misure e le posizioni della disposizione attiva stanno nelle tile (t.x, t.colonne…): cambiando
// vista si mette da parte quella di prima e si carica quella della vista nuova.
// (Le larghezze delle colonne delle tabelle no: valgono per il display in tutte le viste.)
const CAMPI_DISPOSIZIONE = ['colonne', 'altezza_px', 'ridotta', 'chiusa', 'x', 'y'];
function scambiaDisposizione(prima, dopo) {
  if (prima === dopo || !pagina) return;
  const d = pagina.disposizioni;
  if (prima === '' || d[prima]) d[prima] = { tile: Object.fromEntries(pagina.tile.map((t) => [t.id, Object.fromEntries(CAMPI_DISPOSIZIONE.map((k) => [k, t[k]]))])), sezioni: pagina.sezioni };
  const nuova = d[dopo];
  for (const t of pagina.tile) {
    const v = nuova?.tile?.[t.id] || {};
    for (const k of CAMPI_DISPOSIZIONE) t[k] = v[k];
  }
  pagina.sezioni = nuova?.sezioni || {};
}
// Una vista-filtro disposta per la prima volta in Modifica: da qui ha una disposizione sua.
export function disposizionePropria() {
  const k = chiaveDisposizione();
  if (k && !pagina.disposizioni[k]) pagina.disposizioni[k] = { tile: {}, sezioni: {} };
}
let connessionePersaDal = null;
const timerImmagini = new Map();
const immaginiAssenti = new Set();   // tile immagine il cui stream adesso non arriva
const osservatore = new ResizeObserver((voci) => {
  for (const v of voci) {
    const el = v.target.closest('.tile, .sezione');
    if (el.classList.contains('sezione')) adattaSezione(el); else adattaAltezza(el);
  }
  // Un'altezza cambiata sposta le tile sotto: si ridispone (una volta per fotogramma).
  programmaRidisposizione();
});

let ridisposizione = 0;
function programmaRidisposizione() {
  if (ridisposizione || !pagina) return;
  ridisposizione = requestAnimationFrame(() => { ridisposizione = 0; ridisponi(); });
}

function memoria(chiave, valore) {
  try {
    if (valore === undefined) return localStorage.getItem(chiave);
    localStorage.setItem(chiave, valore);
  } catch { return null; }
  return valore;
}

function nomeDisplay() {
  if (parametri.get('display')) return parametri.get('display');
  return innerWidth < 700 ? 'mobile' : '';
}

const ordineLivello = (l) => pagina.globale.livelli.indexOf(l);
const disposizione = { attiva: false, nascoste: false };   // aggiornato da modifica.js

function contesto() {
  return { livello, livelli: pagina.globale.livelli, fuso: pagina.globale.fuso, controlli: pagina.display.controlli !== false || parametri.has('controlli') };
}

// Il contesto di una tile già nella pagina: se la sua intestazione ha la legenda, il grafico non la ripete.
const contestoTile = (el) => ({ ...contesto(), legendaInTesta: Boolean(el.querySelector('.testa .g-legenda')) });

// Una tile è visibile se il livello lo consente e se ha qualcosa da dire.
// Righe ci sono, ma tutti i campi che la tile mostra sono vuoti: per chi guarda è "niente".
const CAMPO = /\{([\w.]+)(?::[\w%]+)?\}/g;
function tuttoVuoto(t, righe) {
  const modelli = [...(t.voci || []), ...(t.tabella || [])].map((v) => v.valore).filter(Boolean)
    .flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
  if (!modelli.length) return false;
  const campi = [...new Set(modelli.flatMap((m) => [...String(m).matchAll(CAMPO)].map((x) => x[1])))];
  const pieno = (v) => v !== undefined && v !== null && v !== '';
  return !righe.some((r) => campi.some((c) => pieno(c.split('.').reduce((o, k) => o?.[k], r))));
}

function condizioneSuRighe(condizione, righe) {
  try { const prova = compilaCondizione(condizione); return righe.some(prova); } catch { return true; }
}

function haQualcosaDaDire(t) {
  if (ordineLivello(livello) < ordineLivello(t.livello_minimo)) return false;
  if (t.tipo === 'errore') return livello === 'avanzata';
  // Un'immagine con "sparisce se vuota" sparisce quando lo stream non arriva.
  if (t.tipo === 'immagine') return t.mostra_se !== 'dati' || !immaginiAssenti.has(t.id);
  if (t.mostra_se === 'mai') return false;      // raccoglie solo avvisi
  if (t.mostra_se === 'sempre' || !t.conDati) return true;
  const s = pagina.stato[t.id];
  // mostra_se può anche essere una condizione: la tile compare se almeno una riga la rispetta.
  if (s?.righe?.length) {
    if (t.mostra_se && t.mostra_se !== 'dati') return condizioneSuRighe(t.mostra_se, s.righe);
    return !tuttoVuoto(t, s.righe);
  }
  return Boolean(s?.errore) && livello === 'avanzata';
}

// In Modifica la griglia resta quella vera della vista (le tile nascoste adesso non spostano le
// altre); con "Nascoste" si mostrano anche loro, in trasparenza.
function visibile(t) {
  if (disposizione.attiva && disposizione.nascoste) return t.tipo !== 'errore';
  // Viste scelte per la tile (👁): fuori da quelle non compare; in quelle compare, e nelle viste
  // Allarmi e Completa anche senza allarme. Senza scelta valgono le regole di sempre.
  if (Array.isArray(t.viste) && t.viste.length) {
    if (!t.viste.includes(vista)) return false;
    if (VISTE[vista]?.filtro) return !t.spenta && t.mostra_se !== 'mai';
  }
  if (vista === 'completa') return !t.spenta && t.mostra_se !== 'mai' && t.tipo !== 'errore';
  if (vista === 'allarmi') return !t.spenta && haQualcosaDaDire(t) && inAllarme(t);
  return !t.spenta && haQualcosaDaDire(t);
}

// Una tile "in allarme" per la vista Allarmi: una regola colore_se vera che accende un colore di
// allarme (rosso, arancio, giallo; o con `allarme: true`), oppure una riga con un tono di allarme
// o di attenzione. Una regola che prende il colore di un'etichetta (es. "riscaldamento" quando la
// valvola è aperta) dice uno stato, non un allarme.
const TONI_ALLARME = new Set(['allarme', 'attenzione']);
const COLORI_ALLARME = new Set(['rosso', 'arancio', 'giallo']);
function inAllarme(t) {
  const s = pagina.stato[t.id];
  const righe = s?.righe || [];
  if (!righe.length) return false;
  for (const [condizione, scelta] of Object.entries(t.colore_se || {})) {
    const colore = typeof scelta === 'string' ? scelta : scelta?.colore;
    const esplicito = typeof scelta === 'object' && scelta !== null && typeof scelta.allarme === 'boolean' ? scelta.allarme : null;
    const allarme = esplicito ?? (COLORI_ALLARME.has(colore) && !(colore in (pagina.globale.argomenti || {})));
    if (!allarme) continue;
    const vera = t.tipo === 'grafico' ? (() => { try { return compilaCondizione(condizione)(rigaAttuale(t, s)); } catch { return false; } })() : condizioneSuRighe(condizione, righe);
    if (vera) return true;
  }
  for (const v of [...(t.tabella || []), ...(t.voci || [])]) {
    if (!v?.tono || typeof v.tono !== 'object') continue;
    for (const [condizione, tono] of Object.entries(v.tono)) {
      if (TONI_ALLARME.has(tono) && condizioneSuRighe(condizione, righe)) return true;
    }
  }
  return false;
}

function perche(t) {
  if (t.spenta) return 'esclusa';
  if (t.mostra_se === 'mai') return 'raccoglie avvisi';
  if (ordineLivello(livello) < ordineLivello(t.livello_minimo)) return `dal livello ${t.livello_minimo}`;
  return t.tipo === 'immagine' ? 'telecamera assente' : 'niente da mostrare adesso';
}

// Larghezza massima: quella della griglia che contiene la tile (la sezione o la pagina).
const colonneDi = (contenitore) => parseInt(contenitore?.style.getPropertyValue('--colonne'), 10) || pagina.display.colonne || 4;

// Larghezze in colonne della pagina ("stretta" = un quarto); in una sezione più stretta la tile
// si ferma alla larghezza della sezione.
export function colonneTile(t, contenitore) {
  const pagina_ = pagina.display.colonne || 4;
  // Viste Allarmi e Completa: misure fisse, per una pagina ordinata: un terzo di pagina, due terzi
  // per le tile "larghe" (tabelle con molte colonne).
  if (vistaFiltro()) return Math.max(1, Math.min(colonneDi(contenitore), Math.round(pagina_ * (t.larghezza === 'larga' ? 2 / 3 : 1 / 3))));
  const richieste = t.colonne ?? Math.round(pagina_ * (LARGHEZZE[t.larghezza] ?? 1 / 4));
  return Math.max(1, Math.min(colonneDi(contenitore), richieste));
}

// Disposizione esplicita (public/disposizione.js): ogni tile ha colonna e riga, e resta dove la
// si lascia. Qui si raccolgono le misure vere (colonne scelte, righe dall'altezza del contenuto),
// si chiede la disposizione e la si applica con --gx/--gy. Sugli schermi stretti la griglia è a una
// colonna sola: si dispone lì per lì senza toccare le posizioni salvate.
const STRETTO = matchMedia('(max-width: 700px)');
STRETTO.addEventListener('change', () => pagina && ridisponi());
const righeDi = (el) => parseInt(el?.style.getPropertyValue('--r'), 10) || 10;

function contenitori() {
  const visibili = pagina.tile.filter(visibile);
  if (!sezioniAttive()) return [{ g: griglia, proprie: visibili }];
  return [...griglia.querySelectorAll(':scope > .sezione')].map((s) => {
    const n = s.dataset.etichetta;
    const proprie = visibili.filter((t) => etichettaDi(t) === n);
    const g = s.querySelector('.griglia-sezione');
    const colonne = colonneSezione(n, proprie);
    g.style.setProperty('--colonne', colonne);
    s.style.setProperty('--cs', colonne);
    return { g, proprie, s };
  });
}

// mosso: l'id della tile appena spostata o ridimensionata (le altre le fanno posto);
// sezioneMossa: l'etichetta della sezione appena spostata.
export function ridisponi({ mosso = null, sezioneMossa = null } = {}) {
  for (const { g, proprie, s } of contenitori()) {
    const stretto = STRETTO.matches;
    const colonne = stretto ? 1 : colonneDi(g);
    const el = new Map(proprie.map((t) => [t.id, g.querySelector(`:scope > .tile[data-id="${CSS.escape(t.id)}"]`)]));
    // Nelle viste Allarmi e Completa le tile si dispongono da sole, per priorità: le posizioni
    // salvate valgono per le altre viste e qui non si toccano.
    const automatica = stretto || vistaFiltro();
    const ordinate = vistaFiltro() ? [...proprie].sort((a, b) => (b.priorita ?? 50) - (a.priorita ?? 50)) : proprie;
    const voci = ordinate.map((t) => ({ id: t.id, x: automatica ? undefined : t.x, y: automatica ? undefined : t.y, w: colonneTile(t, g), h: righeDi(el.get(t.id)) }));
    const posti = disponi(voci, colonne, { mosso });
    for (const t of proprie) {
      const p = posti.get(t.id), e = el.get(t.id);
      if (!automatica) { t.x = p.x; t.y = p.y; }
      if (!e) continue;
      e.style.setProperty('--c', p.w);
      e.style.setProperty('--gx', p.x + 1);
      e.style.setProperty('--gy', p.y + 1);
    }
    g.classList.add('posizionata');
    // Fuori da Modifica la sezione è larga quanto le sue tile: niente spazio vuoto a destra.
    // In Modifica resta larga quanto scelto, per avere dove posare una tile.
    if (s && !stretto && !disposizione.attiva && proprie.length) {
      const usate = Math.max(...proprie.map((t) => { const p = posti.get(t.id); return p.x + p.w; }));
      if (usate < colonne) { g.style.setProperty('--colonne', usate); s.style.setProperty('--cs', usate); }
    }
    if (s) adattaSezione(s);
  }
  disponiSezioni(sezioneMossa);
}

// Anche le sezioni hanno un posto nella pagina (colonna x, riga y), come le tile dentro di loro:
// così una sezione si può spostare a destra lasciando spazio libero, invece di finire per forza
// accanto all'ultima. Quelle mai spostate si mettono nel primo posto libero, nell'ordine delle
// etichette (come prima). Le posizioni si scrivono nella disposizione solo in Modifica.
function disponiSezioni(mossa) {
  const tutte = sezioniAttive() ? [...griglia.querySelectorAll(':scope > .sezione')] : [];
  if (!tutte.length || STRETTO.matches) { griglia.classList.remove('sezioni-posizionate'); return; }
  const totale = pagina.display.colonne || 4;
  const automatica = vistaFiltro();
  // Le sezioni vuote (solo in Modifica, per trascinarci una tile) stanno in fondo, in fila: non
  // occupano i vuoti fra le altre e non hanno una posizione da salvare.
  const sezioni = tutte.filter((el) => !el.classList.contains('vuota'));
  const vuote = tutte.filter((el) => el.classList.contains('vuota'));
  const larghezza = (el) => parseInt(el.style.getPropertyValue('--cs'), 10) || totale;
  const voci = sezioni.map((el) => {
    const sz = pagina.sezioni?.[el.dataset.etichetta] || {};
    return { id: el.dataset.etichetta, x: automatica ? undefined : sz.x, y: automatica ? undefined : sz.y, w: larghezza(el), h: righeDi(el) };
  });
  const posti = disponi(voci, totale, { mosso: mossa });
  let fondo = 0;
  for (const el of sezioni) {
    const n = el.dataset.etichetta;
    const p = posti.get(n);
    el.style.setProperty('--gx', p.x + 1);
    el.style.setProperty('--gy', p.y + 1);
    fondo = Math.max(fondo, p.y + p.h);
    if (disposizione.attiva && !automatica) pagina.sezioni = { ...pagina.sezioni, [n]: { ...(pagina.sezioni?.[n] || {}), x: p.x, y: p.y } };
  }
  let x = 0, riga = fondo, alta = 0;
  for (const el of vuote) {
    const w = Math.min(totale, larghezza(el));
    if (x + w > totale) { x = 0; riga += alta; alta = 0; }
    el.style.setProperty('--gx', x + 1);
    el.style.setProperty('--gy', riga + 1);
    x += w; alta = Math.max(alta, righeDi(el));
  }
  griglia.classList.add('sezioni-posizionate');
}

function piede(t) {
  const s = pagina.stato[t.id];
  if (!t.conDati || !s) return '';
  const avanzata = livello === 'avanzata';
  const eta = s.aggiornato ? relativo(s.aggiornato) : 'mai';
  if (s.errore) {
    return livello === 'base' ? '' : `<p class="piede problema">⚠ ${avanzata ? proteggi(s.errore) : 'sorgente non raggiungibile'} · dato di ${eta}</p>`;
  }
  if (Date.now() - s.aggiornato > t.scadenza) return `<p class="piede problema">dato di ${eta}</p>`;
  return '';   // ogni quanto e quando: nel ritmo, sulla riga del titolo
}

// "ogni 1 min", "ogni 5 s": la frequenza di lettura della tile, detta a parole.
function passo(ms) {
  if (!ms) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `${+(ms / 60_000).toFixed(1)} min`;
  return `${+(ms / 3_600_000).toFixed(1)} h`;
}

// Ogni quanto si rilegge la tile, in breve ("60s", "5m", "6h"), sulla riga del titolo; al
// passaggio del mouse anche quando l'ha fatto l'ultima volta. Se il dato è vecchio diventa giallo.
function breve(ms) {
  if (ms < 120_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${+(ms / 3_600_000).toFixed(1)}h`;
}
function ritmo(t) {
  if (!t.conDati || !t.ogni) return '';
  const s = pagina.stato[t.id];
  const eta = s?.aggiornato ? `aggiornato ${relativo(s.aggiornato)}` : 'non ancora letta';
  const vecchio = s && (s.errore || Date.now() - s.aggiornato > t.scadenza);
  return `<span class="ritmo${vecchio ? ' vecchio' : ''}" title="Si rilegge ogni ${passo(t.ogni)} · ${eta}">${breve(t.ogni)}</span>`;
}

// Titolo vuoto (titolo: "") = tile senza intestazione. Con un `link` tutta la tile diventa
// cliccabile e porta alla vista completa (Grafana, VictoriaLogs, ...).
function intestazione(t) {
  let titolo = perLivello(t.titolo, livello, pagina.globale.livelli) ?? t.id;
  const a = pagina.globale.argomenti?.[t.argomento];
  const iconaEtichetta = typeof a === 'object' ? a?.icona : null;
  // Dentro una sezione l'icona e il nome dell'etichetta sono già nell'intestazione della sezione:
  // la tile non li ripete (resta solo un'icona propria diversa da quella dell'etichetta).
  const inSezione = sezioniAttive();
  if (inSezione && uguali(titolo, nomeEtichetta(etichettaDi(t)))) titolo = '';
  const nomeIcona = inSezione ? (t.icona && t.icona !== iconaEtichetta ? t.icona : null) : (t.icona || iconaEtichetta);
  const legenda = t.tipo === 'grafico' ? legendaGrafico(t) : '';   // sulla riga del titolo: un rigo in più al disegno
  // A destra, sulla riga del titolo: i periodi (se la tile li ha), ogni quanto si rilegge, il link.
  const zip = `<button type="button" class="chiudi-tile" data-chiudi-tile aria-expanded="${!t.chiusa}" title="${t.chiusa ? 'Apri la tile' : 'Chiudi la tile: resta solo il titolo'}" aria-label="${t.chiusa ? 'Apri la tile' : 'Chiudi la tile'}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>`;
  const destra = `<span class="testa-destra">${t.chiusa ? '' : selettoreFinestre(t)}${ritmo(t)}${t.link ? '<span class="apri" aria-hidden="true">↗</span>' : ''}${zip}</span>`;
  if (!titolo) return `<h2 class="${legenda ? 'con-legenda ' : ''}senza-titolo">${legenda}${destra}</h2>`;
  const segno = nomeIcona ? `<span class="segno-tile">${icona(nomeIcona)}</span>` : '';
  return `<h2${legenda ? ' class="con-legenda"' : ''}>${segno}<span class="titolo-tile">${proteggi(titolo)}</span>${legenda}${destra}</h2>`;
}

const uguali = (x, y) => String(x || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  === String(y || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Larghezza in colonne; altezza fissa (pixel) oppure automatica, cioè quanto serve al contenuto.
const spazio = (el) => parseFloat(getComputedStyle(el).marginBottom) || 0;

// Viste Allarmi e Completa: tutte le tile della stessa altezza, per una griglia regolare (il
// contenuto lungo scorre dentro la tile).
const ALTEZZA_FILTRO = 300;

// Tile di testo e tabelle: niente barra di scorrimento, la tile è alta quanto il suo contenuto.
// Se è lunga si può "zippare" (Riduci: si vede l'inizio). Grafici, immagini e pagine riempiono
// invece lo spazio che hanno: per loro l'altezza scelta è quella.
export const ALTEZZA_AUTOMATICA = new Set(['elenco', 'valori', 'valore', 'cronologia', 'testo', 'orologio']);
export function applicaDimensioni(el, t) {
  if (ALTEZZA_AUTOMATICA.has(t.tipo)) t = { ...t, altezza_px: undefined };
  el.classList.toggle('chiusa-tile', Boolean(t.chiusa));
  if (t.chiusa) t = { ...t, altezza_px: undefined, ridotta: false };     // solo il titolo: altezza di quello
  else if (vistaFiltro() && !t.ridotta && !ALTEZZA_AUTOMATICA.has(t.tipo)) t = { ...t, altezza_px: ALTEZZA_FILTRO };
  const gap = spazio(el);
  el.style.setProperty('--c', colonneTile(t, el.parentElement));
  const ridotta = Boolean(t.ridotta);
  el.classList.toggle('ridotta', ridotta);
  el.classList.toggle('altezza-fissa', Boolean(t.altezza_px) && !ridotta);
  if (t.altezza_px && !ridotta) {
    el.style.height = `${t.altezza_px}px`;
    el.style.setProperty('--r', Math.ceil((t.altezza_px + gap) / UNITA));
  } else {
    el.style.height = '';
    adattaAltezza(el);
  }
}

function adattaAltezza(el) {
  // In anteprima la tile si apre sopra le altre: la griglia non deve muoversi.
  if (!el || el.classList.contains('altezza-fissa') || el.classList.contains('anteprima-estesa')) return;
  // Prima si decide se è "lunga" (cambia lo spazio in basso per il pulsante), poi si misura.
  const intera = el.querySelector('.corpo')?.scrollHeight || 0;
  el.classList.toggle('lunga', intera > SOGLIA_LUNGA || el.classList.contains('ridotta'));
  const gap = spazio(el);
  const stile = getComputedStyle(el);
  const cornice = parseFloat(stile.paddingTop) + parseFloat(stile.paddingBottom) + parseFloat(stile.borderTopWidth) + parseFloat(stile.borderBottomWidth);
  const h = el.querySelector('.dentro').getBoundingClientRect().height + cornice;
  el.style.setProperty('--r', Math.max(1, Math.ceil((h + gap) / UNITA)));
}

// Ridotta = si vede l'inizio, il resto sfuma. Si salva nella disposizione del display; se non si
// può (editor protetto da password e non ancora entrati) resta almeno in questo browser.
// La disposizione di questo display, com'è adesso: misure, posizioni, ridotte e chiuse. Un solo
// punto per salvarla, così nessun pulsante dimentica un pezzo (le posizioni, dalla 0.4).
export const voceDisposizione = (x) => ({ id: x.id, colonne: x.colonne, altezza: x.altezza_px, ridotta: x.ridotta || undefined, chiusa: x.chiusa || undefined, x: x.x, y: x.y, colonne_tabella: x.larghezze && Object.keys(x.larghezze).length ? x.larghezze : undefined });
async function salvaDisposizioneOra() {
  const r = await fetch('/api/config/layout', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display: nomeLayout(), workspace: pagina.workspace.attuale, tile: pagina.tile.map(voceDisposizione) }),
  });
  if (!r.ok) throw new Error(String(r.status));
}

// Chiusa = si vede solo la riga del titolo (un click sulla freccia la apre e la chiude).
async function cambiaChiusura(t, el) {
  t.chiusa = !t.chiusa;
  applicaDimensioni(el, t);
  el.querySelector('[data-chiudi-tile]')?.setAttribute('aria-expanded', String(!t.chiusa));
  ridisponi();
  try { await salvaDisposizioneOra(); } catch { avvisa('Non salvata: la tile tornerà aperta ricaricando'); }
}

async function cambiaRiduzione(t, el) {
  t.ridotta = !t.ridotta;
  el.classList.remove('anteprima-estesa', 'anteprima-ridotta');
  applicaDimensioni(el, t);
  aggiornaRiduci(el, t);
  try {
    await salvaDisposizioneOra();
  } catch {
    const locali = JSON.parse(memoria('fluxboard.ridotte') || '{}');
    locali[t.id] = t.ridotta;
    memoria('fluxboard.ridotte', JSON.stringify(locali));
  }
}

function aggiornaRiduci(el, t) {
  const b = el.querySelector('.riduci');
  if (!b) return;
  b.setAttribute('aria-expanded', String(!t.ridotta));
  b.querySelector('.testo-riduci').textContent = t.ridotta ? 'Mostra tutto' : 'Riduci';
  b.title = t.ridotta ? 'Passa sopra per vedere tutto, click per lasciarla aperta' : 'Click per ridurla';
}

// "colore_se": il colore della tile segue i dati. { "<condizione>": colore | argomento |
// { colore, sfondo } }; vince la prima condizione vera su almeno una riga.
function coloreDaiDati(t, s) {
  if (!t.colore_se || !s?.righe?.length) return null;
  for (const [condizione, scelta] of Object.entries(t.colore_se)) {
    let vera = false;
    // Un grafico guarda solo il punto più recente: un acceso di stamattina non colora la tile adesso.
    try { vera = t.tipo === 'grafico' ? compilaCondizione(condizione)(rigaAttuale(t, s)) : s.righe.some(compilaCondizione(condizione)); } catch { /* segnalata dal validatore */ }
    if (!vera) continue;
    const nome = typeof scelta === 'string' ? scelta : scelta?.colore;
    const a = pagina.globale.argomenti?.[nome];
    return {
      colore: typeof a === 'string' ? a : a?.colore || nome,
      sfondo: typeof scelta === 'object' && scelta?.sfondo !== undefined ? Boolean(scelta.sfondo) : typeof a === 'object' ? a.sfondo !== false : true,
    };
  }
  return null;
}

function disegna(el, t) {
  el._firma = firmaTile(t);
  const s = pagina.stato[t.id];
  const daiDati = coloreDaiDati(t, s);
  const colore = daiDati?.colore || t.colore;
  if (colore) el.dataset.colore = colore; else delete el.dataset.colore;
  const sfondo = daiDati ? daiDati.sfondo : (t.sfondo ?? (t.sfondoEtichetta && !sezioniAttive()));
  el.classList.toggle('con-sfondo', Boolean(colore && sfondo));
  el.classList.toggle('acceso-dai-dati', Boolean(daiDati));
  // Intensità del colore di una tile accesa: tinta di fondo, anello e alone (predefinita 10%).
  const forza = Math.max(0, Math.min(100, Number(t.intensita ?? 10)));
  el.style.setProperty('--intensita', `${forza}%`);
  // Scelta nella tile (anche 0%): vale per tutte le tinte della tile, non solo quando si accende.
  el.classList.toggle('intensita-propria', t.intensita !== undefined && t.intensita !== null);
  el.style.setProperty('--intensita-anello', `${forza === 0 ? 0 : Math.min(90, 20 + forza * 3)}%`);
  el.style.setProperty('--intensita-alone', `${Math.min(70, forza * 3)}%`);
  const vecchio = t.conDati && s && (s.errore || Date.now() - s.aggiornato > t.scadenza);
  el.classList.toggle('vecchio', Boolean(vecchio));
  el.classList.toggle('nascosta-ora', disposizione.attiva && !haQualcosaDaDire(t));
  el.querySelector('.testa').innerHTML = intestazione(t);
  const chip = el.querySelector('.etichetta-tile');
  const statoTile = t.spenta ? 'Esclusa · ' : !haQualcosaDaDire(t) ? `Nascosta: ${perche(t)} · ` : t.ospite ? `Da «${t.ospite}» · ` : '';
  chip.textContent = statoTile + nomeEtichetta(t.argomento);
  chip.dataset.colore = coloreEtichetta(t.argomento) || 'grigio';
  el.querySelector('.piede-box').innerHTML = piede(t);
  const corpo = el.querySelector('.corpo');
  if (!(STABILI.has(t.tipo) && corpo.dataset.firma === t.url)) {
    corpo.dataset.firma = t.url || '';
    corpo.innerHTML = (TIPI[t.tipo] || TIPI.errore)(t, s, contestoTile(el));
    if (t.tipo === 'immagine') avviaImmagine(t, corpo.querySelector('img'));
  }
  applicaDimensioni(el, t);
  if (t.tipo === 'grafico') adattaGrafico(el, t, s);
}

// Il grafico si ridisegna sui pixel veri della tile: larghezza disponibile e, se la tile ha
// un'altezza fissa, l'altezza che resta sotto la testa (altrimenti circa un terzo della larghezza).
function adattaGrafico(el, t, s) {
  const corpo = el.querySelector('.corpo');
  const g = corpo.querySelector('.grafico');
  const svg = g?.querySelector('svg');
  if (!svg || !g.clientWidth) return;
  const l = g.clientWidth;
  const a = el.classList.contains('altezza-fissa')
    ? corpo.getBoundingClientRect().bottom - svg.getBoundingClientRect().top - 2
    : Math.min(Math.max(l * 0.3, 120), 240);
  const vb = svg.viewBox.baseVal;
  if (Math.abs(vb.width - l) < 2 && Math.abs(vb.height - a) < 2) return;
  corpo.innerHTML = TIPI.grafico(t, s, { ...contestoTile(el), misure: { l, a } });
}

// Cambia la finestra: i grafici si rimisurano (una volta, a ridimensionamento finito).
let timerGrafici;
addEventListener('resize', () => {
  clearTimeout(timerGrafici);
  timerGrafici = setTimeout(() => {
    for (const el of document.querySelectorAll('.tile')) {
      const t = pagina?.tile?.find((x) => x.id === el.dataset.id);
      if (t?.tipo === 'grafico') adattaGrafico(el, t, pagina.stato[t.id]);
    }
  }, 200);
});

// Una tile immagine nascosta perché lo stream non arriva: ogni 20 s si riprova con un'immagine
// fuori pagina; appena arriva il primo fotogramma la tile ricompare.
function sonda(t, origine) {
  const prova = new Image();
  const giro = setInterval(() => { prova.src = `${origine}${origine.includes('?') ? '&' : '?'}_=${Date.now()}`; }, 20_000);
  prova.onload = () => { clearInterval(giro); prova.src = ''; immaginiAssenti.delete(t.id); componi(); };
}

function avviaImmagine(t, img) {
  clearInterval(timerImmagini.get(t.id));
  img.draggable = false;
  // Pannello: niente stream continuo (pesante per un touch a muro), un fotogramma ogni 2 secondi.
  const leggero = document.body.classList.contains('pannello') && !t.aggiorna_ogni && !t.diretto;
  const ogni = leggero ? 2000 : t.aggiorna_ogni;
  const carica = () => { img.src = ogni ? `${img.dataset.src}${img.dataset.src.includes('?') ? '&' : '?'}${leggero ? 'fotogramma=1&' : ''}_=${Date.now()}` : img.dataset.src; };
  // Se lo stream cade (telecamera spenta, rete) lo si dice e si riprova da soli.
  const assente = img.parentElement.querySelector('.immagine-assente');
  img.onload = () => { if (assente) assente.hidden = true; if (immaginiAssenti.delete(t.id)) componi(); };
  img.onerror = () => {
    if (assente) assente.hidden = false;
    if (!immaginiAssenti.has(t.id)) {
      immaginiAssenti.add(t.id);
      if (t.mostra_se === 'dati') { componi(); sonda(t, img.dataset.src); }
    }
    setTimeout(() => { if (img.isConnected) img.src = `${img.dataset.src}${img.dataset.src.includes('?') ? '&' : '?'}_=${Date.now()}`; }, 10_000);
  };
  carica();
  if (ogni) timerImmagini.set(t.id, setInterval(carica, ogni));
}

// ---------------------------------------------------------------- sezioni per etichetta

const sezioniAttive = () => (pagina.display.sezioni ?? pagina.globale.sezioni) !== false;
const etichettaDi = (t) => t.argomento || ALTRO;
function coloreEtichetta(n) {
  const a = pagina.globale.argomenti?.[n];
  return typeof a === 'string' ? a : a?.colore;
}
const chiuse = new Set(JSON.parse(memoria('fluxboard.sezioni-chiuse') || '[]'));

// Ordine delle sezioni: quello delle etichette nelle Impostazioni, poi le etichette scritte solo
// nelle tile, in fondo "Altro". In Modifica ci sono anche le sezioni vuote, per trascinarci tile.
function ordineSezioni(visibili) {
  const note = Object.keys(pagina.globale.argomenti || {});
  const presenti = new Set(visibili.map(etichettaDi));
  const ordinate = [...note.filter((n) => presenti.has(n)),
    ...[...presenti].filter((n) => !note.includes(n) && n !== ALTRO).sort(), ...(presenti.has(ALTRO) ? [ALTRO] : [])];
  // Le vuote vanno in fondo: non spostano le sezioni vere.
  if (disposizione.attiva) ordinate.push(...[...note, ALTRO].filter((n) => !presenti.has(n)));
  return ordinate;
}

// Larghezza di una sezione: quella scelta in Modifica, altrimenti quanto basta alle sue tile,
// fino a mezza pagina (così le sezioni piccole si affiancano come quadranti).
export function colonneSezione(n, tile = []) {
  const totale = pagina.display.colonne || 4;
  // Le tile senza gruppo stanno libere su tutta la larghezza della pagina. Nelle viste Allarmi e
  // Completa ogni gruppo è largo quanto le sue tile (tutte della stessa misura) e i gruppi si affiancano.
  if (vistaFiltro()) return Math.min(totale, Math.max(Math.round(totale / 3), tile.reduce((x, t) => x + Math.round(totale * (t.larghezza === 'larga' ? 2 / 3 : 1 / 3)), 0)));
  if (n === ALTRO && !pagina.sezioni?.[n]?.colonne) return totale;
  const scelte = pagina.sezioni?.[n]?.colonne;
  const meta = totale >= 8 ? totale / 2 : totale;
  const somma = tile.reduce((x, t) => x + colonneTile(t), 0);
  return Math.max(1, Math.min(totale, scelte ?? Math.min(meta, Math.max(somma, Math.ceil(totale / 4)))));
}

function creaSezione(n) {
  const el = document.createElement('section');
  el.className = 'sezione';
  el.dataset.etichetta = n;
  el.innerHTML = `<div class="dentro-sezione"><header class="testa-sezione">
      <button type="button" class="apri-chiudi" aria-expanded="true"><span class="segno-tile"></span><h2></h2><span class="conta"></span><span class="allerte"></span><span class="freccia" aria-hidden="true"></span></button>
      <button type="button" class="icona-qui pulsante-icona" data-tip="Colore e icona di questa etichetta" aria-label="Cambia colore e icona di questa etichetta">${icona('matita', 'icona-barra')}</button>
      <button type="button" class="aggiungi-qui pulsante-icona" data-tip="Aggiungi una tile in questa sezione" aria-label="Aggiungi una tile in questa sezione">${icona('piu', 'icona-barra')}</button>
    </header><div class="griglia griglia-sezione"></div><p class="sezione-vuota">Trascina qui una tile per darle questa etichetta</p></div>
    <span class="maniglia-sezione" title="Trascina per cambiare la larghezza della sezione"></span>`;
  el.querySelector('.apri-chiudi').addEventListener('click', () => {
    if (disposizione.attiva || el.dataset.appenaRidimensionata) return;
    if (chiuse.has(n)) chiuse.delete(n); else chiuse.add(n);
    memoria('fluxboard.sezioni-chiuse', JSON.stringify([...chiuse]));
    componi();
  });
  osservatore.observe(el.querySelector('.dentro-sezione'));
  return el;
}

function adattaSezione(el) {
  const h = el.querySelector('.dentro-sezione').getBoundingClientRect().height;
  el.style.setProperty('--r', Math.max(1, Math.ceil((h + spazio(el)) / UNITA)));
}

function disegnaSezione(el, n, tile) {
  const a = pagina.globale.argomenti?.[n];
  const nomeIcona = typeof a === 'object' ? a?.icona : null;
  el.dataset.colore = coloreEtichetta(n) || 'grigio';
  el.querySelector('.segno-tile').innerHTML = nomeIcona ? icona(nomeIcona) : '';
  el.querySelector('.segno-tile').hidden = !nomeIcona;
  el.querySelector('h2').textContent = nomeEtichetta(n);
  const chiusa = chiuse.has(n) && !disposizione.attiva;
  el.classList.toggle('chiusa', chiusa);
  el.querySelector('.apri-chiudi').setAttribute('aria-expanded', String(!chiusa));
  el.querySelector('.conta').textContent = tile.length ? String(tile.length) : '';
  el.classList.toggle('vuota', !tile.length);
  const g = el.querySelector('.griglia-sezione');
  const colonne = colonneSezione(n, tile);
  g.style.setProperty('--colonne', colonne);
  el.style.setProperty('--cs', colonne);
  return g;
}

function creaTile(t) {
  const el = document.createElement('section');
  // Solo le tile che compaiono dopo il primo disegno entrano con la transizione: all'apertura
  // la pagina deve essere leggibile subito (e sugli e-ink non c'è nulla da animare).
  el.className = griglia.dataset.pronta ? 'tile entra' : 'tile';
  el.dataset.id = t.id;
  el.innerHTML = '<div class="dentro"><header class="testa"></header><div class="corpo"></div><footer class="piede-box"></footer></div>'
    + STRUMENTI
    + '<span class="maniglia" title="Trascina per ridimensionare · doppio click: altezza automatica"></span>'
    + '<span class="presa" title="Trascina per spostare (anche in un\'altra sezione)" aria-hidden="true"></span>';
  el.addEventListener('animationend', () => el.classList.remove('entra'), { once: true });
  const riduci = el.querySelector('.riduci');
  const tileDi = () => pagina.tile.find((x) => x.id === el.dataset.id);
  riduci.addEventListener('click', (e) => { e.stopPropagation(); cambiaRiduzione(tileDi(), el); });
  riduci.addEventListener('mouseenter', () => { if (tileDi()?.ridotta) el.classList.add('anteprima-estesa'); });
  // L'anteprima resta finché il puntatore è sulla tile (il pulsante scende con lei).
  el.addEventListener('mouseleave', () => el.classList.remove('anteprima-estesa'));
  // Il link della tile vale per un click "sulla tile", non sui suoi pulsanti (azioni, riduci…).
  el.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select, label, dialog, .maniglia, .presa') || el.dataset.appenaRidimensionata) return;
    // Su un pannello niente link: aprirebbero una scheda da cui sul touch non si torna indietro.
    if (el.dataset.link && !disposizione.attiva && !document.body.classList.contains('pannello')) window.open(el.dataset.link, '_blank', 'noopener');
  });
  osservatore.observe(el.querySelector('.dentro'));
  return el;
}

// Mette le tile nel contenitore nell'ordine dato, riusando gli elementi esistenti.
function sistema(contenitore, tile, presenti) {
  let precedente = null;
  for (const t of tile) {
    const el = presenti.get(t.id) || creaTile(t);
    const atteso = precedente ? precedente.nextSibling : contenitore.firstChild;
    if (el !== atteso) contenitore.insertBefore(el, atteso);
    presenti.delete(t.id);
    precedente = el;
    el.dataset.tipo = t.tipo;
    el.classList.toggle('spenta', Boolean(t.spenta));
    el.classList.toggle('ospite', Boolean(t.ospite));
    aggiornaRiduci(el, t);
    el.dataset.link = t.link || '';
    el.classList.toggle('cliccabile', Boolean(t.link));
    if (t.link) el.title = 'Apri la vista completa';
    else el.removeAttribute('title');
    // Si ridisegna solo una tile cambiata: con molte tile e un aggiornamento al secondo,
    // ridisegnarle tutte bloccava i pannelli lenti (il tocco non rispondeva più).
    if (el._firma !== firmaTile(t)) disegna(el, t);
  }
  return precedente;
}

// Quello da cui dipende il disegno di una tile: i suoi dati (un oggetto nuovo a ogni lettura),
// la tile stessa e le sue misure, la vista, la modalità e il tempo a passi di 30 secondi (per
// "5m fa" e per i dati che invecchiano).
const numeri = new WeakMap();
let prossimoNumero = 0;
const numero = (o) => { if (!o || typeof o !== 'object') return 0; if (!numeri.has(o)) numeri.set(o, ++prossimoNumero); return numeri.get(o); };
function firmaTile(t) {
  return JSON.stringify([numero(pagina.stato[t.id]), numero(t), livello, vista, disposizione.attiva, disposizione.nascoste, sezioniAttive(),
    t.colonne, t.altezza_px, t.ridotta, t.chiusa, t.larghezze, t.intensita, t.spenta, immaginiAssenti.has(t.id), griglia.clientWidth,
    // Sfalsato per tile: non scattano tutte nello stesso istante.
    Math.floor((Date.now() + (numero(t) * 7919) % 30_000) / 30_000)]);
}

// Gli aggiornamenti arrivano a raffica (molte tile lette nello stesso minuto): si ridisegna una
// volta sola per raffica, e su un pannello al massimo una volta al secondo.
let attesaComponi = null;
function programmaComponi() {
  if (attesaComponi) return;
  attesaComponi = setTimeout(() => { attesaComponi = null; componi(); }, document.body.classList.contains('pannello') ? 1000 : 150);
}

// Senza sezioni, in fondo alla griglia il riquadro per aggiungere una tile (con le sezioni c'è il
// "+" nell'intestazione di ognuna: un riquadro in più cambierebbe la disposizione).
function pulsanteAggiungi(contenitore, etichetta) {
  let b = contenitore.querySelector(':scope > .aggiungi-tile');
  if (!disposizione.attiva) { b?.remove(); return; }
  if (!b) {
    b = document.createElement('button');
    b.type = 'button';
    b.className = 'aggiungi-tile';
    b.innerHTML = '<span aria-hidden="true">+</span> Aggiungi tile';
  }
  if (etichetta) b.dataset.etichetta = etichetta;
  contenitore.append(b);
}

// Allinea la pagina all'elenco delle tile visibili, riusando gli elementi esistenti: così gli
// stream non si interrompono e le tile che compaiono entrano con una breve transizione.
// Con le sezioni attive le tile si raggruppano per etichetta, una sezione per etichetta.
export function componi() {
  const visibili = pagina.tile.filter(visibile);
  const presenti = new Map([...griglia.querySelectorAll('.tile')].map((el) => [el.dataset.id, el]));
  const sezioni = new Map([...griglia.querySelectorAll(':scope > .sezione')].map((el) => [el.dataset.etichetta, el]));
  griglia.classList.toggle('con-sezioni', sezioniAttive());
  if (sezioniAttive()) {
    let precedente = null;
    for (const n of ordineSezioni(visibili)) {
      const el = sezioni.get(n) || creaSezione(n);
      const atteso = precedente ? precedente.nextSibling : griglia.firstChild;
      if (el !== atteso) griglia.insertBefore(el, atteso);
      sezioni.delete(n);
      precedente = el;
      const proprie = visibili.filter((t) => etichettaDi(t) === n);
      const g = disegnaSezione(el, n, proprie);
      sistema(g, proprie, presenti);
      const allerte = g.querySelectorAll('.tile.acceso-dai-dati').length;
      el.querySelector('.allerte').textContent = allerte ? `${allerte} in evidenza` : '';
      adattaSezione(el);
    }
    griglia.querySelectorAll('.aggiungi-tile').forEach((b) => b.remove());
  } else {
    sistema(griglia, visibili, presenti);
    pulsanteAggiungi(griglia);
  }
  for (const [id, el] of presenti) { clearInterval(timerImmagini.get(id)); osservatore.unobserve(el.querySelector('.dentro')); el.remove(); }
  for (const el of sezioni.values()) { osservatore.unobserve(el.querySelector('.dentro-sezione')); el.remove(); }
  ridisponi();
  vassoio();
  riepilogo(visibili);
  const vuoto = pagina.workspace?.vuoto;
  document.getElementById('ws-vuoto').hidden = !vuoto;
  document.getElementById('vuota').hidden = visibili.length > 0 || vuoto;
  griglia.dataset.pronta = '1';
}

// In Modifica: quante tile adesso non si vedono, sul pulsante "Nascoste" della barra (premuto, la
// griglia le mostra in trasparenza al loro posto).
function vassoio() {
  const b = document.getElementById('modifica-nascoste');
  if (!b) return;
  const mostrate = disposizione.nascoste;
  disposizione.nascoste = false;
  const quante = pagina.tile.filter((t) => t.tipo !== 'errore' && !visibile(t)).length;
  disposizione.nascoste = mostrate;
  b.querySelector('.conta-nascoste').textContent = quante ? String(quante) : '';
  b.setAttribute('aria-pressed', String(Boolean(disposizione.nascoste)));
  b.disabled = !quante && !disposizione.nascoste;
}

// In alto, come nell'app Casa di Apple: una pillola per sezione, con le tile in evidenza.
// Un click porta alla sezione (e la riapre se era chiusa).
function riepilogo(visibili) {
  const box = document.getElementById('riepilogo');
  const sezioni = sezioniAttive() && !disposizione.attiva ? [...griglia.querySelectorAll(':scope > .sezione:not(.vuota)')] : [];
  box.hidden = !sezioni.length;
  if (box.hidden) return;
  box.innerHTML = sezioni.map((el) => {
    const n = el.dataset.etichetta;
    const a = pagina.globale.argomenti?.[n];
    const nomeIcona = typeof a === 'object' ? a?.icona : null;
    const allerte = el.querySelectorAll('.tile.acceso-dai-dati').length;
    const quante = visibili.filter((t) => etichettaDi(t) === n).length;
    // Solo l'icona (e il numero di avvisi): il nome si apre al passaggio del mouse.
    return `<button type="button" class="pillola${allerte ? ' in-evidenza' : ''}" data-vai="${proteggi(n)}" data-colore="${proteggi(coloreEtichetta(n) || 'grigio')}" aria-label="${proteggi(`${nomeEtichetta(n)}: ${quante} tile${allerte ? `, ${allerte} in evidenza` : ''}`)}">
      <span class="segno-tile">${nomeIcona ? icona(nomeIcona) : proteggi(nomeEtichetta(n).slice(0, 1).toUpperCase())}</span><span class="nome-pillola">${proteggi(nomeEtichetta(n))}<span class="quante">${quante}</span></span>${allerte ? `<span class="allerta-pillola">${allerte}</span>` : ''}</button>`;
  }).join('');
}
document.getElementById('riepilogo').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vai]');
  if (!b) return;
  const n = b.dataset.vai;
  if (chiuse.delete(n)) { memoria('fluxboard.sezioni-chiuse', JSON.stringify([...chiuse])); componi(); }
  griglia.querySelector(`.sezione[data-etichetta="${CSS.escape(n)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function aggiornaAvviso() {
  if (connessionePersaDal) {
    avviso.hidden = false;
    avviso.textContent = `Connessione al server persa ${relativo(connessionePersaDal)}: i dati mostrati possono essere vecchi.`;
  } else avviso.hidden = true;
}

export function scegliVista(v, { ricorda = true } = {}) {
  if (!VISTE[v]) return;
  const prima = chiaveDisposizione();
  vista = v;
  scambiaDisposizione(prima, chiaveDisposizione());
  livello = VISTE[v].livello;
  if (ricorda) memoria('fluxboard.vista', v);
  document.body.dataset.vista = v;
  pulsantiViste();
  componi();
}

// Le viste come icone sulla riga della testata: il nome si apre al passaggio del mouse (come le
// pillole dei gruppi). In Modifica le due viste-filtro non servono: si dispone la pagina vera.
function pulsantiViste() {
  const box = document.getElementById('viste');
  if (!box) return;
  box.innerHTML = Object.entries(VISTE).map(([k, v]) => `<button type="button" class="vista${v.filtro ? ' filtro' : ''}" data-vista="${k}" aria-pressed="${k === vista}" aria-label="Vista ${v.testo}">${icona(v.icona, 'icona-barra')}<span class="nome-vista">${v.testo}</span></button>`).join('');
}
export const vistaAttuale = () => vista;

function controlli() {
  const box = document.getElementById('controlli');
  const forzati = parametri.has('controlli');
  if (pagina.display.controlli === false && !forzati) { box.hidden = true; return; }
  box.hidden = false;
  pulsantiViste();
  document.getElementById('viste').onclick = (e) => {
    const b = e.target.closest('[data-vista]');
    if (b) scegliVista(b.dataset.vista);
  };
  document.getElementById('modifica').hidden = !pagina.globale.editor;
  sceltaWorkspace();
  document.body.classList.toggle('con-editor', Boolean(pagina.globale.editor));
}

// Workspace: "default" e gli altri; da qui se ne crea uno nuovo (pagina vuota) o si elimina quello aperto.
function vaiAlWorkspace(nome) {
  const p = new URLSearchParams(location.search);
  if (nome === 'default') p.delete('workspace'); else p.set('workspace', nome);
  memoria('fluxboard.workspace', nome);
  location.search = p.toString();
}

function sceltaWorkspace() {
  const scelta = document.getElementById('scegli-workspace');
  const { attuale, elenco } = pagina.workspace;
  document.getElementById('nome-workspace').textContent = attuale;
  scelta.onclick = async () => {
    const v = await apriMenu(scelta, [
      ...elenco.map((w) => ({ valore: w, testo: w, scelto: w === attuale })),
      ...(pagina.globale.editor ? [{ separatore: true }, { valore: '__nuovo', testo: '+ Nuovo workspace…' },
        ...(attuale === 'default' ? [] : [{ valore: '__elimina', testo: 'Elimina questo workspace…', pericolo: true }])] : []),
    ]);
    if (!v) return;
    if (v === '__nuovo') {
      const nome = (prompt('Nome del nuovo workspace (minuscole, cifre e trattini)') || '').trim().toLowerCase();
      if (!nome) return;
      const r = await fetch('/api/config/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
      const esito = await r.json().catch(() => ({}));
      if (!r.ok) { avvisa(`✕ ${esito.errore || 'workspace non creato'}`); return; }
      vaiAlWorkspace(nome);
    } else if (v === '__elimina') {
      if (!confirm(`Eliminare il workspace "${attuale}" con tutte le sue tile? Resta recuperabile nel cestino della configurazione.`)) return;
      await fetch(`/api/config/workspace?nome=${encodeURIComponent(attuale)}`, { method: 'DELETE' });
      vaiAlWorkspace('default');
    } else if (v !== attuale) vaiAlWorkspace(v);
  };
}

async function caricaPagina() {
  // auto=1: il display l'ha solo indovinato il browser; il server può sceglierne uno per questo schermo.
  const r = await fetch(`/api/pagina?display=${encodeURIComponent(nomeDisplay())}${parametri.get('display') ? '' : '&auto=1'}&workspace=${encodeURIComponent(workspace)}`, { cache: 'no-store' });
  pagina = await r.json();
  // Un workspace che non esiste più torna al default.
  workspace = pagina.workspace.attuale;
  memoria('fluxboard.workspace', workspace);
  pagina.disposizioni = { '': null, ...(pagina.disposizioniViste || {}) };
  const ridotteQui = JSON.parse(memoria('fluxboard.ridotte') || '{}');
  for (const t of pagina.tile) if (t.id in ridotteQui && t.ridotta === undefined) t.ridotta = ridotteQui[t.id];
  document.title = pagina.globale.titolo;
  adesso();
  document.getElementById('titolo').textContent = pagina.globale.titolo;
  const versione = document.getElementById('versione');
  versione.textContent = pagina.versione ? `v${pagina.versione}` : '';
  versione.title = pagina.versione ? `Fluxboard ${pagina.versione}` : '';
  const tema = pagina.globale.tema;
  if (tema === 'chiaro') document.documentElement.dataset.theme = 'light';
  else if (tema === 'scuro') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  document.documentElement.style.setProperty('--colonne', pagina.display.colonne || 4);
  document.documentElement.style.setProperty('--unita', `${UNITA}px`);
  document.body.dataset.display = pagina.display.nome;
  // Pannello (touch a muro, chiosco): sola lettura e leggero. Vedi stile.css, "Modalità pannello".
  document.body.classList.toggle('pannello', pagina.display.pannello === true);
  // ?vista=allarmi (o il vecchio ?livello=avanzata), poi quella ricordata, poi quella del display.
  const richiesta = parametri.get('vista') || DA_LIVELLO[parametri.get('livello')];
  const ricordata = pagina.display.controlli === false ? null : (memoria('fluxboard.vista') || DA_LIVELLO[memoria('fluxboard.livello')]);
  vista = [richiesta, ricordata, pagina.display.vista, DA_LIVELLO[pagina.globale.livello]].find((v) => VISTE[v]) || 'media';
  livello = VISTE[vista].livello;
  scambiaDisposizione('', chiaveDisposizione());
  document.body.dataset.vista = vista;
  controlli();
  preparaGiro();
  componi();
  aggiornaSegnale(pagina.allerte);
  evidenziaInSospeso();
}

// ---- Segnale di allerta: porta alla tile (anche in un altro workspace) e la mette in evidenza.
function evidenzia(id) {
  const el = griglia.querySelector(`.tile[data-id="${CSS.escape(id)}"]`);
  if (!el) { avvisa('La tile non si vede in questa vista: prova la vista Completa'); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('evidenziata');
  setTimeout(() => el.classList.remove('evidenziata'), 4000);
}
function evidenziaInSospeso() {
  let id = null;
  try { id = sessionStorage.getItem('fluxboard.evidenzia'); sessionStorage.removeItem('fluxboard.evidenzia'); } catch { /* niente */ }
  if (id) requestAnimationFrame(() => evidenzia(id));
}
attivaSegnale({
  pagina: () => pagina,
  vai: (ws, id) => {
    if (ws === pagina.workspace.attuale) { evidenzia(id); return; }
    try { sessionStorage.setItem('fluxboard.evidenzia', id); } catch { /* niente */ }
    fermaGiro();
    vaiAlWorkspace(ws);
  },
});

// ---- Giro dei workspace: uno dopo l'altro ogni 30 secondi (o `giro: 45s` nel profilo del display,
// o ?giro=45s nell'indirizzo). Si cambia senza ricaricare: le tile presenti in più workspace
// (anche_in, es. la telecamera) restano dove sono, senza interrompersi. Si ferma da solo mentre
// si modifica, con una finestra o un menu aperti, o con il puntatore sopra le tile.
let timerGiro = null;
const SCELTE_GIRO = [15, 30, 60];
const secondiGiro = () => {
  const v = parametri.get('giro') || memoria('fluxboard.giro.secondi') || pagina?.display?.giro || '30s';
  const m = String(v).match(/^(\d+)\s*(s|m)?$/);
  return m ? Math.max(10, Number(m[1]) * (m[2] === 'm' ? 60 : 1)) : 30;
};
const giroAcceso = () => (parametri.has('giro') ? parametri.get('giro') !== '0' : memoria('fluxboard.giro') === '1');
const inPausa = () => disposizione.attiva || document.hidden || Boolean(document.querySelector('dialog[open], .menu-a-comparsa'))
  || griglia.matches(':hover') && matchMedia('(hover: hover)').matches;
// Il pulsante: colorato (e con i secondi) mentre gira, grigio quando è fermo o sospeso in Modifica.
function statoPulsanteGiro() {
  const b = document.getElementById('giro');
  const acceso = Boolean(timerGiro);
  b.setAttribute('aria-pressed', String(acceso));
  b.classList.toggle('con-testo', acceso);
  b.querySelector('.secondi-giro')?.remove();
  if (acceso) b.insertAdjacentHTML('beforeend', `<span class="secondi-giro">${secondiGiro()}s</span>`);
  b.dataset.tip = acceso ? `Giro dei workspace: uno ogni ${secondiGiro()} secondi (click: ferma o cambia ritmo)`
    : disposizione.attiva && giroAcceso() ? 'Giro dei workspace sospeso mentre modifichi' : 'Giro dei workspace: uno dopo l\'altro (click: avvia, 15/30/60 secondi)';
}
async function prossimoWorkspace() {
  const elenco = pagina?.workspace?.elenco || [];
  if (elenco.length < 2 || disposizione.attiva) { fermaGiro(); return; }
  if (inPausa()) { document.getElementById('avanzamento-giro').classList.add('in-pausa'); timerGiro = setTimeout(prossimoWorkspace, 5_000); return; }
  workspace = elenco[(elenco.indexOf(pagina.workspace.attuale) + 1) % elenco.length];
  const p = new URLSearchParams(location.search);
  if (workspace === 'default') p.delete('workspace'); else p.set('workspace', workspace);
  history.replaceState(null, '', `${location.pathname}${p.size ? `?${p}` : ''}`);
  try { await caricaPagina(); } catch { /* riprova al giro dopo */ }
  if (!disposizione.attiva) avviaGiro();
}
function avviaGiro() {
  if (disposizione.attiva) return;
  clearTimeout(timerGiro);
  timerGiro = setTimeout(prossimoWorkspace, secondiGiro() * 1000);
  // Una linea nuova: l'animazione ricomincia da zero.
  const barra = document.getElementById('avanzamento-giro');
  const nuova = barra.cloneNode();
  nuova.hidden = false;
  nuova.classList.remove('in-pausa');
  nuova.style.setProperty('--giro', `${secondiGiro()}s`);
  barra.replaceWith(nuova);
  statoPulsanteGiro();
}
function fermaGiro() {
  clearTimeout(timerGiro);
  timerGiro = null;
  document.getElementById('avanzamento-giro').hidden = true;
  statoPulsanteGiro();
}
// Click: un menu con Avvia/Ferma e il ritmo (15, 30, 60 secondi), ricordati in questo browser.
document.getElementById('giro').addEventListener('click', async (e) => {
  const scelta = await apriMenu(e.currentTarget, [
    timerGiro ? { valore: 'ferma', testo: '■ Ferma il giro' } : { valore: 'avvia', testo: `▶ Avvia (ogni ${secondiGiro()} secondi)` },
    { separatore: true },
    ...SCELTE_GIRO.map((n) => ({ valore: String(n), testo: `Ogni ${n} secondi`, scelto: secondiGiro() === n })),
  ]);
  if (!scelta) return;
  if (scelta === 'ferma') { fermaGiro(); memoria('fluxboard.giro', '0'); avvisa('Giro dei workspace fermato'); return; }
  if (scelta !== 'avvia') memoria('fluxboard.giro.secondi', `${scelta}s`);
  if (disposizione.attiva) { memoria('fluxboard.giro', '1'); avvisa('Il giro parte quando esci da Modifica'); statoPulsanteGiro(); return; }
  memoria('fluxboard.giro', '1');
  avviaGiro();
  avvisa(`Giro dei workspace: uno ogni ${secondiGiro()} secondi`);
});
// Modifica: il giro si sospende, e riparte da solo all'uscita se era acceso.
document.addEventListener('fluxboard:modifica', (e) => {
  if (e.detail) fermaGiro(); else if (giroAcceso() && (pagina?.workspace?.elenco || []).length > 1) avviaGiro();
  statoPulsanteGiro();
});
function preparaGiro() {
  const b = document.getElementById('giro');
  b.hidden = (pagina?.workspace?.elenco || []).length < 2;
  if (b.hidden) { fermaGiro(); return; }
  if (giroAcceso() && !timerGiro && !disposizione.attiva) avviaGiro(); else statoPulsanteGiro();
}

function ricarica() {
  return caricaPagina().catch(() => {});
}

function ascolta() {
  const eventi = new EventSource('/api/eventi');
  eventi.addEventListener('open', () => {
    if (connessionePersaDal) ricarica();
    connessionePersaDal = null; aggiornaAvviso();
  });
  eventi.addEventListener('error', () => { connessionePersaDal ??= Date.now(); aggiornaAvviso(); });
  eventi.addEventListener('stato', (e) => {
    const { id, stato } = JSON.parse(e.data);
    if (!pagina) return;
    pagina.stato[id] = stato;
    programmaComponi();
  });
  eventi.addEventListener('config', ricarica);
  eventi.addEventListener('allerta', (e) => {
    if (!pagina) return;
    pagina.allerte = JSON.parse(e.data);
    aggiornaSegnale(pagina.allerte);
  });
}

// Orologio, tempi relativi e dati scaduti cambiano anche senza eventi dal server.
setInterval(() => {
  if (!pagina) return;
  for (const el of griglia.querySelectorAll('.tile[data-tipo="orologio"]')) {
    const t = pagina.tile.find((x) => x.id === el.dataset.id);
    if (t) disegna(el, t);
  }
}, 1000);
setInterval(() => { if (pagina) { componi(); aggiornaAvviso(); } }, 30_000);

// Sotto il titolo: giorno e ora, la "fotografia" è di adesso.
function adesso() {
  const fuso = pagina?.globale.fuso;
  const d = new Date();
  document.getElementById('adesso').textContent = `${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: fuso })} · ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: fuso })}`;
}
setInterval(adesso, 15_000);

// Testata fissa: la sua altezza (che cambia quando va a capo) dice dove agganciare la barra di
// Modifica; una volta scorsa la pagina prende un bordo, per staccarsi dal contenuto.
const testata = document.querySelector('header.barra');
new ResizeObserver(() => document.documentElement.style.setProperty('--altezza-testata', `${testata.offsetHeight}px`)).observe(testata);
addEventListener('scroll', () => document.body.classList.toggle('scorsa', scrollY > 4), { passive: true });

// Le icone dei pulsanti della barra (data-icona="…") si disegnano qui, una volta.
for (const el of document.querySelectorAll('[data-icona]')) el.insertAdjacentHTML('afterbegin', icona(el.dataset.icona, 'icona-barra'));

attivaGrafici(griglia);

// Colonne delle tabelle: si trascina il bordo destro dell'intestazione per allargarle o stringerle,
// doppio click per tornare automatica. Valgono per questo display in tutte le viste e si salvano
// da sole (solo le larghezze, non la disposizione).
async function salvaLarghezze(t) {
  try {
    const r = await fetch('/api/config/layout/colonne', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display: pagina.display.nome, workspace: pagina.workspace.attuale, id: t.id, larghezze: t.larghezze || {} }),
    });
    if (!r.ok) throw new Error(String(r.status));
  } catch { avvisa('Larghezza della colonna non salvata: tornerà com\'era ricaricando'); }
}
function ridisegnaTile(t) {
  const el = griglia.querySelector(`.tile[data-id="${CSS.escape(t.id)}"]`);
  if (el) disegna(el, t);
  return el;
}
griglia.addEventListener('pointerdown', (e) => {
  const m = e.target.closest('.maniglia-colonna');
  if (!m || e.button > 0) return;
  e.preventDefault();
  e.stopPropagation();
  const t = pagina.tile.find((x) => x.id === m.closest('.tile')?.dataset.id);
  if (!t) return;
  const nome = m.dataset.colonna;
  const th = m.parentElement;
  const x0 = e.clientX;
  const w0 = th.querySelector('.cella-fissa')?.getBoundingClientRect().width ?? Math.max(30, th.getBoundingClientRect().width - 8);
  // La prima volta la colonna prende la misura che ha adesso; le altre restano automatiche.
  if (!t.larghezze?.[nome]) { t.larghezze = { ...(t.larghezze || {}), [nome]: Math.round(w0) }; ridisegnaTile(t); }
  document.body.classList.add('allarga-colonna');
  let mosso = false;
  const muovi = (ev) => {
    mosso = true;
    t.larghezze[nome] = Math.max(30, Math.min(1500, Math.round(w0 + ev.clientX - x0)));
    const el = griglia.querySelector(`.tile[data-id="${CSS.escape(t.id)}"]`);
    el?.querySelector(`.maniglia-colonna[data-colonna="${CSS.escape(nome)}"]`)?.classList.add('in-uso');
    const celle = el ? el.querySelectorAll(`.cella-fissa[data-larghezza-di="${CSS.escape(nome)}"]`) : [];
    if (celle.length) for (const c of celle) c.style.width = `${t.larghezze[nome]}px`; else ridisegnaTile(t);
  };
  const fine = () => {
    removeEventListener('pointermove', muovi);
    removeEventListener('pointerup', fine);
    removeEventListener('pointercancel', fine);
    document.body.classList.remove('allarga-colonna');
    ridisegnaTile(t);
    if (mosso) salvaLarghezze(t);
  };
  addEventListener('pointermove', muovi);
  addEventListener('pointerup', fine);
  addEventListener('pointercancel', fine);
}, true);
griglia.addEventListener('dblclick', (e) => {
  const m = e.target.closest('.maniglia-colonna');
  if (!m) return;
  e.preventDefault();
  e.stopPropagation();
  const t = pagina.tile.find((x) => x.id === m.closest('.tile')?.dataset.id);
  if (!t?.larghezze?.[m.dataset.colonna]) return;
  delete t.larghezze[m.dataset.colonna];
  ridisegnaTile(t);
  salvaLarghezze(t);
}, true);
// Un click sul bordo della colonna non deve aprire o chiudere niente.
griglia.addEventListener('click', (e) => { if (e.target.closest('.maniglia-colonna')) e.stopPropagation(); }, true);
// Periodo di una cronologia (6h / 12h / 24h…): si ricorda in questo browser e la tile si ridisegna.
griglia.addEventListener('click', (e) => {
  const z = e.target.closest('[data-chiudi-tile]');
  if (z) {
    e.stopPropagation();
    const el = z.closest('.tile');
    const t = pagina.tile.find((x) => x.id === el.dataset.id);
    if (t) cambiaChiusura(t, el);
    return;
  }
  const b = e.target.closest('[data-finestra]');
  if (!b) return;
  e.stopPropagation();
  scegliFinestra(b.closest('.tile').dataset.id, b.dataset.finestra);
  componi();
});
attivaAzioni(griglia, { pagina: () => pagina, avvisa, fuso: () => pagina.globale.fuso });
const modifica = avviaModifica({
  stato: disposizione,
  griglia,
  pagina: () => pagina,
  componi,
  applicaDimensioni,
  colonneTile,
  ridisponi,
  colonneSezione,
  ricarica,
  contesto: () => ({ livello, fuso: pagina.globale.fuso }),
});

// Senza ?display= il profilo dipende dalla larghezza: se la finestra cambia, lo si ricalcola.
let attesaLarghezza = null;
addEventListener('resize', () => {
  clearTimeout(attesaLarghezza);
  attesaLarghezza = setTimeout(() => {
    if (pagina && !parametri.get('display') && (nomeDisplay() || pagina.display.disponibili[0]) !== pagina.display.nome) ricarica();
  }, 300);
});

document.getElementById('ws-prima-tile').addEventListener('click', () => modifica.aggiungiTile());

caricaPagina().catch(() => { connessionePersaDal = Date.now(); aggiornaAvviso(); });
ascolta();
