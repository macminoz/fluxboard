// Client WebSocket minimale, senza dipendenze, per Node 20 (che non ha WebSocket integrato).
// Solo quello che serve ai connettori: connessione ws:// o wss://, messaggi di testo in entrata e
// in uscita, chiusura. Niente estensioni né frammentazione in uscita.

import { randomBytes } from 'node:crypto';

export function apriWebSocket(indirizzo, { suMessaggio, signal } = {}) {
  const url = new URL(indirizzo);
  return new Promise((risolvi, rifiuta) => {
    import(url.protocol === 'wss:' ? 'node:https' : 'node:http').then(({ request }) => {
      const req = request({
        hostname: url.hostname, port: url.port || (url.protocol === 'wss:' ? 443 : 80), path: url.pathname + url.search, signal,
        headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64') },
      });
      req.on('error', rifiuta);
      req.on('response', (r) => rifiuta(new Error(`il server non apre il WebSocket (HTTP ${r.statusCode})`)));
      req.on('upgrade', (_r, socket) => {
        let buffer = Buffer.alloc(0);
        socket.on('data', (pezzo) => {
          buffer = Buffer.concat([buffer, pezzo]);
          // Un frame: [FIN|opcode] [MASK|lunghezza] [lunghezza estesa] [dati] (dal server non mascherati).
          while (buffer.length >= 2) {
            const opcode = buffer[0] & 0x0f;
            let lunghezza = buffer[1] & 0x7f, inizio = 2;
            if (lunghezza === 126) { if (buffer.length < 4) return; lunghezza = buffer.readUInt16BE(2); inizio = 4; }
            else if (lunghezza === 127) { if (buffer.length < 10) return; lunghezza = Number(buffer.readBigUInt64BE(2)); inizio = 10; }
            if (buffer.length < inizio + lunghezza) return;
            const dati = buffer.subarray(inizio, inizio + lunghezza);
            buffer = buffer.subarray(inizio + lunghezza);
            if (opcode === 1 || opcode === 0) suMessaggio?.(dati.toString('utf8'));
            else if (opcode === 8) socket.end();
          }
        });
        socket.on('error', () => {});
        const invia = (testo) => {
          const dati = Buffer.from(testo, 'utf8');
          const maschera = randomBytes(4);
          const testa = dati.length < 126 ? Buffer.from([0x81, 0x80 | dati.length])
            : dati.length < 65536 ? Buffer.concat([Buffer.from([0x81, 0x80 | 126]), Buffer.from([dati.length >> 8, dati.length & 255])])
              : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 0x80 | 127; b.writeBigUInt64BE(BigInt(dati.length), 2); return b; })();
          const corpo = Buffer.from(dati.map((x, i) => x ^ maschera[i % 4]));
          socket.write(Buffer.concat([testa, maschera, corpo]));
        };
        const chiudi = () => { try { socket.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); } catch { /* già chiuso */ } socket.end(); };
        risolvi({ invia, chiudi });
      });
      req.end();
    }, rifiuta);
  });
}
