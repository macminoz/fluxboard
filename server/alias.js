// English keys and values for the YAML files.
//
// Fluxboard was born in Italian and its configuration keys are Italian (`titolo`, `tipo`,
// `etichetta`…). Every file can also be written in English (`title`, `type`, `label`…), or even
// mix the two: before anything else reads a file, `normalizza()` turns the English keys and the
// English values of the known lists (tile types, widths, colours, levels…) into the internal
// Italian ones. Nothing else in the code needs to know.
//
// Keys whose children are names chosen by the user (field names, label names, conditions,
// HTTP headers…) are left alone: only their values are normalised where it makes sense
// (e.g. the colour in `colour_if: { "temp > 30": red }`).
//
// `inInglese()` does the opposite, for the files Fluxboard writes on an English installation.

// ------------------------------------------------------------------ keys (English → Italian)
export const CHIAVI = {
  // tile
  title: 'titolo', type: 'tipo', label: 'etichetta', icon: 'icona', colour: 'colore', color: 'colore',
  background: 'sfondo', priority: 'priorita', width: 'larghezza', every: 'ogni', stale_after: 'scadenza',
  show_if: 'mostra_se', data: 'dati', process: 'elabora', row: 'riga', text: 'testo', empty: 'vuoto',
  items: 'voci', table: 'tabella', colour_if: 'colore_se', color_if: 'colore_se', actions: 'azioni',
  alerts: 'avvisi', alert: 'allerta', views: 'viste', intensity: 'intensita', direct: 'diretto',
  height: 'altezza', refresh_every: 'aggiorna_ogni', min_level: 'livello_minimo', series: 'serie',
  bands: 'fasce', thresholds: 'soglie', ticks: 'tacche', group: 'gruppo', if: 'se', order: 'ordine',
  window: 'finestra', windows: 'finestre', tone: 'tono', label_if: 'etichetta_se', status: 'stato',
  status_if: 'stato_se', footer: 'in_fondo', axis: 'asse', unit: 'unita', decimals: 'decimali',
  also_in: 'anche_in', active: 'attiva', kind: 'genere', fields: 'campi', from_catalogue: 'da_catalogo',
  include: 'includi', exclude: 'escludi', error: 'errore',
  // table columns, value items, footer
  value: 'valore', level: 'livello', align: 'allinea', faint: 'tenue',
  // data
  source: 'sorgente', rows: 'righe', method: 'metodo', path: 'percorso', body: 'corpo', list: 'elenco',
  services: 'servizi', resource: 'risorsa', page: 'pagina', node: 'nodo', limit_rows: 'limite',
  // actions and their form fields
  operation: 'operazione', key: 'chiave', parameters: 'parametri', confirm: 'conferma', global: 'globale',
  immediate: 'subito', when: 'quando', name: 'nome', values: 'valori', format: 'formato',
  required: 'obbligatorio', example: 'esempio', help: 'aiuto', default: 'predefinito',
  // alerts block
  message: 'messaggio', severity: 'gravita', time: 'ora', count: 'volte',
  // global.yaml
  language: 'lingua', timezone: 'fuso', theme: 'tema', refresh: 'aggiornamento', sections: 'sezioni',
  labels: 'argomenti', hide_empty: 'nascondi_vuote', screens: 'schermi', notifications: 'notifiche',
  address: 'indirizzo', headers: 'intestazioni', also_resolved: 'anche_risolte', repeat_after: 'ripeti_dopo',
  // display profiles
  columns: 'colonne', view: 'vista', controls: 'controlli', panel: 'pannello', tour: 'giro',
  // layout
  shrunk: 'ridotta', closed: 'chiusa', table_columns: 'colonne_tabella',
  // sources
  user: 'utente', authentication: 'autenticazione', ca_certificate: 'certificato_ca',
  certificate_name: 'nome_certificato', verify_certificate: 'verifica_certificato', protected: 'protetti',
  // probes and software lists
  resolves: 'risolve', resolve: 'risolve', contains: 'contiene', expect: 'atteso', installed: 'installata',
  branch: 'ramo', prefix: 'prefisso', field: 'campo', search: 'cerca',
  // kinds (genre files) and catalogue recipes
  description: 'descrizione', model: 'modello', market: 'mercato',
  // processing steps (elabora)
  filter: 'filtra', sort: 'ordina', limit: 'limita', rename: 'rinomina', scale: 'scala', map: 'traduci',
  select: 'seleziona', append: 'aggiungi',
  // more source, probe and chart keys
  secret: 'segreto', token_user: 'utente_token', decode: 'decodifica', certificate_warning: 'avviso_certificato',
  wait: 'attesa', step: 'gradino', error_if: 'errore_se',
};

// Children are user names (fields, labels, conditions, headers): keys kept as they are.
const CHIAVI_LIBERE = new Set(['campi', 'traduci', 'rinomina', 'scala', 'colore_se', 'tono', 'gravita',
  'intestazioni', 'parametri', 'argomenti', 'sezioni', 'colonne_tabella', 'quando_valori']);

