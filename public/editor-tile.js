// Editor of a tile, opened straight from the dashboard (⚙ on the tile or "+ Add tile"). Two tabs,
// as in Home Assistant's card editors: "Settings" (forms) and "Code" (the full YAML, for everything
// the forms do not cover). On the right the live preview with the source's real data and the
// available fields to insert in the texts.

import { proteggi } from './formato.js';
import { TIPI } from './tipi.js';
import { disegnaModulo, aggiornaVisibilita, leggiModulo, gestisciClickModulo, comeYaml } from './moduli.js';
import { gestisciSorgenti } from './editor-sorgente.js';
import { NOMI_ICONE, icona } from './icone.js';
import { nomeEtichetta, creaEtichetta, chiediNuovaEtichetta } from './etichette.js';
import { editorCondizione, attivaCondizioni } from './condizione-gui.js';

const NOMI_TIPI = {
  elenco: ['Elenco', 'Una riga per ogni elemento: stanze, porte, apparati…', '☰'],
  valore: ['Valore', 'Un numero o un testo singolo: temperatura, quotazione…', '#'],
  valori: ['Valori affiancati', 'Più numeri con la loro etichetta: stanza, energia, server…', '▦'],
  grafico: ['Grafico', 'Linee nel tempo: temperatura e setpoint, consumi…', '〰'],
  cronologia: ['Cronologia', 'Una riga per elemento con i tratti in cui era acceso: valvole, servizi…', '▤'],
  testo: ['Testo', 'Testo fisso: note, istruzioni', '¶'],
  orologio: ['Orologio', 'Ora e data', '◷'],
  immagine: ['Immagine o telecamera', 'Un\'immagine o uno stream MJPEG da un indirizzo', '▣'],
  iframe: ['Pagina incorporata', 'Un pannello Grafana o un\'altra pagina web', '⧉'],
};
const LIVELLI = ['base', 'intermedia', 'avanzata'];
// In the files the middle level is called "intermedia"; on the page it is the "Medium" view.
const NOME_LIVELLO = { base: 'Base', intermedia: 'Media', avanzata: 'Avanzata' };
const DURATE = ['30s', '1m', '2m', '5m', '15m', '1h'];
const CON_DATI = new Set(['elenco', 'valore', 'valori', 'grafico', 'cronologia']);

