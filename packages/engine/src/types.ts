/**
 * Tipos del motor de duelo.
 *
 * El motor es puro: no toca el DOM, ni el sistema de ficheros, ni el reloj.
 * Toda la aleatoriedad pasa por `Rng`, y toda mutacion de estado pasa por
 * `applyAction`, que devuelve un estado nuevo. Eso es lo que permite que el
 * servidor y el cliente ejecuten exactamente el mismo codigo.
 */

/** Id de tipo de carta: 0-19 monstruos, 20 Magia, 21 Trampa, 22 Ritual, 23 Equip. */
export type CardType = number;

/** Id de estrella guardian: 1-10, 0 = sin estrella. */
export type GuardianStar = number;

/** Atributo: 0-5, -1 = sin atributo (no monstruo). */
export type Attribute = number;

/** Lado del duelo: 0 y 1. */
export type Side = 0 | 1;

/**
 * Zona del campo. Coincide con las filas del retail:
 * fila 0 = magicianos/trampas del rival, fila 1 = monstruos del rival,
 * fila 2 = monstruos propios, fila 3 = magicianos/trampas propios.
 */
export type FieldZone = 0 | 1 | 2 | 3;

/**
 * Una carta tal como la define el catalogo. Generada desde
 * `notes/card-catalog.csv` y `languages/en-eu.txt`.
 */
export interface CardData {
  readonly id: number;
  readonly name: string;
  readonly type: CardType;
  readonly attribute: Attribute;
  readonly level: number;
  /** Las dos estrellas guardian. La segunda se elige con `useStar2`. */
  readonly stars: readonly [GuardianStar, GuardianStar];
  readonly attack: number;
  readonly defense: number;
  readonly description: string;
}

/**
 * Una carta en juego. Es el equivalente conceptual de `DuelCardRecord` del
 * retail (28 bytes, `src/game/duel_card_layout.h`), pero en objetos.
 */
export interface FieldCard {
  /** Id de carta en el catalogo. */
  readonly cardId: number;
  /** Indice 0-4 dentro de la fila de monstruos o de la fila de S/T. */
  readonly slot: number;
  readonly side: Side;
  /** Posicion de defensa: no ataca, pero el ATK rival lo golpea. */
  readonly defensePosition: boolean;
  /** Boca abajo: identidad oculta hasta que se revela. */
  readonly faceDown: boolean;
  /** Uso la segunda estrella guardian en lugar de la primera. */
  readonly useStar2: boolean;
  /** Modificador permanente de estadisticas: equips, penalizaciones, terreno. */
  readonly statModifier: number;
  /** Bonificacion de terreno recalculada al entrar al campo. */
  readonly terrainModifier: number;
  /** Equip que lleva puesto, si lleva. */
  readonly equipId: number | null;
  /** Ya ha atacado este turno. */
  readonly usedThisTurn: boolean;
}

/** Una carta en la mano. Solo necesita el id y la orientacion escolhida. */
export interface HandCard {
  readonly cardId: number;
  /** Elegida boca abajo al jugarla desde la mano. */
  readonly faceDown: boolean;
}

/** Estado de un lado del duelo. Equivalente a `DuelSideState`. */
export interface SideState {
  /** Puntos de vida mostrados, interpolan hacia los reales. */
  displayedLifePoints: number;
  /** Puntos de vida reales, con piso en 0. */
  lifePoints: number;
  /** Techo de curacion: los puntos de vida con los que empezo. */
  maxLifePoints: number;
  /** Cuantas cartas se han robado ya del mazo: 0 = las 40 siguen ahi. */
  deckCursor: number;
  /** Turnos restantes de Swords of Revealing Light, 0 = inactivo. */
  swordsTurnsRemaining: number;
  readonly hand: HandCard[];
  readonly deck: number[];
  /** Slots 0-4 de monstruos; `null` si la zona esta libre. */
  readonly monsters: (FieldCard | null)[];
  /** Slots 0-4 de magicianos/trampas; `null` si la zona esta libre. */
  readonly backRow: (FieldCard | null)[];
  /** Ya ha abierto su turno este duelo. */
  openedTurn: boolean;
  /** Estadisticas de la partida, para la pantalla de resultado. */
  readonly stats: DuelStats;
}

/** Contadores que alimentan la pantalla de resultado. */
export interface DuelStats {
  turnsTaken: number;
  attacksDeclared: number;
  attacksLanded: number;
  spellsUsed: number;
  trapsTriggered: number;
  fusionsUsed: number;
  equipsUsed: number;
  ritualsUsed: number;
  faceDownPlays: number;
}

/** Como termino el duelo. */
export type DuelOutcome =
  | { readonly kind: 'lp'; readonly winner: Side }
  | { readonly kind: 'deckout'; readonly winner: Side }
  | { readonly kind: 'exodia'; readonly winner: Side }
  | { readonly kind: 'surrender'; readonly winner: Side };

