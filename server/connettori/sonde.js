// Probes: Fluxboard checks by itself whether a service answers, not only whether the machine is on
// (a ping says the LXC is alive even when the SIP server inside it is stopped). Three kinds of check:
//   tcp:  "192.168.1.5:5060"                       the port accepts connections
//   http: "http://192.168.1.10/"                     answers with a code < 400 (or `atteso`)
//   dns:  "192.168.1.1", nome: dns.home.lan        the DNS server resolves that name
//
// source: { tipo: sonde }                          (nothing to configure: the probes are in the tile)
// dati:   { sorgente: <name>, servizi: [
//           { nome: SIP server, tcp: "192.168.1.5:5060" },
//           { nome: httpd, http: "http://192.168.1.10/", contiene: "gallery" },
//           { nome: Home DNS, dns: 192.168.1.1, risolve: dns.home.lan },
//           { nome: Vaultwarden, http: "https://192.168.1.15/alive", verifica_certificato: false } ] }
//
// One row per service: { nome, gruppo, tipo, bersaglio, codice, stato, ms, dettaglio }
//   codice: 1 answers · 2 answers but needs attention (expired or expiring certificate)
//           · 0 does not answer      ms: response time
//   certificato_scade, certificato_giorni: for https sites (also with verifica_certificato: false,
//   so an expired certificate shows anyway). `avviso_certificato` (default 14) = days before
//   expiry from which to report it.
// To see only the problems: `elabora: [ { filtra: "codice != 1" } ]`.

import net from 'node:net';
import { Resolver } from 'node:dns/promises';
import { setMaxListeners } from 'node:events';
import YAML from 'yaml';

export const tipo = 'sonde';
export const nome = 'Sonde (porte, siti, DNS)';
export const gruppo = 'Monitoraggio';
export const descrizione = 'Fluxboard controlla da sé se un servizio risponde: una porta TCP, una pagina web, un server DNS';
export const moduloSorgente = [
  { nome: 'timeout', etichetta: 'Tempo massimo complessivo', tipo: 'durata', predefinito: '15s' },
];
export const moduloDati = [
  { nome: 'servizi', etichetta: 'Servizi da controllare', tipo: 'query', obbligatorio: true,
    esempio: '- { nome: Centralino SIP, tcp: "192.168.1.5:5060" }\n- { nome: Sito, http: "http://192.168.1.10/" }\n- { nome: DNS, dns: 192.168.1.1, risolve: dns.casa.lan }',
    aiuto: 'Un elenco YAML. Per ognuno <code>nome</code> e uno fra <code>tcp</code> (indirizzo:porta), <code>http</code> (indirizzo; facoltativi <code>atteso</code>, <code>contiene</code>, <code>verifica_certificato: false</code>) e <code>dns</code> (server, con <code>risolve</code>: il nome da chiedere). <code>gruppo</code> per raggrupparli, <code>attesa</code> per il tempo massimo di quella sonda (predefinito 3s).' },
];
export const campiSorgente = [];
export const campiDati = ['servizi'];

const ms = (v, d) => {
  const m = String(v ?? '').match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/);
  return m ? Number(m[1]) * (m[2] === 'ms' ? 1 : 1000) : d;
};

function tcp(bersaglio, attesa, signal) {
  const [host, porta] = [bersaglio.slice(0, bersaglio.lastIndexOf(':')), Number(bersaglio.slice(bersaglio.lastIndexOf(':') + 1))];
  if (!host || !porta) return Promise.reject(new Error('scrivi indirizzo:porta'));
  return new Promise((risolvi, rifiuta) => {
    const s = net.connect({ host, port: porta, signal });
    const fine = (e) => { s.destroy(); e ? rifiuta(e) : risolvi('porta aperta'); };
    s.setTimeout(attesa, () => fine(new Error('nessuna risposta')));
    s.once('connect', () => fine());
    s.once('error', (e) => fine(new Error(e.code === 'ECONNREFUSED' ? 'porta chiusa (connessione rifiutata)' : e.code === 'EHOSTUNREACH' ? 'host non raggiungibile' : e.message)));
  });
}

