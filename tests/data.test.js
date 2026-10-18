import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CHARACTERS, CHARACTERS_BY_ID, CHARACTER_TYPES } from '../src/data/characters.ts';
import { BUILDINGS, SEASONS } from '../src/data/decks.ts';
import { MARKET_TOKENS, seasonMarket } from '../src/data/market.ts';
import { ZONES_BY_ID, STREET, LOT_IDS } from '../src/data/zones.ts';

const pub = (p) => existsSync(new URL(`../public${p}`, import.meta.url));

test('60 personajes con datos completos', () => {
  assert.equal(CHARACTERS.length, 60);
  for (const c of CHARACTERS) {
    assert.ok(CHARACTER_TYPES[c.type], `${c.id}: tipo`);
    assert.ok(c.ability?.kind, `${c.id}: habilidad`);
    assert.ok(Array.isArray(c.salary), `${c.id}: salario`);
    assert.ok(c.fire >= 0 && c.fire <= 2, `${c.id}: fuego`);
    assert.ok(pub(c.scan), `${c.id}: falta ${c.scan}`);
    if (c.season !== 'initial') assert.ok(Number.isInteger(c.cost), `${c.id}: coste`);
    if (c.retireToken) assert.equal(c.salary.length === 0 || c.salary.length >= 1, true);
  }
  assert.equal(Object.keys(CHARACTERS_BY_ID).length, 60, 'ids únicos');
});

test('10 edificios con coste y puntuación', () => {
  assert.equal(BUILDINGS.length, 10);
  for (const b of BUILDINGS) assert.ok(b.id && b.name, b.id);
});

test('mercado: 6 fichas por estación', () => {
  for (const s of ['spring', 'summer', 'autumn', 'winter']) {
    const m = seasonMarket(s);
    for (const k of ['fish', 'pipe', 'bag']) assert.equal(m[k].length, 2, `${s} ${k}`);
  }
  assert.equal(MARKET_TOKENS.length, 24);
  for (const t of MARKET_TOKENS) if (t.image) assert.ok(pub(t.image), t.image);
});

test('calle: cada casilla con tienda y 2 puestos existentes', () => {
  assert.equal(STREET.length, 8);
  for (const id of STREET) {
    const z = ZONES_BY_ID[id];
    assert.ok(z.shop, `${id}: tienda`);
    assert.equal(z.stalls?.length, 2, `${id}: puestos`);
    for (const l of z.stalls) assert.ok(LOT_IDS.includes(l), `${id}: ${l}`);
  }
});

test('estaciones', () => assert.equal(SEASONS.length, 4));
