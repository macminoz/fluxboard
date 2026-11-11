// Editor web delle configurazioni: elenco dei file, modifica con validazione mentre si scrive,
// prova della lettura dati prima di salvare, versioni precedenti. Il server rifiuta un file non
// valido, quindi un errore di battitura non può rompere la dashboard.

import { proteggi } from './formato.js';

const $ = (id) => document.getElementById(id);
const testo = $('testo');
let elenco = null;          // risposta di /api/config
let corrente = null;        // percorso aperto
let salvato = '';           // testo come sta sul server
let nuovoFile = false;      // il file aperto non esiste ancora sul server
let attesaValidazione = null;
let segreti = [];           // da /api/config/segreti: nomi e stato, mai i valori
let segretoAperto = null;

async function api(percorso, opzioni = {}) {
  const r = await fetch(`/api/config${percorso}`, {
    ...opzioni,
    headers: opzioni.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opzioni.body ? JSON.stringify(opzioni.body) : undefined,
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.errore || `errore ${r.status}`);
  return corpo;
}

function segno(f) {
  if (f.errori?.length) return '<span class="segno errore" title="Non valido">●</span>';
  if (f.avvisi?.length) return '<span class="segno avviso" title="Avvisi">●</span>';
  return '';
}

function disegnaElenco() {
  for (const genere of ['globale', 'tile', 'sorgente', 'layout']) {
    const ul = $(`lista-${genere}`);
    ul.innerHTML = elenco.file.filter((f) => f.genere === genere).map((f) => `
      <li><button type="button" data-percorso="${proteggi(f.percorso)}" ${f.percorso === corrente ? 'aria-current="true"' : ''}>
        <span class="${f.attiva === false ? 'spenta' : ''}">${proteggi(f.genere === 'globale' ? 'global.yaml' : f.nome)}</span>${segno(f)}
      </button></li>`).join('');
  }
  $('tipi-tile').textContent = elenco.tipiTile.map((t) => t.tipo).join(' · ');
  $('tipi-sorgente').textContent = elenco.connettori.filter((c) => !c.senzaSorgente).map((c) => c.tipo).join(', ');
}

async function ricaricaElenco() {
  elenco = await api('/');
  disegnaElenco();
}

function mostraMessaggi({ errori = [], avvisi = [], ok }) {
  $('messaggi').innerHTML = [
    ...errori.map((e) => `<p class="errore">✕ ${proteggi(e)}</p>`),
    ...avvisi.map((a) => `<p class="avviso">! ${proteggi(a)}</p>`),
    ok ? `<p class="ok">✓ ${proteggi(ok)}</p>` : '',
  ].join('');
}

function segnaModificato() {
  const diverso = nuovoFile || testo.value !== salvato;
  $('modificato').hidden = !diverso;
  $('salva').disabled = !diverso;
}

function mostraEditorFile(si) {
  testo.hidden = !si;
  $('pannello-segreto').hidden = si;
  for (const id of ['salva', 'modificato']) if (!si) $(id).hidden = true;
  if (si) $('salva').hidden = false;
  if (!si) for (const id of ['prova', 'elimina', 'versioni']) $(id).hidden = true;
  $('risultato').innerHTML = '';
}

async function apri(percorso, contenuto = null) {
  if (corrente && testo.value !== salvato && !confirm('Ci sono modifiche non salvate. Le perdi?')) return;
  mostraEditorFile(true);
  segretoAperto = null;
  corrente = percorso;
  nuovoFile = contenuto !== null;
  salvato = nuovoFile ? '' : (await api(`/file?percorso=${encodeURIComponent(percorso)}`)).testo;
  testo.value = nuovoFile ? contenuto : salvato;
  testo.disabled = false;
  $('percorso').textContent = percorso;
  $('prova').hidden = !percorso.startsWith('tile/');
  $('elimina').hidden = nuovoFile || percorso === 'global.yaml';
  $('risultato').innerHTML = '';
  segnaModificato();
  disegnaElenco();
  await caricaVersioni();
  valida();
  history.replaceState(null, '', `#${percorso}`);
}

async function caricaVersioni() {
  const scelta = $('versioni');
  if (nuovoFile) { scelta.hidden = true; return; }
  const { versioni } = await api(`/storico?percorso=${encodeURIComponent(corrente)}`);
  scelta.hidden = !versioni.length;
  scelta.innerHTML = `<option value="">Versioni precedenti (${versioni.length})</option>` + versioni.map((v) => {
    const quando = v.split('.').slice(-2, -1)[0].replace(/T(\d\d)-(\d\d)-(\d\d).*/, ' $1:$2:$3');
    return `<option value="${proteggi(v)}">${proteggi(quando)}</option>`;
  }).join('');
}

async function valida() {
  if (!corrente) return;
  const esito = await api('/valida', { method: 'POST', body: { percorso: corrente, testo: testo.value } });
  mostraMessaggi(esito);
}

async function salva() {
  if (!corrente || $('salva').disabled) return;
  const esito = await api('/file', { method: 'PUT', body: { percorso: corrente, testo: testo.value } });
  if (!esito.ok) { mostraMessaggi(esito); return; }
  salvato = testo.value.endsWith('\n') ? testo.value : `${testo.value}\n`;
  testo.value = salvato;
  nuovoFile = false;
  $('elimina').hidden = corrente === 'global.yaml';
  segnaModificato();
  mostraMessaggi({ ...esito, ok: 'Salvato: la dashboard si è già aggiornata.' });
  await ricaricaElenco();
  await caricaVersioni();
}

function tabella(righe) {
  const colonne = [...new Set(righe.flatMap((r) => Object.keys(r)))];
  return `<table><thead><tr>${colonne.map((c) => `<th>${proteggi(c)}</th>`).join('')}</tr></thead><tbody>${
    righe.map((r) => `<tr>${colonne.map((c) => `<td>${proteggi(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

async function prova() {
  $('risultato').innerHTML = '<p class="vuoto">Lettura in corso…</p>';
  const esito = await api('/prova', { method: 'POST', body: { percorso: corrente, testo: testo.value } });
  if (esito.errori) { mostraMessaggi(esito); $('risultato').innerHTML = ''; return; }
  if (esito.errore) { $('risultato').innerHTML = `<p class="errore">✕ ${proteggi(esito.errore)}</p>`; return; }
  if (esito.nota) { $('risultato').innerHTML = `<p class="vuoto">${proteggi(esito.nota)}</p>`; return; }
  const intestazione = `<p class="vuoto">${esito.totale} righe dopo "elabora", in ${esito.ms} ms${esito.totale ? '' : ' — con mostra_se: dati la tile adesso sarebbe nascosta'}.</p>`;
  $('risultato').innerHTML = intestazione + (esito.righe.length ? tabella(esito.righe) : '');
}

async function elimina() {
  if (!confirm(`Spostare ${corrente} nel cestino? (resta recuperabile in config/.cestino)`)) return;
  await api(`/file?percorso=${encodeURIComponent(corrente)}`, { method: 'DELETE' });
  salvato = testo.value; corrente = null;
  testo.value = ''; testo.disabled = true;
  $('percorso').textContent = 'Scegli un file';
  for (const id of ['prova', 'elimina', 'versioni']) $(id).hidden = true;
  mostraMessaggi({ ok: 'Spostato nel cestino.' });
  await ricaricaElenco();
}

// ---------------------------------------------------------------- segreti (sola scrittura)


function disegnaSegreti() {
  $('lista-segreti').innerHTML = segreti.map((g) => `
    <li><button type="button" data-segreto="${proteggi(g.nome)}" ${g.nome === segretoAperto ? 'aria-current="true"' : ''}>
      <span class="mono">${proteggi(g.nome)}</span>${g.impostato ? '' : '<span class="segno errore" title="Non impostato">●</span>'}
    </button></li>`).join('') || '<li class="vuoto">nessuno</li>';
}

async function caricaSegreti() {
  ({ segreti } = await api('/segreti'));
  disegnaSegreti();
}

function apriSegreto(nome) {
  if (corrente && testo.value !== salvato && !confirm('Ci sono modifiche non salvate. Le perdi?')) return;
  corrente = null; salvato = ''; testo.value = '';
  segretoAperto = nome;
  const g = segreti.find((x) => x.nome === nome) || { nome, impostato: false, usatoDa: [] };
  mostraEditorFile(false);
  $('percorso').textContent = `Segreto ${nome}`;
  $('segreto-stato').innerHTML = (g.impostato
    ? `<b class="ok">Impostato</b>${g.finale ? `, finisce con <code>…${proteggi(g.finale)}</code>` : ''}${g.origine === 'ambiente' ? ' (dal file <code>.env</code> del server: salvando qui lo sostituisci)' : ''}.`
    : '<b class="errore">Non impostato</b>: le sorgenti che lo usano non funzionano.')
    + `<br>Usato da: ${g.usatoDa.length ? g.usatoDa.map((s) => (/\s/.test(s) ? proteggi(s) : `<code>sorgenti/${proteggi(s)}.yaml</code>`)).join(', ') : 'nessuna sorgente'}.`
    + ` Nelle sorgenti si scrive <code>\${${proteggi(nome)}}</code>.`;
  $('segreto-valore').value = '';
  $('segreto-rimuovi').hidden = g.origine !== 'editor';
  mostraMessaggi({});
  disegnaElenco(); disegnaSegreti();
  history.replaceState(null, '', `#segreto:${nome}`);
  $('segreto-valore').focus();
}

async function salvaSegreto(valore) {
  ({ segreti } = await api('/segreti', { method: 'PUT', body: { nome: segretoAperto, valore } }));
  const nome = segretoAperto;
  apriSegreto(nome);
  mostraMessaggi({ ok: valore ? 'Segreto salvato: le tile che lo usano si stanno rileggendo.' : 'Segreto rimosso.' });
}

$('pannello-segreto').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('segreto-valore').value.trim();
  if (!v) { mostraMessaggi({ errori: ['Scrivi il nuovo valore (per toglierlo usa Rimuovi)'] }); return; }
  salvaSegreto(v).catch((err) => mostraMessaggi({ errori: [err.message] }));
});
$('segreto-rimuovi').addEventListener('click', () => {
  if (confirm(`Rimuovere ${segretoAperto}? Le sorgenti che lo usano smetteranno di funzionare.`)) salvaSegreto('').catch((err) => mostraMessaggi({ errori: [err.message] }));
});
$('nuovo-segreto').addEventListener('click', () => {
  const nome = (prompt('Nome del segreto (maiuscole, cifre e _, es. JELLYFIN_TOKEN)') || '').trim().toUpperCase();
  if (!nome) return;
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(nome)) { mostraMessaggi({ errori: ['Nome non valido: maiuscole, cifre e _'] }); return; }
  apriSegreto(nome);
});
$('lista-segreti').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-segreto]');
  if (b) apriSegreto(b.dataset.segreto);
});

