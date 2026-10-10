/**
 * Tests de las reglas del retail que no son de "quien gana el duelo", sino de
 * que el motor haga lo mismo que el C que compila.
 *
 * Cada bloque cubre una de las cinco piezas que se corrigieron para eso:
 *
 * 1. las dos primitivas que faltaban del generador (`threshold`, `weightedPick`);
 * 2. el algoritmo real del mazo inicial (umbral + descarte por peso + reintento);
 * 3. el despacho de efectos por grupo, con la tabla generada como fuente;
 * 4. el modelo de tributo de ritual, exacto frente a aproximado;
 * 5. Dark-piercing Light, que solo voltea la fila S/T del lado que actua.
 *
 * Se ejecutan con el runner de Node sobre los tipos directamente:
 *   npm test --workspace @yfm/engine
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CARD_TYPE_MAGIC,
  EFFECT_GROUP_BOARD_DESTRUCTION,
  EFFECT_GROUP_CURSEBREAKER,
  EFFECT_GROUP_DARK_PIERCING_LIGHT,
  EFFECT_GROUP_DIRECT_DAMAGE,
  EFFECT_GROUP_HARPIES_FEATHER_DUSTER,
  EFFECT_GROUP_LIFE_POINT_RECOVERY,
  EFFECT_GROUP_MONSTER_REMOVAL,
  EFFECT_GROUP_NONE,
  EFFECT_GROUP_RAIGEKI,
  EFFECT_GROUP_RITUAL,
  EFFECT_GROUP_STAT_PENALTY,
  EFFECT_GROUP_STOP_DEFENSE,
  EFFECT_GROUP_SWORDS,
  EFFECT_GROUP_TERRAIN,
  MONSTER_REMOVAL_RULES,
  MONSTER_REMOVAL_TYPE_LIMIT,
  RITUAL_RECIPES,
  Rng,
  TERRAIN_NAMES,
  TERRAIN_STAT_ADJUSTMENT,
  THRESHOLD_TOTAL,
  applySpell,
  card,
  cardName,
  effectGroupForCardId,
  matchRitualTributes,
  starterDeckCardIds,
  tributeMatches,
  validateDeck,
} from '../src/index.js';
import { applyDarkPiercingLight } from '../src/effects.js';
import { createDuel } from '../src/state.js';
import { startDuel, applyAction } from '../src/engine.js';
import type { DuelState, FieldCard, Side, SideState } from '../src/types.js';
import { withBackRow, withHand, withLifePoints, withMonsters } from './helpers.js';

/* ------------------------------------------------------------ Utilidad ----- */

/** Generador que cuenta cuantos valores del retail consume. */
class CountingRng extends Rng {
  calls = 0;

  override next(): number {
    this.calls += 1;
    return super.next();
  }
}

/** Construye una carta de campo para las pruebas. */
function field(cardId: number, slot: number, side: Side, extra: Partial<FieldCard> = {}): FieldCard {
  return {
    cardId,
    slot,
    side,
    defensePosition: false,
    faceDown: false,
    useStar2: false,
    statModifier: 0,
    terrainModifier: 0,
    equipId: null,
    usedThisTurn: false,
    ...extra,
  };
}

/** Los ids de las cartas que quedan en una fila, en orden de zona. */
function idsIn(row: readonly (FieldCard | null)[]): number[] {
  const ids: number[] = [];
  for (const entry of row) if (entry !== null) ids.push(entry.cardId);
  return ids;
}

/** Un duelo de campo, sin manos ni mazos: solo lo que cada prueba necesita. */
function bareDuel(): DuelState {
  return startDuel(createDuel(1, [new Array<number>(40).fill(1), new Array<number>(40).fill(1)]));
}

function replaceIn(state: DuelState, side: Side, value: SideState): DuelState {
  return { ...state, sides: side === 0 ? [value, state.sides[1]] : [state.sides[0], value] };
}

/** Pone una fila de monstruos en un lado. */
function monstersOn(state: DuelState, side: Side, monsters: readonly (FieldCard | null)[]): DuelState {
  return replaceIn(state, side, withMonsters(state.sides[side], monsters));
}

