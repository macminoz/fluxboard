// Validation rules for the three kinds of configuration file. They return errors (the file is
// refused) and warnings (the file is accepted, but something deserves attention).

import { OPERAZIONI as OPERAZIONI_RIGHE } from './nascoste.js';
import { durata } from './util.js';
import { compilaCondizione, NOMI_PASSAGGI } from './elabora.js';
import { NOMI_ICONE as ICONE } from '../public/icone.js';

export const LIVELLI = ['base', 'intermedia', 'avanzata'];
// The page views: the three levels ("media" = intermediate) and two filters, Alarms and Full.
export const VISTE = ['base', 'media', 'avanzata', 'allarmi', 'completa'];
export const LARGHEZZE = ['stretta', 'media', 'larga'];
export const COLORI = ['blu', 'azzurro', 'verde', 'giallo', 'arancio', 'rosso', 'viola', 'rosa', 'ciano', 'indaco', 'lime', 'ambra', 'marrone', 'grigio'];

// Tile types the page can draw. `conDati` = usually reads a source; `mostraSe` = default behaviour
// when the file does not say.
export const TIPI_TILE = {
  elenco:   { conDati: true,  mostraSe: 'dati',   descrizione: 'Un elenco di righe, una per elemento' },
  valore:   { conDati: true,  mostraSe: 'dati',   descrizione: 'Un valore singolo con testo intorno' },
  valori:   { conDati: true,  mostraSe: 'dati',   descrizione: 'Più valori affiancati, ognuno con la sua etichetta' },
  grafico:  { conDati: true,  mostraSe: 'dati',   descrizione: 'Linee nel tempo (temperature, consumi…)' },
  cronologia: { conDati: true, mostraSe: 'dati',  descrizione: 'Una riga per elemento con i tratti di tempo in cui era acceso (valvole, servizi…)' },
  testo:    { conDati: false, mostraSe: 'sempre', descrizione: 'Testo fisso (note, promemoria)' },
  orologio: { conDati: false, mostraSe: 'sempre', descrizione: 'Ora e data' },
  immagine: { conDati: false, mostraSe: 'sempre', descrizione: 'Immagine o stream MJPEG da un URL' },
  iframe:   { conDati: false, mostraSe: 'sempre', descrizione: 'Pagina esterna incorporata (es. pannello Grafana)' },
};

const CHIAVI_SEGRETE = /token|password|passw|secret|segreto|chiave|apikey|api_key/i;

function testoPerLivelli(valore, nome, errori) {
  if (valore === undefined) return;
  if (typeof valore === 'string') return;
  if (valore && typeof valore === 'object') {
    for (const k of Object.keys(valore)) {
      if (!LIVELLI.includes(k)) errori.push(`"${nome}": livello sconosciuto "${k}" (ammessi: ${LIVELLI.join(', ')})`);
      else if (typeof valore[k] !== 'string') errori.push(`"${nome}.${k}" deve essere un testo`);
    }
    return;
  }
  errori.push(`"${nome}" deve essere un testo oppure { base, intermedia, avanzata }`);
}

