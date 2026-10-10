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
  DECK_CARD_COPY_LIMIT,
  DECK_SIZE,
  EQUIP_LEVEL_BONUS,
  EXODIA_PIECE_COPY_LIMIT,
  EXODIA_PIECE_IDS,
  GUARDIAN_FIRST_CYCLE_COUNT,
  GUARDIAN_FIRST_CYCLE_START,
  GUARDIAN_SECOND_CYCLE_COUNT,
  GUARDIAN_SECOND_CYCLE_START,
  GUARDIAN_STAR_BONUS,
  MONSTER_TYPE_COUNT,
  STARTER_DECK_ROWS,
  STARTER_DECK_WEIGHT_SCAN_COUNT,
  TERRAIN_BOOST,
  TERRAIN_STAT_ADJUSTMENT,
  equipBonus,
} from './constants.js';
import type { StarterDeckRow } from './constants.js';
import { DUELISTS } from './data/duelists.generated.js';
import type { DuelistData, DropEntry } from './data/duelists.generated.js';
import { THRESHOLD_TOTAL } from './rng.js';
import type { CardData, GuardianStar } from './types.js';
import type { Rng } from './rng.js';

export { ATTRIBUTE_NAMES, STAR_NAMES, STAR_IDS, TYPE_IDS, TYPE_NAMES };
export { DUELISTS };
export type { DuelistData, DropEntry };

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
 * Las 40 cartas de la campana inicial.
 *
 * El retail recorre siete filas ponderadas: 16 monstruos de ATK+DEF 450-1050, 16
 * de 1100-1550, 4 de 1600-2050, 1 de 2100-2450, 1 de Dark Hole o Raigeki, 1 de
 * los seis terrenos y 1 de los equips. Los contadores y las filas estan en
 * `STARTER_DECK_ROWS`; los PESOS no.
 *
 * El algoritmo es el de `NameEntry_BuildStarterDeck`
 * (`src/overlays/password/name_entry_main.c:58-111`, `notes/rng.md` lineas
 * 237-258): cada intento saca un `threshold()`, y por CADA peso que examina
 * consume un valor mas y lo tira. Elegir la carta de indice `i` cuesta por tanto
 * `i + 2` valores. Si la carta elegida llega a su cuarta copia se descarta el
 * intento entero y se repite; el numero de cartas que faltan no baja.
 *
 * Una diferencia nuestra, y es a proposito: el retail comprueba solo
 * `DECK_CARD_COPY_LIMIT` (3) y por eso su mazo inicial puede llevar dos piezas
 * de Exodia, que su propio constructor de mazos no aceptaria
 * (`notes/starter-deck.md`, seccion "Limits"). Aqui el reintento usa el limite
 * legal de cada carta (`copyLimitFor`), que es 1 para las piezas de Exodia, para
 * que el mazo generado siempre pase `validateDeck`.
 *
 * Recibe el generador del motor para que el mazo dependa de la semilla de la
 * partida y no de `Math.random`.
 */
export function starterDeckCardIds(rng: Rng): number[] {
  const counts = new Map<number, number>();
  const deck: number[] = [];

  for (const row of STARTER_DECK_ROWS) {
    const weights = starterRowWeights(starterPool(row));
    let remaining = row.drawCount;

    do {
      const threshold = rng.threshold();
      const picked = weightedScan(rng, weights, threshold);

      // Un umbral que ningun peso alcanza no anade carta, pero el intento
      // cuenta: es lo que hace el retail con una fila editada.
      if (picked >= 0) {
        const cardId = picked + 1;
        if ((counts.get(cardId) ?? 0) >= copyLimitFor(cardId)) {
          remaining += 1;
        } else {
          counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
          deck.push(cardId);
        }
      }
      remaining -= 1;
    } while (remaining !== 0);
  }

  return deck;
}

/**
 * Recorre una fila de pesos como el retail y devuelve el indice elegido.
 *
 * Descarta un valor del generador ANTES de sumar cada peso, tambien el que cierra
 * el umbral, y para al llegar a `STARTER_DECK_WEIGHT_SCAN_COUNT`. Devuelve -1 si
 * el umbral no lo alcanza ninguno de los pesos examinados.
 */
function weightedScan(rng: Rng, weights: readonly number[], threshold: number): number {
  let accumulated = 0;
  for (let index = 0; index < STARTER_DECK_WEIGHT_SCAN_COUNT; index += 1) {
    rng.next();
    accumulated += weights[index] ?? 0;
    if (accumulated >= threshold) return index;
  }
  return -1;
}

