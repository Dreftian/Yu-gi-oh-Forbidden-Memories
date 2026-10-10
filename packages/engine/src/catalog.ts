/**
 * Acceso al catalogo de cartas y a las reglas de tabla que las relacionan.
 *
 * Todo lo que necesita saber "que carta es esta" y "que puede hacer con ella"
 * vive aqui. El motor de duelo pregunta; esta capa responde.
 */

import {
  ATTRIBUTE_NAMES,
  CARDS,
  EQUIPS,
  FUSIONS,
  STAR_IDS,
  STAR_NAMES,
  TYPE_IDS,
  TYPE_NAMES,
} from './data/cards.generated.js';
import {
  CARD_TYPE_FIRST_NON_MONSTER,
  CARD_TYPE_MAGIC,
  CARD_TYPE_TRAP,
  EQUIP_LEVEL_BONUS,
  GUARDIAN_FIRST_CYCLE_COUNT,
  GUARDIAN_FIRST_CYCLE_START,
  GUARDIAN_SECOND_CYCLE_COUNT,
  GUARDIAN_SECOND_CYCLE_START,
  GUARDIAN_STAR_BONUS,
  MONSTER_TYPE_COUNT,
  STARTER_DECK_ROWS,
  TERRAIN_BOOST,
  TERRAIN_STAT_ADJUSTMENT,
  equipBonus,
} from './constants.js';
import type { CardData, GuardianStar } from './types.js';
import type { Rng } from './rng.js';

export { ATTRIBUTE_NAMES, STAR_NAMES, STAR_IDS, TYPE_IDS, TYPE_NAMES };

/** Cuantas cartas tiene el catalogo. */
export const CARD_COUNT = CARDS.length;

/**
 * Indice por id, para busquedas directas. Los ids son 1..722 sin huecos, asi
 * que `CARDS[id - 1]` funciona, pero mantenemos un mapa por si algun dia hay
 * un hueco.
 */
const BY_ID = new Map<number, CardData>(CARDS.map((card) => [card.id, card]));

/** Todas las cartas, en orden de id. */
export function allCards(): readonly CardData[] {
  return CARDS;
}

/**
 * La carta de un id, o `undefined` si el id no existe.
 * `cardId` 0 significa "sin carta" en varios sitios del motor, asi que aqui se
 * devuelve `undefined` sin lanzar.
 */
export function card(cardId: number): CardData | undefined {
  return BY_ID.get(cardId);
}

/** La carta de un id, o una cartaanonima si el id no existe. */
export function cardOrUnknown(cardId: number): CardData {
  return BY_ID.get(cardId) ?? UNKNOWN_CARD;
}

/** Sustituto para ids invalidos. Nunca deberia verse en una partida real. */
const UNKNOWN_CARD: CardData = {
  id: 0,
  name: '???',
  type: CARD_TYPE_MAGIC,
  attribute: -1,
  level: 0,
  stars: [0, 0],
  attack: 0,
  defense: 0,
  description: '',
};

/** Nombre de una carta, tolerante a ids invalidos. */
export function cardName(cardId: number): string {
  return BY_ID.get(cardId)?.name ?? '???';
}

/** Es un monstruo? Todo lo que no es Magia, Trampa, Ritual ni Equip. */
export function isMonster(cardData: CardData | undefined): boolean {
  return cardData !== undefined && cardData.type < CARD_TYPE_FIRST_NON_MONSTER;
}

export function isMonsterId(cardId: number): boolean {
  return isMonster(BY_ID.get(cardId));
}

export function isMagic(cardId: number): boolean {
  return BY_ID.get(cardId)?.type === CARD_TYPE_MAGIC;
}

export function isTrap(cardId: number): boolean {
  return BY_ID.get(cardId)?.type === CARD_TYPE_TRAP;
}

export function isRitual(cardId: number): boolean {
  return BY_ID.get(cardId)?.type === 22;
}

export function isEquip(cardId: number): boolean {
  return BY_ID.get(cardId)?.type === 23;
}

/** Un no-monstruo cualquiera: Magia, Trampa, Ritual o Equip. */
export function isSpellLike(cardId: number): boolean {
  const data = BY_ID.get(cardId);
  return data !== undefined && data.type >= CARD_TYPE_FIRST_NON_MONSTER;
}

/* ------------------------------------------------- Estadisticas ------------ */

