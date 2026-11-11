// Immagini e telecamere attraverso Fluxboard: il browser chiede /api/immagine?id=<tile> e il
// server prende l'immagine dall'indirizzo scritto nella tile. Così la telecamera si vede anche
// da reti che non la raggiungono (client, VPN, telefono) e, per uno stream MJPEG, la telecamera
// riceve una sola connessione qualunque sia il numero di schermi aperti.
// Si possono chiedere solo gli indirizzi delle tile: non è un proxy aperto.

const ATTESA_CHIUSURA = 5_000;     // senza spettatori, lo stream verso la telecamera si chiude
// Uno spettatore che non legge (telefono in background, scheda sospesa) non deve far crescere la
// memoria: oltre questa coda i suoi fotogrammi si saltano e riparte dal primo fotogramma intero.
// (Il 7/11/2026 il servizio è stato ucciso per memoria esaurita proprio così.)
const CODA_MASSIMA = 1_000_000;

export class Immagini {
  constructor(config) {
    this.config = config;
    this.stream = new Map();       // id tile → { url, controllo, tipo, delimitatore, clienti: Map(res → { pronto }) }
  }

  // `fotogramma: true` (?fotogramma=1): l'ultimo fotogramma intero dello stream, come JPEG singolo.
  // Lo usano gli schermi leggeri (modalità pannello) al posto dello stream continuo.
  async servi(id, req, res, { fotogramma = false } = {}) {
    const t = this.config.tile[id];
    if (!t || !['immagine'].includes(t.tipo) || !/^https?:\/\//.test(t.url || '')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('immagine sconosciuta');
    }
    let s = this.stream.get(id);
    if (s && s.url !== t.url) { this.#chiudi(id); s = null; }
    if (!s) {
      if (!this.aperture?.has(id)) {
        this.aperture ??= new Map();
        this.aperture.set(id, this.#apri(id, t.url).catch((e) => ({ errore: e })).finally(() => this.aperture.delete(id)));
      }
      s = await this.aperture.get(id);
    }
    if (s.errore) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`telecamera non raggiungibile: ${s.errore.cause?.code || s.errore.message}`);
    }
    if (!s.delimitatore) {
      // Un'immagine singola (JPEG): si inoltra così com'è e la connessione si chiude.
      res.writeHead(200, { 'Content-Type': s.tipo, 'Cache-Control': 'no-store' });
      return res.end(s.corpo);
    }
    if (fotogramma) {
      // Lo stream resta aperto finché qualcuno chiede fotogrammi (o lo guarda).
      clearTimeout(s.timer);
      if (!s.clienti.size) s.timer = setTimeout(() => this.#chiudi(id), ATTESA_CHIUSURA);
      for (let i = 0; !s.ultimo && i < 30; i++) await new Promise((ok) => setTimeout(ok, 100));
      if (!s.ultimo) { res.writeHead(504, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('nessun fotogramma ancora'); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Content-Length': s.ultimo.length });
      return res.end(s.ultimo);
    }
    res.writeHead(200, { 'Content-Type': s.tipo, 'Cache-Control': 'no-store', Connection: 'close' });
    // Un nuovo spettatore parte dal fotogramma successivo, non a metà di uno.
    s.clienti.set(res, { pronto: false });
    clearTimeout(s.timer);
    req.on('close', () => {
      s.clienti.delete(res);
      if (!s.clienti.size) s.timer = setTimeout(() => this.#chiudi(id), ATTESA_CHIUSURA);
    });
  }

  async #apri(id, url) {
    const controllo = new AbortController();
    const risposta = await fetch(url, { signal: controllo.signal });
    if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
    const tipo = risposta.headers.get('content-type') || 'image/jpeg';
    const confine = tipo.match(/boundary="?([^";]+)"?/i)?.[1];
    if (!/multipart/i.test(tipo) || !confine) {
      return { url, tipo, corpo: Buffer.from(await risposta.arrayBuffer()) };
    }
    const s = { url, tipo, controllo, delimitatore: Buffer.from(confine.startsWith('--') ? confine : `--${confine}`), clienti: new Map(), timer: null };
    this.stream.set(id, s);
    (async () => {
      try {
        for await (const pezzo of risposta.body) {
          const buf = Buffer.from(pezzo);
          // L'ultimo fotogramma intero (da FFD8 a FFD9), per chi chiede un'immagine sola.
          s.accumulo = s.accumulo ? Buffer.concat([s.accumulo, buf]) : buf;
          const fine = s.accumulo.lastIndexOf(Buffer.from([0xff, 0xd9]));
          if (fine > 0) {
            const inizio = s.accumulo.lastIndexOf(Buffer.from([0xff, 0xd8]), fine);
            if (inizio >= 0) s.ultimo = s.accumulo.subarray(inizio, fine + 2);
            s.accumulo = s.accumulo.subarray(fine + 2);
          }
          if (s.accumulo.length > 4_000_000) s.accumulo = null;
          for (const [res, c] of s.clienti) {
            if (res.writableLength > CODA_MASSIMA) { c.pronto = false; continue; }
            if (c.pronto) { res.write(buf); continue; }
            const i = buf.indexOf(s.delimitatore);
            if (i >= 0) { c.pronto = true; res.write(buf.subarray(i)); }
          }
        }
      } catch { /* chiuso o caduto */ }
      if (this.stream.get(id) === s) this.stream.delete(id);
      for (const res of s.clienti.keys()) res.end();
    })();
    return s;
  }

  #chiudi(id) {
    const s = this.stream.get(id);
    if (!s) return;
    this.stream.delete(id);
    s.controllo?.abort();
    for (const res of s.clienti.keys()) res.end();
  }
}
