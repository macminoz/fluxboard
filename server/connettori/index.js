// Connector registry. Every .js file in this folder and in the project's `plugin/` folder that
// exports `tipo` and `leggi()` becomes a source type usable in YAML.
//
// Connector interface (the only "programmer" contract of Fluxboard):
//   export const tipo = 'name';                    // the value of `tipo:` in the source file
//   export const descrizione = '...';
//   export const campiSorgente = ['url', ...];      // required in the source file
//   export const campiDati = ['query', ...];        // required in the tile's `dati:` block
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