/** Las cartas de una fila del mazo inicial, en orden de id. */
function starterPool(row: StarterDeckRow): number[] {
  if ('cardIds' in row) return [...row.cardIds];
  if ('cardType' in row) return cardIdsOfType(row.cardType);
  return CARDS.filter((c) => {
    if (!isMonster(c)) return false;
    const total = c.attack + c.defense;
    return total >= row.minTotal && total <= row.maxTotal;
  }).map((c) => c.id);
}

/**
 * Los pesos de una fila del mazo inicial, indexados POR ID DE CARTA.
 *
 * Indexar por id y no por posicion en la fila es lo que hace el retail, y es lo
 * que hace que el gasto de numeros coincida: el indice `i` de la fila es el
 * `card_id i + 1`, asi que elegir la carta `n` examina `n` pesos.
 *
 * Los pesos de verdad viven solo en el disco (`0xF92BD4` y `0xFBDBD4`, dos
 * copias byte a byte de 0x2808 bytes con siete registros de 0x5B8), que este
 * repositorio no incluye, asi que no son obtenibles. Lo que se conserva del
 * retail es el total: cada fila suma `DUEL_DROP_WEIGHT_TOTAL` (2048), el mismo
 * denominador del umbral, y se reparte lo mas uniformemente posible (metodo del
 * resto mayor). La tabla de FILAS y sus contadores si son los del retail
 * (`STARTER_DECK_ROWS`); la de pesos es nuestra.
 */
function starterRowWeights(pool: readonly number[]): number[] {
  const weights = new Array<number>(STARTER_DECK_WEIGHT_SCAN_COUNT).fill(0);
  if (pool.length === 0) return weights;

  const base = Math.floor(THRESHOLD_TOTAL / pool.length);
  let leftOver = THRESHOLD_TOTAL - base * pool.length;
  for (const cardId of pool) {
    if (cardId < 1 || cardId > STARTER_DECK_WEIGHT_SCAN_COUNT) continue;
    const extra = leftOver > 0 ? 1 : 0;
    weights[cardId - 1] = base + extra;
    leftOver -= extra;
  }
  return weights;
}

/**
 * Cuantas copias de una carta admite un mazo: tres, y una sola para las cinco
 * piezas de Exodia (`EXODIA_PIECE_COPY_LIMIT`), que es lo que `validateDeck`
 * exige.
 */
function copyLimitFor(cardId: number): number {
  return EXODIA_PIECE_IDS.includes(cardId as 17) ? EXODIA_PIECE_COPY_LIMIT : DECK_CARD_COPY_LIMIT;
}

/* ------------------------------------------------------ Duelistas ---------- */

/**
 * El duelista de un id, o `undefined` si no existe.
 *
 * El id 0 es real (`"(unused; copy of Simon Muran)"`) y sale tambien, porque el
 * retail lo tiene guardado en la tabla. No hay ids negativos ni por encima de 39.
 */
export function duelistById(id: number): DuelistData | undefined {
  return DUELISTS.find((duelist) => duelist.id === id);
}

/**
 * Cuantos intentos se dan para sacar UNA carta del pool de un duelista antes de
 * renunciar al sorteo.
 *
 * Es un tope de seguridad, no una parte del retail, y tiene que ser GENEROSO
 * porque hay pools muy sesgados. En el de Teana (id 2) siete cartas se llevan
 * 2020 de los 2048 puntos: en cuanto esas siete llegan a sus tres copias, el
 * 98,6% de los sorteos cae en una carta ya agotada y se rechaza, asi que sacarla
 * desde el principio son ~70 intentos de media. Con 16 el sorteo fallaria el 80%
 * de las veces y el mazo se llenaria con el relleno de emergencia, que no es un
 * sorteo. Con 512 la probabilidad de agotarlo baja al 0,1% por carta.
 *
 * Existe porque esta funcion corre dentro de un `while` de la partida y un bucle
 * infinito ahi cuelga el juego entero. Los 40 pools de la tabla dan para 40 cartas
 * de sobra (el mas pequeno, el de Teana, tiene 21 cartas y una capacidad de 63),
 * asi que el relleno solo hace falta en el caso patologico.
 */
const DUELIST_DRAW_ATTEMPTS = 512;