/** Pone una fila de S/T en un lado. */
function backRowOn(state: DuelState, side: Side, cards: readonly (FieldCard | null)[]): DuelState {
  return replaceIn(state, side, withBackRow(state.sides[side], cards));
}

function handOn(state: DuelState, side: Side, cards: readonly number[]): DuelState {
  return replaceIn(state, side, withHand(state.sides[side], cards));
}

/**
 * El escenario comun de los tests de efecto: el jugador 0 actua y los dos lados
 * tienen un dragon (Blue-eyes) y un no dragon (Kuriboh) en monstruos, y una
 * trampa en S/T. El jugador 0 tiene vida que curar y el rival vida que perder.
 */
function effectState(): DuelState {
  let state = bareDuel();
  state = monstersOn(state, 0, [field(1, 0, 0), field(58, 1, 0)]);
  state = monstersOn(state, 1, [field(1, 0, 1), field(58, 1, 1)]);
  state = backRowOn(state, 0, [field(681, 0, 0, { faceDown: true })]);
  state = backRowOn(state, 1, [field(681, 0, 1, { faceDown: true })]);
  state = replaceIn(state, 0, withLifePoints(state.sides[0], 2000));
  state = replaceIn(state, 1, withLifePoints(state.sides[1], 8000));
  return state;
}

/** La etiqueta del ultimo evento de efecto. */
function effectLabel(state: DuelState): string {
  const last = state.events[state.events.length - 1];
  return last !== undefined && last.type === 'effect' ? last.label : '';
}

/* ---------------------------------------------------- 1. Umbral y pesos ---- */

describe('sorteo con umbral del retail', () => {
  it('threshold() cae siempre en 1..2048', () => {
    assert.equal(THRESHOLD_TOTAL, 2048);
    const rng = new Rng(0x55555555);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 20000; i += 1) {
      const value = rng.threshold();
      assert.ok(Number.isInteger(value));
      assert.ok(value >= 1 && value <= 2048, `fuera de rango: ${value}`);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    // Los dos extremos tienen que aparecer: prueban que el `+ 1` y la mascara
    // estan donde dicen.
    assert.equal(min, 1);
    assert.equal(max, 2048);
  });

  it('threshold() es (rand() & 0x7FF) + 1, valor a valor', () => {
    // Se replica a mano contra el LCG, sin llamar a threshold(), para que un
    // cambio en la mascara o en el desplazamiento se vea aqui.
    const mirror = new Rng(0x55555555);
    const expected: number[] = [];
    for (let i = 0; i < 50; i += 1) expected.push((mirror.next() & 0x7ff) + 1);

    const rng = new Rng(0x55555555);
    for (const value of expected) assert.equal(rng.threshold(), value);
  });

  it('threshold() consume un valor cada vez, como rand()', () => {
    const rng = new CountingRng(99);
    rng.threshold();
    rng.threshold();
    assert.equal(rng.calls, 2);
  });

  it('weightedPick devuelve -1 cuando ningun peso alcanza el umbral', () => {
    const rng = new Rng(3);
    // Tabla vacia.
    assert.equal(rng.weightedPick([]), -1);
    // Total 0: ningun acumulado llega ni a 1.
    assert.equal(rng.weightedPick([0, 0, 0]), -1);
    // Fila editada que no suma 2048: el umbral puede caerse fuera del todo. El
    // retail tampoco reintenta ni renormaliza (`notes/rng.md`, lineas 135-145).
    assert.equal(rng.weightedPick([10, 10]), -1);
  });

  it('weightedPick no renombra el umbral: un peso que cubre el total gana siempre', () => {
    const rng = new Rng(5);
    // El primer peso ya alcanza cualquier umbral de 1..2048, asi que el
    // segundo es inalcanzable. Es el comportamiento del retail, no un fallo.
    for (let i = 0; i < 50; i += 1) assert.equal(rng.weightedPick([2048, 2048]), 0);
  });

  it('weightedPick es determinista con semilla fija y reparte segun los pesos', () => {
    const draw = (seed: number, weights: readonly number[], times: number): number[] => {
      const rng = new Rng(seed);
      const picks: number[] = [];
      for (let i = 0; i < times; i += 1) picks.push(rng.weightedPick(weights));
      return picks;
    };

    const weights = [1024, 1024];
    const a = draw(0x55555555, weights, 2000);
    const b = draw(0x55555555, weights, 2000);
    assert.deepEqual(a, b, 'misma semilla, misma secuencia');

    // 1024 de 2048 para cada uno: la mitad de las veces cae en el segundo.
    const second = a.filter((index) => index === 1).length;
    assert.ok(Math.abs(second - 1000) < 100, `reparto inesperado: ${second} de 2000`);

    // Y un peso cero nunca se elige.
    assert.ok(draw(1, [0, 2048], 200).every((index) => index === 1));
  });

  it('weightedPick consume un solo valor por sorteo', () => {
    // A diferencia del generador del mazo inicial, el recorrido no gasta un
    // valor por peso examinado: es el selector de drops del retail.
    const rng = new CountingRng(11);
    rng.weightedPick([1, 1, 1, 1, 1, 1, 1, 1]);
    assert.equal(rng.calls, 1);
  });
});