// ---------------------------------------------------------------- nuovo file

let genereNuovo = 'tile';
for (const b of document.querySelectorAll('.aggiungi')) {
  b.addEventListener('click', () => {
    genereNuovo = b.dataset.genere;
    $('nuovo-titolo').textContent = genereNuovo === 'tile' ? 'Nuova tile' : 'Nuova sorgente';
    const tipi = genereNuovo === 'tile' ? elenco.tipiTile : elenco.connettori.filter((c) => !c.senzaSorgente);
    $('nuovo-tipo').innerHTML = tipi.map((t) => `<option value="${t.tipo}">${t.tipo} — ${proteggi(t.descrizione)}</option>`).join('');
    $('nuovo-nome').value = '';
    $('nuovo').showModal();
  });
}
$('nuovo').addEventListener('close', async () => {
  if ($('nuovo').returnValue !== 'crea') return;
  const nome = $('nuovo-nome').value.trim();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(nome)) { mostraMessaggi({ errori: ['Nome non valido: minuscole, cifre e trattini'] }); return; }
  const cartella = genereNuovo === 'tile' ? 'tile' : 'sorgenti';
  const percorso = `${cartella}/${nome}.yaml`;
  if (elenco.file.some((f) => f.percorso === percorso)) { mostraMessaggi({ errori: [`${percorso} esiste già`] }); return; }
  const { testo: modello } = await api(`/modello?genere=${genereNuovo}&tipo=${encodeURIComponent($('nuovo-tipo').value)}`);
  await apri(percorso, modello);
});

