// Tile catalogue (Tile market): ready-made models in catalogo/<id>.yaml, shipped with the code.
// Each model declares the source type it needs and the parameters to ask for; adding it writes a
// normal tile in config/tile/, which remembers where it comes from with `da_catalogo`. The model
// format is described in catalogo/README.md.

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { durata } from './util.js';
import { inInglese } from './alias.js';
import { t, traduci } from '../public/lingua.js';

const SEGNAPOSTO = /\{\{(\w+)\}\}/g;

export class Catalogo {
  constructor(cartella) { this.cartella = cartella; }

  // Re-read at every request: they are few files, and a new model shows up without a restart.
  async elenco() {
    let nomi = [];
    try { nomi = (await fs.readdir(this.cartella)).filter((f) => /^[a-z0-9-]+\.yaml$/.test(f)); } catch { return []; }
    const voci = [];
    for (const f of nomi.sort()) {
      try {
        const o = YAML.parse(await fs.readFile(path.join(this.cartella, f), 'utf8'));
        if (!o?.mercato || !o?.tile) continue;
        const m = o.mercato;
        voci.push({
          id: f.replace(/\.yaml$/, ''),
          nome: m.nome || o.tile.titolo || f,
          descrizione: m.descrizione || '',
          genere: m.genere || null,      // the kind it is listed under in the market
          icona: m.icona || null,
          sorgente: m.sorgente || null,
          indirizzo: m.indirizzo || null,   // for external APIs: only the sources pointing there
          parametri: (m.parametri || []).map((p) => ({ nome: p.nome, etichetta: p.etichetta || p.nome, tipo: p.tipo || 'testo', esempio: p.esempio ?? '' })),
          tipo: o.tile.tipo,
        });
      } catch (e) { console.error(`[catalogo] ${f}: ${e.message}`); }
    }
    return voci;
  }

  async modello(id) {
    if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error('modello non valido');
    try { return YAML.parse(await fs.readFile(path.join(this.cartella, `${id}.yaml`), 'utf8')); }
    catch { throw new Error(`il modello "${id}" non è nel catalogo`); }
  }

  // The tile ready to save: placeholders replaced, `da_catalogo` added. Errors for every missing or
  // badly written parameter.
  async costruisci(id, { sorgente, parametri = {}, lingua = 'it' } = {}) {
    const o = await this.modello(id);
    const m = o.mercato;
    const valori = { sorgente: sorgente || '' };
    if (m.sorgente && !sorgente) throw new Error(`serve una sorgente di tipo "${m.sorgente}"`);
    for (const p of m.parametri || []) {
      const grezzo = parametri[p.nome] ?? '';
      const testo = typeof grezzo === 'string' ? grezzo.trim() : grezzo;
      if (testo === '' || testo == null) throw new Error(`manca "${p.etichetta || p.nome}"`);
      if (p.tipo === 'numero') {
        if (!Number.isFinite(Number(testo))) throw new Error(`"${p.etichetta || p.nome}" deve essere un numero`);
        valori[p.nome] = Number(testo);
      } else if (p.tipo === 'durata') {
        if (durata(testo) == null) throw new Error(`"${p.etichetta || p.nome}": una durata come 30m, 6h, 7d`);
        valori[p.nome] = String(testo);
      } else if (p.tipo === 'yaml') {
        let v;
        try { v = typeof testo === 'string' ? YAML.parse(testo) : testo; } catch (e) { throw new Error(`"${p.etichetta || p.nome}": YAML non valido (${e.message.split('\n')[0]})`); }
        if (!Array.isArray(v) || !v.length) throw new Error(`"${p.etichetta || p.nome}": serve un elenco (righe che iniziano con "- ")`);
        valori[p.nome] = v;
      } else valori[p.nome] = String(testo);
    }
    // We work on the YAML document, not on the object: the written tile keeps the model's comments
    // and style (the compact { … } lines).
    const doc = YAML.parseDocument(await fs.readFile(path.join(this.cartella, `${id}.yaml`), 'utf8'));
    const nodo = doc.get('tile', true);
    YAML.visit(nodo, {
      Scalar(_k, n) {
        if (typeof n.value !== 'string') return undefined;
        const intero = n.value.match(/^\{\{(\w+)\}\}$/);
        if (intero && intero[1] in valori) {
          const v = valori[intero[1]];
          if (typeof v !== 'object') { n.value = v; n.type = undefined; return undefined; }
          const nuovo = doc.createNode(v);
          // A list of objects is written as in the models: one { … } line per item.
          if (YAML.isSeq(nuovo)) for (const el of nuovo.items) if (YAML.isMap(el)) el.flow = true;
          return nuovo;
        }
        n.value = n.value.replace(SEGNAPOSTO, (x, nome) => (nome in valori ? String(valori[nome]) : x));
        return undefined;
      },
    });
    nodo.set('da_catalogo', id);
    const uscita = new YAML.Document();
    uscita.contents = nodo;
    const tile = uscita.toJSON();
    if (lingua === 'en') return { tile, testo: inglese(tile, m) };
    const testa = `# ${m.nome}: ${m.descrizione || ''}\n# Aggiunta dal Tile market il ${new Date().toLocaleDateString('it-IT')}: da qui in poi è una tile come le altre.\n`;
    return { tile, testo: testa + uscita.toString({ lineWidth: 0 }) };
  }
}

// The tile for an English installation: English keys and values (server/alias.js) and the
// human text of the recipe (title, column headings, empty message, confirmations) in English.
// The label (`etichetta`) at the top stays as it is: it is the name of a label in global.yaml.
const FORMATI_EN = { durata: 'duration', nome: 'name', ora: 'time', data: 'date', casella: 'mailbox' };
function inglese(tile, m) {
  const testi = (x, dentroElenco = false) => {
    if (Array.isArray(x)) return x.map((v) => testi(v, true));
    if (!x || typeof x !== 'object') return x;
    return Object.fromEntries(Object.entries(x).map(([k, v]) => {
      if (typeof v === 'string' && (['titolo', 'vuoto', 'conferma', 'messaggio'].includes(k) || (k === 'etichetta' && dentroElenco) || k === 'valore')) {
        // Paragraph by paragraph (a confirmation can have more than one); formats in English.
        return [k, v.split(/\n\n+/).map((p) => traduci(p)).join('\n\n').replace(/\{([^{}:|]+(?:\|[^{}:]+)?):(durata|nome|ora|data|casella)\}/g, (_, c, f) => `{${c}:${FORMATI_EN[f]}}`)];
      }
      return [k, testi(v, dentroElenco)];
    }));
  };
  const doc = new YAML.Document(inInglese(testi(tile)));
  // Lists of objects as in the recipes: one compact { … } line per item.
  YAML.visit(doc, { Seq(_k, s) { for (const el of s.items) if (YAML.isMap(el)) el.flow = true; } });
  const testa = `# ${traduci(m.nome)}: ${traduci(m.descrizione || '')}\n# Added from the Tile market on ${new Date().toISOString().slice(0, 10)}: from now on it is a tile like any other.\n`;
  return testa + doc.toString({ lineWidth: 0 });
}
