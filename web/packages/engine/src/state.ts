/**
 * Estado del duelo: creacion, consulta y mutaciones pequenas.
 *
 * El estado es inmutable desde fuera. Cada funcion que cambia algo devuelve
 * estructuras nuevas, y `applyAction` (en `engine.ts`) es el unico sitio que
 * compone esos cambios. Esa disciplina es la que hace que el servidor pueda
 * reserializar el estado y que el cliente pueda aplicar las mismas acciones
 * esperando el mismo resultado.
 */

import { CARD_STAT_MAX, DECK_SIZE, STARTING_LIFE_POINTS } from './constants.js';
import { card, guardianStarBonus, terrainBoost } from './catalog.js';
import type {
  DuelState,
  DuelStats,
  FieldCard,
  FieldZone,
  GameEvent,
  HandCard,
  Side,
  SideState,
} from './types.js';

/** Un lado vacio, con la mano y el mazo vacios y la vida a tope. */
function emptySide(): SideState {
  return {
    displayedLifePoints: STARTING_LIFE_POINTS,
    lifePoints: STARTING_LIFE_POINTS,
    maxLifePoints: STARTING_LIFE_POINTS,
    deckCursor: 0,
    swordsTurnsRemaining: 0,
    hand: [],
    deck: [],
    monsters: [null, null, null, null, null],
    backRow: [null, null, null, null, null],
    openedTurn: false,
    stats: emptyStats(),
  };
}

function emptyStats(): DuelStats {
  return {
    turnsTaken: 0,
    attacksDeclared: 0,
    attacksLanded: 0,
    spellsUsed: 0,
    trapsTriggered: 0,
    fusionsUsed: 0,
    equipsUsed: 0,
    ritualsUsed: 0,
    faceDownPlays: 0,
  };
}

/** Los lados van en orden: indice 0 = jugador, 1 = rival. */
export function emptySides(): [SideState, SideState] {
  return [emptySide(), emptySide()];
}

/**
 * Crea un duelo nuevo.
 *
 * `decks` son las 40 ids de cada jugador, en orden, ya barajadas por quien
 * llame. El retail baraja cada mazo con 160 intercambios de rango completo y
 * tira primero el del jugador; eso lo hace `setup.ts`.
 */
export function createDuel(
  seed: number,
  decks: readonly [readonly number[], readonly number[]],
  startingLifePoints: number = STARTING_LIFE_POINTS,
): DuelState {
  const sides = emptySides();
  const first = { ...sides[0], deck: [...decks[0]], maxLifePoints: startingLifePoints, lifePoints: startingLifePoints, displayedLifePoints: startingLifePoints };
  const second = { ...sides[1], deck: [...decks[1]], maxLifePoints: startingLifePoints, lifePoints: startingLifePoints, displayedLifePoints: startingLifePoints };

  return {
    seed,
    turn: 0,
    firstSide: 0,
    sides: [first, second],
    terrain: 0,
    phase: 'opening',
    log: [],
    events: [],
    outcome: null,
    turnCount: 0,
    firstTurnNoBattle: true,
  };
}

