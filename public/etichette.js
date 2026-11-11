// Etichette (temperatura, allarmi, sicurezza…): ogni tile ne ha una e da lei prende colore,
// icona e la sezione della dashboard in cui sta. Si scelgono e si creano al volo, dal menu della
// tile in Modifica o dall'editor, senza passare dalle Impostazioni.
// Nel file global.yaml la chiave si chiama ancora "argomenti" (compatibilità con la 0.1).

export const ALTRO = '_altro';          // la sezione delle tile senza etichetta
export const COLORI = ['blu', 'azzurro', 'verde', 'giallo', 'arancio', 'rosso', 'viola', 'rosa', 'ciano', 'indaco', 'lime', 'ambra', 'marrone', 'grigio'];

export function nomeEtichetta(n) {
  if (!n || n === ALTRO) return 'Senza gruppo';
  const s = String(n).replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const slugEtichetta = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

// Crea un'etichetta con il primo colore non ancora usato; restituisce le etichette aggiornate.
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

// Chiede il nome di un'etichetta nuova (null se annullato).
export function chiediNuovaEtichetta() {
  return slugEtichetta(prompt('Nome della nuova etichetta (es. sicurezza, luci, rete)') || '') || null;
}