/**
 * Bonificacion de terreno de un tipo de carta en el terreno activo.
 *
 * `Duel_GetTerrainBoost` devuelve 0 si no hay terreno o si la carta no es un
 * monstruo, y aplica el mismo valor al ATK y a la DEF
 * (`src/game/duel_card_record_lifecycle.c`).
 */
export function terrainBoost(cardType: number, terrain: number): number {
  if (terrain <= 0 || cardType >= CARD_TYPE_FIRST_NON_MONSTER) return 0;
  if (cardType >= MONSTER_TYPE_COUNT) return 0;
  const row = TERRAIN_BOOST[cardType];
  if (row === undefined) return 0;
  const units = row[terrain - 1];
  return units === undefined ? 0 : units * TERRAIN_STAT_ADJUSTMENT;
}

/**
 * Bonificacion de estrella entre dos cartas.
 *
 * Devuelve `+500`, `-500` o `0`, y se aplica solo al margen del atacante: el
 * retail calcula `atacante + bonificacion - defensor`, nunca suma la
 * bonificacion a los dos lados (`src/game/duel_battle_stats.c`).
 */
export function guardianStarBonus(
  attackerStars: readonly [GuardianStar, GuardianStar],
  attackerUseSecond: boolean,
  defenderStars: readonly [GuardianStar, GuardianStar],
  defenderUseSecond: boolean,
): number {
  const attacker = cycleIndex(attackerUseSecond ? attackerStars[1] : attackerStars[0]);
  const defender = cycleIndex(defenderUseSecond ? defenderStars[1] : defenderStars[0]);
  if (attacker === null || defender === null) return 0;

  // Pares de ciclos distintos dan siempre cero, sin comparar posiciones.
  if (attacker.start !== defender.start) return 0;

  const length = defender.length;
  // La estrella del atacante precede inmediatamente a la del defensor.
  if ((attacker.position + 1) % length === defender.position) return GUARDIAN_STAR_BONUS;
  // La del atacante sigue inmediatamente a la del defensor.
  if ((attacker.position + length - 1) % length === defender.position) return -GUARDIAN_STAR_BONUS;
  // Mismo ciclo, no adyacentes: cero.
  return 0;
}

interface CyclePosition {
  /** Id del primer miembro del ciclo: 1 para el de seis, 7 para el de cuatro. */
  readonly start: number;
  /** Longitud del ciclo al que pertenece la estrella. */
  readonly length: number;
  /** Posicion dentro de ese ciclo. */
  readonly position: number;
}

/**
 * A que ciclo pertenece una estrella y en que posicion esta. Devuelve `null`
 * para ids fuera del dominio 1..10, que el retail trata como "sin estrella".
 */
function cycleIndex(star: GuardianStar): CyclePosition | null {
  if (star >= GUARDIAN_FIRST_CYCLE_START && star < GUARDIAN_FIRST_CYCLE_START + GUARDIAN_FIRST_CYCLE_COUNT) {
    return {
      start: GUARDIAN_FIRST_CYCLE_START,
      length: GUARDIAN_FIRST_CYCLE_COUNT,
      position: star - GUARDIAN_FIRST_CYCLE_START,
    };
  }
  if (star >= GUARDIAN_SECOND_CYCLE_START && star < GUARDIAN_SECOND_CYCLE_START + GUARDIAN_SECOND_CYCLE_COUNT) {
    return {
      start: GUARDIAN_SECOND_CYCLE_START,
      length: GUARDIAN_SECOND_CYCLE_COUNT,
      position: star - GUARDIAN_SECOND_CYCLE_START,
    };
  }
  return null;
}

/**
 * Las dos estrellas de una carta, en el orden de eleccion: la primera activa
 * por defecto, la segunda si `useStar2`.
 */
export function activeStars(
  cardData: CardData,
  useSecond: boolean,
): readonly [GuardianStar, GuardianStar] {
  return useSecond ? [cardData.stars[1], cardData.stars[0]] : cardData.stars;
}

/* --------------------------------------------------------- Fusiones ------- */

/**
 * Id del monstruo que resulta de fusionar `a` con `b`, o 0 si no hay receta.
 *
 * El retail indexa la tabla por el id mas pequeno del par
 * (`notes/research/the-game.md`, tabla de fusiones).
 */
