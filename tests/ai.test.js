import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/setup.js';
import { act, legalActions } from '../src/game/engine.js';
import { chooseAction, deciderOf, isAiTurn } from '../src/ai/player.js';
import { evaluate } from '../src/ai/evaluate.js';
import { BOARDS } from './helpers.js';

const aiGame = (n, seed, ai = () => true) =>
  createGame({ players: BOARDS.slice(0, n).map((boardId, i) => ({ boardId, ai: ai(i) })), seed });

/** Juega la partida entera con la IA (esfuerzo bajo, para que sea rápido) y devuelve el estado final. */
function playOut(g, limit = 2000) {
  for (let steps = 0; g.phase !== 'ended'; steps++) {
    assert.ok(steps < limit, `la partida no termina (fase ${g.phase}, mes ${g.month})`);
    const action = chooseAction(g, { effort: 'fast' });
    assert.ok(action, `la IA no tiene jugada en la fase ${g.phase}`);
    g = act(g, action); // lanza si la jugada no es válida
  }
  return g;
}

test('createGame marca qué jugadores son de IA', () => {
  const g = aiGame(3, 1, (i) => i === 1);
  assert.deepEqual(g.players.map((p) => p.ai), [false, true, false]);
});

test('isAiTurn solo es cierto cuando le toca a un jugador de IA', () => {
  const g = aiGame(3, 1, (i) => i === 0);
  const picker = deciderOf(g);
  assert.equal(isAiTurn(g), picker === 0);
  assert.equal(isAiTurn(aiGame(3, 1, () => false)), false);
});

test('la IA elige siempre una jugada legal', () => {
  let g = aiGame(3, 2);
  for (let i = 0; i < 60 && g.phase !== 'ended'; i++) {
    const action = chooseAction(g, { effort: 'fast' });
    if (g.phase !== 'initial-characters') {
      assert.ok(legalActions(g).some((a) => JSON.stringify(a) === JSON.stringify(action)), `jugada ilegal: ${JSON.stringify(action)}`);
    }
    g = act(g, action);
  }
});

test('tres IA juegan una partida completa hasta la puntuación final', () => {
  const g = playOut(aiGame(3, 1));
  assert.equal(g.phase, 'ended');
  assert.equal(g.final.scores.length, 3);
  assert.ok(g.final.scores.every((s) => s.total > 0));
});

test('cuatro IA juegan una partida completa', () => {
  const g = playOut(aiGame(4, 3));
  assert.equal(g.phase, 'ended');
  assert.equal(g.final.scores.length, 4);
});

test('una IA mezclada con jugadores que no lo son: solo decide cuando le toca', () => {
  const g = aiGame(3, 5, (i) => i === 2);
  assert.equal(chooseAction(g, { effort: 'fast' }) != null, true); // siempre hay una jugada que proponer a quien le toque
  assert.equal(chooseAction({ ...g, phase: 'ended' }), null);
});

test('evaluate valora más al jugador con más IKI', () => {
  const g = aiGame(3, 1);
  const richer = structuredClone(g);
  richer.players[0].iki += 10;
  assert.ok(evaluate(richer, 0) > evaluate(g, 0));
});
