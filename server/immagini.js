// Images and cameras through Fluxboard: the browser asks /api/immagine?id=<tile> and the server
// takes the image from the address written in the tile. The camera is visible from networks that
// cannot reach it (clients, VPN, phone) and, for an MJPEG stream, the camera gets a single
// connection whatever the number of open screens. Only the tiles' addresses can be requested: it is
// not an open proxy.

const ATTESA_CHIUSURA = 5_000;     // without viewers, the stream to the camera is closed
// A viewer that does not read (phone in the background, suspended tab) must not make memory grow:
// past this queue its frames are skipped and it restarts from the next whole frame. (On 7/11/2026
// the service was killed for running out of memory exactly like this.)
const CODA_MASSIMA = 1_000_000;

export class Immagini {
  constructor(config) {
    this.config = config;
    this.stream = new Map();       // tile id → { url, controllo, tipo, delimitatore, clienti: Map(res → { pronto }) }
  }

  // `fotogramma: true` (?fotogramma=1): the last whole frame of the stream, as a single JPEG. Used
  // by lightweight screens (panel mode) instead of the continuous stream.
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
      // A single image (JPEG): forwarded as it is and the connection closes.
      res.writeHead(200, { 'Content-Type': s.tipo, 'Cache-Control': 'no-store' });
      return res.end(s.corpo);
    }
    if (fotogramma) {
      // The stream stays open as long as someone asks for frames (or watches it).
      clearTimeout(s.timer);
      if (!s.clienti.size) s.timer = setTimeout(() => this.#chiudi(id), ATTESA_CHIUSURA);
      for (let i = 0; !s.ultimo && i < 30; i++) await new Promise((ok) => setTimeout(ok, 100));
      if (!s.ultimo) { res.writeHead(504, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('nessun fotogramma ancora'); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Content-Length': s.ultimo.length });
      return res.end(s.ultimo);
    }
    res.writeHead(200, { 'Content-Type': s.tipo, 'Cache-Control': 'no-store', Connection: 'close' });
    // A new viewer starts from the next frame, not halfway through one.
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
          // The last whole frame (from FFD8 to FFD9), for whoever asks for a single image.
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