let meta = null;
async function api(percorso, opzioni = {}) {
  const r = await fetch(`/api/config${percorso}`, {
    ...opzioni,
    headers: opzioni.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opzioni.body ? JSON.stringify(opzioni.body) : undefined,
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.errore || `errore ${r.status}`);
  return corpo;
}

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

// ------------------------------------------------------------------ choosing the type

export async function scegliTipo({ workspace = 'default' } = {}) {
  meta = await api('/');
  const dlg = document.getElementById('dlg-tipo');
  // One row per type: icon, name, what it is for. All rows the same, in two columns side by side.
  const scheda = ({ tipo }) => {
    const [nome, descrizione, icona] = NOMI_TIPI[tipo] || [tipo, '', '□'];
    return `<button type="button" class="riga-tipo" data-tipo="${tipo}"><span class="icona-tipo" aria-hidden="true">${icona}</span><span class="testo-tipo"><b>${proteggi(nome)}</b><span>${proteggi(descrizione)}</span></span></button>`;
  };
  const conDati = meta.tipiTile.filter((t) => CON_DATI.has(t.tipo));
  const fissi = meta.tipiTile.filter((t) => !CON_DATI.has(t.tipo));
  const quante = meta.sorgenti.length;
  // Two families, as in Grafana: data from a source (API, database…) or fixed content.
  const altrove = meta.file.filter((f) => f.genere === 'tile' && f.workspace !== workspace && !(f.anche_in || []).includes(workspace));
  dlg.querySelector('.galleria').innerHTML = `
    <div class="famiglie">
      <section class="famiglia"><h3>Dati da una sorgente</h3>
        <p class="aiuto">Si aggiornano da soli. Nel passo dopo scegli quale sorgente leggere.</p>
        <div class="elenco-tipi">${conDati.map(scheda).join('')}</div></section>
      <section class="famiglia"><h3>Contenuto fisso</h3>
        <p class="aiuto">Scritto nella tile o preso da un indirizzo.</p>
        <div class="elenco-tipi">${fissi.map(scheda).join('')}</div></section>
    </div>
    ${meta.workspace.length > 1 && altrove.length ? `<section class="famiglia famiglia-altrove"><h3>Da un altro workspace</h3>
      <p class="aiuto">La stessa tile, mostrata anche qui: modificarla la cambia ovunque.</p>
      <div class="elenco-tipi">${altrove.map((f) => `<button type="button" class="riga-tipo" data-esistente="${proteggi(f.nome)}"><span class="icona-tipo" aria-hidden="true">⇄</span><span class="testo-tipo"><b>${proteggi(f.titolo || f.nome)}</b><span>da «${proteggi(f.workspace)}»</span></span></button>`).join('')}</div></section>` : ''}
    <p class="piede-galleria aiuto">${quante} sorgent${quante === 1 ? 'e' : 'i'} configurat${quante === 1 ? 'a' : 'e'} · <button type="button" class="collegamento" data-sorgenti>Gestisci le sorgenti</button></p>`;
  return new Promise((risolvi) => {
    dlg.onclick = (e) => {
      if (e.target.closest('[data-sorgenti]')) { gestisciSorgenti({ nuova: true }).catch(() => {}); return; }
      const esistente = e.target.closest('[data-esistente]');
      if (esistente) { dlg.close(); risolvi({ esistente: esistente.dataset.esistente }); return; }
      const b = e.target.closest('[data-tipo]');
      if (b) { dlg.close(); risolvi(b.dataset.tipo); }
      if (e.target.matches('[data-chiudi]') || e.target === dlg) { dlg.close(); risolvi(null); }
    };
    dlg.showModal();
  });
}

// ------------------------------------------------------------------ editor

export async function apriEditor({ id = null, tipo = null, genere = null, livello = 'intermedia', fuso = 'Europe/Rome', workspace = 'default', etichetta }) {
  meta = await api('/');
  const nuovo = !id;
  const originale = nuovo ? { tipo, titolo: '', ...(etichetta ? { etichetta } : {}) } : (await api(`/tile?id=${encodeURIComponent(id)}`));
  // Tile of a kind: the kind's fields at the top; the rest of the editor shows the expanded tile
  // and on save only the differences from the model are written.
  genereCorrente = null;
  let scritta = nuovo ? null : originale.oggetto;
  if (genere || originale.genere) {
    const elenco = (await api('/generi')).generi;
    const g = elenco.find((x) => x.id === (genere || originale.genere.id));
    if (!g) throw new Error(`genere "${genere || originale.genere.id}" non trovato`);
    if (nuovo) scritta = { genere: g.id, titolo: g.nome, ...(etichetta ? { etichetta } : {}), campi: {} };
    genereCorrente = { ...g, valori: { ...(scritta.campi || {}) } };
  }
  const oggetto = genereCorrente
    ? { ...(await api('/generi/espandi', { method: 'POST', body: { oggetto: scritta } })).tile, titolo: scritta.titolo ?? '', etichetta: scritta.etichetta }
    : (nuovo ? originale : originale.oggetto);
  // The plain model (kind + fields, no tweaks): only what differs from it is saved.
  const modelloPuro = genereCorrente ? (await api('/generi/espandi', { method: 'POST', body: { oggetto: { genere: scritta.genere, campi: scritta.campi || {} } } })).tile : null;
  const testoOriginale = nuovo ? '' : originale.testo;
  tipo = oggetto.tipo;

  const dlg = document.getElementById('dlg-tile');
  const form = dlg.querySelector('form');
  const [nomeTipo] = NOMI_TIPI[tipo] || [tipo];
  dlg.querySelector('.dlg-titolo').textContent = nuovo ? `Nuova tile · ${genereCorrente ? genereCorrente.nome : nomeTipo}` : `Modifica · ${oggetto.titolo || id}`;
  dlg.querySelector('[data-salva-genere]').hidden = nuovo;
  wsDellaTile = id && id.includes('/') ? id.split('/')[0] : (id ? 'default' : workspace);
  form.querySelector('.impostazioni').innerHTML = moduli(oggetto, tipo);
  const codice = form.querySelector('.codice textarea');
  codice.value = testoOriginale;
  mostraScheda(dlg, 'impostazioni');
  const esito = dlg.querySelector('.esito');
  esito.innerHTML = '';

  let ultimoCampo = null;           // dove inserire un {campo} cliccato nell'anteprima
  let righeAnteprima = [];
  let livelloAnteprima = livello;
  let attesa = null;
  const campiPreview = dlg.querySelector('.campi-disponibili');
  const pannello = dlg.querySelector('.anteprima-tile');

  const sorgenteScelta = () => form.elements.sorgente?.value;
  function aggiornaCampiSorgente() {
    const box = form.querySelector('.campi-sorgente');
    if (!box) return;
    box.innerHTML = campiPerSorgente(sorgenteScelta(), oggetto.dati || {});
    aggiornaVisibilita(box);
  }
  async function cambiaSorgente() {
    // "+ New source…": the source management opens and comes back here with the new one selected.
    if (sorgenteScelta() === '__nuova') {
      const creata = await gestisciSorgenti({ nuova: true }).catch(() => null);
      meta = await api('/');
      form.elements.sorgente.outerHTML = sceltaSorgente(creata || oggetto.dati?.sorgente || meta.sorgenti[0]?.nome || '__statico');
      form.elements.sorgente.addEventListener('change', cambiaSorgente);
    }
    aggiornaCampiSorgente(); programmaAnteprima();
  }
  form.elements.sorgente?.addEventListener('change', cambiaSorgente);
  aggiornaVisibilita(form.querySelector('.impostazioni'));

  function oggettoCorrente() {
    if (genereCorrente) return scrittaDaGenere(form, oggetto, modelloPuro, tipo);
    return unisci(oggetto, campiDalModulo(form, oggetto, tipo));
  }

  function disegnaAnteprima() {
    const o = oggettoCorrente();
    const t = {
      id: id || 'nuova', tipo, titolo: o.titolo, riga: o.riga, testo: o.testo, vuoto: o.vuoto, voci: o.voci,
      serie: o.serie, fasce: o.fasce, soglie: o.soglie, tacche: o.tacche, gruppo: o.gruppo, se: o.se, ordine: o.ordine, finestra: o.finestra, tono: o.tono, etichetta_se: o.etichetta_se, stato: o.stato, stato_se: o.stato_se, in_fondo: o.in_fondo, asse: o.asse, unita: o.unita, decimali: o.decimali, tabella: o.tabella, azioni: o.azioni, colore_se: o.colore_se, intensita: o.intensita,
      url: o.url, altezza: o.altezza, aggiorna_ogni: 0, diretto: true,   // preview: the tile is not saved yet
    };
    const ctx = { livello: livelloAnteprima, livelli: LIVELLI, fuso };
    const corpo = (TIPI[tipo] || TIPI.errore)(t, { righe: righeAnteprima }, ctx);
    pannello.innerHTML = `${o.titolo ? `<h2>${proteggi(o.titolo)}</h2>` : ''}<div class="corpo">${corpo}</div>`;
    const img = pannello.querySelector('img[data-src]');
    if (img) img.src = img.dataset.src;
  }

  async function eseguiProva() {
    const stato = dlg.querySelector('.stato-anteprima');
    if (!CON_DATI.has(tipo)) { righeAnteprima = []; stato.textContent = ''; campiPreview.innerHTML = ''; disegnaAnteprima(); return; }
    stato.textContent = 'Lettura dei dati…';
    try {
      const corpo = schedaAttiva(dlg) === 'codice'
        ? { percorso: `tile/${id || 'anteprima'}.yaml`, testo: codice.value }
        : { percorso: `tile/${id || 'anteprima'}.yaml`, oggetto: oggettoCorrente() };
      const r = await api('/prova', { method: 'POST', body: corpo });
      if (r.errori) { stato.textContent = r.errori[0]; righeAnteprima = []; }
      else if (r.errore) { stato.textContent = `Errore della sorgente: ${r.errore}`; righeAnteprima = []; }
      else {
        righeAnteprima = r.righe || [];
        stato.textContent = righeAnteprima.length
          ? `${r.totale} ${r.totale === 1 ? 'riga' : 'righe'} dalla sorgente (${r.ms} ms)`
          : 'Nessun dato adesso: con "solo quando ha qualcosa da mostrare" la tile resterebbe nascosta.';
      }
    } catch (e) { stato.textContent = e.message; righeAnteprima = []; }
    const campi = [...new Set(righeAnteprima.flatMap((r) => Object.keys(r)))];
    // The fields of the real data, offered in the graphical conditions.
    let elencoCampi = dlg.querySelector('#campi-anteprima');
    if (!elencoCampi) { elencoCampi = document.createElement('datalist'); elencoCampi.id = 'campi-anteprima'; dlg.append(elencoCampi); }
    elencoCampi.innerHTML = campi.map((c) => `<option value="${proteggi(c)}">`).join('');
    campiPreview.innerHTML = campi.length
      ? `<span>Campi disponibili, un click li inserisce nel testo:</span> ${campi.map((c) => `<button type="button" class="chip" data-campo="${proteggi(c)}">{${proteggi(c)}}</button>`).join('')}`
      : '';
    disegnaAnteprima();
  }

  function programmaAnteprima(subito = false) {
    clearTimeout(attesa);
    attesa = setTimeout(eseguiProva, subito ? 0 : 700);
  }

  form.oninput = (e) => {
    if (e.target.closest('.codice')) { programmaAnteprima(); return; }
    if (e.target.closest('[data-dati], .campi-sorgente, .campi-genere')) { aggiornaVisibilita(form.querySelector('.impostazioni')); programmaAnteprima(); }
    else disegnaAnteprima();
  };
  // "+ Add a value" and "✕" of the items of a "values" tile.
  anteprimaCorrente = () => disegnaAnteprima();
  // Full window: for writing long code and queries. The choice stays until it is removed.
  const pieno = dlg.querySelector('[data-tutta-finestra]');
  const statoPieno = (on) => { dlg.classList.toggle('a-tutta-finestra', on); pieno.setAttribute('aria-pressed', String(on)); pieno.textContent = on ? '⤡' : '⤢'; };
  try { statoPieno(localStorage.getItem('fluxboard.editor-pieno') === '1'); } catch { statoPieno(false); }
  pieno.onclick = () => {
    const on = !dlg.classList.contains('a-tutta-finestra');
    statoPieno(on);
    try { localStorage.setItem('fluxboard.editor-pieno', on ? '1' : '0'); } catch { /* niente memoria */ }
    if (!on) anteprimaCorrente();
  };
  // Preview as wide as you like: the divider is dragged (or moved with the arrows) and the width is
  // remembered in this browser.
  if (!dlg.dataset.divisore) {
    dlg.dataset.divisore = '1';
    const corpo = dlg.querySelector('.dlg-corpo');
    const div = dlg.querySelector('.divisore-anteprima');
    const imposta = (px) => {
      const l = Math.round(Math.max(260, Math.min(px, corpo.getBoundingClientRect().width - 360)));
      corpo.style.setProperty('--larghezza-anteprima', `${l}px`);
      try { localStorage.setItem('fluxboard.anteprima', String(l)); } catch { /* niente memoria */ }
      anteprimaCorrente();
    };
    try { const l = Number(localStorage.getItem('fluxboard.anteprima')); if (l) corpo.style.setProperty('--larghezza-anteprima', `${l}px`); } catch { /* niente memoria */ }
    div.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { div.setPointerCapture(e.pointerId); } catch { /* non indispensabile */ }
      document.body.classList.add('trascina-divisore');
      const muovi = (ev) => imposta(corpo.getBoundingClientRect().right - ev.clientX);
      const fine = () => {
        removeEventListener('pointermove', muovi); removeEventListener('pointerup', fine); removeEventListener('pointercancel', fine);
        document.body.classList.remove('trascina-divisore');
      };
      addEventListener('pointermove', muovi);
      addEventListener('pointerup', fine);
      addEventListener('pointercancel', fine);
    });
    div.addEventListener('keydown', (e) => {
      const attuale = dlg.querySelector('.anteprima').getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') imposta(attuale + 40);
      if (e.key === 'ArrowRight') imposta(attuale - 40);
    });
  }
  // Graphical conditions (colore_se): once per window; every change updates the preview.
  if (!dlg.dataset.condizioni) {
    dlg.dataset.condizioni = '1';
    const impostazioni = form.querySelector('.impostazioni');
    attivaCondizioni(impostazioni, () => anteprimaCorrente());
    // Colour of the rule: a dot or a label's colour, never both.
    impostazioni.addEventListener('change', (e) => {
      const regola = e.target.closest('.regola-colore');
      if (!regola) return;
      if (e.target.dataset.regola === 'colore') regola.querySelector('[data-regola="etichetta"]').value = '';
      if (e.target.dataset.regola === 'etichetta' && e.target.value) regola.querySelectorAll('[data-regola="colore"]').forEach((x) => { x.checked = false; });
    });
  }
  form.querySelector('.impostazioni').onclick = (e) => {
    if (gestisciClickModulo(e)) { programmaAnteprima(); return; }
    const b = e.target.closest('[data-azione-modulo]');
    if (!b) return;
    if (b.dataset.azioneModulo === 'aggiungi-voce') {
      b.previousElementSibling.insertAdjacentHTML('beforeend', rigaVoce());
      b.previousElementSibling.lastElementChild.querySelector('input').focus();
    }
    if (b.dataset.azioneModulo === 'togli-voce') b.closest('.voce-modulo').remove();
    if (b.dataset.azioneModulo === 'aggiungi-regola') b.previousElementSibling.insertAdjacentHTML('beforeend', rigaRegola());
    if (b.dataset.azioneModulo === 'togli-regola') b.closest('.regola-colore').remove();
    if (b.dataset.azioneModulo === 'nuova-etichetta') { nuovaEtichetta(b); return; }
    disegnaAnteprima();
  };
  async function nuovaEtichetta(b) {
    const n = chiediNuovaEtichetta();
    if (!n) return;
    try {
      if (!(n in (meta.argomenti || {}))) meta.argomenti = await creaEtichetta(n, meta.argomenti);
    } catch (err) { esito.innerHTML = `<p class="errore">✕ ${proteggi(err.message)}</p>`; return; }
    form.querySelector(`[name="etichetta"][value="${CSS.escape(n)}"]`)?.closest('label').remove();
    const a = meta.argomenti[n];
    b.insertAdjacentHTML('beforebegin', pillolaEtichetta(n, nomeEtichetta(n), typeof a === 'string' ? a : a?.colore, a?.icona, true));
    disegnaAnteprima();
  }
  form.onfocusin = (e) => { if (e.target.matches('[data-testo]')) ultimoCampo = e.target; };
  dlg.querySelector('.anteprima').onclick = (e) => {
    const chip = e.target.closest('[data-campo]');
    if (chip) {
      const campo = ultimoCampo || form.querySelector('[data-testo]');
      if (!campo) return;
      campo.setRangeText(`{${chip.dataset.campo}}`, campo.selectionStart ?? campo.value.length, campo.selectionEnd ?? campo.value.length, 'end');
      campo.focus();
      disegnaAnteprima();
    }
    const liv = e.target.closest('[data-livello]');
    if (liv) {
      livelloAnteprima = liv.dataset.livello;
      dlg.querySelectorAll('[data-livello]').forEach((b) => b.classList.toggle('scelto', b === liv));
      disegnaAnteprima();
    }
  };
  dlg.querySelectorAll('[data-livello]').forEach((b) => b.classList.toggle('scelto', b.dataset.livello === livelloAnteprima));

  dlg.querySelector('.schede').onclick = async (e) => {
    const b = e.target.closest('[data-scheda]');
    if (!b) return;
    const nota = dlg.querySelector('.nota-codice');
    if (b.dataset.scheda === 'codice') {
      nota.textContent = nuovo
        ? 'Per una tile nuova compila le Impostazioni: il codice completo sarà qui dopo il primo salvataggio. Puoi anche scriverlo da zero.'
        : modificato(form, oggetto, tipo)
          ? 'Attenzione: le modifiche fatte nelle Impostazioni non compaiono qui. Salva dalla scheda in cui stai lavorando.'
          : 'Il file completo della tile. Salvando da questa scheda vale quello che c\'è scritto qui.';
    }
    mostraScheda(dlg, b.dataset.scheda);
    programmaAnteprima(true);
  };

  return new Promise((risolvi) => {
    const chiudi = (valore) => { clearTimeout(attesa); dlg.close(); risolvi(valore); };
    dlg.querySelector('[data-salva-genere]').onclick = async () => {
      const nome = prompt('Nome del nuovo genere (es. "Temperatura di una stanza"). Il modello sarà questa tile; nel file del genere potrai aggiungere i campi da chiedere.');
      if (!nome?.trim()) return;
      try {
        const r = await api('/generi/da-tile', { method: 'POST', body: { id, nome: nome.trim() } });
        esito.innerHTML = r.ok === false ? r.errori.map((x) => `<p class="errore">✕ ${proteggi(x)}</p>`).join('')
          : `<p class="ok">✓ Genere «${proteggi(nome.trim())}» creato: <code>config/generi/${proteggi(r.id)}.yaml</code>. Lo trovi in "Aggiungi tile".</p>`;
      } catch (err) { esito.innerHTML = `<p class="errore">✕ ${proteggi(err.message)}</p>`; }
    };
    dlg.querySelector('[data-chiudi]').onclick = () => chiudi(null);
    dlg.querySelector('[data-annulla]').onclick = () => chiudi(null);
    dlg.oncancel = (e) => { e.preventDefault(); chiudi(null); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      esito.innerHTML = '';
      const corpo = { id, nuovo };
      if (schedaAttiva(dlg) === 'codice') corpo.testo = codice.value;
      else if (genereCorrente) {
        // Kind: the kind's fields plus only what differs from the expanded model. Only the keys the
        // editor handles: a tweak equal to the model is removed (null), a different one written;
        // those the editor does not show (table, priority…) stay as they were.
        const { __cambiati, ...s } = scrittaDaGenere(form, oggetto, modelloPuro, tipo, { conNull: !nuovo });
        corpo.campi = s;
        corpo.sostituisci = nuovo ? [['campi']] : (__cambiati || []).map((k) => ['campi', k]);
      } else {
        const { __sostituisci, ...campi } = campiDalModulo(form, oggetto, tipo);
        corpo.campi = campi;
        corpo.sostituisci = __sostituisci || [];
      }
      if (nuovo) {
        // In the "default" workspace the id is the file name; in the others the workspace comes
        // first.
        const prefisso = workspace === 'default' ? '' : `${workspace}/`;
        const base = slug(form.elements.titolo?.value) || tipo;
        corpo.id = `${prefisso}${base}`;
        const esistenti = new Set(meta.file.filter((f) => f.genere === 'tile').map((f) => f.nome));
        for (let n = 2; esistenti.has(corpo.id); n++) corpo.id = `${prefisso}${base}-${n}`;
        if (corpo.campi && !genereCorrente) corpo.campi = { tipo, ...corpo.campi };
      }
      try {
        const r = await api('/tile', { method: 'PUT', body: corpo });
        if (!r.ok) { esito.innerHTML = r.errori.map((x) => `<p class="errore">✕ ${proteggi(x)}</p>`).join(''); return; }
        chiudi({ id: corpo.id, nuovo });
      } catch (err) { esito.innerHTML = `<p class="errore">✕ ${proteggi(err.message)}</p>`; }
    };
    dlg.showModal();
    form.elements.titolo?.focus();
    programmaAnteprima(true);
  });
}

