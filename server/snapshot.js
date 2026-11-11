// Snapshots and export of the configuration: a single JSON file with every file of config/ (frame,
// sources, tiles and layouts of every workspace, certificates). Secrets are never there: only their
// names are saved, so an export can be handed to anyone.
//
// A snapshot is the same package kept in config/.snapshot/: take one before an experiment, and if
// it goes wrong restore it. Restoring (or importing) always takes an automatic snapshot of the
// current state first, so a restore can be undone too.

import fs from 'node:fs/promises';
import path from 'node:path';
import { classifica } from './config.js';

const FORMATO = 'fluxboard-config';
const CERTIFICATO = /^certificati\/[a-z0-9][a-z0-9._-]{0,80}\.(pem|crt)$/i;
const ammesso = (rel) => Boolean(classifica(rel)) || CERTIFICATO.test(rel);

async function* fileDi(cartella, base = '') {
  let voci = [];
  try { voci = await fs.readdir(path.join(cartella, base), { withFileTypes: true }); } catch { return; }
  for (const v of voci) {
    if (v.name.startsWith('.')) continue;                  // .storico, .cestino, .snapshot
    const rel = base ? `${base}/${v.name}` : v.name;
    if (v.isDirectory()) yield* fileDi(cartella, rel);
    else if (ammesso(rel)) yield rel;
  }
}

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const MASSIMO_CON_NOME = 5;
const MASSIMO_AUTOMATICI = 5;

export class Snapshot {
  constructor(config, segreti, versione) {
    this.config = config;
    this.segreti = segreti;
    this.versione = versione;
    this.cartella = path.join(config.cartella, '.snapshot');
  }

  async pacchetto(nome = '') {
    const file = {};
    for await (const rel of fileDi(this.config.cartella)) file[rel] = await fs.readFile(path.join(this.config.cartella, rel), 'utf8');
    return {
      formato: FORMATO, versione: this.versione, creato: new Date().toISOString(), nome,
      segreti: this.segreti.elenco(this.config.sorgenti).map((s) => s.nome),   // names only
      workspace: this.config.workspace,                                        // empty ones too
      file,
    };
  }

  async elenco() {
    let nomi = [];
    try { nomi = (await fs.readdir(this.cartella)).filter((f) => f.endsWith('.json')).sort().reverse(); } catch { /* nessuno */ }
    const voci = [];
    for (const f of nomi) {
      try {
        const p = JSON.parse(await fs.readFile(path.join(this.cartella, f), 'utf8'));
        voci.push({ id: f.replace(/\.json$/, ''), nome: p.nome, creato: p.creato, versione: p.versione, file: Object.keys(p.file || {}).length, automatico: Boolean(p.automatico) });
      } catch { /* file rovinato: si salta */ }
    }
    return voci;
  }

  // Named snapshots: at most MASSIMO_CON_NOME (the same name replaces the old one); automatic ones
  // (before a restore): the last MASSIMO_AUTOMATICI are kept.
  async crea(nome, { automatico = false } = {}) {
    const elenco = await this.elenco();
    if (!automatico) {
      if (!String(nome || '').trim()) throw Object.assign(new Error('serve un nome per lo snapshot'), { codice: 400 });
      const stesso = elenco.filter((v) => !v.automatico && v.nome === nome);
      if (!stesso.length && elenco.filter((v) => !v.automatico).length >= MASSIMO_CON_NOME) {
        throw Object.assign(new Error(`ci sono già ${MASSIMO_CON_NOME} snapshot con nome: eliminane uno o riusa un nome (lo sostituisce)`), { codice: 400 });
      }
      for (const v of stesso) await this.elimina(v.id);
    } else {
      const vecchi = elenco.filter((v) => v.automatico).sort((a, b) => String(b.creato).localeCompare(String(a.creato))).slice(MASSIMO_AUTOMATICI - 1);
      for (const v of vecchi) await this.elimina(v.id);
    }
    const p = { ...await this.pacchetto(nome || (automatico ? 'automatico' : 'snapshot')), automatico };
    const id = `${p.creato.replace(/[:.]/g, '-')}--${slug(p.nome) || 'snapshot'}`;
    await fs.mkdir(this.cartella, { recursive: true });
    await fs.writeFile(path.join(this.cartella, `${id}.json`), JSON.stringify(p, null, 1));
    return { id, nome: p.nome, file: Object.keys(p.file).length };
  }