// ---------------------------------------------------------------- eventi

document.querySelector('.elenco-file').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-percorso]');
  if (b) apri(b.dataset.percorso).catch((err) => mostraMessaggi({ errori: [err.message] }));
});
testo.addEventListener('input', () => {
  segnaModificato();
  clearTimeout(attesaValidazione);
  attesaValidazione = setTimeout(() => valida().catch(() => {}), 500);
});
testo.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    testo.setRangeText('  ', testo.selectionStart, testo.selectionEnd, 'end');
    testo.dispatchEvent(new Event('input'));
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); salva().catch((err) => mostraMessaggi({ errori: [err.message] })); }
});
$('salva').addEventListener('click', () => salva().catch((err) => mostraMessaggi({ errori: [err.message] })));
$('prova').addEventListener('click', () => prova().catch((err) => mostraMessaggi({ errori: [err.message] })));
$('elimina').addEventListener('click', () => elimina().catch((err) => mostraMessaggi({ errori: [err.message] })));
$('versioni').addEventListener('change', async () => {
  const v = $('versioni').value;
  if (!v) return;
  const { testo: vecchio } = await api(`/storico?percorso=${encodeURIComponent(corrente)}&versione=${encodeURIComponent(v)}`);
  testo.value = vecchio;
  segnaModificato();
  valida();
  mostraMessaggi({ ok: 'Versione precedente caricata nell\'editor: salva per ripristinarla.' });
  $('versioni').value = '';
});
addEventListener('beforeunload', (e) => { if (corrente && (nuovoFile || testo.value !== salvato)) e.preventDefault(); });

await ricaricaElenco();
await caricaSegreti();
const daAprire = decodeURIComponent(location.hash.slice(1));
if (daAprire.startsWith('segreto:')) apriSegreto(daAprire.slice(8));
else if (daAprire && elenco.file.some((f) => f.percorso === daAprire)) await apri(daAprire);