function schedaAttiva(dlg) { return dlg.querySelector('[data-scheda].scelta')?.dataset.scheda; }
function mostraScheda(dlg, nome) {
  dlg.querySelectorAll('[data-scheda]').forEach((b) => b.classList.toggle('scelta', b.dataset.scheda === nome));
  dlg.querySelector('.impostazioni').hidden = nome !== 'impostazioni';
  dlg.querySelector('.codice').hidden = nome !== 'codice';
}

// ------------------------------------------------------------------ forms

function perLivelli(valore) {
  if (valore == null) return { base: '', intermedia: '', avanzata: '' };
  if (typeof valore === 'string') return { base: valore, intermedia: valore, avanzata: valore };
  return { base: valore.base || '', intermedia: valore.intermedia || '', avanzata: valore.avanzata || '' };
}

function campoTesto(nome, etichetta, valore, aiuto = '') {
  const v = perLivelli(valore);
  return `<fieldset class="livelli"><legend>${etichetta}</legend>
    ${LIVELLI.map((l) => `<label><span>${NOME_LIVELLO[l]}</span><input data-testo name="${nome}.${l}" value="${proteggi(v[l])}" autocomplete="off"></label>`).join('')}
    ${aiuto ? `<p class="aiuto">${aiuto}</p>` : ''}</fieldset>`;
}