  #percorso(id) {
    if (!/^[\w-]+$/.test(id || '')) throw Object.assign(new Error('snapshot non valido'), { codice: 400 });
    return path.join(this.cartella, `${id}.json`);
  }

  async leggi(id) {
    try { return JSON.parse(await fs.readFile(this.#percorso(id), 'utf8')); } catch (e) {
      if (e.codice) throw e;
      throw Object.assign(new Error('snapshot inesistente'), { codice: 404 });
    }
  }

  async elimina(id) { await fs.unlink(this.#percorso(id)); }

  // Puts config/ back exactly as it was in the package: files not in the package go to the trash
  // (recoverable), the package's files are rewritten.
  async applica(pacchetto, motivo) {
    if (pacchetto?.formato !== FORMATO || !pacchetto.file || typeof pacchetto.file !== 'object') {
      throw Object.assign(new Error('non è un export di Fluxboard'), { codice: 400 });
    }
    const estranei = Object.keys(pacchetto.file).filter((rel) => !ammesso(rel) || typeof pacchetto.file[rel] !== 'string');
    if (estranei.length) throw Object.assign(new Error(`percorsi non ammessi nel pacchetto: ${estranei.slice(0, 3).join(', ')}`), { codice: 400 });
    if (!pacchetto.file['global.yaml']) throw Object.assign(new Error('nel pacchetto manca global.yaml'), { codice: 400 });

    const prima = await this.crea(`prima di: ${motivo}`, { automatico: true });
    const marca = new Date().toISOString().replace(/[:.]/g, '-');
    for await (const rel of fileDi(this.config.cartella)) {
      if (rel in pacchetto.file) continue;
      const cestino = path.join(this.config.cartella, '.cestino', path.dirname(rel));
      await fs.mkdir(cestino, { recursive: true });
      await fs.rename(path.join(this.config.cartella, rel), path.join(cestino, `${path.basename(rel)}.${marca}`));
    }
    for (const [rel, testo] of Object.entries(pacchetto.file)) {
      const destinazione = path.join(this.config.cartella, rel);
      await fs.mkdir(path.dirname(destinazione), { recursive: true });
      const temporaneo = `${destinazione}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await fs.writeFile(temporaneo, testo);
      await fs.rename(temporaneo, destinazione);
    }
    // Workspaces: the package's ones are recreated (even empty); the others, now emptied, are
    // removed.
    const daTenere = new Set((pacchetto.workspace || []).filter((w) => w !== 'default'));
    for (const rel of Object.keys(pacchetto.file)) if (rel.startsWith('workspace/')) daTenere.add(rel.split('/')[1]);
    for (const ws of daTenere) for (const t of ['tile', 'layout']) await fs.mkdir(path.join(this.config.cartella, 'workspace', ws, t), { recursive: true });
    try {
      for (const ws of await fs.readdir(path.join(this.config.cartella, 'workspace'))) {
        if (!daTenere.has(ws)) await fs.rm(path.join(this.config.cartella, 'workspace', ws), { recursive: true, force: true });
      }
    } catch { /* nessun workspace */ }
    await this.config.carica();
    const mancanti = (pacchetto.segreti || []).filter((n) => !process.env[n] && n !== 'FLUXBOARD_ADMIN_PASSWORD');
    return { ok: true, prima: prima.id, file: Object.keys(pacchetto.file).length, segretiMancanti: mancanti };
  }
}
