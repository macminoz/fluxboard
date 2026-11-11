// Proxmox VE: VM e LXC del cluster con CPU e memoria, oppure i nodi. Azioni sugli ospiti
// (avvia, spegni, riavvia) per le tile che le dichiarano.
//
// sorgente: { tipo: proxmox, url: https://192.168.1.2:8006, utente_token: fluxboard@pve!dashboard,
//             segreto: ${PROXMOX_SEGRETO}, certificato_ca: certificati/home-root-ca.pem,
//             nome_certificato: pve.casa.lan, protetti: [100, 101] }
// dati:     { sorgente: <nome>, risorsa: ospiti | nodi }
//
// Righe "ospiti": { id, nome, tipo (VM|LXC), nodo, codice (running|stopped|…), stato (acceso|spento|…),
//                   cpu (% dei core assegnati), core, memoria (%), memoria_gb, memoria_max_gb, acceso_da, tag,
//                   protetto (in `protetti` della sorgente: nessuna azione) }
// Righe "nodi":   { nodo, codice, stato, cpu, memoria, memoria_gb, memoria_max_gb, acceso_da }
//
// SICUREZZA: nessuna azione sui NODI, mai (né riavvio né spegnimento): il connettore non ne ha,
// e il token va creato con un ruolo senza Sys.PowerMgmt, così non potrebbe comunque. Gli ospiti
// in `protetti` (firewall, DNS…) non accettano azioni nemmeno se una tile le chiede.

import fs from 'node:fs/promises';
import path from 'node:path';
import { richiestaJson } from '../util.js';

export const tipo = 'proxmox';
export const nome = 'Proxmox VE';
export const gruppo = 'Virtualizzazione';
export const descrizione = 'VM e LXC del cluster: chi consuma CPU e memoria, accesi e spenti; avvio e spegnimento';
export const moduloSorgente = [
  { nome: 'url', etichetta: 'Indirizzo', tipo: 'url', obbligatorio: true, esempio: 'https://192.168.1.2:8006' },
  { nome: 'utente_token', etichetta: 'Token: utente!nome', tipo: 'testo', obbligatorio: true, esempio: 'fluxboard@pve!dashboard', aiuto: 'Datacenter → Permessi → Token API. Basta un ruolo con VM.Audit (e VM.PowerMgmt per accendere/spegnere), <b>mai Sys.PowerMgmt</b>.' },
  { nome: 'segreto', etichetta: 'Segreto del token', tipo: 'segreto', obbligatorio: true },
  { nome: 'certificato_ca', etichetta: 'Certificato della CA (file in config/)', tipo: 'testo', esempio: 'certificati/home-root-ca.pem', aiuto: 'Vuoto = si usa il certificato del sistema.' },
  { nome: 'nome_certificato', etichetta: 'Nome nel certificato', tipo: 'testo', esempio: 'pve.casa.lan', aiuto: 'Se ci si collega per IP: il nome da verificare nel certificato.' },
  { nome: 'verifica_certificato', etichetta: 'Verifica il certificato', tipo: 'si-no', predefinito: true },
  { nome: 'timeout', etichetta: 'Tempo massimo', tipo: 'durata', predefinito: '10s' },
];
export const moduloDati = [
  { nome: 'risorsa', etichetta: 'Cosa leggere', tipo: 'scelta', predefinito: 'ospiti', valori: { ospiti: 'VM e LXC', nodi: 'Nodi del cluster', spazio: 'Spazio disco (nodi, LXC, storage)' } },
];
export const campiSorgente = ['url', 'utente_token', 'segreto'];
export const campiDati = [];

const STATI = { running: 'acceso', stopped: 'spento', paused: 'in pausa', suspended: 'sospeso', online: 'attivo', offline: 'non raggiungibile' };
const GB = 1024 ** 3;
const arrotonda = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