// Data types without a source besides "hand-written" (e.g. the alert centre): "__tipo:<type>".
const TIPO_INTERNO = /^__tipo:(.+)$/;

function campiPerSorgente(scelta, dati) {
  const interno = String(scelta).match(TIPO_INTERNO);
  if (interno) {
    const c = meta.connettori.find((x) => x.tipo === interno[1]);
    return `${c?.descrizione ? `<p class="aiuto">${proteggi(c.descrizione)}</p>` : ''}${disegnaModulo(c?.moduloDati || [], dati.tipo === interno[1] ? dati : {})}`;
  }
  if (scelta === '__statico') {
    const righe = (dati.righe || []).map((r) => (typeof r === 'object' ? r.testo ?? JSON.stringify(r) : r)).join('\n');
    return `<label>Righe (una per riga)<textarea data-dati name="dati.righe" rows="4">${proteggi(righe)}</textarea></label>`;
  }
  const s = meta.sorgenti.find((x) => x.nome === scelta);
  const c = meta.connettori.find((x) => x.tipo === s?.tipo);
  // Values already written apply only if the tile uses exactly this source.
  return disegnaModulo(c?.moduloDati || [], dati.sorgente === scelta ? dati : {});
}

// Sources grouped by type, as in Grafana's list of data sources ("Probes", not "Probes (ports, web
// pages, DNS)": the detail is in the source management).
const breve = (s) => String(s || '').replace(/\s*\(.*\)\s*$/, '');
function sceltaSorgente(scelta) {
  const gruppi = {};
  for (const s of meta.sorgenti) {
    const c = meta.connettori.find((x) => x.tipo === s.tipo);
    (gruppi[breve(c?.nome) || s.tipo] ||= []).push(s);
  }
  return `<select name="sorgente" data-dati>
    ${Object.entries(gruppi).map(([g, ss]) => `<optgroup label="${proteggi(g)}">${ss.map((s) => `<option value="${proteggi(s.nome)}"${s.nome === scelta ? ' selected' : ''}>${proteggi(s.nome)}</option>`).join('')}</optgroup>`).join('')}
    <optgroup label="Altro"><option value="__statico"${scelta === '__statico' ? ' selected' : ''}>Scritti a mano</option>
    ${meta.connettori.filter((c) => c.senzaSorgente && c.tipo !== 'statico').map((c) => `<option value="__tipo:${proteggi(c.tipo)}"${scelta === `__tipo:${c.tipo}` ? ' selected' : ''}>${proteggi(breve(c.nome) || c.tipo)}</option>`).join('')}
    <option value="__nuova">+ Nuova sorgente (API, database, log…)</option></optgroup>
  </select>`;
}

// Label: coloured pills, one per label, plus "New" to create one on the fly. Colour and icon
// different from the label's sit in a separate box, closed when not needed.
function pillolaEtichetta(n, testo, colore, nomeIcona, scelta) {
  return `<label class="pillola-etichetta" data-colore="${proteggi(colore || 'grigio')}"><input type="radio" name="etichetta" value="${proteggi(n)}"${scelta ? ' checked' : ''}>
    <span class="segno-tile">${nomeIcona ? icona(nomeIcona) : ''}</span><span>${proteggi(testo)}</span></label>`;
}

