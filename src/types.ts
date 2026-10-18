/**
 * Tipos del dominio: el estado de la partida (un objeto plano que se guarda en JSON), las acciones que entiende el motor
 * y los datos del juego. Solo tipos: no generan código.
 */

// --- Datos -------------------------------------------------------------------------------------

export type Resource = 'mon' | 'rice' | 'sandal' | 'wood' | 'koban';
/** Recurso o IKI (puntos): lo que puede aparecer en un coste, una ganancia o un salario. */
export type Res = Resource | 'iki';
export type Amount = { res: Res; n: number };
/** { res: n } */
export type Cost = Partial<Record<Res, number>>;
export type Resources = Record<Resource, number>;

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export type CardSeason = SeasonId | 'initial';
export type CharacterType = 'vendor' | 'artisan' | 'special' | 'builder' | 'merchant';
/** Fichas especiales: 'hire' (descuento al contratar), 'move' (+1), 'avoid-fire', 'wild' (Comodín). */
export type Special = 'hire' | 'move' | 'avoid-fire' | 'wild';

export type AbilityKind = 'gain' | 'trade' | 'fire' | 'xp' | 'build' | 'swap' | 'gainOthers';
export type Ability = { kind: AbilityKind; pay: Amount[]; gain: Amount[]; discount?: Amount; others?: Amount[] };


export type Character = {
  id: string;
  name: string;
  season: CardSeason;
  type: CharacterType;
  cost: number | null;
  fire: number;
  ability: Ability;
  salary: Amount[][];
  retireToken?: Special;
  scan: string;
};

export type Season = { id: SeasonId; name: string; back: string; cards: string[] };

export type Building = {
  id: string;
  name: string;
  cost: Cost;
  iki: number;
  score?: 'sandal' | 'rice' | 'fish' | 'fire';
  perk?: 'farm' | 'fire-tower' | 'imperial-villa';
  image: string;
};

export type MarketKind = 'fish' | 'pipe' | 'bag';
export type MarketToken = {
  id: string;
  season: SeasonId;
  kind: MarketKind;
  cost: number;
  image: string | null;
  bonus?: number;
  effect?: { fire?: number; xp?: number; gain?: Amount[] };
  score?: { iki?: number; per?: 'fire2' | 'mostType' | 'types' | 'mon4' };
};

export type Point = [number, number];
export type PlayerBoard = {
  id: string;
  name: string;
  color: string;
  side: string;
  image: string;
  kobunSlots: Point[];
  sandalSlot: Point;
  market: { fish: Point[]; pipe: Point; bag: Point };
};

/** Zona del tablero en coordenadas normalizadas; los campos opcionales dependen del grupo. */
export type Zone = {
  id: string;
  group: string;
  label: string;
  kind: 'rect' | 'circle';
  x?: number; y?: number; w?: number; h?: number;
  cx?: number; cy?: number; r?: number;
  month?: number;
  fire?: number;
  corner?: boolean;
  extraCost?: number;
  next?: string;
  shop?: string;
  stalls?: string[];
  value?: number;
  [extra: string]: unknown;
};

export type Nagaya = { id: string; lots: string[]; pattern: string; [extra: string]: unknown };

// --- Estado de la partida ----------------------------------------------------------------------

/** Semilla: 32 bits (mulberry32) o 4 × 32 bits (sfc32); `rng` es el estado del generador con la misma forma. */
export type Seed = number | number[];

export type Phase = 'initial-characters' | 'ready' | 'ikizama' | 'actions' | 'event' | 'newyear' | 'ended';
export type IkizamaSlot = '1-4' | '1' | '2' | '3' | '4';

export type Player = {
  boardId: string;
  ai: boolean;
  userName?: string;
  rolls: number[];
  resources: Resources;
  kobun: number;
  ikizama: IkizamaSlot | null;
  specials: Special[];
  fish: string[];
  pipes: string[];
  tobacco: string[];
  retired: string[];
  buildings: string[];
  fire: number;
  iki: number;
  oyakata: string;
  wildType?: CharacterType;
  /** Personajes alimentados en el Día de Pago en curso (solo mientras dura). */
  fed?: number;
};

export type Lot = { kind: 'character' | 'building'; card: string; owner: number; xp: number; initial?: boolean };
export type RowCard = { card: string; mons: number };
export type MarketRow = { fish: string[]; pipes: string[]; bags: string[] };

export type TurnStep = 'b1' | 'move' | 'business' | 'place';
export type Turn = { index: number; player: number; slot: IkizamaSlot | null; step: TurnStep; didShop: boolean; didChar: boolean };

export type Pending =
  | { type: 'food'; player: number; drop: number }
  | { type: 'avoidFire'; player: number; lot: string }
  | { type: 'wildType'; player: number };

export type GameEvent =
  | { kind: 'plain' }
  | { kind: 'payday'; stage: string; who: number }
  | { kind: 'fire'; stage: string; tile?: string; nagaya?: string; index?: number };

export type Score = { track: number; variety: number; fish: number; tobacco: number; buildings: number; resources: number; total?: number };
export type FinalScore = { scores: Score[]; ranking: number[]; winner: number };

/** Entrada del registro: `type` dice qué pasó; el resto de campos depende del tipo (ver los `log(g, …)` del motor). */
export type LogEntry = {
  seq: number;
  month: number;
  type: string;
  player?: number;
  [field: string]: unknown;
};

/** Carta boca abajo en la vista pública (game/view.js). */
export type Hidden = null;

export type Game = {
  version: number;
  seed?: Seed;
  rng: Seed | null;
  phase: Phase;
  month: number;
  players: Player[];
  starter: number;
  turnOrder: number[];
  fireStack: number[];
  fireTiles: (string | Hidden)[];
  market: MarketRow;
  marketFaceDown: Partial<Record<SeasonId, MarketRow>>;
  buildings: string[];
  buildingsBox: string[];
  decks: Record<SeasonId, (string | Hidden)[]>;
  row: RowCard[];
  initialCharacters: string[];
  pickOrder: number[];
  lots: Record<string, Lot>;
  log: LogEntry[];
  logSeq: number;
  pending: Pending | null;
  event: GameEvent | null;
  /** Orden de colocación del Ikizama (fase A) y orden de los turnos (fase B / Año Nuevo). */
  order?: number[];
  turnList?: number[];
  turn?: Turn | null;
  final?: FinalScore;
  /** Partida en línea: el asiento de quien mira. */
  viewer?: number;
};

// --- Acciones ----------------------------------------------------------------------------------

export type Action =
  | { type: 'placeInitial'; card: string; lot: string }
  | { type: 'start' }
  | { type: 'placeIkizama'; slot: IkizamaSlot }
  | { type: 'income' }
  | { type: 'hire'; card: string; lot: string }
  | { type: 'move'; base?: number; sandals?: number; bonus?: boolean }
  | { type: 'place'; zone: string }
  | { type: 'shop'; choice?: string; building?: string; lot?: string; fish?: string; pipe?: string; bag?: string; target?: string }
  | { type: 'character'; lot: string; target?: string; building?: string; buildLot?: string; lots?: string[] }
  | { type: 'endTurn' }
  | { type: 'resolve'; drop?: string[]; use?: boolean; cardType?: CharacterType };

export type ActionType = Action['type'];