export function validaGlobale(o) {
  const errori = [], avvisi = [];
  if (!o || typeof o !== 'object') return { errori: ['il file deve contenere delle chiavi (titolo, display, ...)'], avvisi };
  if (o.livello && !LIVELLI.includes(o.livello)) errori.push(`"livello" deve essere uno fra: ${LIVELLI.join(', ')}`);
  if (o.tema && !['auto', 'chiaro', 'scuro'].includes(o.tema)) errori.push('"tema" deve essere auto, chiaro o scuro');
  if (o.aggiornamento && durata(o.aggiornamento) === null) errori.push('"aggiornamento" non è una durata valida (es. 30s, 1m)');
  if (o.nascondi_vuote !== undefined && typeof o.nascondi_vuote !== 'boolean') errori.push('"nascondi_vuote" deve essere true o false');
  if (o.sezioni !== undefined && typeof o.sezioni !== 'boolean') errori.push('"sezioni" deve essere true o false');
  if (o.argomenti !== undefined) {
    if (!o.argomenti || typeof o.argomenti !== 'object') errori.push('"argomenti" deve essere { nome: colore } (es. temperatura: arancio)');
    else for (const [nome, a] of Object.entries(o.argomenti)) {
      const colore = typeof a === 'string' ? a : a?.colore;
      if (COLORI.includes(nome)) errori.push(`argomento "${nome}": è già il nome di un colore, scegline un altro`);
      if (!COLORI.includes(colore)) errori.push(`argomento "${nome}": colore "${colore}" sconosciuto (ammessi: ${COLORI.join(', ')})`);
      if (typeof a === 'object' && a.icona && !ICONE.includes(a.icona)) errori.push(`argomento "${nome}": icona "${a.icona}" sconosciuta (ammesse: ${ICONE.join(', ')})`);
    }
  }
  if (o.lingua !== undefined && !['en', 'it'].includes(o.lingua)) errori.push('"lingua" deve essere en o it');
  if (o.display !== undefined) {
    if (typeof o.display !== 'object') errori.push('"display" deve contenere i profili (browser, mobile, ...)');
    else for (const [nome, p] of Object.entries(o.display)) {
      if (!/^[a-z0-9-]+$/.test(nome)) errori.push(`display "${nome}": nome non valido`);
      if (!p || typeof p !== 'object') { errori.push(`display "${nome}": servono delle chiavi (colonne, ...)`); continue; }
      if (p.colonne !== undefined && !(Number.isInteger(p.colonne) && p.colonne >= 1 && p.colonne <= 12)) errori.push(`display "${nome}": "colonne" fra 1 e 12`);
      if (p.livello && !LIVELLI.includes(p.livello)) errori.push(`display "${nome}": livello sconosciuto`);
      if (p.vista && !VISTE.includes(p.vista)) errori.push(`display "${nome}": vista fra ${VISTE.join(', ')}`);
      for (const k of ['includi', 'escludi']) if (p[k] !== undefined && !Array.isArray(p[k])) errori.push(`display "${nome}": "${k}" deve essere un elenco di tile`);
      if (p.pannello !== undefined && typeof p.pannello !== 'boolean') errori.push(`display "${nome}": "pannello" deve essere true o false`);
      if (p.giro !== undefined && !(p.giro === false || /^\d+\s*(s|m)$/.test(String(p.giro)))) errori.push(`display "${nome}": "giro" è una durata (es. 30s) o false`);
    }
  }
  // schermi: [{ indirizzo | browser, display }] (server/index.js, "who connects")
  if (o.schermi !== undefined) {
    [].concat(o.schermi).forEach((s, i) => {
      if (!s || typeof s !== 'object' || !s.display) errori.push(`schermi[${i}]: serve "display" (il profilo da usare)`);
      else if (!s.indirizzo && !s.browser) errori.push(`schermi[${i}]: serve "indirizzo" (IP o inizio, es. 10.48.12.) o "browser" (un pezzo del nome del browser)`);
      else if (o.display && typeof o.display === 'object' && !o.display[s.display]) errori.push(`schermi[${i}]: il display "${s.display}" non esiste`);
    });
  }
  // notifiche: [{ url, formato, livello, anche_risolte, ripeti_dopo, intestazioni }] (server/allerta.js)
  if (o.notifiche !== undefined) {
    const regole = [].concat(o.notifiche);
    regole.forEach((n, i) => {
      if (!n || typeof n !== 'object' || !/^https?:\/\//.test(String(n.url || ''))) errori.push(`notifiche[${i}]: serve "url" (http:// o https://)`);
      else {
        if (n.formato && !['json', 'ntfy', 'testo'].includes(n.formato)) errori.push(`notifiche[${i}]: "formato" fra json, ntfy, testo`);
        if (n.livello && !['grave', 'avviso'].includes(n.livello)) errori.push(`notifiche[${i}]: "livello" grave o avviso`);
      }
    });
  }
  return { errori, avvisi };
}

// A display's layout, written by the page's Edit mode (but readable and editable by hand too).
// Tiles not listed follow, at the end, in priority order.
export function validaLayout(o, tile) {
  const errori = [], avvisi = [];
  if (!o || typeof o !== 'object' || !Array.isArray(o.tile)) return { errori: ['serve un elenco "tile" di { id, colonne, altezza }'], avvisi };
  const visti = new Set();
  o.tile.forEach((v, i) => {
    if (!v || typeof v.id !== 'string') { errori.push(`tile[${i}]: manca "id"`); return; }
    if (visti.has(v.id)) errori.push(`tile[${i}]: "${v.id}" compare due volte`);
    visti.add(v.id);
    if (tile && !tile[v.id]) avvisi.push(`"${v.id}" non esiste (più): viene ignorata`);
    if (v.colonne !== undefined && !(Number.isInteger(v.colonne) && v.colonne >= 1 && v.colonne <= 12)) errori.push(`"${v.id}": "colonne" fra 1 e 12`);
    if (v.chiusa !== undefined && typeof v.chiusa !== 'boolean') errori.push(`"${v.id}": "chiusa" deve essere true o false`);
    if (v.ridotta !== undefined && typeof v.ridotta !== 'boolean') errori.push(`"${v.id}": "ridotta" deve essere true o false`);
    if (v.x !== undefined && !(Number.isInteger(v.x) && v.x >= 0 && v.x <= 11)) errori.push(`"${v.id}": "x" (colonna) fra 0 e 11`);
    if (v.y !== undefined && !(Number.isInteger(v.y) && v.y >= 0 && v.y <= 100000)) errori.push(`"${v.id}": "y" (riga) da 0 in su`);
    if (v.colonne_tabella !== undefined && (!v.colonne_tabella || typeof v.colonne_tabella !== 'object' || Array.isArray(v.colonne_tabella) || !Object.values(v.colonne_tabella).every((n) => Number.isInteger(n) && n >= 30 && n <= 1500))) errori.push(`"${v.id}": "colonne_tabella" deve essere { intestazione: pixel } (da 30 a 1500)`);
    if (v.altezza !== undefined && !(Number.isInteger(v.altezza) && v.altezza >= 40 && v.altezza <= 3000)) errori.push(`"${v.id}": "altezza" in pixel fra 40 e 3000 (o assente = automatica)`);
  });
  if (o.sezioni !== undefined) {
    if (!o.sezioni || typeof o.sezioni !== 'object' || Array.isArray(o.sezioni)) errori.push('"sezioni" deve essere { etichetta: { colonne, x, y } }');
    else for (const [k, v] of Object.entries(o.sezioni)) {
      if (!v || typeof v !== 'object') { errori.push(`sezione "${k}": serve { colonne, x, y }`); continue; }
      if (v.colonne !== undefined && !(Number.isInteger(v.colonne) && v.colonne >= 1 && v.colonne <= 12)) errori.push(`sezione "${k}": "colonne" fra 1 e 12`);
      if (v.x !== undefined && !(Number.isInteger(v.x) && v.x >= 0 && v.x <= 11)) errori.push(`sezione "${k}": "x" (colonna) fra 0 e 11`);
      if (v.y !== undefined && !(Number.isInteger(v.y) && v.y >= 0 && v.y <= 100000)) errori.push(`sezione "${k}": "y" (riga) da 0 in su`);
    }
  }
  return { errori, avvisi };
}

export function validaSorgente(o, connettori) {
  const errori = [], avvisi = [];
  if (!o || typeof o !== 'object') return { errori: ['il file deve contenere almeno "tipo"'], avvisi };
  const c = connettori.get(o.tipo);
  if (!c) return { errori: [`"tipo" sconosciuto: "${o.tipo}" (disponibili: ${[...connettori.keys()].join(', ')})`], avvisi };
  for (const campo of c.campiSorgente || []) if (o[campo] === undefined || o[campo] === '') errori.push(`manca "${campo}" (richiesto da ${o.tipo})`);
  if (o.timeout && durata(o.timeout) === null) errori.push('"timeout" non è una durata valida');
  const cerca = (oggetto, prefisso) => {
    for (const [k, v] of Object.entries(oggetto || {})) {
      if (v && typeof v === 'object') cerca(v, `${prefisso}${k}.`);
      else if (CHIAVI_SEGRETE.test(k) && !/utente|nome/i.test(k) && typeof v === 'string' && v && !v.includes('${')) {
        avvisi.push(`"${prefisso}${k}" è scritto in chiaro: meglio \${NOME} e il valore in Impostazioni avanzate → Segreti`);
      }
    }
  };
  cerca(o, '');
  for (const def of c.moduloSorgente || []) {
    if (def.tipo === 'scelta' && def.valori) {
      const v = def.nome.split('.').reduce((x, k) => x?.[k], o);
      if (v !== undefined && !(v in def.valori)) errori.push(`"${def.nome}" deve essere: ${Object.keys(def.valori).join(', ')}`);
    }
  }
  return { errori, avvisi };
}
// voci: [{ etichetta, valore, livello?, tono? }]; tono is a fixed name or { "<condition>": <name> }
// evaluated on the data row, the first true wins.
export const TONI = ['ok', 'attenzione', 'allarme', 'caldo', 'freddo', 'info', 'spento'];
function validaVoci(voci, errori, chiave = 'voci') {
  if (!Array.isArray(voci) || !voci.length) { errori.push(`"${chiave}" deve essere un elenco di { etichetta, valore }`); return; }
  voci.forEach((v, i) => {
    if (!v || typeof v !== 'object') { errori.push(`${chiave}[${i}] deve essere { etichetta, valore }`); return; }
    testoPerLivelli(v.etichetta, `${chiave}[${i}].etichetta`, errori);
    if (v.valore == null) errori.push(`${chiave}[${i}]: manca "valore" (es. "{temperatura:1}°")`);
    else testoPerLivelli(v.valore, `${chiave}[${i}].valore`, errori);
    if (v.mostra_se) { try { compilaCondizione(v.mostra_se); } catch (e) { errori.push(`${chiave}[${i}].mostra_se: ${e.message}`); } }
    if (v.livello && !LIVELLI.includes(v.livello)) errori.push(`${chiave}[${i}].livello deve essere: ${LIVELLI.join(', ')}`);
    const toni = v.tono == null ? [] : typeof v.tono === 'string' ? [v.tono] : Object.values(v.tono);
    for (const t of toni) if (!TONI.includes(t)) errori.push(`${chiave}[${i}].tono "${t}" sconosciuto (ammessi: ${TONI.join(', ')})`);
    if (v.tono && typeof v.tono === 'object') for (const c of Object.keys(v.tono)) {
      try { compilaCondizione(c); } catch (e) { errori.push(`${chiave}[${i}].tono: ${e.message}`); }
    }
  });
}

// azioni: [{ id, etichetta, operazione, quando?, conferma?, globale?, campi?, parametri? }]
function validaAzioni(o, sorgenti, connettori, errori) {
  if (!Array.isArray(o.azioni)) { errori.push('"azioni" deve essere un elenco'); return; }
  const visti = new Set();
  o.azioni.forEach((a, i) => {
    const dove = `azioni[${i}]`;
    if (!a?.id || !/^[a-z0-9-]+$/.test(a.id)) { errori.push(`${dove}: serve un "id" (minuscole, cifre e trattini)`); return; }
    if (visti.has(a.id)) errori.push(`${dove}: "${a.id}" ripetuto`);
    visti.add(a.id);
    const s = sorgenti[a.sorgente || o.dati?.sorgente];
    // Tiles without a source (e.g. the alert centre): the operations belong to their data type.
    const c = s ? connettori.get(s.tipo) : (!a.sorgente && !o.dati?.sorgente && o.dati?.tipo ? connettori.get(o.dati.tipo) : null);
    // Ack and Ignore for rows (server/nascoste.js): valid for any tile.
    if (OPERAZIONI_RIGHE.includes(a.operazione)) { if (!a.globale && !a.chiave) errori.push(`${dove}: serve "chiave" (il campo che riconosce la riga, es. host)`); }
    else if (!c) errori.push(`${dove}: nessuna sorgente su cui eseguirla`);
    else if (!c.azioni?.[a.operazione]) errori.push(`${dove}: "operazione" deve essere una di ${Object.keys(c.azioni || {}).join(', ') || '(questa sorgente non ha azioni)'}`);
    for (const k of ['quando', 'errore_se']) if (a[k]) { try { compilaCondizione(a[k]); } catch (e) { errori.push(`${dove}.${k}: ${e.message}`); } }
    for (const [j, campo] of (a.campi || []).entries()) {
      if (!campo?.nome) errori.push(`${dove}.campi[${j}]: manca "nome"`);
      if (campo?.formato) { try { new RegExp(campo.formato); } catch { errori.push(`${dove}.campi[${j}].formato: espressione non valida`); } }
    }
  });
}

export function validaTile(o, sorgenti, connettori, argomenti = {}) {
  const errori = [], avvisi = [];
  if (!o || typeof o !== 'object') return { errori: ['il file deve contenere almeno "tipo"'], avvisi };
  const t = TIPI_TILE[o.tipo];
  if (!t) return { errori: [`"tipo" sconosciuto: "${o.tipo}" (disponibili: ${Object.keys(TIPI_TILE).join(', ')})`], avvisi };
  if (o.larghezza && !LARGHEZZE.includes(o.larghezza)) errori.push(`"larghezza" deve essere: ${LARGHEZZE.join(', ')}`);
  if (o.colore && !COLORI.includes(o.colore) && !(argomenti && o.colore in argomenti)) {
    errori.push(`"colore" deve essere un argomento di global.yaml (${Object.keys(argomenti || {}).join(', ') || 'nessuno'}) o un colore: ${COLORI.join(', ')}`);
  }
  if (o.etichetta !== undefined && o.etichetta !== null) {
    if (typeof o.etichetta !== 'string' || !o.etichetta) errori.push('"etichetta" deve essere un nome (es. temperatura)');
    else if (!(argomenti && o.etichetta in argomenti)) avvisi.push(`etichetta "${o.etichetta}" non è fra quelle delle Impostazioni: la tile sarà grigia e senza icona`);
  }
  if (o.anche_in !== undefined && (!Array.isArray(o.anche_in) || o.anche_in.some((w) => typeof w !== 'string'))) errori.push('"anche_in" deve essere un elenco di workspace (es. [default, prove])');
  if (o.icona && !ICONE.includes(o.icona)) errori.push(`"icona" sconosciuta: ${o.icona} (ammesse: ${ICONE.join(', ')})`);
  if (o.sfondo !== undefined && typeof o.sfondo !== 'boolean') errori.push('"sfondo" deve essere true o false');
  if (o.allerta !== undefined && !['grave', 'avviso', 'no', false].includes(o.allerta)) errori.push('"allerta" fra grave, avviso, no (il segnale in testata quando colore_se accende la tile)');
  if (o.colore_se !== undefined) {
    if (!o.colore_se || typeof o.colore_se !== 'object' || Array.isArray(o.colore_se)) errori.push('"colore_se" deve essere { "<condizione>": colore }');
    else for (const [c, scelta] of Object.entries(o.colore_se)) {
      try { compilaCondizione(c); } catch (e) { errori.push(`colore_se: ${e.message}`); }
      const nome = typeof scelta === 'string' ? scelta : scelta?.colore;
      if (!COLORI.includes(nome) && !(argomenti && nome in argomenti)) errori.push(`colore_se "${c}": "${nome}" non è un colore né un argomento`);
    }
  }
  if (o.livello_minimo && !LIVELLI.includes(o.livello_minimo)) errori.push(`"livello_minimo" deve essere: ${LIVELLI.join(', ')}`);
  if (o.priorita !== undefined && typeof o.priorita !== 'number') errori.push('"priorita" deve essere un numero');
  if (o.ogni && durata(o.ogni) === null) errori.push('"ogni" non è una durata valida (es. 30s, 1m, 1h)');
  if (o.scadenza && durata(o.scadenza) === null) errori.push('"scadenza" non è una durata valida');
  // avvisi: { quando, messaggio, chiave, host, gravita, ora, volte } (or a list of blocks)
  if (o.avvisi !== undefined) {
    const regole = [].concat(o.avvisi);
    if (!o.dati) errori.push('"avvisi" serve solo a una tile che legge dati');
    regole.forEach((r, i) => {
      const dove = regole.length > 1 ? `avvisi[${i}]` : 'avvisi';
      if (!r || typeof r !== 'object') { errori.push(`"${dove}" deve essere { quando, messaggio, … }`); return; }
      if (!r.messaggio) errori.push(`"${dove}": manca "messaggio" (es. "{nome}: {dettaglio}")`);
      if (r.quando) { try { compilaCondizione(r.quando); } catch (e) { errori.push(`${dove}.quando: ${e.message}`); } }
      if (typeof r.gravita === 'string' && !['critico', 'attenzione'].includes(r.gravita)) errori.push(`${dove}.gravita: "critico" o "attenzione"`);
      if (r.gravita && typeof r.gravita === 'object') for (const [c, g] of Object.entries(r.gravita)) {
        try { compilaCondizione(c); } catch (e) { errori.push(`${dove}.gravita "${c}": ${e.message}`); }
        if (!['critico', 'attenzione'].includes(g)) errori.push(`${dove}.gravita: "critico" o "attenzione"`);
      }
    });
  }
  if (o.mostra_se && !['sempre', 'dati', 'mai'].includes(o.mostra_se)) {
    try { compilaCondizione(o.mostra_se); } catch { errori.push('"mostra_se" deve essere "sempre", "dati", "mai" (solo per raccogliere avvisi) o una condizione (es. "valvola == acceso")'); }
  }
  testoPerLivelli(o.riga, 'riga', errori);
  testoPerLivelli(o.testo, 'testo', errori);
  testoPerLivelli(o.titolo, 'titolo', errori);
  if (['immagine', 'iframe'].includes(o.tipo) && !o.url) errori.push(`una tile "${o.tipo}" ha bisogno di "url"`);
  if (/^rtsps?:/i.test(o.url ?? '')) avvisi.push('il browser non apre gli stream rtsp://: serve un URL http (MJPEG o JPEG), sulle Lilin è /getimage');
  if (o.tipo === 'valori') validaVoci(o.voci, errori);
  if (o.tipo === 'grafico' && o.voci !== undefined) validaVoci(o.voci, errori);
  if (o.fasce !== undefined) {
    if (o.tipo !== 'grafico') avvisi.push('"fasce" vale solo per le tile "grafico"');
    const fasce = Array.isArray(o.fasce) ? o.fasce : [o.fasce];
    fasce.forEach((f, i) => {
      if (!f || typeof f !== 'object' || !f.se) { errori.push(`fasce[${i}] deve essere { se: "<condizione>", etichetta }`); return; }
      try { compilaCondizione(f.se); } catch (e) { errori.push(`fasce[${i}].se: ${e.message}`); }
      if (f.tono && !TONI.includes(f.tono)) errori.push(`fasce[${i}].tono "${f.tono}" sconosciuto (ammessi: ${TONI.join(', ')})`);
    });
  }
  if (o.tabella !== undefined) {
    if (o.tipo !== 'elenco') avvisi.push('"tabella" vale solo per le tile "elenco"');
    else validaVoci(o.tabella, errori, 'tabella');
  }
  if (o.azioni !== undefined) validaAzioni(o, sorgenti, connettori, errori);
  if (o.tipo === 'grafico') {
    if (!Array.isArray(o.serie) || !o.serie.length || o.serie.some((x) => !x?.campo)) errori.push('una tile "grafico" ha bisogno di "serie": un elenco di { campo, etichetta }');
    else if (o.serie.length > 3) avvisi.push('più di 3 linee nello stesso grafico si distinguono male: meglio due grafici');
  }
  if (o.tipo === 'cronologia') {
    if (!o.gruppo || typeof o.gruppo !== 'string') errori.push('una tile "cronologia" ha bisogno di "gruppo": il campo che dice a quale riga appartiene un dato (es. stanza)');
    if (!o.se) errori.push('una tile "cronologia" ha bisogno di "se": la condizione di "acceso" (es. aperta == 1)');
    else { try { compilaCondizione(o.se); } catch (e) { errori.push(`se: ${e.message}`); } }
    if (o.ordine !== undefined && !Array.isArray(o.ordine)) errori.push('"ordine" deve essere un elenco di nomi di riga');
    if (o.tono && !TONI.includes(o.tono)) errori.push(`tono "${o.tono}" sconosciuto (ammessi: ${TONI.join(', ')})`);
    if (o.finestra !== undefined && !/^\d+[mhd]$/.test(String(o.finestra))) errori.push('"finestra" deve essere una durata come 24h, 12h, 7d');
    if (o.viste !== undefined && (!Array.isArray(o.viste) || o.viste.some((v) => !VISTE.includes(v)))) errori.push(`"viste" è un elenco fra: ${VISTE.join(', ')} (assente = in tutte)`);
    if (o.intensita !== undefined && !(Number.isFinite(o.intensita) && o.intensita >= 0 && o.intensita <= 100)) errori.push('"intensita" è una percentuale fra 0 e 100 (quanto è forte il colore quando la tile si accende; predefinita 10)');
    if (o.tacche !== undefined && !/^\d+[mhd]$/.test(String(o.tacche))) errori.push('"tacche" è una durata fra le tacche dell asse del tempo, es. 3h');
    if (o.soglie !== undefined && (!Array.isArray(o.soglie) || o.soglie.some((x) => !x || !Number.isFinite(Number(x.valore))))) errori.push('"soglie" deve essere un elenco di { valore: 5500, etichetta, tono } (linee orizzontali di riferimento)');
    if (o.in_fondo !== undefined && (!Array.isArray(o.in_fondo) || o.in_fondo.some((c) => typeof c !== 'string' && !(c && typeof c === 'object' && typeof c.valore === 'string')))) errori.push('"in_fondo" deve essere un elenco di colonne: { etichetta, valore: "{campo}", tenue: true } (o solo il testo)');
    if (o.finestre !== undefined && (!Array.isArray(o.finestre) || o.finestre.some((f) => !/^\d+[mhd]$/.test(String(f))))) errori.push('"finestre" deve essere un elenco di durate fra cui scegliere, es. [6h, 12h, 24h] (la query legge la più lunga)');
  }
  if (o.tipo === 'elenco' && !o.riga && !o.tabella) avvisi.push('senza "riga" né "tabella" ogni elemento viene mostrato con tutti i suoi campi');

  if (o.dati !== undefined) {
    const d = o.dati;
    if (!d || typeof d !== 'object') errori.push('"dati" deve contenere "sorgente" (o "tipo") e i parametri della lettura');
    else {
      let connettore;
      if (d.sorgente) {
        const s = sorgenti[d.sorgente];
        if (!s) errori.push(`la sorgente "${d.sorgente}" non esiste (crea config/sorgenti/${d.sorgente}.yaml)`);
        else connettore = connettori.get(s.tipo);
      } else if (d.tipo) {
        connettore = connettori.get(d.tipo);
        if (!connettore) errori.push(`"dati.tipo" sconosciuto: "${d.tipo}"`);
        else if (!connettore.senzaSorgente) errori.push(`il tipo "${d.tipo}" ha bisogno di una sorgente: usa "dati.sorgente"`);
      } else errori.push('"dati" deve indicare "sorgente" (un file in config/sorgenti) oppure "tipo: statico"');
      for (const campo of connettore?.campiDati || []) if (!d[campo]) errori.push(`manca "dati.${campo}" (richiesto da ${connettore.tipo})`);
    }
  } else if (t.conDati && o.tipo !== 'valore') {
    avvisi.push(`una tile "${o.tipo}" di solito ha un blocco "dati"`);
  }

  if (o.elabora !== undefined) {
    if (!Array.isArray(o.elabora)) errori.push('"elabora" deve essere un elenco di passaggi');
    else o.elabora.forEach((p, i) => {
      const nome = p && typeof p === 'object' ? Object.keys(p)[0] : null;
      if (!NOMI_PASSAGGI.includes(nome)) errori.push(`elabora[${i}]: passaggio sconosciuto "${nome}" (ammessi: ${NOMI_PASSAGGI.join(', ')})`);
      else if (nome === 'filtra') { try { compilaCondizione(p.filtra); } catch (e) { errori.push(`elabora[${i}]: ${e.message}`); } }
    });
  }
  return { errori, avvisi };
}