function sceltaEtichetta(o) {
  const etichette = meta.argomenti || {};
  const attuale = o.etichetta ?? (o.colore in etichette ? o.colore : '');
  const proprio = o.colore && !(o.colore in etichette) ? o.colore : '';
  const opzione = (valore, testo) => `<option value="${proteggi(valore)}"${proprio === valore ? ' selected' : ''}>${proteggi(testo)}</option>`;
  return `<fieldset class="scelta-etichetta"><legend>Etichetta <span class="aiuto">· decide la sezione, il colore e l'icona</span></legend>
    <div class="pillole">${Object.entries(etichette).map(([n, a]) => pillolaEtichetta(n, nomeEtichetta(n), typeof a === 'string' ? a : a.colore, a?.icona, attuale === n)).join('')}
      ${pillolaEtichetta('', 'Nessuna', 'grigio', null, !attuale)}
      <button type="button" class="pillola-nuova" data-azione-modulo="nuova-etichetta">+ Nuova</button></div></fieldset>
    <details class="personalizza"${proprio || (o.icona && o.icona !== genereCorrente?.icona) || o.sfondo ? ' open' : ''}><summary>Colore e icona diversi da quelli dell'etichetta</summary>
      <div class="riga-colore"><label>Colore<select name="colore">${opzione('', "quello dell'etichetta")}
        ${(meta.colori || []).map((c) => opzione(c, c)).join('')}</select></label>
      <label class="spunta"><input type="checkbox" name="sfondo"${o.sfondo ? ' checked' : ''}> Colora anche lo sfondo</label></div>
      <label>Icona<select name="icona"><option value="">quella dell'etichetta (o nessuna)</option>
        ${NOMI_ICONE.map((n) => `<option${o.icona === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label></details>`;
}

function opzioniColore(scelto) {
  const opzione = (valore, testo) => `<option value="${proteggi(valore)}"${scelto === valore ? ' selected' : ''}>${proteggi(testo)}</option>`;
  const argomenti = Object.entries(meta.argomenti || {});
  return `${argomenti.length ? `<optgroup label="Argomenti">${argomenti.map(([n, a]) => opzione(n, `${n} (${typeof a === 'string' ? a : a.colore})`)).join('')}</optgroup>` : ''}
    <optgroup label="Colori">${(meta.colori || []).map((c) => opzione(c, c)).join('')}</optgroup>`;
}

// A "colore_se" rule: when the condition is true, the tile takes that colour. A rule: "when"
// (condition in rows: field · operator · value) → "colour" (colour swatches, plus the label
// colours) and whether to colour the background too.
let regole = 0;
function rigaRegola(condizione = '', scelta = 'rosso') {
  const colore = typeof scelta === 'string' ? scelta : scelta?.colore;
  const sfondo = typeof scelta === 'object' ? scelta.sfondo !== false : true;
  const nome = `colore-regola-${++regole}`;
  const etichette = Object.entries(meta.argomenti || {});
  const diEtichetta = etichette.some(([n]) => n === colore);
  const campione = (c) => `<label class="campione" title="${proteggi(c)}" style="--tinta: var(--c-${c})">
      <input type="radio" name="${nome}" data-regola="colore" value="${proteggi(c)}"${c === colore ? ' checked' : ''}><span class="pallino"></span></label>`;
  return `<div class="regola-colore">
    <span class="titoletto">Quando</span>${editorCondizione(condizione, 'data-regola="condizione"')}
    <span class="titoletto">Colora</span>
    <div class="colora-regola">
      <span class="campioni">${(meta.colori || []).map(campione).join('')}</span>
      <select data-regola="etichetta" aria-label="Oppure il colore di un'etichetta"><option value="">o come un'etichetta…</option>
        ${etichette.map(([n]) => `<option value="${proteggi(n)}"${n === colore ? ' selected' : ''}>come ${proteggi(nomeEtichetta(n))}</option>`).join('')}</select>
      <label class="spunta"><input type="checkbox" data-regola="sfondo"${sfondo ? ' checked' : ''}> anche lo sfondo</label>
    </div>
    <button type="button" class="togli-voce togli-regola" data-azione-modulo="togli-regola" aria-label="Togli la regola" title="Togli la regola">✕</button></div>`;
}

// The preview of the tile open now: the listeners attached once call this.
let anteprimaCorrente = () => {};
// Kind of the open tile (null = custom tile): { id, nome, descrizione, campi, valori }.
let genereCorrente = null;
let wsDellaTile = 'default';   // workspace della tile aperta nell'editor

function moduli(o, tipo) {
  const titolo = `<label>Titolo<input name="titolo" value="${proteggi(typeof o.titolo === 'string' ? o.titolo : '')}" placeholder="vuoto = nessuna intestazione" autocomplete="off"></label>`;
  // Tile of a kind: first what it shows (the kind's fields), then title and label; the rest
  // (colours, when it shows, click) in "Other settings", closed.
  if (genereCorrente) return `${sezioneGenere(o)}<section class="aspetto-genere"><h3>Titolo ed etichetta</h3>${titolo}${sceltaEtichetta(o)}</section>
    <details class="altre-impostazioni"><summary>Altre impostazioni <span class="aiuto">colori, quando compare, ogni quanto, click</span></summary>${altreImpostazioni(o, tipo).join('')}</details>`;
  const parti = [titolo, sceltaEtichetta(o)];
  if (!genereCorrente) {
  if (CON_DATI.has(tipo)) {
    const dati = o.dati || {};
    const scelta = dati.tipo === 'statico' ? '__statico' : dati.tipo && !dati.sorgente ? `__tipo:${dati.tipo}` : dati.sorgente || meta.sorgenti[0]?.nome || '__statico';
    parti.push(`<section><h3>Da dove prende i dati</h3>
      <label>Sorgente${sceltaSorgente(scelta)}</label>
      <div class="campi-sorgente" data-ambito>${campiPerSorgente(scelta, dati)}</div>
      ${o.elabora?.length ? `<p class="aiuto">Questa tile ha anche ${o.elabora.length} ${o.elabora.length === 1 ? 'passaggio' : 'passaggi'} di elaborazione dei dati: si modificano nella scheda Codice.</p>` : ''}
    </section>`);
  }
  if (tipo === 'elenco' && o.tabella?.length) {
    parti.push(`<section><h3>Colonne</h3><div class="voci" data-chiave="tabella">${o.tabella.map((v, i) => rigaVoce(v, i)).join('')}</div>
      <button type="button" class="aggiungi-voce" data-azione-modulo="aggiungi-voce">+ Aggiungi una colonna</button>
      <p class="aiuto">Intestazione e contenuto di ogni colonna: i numeri si allineano da soli a destra. Colori e livello di ogni colonna nella scheda Codice.</p>
      <label>Quando non ci sono righe<input name="vuoto" value="${proteggi(o.vuoto || '')}" placeholder="Niente da mostrare"></label></section>`);
  } else if (tipo === 'elenco') {
    parti.push(`<section><h3>Come si legge</h3>${campoTesto('riga', 'Ogni riga', o.riga, 'Un testo diverso per ogni livello di lettura. <code>{campo}</code> inserisce un valore; <code>{campo:1}</code> con un decimale, <code>{campo:rel}</code> come “5 minuti fa”, <code>{campo:ora}</code> come “16:00”. Fra <code>[ ]</code> una parte che sparisce se il suo campo manca.')}
      <label>Quando non ci sono righe<input name="vuoto" value="${proteggi(o.vuoto || '')}" placeholder="Niente da mostrare"></label></section>`);
  }
  if (tipo === 'valore') parti.push(`<section><h3>Come si legge</h3>${campoTesto('testo', 'Testo', o.testo, '<code>{campo}</code> inserisce un valore; <code>{campo:1}</code> con un decimale.')}</section>`);
  if (tipo === 'valori') {
    const voci = o.voci?.length ? o.voci : [{}];
    parti.push(`<section><h3>Valori</h3><div class="voci" data-chiave="voci">${voci.map((v, i) => rigaVoce(v, o.voci?.length ? i : null)).join('')}</div>
      <button type="button" class="aggiungi-voce" data-azione-modulo="aggiungi-voce">+ Aggiungi un valore</button>
      <p class="aiuto">Etichetta piccola sopra, valore grande sotto. Colori (<code>tono</code>), livello e condizioni di ogni voce si impostano nella scheda Codice.</p></section>`);
  }
  if (tipo === 'grafico') {
    parti.push(`<section><h3>Linee</h3><p class="aiuto">${(o.serie || []).map((x) => `<code>${proteggi(x.campo)}</code> ${proteggi(x.etichetta || '')}`).join(' · ') || 'Nessuna linea'}.
      La query deve restituire una riga per istante con il campo <code>${proteggi(o.asse || '_time')}</code> e un campo per linea; le linee (<code>serie</code>), l'unità e i decimali si scrivono nella scheda Codice.</p></section>`);
  }
  if (tipo === 'testo') parti.push(`<section><h3>Testo</h3><textarea data-testo name="testo" rows="6">${proteggi(typeof o.testo === 'string' ? o.testo : '')}</textarea></section>`);
  if (tipo === 'immagine' || tipo === 'iframe') {
    parti.push(`<section><h3>Contenuto</h3><label>Indirizzo (URL)<input name="url" class="mono" value="${proteggi(o.url || '')}" placeholder="http://…" autocomplete="off"></label>
      ${tipo === 'immagine'
        ? `<label>Ricarica ogni<select name="aggiorna_ogni">${['0', '10s', '30s', '1m', '5m'].map((d) => `<option value="${d}"${String(o.aggiorna_ogni ?? '0') === d ? ' selected' : ''}>${d === '0' ? 'mai (stream continuo)' : d}</option>`).join('')}</select></label>`
        : `<label>Altezza in pixel<input name="altezza" type="number" min="100" step="10" value="${proteggi(o.altezza || 300)}"></label>`}</section>`);
  }
  }

  return [...parti, ...altreImpostazioni(o, tipo)].join('');
}

