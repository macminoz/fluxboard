// Layout of the tiles on a grid, as in Grafana and Home Assistant: each tile has an explicit
// position (column x, row y) and a size (w columns, h rows of 8 px) and stays where it is left.
// When a tile moves or changes size, those ending up under it move down as much as needed; then
// everything "falls" upwards to close the gaps (vertical gravity). No tile ever changes width by
// itself.
//
// No DOM here: a list of items goes in, a position per item comes out. So it can be tested from Node.
//
//   disponi([{ id, x, y, w, h }, …], colonne, { mosso: id }) → Map(id → { x, y, w, h })
//
// x and y can be missing (new tile, layout from before 0.4): those tiles go to the first free
// place from the top, in the given order. If no item has a position, the whole grid is filled
// this way: it is how tiles were arranged before (bricks, in order).

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

  // 1. The moved tile takes its place. Whoever it hits moves below it, in a chain; but if the centre
  //    of the moved tile has passed the centre of the one hit (it is being dragged past it, downwards),
  //    that one moves above: so two tiles swap places.
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

  // 2. Gravity: top to bottom (on the same row the moved one first, then from the left), each tile
  //    rises until it finds room; if it overlaps one already placed it moves below it.
  conPosto.sort((a, b) => (a.y - b.y) || ((b === m) - (a === m)) || (a.x - b.x));
  for (const v of conPosto) {
    while (v.y > 0 && !posate.some((p) => sovrapposte({ ...v, y: v.y - 1 }, p))) v.y--;
    for (let urto = posate.find((p) => sovrapposte(v, p)); urto; urto = posate.find((p) => sovrapposte(v, p))) v.y = urto.y + urto.h;
    posate.push(v);
  }

  // 3. Tiles without a position: in the first free place, in the order they arrive.
  for (const v of tutte.filter((x) => !x.fissa)) {
    Object.assign(v, primoPostoLibero(v, posate, colonne));
    posate.push(v);
  }
  return new Map(tutte.map((v) => [v.id, { x: v.x, y: v.y, w: v.w, h: v.h }]));
}