async function http(sv, attesa, signal) {
  const url = new URL(sv.http);
  const { request } = await import(url.protocol === 'https:' ? 'node:https' : 'node:http');
  return new Promise((risolvi, rifiuta) => {
    const req = request(url, { method: 'GET', signal, timeout: attesa, rejectUnauthorized: sv.verifica_certificato !== false, headers: { 'User-Agent': 'fluxboard-sonda' } }, (r) => {
      // The certificate is read right away, while the socket is open.
      const cert = url.protocol === 'https:' ? r.socket?.getPeerCertificate?.() : null;
      let corpo = '';
      r.setEncoding('utf8');
      r.on('data', (c) => { if (corpo.length < 200_000) corpo += c; });
      r.on('end', () => {
        const atteso = sv.atteso == null ? null : [].concat(sv.atteso).map(Number);
        const buono = atteso ? atteso.includes(r.statusCode) : r.statusCode < 400;
        if (!buono) return rifiuta(new Error(`HTTP ${r.statusCode}`));
        if (sv.contiene && !corpo.includes(sv.contiene)) return rifiuta(new Error(`HTTP ${r.statusCode}, ma la pagina non contiene "${sv.contiene}"`));
        const scade = cert?.valid_to ? new Date(cert.valid_to) : null;
        risolvi({ testo: `HTTP ${r.statusCode}`, scade: scade && !Number.isNaN(scade.getTime()) ? scade : null });
      });
    });
    req.on('timeout', () => req.destroy(new Error('nessuna risposta')));
    req.on('error', (e) => rifiuta(new Error(e.code === 'ECONNREFUSED' ? 'porta chiusa (connessione rifiutata)'
      : e.code === 'CERT_HAS_EXPIRED' ? 'certificato scaduto' : e.message)));
    req.end();
  });
}

async function dns(sv, attesa) {
  const r = new Resolver({ timeout: attesa, tries: 1 });
  r.setServers([String(sv.dns)]);
  const nome = sv.risolve || 'example.com';
  try {
    const ip = await r.resolve4(nome);
    return `${nome} → ${ip[0]}`;
  } catch (e) {
    throw new Error(e.code === 'ETIMEOUT' || e.code === 'ECONNREFUSED' ? 'il server DNS non risponde' : `${nome}: ${e.code || e.message}`);
  }
}

export async function leggi(sorgente, dati, { signal }) {
  // Many requests in parallel on the same signal: past 10 Node warns about a (false) leak.
  if (signal) setMaxListeners(200, signal);
  const elenco = typeof dati.servizi === 'string' ? YAML.parse(dati.servizi) || [] : Array.isArray(dati.servizi) ? dati.servizi : [];
  if (!elenco.length) throw new Error('manca "servizi": un elenco di { nome, tcp | http | dns }');
  return Promise.all(elenco.map(async (sv) => {
    const tipoSonda = sv.tcp ? 'tcp' : sv.http ? 'http' : sv.dns ? 'dns' : null;
    const riga = { nome: sv.nome || sv.tcp || sv.http || sv.dns, gruppo: sv.gruppo || null, tipo: tipoSonda,
      bersaglio: sv.tcp || sv.http || (sv.dns ? `${sv.dns} (${sv.risolve || 'example.com'})` : null), codice: 0, stato: 'giù', ms: null, dettaglio: '',
      certificato_scade: null, certificato_giorni: null };
    if (!tipoSonda) return { ...riga, dettaglio: 'manca tcp, http o dns' };
    const attesa = ms(sv.attesa, 3000);
    const inizio = performance.now();
    try {
      const esito = tipoSonda === 'tcp' ? await tcp(String(sv.tcp), attesa, signal)
        : tipoSonda === 'http' ? await http(sv, attesa, signal) : await dns(sv, attesa);
      Object.assign(riga, { codice: 1, stato: 'ok', dettaglio: typeof esito === 'string' ? esito : esito.testo });
      if (esito?.scade) {
        const giorni = Math.floor((esito.scade.getTime() - Date.now()) / 86_400_000);
        const data = esito.scade.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
        Object.assign(riga, { certificato_scade: esito.scade.toISOString(), certificato_giorni: giorni });
        if (giorni < 0) Object.assign(riga, { codice: 2, stato: 'attenzione', dettaglio: `risponde, ma il certificato è scaduto il ${data}` });
        else if (giorni <= Number(sv.avviso_certificato ?? 14)) Object.assign(riga, { codice: 2, stato: 'attenzione', dettaglio: `il certificato scade fra ${giorni} giorn${giorni === 1 ? 'o' : 'i'} (${data})` });
      }
    } catch (e) {
      riga.dettaglio = e.name === 'AbortError' ? 'tempo scaduto' : e.message;
    }
    riga.ms = Math.round(performance.now() - inizio);
    return riga;
  }));
}

export async function prova() {
  return 'Le sonde partono da Fluxboard stessa: nessuna configurazione da provare. Prova la tile per vedere i risultati.';
}
