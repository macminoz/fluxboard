// node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disponi } from '../public/disposizione.js';

const pos = (m) => Object.fromEntries([...m].map(([k, v]) => [k, `${v.x},${v.y},${v.w}x${v.h}`]));

test('senza posizioni: a mattoni, nell\'ordine', () => {
  const r = disponi([{ id: 'a', w: 6, h: 10 }, { id: 'b', w: 6, h: 4 }, { id: 'c', w: 6, h: 4 }], 12);
  assert.deepEqual(pos(r), { a: '0,0,6x10', b: '6,0,6x4', c: '6,4,6x4' });
});

test('una tile resta della larghezza scelta, anche con spazio libero accanto', () => {
  const r = disponi([{ id: 'a', x: 0, y: 0, w: 4, h: 5 }], 12);
  assert.deepEqual(pos(r), { a: '0,0,4x5' });
});

test('gravità: un vuoto sopra si chiude', () => {
  const r = disponi([{ id: 'a', x: 0, y: 0, w: 6, h: 5 }, { id: 'b', x: 0, y: 30, w: 6, h: 5 }], 12);
  assert.deepEqual(pos(r), { a: '0,0,6x5', b: '0,5,6x5' });
});

test('allargare una tile spinge giù la vicina, che non cambia misura', () => {
  const r = disponi([{ id: 'a', x: 0, y: 0, w: 8, h: 5 }, { id: 'b', x: 6, y: 0, w: 6, h: 5 }], 12, { mosso: 'a' });
  assert.deepEqual(pos(r), { a: '0,0,8x5', b: '6,5,6x5' });
});

test('spostare una tile sopra un\'altra: l\'altra scende sotto', () => {
  const r = disponi([{ id: 'a', x: 0, y: 0, w: 6, h: 5 }, { id: 'b', x: 0, y: 0, w: 6, h: 3 }], 12, { mosso: 'b' });
  assert.deepEqual(pos(r), { a: '0,3,6x5', b: '0,0,6x3' });
});

test('spostare una tile in basso sotto un\'altra resta sotto', () => {
  const r = disponi([{ id: 'a', x: 0, y: 6, w: 6, h: 5 }, { id: 'b', x: 0, y: 0, w: 6, h: 5 }], 12, { mosso: 'a' });
  assert.deepEqual(pos(r), { a: '0,5,6x5', b: '0,0,6x5' });
});

test('una tile più larga della griglia si ferma al bordo', () => {
  const r = disponi([{ id: 'a', x: 8, y: 0, w: 6, h: 2 }], 12);
  assert.deepEqual(pos(r), { a: '6,0,6x2' });
});

test('tile nuova: nel primo posto libero', () => {
  const r = disponi([{ id: 'a', x: 0, y: 0, w: 6, h: 5 }, { id: 'n', w: 6, h: 2 }], 12);
  assert.deepEqual(pos(r), { a: '0,0,6x5', n: '6,0,6x2' });
});

test('niente sovrapposizioni dopo una catena di spinte', () => {
  const voci = [{ id: 'a', x: 0, y: 0, w: 12, h: 4 }, { id: 'b', x: 0, y: 4, w: 4, h: 4 }, { id: 'c', x: 4, y: 4, w: 8, h: 6 }, { id: 'd', x: 0, y: 8, w: 4, h: 4 }];
  const r = [...disponi([...voci, { id: 'm', x: 2, y: 3, w: 6, h: 3 }], 12, { mosso: 'm' }).values()];
  for (const a of r) for (const b of r) if (a !== b) assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), 'sovrapposte');
});

test('trascinare una tile oltre quella sotto: si scambiano', () => {
  const r = disponi([{ id: 'a', x: 0, y: 6, w: 6, h: 5 }, { id: 'b', x: 0, y: 5, w: 6, h: 5 }], 12, { mosso: 'a' });
  assert.deepEqual(pos(r), { a: '0,5,6x5', b: '0,0,6x5' });
});

test('un piccolo trascinamento verso il basso non scambia', () => {
  const r = disponi([{ id: 'a', x: 0, y: 1, w: 6, h: 5 }, { id: 'b', x: 0, y: 5, w: 6, h: 5 }], 12, { mosso: 'a' });
  assert.deepEqual(pos(r), { a: '0,0,6x5', b: '0,5,6x5' });
});
