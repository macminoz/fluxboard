// Simple and safe conditions (no eval), used both by the server (the "filtra" step of elabora) and
// by the page (colours of the items of a "values" tile). That is why they live in public/: the
// browser loads them as they are, the server imports them from here.

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

// Simple and safe condition (no eval): "field op value", "field % 2 == 1", "field", "!field",
// "band1 == {set}" (comparing two fields), "when within 5m" / "since over 1h" (dates). Several
// conditions are joined with " e " / " and " (all true) or " o " / " or " (at least one).
export function compilaCondizione(espressione) {
  // English works too: "and", "or", "within", "over" (= e, o, entro, oltre).
  const testo = String(espressione).trim().replace(/\s+and\s+/g, ' e ').replace(/\s+or\s+/g, ' o ')
    .replace(/^([\w.]+)\s+within\s+/, '$1 entro ').replace(/^([\w.]+)\s+(?:over|older than)\s+/, '$1 oltre ');
  if (/\s+o\s+/.test(testo)) {
    const parti = testo.split(/\s+o\s+/).map(compilaCondizione);
    return (r) => parti.some((p) => p(r));
  }
  if (/\s+e\s+/.test(testo)) {
    const parti = testo.split(/\s+e\s+/).map(compilaCondizione);
    return (r) => parti.every((p) => p(r));
  }
  // Time: "quando entro 2m" = the date in "quando" is from the last 2 minutes; "dal oltre 1h" =
  // older.
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
    // On the right a fixed value ("on", 21) or another field in braces ("{set}").
    const altroCampo = valore.trim().match(/^\{([\w.]+)\}$/)?.[1];
    const fisso = letterale(valore);
    const numerico = modulo || ['>', '>=', '<', '<='].includes(op);
    return (r) => {
      const atteso = altroCampo ? r[altroCampo] : fisso;
      if (altroCampo && (atteso === undefined || atteso === null || atteso === '')) return false;
      let v = r[campo];
      // A missing value is not zero: "codice >= 0" must not include rows without a code.
      if (numerico && (v === undefined || v === null || v === '')) return false;
      if (modulo) v = Number(v) % Number(modulo);
      return OPERATORI[op](v, atteso);
    };
  }
  if (/^!\s*[\w.]+$/.test(testo)) { const c = testo.replace(/^!\s*/, ''); return (r) => !r[c]; }
  if (/^[\w.]+$/.test(testo)) return (r) => Boolean(r[testo]);
  throw new Error(`condizione non valida: "${testo}"`);
}