/** El lado contrario. */
export function opponentOf(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/** Cuantas cartas quedan en el mazo de un lado. */
export function deckCount(state: DuelState, side: Side): number {
  return DECK_SIZE - state.sides[side].deckCursor;
}

/* --------------------------------------------------------- Zonas ---------- */

/**
 * Una zona del grid: filas 0-1 son del rival (atras y monstruos), filas 2-3
 * propias. La columna va de 0 a 4 dentro de la fila.
 */
export function zoneIsOpponentRow(zone: FieldZone): boolean {
  return zone === 0 || zone === 1;
}

export function zoneRow(zone: FieldZone): 'monsters' | 'backRow' {
  return zone === 0 || zone === 1 ? 'backRow' : 'monsters';
}

/** La fila de monstruos del rival, columna `slot`. */
export function opponentMonsterZone(slot: number): FieldZone {
  return 1;
}

/** La fila de monstruos propia, columna `slot`. */
export function ownMonsterZone(slot: number): FieldZone {
  return 2;
}

/** La fila de atras del rival, columna `slot`. */
export function opponentBackRowZone(slot: number): FieldZone {
  return 0;
}

/** La fila de atras propia, columna `slot`. */
export function ownBackRowZone(slot: number): FieldZone {
  return 3;
}

/**
 * Devuelve la carta de una zona del grid, o `null`.
 * El grid va del punto de vista del lado activo: filas 0-1 son del rival,
 * filas 2-3 propias.
 */
export function cardAtZone(state: DuelState, side: Side, zone: FieldZone, slot: number): FieldCard | null {
  const target = zoneIsOpponentRow(zone) ? opponentOf(side) : side;
  const row = zoneRow(zone);
  return state.sides[target][row][slot] ?? null;
}

/** La fila de un grid como array de 5, mutable. */
export function rowOf(side: SideState, zone: FieldZone): (FieldCard | null)[] {
  return zoneRow(zone) === 'monsters' ? [...side.monsters] : [...side.backRow];
}

/* ------------------------------------------------------ Estadisticas ------ */

/**
 * ATK efectivo de una carta en el campo: impreso + terreno + modificador.
 *
 * El retail suma `stat_modifier` (que lleva los equips y las penalizaciones) y
 * el `terrain_modifier` a los dos lados del ATK y la DEF, y solo recorta por
 * arriba a `CARD_STAT_MAX` (`src/game/duel_calc_card_stats.c`).
 */
export function effectiveAttack(field: FieldCard): number {
  const data = card(field.cardId);
  if (data === undefined) return 0;
  const total = data.attack + field.statModifier + field.terrainModifier;
  return Math.max(0, Math.min(CARD_STAT_MAX, total));
}

/** DEF efectiva. La DEF de un monstruo en posicion de ataque tambien cuenta. */
export function effectiveDefense(field: FieldCard): number {
  const data = card(field.cardId);
  if (data === undefined) return 0;
  const total = data.defense + field.statModifier + field.terrainModifier;
  return Math.max(0, Math.min(CARD_STAT_MAX, total));
}

/**
 * ATK del atacante en combate, con la bonificacion de estrella.
 *
 * La bonificacion se aplica **solo a la carta de la izquierda**, que el retail
 * llama atacante: `func_8001EFD4` devuelve `atacanteAjustado - defensorSinAjustar`.
 * No se suma a las dos. Solo recorta por arriba a `CARD_STAT_MAX`, sin piso.
 *
 * Comprobado con los ejemplos de `notes/duel-card-record.md`: 9999 de atacante
 * con +500 se recorta a 9999 y contra 9900 devuelve 99; 100 con -500 devuelve
 * -400 contra 0, sin recortar por abajo.
 */
export function attackAgainst(attacker: FieldCard, defender: FieldCard): number {
  const bonus = starBonus(attacker, defender);
  const total = effectiveAttack(attacker) + bonus;
  return Math.min(CARD_STAT_MAX, total);
}

/** DEF del defensor en combate, sin bonificacion de estrella. */
export function defenseAgainst(defender: FieldCard, _attacker: FieldCard): number {
  return Math.min(CARD_STAT_MAX, effectiveDefense(defender));
}

/**
 * La bonificacion de estrella entre dos cartas en el campo, respetando que
 * cada una puede haber elegido su segunda estrella al entrar.
 */
function starBonus(attacker: FieldCard, defender: FieldCard): number {
  const attackerData = card(attacker.cardId);
  const defenderData = card(defender.cardId);
  if (attackerData === undefined || defenderData === undefined) return 0;
  return guardianStarBonus(attackerData.stars, attacker.useStar2, defenderData.stars, defender.useStar2);
}

/** Las estrellas activas de una carta en el campo, en orden de eleccion. */
export function activeStarsOf(field: FieldCard): readonly [number, number] {
  const data = card(field.cardId);
  if (data === undefined) return [0, 0];
  return field.useStar2 ? [data.stars[1], data.stars[0]] : [data.stars[0], data.stars[1]];
}

/* ------------------------------------------------------- Colocacion ------- */

/**
 * Recalcula el `terrainModifier` de todos los monstruos cuando cambia el
 * terreno. El terreno es compartido: afecta a los dos lados.
 *
 * El retail guarda el bonus en el registro al colocar la carta
 * (`Duel_SetupCardRecord`), y al cambiar el terreno recalcula todos los
 * registros ya en juego, que es lo mismo que hace esto.
 */
export function refreshTerrain(
  sides: readonly [SideState, SideState],
  terrain: number,
): readonly [SideState, SideState] {
  const refresh = (side: SideState): SideState => ({
    ...side,
    monsters: side.monsters.map((field) =>
      field === null ? null : { ...field, terrainModifier: terrainBoost(card(field.cardId)?.type ?? 20, terrain) },
    ),
  });
  return [refresh(sides[0]), refresh(sides[1])];
}

/**
 * Cuantas zonas libres hay en una fila. El retail no permite pasar por alto un
 * hueco: se coloca en la zona elegida, y si esta llena se coloca encima
 * (lo que el juego trata como fallo).
 */
export function freeSlotsIn(row: readonly (FieldCard | null)[]): number[] {
  const free: number[] = [];
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === null) free.push(i);
  }
  return free;
}

