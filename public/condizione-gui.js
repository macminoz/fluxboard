// Editor grafico di una condizione ("valvola == acceso e temperatura < 18"): una riga per pezzo
// con campo · operatore · valore, unite da "e" (tutte vere) oppure "o" (almeno una). Produce la
// stessa stringa che si scriverebbe a mano (public/condizione.js). Una condizione che le righe non
// sanno rappresentare (calcoli, campo contro campo…) resta modificabile come testo.

import { proteggi } from './formato.js';

export const OPERATORI = [
  ['==', '='], ['!=', '≠'], ['>', '>'], ['>=', '≥'], ['<', '<'], ['<=', '≤'],
  ['~', 'contiene'], ['!~', 'non contiene'], ['entro', 'negli ultimi'], ['oltre', 'da più di'],
];
const PEZZO = /^([\w.]+)\s*(==|!=|>=|<=|>|<|!~|~)\s*(.+)$/;
const TEMPO = /^([\w.]+)\s+(entro|oltre)\s+(\d+(?:\.\d+)?\s*[smhd])$/;

// "a == b e c > 1" → { unione: 'e', pezzi: [{ campo, op, valore }] }; null se non si può.
export function scomponi(testo) {
  const t = String(testo || '').trim();
  if (!t) return { unione: 'e', pezzi: [] };
  const conO = /\s+o\s+/.test(t), conE = /\s+e\s+/.test(t);
  if (conO && conE) return null;                  // misto: solo come testo
  const unione = conO ? 'o' : 'e';
  const pezzi = [];
  for (const parte of t.split(unione === 'o' ? /\s+o\s+/ : /\s+e\s+/)) {
    const m = parte.trim().match(TEMPO) || parte.trim().match(PEZZO);
    if (!m) return null;
    let valore = m[3].trim();
    if (/^".*"$|^'.*'$/.test(valore)) valore = valore.slice(1, -1);
    else if (/[{}%]/.test(valore)) return null;   // campo contro campo, calcoli: testo
    pezzi.push({ campo: m[1], op: m[2], valore });
  }
  return { unione, pezzi };
}

