// Secrets (tokens, passwords) used by the sources as ${NAME}. They live in config/segreti.env,
// outside git, and are changed from the web editor in write-only mode: the value goes in but never
// comes back, only its last 4 characters are shown to recognise it (as GitHub or Stripe do with
// keys and cards). An expired token is replaced without opening a terminal.

import fs from 'node:fs/promises';
import path from 'node:path';

const NOME = /^[A-Z][A-Z0-9_]{0,63}$/;
const RIFERIMENTO = /\$\{([A-Z0-9_]+)\}/g;

function analizza(testo) {
  const valori = new Map();
  for (const riga of testo.split('\n')) {
    const m = riga.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    valori.set(m[1], v);
  }
  return valori;
}

function serializza(valori) {
  const righe = [...valori].map(([k, v]) => `${k}=${/[\s#"'$]/.test(v) ? JSON.stringify(v) : v}`);
  return `# Segreti di Fluxboard: si modificano da /config → Segreti. Non va in git.\n${righe.join('\n')}\n`;
}

export class Segreti {
  constructor(file) {
    this.file = file;
    this.valori = new Map();
  }

  // To call at start-up: the file's values win over those already in the environment (.env).
  async carica() {
    try { this.valori = analizza(await fs.readFile(this.file, 'utf8')); } catch { this.valori = new Map(); }
    for (const [k, v] of this.valori) process.env[k] = v;
  }

  // Every name quoted by the sources plus the saved ones, with who uses them and whether they are
  // set.
  elenco(sorgenti) {
    const usi = new Map();
    for (const [nome, s] of Object.entries(sorgenti)) {
      for (const [, v] of JSON.stringify(s).matchAll(RIFERIMENTO)) usi.set(v, [...(usi.get(v) || []), nome]);
    }
    // The editor and actions password is always in the list, even if no source quotes it.
    usi.set('FLUXBOARD_ADMIN_PASSWORD', ['editor e azioni']);
    const nomi = [...new Set([...usi.keys(), ...this.valori.keys()])].sort();
    return nomi.map((nome) => {
      const valore = process.env[nome] || '';
      return {
        nome,
        impostato: Boolean(valore),
        // Of a password not even the end is shown.
        finale: valore.length >= 12 && !/PASSWORD/.test(nome) ? valore.slice(-4) : '',
        origine: this.valori.has(nome) ? 'editor' : valore ? 'ambiente' : null,
        usatoDa: usi.get(nome) || [],
      };
    });
  }

  // empty value = removes the secret from the file.
  async imposta(nome, valore) {
    if (!NOME.test(nome)) throw Object.assign(new Error('nome non valido: maiuscole, cifre e _ (es. INFLUX_TOKEN)'), { codice: 400 });
    const v = String(valore ?? '').trim();
    if (/[\n\r]/.test(v)) throw Object.assign(new Error('il valore non può andare a capo'), { codice: 400 });
    if (v) { this.valori.set(nome, v); process.env[nome] = v; } else { this.valori.delete(nome); delete process.env[nome]; }
    const temporaneo = `${this.file}.tmp`;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(temporaneo, serializza(this.valori), { mode: 0o600 });
    await fs.rename(temporaneo, this.file);
  }
}