/* --------------------------------------------- 2. Mazo inicial --------------- */

describe('mazo inicial: el algoritmo del retail', () => {
  it('la misma semilla da el mismo mazo, y semillas distintas dan mazos distintos', () => {
    assert.deepEqual(starterDeckCardIds(new Rng(7)), starterDeckCardIds(new Rng(7)));
    assert.notDeepEqual(starterDeckCardIds(new Rng(7)), starterDeckCardIds(new Rng(8)));
  });

  it('reparte 40 cartas validas con muchas semillas distintas', () => {
    // El retail comprueba solo el limite de tres copias, asi que su mazo puede
    // llevar dos piezas de Exodia. El reintento de aqui usa el limite legal de
    // cada carta (`copyLimitFor`), asi que el mazo generado siempre es valido.
    for (let seed = 1; seed <= 200; seed += 1) {
      const deck = starterDeckCardIds(new Rng(seed));
      assert.equal(deck.length, 40, `semilla ${seed}`);
      assert.equal(validateDeck(deck), null, `semilla ${seed}`);
    }
  });

  it('admite hasta tres copias, que el retail si tiene y el muestreo sin repetidos no', () => {
    const copies = new Map<number, number>();
    for (const cardId of starterDeckCardIds(new Rng(8))) {
      copies.set(cardId, (copies.get(cardId) ?? 0) + 1);
    }
    assert.equal(Math.max(...copies.values()), 3);
  });

  it('gasta un valor por peso examinado: elegir la carta n cuesta n + 1 valores', () => {
    // Sin reintentos, el total es la suma de (cardId + 1) de las 40 cartas. No
    // hay reintentos si ninguna carta llega a tres copias, porque un reintento
    // solo ocurre al rechazar una cuarta.
    const rng = new CountingRng(7);
    const deck = starterDeckCardIds(rng);
    const copies = new Map<number, number>();
    for (const cardId of deck) copies.set(cardId, (copies.get(cardId) ?? 0) + 1);
    assert.ok(![...copies.values()].includes(3), 'esta semilla no llega a tres copias');

    const expected = deck.reduce((total, cardId) => total + cardId + 1, 0);
    assert.equal(rng.calls, expected);
  });

  it('reintenta el intento entero cuando una carta llega a su cuarta copia', () => {
    // Aqui hay reintentos, asi que se gastan mas valores que esa suma.
    const rng = new CountingRng(4);
    const deck = starterDeckCardIds(rng);
    const expected = deck.reduce((total, cardId) => total + cardId + 1, 0);
    assert.ok(rng.calls > expected, `sin reintento: ${rng.calls} contra ${expected}`);
  });

  it('solo reparte de las siete filas y nunca toca 721 ni 722', () => {
    // El retail recorre los indices 0..719 de una fila de 722 pesos
    // (`STARTER_DECK_WEIGHT_SCAN_COUNT`), asi que Dark Magic Ritual y
    // Magician of Black Chaos no pueden salir de un mazo inicial.
    for (let seed = 1; seed <= 50; seed += 1) {
      for (const cardId of starterDeckCardIds(new Rng(seed))) {
        assert.ok(cardId <= 720, `la semilla ${seed} saca la carta ${cardId}`);
      }
    }
  });
});

