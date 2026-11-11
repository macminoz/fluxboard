// Forms generated from the description of a connector's fields (moduloSorgente / moduloDati):
// each source type has its own form, like Grafana's "data sources", without writing HTML for
// each. A field:
//   { nome: 'autenticazione.tipo', etichetta, tipo, obbligatorio, predefinito, esempio, aiuto,
//     valori: { key: text } (for "scelta"), quando: { otherField: [values] } }
// types: testo · url · durata · numero · scelta · query (long text) · segreto · mappa · si-no

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

// segreti: the list from /api/config/segreti, to tell whether the quoted secret is set.
function controllo(def, valore, segreti) {
  const id = `m-${def.nome.replace(/\W/g, '-')}`;
  const segnaposto = def.esempio ? ` placeholder="${proteggi(String(def.esempio).split('\n')[0])}"` : '';
  switch (def.tipo) {
    case 'scelta': {
      const scelto = valore ?? def.predefinito;
      // A value written in the file that the choice does not know stays selectable: it is not lost
      // on save.
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

// A list or an object as compact YAML, as written in the files: one element per line, "- { nome:
// Grafana, repo: grafana/grafana }". The server reads it back as YAML.
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

// Shows only the fields that apply to the choices made (e.g. "User" only with basic
// authentication).
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

// The form's values as a nested object. An empty or hidden field is null (= remove the key from the
// file); written secrets come back apart, because the server saves them among the secrets. `mappe`
// lists the paths of the maps, which are replaced whole.
export function leggiModulo(contenitore) {
  const valori = {}, segreti = {}, mappe = [];
  // A form inside another (the source's fields inside a kind's) is read separately: each reads only
  // the fields of its scope.
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
    // The default value is not written in the file: it stays shorter and follows future changes.
    if (v != null && campo.dataset.predefinito !== undefined && String(v) === campo.dataset.predefinito) v = null;
    imposta(valori, nome, v);
  }
  return { valori, segreti, mappe };
}

// "+ Add" and "✕" of the maps; to hook to the container's click.
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

// Missing required fields, for a clear message before saving.
export function mancanti(defs, contenitore) {
  return defs.filter((d) => d.obbligatorio && d.tipo !== 'segreto').filter((d) => {
    const campo = contenitore.querySelector(`.campo-modulo[data-campo="${CSS.escape(d.nome)}"]`);
    const el = campo?.querySelector('[data-modulo]');
    return campo && !campo.hidden && el && !el.value?.trim();
  }).map((d) => d.etichetta);
}
