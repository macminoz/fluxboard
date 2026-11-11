// Segreti (token, password) usati dalle sorgenti come ${NOME}. Stanno in config/segreti.env,
// fuori da git, e si cambiano dall'editor web in sola scrittura: il valore entra ma non torna
// mai indietro, se ne mostrano solo le ultime 4 cifre per riconoscerlo (come fanno GitHub o Stripe
// con chiavi e carte). Così un token scaduto si sostituisce senza aprire un terminale.

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

  // Da chiamare all'avvio: i valori del file vincono su quelli già nell'ambiente (.env).
  async carica() {
    try { this.valori = analizza(await fs.readFile(this.file, 'utf8')); } catch { this.valori = new Map(); }
    for (const [k, v] of this.valori) process.env[k] = v;
  }

  // Tutti i nomi citati dalle sorgenti più quelli salvati, con chi li usa e se sono impostati.
  elenco(sorgenti) {
    const usi = new Map();
    for (const [nome, s] of Object.entries(sorgenti)) {
      for (const [, v] of JSON.stringify(s).matchAll(RIFERIMENTO)) usi.set(v, [...(usi.get(v) || []), nome]);
    }
    // La password di editor e azioni c'è sempre nell'elenco, anche se nessuna sorgente la cita.
    usi.set('FLUXBOARD_ADMIN_PASSWORD', ['editor e azioni']);
    const nomi = [...new Set([...usi.keys(), ...this.valori.keys()])].sort();
    return nomi.map((nome) => {
      const valore = process.env[nome] || '';
      return {
        nome,
        impostato: Boolean(valore),
        // Di una password non si mostra nemmeno la fine.
        finale: valore.length >= 12 && !/PASSWORD/.test(nome) ? valore.slice(-4) : '',
        origine: this.valori.has(nome) ? 'editor' : valore ? 'ambiente' : null,
        usatoDa: usi.get(nome) || [],
      };
    });
  }

  // valore vuoto = rimuove il segreto dal file.
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