/** Nodo del arbol de efectos pendientes de resolver. */
export interface EffectNode {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

/** Rango de una carta: nombre corto del mazo y de la mano. */
export interface CardRange {
  readonly label: string;
  readonly cardIds: readonly number[];
}

/** Estado completo del duelo. Es lo que el servidor serializa y reproduce. */
export interface DuelState {
  readonly seed: number;
  /** Lado cuyo turno es. El retail arranca siempre en 0. */
  turn: Side;
  /** Lado que empezo primero, para el marcador. */
  readonly firstSide: Side;
  readonly sides: readonly [SideState, SideState];
  /** Terreno activo: 0 = normal, 1..6 = los seis campos. */
  terrain: number;
  /** La mano inicial ya se robo: el retail no cuenta eso como turno. */
  phase: DuelPhase;
  /** Monstruos que ya atacaron este turno, para el "solo uno por turno". */
  readonly log: readonly DuelLogEntry[];
  readonly events: readonly GameEvent[];
  readonly outcome: DuelOutcome | null;
  /** Numero de turno global, para mostrar "turno N". */
  turnCount: number;
  /**
   * El primer turno del duelo no permite declarar ataques
   * (`D_8009B16C & 0x1000`). Se levanta cuando el jugador pulsa Start.
   */
  firstTurnNoBattle: boolean;
}

export type DuelPhase =
  | 'opening'
  | 'main'
  | 'resolving'
  | 'choice'
  | 'finished';

export interface DuelLogEntry {
  readonly turn: number;
  readonly side: Side;
  readonly text: string;
}

/**
 * Evento que el cliente reproduce como animacion. El motor no dibuja nada;
 * solo describe lo que paso, en orden.
 */
export type GameEvent =
  | { readonly type: 'turn-start'; readonly side: Side }
  | { readonly type: 'draw'; readonly side: Side; readonly count: number }
  | { readonly type: 'place'; readonly side: Side; readonly zone: FieldZone; readonly slot: number; readonly cardId: number; readonly faceDown: boolean }
  | { readonly type: 'attack'; readonly side: Side; readonly slot: number }
  | { readonly type: 'battle'; readonly attacker: number; readonly defender: number | null; readonly difference: number; readonly attackerWins: boolean; readonly direct: boolean }
  | { readonly type: 'destroy'; readonly side: Side; readonly zone: FieldZone; readonly slot: number; readonly cardId: number }
  | { readonly type: 'damage'; readonly side: Side; readonly amount: number; readonly lifePoints: number }
  | { readonly type: 'heal'; readonly side: Side; readonly amount: number; readonly lifePoints: number }
  | { readonly type: 'effect'; readonly label: string }
  | { readonly type: 'trap'; readonly cardId: number }
  | { readonly type: 'exodia'; readonly side: Side }
  | { readonly type: 'finish'; readonly outcome: DuelOutcome; readonly sides: readonly [number, number] };

/**
 * Acciones que un jugador o la IA pueden enviar al motor.
 *
 * `cardIndex` es el indice dentro de la mano del lado activo, `slot` el indice
 * 0-4 de la zona destino, y `target` el slot del monstruo rival al que se
 * ataca (`null` para ataque directo).
 */
export type PlayerAction =
  | { readonly type: 'ready' }
  | { readonly type: 'end-phase' }
  | { readonly type: 'summon'; readonly cardIndex: number; readonly slot: number; readonly useStar2: boolean }
  | { readonly type: 'set'; readonly cardIndex: number; readonly slot: number }
  | { readonly type: 'equip'; readonly cardIndex: number; readonly slot: number }
  | { readonly type: 'activate'; readonly cardIndex: number }
  | { readonly type: 'activate-field'; readonly slot: number }
  | { readonly type: 'ritual'; readonly cardIndex: number; readonly tributes: readonly number[] }
  | { readonly type: 'fusion'; readonly cardIndices: readonly number[]; readonly slot: number }
  | { readonly type: 'attack'; readonly slot: number; readonly target: number | null }
  | { readonly type: 'change-position'; readonly slot: number }
  | { readonly type: 'surrender' };

/** Seleccion pendiente de resolver: el motor pide y el jugador responde. */
export type PendingChoice =
  | { readonly kind: 'target-slot'; readonly zones: readonly FieldZone[]; readonly label: string }
  | { readonly kind: 'attack-target'; readonly options: readonly number[] }
  | { readonly kind: 'monster-select'; readonly label: string; readonly options: readonly number[] }
  | { readonly kind: 'star'; readonly cardIndex: number }
  | { readonly kind: 'ritual-tributes'; readonly needed: number; readonly options: readonly number[] }
  | { readonly kind: 'confirm'; readonly label: string };

/**
 * Vista de una carta para el cliente. Nunca incluye lo que un jugador no debe
 * ver: las cartas boca abajo del rival llegan con `faceDown: true` y sin id.
 */
export interface CardView {
  readonly id: number | null;
  readonly name: string;
  readonly faceDown: boolean;
  readonly defensePosition?: boolean;
  readonly attack?: number;
  readonly defense?: number;
  readonly type?: CardType;
  readonly attribute?: Attribute;
  readonly level?: number;
  readonly stars?: readonly [GuardianStar, GuardianStar];
  readonly useStar2?: boolean;
  readonly description?: string;
  readonly equipped?: boolean;
}

/** Vista de la mano. Nunca incluye las cartas del rival. */
export interface HandView {
  readonly count: number;
  readonly cards: readonly CardView[];
}

/** Vista de un lado tal como la ve un jugador concreto. */
export interface SideView {
  readonly lifePoints: number;
  readonly displayedLifePoints: number;
  readonly deckCount: number;
  readonly hand: HandView;
  readonly monsters: readonly (CardView | null)[];
  readonly backRow: readonly (CardView | null)[];
  readonly swordsTurnsRemaining: number;
  readonly openedTurn: boolean;
  readonly isTurn: boolean;
}

/**
 * Estado del duelo tal como lo ve un jugador: los dos lados, con la mano rival
 * oculta y las cartas boca abajo sin revelar.
 */
export interface DuelView {
  readonly turn: Side;
  readonly turnCount: number;
  readonly phase: DuelPhase;
  readonly terrain: number;
  readonly you: SideView;
  readonly opponent: SideView;
  readonly log: readonly DuelLogEntry[];
  readonly events: readonly GameEvent[];
  readonly outcome: DuelOutcome | null;
  readonly choice: PendingChoice | null;
}