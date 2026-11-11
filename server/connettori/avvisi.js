// Gli avvisi del centro avvisi (server/avvisi.js): i messaggi critici raccolti dalle tile con un
// blocco `avvisi:`, raggruppati e tenuti finché non vengono confermati.
//
// dati: { tipo: avvisi }   (nessuna sorgente)
// Righe: { chiave, messaggio, host, gravita, origine, primo, ultimo, volte, attivo, confermato, da_vedere }
//
// Azioni (senza password: segnare come visto non cambia niente fuori da Fluxboard):
//   { id: visto, etichetta: Visto, operazione: conferma, chiave: chiave, parametri: { chiave: "{chiave}" }, subito: true }
//   { id: tutti, etichetta: Visti tutti, operazione: conferma_tutti, globale: true }
//   { id: ignora, etichetta: Ignora, operazione: ignora, chiave: chiave, parametri: { chiave: "{chiave}" } }   per sempre
//   { id: ripristina, etichetta: Ripristina ignorati, operazione: ripristina_ignorati, globale: true }

import { avvisi } from '../avvisi.js';

export const tipo = 'avvisi';
export const nome = 'Centro avvisi';
export const gruppo = 'Monitoraggio';
export const descrizione = 'I messaggi critici raccolti dalle tile, raggruppati, finché non li segni come visti';
export const campiSorgente = [];
export const campiDati = [];
export const senzaSorgente = true;
export const azioniLibere = ['conferma', 'conferma_tutti', 'ignora', 'ripristina_ignorati'];

export async function leggi() {
  return avvisi.elenco();
}

export const azioni = {
  async conferma(_s, parametri) { return avvisi.conferma(parametri.chiave); },
  async conferma_tutti() { return avvisi.confermaTutti(); },
  async ignora(_s, parametri) { return avvisi.ignora(parametri.chiave); },
  async ripristina_ignorati() { return avvisi.ripristinaIgnorati(); },
};