// ------------------------------------------------------------------ values (English → Italian)
const COLORI = { blue: 'blu', azure: 'azzurro', lightblue: 'azzurro', 'light-blue': 'azzurro', green: 'verde', yellow: 'giallo',
  orange: 'arancio', red: 'rosso', purple: 'viola', violet: 'viola', pink: 'rosa', cyan: 'ciano', indigo: 'indaco',
  lime: 'lime', amber: 'ambra', brown: 'marrone', grey: 'grigio', gray: 'grigio' };
const LIVELLI = { basic: 'base', intermediate: 'intermedia', advanced: 'avanzata' };
const VISTE = { basic: 'base', medium: 'media', advanced: 'avanzata', alarms: 'allarmi', full: 'completa' };
const TONI = { warning: 'attenzione', alarm: 'allarme', hot: 'caldo', cold: 'freddo', off: 'spento', ignore: 'ignora' };
const ICONE = { thermometer: 'termometro', flame: 'fiamma', fire: 'fiamma', sun: 'sole', cloud: 'nuvola', lightning: 'fulmine',
  bolt: 'fulmine', home: 'casa', house: 'casa', network: 'rete', alarm: 'allarme', chart: 'grafico', camera: 'telecamera',
  clock: 'orologio', note: 'nota', bulb: 'lampadina', plug: 'spina', door: 'porta', window: 'finestra', shutter: 'tapparella',
  gate: 'cancello', sofa: 'divano', bed: 'letto', kitchen: 'cucina', coffee: 'caffe', washer: 'lavatrice', fan: 'ventilatore',
  plant: 'pianta', car: 'auto', pet: 'animale', person: 'persona', people: 'persone', heart: 'cuore', moon: 'luna',
  rain: 'pioggia', snow: 'neve', wind: 'vento', drop: 'goccia', water: 'acqua', battery: 'batteria', speed: 'velocita',
  shield: 'scudo', lock: 'lucchetto', key: 'chiave', bell: 'campana', sensor: 'sensore', terminal: 'terminale',
  compare: 'confronta', disk: 'disco', package: 'pacchetto', update: 'aggiorna', activity: 'attivita', printer: 'stampante',
  speaker: 'altoparlante', music: 'musica', game: 'gioco', phone: 'telefono', mail: 'posta', book: 'libro',
  calendar: 'calendario', hourglass: 'clessidra', bars: 'barre', pie: 'torta', list: 'lista', star: 'stella', flag: 'bandiera',
  location: 'posizione', cart: 'carrello' };

export const VALORI = {
  tipo: { list: 'elenco', value: 'valore', values: 'valori', chart: 'grafico', timeline: 'cronologia', text: 'testo',
    clock: 'orologio', image: 'immagine', static: 'statico', alerts: 'avvisi', probes: 'sonde', versions: 'versioni',
    query: 'query', yaml: 'yaml', number: 'numero', duration: 'durata', secret: 'segreto', choice: 'scelta', data: 'dati',
    none: 'nessuna', parameter: 'parametro', header: 'intestazione' },
  larghezza: { narrow: 'stretta', medium: 'media', wide: 'larga' },
  mostra_se: { always: 'sempre', data: 'dati', never: 'mai' },
  livello: LIVELLI, livello_minimo: LIVELLI,
  vista: VISTE, viste: VISTE,
  tema: { light: 'chiaro', dark: 'scuro' },
  colore: COLORI,
  sfondo: {},
  icona: ICONE,
  tono: TONI,
  allerta: { critical: 'grave', warning: 'avviso' },
  gravita: { critical: 'critico', warning: 'attenzione' },
  formato: { text: 'testo' },
  allinea: { left: 'sinistra', right: 'destra' },
  risorsa: { system: 'sistema', sessions: 'sessioni', ports: 'porte', guests: 'ospiti', nodes: 'nodi', space: 'spazio',
    interfaces: 'interfacce', states: 'stati', flows: 'flussi' },
  genere: { trend: 'andamento', timeline: 'cronologia', measure: 'misura', correlation: 'correlazione', messages: 'messaggi', note: 'nota' },
  operazione: { hide_row: 'nascondi_riga', ignore_row: 'ignora_riga', restore_rows: 'ripristina_righe', acknowledge: 'conferma',
    acknowledge_all: 'conferma_tutti', ignore: 'ignora', restore_ignored: 'ripristina_ignorati', start: 'avvia', shutdown: 'spegni', reboot: 'riavvia', stop: 'ferma', request: 'richiesta' },
};

const oggetto = (x) => x && typeof x === 'object' && !Array.isArray(x);
const valoreDi = (chiave, v) => {
  const m = VALORI[chiave];
  if (!m) return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' && m[x] ? m[x] : x));
  return typeof v === 'string' && m[v] ? m[v] : v;
};

