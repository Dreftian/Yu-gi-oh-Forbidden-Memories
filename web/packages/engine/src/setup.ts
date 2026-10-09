/**
 * Creacion de partidas: baraja de mazos, reparto de cartas iniciales y eleccion
 * de puntos de vida.
 *
 * El retail baraja con 160 intercambios de rango completo por mazo (no un
 * Fisher-Yates decreciente) y tira primero el del jugador, luego el del rival
 * (`src/game/duel_shuffle_deck.c`, `notes/rng.md`). Se conserva porque el
 * orden de las cartas determina la partida.
 */

import {
  DECK_SIZE,
  DECK_SHUFFLE_SWAP_COUNT,
  DECK_CARD_COPY_LIMIT,
  EXODIA_PIECE_COPY_LIMIT,
  EXODIA_PIECE_IDS,
  HAND_SIZE,
  LIFE_POINT_STEP,
  STARTING_LIFE_POINTS,
} from './constants.js';
import { Rng } from './rng.js';
import { applyAction, startDuel } from './engine.js';
import { starterDeckCardIds } from './catalog.js';
import { cardName, card } from './catalog.js';
import { createDuel } from './state.js';
import type { DuelState, PlayerAction } from './types.js';

/** Como se ha elegido el mazo de cada lado. */
export interface DeckConfig {
  /** Una lista de 40 ids, o `null` para que el motor genere el mazo inicial. */
  readonly cards: readonly number[] | null;
  /** Puntos de vida iniciales, de 1000 a 8000 en pasos de 500. */
  readonly lifePoints: number;
}

/** La configuracion por defecto: mazo inicial generado y 8000 PV. */
export function defaultDeckConfig(): DeckConfig {
  return { cards: null, lifePoints: STARTING_LIFE_POINTS };
}

/**
 * Valida un mazo: exactamente 40 cartas, tres copias como mucho de cada una, y
 * una sola de cada pieza de Exodia.
 *
 * Devuelve el motivo del rechazo, o `null` si el mazo es valido.
 */
export function validateDeck(cards: readonly number[]): string | null {
  if (cards.length !== DECK_SIZE) {
    return `El mazo necesita ${DECK_SIZE} cartas y tiene ${cards.length}.`;
  }

  const counts = new Map<number, number>();
  for (const cardId of cards) {
    if (card(cardId) === undefined) return `Carta desconocida: ${cardId}.`;
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }

  for (const [cardId, count] of counts) {
    const limit = EXODIA_PIECE_IDS.includes(cardId as 17)
      ? EXODIA_PIECE_COPY_LIMIT
      : DECK_CARD_COPY_LIMIT;
    if (count > limit) {
      const name = cardName(cardId);
      const limitText = limit === 1 ? 'una sola copia' : `${limit} copias como mucho`;
      return `${name}: ${limitText} (llevas ${count}).`;
    }
  }
  return null;
}

/** Cuantos puntos de vida son validos para un duelo. */
export function isValidLifePoints(value: number): boolean {
  if (value < 1000 || value > STARTING_LIFE_POINTS) return false;
  return value % LIFE_POINT_STEP === 0;
}

/**
 * Prepara un duelo jugable.
 *
 * Genera los mazos que falten, los baraja con el metodo del retail y abre la
 * mano inicial. Devuelve el estado inicial junto con el generador, que hay que
 * conservar para seguir jugando desde la misma semilla.
 */
export function createMatch(
  seed: number,
  configs: readonly [DeckConfig, DeckConfig],
): { state: DuelState; rng: Rng } {
  const rng = new Rng(seed);

  const decks: [number[], number[]] = [
    materialiseDeck(configs[0].cards, rng),
    materialiseDeck(configs[1].cards, rng),
  ];

  // El retail baraja el mazo del jugador y despues el del rival, cada uno con
  // 160 intercambios de rango completo.
  rng.shuffle(decks[0], DECK_SHUFFLE_SWAP_COUNT);
  rng.shuffle(decks[1], DECK_SHUFFLE_SWAP_COUNT);

  const lifePoints = [
    isValidLifePoints(configs[0].lifePoints) ? configs[0].lifePoints : STARTING_LIFE_POINTS,
    isValidLifePoints(configs[1].lifePoints) ? configs[1].lifePoints : STARTING_LIFE_POINTS,
  ];

  const state = startDuel(createDuel(seed, decks, lifePoints[0] ?? STARTING_LIFE_POINTS));
  return { state, rng };
}

/** Genera un mazo inicial o normaliza uno dado a 40 cartas. */
function materialiseDeck(cards: readonly number[] | null, rng: Rng): number[] {
  if (cards !== null && validateDeck(cards) === null) return [...cards];
  return starterDeckCardIds(rng);
}

/**
 * Una sesion de juego: estado mas generador, con la logica de aplicar acciones
 * ya cerrada.
 *
 * El servidor guarda una de estas por partida; el cliente lleva la suya para
 * poder predecir, aunque en el modo en linea manda el servidor.
 */
export class DuelSession {
  private state: DuelState;
  private readonly rng: Rng;

  constructor(state: DuelState, rng: Rng) {
    this.state = state;
    this.rng = rng;
  }

  /** Crea una sesion nueva a partir de semilla y mazos. */
  static create(seed: number, configs: readonly [DeckConfig, DeckConfig]): DuelSession {
    const { state, rng } = createMatch(seed, configs);
    return new DuelSession(state, rng);
  }

  /** El estado actual. */
  getState(): DuelState {
    return this.state;
  }

  /** La semilla del generador, para poder reabrir la partida. */
  getSeed(): number {
    return this.rng.snapshot();
  }

  /** Aplica una accion y devuelve el estado nuevo. */
  act(action: PlayerAction): DuelState {
    this.state = applyAction(this.state, action, this.rng);
    return this.state;
  }

  /** Los eventos acumulados desde la ultima vez que se pidieron. */
  takeEvents(): DuelState['events'] {
    const events = this.state.events;
    this.state = { ...this.state, events: [] };
    return events;
  }
}

/** El numero de cartas de la mano inicial, por si la interfaz lo muestra. */
export const OPENING_HAND_SIZE = HAND_SIZE;