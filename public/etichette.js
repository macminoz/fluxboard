// Labels (temperature, alarms, security…): each tile has one and takes from it colour, icon and the
// dashboard section it sits in. They are chosen and created on the fly, from the tile menu in Edit
// or from the editor, without going through the Settings. In global.yaml the key is still called
// "argomenti" (or "labels" in English).

export const ALTRO = '_altro';          // the section of the tiles without a label
export const COLORI = ['blu', 'azzurro', 'verde', 'giallo', 'arancio', 'rosso', 'viola', 'rosa', 'ciano', 'indaco', 'lime', 'ambra', 'marrone', 'grigio'];

export function nomeEtichetta(n) {
  if (!n || n === ALTRO) return 'Senza gruppo';
  const s = String(n).replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const slugEtichetta = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

// Creates a label with the first colour not yet used; returns the updated labels.
export async function creaEtichetta(nome, etichette) {
  const usati = new Set(Object.values(etichette || {}).map((a) => (typeof a === 'string' ? a : a?.colore)));
  const colore = COLORI.find((c) => !usati.has(c) && c !== 'grigio') || 'grigio';
  const tutte = { ...(etichette || {}), [nome]: { colore } };
  await salvaEtichette(tutte);
  return tutte;
}

export async function salvaEtichette(etichette) {
  const r = await fetch('/api/config/globale', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campi: { argomenti: etichette } }),
  });
  const esito = await r.json().catch(() => ({}));
  if (!r.ok || esito.ok === false) throw new Error(esito.errore || (esito.errori || []).join('; ') || `errore ${r.status}`);
}

// Asks for the name of a new label (null if cancelled).
export function chiediNuovaEtichetta() {
  return slugEtichetta(prompt('Nome della nuova etichetta (es. sicurezza, luci, rete)') || '') || null;
}
