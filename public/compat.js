// Piccoli ripieghi per i browser un po' vecchi (es. quello dei pannelli touch a muro, un Chrome
// di qualche anno fa): aggiunge solo ciò che manca, senza toccare i browser che lo hanno già.
// Script normale (non modulo), caricato prima di app.js.
(function () {
  function aggiungi(oggetto, nome, valore) {
    if (!(nome in oggetto)) Object.defineProperty(oggetto, nome, { value: valore, writable: true, configurable: true });
  }
  function at(i) {
    var n = this.length; i = Math.trunc(i) || 0; if (i < 0) i += n;
    return i < 0 || i >= n ? undefined : this[i];
  }
  aggiungi(Array.prototype, 'at', at);
  aggiungi(String.prototype, 'at', at);
  aggiungi(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); });
  aggiungi(Array.prototype, 'findLast', function (f) { for (var i = this.length - 1; i >= 0; i--) if (f(this[i], i, this)) return this[i]; return undefined; });
  if (typeof window.structuredClone !== 'function') window.structuredClone = function (v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
  if (!window.CSS) window.CSS = {};
  if (typeof CSS.escape !== 'function') CSS.escape = function (s) { return String(s).replace(/[^a-zA-Z0-9_ -￿-]/g, '\\$&'); };
}());