/* --------------------------------------- 3. Despacho por grupo de efecto ---- */

/** Las 33 Magias con efecto propio, tal y como las cuenta el retail. */
function effectSpells(): number[] {
  const spells: number[] = [];
  for (let cardId = 1; cardId <= 722; cardId += 1) {
    if (card(cardId)?.type !== CARD_TYPE_MAGIC) continue;
    if (effectGroupForCardId(cardId) === EFFECT_GROUP_NONE) continue;
    spells.push(cardId);
  }
  return spells;
}

/** Que monstruos rivales sobreviven a una carta de eliminacion. */
function monsterRemovalSurvivors(cardId: number): number[] {
  const rule = MONSTER_REMOVAL_RULES.find(([base]) => base + 600 === cardId);
  assert.ok(rule !== undefined, `${cardId} deberia tener regla de eliminacion`);
  const selector = rule[1];
  const byAttack = selector >= MONSTER_REMOVAL_TYPE_LIMIT;
  return [1, 58].filter((id) => {
    const data = card(id);
    if (data === undefined) return false;
    return byAttack ? data.attack < selector * 10 : data.type !== selector;
  });
}

describe('despacho de efectos por grupo', () => {
  it('la tabla generada cubre exactamente las 33 Magias con efecto', () => {
    assert.deepEqual(effectSpells(), [
      320, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347,
      348, 349, 350, 653, 655, 656, 660, 661, 662, 663, 664, 669, 672,
    ]);
  });

  it('los 24 rituales caen en el grupo 12 y ninguna Magia cae en el', () => {
    const rituals = RITUAL_RECIPES.map((recipe) => recipe.ritualId);
    assert.equal(rituals.length, 24);
    for (const ritualId of rituals) assert.equal(effectGroupForCardId(ritualId), EFFECT_GROUP_RITUAL);
  });

  it('el comportamiento del motor sigue al grupo de la tabla para las 33 Magias', () => {
    // Una comprobacion por grupo, aplicada a cada carta que la tabla mete en el.
    // Si el motor decidiera por id de carta en vez de por grupo, alguna de estas
    // comprobaciones caeria.
    for (const cardId of effectSpells()) {
      const state = effectState();
      const next = applySpell(state, 0, cardId);
      const label = `${cardId} (${cardName(cardId) ?? '?'})`;

      switch (effectGroupForCardId(cardId)) {
        case EFFECT_GROUP_TERRAIN:
          // Los seis terrenos anuncian el terreno y recalculan el modificador de
          // los monstruos en juego. El estado no guarda cual es el terreno
          // activo (eso ya era asi antes de que el despacho fuera por grupo), asi
          // que lo que se comprueba aqui es el efecto que se ve.
          assert.equal(effectLabel(next), `Terreno: ${TERRAIN_NAMES[cardId - 329]}`, label);
          break;

        case EFFECT_GROUP_LIFE_POINT_RECOVERY:
          // Curacion al propio lado, y solo al propio lado.
          assert.ok(next.sides[0].lifePoints > state.sides[0].lifePoints, label);
          assert.equal(next.sides[1].lifePoints, state.sides[1].lifePoints, label);
          break;

        case EFFECT_GROUP_DIRECT_DAMAGE:
          assert.ok(next.sides[1].lifePoints < state.sides[1].lifePoints, label);
          assert.equal(next.sides[0].lifePoints, state.sides[0].lifePoints, label);
          break;

        case EFFECT_GROUP_BOARD_DESTRUCTION:
          // Dark Hole se lleva todo; Dragon Capture Jar solo los dragones rivales.
          if (cardId === 336) {
            assert.deepEqual(idsIn(next.sides[0].monsters), [], label);
            assert.deepEqual(idsIn(next.sides[1].monsters), [], label);
            assert.deepEqual(idsIn(next.sides[0].backRow), [], label);
            assert.deepEqual(idsIn(next.sides[1].backRow), [], label);
          } else {
            assert.deepEqual(idsIn(next.sides[0].monsters), [1, 58], label);
            assert.deepEqual(idsIn(next.sides[1].monsters), [58], label);
            assert.deepEqual(idsIn(next.sides[0].backRow), [681], label);
            assert.deepEqual(idsIn(next.sides[1].backRow), [681], label);
          }
          break;

        case EFFECT_GROUP_MONSTER_REMOVAL:
          // Nunca toca el campo propio: solo la fila de monstruos del rival, y
          // solo los que pide la tabla de eliminacion del retail.
          assert.deepEqual(idsIn(next.sides[0].monsters), [1, 58], label);
          assert.deepEqual(idsIn(next.sides[1].monsters), monsterRemovalSurvivors(cardId), label);
          assert.deepEqual(idsIn(next.sides[1].backRow), [681], label);
          break;

        case EFFECT_GROUP_STOP_DEFENSE: {
          const defending = replaceIn(state, 1, withMonsters(state.sides[1], [
            field(58, 0, 1, { defensePosition: true }),
          ]));
          const flipped = applySpell(defending, 0, cardId);
          assert.equal(flipped.sides[1].monsters[0]?.defensePosition, false, label);
          break;
        }

        case EFFECT_GROUP_RAIGEKI:
          // Monstruos rivales y nada mas.
          assert.deepEqual(idsIn(next.sides[0].monsters), [1, 58], label);
          assert.deepEqual(idsIn(next.sides[1].monsters), [], label);
          assert.deepEqual(idsIn(next.sides[1].backRow), [681], label);
          break;

        case EFFECT_GROUP_DARK_PIERCING_LIGHT:
          // Solo la fila S/T del lado que actua, nada de monstruos.
          assert.deepEqual(idsIn(next.sides[0].monsters), [1, 58], label);
          assert.equal(next.sides[0].backRow[0]?.faceDown, false, label);
          assert.equal(next.sides[1].backRow[0]?.faceDown, true, label);
          break;

        case EFFECT_GROUP_STAT_PENALTY:
          // Spellbinding Circle quita un nivel, Shadow Spell dos. Solo al rival.
          assert.equal(next.sides[1].monsters[0]?.statModifier, cardId === 349 ? -500 : -1000, label);
          assert.equal(next.sides[0].monsters[0]?.statModifier, 0, label);
          break;

        case EFFECT_GROUP_SWORDS:
          assert.equal(next.sides[1].swordsTurnsRemaining, 4, label);
          assert.equal(next.sides[0].backRow[0]?.faceDown, true, label);
          break;

        case EFFECT_GROUP_CURSEBREAKER: {
          // Solo toca el campo propio: la penalizacion del rival se queda.
          const penalised = monstersOn(state, 0, [
            field(1, 0, 0, { statModifier: -1000 }),
            field(58, 1, 0),
          ]);
          const rival = monstersOn(state, 1, [
            field(1, 0, 1, { statModifier: -1000 }),
            field(58, 1, 1),
          ]);
          const cleared = applySpell({ ...penalised, sides: rival.sides }, 0, cardId);
          assert.equal(cleared.sides[1].monsters[0]?.statModifier, -1000, label);
          break;
        }

        case EFFECT_GROUP_HARPIES_FEATHER_DUSTER:
          assert.deepEqual(idsIn(next.sides[1].backRow), [], label);
          assert.deepEqual(idsIn(next.sides[0].backRow), [681], label);
          assert.deepEqual(idsIn(next.sides[1].monsters), [1, 58], label);
          break;

        default:
          assert.fail(`grupo inesperado en ${label}`);
      }
    }
  });

  it('una Magia sin grupo propio se gasta sin hacer nada en el tablero', () => {
    // Un equip (301) y una trampa (681) no entran por la tabla de efectos: el
    // grupo 0 es `DuelEffect_ClearCardEffect`. Solo suma el contador.
    const state = effectState();
    for (const cardId of [301, 681]) {
      const next = applySpell(state, 0, cardId);
      assert.deepEqual(idsIn(next.sides[0].monsters), idsIn(state.sides[0].monsters), `${cardId}`);
      assert.deepEqual(idsIn(next.sides[1].monsters), idsIn(state.sides[1].monsters), `${cardId}`);
      assert.deepEqual(idsIn(next.sides[0].backRow), idsIn(state.sides[0].backRow), `${cardId}`);
      assert.deepEqual(idsIn(next.sides[1].backRow), idsIn(state.sides[1].backRow), `${cardId}`);
      assert.equal(next.sides[0].lifePoints, state.sides[0].lifePoints, `${cardId}`);
      assert.equal(next.sides[1].lifePoints, state.sides[1].lifePoints, `${cardId}`);
      assert.equal(next.sides[0].stats.spellsUsed, state.sides[0].stats.spellsUsed + 1);
    }
  });
});

