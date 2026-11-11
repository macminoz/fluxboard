// Tile market = "Add tile". The kinds (generi/) are the chapters: for each one start from scratch
// (the editor asks only for the kind's fields) or from a ready-made tile of the catalogue (pick the
// source and a few parameters). In the second tab the workspace's tiles with their switch: a
// switched-off tile stays saved and is switched back on from here without losing anything.

import { proteggi } from './formato.js';
import { icona } from './icone.js';
import { gestisciSorgenti } from './editor-sorgente.js';

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

// "Probes (ports, web pages, DNS)" → "Probes": the detail in brackets is already in the
// description.
const breve = (s) => String(s || '').replace(/\s*\(.*\)\s*$/, '');
const NOMI_TIPI = { elenco: 'Elenco', valori: 'Valori', valore: 'Valore', grafico: 'Grafico', cronologia: 'Cronologia', testo: 'Testo', orologio: 'Orologio', immagine: 'Immagine', iframe: 'Pagina' };

export async function apriMercato({ workspace = 'default', ricarica, scheda = 'catalogo' }) {
  let scelta = null;        // { genere } o { libera }: alla chiusura si apre l'editor
  const dlg = document.getElementById('dlg-mercato');
  const corpo = dlg.querySelector('.corpo-mercato');
  const esito = dlg.querySelector('.esito');
  const cerca = dlg.querySelector('.cerca-mercato');
  let dati = await api(`/mercato?workspace=${encodeURIComponent(workspace)}`);
  let aperto = null;          // id of the model with the add form open
  let cambiato = false;
  const aggiunte = [];      // ids of the added tiles: on closing the page shows them
  const segnala = (testo, errore = false) => { esito.innerHTML = testo ? `<p class="${errore ? 'errore' : 'ok'}">${errore ? '✕' : '✓'} ${proteggi(testo)}</p>` : ''; };
  const corrisponde = (...testi) => { const q = cerca.value.trim().toLowerCase(); return !q || testi.some((t) => String(t || '').toLowerCase().includes(q)); };

  // The example is a hint, not a value: a model added without looking must not land on the
  // dashboard with made-up addresses. For lists there is "Use the example".
  function campo(p) {
    const id = `mp-${p.nome}`;
    const esempio = proteggi(String(p.esempio ?? ''));
    const ingresso = p.tipo === 'yaml'
      ? `<textarea id="${id}" name="${proteggi(p.nome)}" rows="${Math.min(8, String(p.esempio).split('\n').length + 1)}" spellcheck="false" class="codice" placeholder="${esempio}"></textarea>
         <span class="aiuto-campo">Un elemento per riga, come nell'esempio. <button type="button" class="collegamento" data-usa-esempio="${proteggi(p.nome)}">Usa l'esempio e modificalo</button></span>`
      : `<input id="${id}" name="${proteggi(p.nome)}" placeholder="${esempio ? `es. ${esempio}` : ''}" ${p.tipo === 'numero' ? 'inputmode="numeric"' : ''} autocomplete="off">`;
    return `<label class="campo-mercato" for="${id}"><span>${proteggi(p.etichetta)}${p.tipo === 'durata' ? ' <i>(es. 30m, 6h, 7d)</i>' : ''}</span>${ingresso}</label>`;
  }

  function scheda_(v) {
    const manca = v.sorgente && !v.sorgenti.length;
    const n = v.aggiunte.length;
    const modulo = aperto === v.id ? `<div class="modulo-mercato" data-modulo="${proteggi(v.id)}">
        ${v.sorgente ? `<label class="campo-mercato"><span>Sorgente</span>
          <select name="sorgente">${v.sorgenti.map((s) => `<option>${proteggi(s)}</option>`).join('')}</select></label>` : ''}
        ${v.parametri.map(campo).join('')}
        <div class="azioni-mercato"><button type="button" data-annulla-aggiunta>Annulla</button><button type="button" class="primario" data-conferma="${proteggi(v.id)}">Aggiungi alla dashboard</button></div>
      </div>` : '';
    return `<article class="voce-mercato${aperto === v.id ? ' aperta' : ''}">
      <div class="testa-voce">
        <span class="icona-voce" aria-hidden="true">${icona(v.icona || 'grafico')}</span>
        <div class="testo-voce"><h4>${proteggi(v.nome)}</h4><p>${proteggi(v.descrizione)}</p>
          <p class="meta-voce">${v.sorgente ? `<span${manca ? ' class="manca"' : ''}>${manca ? 'serve una sorgente ' : 'da '}${proteggi(breve(v.nomeSorgente))}</span>` : ''}${n ? `<span class="aggiunta">già aggiunta${n > 1 ? ` ×${n}` : ''}</span>` : ''}</p>
        </div>
        ${aperto === v.id ? '' : manca
          ? `<button type="button" data-nuova-sorgente="${proteggi(v.sorgente)}">Crea la sorgente</button>`
          : `<button type="button" class="${n ? '' : 'primario'}" data-aggiungi="${proteggi(v.id)}">${n ? 'Aggiungi ancora' : 'Aggiungi'}</button>`}
      </div>${modulo}</article>`;
  }

  // One chapter per kind: "From scratch" and the ready-made tiles of that kind. The ready-made ones
  // without a kind at the bottom.
  let filtroGenere = '';
  function disegnaCatalogo() {
    const voci = dati.catalogo.filter((v) => corrisponde(v.nome, v.descrizione, v.nomeSorgente));
    const generi = [...dati.generi, { id: '', nome: 'Altre tile pronte', descrizione: '', icona: 'negozio', senzaZero: true }];
    const capitoli = generi.filter((g) => !filtroGenere || g.id === filtroGenere).map((g) => {
      const proprie = voci.filter((v) => (v.genere || '') === g.id && (g.id || !dati.generi.some((x) => x.id === v.genere)));
      if (g.senzaZero && !proprie.length) return '';
      if (!proprie.length && !corrisponde(g.nome, g.descrizione)) return '';
      return `<section class="genere-mercato">
        <header class="testa-genere"><span class="icona-voce" aria-hidden="true">${icona(g.icona || 'grafico')}</span>
          <div><h3>${proteggi(g.nome)}${g.origine === 'propri' ? ' <i>(tuo)</i>' : ''}</h3>${g.descrizione ? `<p>${proteggi(g.descrizione)}</p>` : ''}</div>
          ${g.senzaZero ? '' : `<button type="button" class="da-zero" data-da-zero="${proteggi(g.id)}">${icona('piu', 'icona-barra')} Da zero</button>`}</header>
        ${proprie.length ? `<div class="voci-mercato">${proprie.map(scheda_).join('')}</div>` : ''}</section>`;
    }).join('');
    const chip = (id, nome) => `<button type="button" class="chip-genere" data-filtro-genere="${proteggi(id)}" aria-pressed="${filtroGenere === id}">${proteggi(nome)}</button>`;
    corpo.innerHTML = `<nav class="filtro-generi" aria-label="Generi">${chip('', 'Tutti')}${dati.generi.map((g) => chip(g.id, g.nome)).join('')}</nav>
      ${capitoli || '<p class="vuoto">Niente corrisponde alla ricerca.</p>'}
      <p class="piede-galleria aiuto">Serve qualcosa che qui non c'è? <button type="button" class="collegamento" data-libera>Componi una tile libera</button> (sorgente, query e aspetto a mano).</p>`;
    if (aperto) corpo.querySelector('[data-modulo] input, [data-modulo] textarea, [data-modulo] select')?.focus();
  }

  function disegnaMie() {
    const tile = dati.tile.filter((t) => corrisponde(t.titolo, t.id, t.etichetta, t.sorgente));
    corpo.innerHTML = `<p class="aiuto">Una tile spenta resta salvata con tutta la sua configurazione: non si vede sulla dashboard e non legge la sua sorgente finché non la riaccendi.</p>
      ${tile.length ? `<ul class="mie-tile">${tile.map((t) => `<li class="${t.attiva ? '' : 'spenta'}">
        <label class="levetta" title="${t.attiva ? 'Spegni' : 'Accendi'}"><input type="checkbox" role="switch" data-interruttore="${proteggi(t.id)}"${t.attiva ? ' checked' : ''}><span class="cursore" aria-hidden="true"></span><span class="solo-lettore">${proteggi(t.titolo)}</span></label>
        <span class="nome-mia"><b>${proteggi(t.titolo)}</b><span>${proteggi(NOMI_TIPI[t.tipo] || t.tipo || '')}${t.sorgente ? ` · ${proteggi(t.sorgente)}` : ''}${t.etichetta ? ` · ${proteggi(t.etichetta)}` : ''}${t.da_catalogo ? ' · dal catalogo' : ''}</span></span>
        ${t.da_catalogo ? `<button type="button" class="rimuovi" data-rimuovi="${proteggi(t.id)}" title="Rimuovi (va nel cestino, si può ripristinare)">Rimuovi</button>` : ''}
      </li>`).join('')}</ul>` : '<p class="vuoto">Nessuna tile corrisponde alla ricerca.</p>'}`;
  }

  let schedaAttiva = scheda;
  function disegna() {
    dlg.querySelectorAll('[data-scheda]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.scheda === schedaAttiva)));
    const spente = dati.tile.filter((t) => !t.attiva).length;
    dlg.querySelector('.conta-mie').textContent = `${dati.tile.length}${spente ? ` · ${spente} spente` : ''}`;
    if (schedaAttiva === 'catalogo') disegnaCatalogo(); else disegnaMie();
  }
  const rileggi = async () => { dati = await api(`/mercato?workspace=${encodeURIComponent(workspace)}`); disegna(); };

  dlg.onclick = async (e) => {
    const b = (sel) => e.target.closest(sel);
    try {
      if (b('[data-filtro-genere]')) { filtroGenere = b('[data-filtro-genere]').dataset.filtroGenere; aperto = null; disegna(); return; }
      if (b('[data-da-zero]')) { scelta = { genere: b('[data-da-zero]').dataset.daZero }; await chiudi(); return; }
      if (b('[data-libera]')) { scelta = { libera: true }; await chiudi(); return; }
      if (b('[data-scheda]')) { schedaAttiva = b('[data-scheda]').dataset.scheda; aperto = null; segnala(''); disegna(); return; }
      if (b('[data-aggiungi]')) { aperto = b('[data-aggiungi]').dataset.aggiungi; segnala(''); disegna(); return; }
      if (b('[data-annulla-aggiunta]')) { aperto = null; disegna(); return; }
      if (b('[data-usa-esempio]')) {
        e.preventDefault();
        const nome = b('[data-usa-esempio]').dataset.usaEsempio;
        const area = corpo.querySelector(`[data-modulo] textarea[name="${CSS.escape(nome)}"]`);
        area.value = area.placeholder;
        area.focus();
        return;
      }
      if (b('[data-nuova-sorgente]')) { await gestisciSorgenti({ nuova: true }); await rileggi(); return; }
      if (b('[data-conferma]')) {
        const id = b('[data-conferma]').dataset.conferma;
        const modulo = corpo.querySelector(`[data-modulo="${CSS.escape(id)}"]`);
        const parametri = Object.fromEntries([...modulo.querySelectorAll('input, textarea')].map((x) => [x.name, x.value]));
        const r = await api('/mercato/aggiungi', { method: 'POST', body: { id, workspace, sorgente: modulo.querySelector('select')?.value, parametri } });
        if (!r.ok) { segnala((r.errori || ['non aggiunta']).join(' · '), true); return; }
        cambiato = true;
        aperto = null;
        aggiunte.push(r.id);
        segnala(`«${r.titolo || r.id}» aggiunta: chiudendo il market la trovi evidenziata sulla dashboard`);
        await rileggi();
        return;
      }
      if (b('[data-rimuovi]')) {
        const id = b('[data-rimuovi]').dataset.rimuovi;
        const t = dati.tile.find((x) => x.id === id);
        if (!confirm(`Rimuovere «${t?.titolo || id}»? Va nel cestino e si può ripristinare dall'editor YAML.`)) return;
        await api(`/file?percorso=${encodeURIComponent(`tile/${id}.yaml`)}`, { method: 'DELETE' });
        cambiato = true;
        segnala(`«${t?.titolo || id}» rimossa`);
        await rileggi();
      }
    } catch (err) { segnala(err.message, true); }
  };
  dlg.onchange = async (e) => {
    const sw = e.target.closest('[data-interruttore]');
    if (!sw) return;
    const id = sw.dataset.interruttore;
    const t = dati.tile.find((x) => x.id === id);
    try {
      const r = await api('/tile', { method: 'PUT', body: { id, campi: { attiva: sw.checked ? null : false } } });
      if (r.ok === false) throw new Error((r.errori || ['non salvato']).join(' · '));
      cambiato = true;
      t.attiva = sw.checked;
      sw.closest('li').classList.toggle('spenta', !sw.checked);
      segnala(`«${t.titolo}» ${sw.checked ? 'accesa' : 'spenta'}`);
      disegna();
    } catch (err) { sw.checked = !sw.checked; segnala(err.message, true); }
  };
  cerca.oninput = () => { aperto = null; disegna(); };
  dlg.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.closest('[data-modulo] input')) { e.preventDefault(); corpo.querySelector('[data-conferma]')?.click(); }
  };

  cerca.value = '';
  segnala('');
  disegna();
  let risolvi;
  const chiudi = async () => { dlg.close(); if (cambiato) await ricarica(); risolvi({ aggiunte, ...(scelta || {}) }); };
  return new Promise((r) => {
    risolvi = r;
    dlg.querySelector('[data-chiudi]').onclick = chiudi;
    dlg.querySelector('[data-annulla]').onclick = chiudi;
    dlg.oncancel = (e) => { e.preventDefault(); chiudi(); };
    dlg.showModal();
  });
}
