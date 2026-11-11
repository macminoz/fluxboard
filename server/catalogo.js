// Catalogo delle tile (tile market): modelli pronti in catalogo/<id>.yaml, distribuiti con il codice.
// Ogni modello dichiara il tipo di sorgente che gli serve e i parametri da chiedere; aggiungerlo
// scrive una tile normale in config/tile/, che ricorda da dove viene con `da_catalogo`.
// Il formato dei modelli è descritto in catalogo/LEGGIMI.md.

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { durata } from './util.js';

const SEGNAPOSTO = /\{\{(\w+)\}\}/g;

export class Catalogo {
  constructor(cartella) { this.cartella = cartella; }

  // Riletto a ogni richiesta: sono pochi file, e così un modello nuovo si vede senza riavviare.
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
          genere: m.genere || null,      // il genere sotto cui compare nel market
          icona: m.icona || null,
          sorgente: m.sorgente || null,
          indirizzo: m.indirizzo || null,   // per le API esterne: solo le sorgenti che puntano lì
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

  // La tile pronta da salvare: segnaposto sostituiti, `da_catalogo` aggiunto. Errori in italiano
  // per ogni parametro mancante o scritto male.
  async costruisci(id, { sorgente, parametri = {} } = {}) {
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
    // Si lavora sul documento YAML, non sull'oggetto: la tile scritta conserva commenti e stile
    // (le righe { … } compatte) del modello.
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
          // Un elenco di oggetti si scrive come nei modelli: una riga { … } per elemento.
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
    const testa = `# ${m.nome}: ${m.descrizione || ''}\n# Aggiunta dal Tile market il ${new Date().toLocaleDateString('it-IT')}: da qui in poi è una tile come le altre.\n`;
    return { tile, testo: testa + uscita.toString({ lineWidth: 0 }) };
  }
}
