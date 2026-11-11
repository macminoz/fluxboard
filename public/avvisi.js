// Short messages at the bottom ("Tile saved", the result of an action), with an optional "Undo".

export function avvisa(testo, annulla) {
  const el = document.createElement('div');
  el.className = 'avviso-breve';
  el.innerHTML = `<span></span>${annulla ? '<button type="button">Annulla</button>' : ''}`;
  el.querySelector('span').textContent = testo;
  const via = () => el.remove();
  el.querySelector('button')?.addEventListener('click', async () => { via(); await annulla(); });
  document.getElementById('avvisi').append(el);
  setTimeout(via, annulla ? 8000 : 5000);
}
