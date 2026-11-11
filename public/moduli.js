// Moduli generati dalla descrizione dei campi di un connettore (moduloSorgente / moduloDati):
// così ogni tipo di sorgente ha il suo modulo, come le "data source" di Grafana, senza scrivere
// HTML per ciascuno. Un campo:
//   { nome: 'autenticazione.tipo', etichetta, tipo, obbligatorio, predefinito, esempio, aiuto,
//     valori: { chiave: testo } (per "scelta"), quando: { altroCampo: [valori] } }
// tipi: testo · url · durata · numero · scelta · query (testo lungo) · segreto · mappa · si-no

import { proteggi } from './formato.js';

const leggi = (o, percorso) => percorso.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

function imposta(o, percorso, valore) {
  const chiavi = percorso.split('.');
  let x = o;
  for (const k of chiavi.slice(0, -1)) x = x[k] && typeof x[k] === 'object' ? x[k] : (x[k] = {});
  x[chiavi.at(-1)] = valore;
}

function rigaMappa(chiave = '', valore = '') {
  return `<div class="riga-mappa">
    <input class="mono" data-chiave value="${proteggi(chiave)}" placeholder="nome" autocomplete="off">
    <input class="mono" data-valore value="${proteggi(valore)}" placeholder="valore" autocomplete="off">
    <button type="button" class="togli-voce" data-azione-modulo="togli-riga" aria-label="Togli">✕</button></div>`;
}

// segreti: l'elenco di /api/config/segreti, per dire se il segreto citato è impostato.
function controllo(def, valore, segreti) {
  const id = `m-${def.nome.replace(/\W/g, '-')}`;
  const segnaposto = def.esempio ? ` placeholder="${proteggi(String(def.esempio).split('\n')[0])}"` : '';
  switch (def.tipo) {
    case 'scelta': {
      const scelto = valore ?? def.predefinito;
      // Un valore scritto nel file che la scelta non conosce resta selezionabile: non si perde salvando.
      const valori = { ...(def.valori || {}) };
      if (scelto != null && !(String(scelto) in valori)) valori[String(scelto)] = String(scelto);
      return `<select id="${id}" data-modulo>${Object.entries(valori).map(([k, t]) =>
        `<option value="${proteggi(k)}"${String(scelto) === k ? ' selected' : ''}>${proteggi(t)}</option>`).join('')}</select>`;
    }
    case 'query':
      return `<textarea id="${id}" data-modulo class="mono" rows="${def.nome === 'query' ? 8 : Math.min(12, Math.max(4, (typeof valore === 'object' && valore ? (Array.isArray(valore) ? valore.length : 4) : 4) + 1))}" spellcheck="false"${segnaposto}>${proteggi(typeof valore === 'object' && valore ? comeYaml(valore) : valore ?? '')}</textarea>`;
    case 'si-no':
      return `<input id="${id}" data-modulo type="checkbox"${(valore ?? def.predefinito) ? ' checked' : ''}>`;
    case 'mappa': {
      const voci = Object.entries(valore && typeof valore === 'object' ? valore : {});
      return `<div class="mappa" data-modulo>${voci.map(([k, v]) => rigaMappa(k, typeof v === 'object' ? JSON.stringify(v) : v)).join('')}</div>
        <button type="button" class="aggiungi-voce" data-azione-modulo="aggiungi-riga">+ Aggiungi</button>`;
    }
    case 'segreto': {
      const m = typeof valore === 'string' && valore.match(/^\$\{([A-Z0-9_]+)\}$/);
      const s = m && segreti?.find((x) => x.nome === m[1]);
      const stato = m
        ? s?.impostato ? `impostato (<code>${proteggi(m[1])}</code>${s.finale ? `, finisce con …${proteggi(s.finale)}` : ''}): lascia vuoto per non cambiarlo` : `<b class="errore">${proteggi(m[1])} non è impostato</b>`
        : valore ? '<b class="errore">scritto in chiaro nel file: incollalo qui per spostarlo fra i segreti</b>' : 'non impostato';
      return `<input id="${id}" data-modulo type="password" autocomplete="new-password" spellcheck="false" placeholder="incolla il valore">
        <span class="stato-segreto">${stato}</span>`;
    }
    default:
      return `<input id="${id}" data-modulo class="${['url', 'durata'].includes(def.tipo) ? 'mono' : ''}"${def.tipo === 'numero' ? ' type="number"' : ''} value="${proteggi(valore ?? '')}"${segnaposto || (def.predefinito != null ? ` placeholder="${proteggi(def.predefinito)}"` : '')} autocomplete="off">`;
  }
}