/* ------------------------------------------------- 4. Modelo de ritual ----- */

describe('modelo de tributo de ritual', () => {
  it('solo tres recetas estan confirmadas, y las otras 21 no', () => {
    const confirmed = RITUAL_RECIPES.filter((recipe) => recipe.confirmed).map((recipe) => recipe.ritualId);
    assert.deepEqual(confirmed, [670, 675, 721]);
    assert.equal(RITUAL_RECIPES.filter((recipe) => !recipe.confirmed).length, 21);
  });

  it('una receta confirmada con ids conocidos lleva los tres tributos exactos', () => {
    // 721 queda aparte: de ella solo se conoce el resultado, no los tributos.
    const exactOnes = RITUAL_RECIPES.filter((recipe) => recipe.confirmed && recipe.ritualId !== 721);
    assert.deepEqual(exactOnes.map((recipe) => recipe.ritualId), [670, 675]);
    for (const recipe of exactOnes) {
      assert.equal(recipe.tributes.length, 3);
      for (const tribute of recipe.tributes) assert.equal(tribute.kind, 'exact', `${recipe.ritualId}`);
    }
  });

  it('721 es la unica confirmada con un tributo aproximado, porque sus ids estan en el disco', () => {
    const darkMagic = RITUAL_RECIPES.find((recipe) => recipe.ritualId === 721);
    assert.ok(darkMagic !== undefined);
    assert.equal(darkMagic.confirmed, true);
    assert.equal(darkMagic.resultId, 722);
    for (const tribute of darkMagic.tributes) assert.equal(tribute.kind, 'approximate');
  });

  it('solo 667, 670 y 675 tienen los tres tributos exactos', () => {
    // Las otras 22 dependen de ids que estan en el disco, asi que llevan al menos
    // un tributo aproximado. 667 es el caso raro: el texto de la carta nombra a
    // Kazejin, Suijin y Sanga, y esos ids si se pueden escribir, pero la receta
    // no esta confirmada.
    const allExact = RITUAL_RECIPES.filter(
      (recipe) => recipe.tributes.every((tribute) => tribute.kind === 'exact'),
    );
    assert.deepEqual(allExact.map((recipe) => recipe.ritualId), [667, 670, 675]);

    const approximated = RITUAL_RECIPES.filter(
      (recipe) => recipe.tributes.some((tribute) => tribute.kind === 'approximate'),
    );
    assert.equal(approximated.length, 21);
    assert.equal(RITUAL_RECIPES.length, 24);
  });

  it('el tributo exacto compara solo el id, sin mirar tipo ni ATK', () => {
    // 166 es Mysterious Puppeteer y 12 es Swamp Battleguard: los dos son
    // Warriors, asi que un matcher por tipo los confundiria. El exacto no.
    assert.equal(tributeMatches(field(166, 0, 0), { kind: 'exact', cardId: 166 }), true);
    assert.equal(tributeMatches(field(12, 0, 0), { kind: 'exact', cardId: 166 }), false);
    assert.equal(tributeMatches(field(12, 0, 0), { kind: 'approximate', type: 3 }), true);
  });

  it('el tributo aproximado sin condiciones admite cualquier monstruo', () => {
    for (const cardId of [1, 58, 372]) {
      assert.equal(tributeMatches(field(cardId, 0, 0), { kind: 'approximate' }), true);
    }
  });

  it('la receta confirmada 670 pide sus tres ids exactos', () => {
    const tributes = [field(27, 0, 0), field(38, 1, 0), field(58, 2, 0)];
    assert.deepEqual(matchRitualTributes(tributes, 670)?.map((f) => f.cardId), [27, 38, 58]);
    // Cambiando cualquiera de los tres por otro monstruo, ya no se cumple.
    const wrong = [field(27, 0, 0), field(38, 1, 0), field(39, 2, 0)];
    assert.equal(matchRitualTributes(wrong, 670), null);
  });

  it('el emparejamiento toma un tributo exacto por id y no por parecido', () => {
    // 695 pide a Mysterious Puppeteer (exacto) y dos Machines. 12 y 166 son
    // Warriors y 124 (Ancient Tool) es un Machine: sin el Puppeteer en el campo
    // la receta no se cumple, aunque las otras dos cartas sirvan.
    const withoutPuppet = [field(12, 0, 0), field(124, 1, 0), field(124, 2, 0)];
    assert.equal(matchRitualTributes(withoutPuppet, 695), null);

    const withPuppet = [field(124, 0, 0), field(166, 1, 0), field(124, 2, 0)];
    assert.deepEqual(matchRitualTributes(withPuppet, 695)?.map((f) => f.cardId), [166, 124, 124]);
  });

  it('cada tributo toma una carta distinta del campo', () => {
    // 675 pide tres Blue-eyes: hacen falta tres cartas en el campo.
    assert.equal(matchRitualTributes([field(1, 0, 0), field(58, 1, 0), field(1, 2, 0)], 675), null);

    const three = [field(1, 0, 0), field(1, 1, 0), field(1, 2, 0)];
    assert.equal(matchRitualTributes(three, 675)?.length, 3);
  });

  it('sin receta no hay emparejamiento', () => {
    assert.equal(matchRitualTributes([field(1, 0, 0), field(1, 1, 0), field(1, 2, 0)], 0), null);
  });
});

