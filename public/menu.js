// A small pop-up menu under a button (workspace, reading level…). voci: [{ valore, testo, scelto?,
// pericolo?, separatore? }] → Promise of the chosen value (or null).

import { proteggi } from './formato.js';

export function apriMenu(ancora, voci) {
  document.querySelector('.menu-a-comparsa')?.remove();
  const menu = document.createElement('div');
  menu.className = 'menu-a-comparsa';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = voci.map((v) => (v.separatore ? '<hr>' : `<button type="button" role="menuitemradio" aria-checked="${Boolean(v.scelto)}" data-valore="${proteggi(v.valore)}"${v.pericolo ? ' class="pericolo"' : ''}>
      <span class="spunta-menu" aria-hidden="true">${v.scelto ? '✓' : ''}</span>${proteggi(v.testo)}</button>`)).join('');
  document.body.append(menu);
  const r = ancora.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6 + scrollY}px`;
  menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
  menu.querySelector('button')?.focus();
  return new Promise((risolvi) => {
    const chiudi = (valore) => { menu.remove(); removeEventListener('pointerdown', fuori, true); removeEventListener('keydown', tasto, true); risolvi(valore); };
    const fuori = (e) => { if (!menu.contains(e.target) && e.target !== ancora && !ancora.contains(e.target)) chiudi(null); };
    const tasto = (e) => { if (e.key === 'Escape') { e.preventDefault(); chiudi(null); ancora.focus(); } };
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-valore]'); if (b) chiudi(b.dataset.valore); });
    addEventListener('pointerdown', fuori, true);
    addEventListener('keydown', tasto, true);
  });
}