// Conditions are text: "temp > 30 and valve == on" → "temp > 30 e valve == on". The word
// operators only; field names and values stay as written.
export function condizioneItaliana(testo) {
  if (typeof testo !== 'string') return testo;
  return testo.replace(/\s+and\s+/g, ' e ').replace(/\s+or\s+/g, ' o ').replace(/(\S)\s+within\s+/g, '$1 entro ').replace(/(\S)\s+older\s+than\s+/g, '$1 oltre ').replace(/(\S)\s+over\s+/g, '$1 oltre ');
}
const CONDIZIONI = new Set(['quando', 'mostra_se', 'filtra', 'se', 'etichetta_se', 'stato_se', 'errore_se']);
// Maps whose keys are conditions and whose values are colours, tones or severities.
const MAPPE_DI_CONDIZIONI = { colore_se: 'colore', tono: 'tono', gravita: 'gravita' };

export function normalizza(x, padre = '') {
  if (Array.isArray(x)) return x.map((v) => normalizza(v, padre));
  if (!oggetto(x)) { const v = valoreDi(padre, x); return CONDIZIONI.has(padre) ? condizioneItaliana(v) : v; }
  const r = {};
  for (const [k0, v] of Object.entries(x)) {
    const k = CHIAVI[k0] && !(CHIAVI[k0] in x) ? CHIAVI[k0] : k0;
    if (MAPPE_DI_CONDIZIONI[k] && oggetto(v)) {
      r[k] = Object.fromEntries(Object.entries(v).map(([c, s]) => [condizioneItaliana(c),
        oggetto(s) ? normalizza(s, k) : valoreDi(MAPPE_DI_CONDIZIONI[k], s)]));
    } else if (k === 'argomenti' && oggetto(v)) {
      r[k] = Object.fromEntries(Object.entries(v).map(([n, a]) => [n, typeof a === 'string' ? valoreDi('colore', a) : normalizza(a)]));
    } else if (k === 'sezioni' && oggetto(v)) {
      r[k] = Object.fromEntries(Object.entries(v).map(([n, a]) => [n, normalizza(a)]));
    } else if (CHIAVI_LIBERE.has(k) && oggetto(v)) {
      r[k] = v;
    } else r[k] = normalizza(v, k);
  }
  return r;
}

// ------------------------------------------------------------------ the other way round
const INVERSE = Object.fromEntries(Object.entries(CHIAVI).filter(([en]) => !['color', 'color_if', 'resolve'].includes(en)).map(([en, it]) => [it, en]));
const VALORI_INVERSI = Object.fromEntries(Object.entries(VALORI).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).filter(([en]) => !['lightblue', 'light-blue', 'gray', 'violet', 'fire', 'bolt', 'house'].includes(en)).map(([en, it]) => [it, en]))]));
const valoreInglese = (chiave, v) => {
  const m = VALORI_INVERSI[chiave];
  if (!m) return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' && m[x] ? m[x] : x));
  return typeof v === 'string' && m[v] ? m[v] : v;
};
const condizioneInglese = (s) => (typeof s === 'string' ? s.replace(/\s+e\s+/g, ' and ').replace(/\s+o\s+/g, ' or ').replace(/(\S)\s+entro\s+/g, '$1 within ').replace(/(\S)\s+oltre\s+/g, '$1 over ') : s);

// An object with internal (Italian) keys → the same with English keys, for writing files.
export function inInglese(x, padre = '') {
  if (Array.isArray(x)) return x.map((v) => inInglese(v, padre));
  if (!oggetto(x)) { const v = valoreInglese(padre, x); return CONDIZIONI.has(padre) ? condizioneInglese(v) : v; }
  const r = {};
  for (const [k, v] of Object.entries(x)) {
    const en = INVERSE[k] || k;
    if (MAPPE_DI_CONDIZIONI[k] && oggetto(v)) {
      r[en] = Object.fromEntries(Object.entries(v).map(([c, s]) => [condizioneInglese(c),
        oggetto(s) ? inInglese(s, k) : valoreInglese(MAPPE_DI_CONDIZIONI[k], s)]));
    } else if (k === 'argomenti' && oggetto(v)) {
      r[en] = Object.fromEntries(Object.entries(v).map(([n, a]) => [n, typeof a === 'string' ? valoreInglese('colore', a) : inInglese(a)]));
    } else if (k === 'sezioni' && oggetto(v)) {
      r[en] = Object.fromEntries(Object.entries(v).map(([n, a]) => [n, inInglese(a)]));
    } else if (CHIAVI_LIBERE.has(k) && oggetto(v)) {
      r[en] = v;
    } else r[en] = inInglese(v, k);
  }
  return r;
}

// The key to use in a file for an internal key: the one already there (English or Italian),
// otherwise the language of the file (English when it already has English keys).
export function chiaveNelFile(chiavi, it) {
  if (chiavi.includes(it)) return it;
  const en = INVERSE[it];
  if (en && chiavi.includes(en)) return en;
  const inglese = chiavi.some((k) => CHIAVI[k] && !INVERSE[k]);
  return inglese && en ? en : it;
}

// Names of the fields of the kinds (generi/*.yaml) in English: "fields: { columns: … }" in a
// tile of a kind. Besides the keys above (data, columns, unit…), the ones of the kinds only.
export const CAMPI_GENERE = { ...CHIAVI, filter: 'filtro', highlight: 'evidenzia', sort: 'ordina', failure: 'guasto',
  warning: 'attenzione', ok: 'ok', refresh_every: 'aggiorna_ogni', status_if: 'stato_se' };
