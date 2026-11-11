// Palo Alto Networks (PAN-OS): the firewall status from its XML API, read only.
//
// source: { tipo: panos, url: https://192.168.1.254, chiave: ${PANOS_CHIAVE},
//           certificato_ca: certificati/…pem, nome_certificato: firewall.home.lan }
// dati:   { sorgente: <name>, risorsa: sistema | sessioni | interfacce | globalprotect | ha }
//
// Rows:
//   sistema:       one row: nome, modello, seriale, versione, uptime, app, minacce, antivirus, wildfire, url_filtering, ip
//   sessioni:      one row: attive, massime, occupazione (%), cps, kbps, pps
//   interfacce:    one row per physical port: nome, stato (up/down), velocita, duplex, mac
//   globalprotect: one row per connected user: utente, ip_virtuale, ip_pubblico, dal, client
//   ha:            one row: abilitata, stato, peer
//
// SECURITY: only the "show" commands listed below, written in the code. The connector does not
// accept commands from the tile, so not even a badly written tile can reboot, configure or
// commit. For the key an administrator with a "read only" role is enough (XML API: only
// "Operational Requests"), so the firewall itself would refuse anything else.

import fs from 'node:fs/promises';
import path from 'node:path';
import { richiestaJson } from '../util.js';
import { leggiXml } from '../xml.js';

export const tipo = 'panos';
export const nome = 'Palo Alto (PAN-OS)';
export const gruppo = 'Firewall e rete';
export const descrizione = 'Stato del firewall: versione e firme, sessioni, porte, utenti GlobalProtect, HA. Sola lettura';
export const moduloSorgente = [
  { nome: 'url', etichetta: 'Indirizzo di gestione', tipo: 'url', obbligatorio: true, esempio: 'https://192.168.1.254' },
  { nome: 'chiave', etichetta: 'Chiave API', tipo: 'segreto', obbligatorio: true,
    aiuto: 'Si ottiene con <code>https://&lt;firewall&gt;/api/?type=keygen&amp;user=…&amp;password=…</code> per un amministratore con un <b>ruolo di sola lettura</b> (XML API: solo Operational Requests).' },
  { nome: 'certificato_ca', etichetta: 'Certificato della CA (file in config/)', tipo: 'testo', esempio: 'certificati/home-root-ca.pem', aiuto: 'Vuoto = si usa il certificato del sistema.' },
  { nome: 'nome_certificato', etichetta: 'Nome nel certificato', tipo: 'testo', esempio: 'firewall.casa.lan', aiuto: 'Se ci si collega per IP: il nome da verificare nel certificato.' },
  { nome: 'verifica_certificato', etichetta: 'Verifica il certificato', tipo: 'si-no', predefinito: true },
  { nome: 'timeout', etichetta: 'Tempo massimo', tipo: 'durata', predefinito: '15s' },
];
export const moduloDati = [
  { nome: 'risorsa', etichetta: 'Cosa leggere', tipo: 'scelta', predefinito: 'sistema',
    valori: { sistema: 'Sistema: versione, firme, uptime', sessioni: 'Sessioni attive e traffico', interfacce: 'Porte fisiche (su/giù)', globalprotect: 'Utenti GlobalProtect collegati', ha: 'Alta affidabilità' } },
];
export const campiSorgente = ['url', 'chiave'];
export const campiDati = [];

// The only commands the connector can send.
const COMANDI = {
  sistema: '<show><system><info></info></system></show>',
  sessioni: '<show><session><info></info></session></show>',
  interfacce: '<show><interface>all</interface></show>',
  globalprotect: '<show><global-protect-gateway><current-user></current-user></global-protect-gateway></show>',
  ha: '<show><high-availability><state></state></high-availability></show>',
};

const elenco = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const numero = (v) => (v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : v);

async function comando(sorgente, risorsa, signal) {
  const cmd = COMANDI[risorsa];
  if (!cmd) throw new Error(`"risorsa" deve essere una di ${Object.keys(COMANDI).join(', ')}`);
  const ca = sorgente.certificato_ca ? await fs.readFile(path.resolve(sorgente._cartella || '.', sorgente.certificato_ca), 'utf8') : undefined;
  const url = new URL('/api/', sorgente.url);
  url.searchParams.set('type', 'op');
  url.searchParams.set('cmd', cmd);
  const r = await richiestaJson(url, {
    signal, ca, nomeServer: sorgente.nome_certificato, verifica: sorgente.verifica_certificato !== false,
    intestazioni: { Accept: 'application/xml', 'X-PAN-KEY': sorgente.chiave || '' },
  });
  const xml = leggiXml(r.testo);
  const risposta = xml.response || {};
  if (r.stato === 403 || risposta['@status'] === 'error') {
    const msg = JSON.stringify(risposta.msg ?? risposta.result ?? '').replace(/[{}"[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(r.stato === 403 ? 'il firewall rifiuta la chiave API (403)' : `PAN-OS: ${msg || 'errore'}`);
  }
  if (r.stato >= 400) throw new Error(`PAN-OS ${r.stato}`);
  return risposta.result || {};
}

export function righe(risorsa, ris) {
  if (risorsa === 'sistema') {
    const s = ris.system || {};
    return [{
      nome: s.hostname, modello: s.model, seriale: s.serial, versione: s['sw-version'], uptime: s.uptime, ip: s['ip-address'],
      app: s['app-version'], minacce: s['threat-version'], antivirus: s['av-version'], wildfire: s['wildfire-version'],
      url_filtering: s['url-filtering-version'], gp_client: s['global-protect-client-package-version'],
      dispositivo_certificato: s['device-certificate-status'],
    }];
  }
  if (risorsa === 'sessioni') {
    const attive = numero(ris['num-active']), massime = numero(ris['num-max']);
    return [{ attive, massime, occupazione: massime ? Math.round((attive / massime) * 1000) / 10 : null,
      cps: numero(ris.cps), kbps: numero(ris.kbps), pps: numero(ris.pps), tcp: numero(ris['num-tcp']), udp: numero(ris['num-udp']) }];
  }
  if (risorsa === 'interfacce') {
    return elenco(ris.hw?.entry).map((e) => ({ nome: e.name, stato: e.state, velocita: e.speed, duplex: e.duplex, mac: e.mac, tipo: e.type }));
  }
  if (risorsa === 'globalprotect') {
    return elenco(ris.entry).map((e) => ({
      utente: e.username || e['primary-username'], ip_virtuale: e['virtual-ip'], ip_pubblico: e['public-ip'],
      dal: e['login-time-utc'] ? new Date(Number(e['login-time-utc']) * 1000).toISOString() : e['login-time'], client: e.client, computer: e.computer,
    }));
  }
  if (risorsa === 'ha') {
    const g = ris.group || {};
    return [{ abilitata: ris.enabled === 'yes', stato: g['local-info']?.state || (ris.enabled === 'yes' ? '?' : 'non attiva'), peer: g['peer-info']?.state || null }];
  }
  return [];
}

export async function leggi(sorgente, dati, { signal }) {
  const risorsa = dati.risorsa || 'sistema';
  return righe(risorsa, await comando(sorgente, risorsa, signal));
}

export async function prova(sorgente, { signal }) {
  const [s] = righe('sistema', await comando(sorgente, 'sistema', signal));
  return `${s.nome || 'firewall'} (${s.modello || 'PAN-OS'}) · PAN-OS ${s.versione || '?'}: chiave valida`;
}
