import './dom.js';

/**
 * Todo lo que usa la grabación de referencia, en un solo sitio: al migrar a TypeScript solo cambian estas rutas, y la
 * grabación y la comprobación siguen siendo exactamente el mismo código.
 */
export { createGame, MIN_PLAYERS, MAX_PLAYERS, OUTER_LOTS } from '../../src/game/setup.js';
export { act, tryAct, candidates, legalActions, whoseTurn } from '../../src/game/engine.js';
export { publicView } from '../../src/game/view.js';
export { scoreGame } from '../../src/game/scoring.js';
export { playerStats } from '../../src/game/playerStats.js';
export { createRng } from '../../src/game/random.js';
export { chooseAction, deciderOf, isAiTurn } from '../../src/ai/player.js';
export { evaluate, evaluateAgainstOthers } from '../../src/ai/evaluate.js';
export { createTutorialGame, HUMAN_LOTS } from '../../src/tutorial/game.js';
export { STEPS, TIPS, currentStep, progress, stepAllows, stepZones, humanOf } from '../../src/tutorial/script.js';
export { renderTurnPanel, boardTargets, hireableCards, isLegal } from '../../src/view/turnPanel.js';
export { renderDecks, renderSupply, renderPlayers, renderSpecialsInfo } from '../../src/view/table.js';
export { renderBoardPieces } from '../../src/view/boardPieces.js';
export { createPlayerModal } from '../../src/view/playerModal.js';
export { createEventSummary, createFinalTable } from '../../src/view/dialogs.js';
export { logLine, abilityText, cardSummary } from '../../src/view/format.js';
export { CHARACTERS } from '../../src/data/characters.ts';
import * as characters from '../../src/data/characters.ts';
import * as decks from '../../src/data/decks.ts';
import * as market from '../../src/data/market.ts';
import * as playerBoards from '../../src/data/playerBoards.ts';
import * as zones from '../../src/data/zones.ts';
export const data = { characters, decks, market, playerBoards, zones };
export { localDb } from '../../server/db-local.js';
export { createApp } from '../../server/app.js';
export { cleanAction } from '../../server/games.js';
export { eloDeltas } from '../../server/rating.js';