export function fusionResult(a: number, b: number): number {
  const key = Math.min(a, b);
  const other = Math.max(a, b);
  const recipes = FUSIONS[key];
  if (recipes === undefined) return 0;
  for (const recipe of recipes) {
    if (recipe[0] === other) return recipe[1];
  }
  return 0;
}

/** Si la carta es un monstruo, se deduce por ser clave o valor de una fusion. */
export function participatesInFusion(cardId: number): boolean {
  return (FUSIONS[cardId]?.length ?? 0) > 0;
}

/* ---------------------------------------------------------- Equips -------- */

/**
 * Si un equip puede fijarse a un monstruo concreto. La tabla del retail es
 * `{equipId, count, monsterId...}` con 4 041 pares validos, y lo reproduce
 * `notes/research/fusion-and-drop-tables/equips.csv`.
 */
export function canEquipOn(equipId: number, monsterId: number): boolean {
  const targets = EQUIPS[equipId];
  if (targets === undefined) return false;
  return targets.includes(monsterId);
}

/**
 * Bonificacion de un equip a un monstruo: `+500` por nivel. Se aplica a ATK y
 * DEF, y se acumula en el mismo `statModifier` que el terreno
 * (`src/game/duel_scene_card_placement.c`).
 */
export function equipStatBonus(equipId: number): number {
  return equipBonus(equipId);
}

/** El +500 generico, por si hace falta citarlo sin saber el equip. */
export const BASE_EQUIP_BONUS = EQUIP_LEVEL_BONUS;

/* ------------------------------------------------------ Mazo inicial ------- */

/**
 * Las 40 cartas de la campana inicial, agrupadas como en
 * `notes/starter-deck-pools.md`.
 *
 * El retail no sortea una carta entre todas, sino que recorre siete filas
 * ponderadas: 16 monstruos de ATK+DEF 450-1050, 16 de 1100-1550, 4 de
 * 1600-2050, 1 de 2100-2450, 1 de Dark Hole o Raigeki, 1 de los seis
 * terrenos y 1 de los 28 equips. Las cuentas suman 40 y ninguna carta sale
 * en dos filas.
 *
 * Recibe el generador del motor para que el mazo dependa de la semilla de la
 * partida y no de `Math.random`.
 */
export function starterDeckCardIds(rng: Rng): number[] {
  const chosen: number[] = [];
  const monsters = CARDS.filter((c) => isMonster(c));

  for (const row of STARTER_DECK_ROWS) {
    const pool = monsters.filter((c) => {
      const total = c.attack + c.defense;
      return total >= row.minTotal && total <= row.maxTotal;
    });
    chosen.push(...sampleWithoutRepeats(pool, row.count, chosen, rng));
  }

  // La fila de Dark Hole o Raigeki, la de los seis terrenos y la de los equips.
  chosen.push(rng.pick(DARK_HOLE_RAIGEKI_IDS));
  chosen.push(rng.pick(TERRAIN_CARD_IDS_LIST));
  chosen.push(rng.pick(CARDS.filter((c) => c.type === 23).map((c) => c.id)));

  return chosen;
}

/** Dark Hole (336) y Raigeki (337), la quinta fila de la campana. */
const DARK_HOLE_RAIGEKI_IDS: readonly number[] = [336, 337];

/** Las seis cartas de terreno, 330-335, la sexta fila. */
const TERRAIN_CARD_IDS_LIST: readonly number[] = [330, 331, 332, 333, 334, 335];

/**
 * Toma `count` elementos de `pool` sin repetir ninguno de los ids ya usados:
 * es el comportamiento de reintento del retail cuando una carta ya tiene tres
 * copias.
 */
function sampleWithoutRepeats(
  pool: readonly CardData[],
  count: number,
  used: readonly number[],
  rng: Rng,
): number[] {
  const working = pool.filter((c) => !used.includes(c.id));
  const picked: number[] = [];

  for (let i = 0; i < count && working.length > 0; i += 1) {
    const index = rng.interval(working.length);
    const [chosen] = working.splice(index, 1);
    if (chosen !== undefined) picked.push(chosen.id);
  }
  return picked;
}

/** Todas las cartas de un tipo, util para el constructor de mazos. */
export function cardsOfType(type: number): CardData[] {
  return CARDS.filter((c) => c.type === type);
}

/** Todas las cartas de un tipo, por id. */
export function cardIdsOfType(type: number): number[] {
  return cardsOfType(type).map((c) => c.id);
}