/* ------------------------------------------ 5. Dark-piercing Light --------- */

describe('Dark-piercing Light', () => {
  it('solo voltea la fila S/T del lado que actua', () => {
    // El retail recorre `for (i = DUEL_FIELD_ROW_SIZE; i < DUEL_CARD_SIDE_RECORD_COUNT; i++)`
    // sobre el lado en turno: la segunda fila de ESE lado, no las de los dos
    // lados ni las de monstruos (`DuelEffect_ApplyDarkPiercingLight`).
    let state = bareDuel();
    state = backRowOn(state, 0, [field(681, 0, 0, { faceDown: true }), field(682, 1, 0, { faceDown: true })]);
    state = backRowOn(state, 1, [field(681, 0, 1, { faceDown: true })]);
    state = monstersOn(state, 0, [field(1, 0, 0, { faceDown: true })]);
    state = monstersOn(state, 1, [field(1, 0, 1, { faceDown: true })]);
    assert.equal(state.turn, 0, 'el escenario arranca en el turno del jugador 0');

    const next = applyDarkPiercingLight(state, 0);

    // La fila S/T propia es la que se revela, entera.
    assert.equal(next.sides[0].backRow[0]?.faceDown, false);
    assert.equal(next.sides[0].backRow[1]?.faceDown, false);
    // La del rival no se toca: solo estaba en turno el lado propio.
    assert.equal(next.sides[1].backRow[0]?.faceDown, true);
    // Ninguna fila de monstruos se revela, ni propia ni rival.
    assert.equal(next.sides[0].monsters[0]?.faceDown, true);
    assert.equal(next.sides[1].monsters[0]?.faceDown, true);
  });

  it('juegado por el otro lado revela la fila S/T de ese otro lado', () => {
    let state = bareDuel();
    state = backRowOn(state, 0, [field(681, 0, 0, { faceDown: true })]);
    state = backRowOn(state, 1, [field(681, 0, 1, { faceDown: true })]);
    const onTurnOne: DuelState = { ...state, turn: 1 };

    const next = applyDarkPiercingLight(onTurnOne, onTurnOne.turn);

    assert.equal(next.sides[1].backRow[0]?.faceDown, false);
    assert.equal(next.sides[0].backRow[0]?.faceDown, true);
  });

  it('la carta sale del grupo 8 y no toca nada mas', () => {
    assert.equal(effectGroupForCardId(350), EFFECT_GROUP_DARK_PIERCING_LIGHT);
    const state = effectState();
    const next = applySpell(state, 0, 350);
    assert.equal(next.sides[0].backRow[0]?.faceDown, false);
    assert.equal(next.sides[1].backRow[0]?.faceDown, true);
    assert.deepEqual(idsIn(next.sides[0].monsters), [1, 58]);
    assert.deepEqual(idsIn(next.sides[1].monsters), [1, 58]);
  });
});

