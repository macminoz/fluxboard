// Registro dei connettori. Ogni file .js in questa cartella e nella cartella `plugin/` del
// progetto che esporta `tipo` e `leggi()` diventa un tipo di sorgente utilizzabile nel YAML.
//
// Interfaccia di un connettore (è l'unico contratto "da programmatore" di Fluxboard):
//   export const tipo = 'nome';                    // il valore di `tipo:` nel file della sorgente
//   export const descrizione = '...';
//   export const campiSorgente = ['url', ...];      // obbligatori nel file della sorgente
//   export const campiDati = ['query', ...];        // obbligatori nel blocco `dati:` della tile
//   export async function leggi(sorgente, dati, { signal }) { return [ { ... }, ... ]; }

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function caricaConnettori(cartelle) {
  const registro = new Map();
  for (const cartella of cartelle) {
    let file = [];
    try { file = await fs.readdir(cartella); } catch { continue; }
    for (const nome of file.filter((f) => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('.')).sort()) {
      try {
        const modulo = await import(pathToFileURL(path.join(cartella, nome)).href);
        if (!modulo.tipo || typeof modulo.leggi !== 'function') continue;
        registro.set(modulo.tipo, modulo);
      } catch (e) {
        console.error(`[connettori] ${nome} non caricato: ${e.message}`);
      }
    }
  }
  return registro;
}