// Un elenco o un oggetto come YAML compatto, come si scrive nei file: un elemento per riga,
// "- { nome: Grafana, repo: grafana/grafana }". Il server lo rilegge come YAML.
function yamlValore(v) {
  if (Array.isArray(v)) return `[${v.map(yamlValore).join(', ')}]`;
  if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${yamlValore(x)}`).join(', ')} }`;
  if (typeof v === 'string') return /^[\w./@-][\w ./@-]*$/.test(v) && !/^(true|false|null|-?\d+(\.\d+)?)$/.test(v) && !/[ ]$/.test(v) ? v : JSON.stringify(v);
  return String(v);
}
export function comeYaml(valore) {
  return Array.isArray(valore) ? valore.map((x) => `- ${yamlValore(x)}`).join('\n') : Object.entries(valore).map(([k, x]) => `${k}: ${yamlValore(x)}`).join('\n');
}

export function disegnaModulo(defs, valori = {}, { segreti = [] } = {}) {
  return defs.map((def) => `<div class="campo-modulo" data-campo="${proteggi(def.nome)}" data-tipo="${def.tipo}"${def.predefinito != null ? ` data-predefinito="${proteggi(def.predefinito)}"` : ''}${def.quando ? ` data-quando='${proteggi(JSON.stringify(def.quando))}'` : ''}>
      <label>${proteggi(def.etichetta)}${def.obbligatorio ? ' <span class="obbligatorio" title="obbligatorio">*</span>' : ''}</label>
      ${controllo(def, leggi(valori, def.nome), segreti)}
      ${def.aiuto ? `<p class="aiuto">${def.aiuto}</p>` : ''}</div>`).join('');
}

// Mostra solo i campi che valgono per le scelte fatte (es. "Utente" solo con autenticazione basic).
export function aggiornaVisibilita(contenitore) {
  const valoreDi = (nome) => {
    const el = contenitore.querySelector(`.campo-modulo[data-campo="${CSS.escape(nome)}"] [data-modulo]`);
    return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined;
  };
  for (const campo of contenitore.querySelectorAll('.campo-modulo[data-quando]')) {
    const quando = JSON.parse(campo.dataset.quando);
    campo.hidden = !Object.entries(quando).every(([nome, ammessi]) => ammessi.includes(valoreDi(nome)));
  }
}

// I valori del modulo come oggetto annidato. Un campo vuoto o nascosto vale null (= togli la chiave
// dal file); i segreti scritti tornano a parte, perché il server li salva fra i segreti.
// `mappe` elenca i percorsi delle mappe, che vanno sostituite intere.
export function leggiModulo(contenitore) {
  const valori = {}, segreti = {}, mappe = [];
  // Un modulo dentro un altro (i campi della sorgente dentro quelli di un genere) si legge a parte:
  // ognuno legge solo i campi del suo ambito.
  const ambito = contenitore.closest('[data-ambito]');
  for (const campo of contenitore.querySelectorAll('.campo-modulo')) {
    if (campo.closest('[data-ambito]') !== ambito) continue;
    const nome = campo.dataset.campo;
    const tipo = campo.dataset.tipo;
    const el = campo.querySelector('[data-modulo]');
    if (campo.hidden) { if (tipo !== 'segreto') imposta(valori, nome, null); continue; }
    if (tipo === 'segreto') { segreti[nome] = el.value.trim(); continue; }
    let v;
    if (tipo === 'si-no') v = el.checked;
    else if (tipo === 'mappa') {
      const coppie = [...el.querySelectorAll('.riga-mappa')].map((r) => [r.querySelector('[data-chiave]').value.trim(), r.querySelector('[data-valore]').value.trim()]).filter(([k]) => k);
      v = coppie.length ? Object.fromEntries(coppie) : null;
      mappe.push(nome.split('.'));
    } else if (tipo === 'numero') v = el.value === '' ? null : Number(el.value);
    else v = el.value.trim() || null;
    // Il valore predefinito non si scrive nel file: resta più corto e segue eventuali cambi futuri.
    if (v != null && campo.dataset.predefinito !== undefined && String(v) === campo.dataset.predefinito) v = null;
    imposta(valori, nome, v);
  }
  return { valori, segreti, mappe };
}

// "+ Aggiungi" e "✕" delle mappe; da agganciare al click del contenitore.
export function gestisciClickModulo(e) {
  const b = e.target.closest('[data-azione-modulo]');
  if (!b) return false;
  if (b.dataset.azioneModulo === 'aggiungi-riga') {
    b.previousElementSibling.insertAdjacentHTML('beforeend', rigaMappa());
    b.previousElementSibling.lastElementChild.querySelector('input').focus();
    return true;
  }
  if (b.dataset.azioneModulo === 'togli-riga') { b.closest('.riga-mappa').remove(); return true; }
  return false;
}

// Campi obbligatori mancanti, per un messaggio chiaro prima di salvare.
export function mancanti(defs, contenitore) {
  return defs.filter((d) => d.obbligatorio && d.tipo !== 'segreto').filter((d) => {
    const campo = contenitore.querySelector(`.campo-modulo[data-campo="${CSS.escape(d.nome)}"]`);
    const el = campo?.querySelector('[data-modulo]');
    return campo && !campo.hidden && el && !el.value?.trim();
  }).map((d) => d.etichetta);
}