/* --------------------------------------------- Terreno y Cursebreaker ------ */

/*
 * Los dos que hay aqui no salieron de comparar con el decompilado: los dos
 * estaban rotos sin que se notara. Sehzalan porque `applyTerrain` solo
 * recalculaba los monstruos que ya estaban en el campo y `applyCursebreaker`
 * se quedaba siempre en el propio modificador, con lo que la carta no hacia
 * nada. Los dos son familias de efecto que el README da por implementadas.
 */
describe('terreno y Cursebreaker, que estaban rotos sin que se notara', () => {
  it('el terreno se guarda en el estado, no solo se recalcula el campo', () => {
    // `makeFieldCard` lee `state.terrain` al entrar una carta. Si `applyTerrain`
    // no lo escribe, todo monstruo invocado despues entra sin bonificacion.
    const state = bareDuel();
    const next = applySpell(state, 0, 330);
    assert.equal(next.terrain, 1, 'el terreno activo queda en el estado');
    assert.equal(state.terrain, 0, 'el estado anterior no se toca');
  });

  it('un monstruo que entra con terreno puesto se lleva la bonificacion', () => {
    // Por el flujo real: se juega la carta de terreno desde la mano y luego se
    // invoca un monstruo. Que `applyTerrain` escriba el terreno es lo que hace
    // que el segundo paso entre ya bonificado.
    //
    // 330 es el terreno 1, y `TERRAIN_BOOST[1][0]` solo bonifica a los tipos
    // 4, 5, 8 y 18. Por eso el monstruo es el 3 (Beast-Warrior) y no un Dragon:
    // un Dragon entra legitimamente sin bonificacion en ese terreno.
    let state = bareDuel();
    state = handOn(state, 0, [330, 3]);
    state = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));
    assert.equal(state.terrain, 1, 'el terreno quedo activo');
    state = applyAction(state, { type: 'summon', cardIndex: 0, slot: 0, useStar2: false }, new Rng(1));
    assert.equal(idsIn(state.sides[0].monsters)[0], 3, 'el monstruo entro en el campo');
    assert.equal(
      state.sides[0].monsters[0]?.terrainModifier,
      TERRAIN_STAT_ADJUSTMENT,
      'el monstruo invocado despues del terreno entra ya bonificado',
    );
  });

  it('Cursebreaker levanta la penalizacion del monstruo propio', () => {
    let state = bareDuel();
    state = monstersOn(state, 0, [field(1, 0, 0, { statModifier: -1000 })]);
    const cleared = applySpell(state, 0, 655);
    assert.equal(cleared.sides[0].monsters[0]?.statModifier, 0, 'Spellbinding Circle levantada');
  });

  it('Cursebreaker respeta el bonus del equip al levantar la penalizacion', () => {
    // El caso que rompia la version anterior: con Spellbinding Circle (-1000) y
    // un equip (+500) el modificador es -500. El piso es el +500 del equip.
    let state = bareDuel();
    state = monstersOn(state, 0, [
      field(1, 0, 0, { statModifier: -500, equipId: 155 }),
    ]);
    const cleared = applySpell(state, 0, 655);
    assert.equal(cleared.sides[0].monsters[0]?.statModifier, 500, 'el equip sobrevive a Cursebreaker');
  });

  it('Cursebreaker con dos penalizaciones superpuestas deja el equip intacto', () => {
    let state = bareDuel();
    state = monstersOn(state, 0, [
      field(1, 0, 0, { statModifier: -1500, equipId: 155 }),
    ]);
    const cleared = applySpell(state, 0, 655);
    assert.equal(cleared.sides[0].monsters[0]?.statModifier, 500);
  });
});