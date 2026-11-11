// Disposizione delle tile in una griglia, come in Grafana e Home Assistant: ogni tile ha una
// posizione esplicita (colonna x, riga y) e una misura (w colonne, h righe da 8 px) e resta dove
// la si lascia. Quando una tile si sposta o cambia misura, quelle che le finiscono sotto scendono
// di quanto serve; poi tutto "cade" verso l'alto a chiudere i vuoti (gravità verticale). Nessuna
// tile cambia mai larghezza da sola.
//
// Nessun DOM qui: entra un elenco di voci, esce una posizione per voce. Così si prova da Node.
//
//   disponi([{ id, x, y, w, h }, …], colonne, { mosso: id }) → Map(id → { x, y, w, h })
//
// x e y possono mancare (tile nuova, disposizione di prima della 0.4): quelle tile vanno nel primo
// posto libero dall'alto, nell'ordine dato. Se nessuna voce ha una posizione, la griglia si
// riempie così per intero: è come si disponevano le tile prima (a mattoni, nell'ordine).

const sovrapposte = (a, b) => a !== b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const haPosizione = (v) => Number.isInteger(v.x) && Number.isInteger(v.y);

function primoPostoLibero(v, posate, colonne) {
  for (let y = 0; ; y++) {
    for (let x = 0; x + v.w <= colonne; x++) {
      const prova = { ...v, x, y };
      if (!posate.some((p) => sovrapposte(prova, p))) return { x, y };
    }
  }
}

export function disponi(voci, colonne, { mosso = null } = {}) {
  const tutte = voci.map((v) => {
    const w = Math.max(1, Math.min(colonne, v.w || 1));
    const h = Math.max(1, v.h || 1);
    return haPosizione(v)
      ? { id: v.id, w, h, x: Math.max(0, Math.min(colonne - w, v.x)), y: Math.max(0, v.y), fissa: true }
      : { id: v.id, w, h, fissa: false };
  });
  const conPosto = tutte.filter((v) => v.fissa);
  const posate = [];

  // 1. La tile mossa prende il suo posto. Chi urta scende sotto di lei, a catena; ma se il centro
  //    della tile mossa ha superato il centro di quella urtata (la si sta trascinando oltre, verso
  //    il basso), quella sale sopra: così due tile si scambiano di posto.
  const m = conPosto.find((v) => v.id === mosso);
  if (m) {
    const centro = (v) => v.y + v.h / 2;
    for (const v of conPosto) if (v !== m && sovrapposte(m, v) && centro(m) > centro(v)) v.y = Math.max(0, m.y - v.h);
    const spingi = (sopra, giro = 0) => {
      if (giro > 200) return;
      for (const v of conPosto) {
        if (v === m || v === sopra || !sovrapposte(sopra, v)) continue;
        v.y = sopra.y + sopra.h;
        spingi(v, giro + 1);
      }
    };
    spingi(m);
  }

  // 2. Gravità: dall'alto in basso (a pari riga prima la mossa, poi da sinistra), ogni tile sale
  //    finché trova spazio; se si sovrappone a una già posata scende sotto di lei.
  conPosto.sort((a, b) => (a.y - b.y) || ((b === m) - (a === m)) || (a.x - b.x));
  for (const v of conPosto) {
    while (v.y > 0 && !posate.some((p) => sovrapposte({ ...v, y: v.y - 1 }, p))) v.y--;
    for (let urto = posate.find((p) => sovrapposte(v, p)); urto; urto = posate.find((p) => sovrapposte(v, p))) v.y = urto.y + urto.h;
    posate.push(v);
  }

  // 3. Le tile senza posizione: nel primo posto libero, nell'ordine in cui arrivano.
  for (const v of tutte.filter((x) => !x.fissa)) {
    Object.assign(v, primoPostoLibero(v, posate, colonne));
    posate.push(v);
  }
  return new Map(tutte.map((v) => [v.id, { x: v.x, y: v.y, w: v.w, h: v.h }]));
}