function altreImpostazioni(o, tipo) {
  const parti = [];
  // Default: the Settings' one (nascondi_vuote), images stay visible.
  const predefinito = CON_DATI.has(tipo) && meta.nascondiVuote !== false ? 'dati' : 'sempre';
  const mostra = o.mostra_se || predefinito;
  const ogni = o.ogni || '1m';
  if (CON_DATI.has(tipo)) {
    parti.push(`<section><h3>Colora la tile quando…</h3>
      <div class="regole-colore">${Object.entries(o.colore_se || {}).map(([c, s]) => rigaRegola(c, s)).join('')}</div>
      <button type="button" class="aggiungi-voce" data-azione-modulo="aggiungi-regola">+ Aggiungi una regola</button>
      <label class="cursore-intensita">Intensità dello sfondo (0% = nessuna tinta, nemmeno quella del gruppo)
        <span class="riga-cursore"><input type="range" name="intensita" min="0" max="40" step="1" value="${Number(o.intensita ?? 10)}" oninput="this.nextElementSibling.textContent = this.value + '%'"><output>${Number(o.intensita ?? 10)}%</output></span></label>
      <p class="aiuto">Una condizione sui dati, per esempio <code>valvola == acceso</code>, <code>temperatura &lt; 18</code>, <code>errori &gt; 0</code>: quando è vera la tile prende quel colore (e lo sfondo). Vince la prima regola vera.</p></section>`);
  }
  parti.push(`<section><h3>Quando compare</h3>
    ${CON_DATI.has(tipo) || tipo === 'immagine' ? `<label class="spunta interruttore"><input type="checkbox" name="sparisce" data-predefinito="${predefinito}"${mostra !== 'sempre' ? ' checked' : ''}>
      <span><b>Sparisce quando non ha niente da mostrare</b><br><span class="aiuto">${tipo === 'immagine' ? 'Telecamera spenta o non raggiungibile' : 'Nessun dato, oppure tutti i valori vuoti'}. Il predefinito si cambia in Impostazioni.</span></span></label>` : ''}
    ${CON_DATI.has(tipo) ? `<label>Aggiorna i dati ogni<select name="ogni">${[...new Set([...DURATE, ogni])].map((d) => `<option${d === ogni ? ' selected' : ''}>${d}</option>`).join('')}</select></label>` : ''}
    <label class="spunta"><input type="checkbox" name="attiva"${o.attiva === false ? '' : ' checked'}> Attiva (se la togli, la tile resta salvata ma non si vede)</label>
    ${meta.workspace.length > 1 ? `<fieldset class="anche-in"><legend>Mostra anche nei workspace</legend>${meta.workspace.filter((w) => w !== wsDellaTile).map((w) => `<label class="spunta"><input type="checkbox" name="anche_in" value="${proteggi(w)}"${(o.anche_in || []).includes(w) ? ' checked' : ''}> ${proteggi(w)}</label>`).join('')}</fieldset>` : ''}
  </section>`);
  parti.push(`<section><h3>Al click</h3><label>Apri questo indirizzo<input name="link" class="mono" value="${proteggi(o.link || '')}" placeholder="es. la dashboard Grafana completa" autocomplete="off"></label></section>`);
  return parti;
}

// index = position of the item in the file, so its tone and level are not lost; null = new item.
function rigaVoce(v = {}, indice = null) {
  return `<div class="voce-modulo"${indice === null ? '' : ` data-indice="${indice}"`}>
    <input data-testo name="voce.etichetta" value="${proteggi(typeof v.etichetta === 'string' ? v.etichetta : '')}" placeholder="Etichetta (es. Adesso)" autocomplete="off">
    <input data-testo class="mono" name="voce.valore" value="${proteggi(typeof v.valore === 'string' ? v.valore : '')}" placeholder="Valore (es. {live:1}°)" autocomplete="off">
    <button type="button" class="togli-voce" data-azione-modulo="togli-voce" title="Togli questo valore" aria-label="Togli questo valore">✕</button></div>`;
}

