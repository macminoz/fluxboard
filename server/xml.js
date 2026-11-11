// Lettore XML minimale, senza dipendenze, per le API che rispondono in XML (PAN-OS…).
// Restituisce oggetti semplici: un elemento con solo testo diventa una stringa, i figli con lo
// stesso nome diventano un array, gli attributi stanno in "@nome". Niente namespace né DTD:
// basta per risposte di API, non è un parser XML completo.

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

// Un elemento senza figli né attributi è il suo testo; altrimenti un oggetto (testo in "#testo").
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