/**
 * Las 40 cartas del mazo de un duelista, sorteadas de su pool con sus pesos.
 *
 * De donde sale el "40 del pool con pesos" es literal en la documentacion del
 * decompilado
 * (`Yu-Gi-Oh-Forbidden-Memories-Recompiled-master/notes/research/fusion-and-drop-tables/README.md:25-27`
 * y `notes/more-duelists.md:88`): "Weights, not a card list: the game draws 40
 * cards from the pool, so a card with twice the weight turns up about twice as
 * often." El mazo del rival NO es una lista fija de 40: se sortea en cada
 * partida, y por eso los pools tienen entre 21 y 169 cartas distintas. Cada
 * tabla de pesos suma `DUEL_DROP_WEIGHT_TOTAL` (2048), el mismo denominador del
 * umbral, asi que el sorteo es `rng.weightedPick` sin renormalizar, igual que
 * `Duel_SelectCardDrop` (`src/game/duel_result_runtime.c`).
 *
 * El tope de copias no sale de ahi, y se mete a proposito por un motivo nuestro:
 * `validateDeck` rechaza los mazos que se pasan de tres copias (o de una pieza de
 * Exodia), y `materialiseDeck` (`setup.ts`) cambia en silencio cualquier mazo que
 * no lo pase por un mazo inicial generado. Sin el reintento, un duelista con una
 * carta muy pesada en su pool se quedaria sin su mazo y el jugador no veria por
 * que. El reintento es el del mazo inicial: se rechaza el sorteo de esa carta y
 * se vuelve a sortear, sin que baje el numero de cartas que faltan.
 *
 * Recibe el generador del motor, y no `Math.random`, para que el mazo dependa de
 * la semilla de la partida y para que dos ejecuciones den el mismo mazo.
 *
 * Un duelista desconocido devuelve el mazo inicial, no un mazo vacio: es lo mismo
 * que hace `materialiseDeck` con una configuracion invalida, y el motor no sabe
 * arrancar un duelo con menos de 40 cartas.
 */
export function rollDuelistDeck(duelistId: number, rng: Rng): number[] {
  const duelist = duelistById(duelistId);
  if (duelist === undefined) return starterDeckCardIds(rng);
  return rollDeckPool(duelist.deck, rng);
}

/** Sortea `DECK_SIZE` cartas de un pool ponderado del retail. */
function rollDeckPool(pool: readonly DropEntry[], rng: Rng): number[] {
  const weights = pool.map((entry) => entry[1]);
  const counts = new Map<number, number>();
  const deck: number[] = [];

  for (let drawn = 0; drawn < DECK_SIZE; drawn += 1) {
    const cardId = drawOne(pool, weights, counts, rng);
    if (cardId === null) break;
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
    deck.push(cardId);
  }

  // Relleno de seguridad para lo que haya faltado: se sigue bajando por el pool
  // de mayor a menor peso y se copia cada carta hasta llenar sus huecos. Se
  // rellena desde el pool respetando los topes de copia, y no con la carta mas
  // pesada a lo bruto, porque lo que se quiere al final es un mazo que
  // `validateDeck` acepte: uno con cuatro copias de algo se pierde en silencio
  // dentro de `materialiseDeck`. Los 40 pools de la tabla dan para 40 cartas de
  // sobra, asi que este camino no se recorre; si alguna vez se recorriera y el
  // pool fuera tan pequeno que no llegara, el mazo saldria mas corto y
  // `materialiseDeck` lo cambiaria por un mazo inicial, que es la degradacion
  // correcta.
  const byWeight = [...pool].sort((a, b) => b[1] - a[1]);
  for (const [cardId] of byWeight) {
    while (deck.length < DECK_SIZE && (counts.get(cardId) ?? 0) < copyLimitFor(cardId)) {
      counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
      deck.push(cardId);
    }
    if (deck.length >= DECK_SIZE) break;
  }

  return deck;
}

/**
 * Una carta del pool, o `null` si no sale ninguna.
 *
 * `null` cubre los dos finales posibles: que ningun peso alcance el umbral (el
 * "no reintento" de `Duel_SelectCardDrop`) y que se hayan agotado los intentos
 * del tope de seguridad. Un `-1` de `weightedPick` con una tabla que suma 2048 no
 * deberia ocurrir nunca, pero el motor es puro y nunca lanza: el caso de "no sale
 * ninguna" tiene que ser un valor.
 */
function drawOne(
  pool: readonly DropEntry[],
  weights: readonly number[],
  counts: Map<number, number>,
  rng: Rng,
): number | null {
  for (let attempt = 0; attempt < DUELIST_DRAW_ATTEMPTS; attempt += 1) {
    const index = rng.weightedPick(weights);
    if (index < 0) return null;

    const entry = pool[index];
    if (entry === undefined) return null;

    // Cuarta copia (o segunda de una pieza de Exodia): el sorteo se rechaza y se
    // repite, igual que en `starterDeckCardIds`.
    if ((counts.get(entry[0]) ?? 0) >= copyLimitFor(entry[0])) continue;
    return entry[0];
  }
  return null;
}

/** Todas las cartas de un tipo, util para el constructor de mazos. */
export function cardsOfType(type: number): CardData[] {
  return CARDS.filter((c) => c.type === type);
}

/** Todas las cartas de un tipo, por id. */
export function cardIdsOfType(type: number): number[] {
  return cardsOfType(type).map((c) => c.id);
}