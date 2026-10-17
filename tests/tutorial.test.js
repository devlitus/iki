import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, legalActions } from '../src/game/engine.js';
import { chooseAction, isAiTurn } from '../src/ai/player.js';
import { createTutorialGame, HUMAN_LOTS } from '../src/tutorial/game.js';
import { STEPS, currentStep, humanOf, progress, stepAllows, stepZones } from '../src/tutorial/script.js';

/** Jugadas del humano: el motor no las lista en la preparación, así que ahí se generan las colocaciones posibles. */
const humanOptions = (g) => (g.phase === 'initial-characters'
  ? g.initialCharacters.flatMap((card) => HUMAN_LOTS.map((lot) => ({ type: 'placeInitial', card, lot })))
  : legalActions(g));

/**
 * Recorre el tutorial como lo haría una persona que sigue las indicaciones: lee los pasos informativos, hace la primera
 * jugada que el paso acepta y deja jugar a la IA. Devuelve los pasos vistos y la partida al llegar al último.
 */
function playThrough(choose = (options) => options[0]) {
  let g = createTutorialGame();
  const acked = new Set();
  const seen = [];
  for (let i = 0; i < 400; i++) {
    const step = currentStep(g, acked);
    assert.ok(step, 'el tutorial se queda sin pasos');
    if (seen.at(-1) !== step.id) seen.push(step.id);
    if (step.last) return { g, seen };
    assert.doesNotThrow(() => step.text(g), `el texto de «${step.id}» falla`);
    if (step.kind === 'info') acked.add(step.id);
    else if (isAiTurn(g)) g = act(g, chooseAction(g, { effort: 'fast' }));
    else {
      const options = humanOptions(g).filter((a) => stepAllows(step, g, a));
      assert.ok(options.length, `en «${step.id}» el humano no tiene ninguna jugada permitida`);
      const preferred = options.find((a) => a.type === 'endTurn');
      g = act(g, step.id === 'business' ? preferred : choose(options));
    }
  }
  assert.fail('el tutorial no termina');
}

test('la partida del tutorial empieza con un humano que elige el último y dos IA ya colocadas', () => {
  const g = createTutorialGame();
  assert.equal(g.phase, 'initial-characters');
  assert.equal(g.players.filter((p) => !p.ai).length, 1);
  assert.equal(humanOf(g), g.starter);
  assert.equal(g.initialCharacters.length, 2);
  assert.deepEqual(Object.keys(g.lots).length, 2);
  assert.ok(HUMAN_LOTS.every((lot) => !g.lots[lot]));
});

test('seguir las indicaciones lleva del principio al final del mes 1', () => {
  const { g, seen } = playThrough();
  assert.equal(g.month, 2);
  assert.deepEqual(seen, STEPS.map((s) => s.id));
});

test('el mes se puede completar contratando en lugar de cobrar ingresos', () => {
  const { g, seen } = playThrough((options) => options.find((a) => a.type === 'hire') ?? options[0]);
  assert.equal(g.month, 2);
  assert.ok(seen.includes('business'));
});

test('cualquier espacio de Ikizama y cualquier personaje inicial permiten acabar el mes', () => {
  for (const slot of ['1', '2', '3', '4']) {
    for (const card of createTutorialGame().initialCharacters) {
      let g = createTutorialGame();
      const acked = new Set();
      for (let i = 0; i < 400 && currentStep(g, acked)?.last !== true; i++) {
        const step = currentStep(g, acked);
        if (step.kind === 'info') acked.add(step.id);
        else if (isAiTurn(g)) g = act(g, chooseAction(g, { effort: 'fast' }));
        else {
          const options = humanOptions(g).filter((a) => stepAllows(step, g, a));
          const wanted = options.find((a) => a.slot === slot || a.card === card) ?? options.find((a) => a.type === 'endTurn') ?? options[0];
          assert.ok(wanted, `sin jugada en «${step.id}»`);
          g = act(g, wanted);
        }
      }
      assert.equal(g.month, 2, `Ikizama ${slot} con ${card} no termina el mes`);
    }
  }
});

test('el espacio «1-4» y las jugadas de otro paso se rechazan', () => {
  const { g } = playThrough();
  const fresh = createTutorialGame();
  const initial = currentStep(fresh, new Set(['welcome', 'street', 'lots', 'you']));
  assert.equal(initial.id, 'initial');
  assert.equal(stepAllows(initial, fresh, { type: 'income' }), false);

  const ikizama = STEPS.find((s) => s.id === 'ikizama');
  assert.equal(ikizama.allow(g, { type: 'placeIkizama', slot: '1-4' }), false);
  assert.equal(ikizama.allow(g, { type: 'placeIkizama', slot: '2' }), true);
});

test('los pasos de información no aceptan jugadas ni zonas pulsables', () => {
  const g = createTutorialGame();
  const welcome = currentStep(g, new Set());
  assert.equal(welcome.kind, 'info');
  assert.equal(stepAllows(welcome, g, { type: 'placeInitial', card: 'cotton-seller', lot: HUMAN_LOTS[0] }), false);
  assert.deepEqual(stepZones(welcome, g), []);
});

test('el progreso del humano avanza con su turno', () => {
  const { g } = playThrough();
  assert.equal(progress(g), 'after');
  assert.equal(progress(createTutorialGame()), 'before');
});