async function chiama(sorgente, percorso, { metodo = 'GET', corpo, signal } = {}) {
  const ca = sorgente.certificato_ca ? await fs.readFile(path.resolve(sorgente._cartella || '.', sorgente.certificato_ca), 'utf8') : undefined;
  const r = await richiestaJson(new URL(`/api2/json${percorso}`, sorgente.url), {
    metodo, signal, ca, nomeServer: sorgente.nome_certificato, verifica: sorgente.verifica_certificato !== false,
    intestazioni: { Authorization: `PVEAPIToken=${sorgente.utente_token}=${sorgente.segreto}`, ...(corpo ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    corpo: corpo ? new URLSearchParams(corpo).toString() : undefined,
  });
  if (r.stato === 401) throw new Error('Proxmox rifiuta il token (401)');
  if (r.stato === 403) throw new Error(`Proxmox: permesso negato per ${percorso} (403)`);
  if (r.stato >= 400) throw new Error(`Proxmox ${r.stato}: ${r.json?.message || r.testo.slice(0, 200)}`);
  return r.json?.data;
}

export function ospitiInRighe(risorse, adesso = Date.now(), protetti = []) {
  return risorse.filter((r) => (r.type === 'qemu' || r.type === 'lxc') && !r.template).map((r) => ({
    id: r.vmid, nome: r.name, tipo: r.type === 'qemu' ? 'VM' : 'LXC', nodo: r.node,
    codice: r.status, stato: STATI[r.status] || r.status,
    cpu: r.status === 'running' ? arrotonda((r.cpu || 0) * 100) : 0, core: r.maxcpu,
    memoria: r.maxmem ? arrotonda(((r.mem || 0) / r.maxmem) * 100) : 0,
    memoria_gb: arrotonda((r.mem || 0) / GB, 2), memoria_max_gb: arrotonda((r.maxmem || 0) / GB, 1),
    acceso_da: r.uptime ? new Date(adesso - r.uptime * 1000).toISOString() : null,
    tag: r.tags || '',
    protetto: protetti.map(Number).includes(r.vmid),   // le tile non vi mostrano azioni
  }));
}

export function nodiInRighe(risorse, adesso = Date.now()) {
  return risorse.filter((r) => r.type === 'node').map((r) => ({
    nodo: r.node, codice: r.status, stato: STATI[r.status] || r.status,
    cpu: arrotonda((r.cpu || 0) * 100), memoria: r.maxmem ? arrotonda((r.mem / r.maxmem) * 100) : 0,
    memoria_gb: arrotonda((r.mem || 0) / GB, 1), memoria_max_gb: arrotonda((r.maxmem || 0) / GB, 1),
    acceso_da: r.uptime ? new Date(adesso - r.uptime * 1000).toISOString() : null,
  }));
}

// Spazio occupato di nodi, LXC accesi e storage (anche quelli sul NAS). Le VM non ci sono:
// Proxmox ne conosce l'occupazione solo con il guest agent, senza dà 0. Gli storage condivisi che
// stanno sullo stesso disco (stesse cifre, es. il NAS visto come NFS e come PBS da due nodi)
// diventano una riga sola, con tutti i nomi.
export function spazioInRighe(risorse) {
  const GB_ = 1024 ** 3;
  const riga = (nome, tipo, dove, usato, totale) => {
    const percentuale = totale ? Math.round((usato / totale) * 1000) / 10 : null;
    return { nome, tipo, dove, usato_gb: arrotonda(usato / GB_, 1), totale_gb: arrotonda(totale / GB_, 1), libero_gb: arrotonda((totale - usato) / GB_, 1), percentuale,
      codice: percentuale == null ? null : percentuale >= 90 ? 0 : percentuale >= 80 ? 2 : 1 };
  };
  const righe = [];
  for (const r of risorse) {
    if (r.type === 'node' && r.maxdisk) righe.push(riga(r.node, 'Nodo', r.node, r.disk, r.maxdisk));
    if (r.type === 'lxc' && r.status === 'running' && r.maxdisk && r.disk) righe.push(riga(r.name, 'LXC', r.node, r.disk, r.maxdisk));
  }
  const storage = new Map();
  for (const r of risorse.filter((x) => x.type === 'storage' && x.maxdisk && x.status === 'available')) {
    // NFS e PBS sullo stesso NAS riportano byte appena diversi: conta la capacità, al GB.
    const chiave = r.shared ? `condiviso:${Math.round(r.maxdisk / GB_)}` : `${r.node}:${r.storage}`;
    const s = storage.get(chiave) || { nomi: new Set(), nodi: new Set(), r };
    s.nomi.add(r.storage); s.nodi.add(r.node);
    storage.set(chiave, s);
  }
  // Più nomi per lo stesso disco: uno per riga nella cella (le tabelle vanno a capo su "\n").
  for (const { nomi, nodi, r } of storage.values()) righe.push(riga([...nomi].sort().join('\n'), r.shared ? 'Storage condiviso' : 'Storage', [...nodi].join(', '), r.disk, r.maxdisk));
  return righe.sort((a, b) => (b.percentuale ?? -1) - (a.percentuale ?? -1));
}

export async function leggi(sorgente, dati, { signal }) {
  const risorse = await chiama(sorgente, '/cluster/resources', { signal });
  const risorsa = dati.risorsa || 'ospiti';
  if (risorsa === 'spazio') return spazioInRighe(risorse);
  return risorsa === 'nodi' ? nodiInRighe(risorse) : ospitiInRighe(risorse, Date.now(), sorgente.protetti || []);
}

export async function prova(sorgente, { signal }) {
  const v = await chiama(sorgente, '/version', { signal });
  const risorse = await chiama(sorgente, '/cluster/resources', { signal });
  return `Proxmox VE ${v.version}: token valido, ${ospitiInRighe(risorse).length} VM/LXC visibili`;
}

// Azioni: solo sugli ospiti, con il loro id e nodo (dalla riga, non dal browser).
async function sullOspite(sorgente, parametri, comando, signal) {
  const id = Number(parametri.id);
  if (!Number.isInteger(id) || id < 100) throw new Error('id dell\'ospite non valido');
  if ((sorgente.protetti || []).map(Number).includes(id)) throw new Error(`${id} è protetto in questa sorgente: nessuna azione`);
  const risorse = await chiama(sorgente, '/cluster/resources', { signal });
  const ospite = risorse.find((r) => r.vmid === id && (r.type === 'qemu' || r.type === 'lxc'));
  if (!ospite) throw new Error(`${id} non trovato nel cluster`);
  const percorso = `/nodes/${encodeURIComponent(ospite.node)}/${ospite.type}/${id}/status/${comando}`;
  const lavoro = await chiama(sorgente, percorso, { metodo: 'POST', corpo: comando === 'shutdown' ? { timeout: '120' } : {}, signal });
  return `${ospite.name} (${id}): ${{ start: 'avvio', shutdown: 'spegnimento', reboot: 'riavvio' }[comando]} richiesto · ${lavoro || ''}`.trim();
}

export const azioni = {
  avvia: (sorgente, p, { signal }) => sullOspite(sorgente, p, 'start', signal),
  spegni: (sorgente, p, { signal }) => sullOspite(sorgente, p, 'shutdown', signal),   // pulito, non "stop"
  riavvia: (sorgente, p, { signal }) => sullOspite(sorgente, p, 'reboot', signal),
};
