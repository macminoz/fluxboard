// Graphical pop-up choices, next to the button that opens them: a grid of icons and the views of a
// tile (checkboxes, multiple choice). They close with Esc or a click outside.

import { proteggi } from './formato.js';
import { NOMI_ICONE, icona } from './icone.js';

function comparsa(ancora, html, classe) {
  document.querySelector('.scelta-a-comparsa')?.remove();
  const box = document.createElement('div');
  box.className = `scelta-a-comparsa ${classe}`;
  box.innerHTML = html;
  document.body.append(box);
  const r = ancora.getBoundingClientRect();
  box.style.top = `${Math.min(r.bottom + 6 + scrollY, scrollY + innerHeight - box.offsetHeight - 8)}px`;
  box.style.left = `${Math.max(8, Math.min(r.right - box.offsetWidth, innerWidth - box.offsetWidth - 8))}px`;
  return box;
}

function attendi(box, ancora, alClick) {
  return new Promise((risolvi) => {
    const chiudi = (v) => { box.remove(); removeEventListener('pointerdown', fuori, true); removeEventListener('keydown', tasto, true); risolvi(v); };
    const fuori = (e) => { if (!box.contains(e.target) && !ancora.contains(e.target)) chiudi(null); };
    const tasto = (e) => { if (e.key === 'Escape') { e.preventDefault(); chiudi(null); ancora.focus?.(); } };
    box.addEventListener('click', (e) => alClick(e, chiudi));
    addEventListener('pointerdown', fuori, true);
    addEventListener('keydown', tasto, true);
  });
}

// Icon (and, if colours are passed, colour): returns the chosen name ('' for "none"), or { colore }
// if a colour was chosen; null if closed without choosing.
export function sceltaIcona(ancora, { attuale = '', titolo = 'Icona', colori = null, colore = '' } = {}) {
  const box = comparsa(ancora, `<p class="titolo-scelta">${proteggi(titolo)}</p>
    ${colori ? `<div class="colori-scelta">${colori.map((c) => `<button type="button" data-colore-scelto="${c}" title="${c}" aria-label="Colore ${c}" aria-pressed="${c === colore}" style="--tinta: var(--c-${c})"></button>`).join('')}</div>` : ''}
    <div class="griglia-icone">${NOMI_ICONE.map((n) => `<button type="button" data-icona-scelta="${n}" title="${n}" aria-label="${n}" aria-pressed="${n === attuale}">${icona(n, 'icona-barra')}</button>`).join('')}
      <button type="button" data-icona-scelta="" class="nessuna" title="Nessuna icona" aria-pressed="${!attuale}">∅</button></div>`, 'scelta-icona');
  box.querySelector('[aria-pressed="true"]')?.focus();
  return attendi(box, ancora, (e, chiudi) => {
    const c = e.target.closest('[data-colore-scelto]');
    if (c) { chiudi({ colore: c.dataset.coloreScelto }); return; }
    const b = e.target.closest('[data-icona-scelta]');
    if (b) chiudi(b.dataset.iconaScelta);
  });
}

// Where a tile shows: the views (all ticked = in all of them, as usual), or "Excluded" (shows
// nowhere, stays saved). Returns { viste, esclusa } or { togli } for a tile coming from another
// workspace; null if closed without choosing.
export function sceltaViste(ancora, { scelte = [], viste, esclusa = false, ospite = null }) {
  const tutte = !scelte.length;
  const box = comparsa(ancora, `<p class="titolo-scelta">Dove compare</p>
    <div class="elenco-viste">${Object.entries(viste).map(([k, v]) => `<label class="riga-scelta"><input type="checkbox" data-vista-scelta="${k}"${tutte || scelte.includes(k) ? ' checked' : ''}${esclusa ? ' disabled' : ''}> ${icona(v.icona, 'icona-barra')} ${proteggi(v.testo)}</label>`).join('')}</div>
    <label class="riga-scelta esclusa"><input type="checkbox" data-esclusa${esclusa ? ' checked' : ''}> ${icona('occhio_chiuso', 'icona-barra')} Esclusa: non compare, resta salvata</label>
    ${ospite ? `<button type="button" class="collegamento togli-ospite" data-togli>Togli da questo workspace (resta in «${proteggi(ospite)}»)</button>` : ''}
    <div class="azioni-scelta"><button type="button" data-annulla-scelta>Annulla</button><button type="button" class="primario" data-applica>Applica</button></div>`, 'scelta-viste');
  const caselle = () => [...box.querySelectorAll('[data-vista-scelta]')];
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-esclusa]')) caselle().forEach((c) => { c.disabled = e.target.checked; });
  });
  return attendi(box, ancora, (e, chiudi) => {
    if (e.target.closest('[data-annulla-scelta]')) chiudi(null);
    if (e.target.closest('[data-togli]')) chiudi({ togli: true });
    if (e.target.closest('[data-applica]')) {
      const v = caselle().filter((c) => c.checked).map((c) => c.dataset.vistaScelta);
      const fuori = box.querySelector('[data-esclusa]').checked || !v.length;
      chiudi({ esclusa: fuori, viste: fuori || v.length === caselle().length ? (fuori ? scelte : []) : v });
    }
  });
}
