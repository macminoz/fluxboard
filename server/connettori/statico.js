// Righe scritte direttamente nel YAML della tile: note, promemoria, elenchi fissi.
//
// dati: { righe: [ { testo: "..." }, ... ] }   (non serve una sorgente)

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
