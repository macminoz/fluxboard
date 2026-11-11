// "Dashboard settings" window: the main keys of global.yaml without opening the file. Labels
// (temperature, alarms…) have colour, icon and background; their order is the priority used by
// "Tidy up the tiles".

import { proteggi } from './formato.js';
import { COLORI } from './etichette.js';
import { NOMI_ICONE, icona } from './icone.js';

const LIVELLI = ['base', 'intermedia', 'avanzata'];

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

const scelta = (nome, valori, attuale) => `<select data-campo="${nome}">${valori.map((v) => `<option${String(v) === String(attuale) ? ' selected' : ''}>${v}</option>`).join('')}</select>`;

function rigaArgomento(nome = '', a = {}, esistente = false) {
  const x = typeof a === 'string' ? { colore: a } : a;
  return `<div class="riga-argomento" data-colore="${proteggi(x.colore || 'grigio')}">
    <span class="segno-tile">${icona(x.icona || '')}</span>
    <input data-campo="nome" class="mono" value="${proteggi(nome)}" placeholder="nome" ${esistente ? 'readonly title="Le tile usano questo nome: per cambiarlo creane uno nuovo"' : ''} autocomplete="off">
    ${scelta('colore', COLORI, x.colore || 'blu')}
    <select data-campo="icona"><option value="">nessuna icona</option>${NOMI_ICONE.map((n) => `<option${x.icona === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
    <label class="spunta"><input type="checkbox" data-campo="sfondo"${x.sfondo ? ' checked' : ''}> sfondo pieno (solo senza sezioni)</label>
    <span class="sposta"><button type="button" data-sposta="su" aria-label="Più priorità">↑</button><button type="button" data-sposta="giu" aria-label="Meno priorità">↓</button></span>
    <button type="button" class="togli-voce" data-togli aria-label="Togli">✕</button></div>`;
}

// The browser in short, from its User-Agent: "Chrome 95 · Android", "Safari · iPhone"…
function nomeBrowser(ua = '') {
  const v = (re) => (ua.match(re) || [])[1];
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const b = v(/Edg\/(\d+)/) ? `Edge ${v(/Edg\/(\d+)/)}` : v(/Chrome\/(\d+)/) ? `Chrome ${v(/Chrome\/(\d+)/)}` : v(/Firefox\/(\d+)/) ? `Firefox ${v(/Firefox\/(\d+)/)}` : /Safari/.test(ua) ? `Safari ${v(/Version\/(\d+)/) || ''}`.trim() : 'browser';
  return [b, sistema, /Crestron|TSW/i.test(ua) ? 'Crestron' : ''].filter(Boolean).join(' · ');
}

function schermiHtml(elenco, regole, profili) {
  if (!elenco.length) return '<p class="aiuto">Nessuno schermo ancora (si ricordano dal riavvio di Fluxboard in poi).</p>';
  const regolaDi = (s) => regole.find((r) => r.indirizzo === s.indirizzo && !r.browser)?.display || '';
  const quando = (ms) => { const m = Math.round((Date.now() - ms) / 60_000); return m < 1 ? 'adesso' : m < 60 ? `${m}m fa` : m < 1440 ? `${Math.round(m / 60)}h fa` : `${Math.round(m / 1440)}g fa`; };
  return `<table class="tabella"><thead><tr><th>Indirizzo</th><th>Browser</th><th>Visto</th><th>Profilo</th></tr></thead><tbody>${elenco.map((s) => `
    <tr title="${proteggi(s.browser)}"><td>${proteggi(s.indirizzo)}</td><td>${proteggi(nomeBrowser(s.browser))}</td><td>${quando(s.visto)}</td>
      <td><select data-schermo="${proteggi(s.indirizzo)}"><option value="">automatico (${proteggi(s.display)})</option>${profili.map((p) => `<option value="${proteggi(p)}"${regolaDi(s) === p ? ' selected' : ''}>${proteggi(p)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
}

// The rules by address chosen here; the hand-written ones (by browser, by start of address) stay.
function regoleSchermi(corpo, regole) {
  const scelte = [...corpo.querySelectorAll('[data-schermo]')];
  const toccati = new Set(scelte.map((s) => s.dataset.schermo));
  const altre = regole.filter((r) => r.browser || !toccati.has(r.indirizzo));
  const nuove = [...new Map(scelte.filter((s) => s.value).map((s) => [s.dataset.schermo, { indirizzo: s.dataset.schermo, display: s.value }])).values()];
  const tutte = [...nuove, ...altre];
  return tutte.length ? tutte : null;
}

export async function apriImpostazioni({ ricarica }) {
  const dlg = document.getElementById('dlg-impostazioni');
  const corpo = dlg.querySelector('.corpo-impostazioni');
  const esito = dlg.querySelector('.esito');
  const { globale: g } = await api('/globale');
  const { schermi: elenco = [], regole = [] } = await api('/schermi').catch(() => ({}));
  corpo.innerHTML = `
    <label>Titolo<input name="titolo" value="${proteggi(g.titolo || '')}" autocomplete="off"></label>
    <div class="due-colonne">
      <label>Vista predefinita (il livello di dettaglio)<select name="livello">${LIVELLI.map((l) => `<option value="${l}"${l === (g.livello || 'intermedia') ? ' selected' : ''}>${{ base: 'Base', intermedia: 'Media', avanzata: 'Avanzata' }[l]}</option>`).join('')}</select></label>
      <label>Tema${scelta('tema', ['auto', 'chiaro', 'scuro'], g.tema || 'auto').replace('data-campo="tema"', 'name="tema"')}</label>
    </div>
    <label>Lingua<select name="lingua">${[['en', 'English'], ['it', 'Italiano']].map(([v, n]) => `<option value="${v}"${v === (g.lingua || 'en') ? ' selected' : ''} data-non-tradurre>${n}</option>`).join('')}</select></label>
    <label>Rileggi le sorgenti ogni (se la tile non dice altro)${scelta('aggiornamento', ['30s', '1m', '2m', '5m', '15m'], g.aggiornamento || '1m').replace('data-campo="aggiornamento"', 'name="aggiornamento"')}</label>
    <label class="spunta interruttore"><input type="checkbox" name="nascondi_vuote"${g.nascondi_vuote === false ? '' : ' checked'}>
      <span><b>Le tile senza niente da mostrare spariscono</b><br><span class="aiuto">Predefinito per tutte le tile con dati; ogni tile può cambiarlo nel suo editor.</span></span></label>
    <label class="spunta interruttore"><input type="checkbox" name="sezioni"${g.sezioni === false ? '' : ' checked'}>
      <span><b>Raggruppa le tile in sezioni, una per etichetta</b><br><span class="aiuto">Temperature con le temperature, infrastruttura con l'infrastruttura… Ogni sezione si chiude con un click e in Modifica si allarga dall'angolo.</span></span></label>
    <section><h3>Etichette</h3>
      <p class="aiuto">Ogni tile ha un'etichetta e ne prende colore e icona. L'ordine è quello delle sezioni (si cambia anche trascinandole in Modifica) e la priorità di <b>Riordina le tile</b>.</p>
      <div class="argomenti">${Object.entries(g.argomenti || {}).map(([n, a]) => rigaArgomento(n, a, true)).join('')}</div>
      <button type="button" class="aggiungi-voce" data-aggiungi>+ Aggiungi un'etichetta</button>
    </section>
    <section><h3>Schermi</h3>
      <p class="aiuto">Chi ha aperto Fluxboard, con indirizzo e browser. A uno schermo si può dare un profilo fisso: per un pannello touch a muro scegli un profilo con <code>pannello: true</code> (sola lettura, leggero, si scorre col dito). Vale quando l'indirizzo della pagina non dice già <code>?display=…</code>.</p>
      <div class="schermi">${schermiHtml(elenco, regole, Object.keys(g.display || {}))}</div>
    </section>`;
  esito.innerHTML = '';

  corpo.onclick = (e) => {
    if (e.target.closest('[data-aggiungi]')) corpo.querySelector('.argomenti').insertAdjacentHTML('beforeend', rigaArgomento());
    const riga = e.target.closest('.riga-argomento');
    if (!riga) return;
    if (e.target.closest('[data-togli]')) riga.remove();
    const s = e.target.closest('[data-sposta]');
    if (s?.dataset.sposta === 'su' && riga.previousElementSibling) riga.parentElement.insertBefore(riga, riga.previousElementSibling);
    if (s?.dataset.sposta === 'giu' && riga.nextElementSibling) riga.parentElement.insertBefore(riga.nextElementSibling, riga);
  };
  corpo.onchange = (e) => {
    const riga = e.target.closest('.riga-argomento');
    if (!riga) return;
    riga.dataset.colore = riga.querySelector('[data-campo="colore"]').value;
    riga.querySelector('.segno-tile').innerHTML = icona(riga.querySelector('[data-campo="icona"]').value);
  };

  return new Promise((risolvi) => {
    const chiudi = (cambiato) => { dlg.close(); if (cambiato) ricarica(); risolvi(); };
    dlg.querySelector('[data-chiudi]').onclick = () => chiudi(false);
    dlg.querySelector('[data-annulla]').onclick = () => chiudi(false);
    dlg.oncancel = (e) => { e.preventDefault(); chiudi(false); };
    dlg.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const f = dlg.querySelector('form').elements;
      const argomenti = {};
      for (const r of corpo.querySelectorAll('.riga-argomento')) {
        const nome = r.querySelector('[data-campo="nome"]').value.trim().toLowerCase();
        if (!nome) continue;
        const icona_ = r.querySelector('[data-campo="icona"]').value;
        const sfondo = r.querySelector('[data-campo="sfondo"]').checked;
        argomenti[nome] = { colore: r.querySelector('[data-campo="colore"]').value, ...(icona_ ? { icona: icona_ } : {}), ...(sfondo ? { sfondo: true } : {}) };
      }
      try {
        const r = await api('/globale', { method: 'PUT', body: { campi: {
          titolo: f.titolo.value.trim() || 'Fluxboard', livello: f.livello.value, lingua: f.lingua.value, tema: f.tema.value, aggiornamento: f.aggiornamento.value,
          nascondi_vuote: f.nascondi_vuote.checked ? null : false, sezioni: f.sezioni.checked ? null : false, argomenti, schermi: regoleSchermi(corpo, regole),
        } } });
        if (!r.ok) { esito.innerHTML = r.errori.map((x) => `<p class="errore">✕ ${proteggi(x)}</p>`).join(''); return; }
        chiudi(true);
      } catch (err) { esito.innerHTML = `<p class="errore">✕ ${proteggi(err.message)}</p>`; }
    };
    dlg.showModal();
  });
}
