// Minimal XML reader, without dependencies, for APIs answering in XML (PAN-OS…). Returns plain
// objects: an element with only text becomes a string, children with the same name become an array,
// attributes are in "@name". No namespaces or DTD: enough for API answers, it is not a full XML
// parser.

const ENTITA = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decodifica = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITA[e] ?? m;
});

function aggiungi(genitore, nome, valore) {
  if (!(nome in genitore)) genitore[nome] = valore;
  else if (Array.isArray(genitore[nome])) genitore[nome].push(valore);
  else genitore[nome] = [genitore[nome], valore];
}

// An element without children or attributes is its text; otherwise an object (text in "#testo").
function chiudi(nodo) {
  const chiavi = Object.keys(nodo.figli);
  const testo = nodo.testo.trim();
  if (!chiavi.length) return testo;
  if (testo) nodo.figli['#testo'] = testo;
  return nodo.figli;
}

export function leggiXml(testo) {
  const radice = { figli: {}, testo: '' };
  const pila = [radice];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!(?:DOCTYPE)[^>]*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(String(testo || '')))) {
    const cima = pila[pila.length - 1];
    if (m[1] !== undefined) cima.testo += m[1];
    else if (m[2]) {
      if (pila.length < 2) continue;
      const nodo = pila.pop();
      aggiungi(pila[pila.length - 1].figli, nodo.nome, chiudi(nodo));
    } else if (m[3]) {
      const nodo = { nome: m[3], figli: {}, testo: '' };
      for (const a of (m[4] || '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) nodo.figli[`@${a[1]}`] = decodifica(a[2] ?? a[3]);
      if (m[5]) aggiungi(cima.figli, nodo.nome, chiudi(nodo));
      else pila.push(nodo);
    } else if (m[6] !== undefined) cima.testo += decodifica(m[6]);
  }
  return radice.figli;
}
