// Finestra degli snapshot: crearne uno prima di una prova, ripristinarlo, scaricarlo, eliminarlo;
// esportare e importare tutta la configurazione su file.

import { proteggi, relativo } from './formato.js';

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

const quando = (iso) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function gestisciSnapshot({ ricarica }) {
  const dlg = document.getElementById('dlg-snapshot');
  const elenco = dlg.querySelector('.elenco-snapshot');
  const esito = dlg.querySelector('.esito');
  const nome = dlg.querySelector('[name="nome-snapshot"]');
  const segnala = (testo, errore = false) => { esito.innerHTML = `<p class="${errore ? 'errore' : 'ok'}">${errore ? '✕' : '✓'} ${proteggi(testo)}</p>`; };
  let cambiato = false;

  async function disegna() {
    const { snapshot } = await api('/snapshot');
    const conNome = snapshot.filter((x) => !x.automatico).length;
    dlg.querySelector('.conta-snapshot').textContent = `${conNome} di 5 con nome`;
    nome.placeholder = conNome >= 5 ? 'Già 5: riusa un nome per sostituirlo, o eliminane uno' : 'Nome, es. prima di provare il nuovo meteo';
    snapshot.sort((a, b) => (a.automatico - b.automatico) || String(b.creato).localeCompare(String(a.creato)));
    elenco.innerHTML = snapshot.length ? snapshot.map((s) => `<li${s.automatico ? ' class="automatico"' : ''}>
        <span class="info-snapshot"><b>${proteggi(s.nome || 'senza nome')}</b>
          <span>${quando(s.creato)} · ${relativo(s.creato)} · ${s.file} file${s.automatico ? ' · automatico' : ''}</span></span>
        <span class="azioni-snapshot">
          <button type="button" data-ripristina="${proteggi(s.id)}">Ripristina</button>
          <a class="pulsante" href="/api/config/esporta?id=${encodeURIComponent(s.id)}" download title="Scarica">⬇</a>
          <button type="button" data-elimina="${proteggi(s.id)}" title="Elimina" aria-label="Elimina">✕</button>
        </span></li>`).join('') : '<li class="vuoto">Nessuno snapshot ancora.</li>';
  }

  const esitoApplicazione = (r) => {
    cambiato = true;
    segnala(`Fatto: ${r.file} file ripristinati${r.segretiMancanti?.length ? ` · mancano i segreti ${r.segretiMancanti.join(', ')}` : ''}. Lo stato di prima è nello snapshot automatico.`);
  };

  dlg.onclick = async (e) => {
    try {
      if (e.target.closest('[data-crea]')) {
        if (!nome.value.trim()) { segnala('Dai un nome allo snapshot (es. "disposizione estate")', true); nome.focus(); return; }
        const r = await api('/snapshot', { method: 'POST', body: { nome: nome.value.trim() } });
        nome.value = '';
        segnala(`Snapshot "${r.nome}" creato (${r.file} file)`);
        await disegna();
      }
      const rip = e.target.closest('[data-ripristina]');
      if (rip && confirm('Riportare la configurazione com\'era in questo snapshot? Lo stato attuale viene salvato prima in uno snapshot automatico.')) {
        esitoApplicazione(await api('/snapshot/ripristina', { method: 'POST', body: { id: rip.dataset.ripristina } }));
        await disegna();
      }
      const el = e.target.closest('[data-elimina]');
      if (el && confirm('Eliminare questo snapshot? Non si può annullare.')) { await api(`/snapshot?id=${encodeURIComponent(el.dataset.elimina)}`, { method: 'DELETE' }); await disegna(); }
    } catch (err) { segnala(err.message, true); }
  };
  dlg.querySelector('[data-importa]').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const pacchetto = JSON.parse(await file.text());
      if (!confirm(`Importare "${file.name}" (${Object.keys(pacchetto.file || {}).length} file)? Sostituisce tutta la configurazione attuale, che viene prima salvata in uno snapshot automatico.`)) return;
      esitoApplicazione(await api('/importa', { method: 'POST', body: pacchetto }));
      await disegna();
    } catch (err) { segnala(err instanceof SyntaxError ? 'il file non è un JSON valido' : err.message, true); }
  };
  nome.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); dlg.querySelector('[data-crea]').click(); } };

  esito.innerHTML = '';
  await disegna();
  return new Promise((risolvi) => {
    const chiudi = () => { dlg.close(); if (cambiato) ricarica(); risolvi(); };
    dlg.querySelector('[data-chiudi]').onclick = chiudi;
    dlg.querySelector('[data-annulla]').onclick = chiudi;
    dlg.oncancel = (e) => { e.preventDefault(); chiudi(); };
    dlg.showModal();
  });
}
