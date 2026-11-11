// Uptime Kuma: the status of each monitor of a public status page. Merges Kuma's two public
// APIs (list of monitors and latest heartbeats), which are not enough alone: the first has
// the names, the second the states. One row per monitor:
//   { nome, tipo, codice, stato, msg, dal, uptime }
//   codice: 0 down · 1 ok · 2 pending · 3 maintenance   ·   dal: since when it is in that state
//
// source: { tipo: uptime-kuma, url: http://192.168.1.33:3001/ }
// dati:   { sorgente: <name>, pagina: <slug of the status page> }
//
// To see only the problems: in the tile `elabora: [ { filtra: "codice != 1" } ]`.

export const tipo = 'uptime-kuma';
export const nome = 'Uptime Kuma';
export const gruppo = 'Monitoraggio';
export const descrizione = 'Stato dei monitor (su/giù) da una pagina di stato pubblica';
export const moduloSorgente = [
  { nome: 'url', etichetta: 'Indirizzo', tipo: 'url', obbligatorio: true, esempio: 'http://192.168.1.33:3001/' },
  { nome: 'timeout', etichetta: 'Tempo massimo', tipo: 'durata', predefinito: '10s' },
];
export const moduloDati = [
  { nome: 'pagina', etichetta: 'Pagina di stato (slug)', tipo: 'testo', obbligatorio: true, esempio: 'fluxboard', aiuto: 'In Kuma: Pagine di stato. Una riga per monitor: nome, codice (0 giù, 1 ok, 2 in attesa, 3 manutenzione), stato, msg, dal, uptime.' },
];
export const campiSorgente = ['url'];
export const campiDati = ['pagina'];

export async function prova(sorgente, { signal }) {
  const r = await fetch(new URL('api/entry-page', sorgente.url), { signal });
  if (!r.ok) throw new Error(`Uptime Kuma risponde ${r.status}`);
  return 'Uptime Kuma raggiungibile';
}

const STATI = { 0: 'giù', 1: 'ok', 2: 'in attesa', 3: 'manutenzione' };

// Kuma writes times in UTC without a time zone ("2026-11-04 09:21:28.196").
const comeData = (t) => (t ? new Date(`${t.replace(' ', 'T')}Z`).toISOString() : null);

async function leggiJson(url, signal) {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${url.host}`);
  return r.json();
}

export async function leggi(sorgente, dati, { signal }) {
  const pagina = encodeURIComponent(dati.pagina);
  const [info, battiti] = await Promise.all([
    leggiJson(new URL(`api/status-page/${pagina}`, sorgente.url), signal),
    leggiJson(new URL(`api/status-page/heartbeat/${pagina}`, sorgente.url), signal),
  ]);
  const monitor = (info.publicGroupList || []).flatMap((g) => g.monitorList || []);
  return monitor.map((m) => {
    const elenco = battiti.heartbeatList?.[m.id] || [];
    const ultimo = elenco.at(-1);
    // Since when: the first heartbeat of the final run with the same status.
    let i = elenco.length - 1;
    while (i > 0 && elenco[i - 1].status === ultimo?.status) i--;
    return {
      nome: m.name,
      tipo: m.type,
      codice: ultimo ? ultimo.status : null,
      stato: ultimo ? STATI[ultimo.status] ?? String(ultimo.status) : 'nessun dato',
      msg: ultimo?.msg || '',
      dal: comeData(elenco[i]?.time),
      uptime: battiti.uptimeList?.[`${m.id}_24`] ?? null,
    };
  });
}
