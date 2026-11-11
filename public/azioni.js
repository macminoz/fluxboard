// Pulsanti delle azioni (accendi una VM, aggiungi un record DNS…). Il browser sa solo come
// mostrarli: al click chiede conferma (ed eventuali campi), poi il server decide ed esegue con i
// dati della riga che ha letto lui. Le azioni chiedono la password dell'editor.

import { proteggi, riempi } from './formato.js';
import { compilaCondizione } from './condizione.js';
import { apriMenu } from './menu.js';

const vale = (a, riga, ctx) => {
  if (ctx.controlli === false) return false;
  if (ctx.livelli.indexOf(ctx.livello) < ctx.livelli.indexOf(a.livello || 'intermedia')) return false;
  if (!a.quando) return true;
  try { return compilaCondizione(a.quando)(riga); } catch { return false; }
};

const pulsante = (t, a, chiave = '') => `<button type="button" class="azione"${a.tono ? ` data-tono="${proteggi(a.tono)}"` : ''}
  data-azione-tile="${proteggi(t.id)}" data-azione-id="${proteggi(a.id)}" data-riga="${proteggi(chiave)}">${proteggi(a.etichetta || a.id)}</button>`;

// Le azioni di una riga (es. "Spegni" accanto a una VM accesa).
export function pulsantiRiga(t, riga, ctx) {
  const valide = (t.azioni || []).filter((a) => !a.globale && vale(a, riga, ctx));
  return valide.length ? `<span class="azioni-riga">${valide.map((a) => pulsante(t, a, riga[a.chiave || 'id'])).join('')}</span>` : '';
}

// Le azioni della tile intera (es. "+ Aggiungi record DNS"), più lo storico di quello che è stato
// nascosto con Ack o Ignora (s.ignorati), da cui si riammette una riga alla volta.
export function pulsantiTile(t, ctx, s) {
  const valide = (t.azioni || []).filter((a) => a.globale && vale(a, {}, ctx));
  const storico = ctx.controlli !== false && s?.ignorati?.length
    ? `<button type="button" class="azione storico-ignorati" data-ignorati="${proteggi(t.id)}" title="Righe nascoste con Ack o Ignora: da qui si riammettono">Ignorati · ${s.ignorati.length}</button>` : '';
  return valide.length || storico ? `<div class="azioni-tile">${valide.map((a) => pulsante(t, a)).join('')}${storico}</div>` : '';
}

const breve = (ms) => { const m = Math.round(Math.abs(ms) / 60_000); return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}g`; };

async function chiedi(a, riga, fuso) {
  // `subito: true`: niente finestra di conferma (azioni innocue, es. segnare un avviso come visto).
  if (a.subito && !(a.campi || []).length) return {};
  const dlg = document.getElementById('dlg-azione');
  dlg.querySelector('h2').textContent = a.etichetta || a.id;
  dlg.querySelector('.domanda').innerHTML = a.conferma ? riempi(a.conferma, riga, fuso) : 'Confermi?';
  dlg.querySelector('.campi-azione').innerHTML = (a.campi || []).map((c) => `<label>${proteggi(c.etichetta || c.nome)}
    ${c.valori ? `<select name="${proteggi(c.nome)}">${c.valori.map((v) => `<option>${proteggi(v)}</option>`).join('')}</select>`
      : `<input name="${proteggi(c.nome)}" ${c.formato ? `pattern="${proteggi(c.formato)}"` : ''} placeholder="${proteggi(c.esempio || '')}" autocomplete="off" ${c.obbligatorio === false ? '' : 'required'}>`}</label>`).join('');
  const conferma = dlg.querySelector('[data-conferma]');
  conferma.textContent = a.etichetta || 'Conferma';
  conferma.dataset.tono = a.tono || '';
  const form = dlg.querySelector('form');
  return new Promise((risolvi) => {
    // La domanda cita i campi: si aggiorna mentre si scrive ("Creare prova.casa.lan → 192.168.1.9?").
    form.oninput = () => {
      const valori = Object.fromEntries(new FormData(form));
      if (a.conferma) dlg.querySelector('.domanda').innerHTML = riempi(a.conferma, { ...riga, ...valori }, fuso);
    };
    form.onsubmit = (e) => { e.preventDefault(); if (!form.reportValidity()) return; dlg.close(); risolvi(Object.fromEntries(new FormData(form))); };
    dlg.querySelector('[data-annulla]').onclick = () => { dlg.close(); risolvi(null); };
    dlg.oncancel = () => risolvi(null);
    dlg.showModal();
    (dlg.querySelector('.campi-azione input, .campi-azione select') || dlg.querySelector('[data-annulla]')).focus();
  });
}

// pagina(): la pagina corrente (tile e stato); avvisa(testo): mostra un messaggio breve.
export function attivaAzioni(griglia, { pagina, avvisa, fuso }) {
  // In cattura: l'azione parte prima di qualunque altro click sulla tile (es. il suo link).
  griglia.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-ignorati]');
    if (s) {
      e.stopPropagation();
      e.preventDefault();
      const p = pagina();
      const elenco = p.stato[s.dataset.ignorati]?.ignorati || [];
      const corto = (x) => (x.length > 80 ? `${x.slice(0, 79)}…` : x);
      const scelta = await apriMenu(s, elenco.map((x) => ({ valore: x.chiave,
        testo: `↺ ${corto(x.testo)} · ${x.fino === null ? `ignorato${x.dal ? ` ${breve(Date.now() - x.dal)} fa` : ''}` : `Ack, torna fra ${breve(x.fino - Date.now())}`}` })));
      if (!scelta) return;
      const r = await fetch('/api/config/riammetti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tile: s.dataset.ignorati, chiave: scelta }) });
      const esito = await r.json().catch(() => ({ ok: false, messaggio: `errore ${r.status}` }));
      avvisa(esito.ok ? `✓ ${esito.messaggio}` : `✕ ${esito.messaggio || esito.errore}`);
      return;
    }
    const b = e.target.closest('[data-azione-tile]');
    if (!b) return;
    e.stopPropagation();                         // non aprire il link della tile
    e.preventDefault();
    const p = pagina();
    const t = p.tile.find((x) => x.id === b.dataset.azioneTile);
    const a = t?.azioni?.find((x) => x.id === b.dataset.azioneId);
    if (!a) return;
    const riga = a.globale ? {} : (p.stato[t.id]?.righe || []).find((r) => String(r[a.chiave || 'id']) === b.dataset.riga) || {};
    const campi = await chiedi(a, riga, fuso());
    if (!campi) return;
    b.disabled = true;
    try {
      const r = await fetch('/api/config/azione', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tile: t.id, azione: a.id, riga: b.dataset.riga, campi }),
      });
      const esito = await r.json().catch(() => ({ ok: false, messaggio: `errore ${r.status}` }));
      avvisa(esito.ok ? `✓ ${esito.messaggio}` : `✕ ${esito.messaggio || esito.errore}`);
    } catch (err) { avvisa(`✕ ${err.message}`); }
    b.disabled = false;
  }, true);
}