export function componi(unione, pezzi) {
  const valore = (op, v) => {
    if (op === 'entro' || op === 'oltre') return String(v).replace(/\s+/g, '');
    const s = String(v).trim();
    if (s === '' ) return '""';
    if (/^-?\d+(\.\d+)?$/.test(s) || ['true', 'false', 'null'].includes(s)) return s;
    return /[\s"']/.test(s) ? `"${s.replace(/"/g, '')}"` : s;
  };
  return pezzi.filter((p) => p.campo).map((p) => (p.op === 'entro' || p.op === 'oltre'
    ? `${p.campo} ${p.op} ${valore(p.op, p.valore)}`
    : `${p.campo} ${p.op} ${valore(p.op, p.valore)}`)).join(` ${unione} `);
}

function rigaPezzo(p = { campo: '', op: '==', valore: '' }) {
  return `<span class="pezzo">
    <input class="mono" data-pezzo="campo" list="campi-anteprima" value="${proteggi(p.campo)}" placeholder="campo" autocomplete="off">
    <select data-pezzo="op">${OPERATORI.map(([op, testo]) => `<option value="${op}"${op === p.op ? ' selected' : ''}>${testo}</option>`).join('')}</select>
    <input data-pezzo="valore" value="${proteggi(p.valore)}" placeholder="${p.op === 'entro' || p.op === 'oltre' ? 'es. 5m, 1h' : 'valore'}" autocomplete="off">
    <button type="button" class="togli-pezzo" data-azione-condizione="togli" aria-label="Togli questa parte">✕</button></span>`;
}

// HTML dell'editor. `nome`: dove sta la stringa risultante (un input nascosto con data-regola o name).
export function editorCondizione(testo, attributo) {
  const parti = scomponi(testo);
  const comeTesto = parti === null;
  const { unione, pezzi } = parti || { unione: 'e', pezzi: [] };
  return `<div class="condizione-gui${comeTesto ? ' come-testo' : ''}" data-unione="${unione}">
    <input type="hidden" ${attributo} value="${proteggi(testo || '')}">
    <div class="pezzi">${(pezzi.length ? pezzi : [undefined]).map(rigaPezzo).join(`<span class="unione">${unione}</span>`)}</div>
    <div class="azioni-condizione">
      <button type="button" class="collegamento" data-azione-condizione="aggiungi">+ un'altra condizione</button>
      <span class="scelta-unione"><select data-azione-condizione="unione" aria-label="Quante devono essere vere"><option value="e"${unione === 'e' ? ' selected' : ''}>tutte vere</option><option value="o"${unione === 'o' ? ' selected' : ''}>almeno una vera</option></select></span>
      <button type="button" class="collegamento" data-azione-condizione="testo">${comeTesto ? 'usa le righe' : 'scrivi come testo'}</button>
    </div>
    <input class="mono testo-condizione" value="${proteggi(testo || '')}" placeholder="es. valvola == acceso" autocomplete="off">
  </div>`;
}

// Tiene allineata la stringa nascosta con quello che si vede; da chiamare a ogni input/change.
function sincronizza(box) {
  const nascosto = box.querySelector('input[type="hidden"]');
  if (box.classList.contains('come-testo')) { nascosto.value = box.querySelector('.testo-condizione').value.trim(); return; }
  const unione = box.dataset.unione;
  const pezzi = [...box.querySelectorAll('.pezzo')].map((p) => ({
    campo: p.querySelector('[data-pezzo="campo"]').value.trim(),
    op: p.querySelector('[data-pezzo="op"]').value,
    valore: p.querySelector('[data-pezzo="valore"]').value,
  }));
  nascosto.value = componi(unione, pezzi);
  box.querySelector('.testo-condizione').value = nascosto.value;
}

function ridisegnaUnioni(box) {
  box.querySelectorAll('.pezzi .unione').forEach((u) => u.remove());
  const pezzi = [...box.querySelectorAll('.pezzo')];
  pezzi.slice(1).forEach((p) => p.insertAdjacentHTML('beforebegin', `<span class="unione">${box.dataset.unione}</span>`));
}

// Delegazione degli eventi, una volta per contenitore (il modulo dell'editor).
export function attivaCondizioni(radice, quandoCambia = () => {}) {
  radice.addEventListener('click', (e) => {
    const b = e.target.closest('[data-azione-condizione]');
    if (!b || b.tagName === 'SELECT') return;
    const box = b.closest('.condizione-gui');
    const azione = b.dataset.azioneCondizione;
    if (azione === 'aggiungi') { box.querySelector('.pezzi').insertAdjacentHTML('beforeend', rigaPezzo()); ridisegnaUnioni(box); }
    if (azione === 'togli') {
      if (box.querySelectorAll('.pezzo').length > 1) b.closest('.pezzo').remove();
      else b.closest('.pezzo').querySelectorAll('input').forEach((i) => { i.value = ''; });
      ridisegnaUnioni(box);
    }
    if (azione === 'testo') {
      if (box.classList.contains('come-testo')) {
        const parti = scomponi(box.querySelector('.testo-condizione').value);
        if (!parti) { b.textContent = 'troppo complessa per le righe'; return; }
        box.dataset.unione = parti.unione;
        box.querySelector('[data-azione-condizione="unione"]').value = parti.unione;
        box.querySelector('.pezzi').innerHTML = (parti.pezzi.length ? parti.pezzi : [undefined]).map(rigaPezzo).join('');
        ridisegnaUnioni(box);
        box.classList.remove('come-testo');
        b.textContent = 'scrivi come testo';
      } else { box.classList.add('come-testo'); b.textContent = 'usa le righe'; }
    }
    sincronizza(box);
    quandoCambia();
  });
  const aggiorna = (e) => {
    const box = e.target.closest('.condizione-gui');
    if (!box) return;
    if (e.target.dataset.azioneCondizione === 'unione') { box.dataset.unione = e.target.value; ridisegnaUnioni(box); }
    if (e.target.dataset.pezzo === 'op') {
      const v = e.target.closest('.pezzo').querySelector('[data-pezzo="valore"]');
      v.placeholder = ['entro', 'oltre'].includes(e.target.value) ? 'es. 5m, 1h' : 'valore';
    }
    sincronizza(box);
  };
  radice.addEventListener('input', aggiorna);
  radice.addEventListener('change', aggiorna);
}
