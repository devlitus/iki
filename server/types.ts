import type { Action, Game } from '../src/types.ts';

/** Tipos del servidor: la base de datos y las filas que se leen de ella. Solo tipos: no generan código. */

/** Postgres (Neon o PGlite): `query(sql, params) → filas`. */
export type Db = {
  query: (text: string, params?: unknown[]) => Promise<any[]>;
  close?: () => unknown;
};

/** Usuario con sesión (lo que lee `currentUser`). */
export type User = { id: number; name: string; rating: number; games: number; wins: number };

/** Asiento de una sala: libre, una persona (`user`) o una IA. */
export type Seat = { free?: boolean; user?: number; name?: string; ai?: boolean };

/** Fila de la tabla `games`. */
export type GameRow = {
  id: string;
  status: 'lobby' | 'playing' | 'ended' | 'cancelled';
  host: number;
  size: number;
  seats: Seat[];
  ranked: boolean;
  state: Game | null;
  version: number;
  settled: boolean;
};

/** Jugada guardada en `game_actions`. */
export type SeatAction = { seat: number | null; action: Action };