/** Cuantos monstruos hay en el campo de un lado. */
export function monsterCount(state: DuelState, side: Side): number {
  return state.sides[side].monsters.filter((m) => m !== null).length;
}

/** Cuantas magias y trampas hay en el campo de un lado. */
export function backRowCount(state: DuelState, side: Side): number {
  return state.sides[side].backRow.filter((m) => m !== null).length;
}

/** El rival tiene monstruos? Sin ellos, un ATK va directo a la vida. */
export function opponentHasMonsters(state: DuelState, side: Side): boolean {
  return monsterCount(state, opponentOf(side)) > 0;
}

/* ------------------------------------------------------ Vida y turno ------ */

/** Aplica danio con piso en 0, como el clamp a `0` con test de signo del retail. */
export function damage(state: DuelState, side: Side, amount: number): DuelState {
  const current = state.sides[side];
  const lifePoints = Math.max(0, current.lifePoints - amount);

  return withEvent(
    { ...state, sides: replaceSide(state.sides, side, { ...current, lifePoints }) },
    { type: 'damage', side, amount, lifePoints },
  );
}

/** Aplica curacion con techo en `maxLifePoints`, el valor con el que empezo. */
export function heal(state: DuelState, side: Side, amount: number): DuelState {
  const current = state.sides[side];
  const lifePoints = Math.min(current.maxLifePoints, current.lifePoints + amount);

  return withEvent(
    { ...state, sides: replaceSide(state.sides, side, { ...current, lifePoints }) },
    { type: 'heal', side, amount: lifePoints - current.lifePoints, lifePoints },
  );
}

/** Cambia un lado por posicion. */
export function replaceSide(
  sides: readonly [SideState, SideState],
  side: Side,
  value: SideState,
): [SideState, SideState] {
  return side === 0 ? [value, sides[1]] : [sides[0], value];
}

/** Marca un lado con un evento. */
export function withEvent(state: DuelState, event: GameEvent): DuelState {
  return { ...state, events: [...state.events, event] };
}

/* ------------------------------------------------------ Serializacion ------ */

/**
 * Clona el estado en forma plana y con solo datos primitivos y arrays. Lo que
 * devuelve va por el socket del servidor; lo que entra lo reproduce el cliente.
 */
export function snapshot(state: DuelState): DuelState {
  return {
    ...state,
    sides: state.sides.map((s) => ({
      ...s,
      hand: s.hand.map((c) => ({ ...c })),
      deck: [...s.deck],
      monsters: s.monsters.map((m) => (m === null ? null : { ...m })),
      backRow: s.backRow.map((m) => (m === null ? null : { ...m })),
      stats: { ...s.stats },
    })) as [SideState, SideState],
    log: state.log.map((entry) => ({ ...entry })),
    events: [...state.events],
  };
}