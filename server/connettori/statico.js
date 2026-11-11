// Rows written straight in the tile's YAML: notes, reminders, fixed lists. dati: { righe: [ {
// testo: "..." }, ... ] } (no source needed)

export const tipo = 'statico';
export const nome = 'Scritti a mano';
export const gruppo = 'Altro';
export const descrizione = 'Righe scritte a mano nella tile';
export const campiSorgente = [];
export const campiDati = [];
export const senzaSorgente = true;

export async function leggi(_sorgente, dati) {
  return (dati.righe || []).map((r) => (r && typeof r === 'object' ? r : { testo: r }));
}
