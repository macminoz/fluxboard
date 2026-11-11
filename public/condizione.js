// Condizioni semplici e sicure (niente eval), usate sia dal server (passaggio "filtra" di
// elabora) sia dalla pagina (colori delle voci di una tile "valori"). Per questo vivono in
// public/: il browser le carica così come sono, il server le importa da qui.

const OPERATORI = {
  '==': (a, b) => a == b, // eslint-disable-line eqeqeq
  '!=': (a, b) => a != b, // eslint-disable-line eqeqeq
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '~': (a, b) => new RegExp(b, 'i').test(String(a ?? '')),
  '!~': (a, b) => !new RegExp(b, 'i').test(String(a ?? '')),
};

function letterale(testo) {
  const t = testo.trim();
  if (/^".*"$|^'.*'$/.test(t)) return t.slice(1, -1);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

// Condizione semplice e sicura (niente eval): "campo op valore", "campo % 2 == 1", "campo",
// "!campo", "fascia1 == {set}" (confronto fra due campi), "quando entro 5m" / "dal oltre 1h" (date). Più condizioni si uniscono con " e " (tutte vere) oppure " o " (almeno una).
export function compilaCondizione(espressione) {
  const testo = String(espressione).trim();
  if (/\s+o\s+/.test(testo)) {
    const parti = testo.split(/\s+o\s+/).map(compilaCondizione);
    return (r) => parti.some((p) => p(r));
  }
  if (/\s+e\s+/.test(testo)) {
    const parti = testo.split(/\s+e\s+/).map(compilaCondizione);
    return (r) => parti.every((p) => p(r));
  }
  // Tempo: "quando entro 2m" = la data in "quando" è degli ultimi 2 minuti; "dal oltre 1h" = più vecchia.
  const t = testo.match(/^([\w.]+)\s+(entro|oltre)\s+(\d+(?:\.\d+)?)\s*(s|m|h|d)$/);
  if (t) {
    const [, campo, verso, n, u] = t;
    const limite = Number(n) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[u];
    return (r) => {
      const v = r[campo];
      const ms = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
      if (!Number.isFinite(ms)) return false;
      const eta = Date.now() - ms;
      return verso === 'entro' ? eta <= limite : eta > limite;
    };
  }
  const m = testo.match(/^([\w.]+)(?:\s*%\s*(\d+))?\s*(==|!=|!~|>=|<=|>|<|~)\s*(.+)$/);
  if (m) {
    const [, campo, modulo, op, valore] = m;
    // A destra un valore fisso ("acceso", 21) oppure un altro campo fra graffe ("{set}").
    const altroCampo = valore.trim().match(/^\{([\w.]+)\}$/)?.[1];
    const fisso = letterale(valore);
    const numerico = modulo || ['>', '>=', '<', '<='].includes(op);
    return (r) => {
      const atteso = altroCampo ? r[altroCampo] : fisso;
      if (altroCampo && (atteso === undefined || atteso === null || atteso === '')) return false;
      let v = r[campo];
      // Un valore assente non è zero: "codice >= 0" non deve includere chi il codice non ce l'ha.
      if (numerico && (v === undefined || v === null || v === '')) return false;
      if (modulo) v = Number(v) % Number(modulo);
      return OPERATORI[op](v, atteso);
    };
  }
  if (/^!\s*[\w.]+$/.test(testo)) { const c = testo.replace(/^!\s*/, ''); return (r) => !r[c]; }
  if (/^[\w.]+$/.test(testo)) return (r) => Boolean(r[testo]);
  throw new Error(`condizione non valida: "${testo}"`);
}
