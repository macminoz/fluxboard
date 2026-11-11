// The header signal: it lights up (and blinks) when a tile, on any workspace, is in critical alert;
// yellow and steady for warnings. A click lists the alerts and goes to the tile. The sound (gentle,
// two notes) is per browser: it is turned on from the signal's menu, because browsers play sound
// only after a gesture of the viewer. The alerts are computed by the server (server/allerta.js).

import { apriMenu } from './menu.js';

function memoria(chiave, valore) {
  try {
    if (valore === undefined) return localStorage.getItem(chiave);
    localStorage.setItem(chiave, valore);
  } catch { return null; }
  return valore;
}

let precedenti = null;   // ids of the critical alerts already seen: sound only for new ones
let audio = null;

const suonoAcceso = () => memoria('fluxboard.suono') === '1';

function suona() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + 0.02;
    for (const [i, f] of [880, 660].entries()) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = t0 + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.4);
    }
  } catch { /* niente audio: resta il segnale */ }
}

export function aggiornaSegnale(lista = []) {
  const b = document.getElementById('segnale');
  if (!b) return;
  const gravi = lista.filter((x) => x.livello === 'grave');
  b.hidden = !lista.length;
  b.dataset.livello = gravi.length ? 'grave' : 'avviso';
  const primo = lista[0];
  b.querySelector('.testo-segnale').textContent = primo ? `${primo.titolo}${lista.length > 1 ? ` +${lista.length - 1}` : ''}` : '';
  b.title = lista.map((x) => `${x.livello === 'grave' ? '🚨' : '⚠️'} ${x.titolo}${x.dettaglio ? `: ${x.dettaglio}` : ''}`).join('\n');
  b.setAttribute('aria-label', `${lista.length} allert${lista.length === 1 ? 'a' : 'e'}: ${b.title}`);
  const ids = new Set(gravi.map((x) => x.id));
  if (precedenti && suonoAcceso() && [...ids].some((id) => !precedenti.has(id))) suona();
  precedenti = ids;
}

// pagina(): the current page; vai(workspace, idTile): goes to the tile.
export function attivaSegnale({ pagina, vai }) {
  const b = document.getElementById('segnale');
  b.addEventListener('click', async () => {
    const lista = pagina()?.allerte || [];
    const v = await apriMenu(b, [
      ...lista.map((x) => ({ valore: `tile:${x.id}`, testo: `${x.livello === 'grave' ? '🚨' : '⚠️'} ${x.titolo}${x.dettaglio ? ` — ${x.dettaglio.length > 70 ? `${x.dettaglio.slice(0, 69)}…` : x.dettaglio}` : ''}${x.workspace !== pagina().workspace.attuale ? ` · in ${x.workspace}` : ''}` })),
      { separatore: true },
      { valore: 'suono', testo: suonoAcceso() ? '🔔 Suono acceso in questo browser (click per spegnere)' : '🔕 Suono spento (click per accenderlo in questo browser)', scelto: suonoAcceso() },
    ]);
    if (v === 'suono') {
      memoria('fluxboard.suono', suonoAcceso() ? '0' : '1');
      if (suonoAcceso()) suona();   // prova, e sblocca l'audio del browser
    } else if (v?.startsWith('tile:')) {
      const x = lista.find((a) => `tile:${a.id}` === v);
      if (x) vai(x.workspace, x.id);
    }
  });
}