function testoDaLivelli(form, nome) {
  const v = Object.fromEntries(LIVELLI.map((l) => [l, form.elements[`${nome}.${l}`]?.value.trim() || '']));
  const pieni = LIVELLI.filter((l) => v[l]);
  if (!pieni.length) return null;
  if (pieni.length === 3 && v.base === v.intermedia && v.base === v.avanzata) return v.base;
  return Object.fromEntries(LIVELLI.map((l) => [l, v[l] || null]));
}

// Only the fields the forms handle: everything else in the file (elabora, comments, hand-written
// keys) stays as it is.
function campiDalModulo(form, o, tipo) {
  const el = form.elements;
  const campi = { titolo: el.titolo.value.trim(), etichetta: el.etichetta.value || null, colore: el.colore.value || null, icona: el.icona.value || null, sfondo: el.sfondo.checked ? true : (o.sfondo === undefined ? null : false) };
  // Intensity: written only if different from the default (10%) or if it was already there.
  if (el.intensita) {
    const n = Number(el.intensita.value);
    campi.intensita = n === 10 && o.intensita === undefined ? undefined : n;
  }
  if (CON_DATI.has(tipo) && el.sorgente) {
    const scelta = el.sorgente.value;
    const interno = String(scelta).match(TIPO_INTERNO);
    if (interno) {
      const { valori } = leggiModulo(form.querySelector('.campi-sorgente'));
      campi.dati = { ...valori, tipo: interno[1], sorgente: null, righe: null };
    } else if (scelta === '__statico') {
      const righe = el['dati.righe'].value.split('\n').map((r) => r.trim()).filter(Boolean).map((testo) => ({ testo }));
      campi.dati = { tipo: 'statico', righe, sorgente: null };
    } else {
      const { valori, mappe } = leggiModulo(form.querySelector('.campi-sorgente'));
      campi.dati = { ...valori, sorgente: scelta, tipo: null, righe: null };
      campi.__sostituisci = mappe.map((m) => ['dati', ...m]);
    }
    // A condition written in the code stays; otherwise data/always, and the default is not written.
    const casella = el.sparisce;
    if (casella && !(o.mostra_se && !['dati', 'sempre'].includes(o.mostra_se))) {
      const scelto = casella.checked ? 'dati' : 'sempre';
      campi.mostra_se = scelto === casella.dataset.predefinito && !o.mostra_se ? null : scelto;
    }
    campi.ogni = el.ogni.value;
  } else if (CON_DATI.has(tipo) && el.ogni) {
    // Tile of a kind: no data section, but "when it shows" and "how often" yes.
    const casella = el.sparisce;
    if (casella && !(o.mostra_se && !['dati', 'sempre'].includes(o.mostra_se))) {
      const scelto = casella.checked ? 'dati' : 'sempre';
      campi.mostra_se = scelto === casella.dataset.predefinito && !o.mostra_se ? null : scelto;
    }
    campi.ogni = el.ogni.value;
  }
  if (tipo === 'elenco' && !genereCorrente) {
    if (!o.tabella?.length) campi.riga = testoDaLivelli(form, 'riga');
    campi.vuoto = el.vuoto.value.trim() || null;
  }
  if (tipo === 'valore' && !genereCorrente) campi.testo = testoDaLivelli(form, 'testo');
  // Items of "values" and columns of "list": the keys the form does not show (tone, level) stay
  // those of the original item; a text written per level stays as it is.
  for (const box of form.querySelectorAll('.voci[data-chiave]')) {
    const chiave = box.dataset.chiave;
    const testo = (originale, campo) => (originale && typeof originale === 'object' ? originale : campo.value.trim());
    const voci = [...box.querySelectorAll('.voce-modulo')].map((riga) => {
      const v = riga.dataset.indice === undefined ? {} : o[chiave]?.[Number(riga.dataset.indice)] || {};
      return { ...v, etichetta: testo(v.etichetta, riga.querySelector('[name$=".etichetta"]')), valore: testo(v.valore, riga.querySelector('[name$=".valore"]')) };
    }).filter((v) => v.etichetta || v.valore);
    // Unchanged: not rewritten, so the file keeps its shape.
    if (JSON.stringify(voci) !== JSON.stringify(o[chiave] || [])) campi[chiave] = voci;
  }
  if (!genereCorrente) {
    if (tipo === 'testo') campi.testo = el.testo.value;
    if (tipo === 'immagine' || tipo === 'iframe') campi.url = el.url.value.trim();
    if (tipo === 'immagine') campi.aggiorna_ogni = el.aggiorna_ogni.value === '0' ? 0 : el.aggiorna_ogni.value;
    if (tipo === 'iframe') campi.altezza = Number(el.altezza.value) || 300;
  }
  if (tipo === 'immagine' && el.sparisce) campi.mostra_se = el.sparisce.checked ? 'dati' : null;
  // "From which level it shows" is no longer asked: where a tile shows is said by the 👁 (the
  // views). A livello_minimo written in the file stays as it is.
  campi.attiva = el.attiva.checked ? null : false;
  if (form.querySelector('[name="anche_in"]')) {
    const scelti = [...form.querySelectorAll('[name="anche_in"]:checked')].map((x) => x.value);
    if (JSON.stringify(scelti) !== JSON.stringify(o.anche_in || [])) campi.anche_in = scelti.length ? scelti : null;
  }
  campi.link = el.link.value.trim() || null;
  const regole = form.querySelector('.regole-colore');
  if (regole) {
    const voci = [...regole.querySelectorAll('.regola-colore')].map((r) => [
      r.querySelector('[data-regola="condizione"]').value.trim(),
      { colore: r.querySelector('[data-regola="etichetta"]').value || r.querySelector('[data-regola="colore"]:checked')?.value || 'rosso', sfondo: r.querySelector('[data-regola="sfondo"]').checked },
    ]).filter(([c]) => c);
    const nuovo = voci.length ? Object.fromEntries(voci.map(([c, s]) => [c, s.sfondo ? s.colore : s])) : null;
    if (JSON.stringify(nuovo) !== JSON.stringify(o.colore_se ?? null)) {
      campi.colore_se = nuovo;
      campi.__sostituisci = [...(campi.__sostituisci || []), ['colore_se']];
    }
  }
  return campi;
}

// The kind's fields, as a form: the "source" type becomes the choice among the sources of that
// type.
function defsGenere() {
  return genereCorrente.campi.map((c) => {
    if (c.tipo !== 'sorgente') return c;
    const nomi = meta.sorgenti.filter((s) => s.tipo === c.sorgente).map((s) => s.nome);
    // No "default" here: the form would not write the value and the server would not know which
    // source to use. If missing, the first one is preselected (in sezioneGenere) and gets saved.
    return { ...c, tipo: 'scelta', valori: Object.fromEntries(nomi.map((n) => [n, n])), predefinito: undefined,
      aiuto: c.aiuto || (nomi.length ? '' : `Nessuna sorgente di tipo ${c.sorgente}: creala da Sorgenti.`) };
  });
}

