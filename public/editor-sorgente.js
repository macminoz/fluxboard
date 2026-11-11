// Gestione delle sorgenti dalla dashboard, come le "data source" di Grafana: si sceglie prima
// il tipo (API HTTP, InfluxDB, VictoriaLogs…), poi si compila il modulo di quel tipo e si prova
// la connessione prima di salvare. I segreti scritti qui finiscono fra i segreti (sola scrittura).

import { proteggi } from './formato.js';
import { disegnaModulo, aggiornaVisibilita, leggiModulo, gestisciClickModulo, mancanti } from './moduli.js';

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

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

// Apre la gestione delle sorgenti. Con { nuova: true } parte dalla scelta del tipo.
// Restituisce il nome dell'ultima sorgente salvata (o null).
export async function gestisciSorgenti({ nuova = false, nome = null } = {}) {
  const dlg = document.getElementById('dlg-sorgente');
  const form = dlg.querySelector('form');
  const pannello = dlg.querySelector('.pannello-sorgente');
  const elenco = dlg.querySelector('.elenco-sorgenti');
  const esito = dlg.querySelector('.esito');
  const pulsante = (n) => dlg.querySelector(`[data-${n}]`);
  const salva = form.querySelector('[type="submit"]');
  let meta = await api('/');
  let aperta = null;          // { nome, nuovo, tipo, oggetto }
  let salvata = null;

  const connettore = (tipo) => meta.connettori.find((c) => c.tipo === tipo);

  function disegnaElenco() {
    elenco.innerHTML = `<button type="button" class="nuova-sorgente${aperta?.nuovo ? ' scelta' : ''}" data-nuova>+ Nuova sorgente</button>
      ${meta.sorgenti.map((s) => `<button type="button" data-sorgente="${proteggi(s.nome)}"${aperta?.nome === s.nome && !aperta.nuovo ? ' class="scelta"' : ''}>
        <b>${proteggi(s.nome)}</b><span>${proteggi([connettore(s.tipo)?.gruppo, connettore(s.tipo)?.nome || s.tipo].filter(Boolean).join(' · '))}</span></button>`).join('')}`;
  }

  function mostraPulsanti({ modulo, esistente }) {
    salva.hidden = !modulo;
    pulsante('prova').hidden = !modulo;
    pulsante('elimina').hidden = !esistente;
  }

  function galleria() {
    aperta = { nuovo: true };
    esito.innerHTML = '';
    // Per categoria (cosa si legge), e dentro la categoria il prodotto che lo fornisce:
    // "Syslog e log" → VictoriaLogs, "Firewall e rete" → Palo Alto…
    const ORDINE = ['Syslog e log', 'Metriche e sensori', 'Monitoraggio', 'Automazioni', 'Firewall e rete', 'Virtualizzazione', 'Software e aggiornamenti', 'Web e API'];
    const gruppi = {};
    const posto = (g) => (ORDINE.indexOf(g) + 1 || 99);
    for (const c of meta.connettori.filter((x) => !x.senzaSorgente).sort((a, b) => posto(a.gruppo) - posto(b.gruppo))) (gruppi[c.gruppo || 'Altro'] ||= []).push(c);
    pannello.innerHTML = `<h3>Che tipo di sorgente?</h3>
      <p class="aiuto">Una sorgente dice <b>come collegarsi</b> (indirizzo, credenziali); ogni tile poi dice <b>cosa chiedere</b>. Dieci tile possono usare la stessa sorgente.</p>
      ${Object.entries(gruppi).map(([g, cs]) => `<h4 class="gruppo-tipi">${proteggi(g)}</h4><div class="galleria galleria-sorgenti">${cs.map((c) =>
        `<button type="button" class="tipo-tile" data-tipo-sorgente="${proteggi(c.tipo)}"><b>${proteggi(c.nome)}</b><span>${proteggi(c.descrizione)}</span></button>`).join('')}</div>`).join('')}
      <p class="aiuto">Manca un tipo? Si aggiunge con un plugin JavaScript in <code>plugin/</code>; per qualunque servizio che risponde in JSON basta <b>API HTTP</b>.</p>`;
    mostraPulsanti({ modulo: false, esistente: false });
    disegnaElenco();
  }

  function modulo({ nome: n = '', nuovo: nuovoFile, tipo, oggetto = {}, usataDa = [] }) {
    aperta = { nome: n, nuovo: nuovoFile, tipo, oggetto };
    const c = connettore(tipo);
    esito.innerHTML = '';
    pannello.innerHTML = `<h3>${proteggi(c?.nome || tipo)}</h3><p class="aiuto">${proteggi(c?.descrizione || '')}</p>
      <div class="campo-modulo"><label>Nome della sorgente <span class="obbligatorio">*</span></label>
        <div class="nome-e-rinomina"><input name="nome-sorgente" class="mono" value="${proteggi(n)}" ${nuovoFile ? '' : 'readonly'} placeholder="es. dns-technitium" autocomplete="off">
        ${nuovoFile ? '' : '<button type="button" data-rinomina>Rinomina…</button>'}</div>
        <p class="aiuto">${nuovoFile ? 'Minuscole, cifre e trattini: è il nome che le tile useranno.' : usataDa.length ? `Usata da ${usataDa.length} tile: ${usataDa.map((t) => `<code>${proteggi(t)}</code>`).join(', ')}.` : 'Nessuna tile la usa ancora.'}</p></div>
      <div class="campi-modulo">${disegnaModulo(c?.moduloSorgente || [], oggetto, { segreti: meta.segreti })}</div>`;
    aggiornaVisibilita(pannello);
    mostraPulsanti({ modulo: true, esistente: !nuovoFile });
    disegnaElenco();
    pannello.querySelector(nuovoFile ? '[name="nome-sorgente"]' : '[data-modulo]')?.focus();
  }

  async function apri(n) {
    const r = await api(`/sorgente?nome=${encodeURIComponent(n)}`);
    modulo({ nome: n, nuovo: false, tipo: r.oggetto.tipo, oggetto: r.oggetto, usataDa: r.usataDa });
  }

  function raccogli() {
    const { valori, segreti, mappe } = leggiModulo(pannello.querySelector('.campi-modulo'));
    return { valori: { ...valori, tipo: aperta.tipo }, segreti, mappe };
  }

  async function provaConnessione() {
    const { valori, segreti } = raccogli();
    // Per la prova i campi vuoti si tolgono e i segreti non toccati valgono quelli salvati.
    const pulito = JSON.parse(JSON.stringify(valori, (_k, v) => (v === null ? undefined : v)));
    const oggetto = aperta.nuovo ? pulito : { ...structuredClone(aperta.oggetto), ...pulito };
    esito.innerHTML = '<p class="aiuto">Prova in corso…</p>';
    const r = await api('/sorgente/prova', { method: 'POST', body: { nome: aperta.nuovo ? null : aperta.nome, oggetto, segreti } });
    esito.innerHTML = r.ok ? `<p class="ok">✓ ${proteggi(r.messaggio)} <span class="aiuto">(${r.ms} ms)</span></p>` : `<p class="errore">✕ ${proteggi(r.messaggio)}</p>`;
  }

  async function salvaSorgente() {
    const nomeNuovo = aperta.nuovo ? slug(pannello.querySelector('[name="nome-sorgente"]').value) : aperta.nome;
    if (!nomeNuovo) { esito.innerHTML = '<p class="errore">✕ Scrivi un nome per la sorgente</p>'; return; }
    if (aperta.nuovo && meta.sorgenti.some((s) => s.nome === nomeNuovo)) { esito.innerHTML = `<p class="errore">✕ Esiste già una sorgente "${proteggi(nomeNuovo)}"</p>`; return; }
    const vuoti = mancanti(connettore(aperta.tipo)?.moduloSorgente || [], pannello);
    if (vuoti.length) { esito.innerHTML = `<p class="errore">✕ Manca: ${vuoti.map(proteggi).join(', ')}</p>`; return; }
    const { valori, segreti, mappe } = raccogli();
    const r = await api('/sorgente', { method: 'PUT', body: { nome: nomeNuovo, nuovo: aperta.nuovo, campi: valori, segreti, sostituisci: mappe } });
    if (!r.ok) { esito.innerHTML = r.errori.map((x) => `<p class="errore">✕ ${proteggi(x)}</p>`).join(''); return; }
    salvata = nomeNuovo;
    meta = await api('/');
    await apri(nomeNuovo);
    esito.innerHTML = `<p class="ok">✓ Salvata${r.avvisi?.length ? ` · ${r.avvisi.map(proteggi).join(' · ')}` : ''}</p>`;
  }

  async function rinomina() {
    const nuovo = slug(prompt(`Nuovo nome per "${aperta.nome}" (minuscole, cifre e trattini). Le tile che la usano vengono aggiornate.`, aperta.nome) || '');
    if (!nuovo || nuovo === aperta.nome) return;
    const r = await api('/sorgente/rinomina', { method: 'POST', body: { da: aperta.nome, a: nuovo } });
    if (r.ok === false) { esito.innerHTML = (r.errori || []).map((x) => `<p class="errore">✕ ${proteggi(x)}</p>`).join(''); return; }
    salvata = nuovo;
    meta = await api('/');
    await apri(nuovo);
    esito.innerHTML = `<p class="ok">✓ Rinominata in "${proteggi(nuovo)}"${r.tile.length ? `: aggiornate ${r.tile.length} tile` : ''}</p>`;
  }

  async function elimina() {
    const { usataDa } = await api(`/sorgente?nome=${encodeURIComponent(aperta.nome)}`);
    const avviso = usataDa.length ? `\n\nAttenzione: la usano ${usataDa.length} tile (${usataDa.join(', ')}), che smetteranno di funzionare.` : '';
    if (!confirm(`Spostare la sorgente "${aperta.nome}" nel cestino?${avviso}`)) return;
    await api(`/file?percorso=${encodeURIComponent(`sorgenti/${aperta.nome}.yaml`)}`, { method: 'DELETE' });
    meta = await api('/');
    galleria();
    esito.innerHTML = '<p class="ok">✓ Spostata nel cestino (recuperabile da Impostazioni avanzate)</p>';
  }

  const segnala = (e) => { esito.innerHTML = `<p class="errore">✕ ${proteggi(e.message)}</p>`; };
  dlg.onclick = (e) => {
    if (gestisciClickModulo(e)) return;
    const t = e.target.closest('[data-tipo-sorgente]');
    if (t) modulo({ nuovo: true, tipo: t.dataset.tipoSorgente });
    if (e.target.closest('[data-nuova]')) galleria();
    if (e.target.closest('[data-rinomina]')) rinomina().catch(segnala);
    const s = e.target.closest('[data-sorgente]');
    if (s) apri(s.dataset.sorgente).catch(segnala);
  };
  pannello.onchange = () => aggiornaVisibilita(pannello);
  pulsante('prova').onclick = () => provaConnessione().catch(segnala);
  pulsante('elimina').onclick = () => elimina().catch(segnala);
  form.onsubmit = (e) => { e.preventDefault(); salvaSorgente().catch(segnala); };

  if (nome) await apri(nome);
  else if (nuova || !meta.sorgenti.length) galleria();
  else await apri(meta.sorgenti[0].nome);

  return new Promise((risolvi) => {
    const chiudi = () => { dlg.close(); risolvi(salvata); };
    dlg.querySelector('[data-chiudi]').onclick = chiudi;
    pulsante('annulla').onclick = chiudi;
    dlg.oncancel = (e) => { e.preventDefault(); chiudi(); };
    dlg.showModal();
  });
}