function valoriIniziali() {
  const v = { ...genereCorrente.valori };
  for (const c of genereCorrente.campi) {
    if (c.tipo === 'sorgente' && v[c.nome] === undefined) v[c.nome] = meta.sorgenti.find((x) => x.tipo === c.sorgente)?.nome;
    // A long default text (e.g. the columns) shows already written, to start from there.
    if (c.tipo === 'query' && v[c.nome] === undefined && c.predefinito != null) v[c.nome] = c.predefinito;
    // A list in the file shows as YAML (one line per element).
    if (c.tipo === 'query' && v[c.nome] && typeof v[c.nome] === 'object') v[c.nome] = comeYaml(v[c.nome]);
  }
  return v;
}

// The "dati" field of a kind: the source (of any type, the kind's preferred one offered) and the
// fields that source asks for, as in free tiles.
function bloccoDati(c, o) {
  const dati = o.dati || {};
  const preferita = meta.sorgenti.find((x) => x.tipo === c.preferita)?.nome || meta.sorgenti[0]?.nome || '__statico';
  const scelta = dati.tipo === 'statico' ? '__statico' : dati.tipo && !dati.sorgente ? `__tipo:${dati.tipo}` : dati.sorgente || preferita;
  return `<div class="campo-dati"><label>${proteggi(c.etichetta || 'Da dove')}${sceltaSorgente(scelta)}</label>
    ${c.aiuto ? `<p class="aiuto">${c.aiuto}</p>` : ''}
    <div class="campi-sorgente" data-ambito>${campiPerSorgente(scelta, dati)}</div></div>`;
}

function sezioneGenere(o) {
  const g = genereCorrente;
  const defs = defsGenere();
  const valori = valoriIniziali();
  // The fields in the kind's order; the "dati" block where the kind puts it.
  const parti = [];
  let gruppo = [];
  const chiudiGruppo = () => { if (gruppo.length) parti.push(disegnaModulo(gruppo, valori)); gruppo = []; };
  for (const c of defs) {
    if (c.tipo === 'dati') { chiudiGruppo(); parti.push(bloccoDati(c, o)); } else gruppo.push(c);
  }
  chiudiGruppo();
  return `<section class="sezione-genere"><h3>${icona(g.icona || 'grafico', 'icona-barra')} ${proteggi(g.nome)}</h3>
    ${g.descrizione ? `<p class="aiuto">${proteggi(g.descrizione)}</p>` : ''}
    <div class="campi-genere" data-ambito>${defs.length ? parti.join('') : '<p class="aiuto">Questo genere non chiede niente: la tile è già pronta.</p>'}</div></section>`;
}

// The tile as written in the file: kind, fields and only the keys different from the expanded
// model. Colour rules are compared in a single form: "rosso" and { colore: rosso, sfondo: true }
// are equal.
const regoleCanoniche = (r) => (r && typeof r === 'object' ? Object.fromEntries(Object.entries(r).map(([c, v]) => [c,
  typeof v === 'string' ? { colore: v, sfondo: true } : { colore: v?.colore, sfondo: v?.sfondo !== false }])) : r ?? null);
function uguale(k, a, b) {
  if (k === 'colore_se') return JSON.stringify(regoleCanoniche(a)) === JSON.stringify(regoleCanoniche(b));
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// conNull: for an existing tile, tweaks equal to the model again are removed (null); for a new one
// only what differs is written.
function scrittaDaGenere(form, espansa, puro, tipo, { conNull = false } = {}) {
  const box = form.querySelector('.campi-genere');
  const { valori } = box ? leggiModulo(box) : { valori: {} };
  const campi = Object.fromEntries(Object.entries(valori).filter(([, v]) => v !== '' && v !== null && v !== undefined));
  const dalModulo = campiDalModulo(form, espansa, tipo);
  // The kind's "dati" field (source and its fields) is a value of the kind, not a tweak.
  const campoDati = genereCorrente.campi.find((c) => c.tipo === 'dati');
  if (campoDati && dalModulo.dati) campi[campoDati.nome] = senzaVuoti(dalModulo.dati);
  const ritocchi = {};
  for (const [k, v] of Object.entries(dalModulo)) {
    if (k.startsWith('__') || (campoDati && k === 'dati')) continue;
    // Unchanged from the open tile: not touched (the existing tweak, or the model, stays). (Not for
    // a new tile: the chosen title and label are written even if untouched.)
    if (conNull && uguale(k, v, espansa[k])) continue;
    if (uguale(k, v, puro[k])) { if (conNull) ritocchi[k] = null; } else ritocchi[k] = v;
  }
  if (!conNull) return { ...ritocchi, genere: genereCorrente.id, campi };
  // Existing tile: of the kind's fields only the changed ones are sent (the others stay in the file
  // as written, with comments and compact { … } lines).
  const originali = genereCorrente.valori || {};
  const cambiati = {};
  for (const c of genereCorrente.campi) {
    const v = campi[c.nome], o = originali[c.nome];
    if (!stessoValore(c, v, o)) cambiati[c.nome] = v ?? null;
  }
  return { ...ritocchi, genere: genereCorrente.id, campi: cambiati, __cambiati: Object.keys(cambiati) };
}

// Is the value in the form the one already written in the file? (A list is compared as the form
// shows it, a text without surrounding spaces, an empty field with its default.)
const canonico = (x) => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
function stessoValore(c, v, o) {
  if (v === undefined || v === null || v === '') return o === undefined || o === null || o === '' || (c.predefinito != null && String(o) === String(c.predefinito));
  if (c.tipo === 'dati') {
    // Inside the data a list (e.g. the software, the services) arrives from the form as YAML text.
    if (!o || typeof o !== 'object' || !v || typeof v !== 'object') return canonico(v) === canonico(o);
    const chiavi = new Set([...Object.keys(v), ...Object.keys(o)]);
    return [...chiavi].every((k) => (typeof v[k] === 'string' && o[k] && typeof o[k] === 'object'
      ? v[k].trim() === comeYaml(o[k]).trim()
      : typeof v[k] === 'string' && typeof o[k] === 'string' ? v[k].trim() === o[k].trim() : canonico(v[k]) === canonico(o[k])));
  }
  if (o && typeof o === 'object') return typeof v === 'string' ? v.trim() === comeYaml(o).trim() : canonico(v) === canonico(o);
  if (c.tipo === 'numero') return Number(v) === Number(o);
  return String(v).trim() === String(o ?? '').trim();
}

function senzaVuoti(x) {
  if (Array.isArray(x)) return x.map(senzaVuoti);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => [k, senzaVuoti(v)]));
  return x;
}

function unisci(base, campi) {
  const r = structuredClone(base);
  for (const [k, v] of Object.entries(campi)) {
    if (k.startsWith('__')) continue;
    if (v === null) delete r[k];
    else if (v && typeof v === 'object' && !Array.isArray(v) && r[k] && typeof r[k] === 'object' && !Array.isArray(r[k])) r[k] = unisci(r[k], v);
    else r[k] = v;
  }
  return r;
}

function modificato(form, o, tipo) {
  return JSON.stringify(unisci(o, campiDalModulo(form, o, tipo))) !== JSON.stringify(o);
}
