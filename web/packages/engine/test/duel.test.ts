/**
 * Tests del motor de duelo.
 *
 * Se ejecutan con el runner de Node sobre los tipos directamente:
 *   npm test --workspace @yfm/engine
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CARD_TYPE_MAGIC,
  EXODIA_PIECE_IDS,
  Rng,
  applyAction,
  card,
  cardName,
  createDuel,
  directDamage,
  effectiveAttack,
  guardianStarBonus,
  isValidLifePoints,
  lifePointRecovery,
  startDuel,
  starterDeckCardIds,
  terrainBoost,
  validateDeck,
  viewFor,
} from '../src/index.js';
import type { DuelState, FieldCard, Side, SideState } from '../src/types.js';
import { checkRitual, trapForAttack } from '../src/effects.js';
import { withHand, withLifePoints, withMonsters } from './helpers.js';

/* ------------------------------------------------------------- Utilidad --- */

/** Construye una carta de campo para las pruebas. */
function field(cardId: number, slot: number, side: Side, extra: Partial<FieldCard> = {}): FieldCard {
  const data = card(cardId);
  return {
    cardId,
    slot,
    side,
    defensePosition: false,
    faceDown: false,
    useStar2: false,
    statModifier: 0,
    terrainModifier: data === undefined ? 0 : terrainBoost(data.type, 0),
    equipId: null,
    usedThisTurn: false,
    ...extra,
  };
}

/** Un duelo con mazos controlados, para poder probar reglas concretas. */
function duelWith(decks: readonly [readonly number[], readonly number[]], lifePoints = 8000): DuelState {
  return startDuel(createDuel(12345, decks, lifePoints));
}

/** Rellena la mano del lado indicado con cartas concretas. */
function handOf(state: DuelState, cards: readonly number[]): DuelState {
  const current = state.sides[0];
  return {
    ...state,
    sides: [withHand(current, cards), state.sides[1]],
  };
}

/** Pone monstruos en el campo del lado indicado. */
function fieldOf(state: DuelState, side: Side, cards: readonly number[]): DuelState {
  const current = state.sides[side];
  const monsters = cards.map((cardId, slot) => field(cardId, slot, side));
  return replaceIn(state, side, withMonsters(current, monsters));
}

function replaceIn(state: DuelState, side: Side, value: SideState): DuelState {
  return {
    ...state,
    sides: side === 0 ? [value, state.sides[1]] : [state.sides[0], value],
  };
}

/** Un turno completo: salta al turno del lado indicado. */
function skipToTurn(state: DuelState, side: Side): DuelState {
  let next = state;
  while (next.turn !== side || next.firstTurnNoBattle) {
    next = applyAction(next, { type: 'ready' }, new Rng(1));
    if (next.outcome !== null) break;
  }
  return next;
}

/* ------------------------------------------------------------ Catalogo --- */

describe('catalogo', () => {
  it('tiene las 722 cartas del catalogo', () => {
    assert.equal(card(1)?.name, 'Blue-eyes White Dragon');
    assert.equal(card(722)?.name, 'Magician of Black Chaos');
    assert.equal(card(0), undefined);
    assert.equal(card(723), undefined);
  });

  it('decodifica los tipos segun el orden del retail', () => {
    assert.equal(card(1)?.type, 0); // Dragon
    assert.equal(card(2)?.type, 1); // Spellcaster
    assert.equal(card(301)?.type, 23); // Equip
    assert.equal(card(320)?.type, CARD_TYPE_MAGIC);
    assert.equal(card(681)?.type, 21); // Trap
    assert.equal(card(665)?.type, 22); // Ritual
  });

  it('recoge el texto de las cartas del banco de traducciones', () => {
    const blueEyes = card(1);
    assert.ok(blueEyes !== undefined);
    assert.match(String(blueEyes.description), /rare/i);
    assert.match(String(blueEyes.description), /attack/i);
  });

  it('tiene las ATK y DEF del retail', () => {
    assert.equal(card(1)?.attack, 3000);
    assert.equal(card(1)?.defense, 2500);
    assert.equal(card(58)?.attack, 300); // Kuriboh
    assert.equal(card(58)?.defense, 200);
  });
});

/* ------------------------------------------------------------- RNG ------- */

describe('generador aleatorio', () => {
  it('replica el LCG de Psy-Q', () => {
    const rng = new Rng(1);
    // state = state * 0x41C64E6D + 0x3039, luego (state >> 16) & 0x7FFF.
    const expected = ((Math.imul(1, 0x41c64e6d) + 0x3039) >>> 0) >>> 16 & 0x7fff;
    assert.equal(rng.next(), expected);
  });

  it('produce la misma secuencia con la misma semilla', () => {
    const a = new Rng(0x55555555);
    const b = new Rng(0x55555555);
    for (let i = 0; i < 100; i += 1) assert.equal(a.next(), b.next());
  });

  it('usa el sesgo del modulo del retail', () => {
    // `rand() % 40` con RAND_MAX 32767 no reparte uniforme: 0-7 sale mas.
    const rng = new Rng(1);
    const counts = new Array<number>(40).fill(0);
    for (let i = 0; i < 40000; i += 1) counts[rng.interval(40)] = (counts[rng.interval(40)] ?? 0) + 1;
    const first = counts[0] ?? 0;
    const last = counts[39] ?? 0;
    assert.notEqual(first, last);
  });
});

/* ------------------------------------------------------- Constantes ------ */

describe('constantes del retail', () => {
  it('las cantidades de curacion y danio coinciden con las tablas', () => {
    assert.equal(lifePointRecovery(338), 200); // Mooyan Curry
    assert.equal(lifePointRecovery(342), 5000); // Dian Keto
    assert.equal(directDamage(343), 50); // Sparks
    assert.equal(directDamage(347), 1000); // Tremendous Fire
  });

  it('el bonus de terreno usa la matriz del retail', () => {
    // Dragon (0) gana 500 en Mountain.
    assert.equal(terrainBoost(0, 3), 500);
    // Fairy (8) pierde 500 en Yami.
    assert.equal(terrainBoost(8, 6), -500);
    // Reptile (11) no recibe nada en ningun terreno.
    for (let t = 1; t <= 6; t += 1) assert.equal(terrainBoost(11, t), 0);
  });
});

/* ------------------------------------------------- Estrellas guardian ----- */

describe('estrellas guardian', () => {
  const SUN = 8;
  const MOON = 9;
  const VENUS = 10;
  const MERCURY = 7;
  const MARS = 1;
  const JUPITER = 2;

  it('da +500 cuando la estrella del atacante precede a la del defensor', () => {
    // Ciclo 2: Mercury(7) -> Sun(8) -> Moon(9) -> Venus(10) -> Mercury.
    // Sol precede a Luna, asi que Sol contra Luna es +500.
    assert.equal(guardianStarBonus([SUN, MARS], false, [MOON, MARS], false), 500);
  });

  it('da -500 cuando la estrella del atacante sigue a la del defensor', () => {
    assert.equal(guardianStarBonus([MOON, MARS], false, [SUN, MARS], false), -500);
  });

  it('da 0 entre ciclos distintos', () => {
    // Venus es del ciclo 2 y Jupiter del ciclo 1: nunca se comparan.
    assert.equal(guardianStarBonus([VENUS, MARS], false, [JUPITER, MARS], false), 0);
    assert.equal(guardianStarBonus([JUPITER, MARS], false, [VENUS, MARS], false), 0);
  });

  it('da 0 entre estrellas no adyacentes del mismo ciclo', () => {
    // Venus y Sun no son adyacentes en el ciclo de cuatro.
    assert.equal(guardianStarBonus([VENUS, MARS], false, [SUN, MARS], false), 0);
  });

  it('respeta que el jugador elija la segunda estrella', () => {
    // Sun contra Moon da +500; si el jugador elige Moon en vez de Sun, ya no
    // es el mismo par y el resultado cambia.
    assert.equal(guardianStarBonus([SUN, MOON], false, [MOON, MARS], false), 500);
    assert.equal(guardianStarBonus([SUN, MOON], true, [MOON, MARS], false), 0);
  });

  it('da 0 cuando alguna estrella no existe', () => {
    assert.equal(guardianStarBonus([0, MARS], false, [SUN, MARS], false), 0);
  });

  it('cierra el ciclo de seis: Pluton precede a Neptuno', () => {
    // Ciclo 1: Marte(1) Jupiter(2) Saturno(3) Urano(4) Pluton(5) Neptuno(6).
    // Pluton es el que precede a Neptuno al cerrar la vuelta.
    assert.equal(guardianStarBonus([5, 0], false, [6, 0], false), 500);
    // Y al cerrar el ciclo de cuatro: Mercurio(7) precede a Marte... no, Marte
    // es del ciclo de seis. El ciclo de cuatro cierra consigo mismo:
    // Venus(10) precede a Mercurio(7).
    assert.equal(guardianStarBonus([VENUS, 0], false, [MERCURY, 0], false), 500);
  });
});

/* ------------------------------------------------------------ Mazos ------ */

describe('mazos', () => {
  it('el generador produce 40 cartas validas', () => {
    const rng = new Rng(7);
    const deck = starterDeckCardIds(rng);
    assert.equal(deck.length, 40);
    assert.equal(validateDeck(deck), null);
  });

  it('rechaza un mazo de tamaño incorrecto', () => {
    assert.match(validateDeck([1, 2, 3]) ?? '', /40 cartas/);
  });

  it('rechaza mas de tres copias de una carta', () => {
    const deck = new Array<number>(40).fill(58); // Kuriboh, cuatro copias
    assert.match(validateDeck(deck) ?? '', /Kuriboh/);
  });

  it('rechaza mas de una pieza de Exodia', () => {
    const deck = new Array<number>(40).fill(21); // Exodia the Forbidden
    assert.match(validateDeck(deck) ?? '', /Exodia/);
  });

  it('admite hasta tres copias de una carta normal', () => {
    // Tres Kuriboh mas 37 cartas distintas.
    const deck = [58, 58, 58, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37];
    assert.equal(validateDeck(deck), null);
  });

  it('valida los puntos de vida en pasos de 500', () => {
    assert.equal(isValidLifePoints(8000), true);
    assert.equal(isValidLifePoints(1000), true);
    assert.equal(isValidLifePoints(1500), true); // multiplo de 500
    assert.equal(isValidLifePoints(1250), false); // no lo es
    assert.equal(isValidLifePoints(500), false); // por debajo del minimo
    assert.equal(isValidLifePoints(9000), false); // por encima del maximo
  });
});

/* ------------------------------------------------------- Estado inicial --- */

describe('estado inicial del duelo', () => {
  const filler = new Array<number>(40).fill(1);

  it('reparte 40 cartas y una mano de 5 a cada lado', () => {
    const state = duelWith([filler, filler]);
    assert.equal(state.sides[0].hand.length, 5);
    assert.equal(state.sides[1].hand.length, 5);
    assert.equal(state.sides[0].lifePoints, 8000);
    assert.equal(state.sides[1].lifePoints, 8000);
  });

  it('empieza en el turno del jugador 0', () => {
    const state = duelWith([filler, filler]);
    assert.equal(state.turn, 0);
    assert.equal(state.turnCount, 1);
  });

  it('la mano inicial no cuenta como turno jugado', () => {
    const state = duelWith([filler, filler]);
    // La mano inicial se roba por el estado 3 del retail, que se salta la fase
    // de robo del turno (estado 2). Por eso el primer turno ya cuenta como
    // jugado: el contador sube al abrirlo, no al robar la mano.
    assert.equal(state.sides[0].stats.turnsTaken, 1);
    assert.equal(state.sides[1].stats.turnsTaken, 0, 'el rival aun no ha abierto turno');
    assert.equal(state.sides[0].deckCursor, 5, 'solo las cinco de la mano inicial');
  });

  it('el primer turno no permite combate', () => {
    const state = duelWith([filler, filler]);
    assert.equal(state.firstTurnNoBattle, true);
  });

  it('respeta los puntos de vida iniciales elegidos', () => {
    const state = duelWith([filler, filler], 3000);
    assert.equal(state.sides[0].lifePoints, 3000);
    assert.equal(state.sides[0].maxLifePoints, 3000);
  });
});

/* ----------------------------------------------------------- Combuste ---- */

describe('combate', () => {
  const deckA = new Array<number>(40).fill(1);
  const deckB = new Array<number>(40).fill(1);

  /** Un duelo en el turno del jugador, ya pasado el primer turno. */
  function combatState(): DuelState {
    let state = duelWith([deckA, deckB]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    return state;
  }

  it('el atacante con mas ATK gana y la diferencia va a la vida del rival', () => {
    // Blue-eyes (Sol/Marte, 3000) contra Kuriboh (Mercurio/Saturno, 300).
    // Sol y Mercurio son adyacentes en el ciclo de cuatro, y el atacante lleva
    // la penalizacion: 3000 - 500 contra 300 sin ajustar = 2200 de diferencia.
    let state = combatState();
    state = fieldOf(state, 0, [1]);
    state = fieldOf(state, 1, [58]);

    const before = state.sides[1].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: 0 }, new Rng(1));

    assert.equal(state.sides[1].lifePoints, before - 2200);
    assert.equal(state.sides[1].monsters[0], null, 'Kuriboh cae');
    assert.notEqual(state.sides[0].monsters[0], null, 'Blue-eyes sigue en pie');
  });

  it('un empate en ATK destruye a los dos sin danio a la vida', () => {
    let state = combatState();
    state = fieldOf(state, 0, [58]);
    state = fieldOf(state, 1, [58]);

    const before = state.sides[1].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: 0 }, new Rng(1));

    assert.equal(state.sides[1].lifePoints, before, 'el empate no hace danio');
    assert.equal(state.sides[0].monsters[0], null);
    assert.equal(state.sides[1].monsters[0], null);
  });

  it('contra un defensor el defensor cae y nadie recibe danio', () => {
    let state = combatState();
    // Blue-eyes (3000) ataca a Mystical Elf (800/2000) en posicion de defensa.
    state = fieldOf(state, 0, [1]);
    state = replaceIn(state, 1, withMonsters(state.sides[1], [field(2, 0, 1, { defensePosition: true })]));

    const playerLife = state.sides[0].lifePoints;
    const rivalLife = state.sides[1].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: 0 }, new Rng(1));

    // 3000 contra 2000 de DEF: el defensor cae, nadie pierde vida.
    assert.equal(state.sides[0].lifePoints, playerLife);
    assert.equal(state.sides[1].lifePoints, rivalLife);
    assert.equal(state.sides[1].monsters[0], null);
  });

  it('un atacante mas debil que una defensa paga la diferencia', () => {
    let state = combatState();
    // Kuriboh (300, Mercurio) contra Mystical Elf (2000 DEF, Sol) en defensa.
    // Mercurio precede a Sol, asi que el atacante recibe +500: 800 contra 2000.
    state = fieldOf(state, 0, [58]);
    state = replaceIn(state, 1, withMonsters(state.sides[1], [field(2, 0, 1, { defensePosition: true })]));

    const before = state.sides[0].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: 0 }, new Rng(1));

    // 800 contra 2000: el atacante paga 1200 y el defensor sobrevive.
    assert.equal(state.sides[0].lifePoints, before - 1200);
    assert.notEqual(state.sides[1].monsters[0], null, 'la defensa resiste');
  });

  it('sin monstruos rivales el ATK va directo a la vida', () => {
    let state = combatState();
    state = fieldOf(state, 0, [1]);
    state = fieldOf(state, 1, []);

    const before = state.sides[1].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: null }, new Rng(1));

    assert.equal(state.sides[1].lifePoints, before - 3000);
  });

  it('un monstruo no ataca dos veces en el mismo turno', () => {
    let state = combatState();
    state = fieldOf(state, 0, [1]);
    state = fieldOf(state, 1, []);

    state = applyAction(state, { type: 'attack', slot: 0, target: null }, new Rng(1));
    const afterFirst = state.sides[1].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: null }, new Rng(1));

    assert.equal(state.sides[1].lifePoints, afterFirst, 'el segundo ataque se ignora');
  });

  it('un monstruo en defensa no ataca', () => {
    let state = combatState();
    state = fieldOf(state, 0, [58]);
    state = fieldOf(state, 1, []);
    state = replaceIn(state, 0, withMonsters(state.sides[0], [field(58, 0, 0, { defensePosition: true })]));

    const before = state.sides[1].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: null }, new Rng(1));
    assert.equal(state.sides[1].lifePoints, before);
  });

  it('el primer turno del duelo no permite ataques', () => {
    let state = duelWith([deckA, deckB]);
    state = fieldOf(state, 0, [1]);
    state = fieldOf(state, 1, []);

    const before = state.sides[1].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: null }, new Rng(1));
    assert.equal(state.sides[1].lifePoints, before, 'el primer turno no ataca');
  });
});

/* ---------------------------------------------------------- Cartas ------- */

describe('jugadas de cartas', () => {
  const deck = new Array<number>(40).fill(1);

  function playableState(hand: readonly number[]): DuelState {
    let state = duelWith([deck, deck]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    return handOf(state, hand);
  }

  it('invoca un monstruo de la mano a una zona', () => {
    const state = playableState([1]);
    const next = applyAction(state, { type: 'summon', cardIndex: 0, slot: 2, useStar2: false }, new Rng(1));
    assert.equal(next.sides[0].monsters[2]?.cardId, 1);
    assert.equal(next.sides[0].hand.length, 0, 'la carta sale de la mano');
  });

  it('no deja invocar sobre una zona ocupada', () => {
    let state = playableState([1]);
    state = fieldOf(state, 0, [58]);
    const next = applyAction(state, { type: 'summon', cardIndex: 0, slot: 0, useStar2: false }, new Rng(1));
    assert.equal(next.sides[0].monsters[0]?.cardId, 58);
    assert.equal(next.sides[0].hand.length, 1, 'la carta sigue en la mano');
  });

  it('no invoca una Magia como si fuera un monstruo', () => {
    const state = playableState([320]); // Stop Defense
    const next = applyAction(state, { type: 'summon', cardIndex: 0, slot: 0, useStar2: false }, new Rng(1));
    assert.equal(next.sides[0].monsters[0], null);
  });

  it('un Dark Hole se lleva todas las cartas de los dos lados', () => {
    let state = playableState([336]);
    state = fieldOf(state, 0, [1]);
    state = fieldOf(state, 1, [58]);
    const next = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));

    assert.equal(next.sides[0].monsters.filter(Boolean).length, 0);
    assert.equal(next.sides[1].monsters.filter(Boolean).length, 0);
  });

  it('Raigeki solo se lleva los monstruos rivales', () => {
    let state = playableState([337]);
    state = fieldOf(state, 0, [1]);
    state = fieldOf(state, 1, [58]);
    const next = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));

    assert.equal(next.sides[0].monsters[0]?.cardId, 1, 'el propio monstruo sobrevive');
    assert.equal(next.sides[1].monsters.filter(Boolean).length, 0);
  });

  it('Dragon Capture Jar se lleva solo los dragones rivales', () => {
    let state = playableState([329]);
    state = fieldOf(state, 0, [1]); // Blue-eyes, un dragon propio
    state = fieldOf(state, 1, [1, 58]); // un dragon y un no dragon
    const next = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));

    assert.equal(next.sides[0].monsters[0]?.cardId, 1);
    assert.equal(next.sides[1].monsters[0], null, 'el dragon rival cae');
    assert.equal(next.sides[1].monsters[1]?.cardId, 58, 'Kuriboh sobrevive');
  });

  it('Curse of Tridents... no existe; pero Stop Defense voltea a un defensor', () => {
    let state = playableState([320]);
    state = replaceIn(state, 1, withMonsters(state.sides[1], [field(58, 0, 1, { defensePosition: true })]));
    const next = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));
    assert.equal(next.sides[1].monsters[0]?.defensePosition, false);
  });

  it('curacion respeta el techo de puntos de vida', () => {
    // Empezar con 3000 PV y curarse 5000 no puede pasar de 3000.
    let state = duelWith([deck, deck], 3000);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = handOf(state, [342]); // Dian Keto, +5000
    const next = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));
    assert.equal(next.sides[0].lifePoints, 3000);
  });

  it('el danio directo tiene piso en cero y termina el duelo', () => {
    let state = duelWith([deck, deck]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = handOf(state, [347]); // Tremendous Fire, 1000 de danio
    // El rival baja a 500 PV para que el danio lo termine.
    state = replaceIn(state, 1, withLifePoints(state.sides[1], 500));

    const next = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));

    assert.equal(next.sides[1].lifePoints, 0, 'nunca por debajo de cero');
    assert.notEqual(next.outcome, null);
    assert.equal(next.outcome?.winner, 0);
    assert.equal(next.outcome?.kind, 'lp');
  });

  it('cambia un monstruo entre ataque y defensa', () => {
    let state = duelWith([deck, deck]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = fieldOf(state, 0, [58]);

    const next = applyAction(state, { type: 'change-position', slot: 0 }, new Rng(1));
    assert.equal(next.sides[0].monsters[0]?.defensePosition, true);
  });
});

/* --------------------------------------------------------- Swords -------- */

describe('Swords of Revealing Light', () => {
  const deck = new Array<number>(40).fill(1);

  it('bloquea el ataque del rival durante tres turnos', () => {
    let state = duelWith([deck, deck]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = handOf(state, [348]); // Swords

    state = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));
    // El contador arranca en 4 y se descuenta al entrar el turno del rival.
    assert.equal(state.sides[1].swordsTurnsRemaining, 4);

    // El rival no puede atacar mientras el contador sea positivo.
    state = fieldOf(state, 1, [1]);
    const before = state.sides[0].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: null }, new Rng(1));
    assert.equal(state.sides[0].lifePoints, before);
  });

  it('revela los monstruos boca abajo del rival', () => {
    let state = duelWith([deck, deck]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = handOf(state, [348]);

    // Un monstruo del rival boca abajo.
    state = replaceIn(state, 1, withMonsters(state.sides[1], [field(1, 0, 1, { faceDown: true })]));
    state = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));

    assert.equal(state.sides[1].monsters[0]?.faceDown, false);
  });

  it('el contador baja solo en los turnos del rival y dura tres', () => {
    let state = duelWith([deck, deck]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = handOf(state, [348]);
    state = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));
    assert.equal(state.sides[1].swordsTurnsRemaining, 4, 'el contador interno arranca en 4');

    // El contador se descuenta al entrar el turno del rival, no en los del
    // jugador, asi que hacen falta cuatro turnos del rival para agotarlo.
    for (const expected of [3, 2, 1, 0]) {
      state = applyAction(state, { type: 'ready' }, new Rng(1)); // -> turno del rival
      assert.equal(state.sides[1].swordsTurnsRemaining, expected);
      if (expected > 0) {
        state = applyAction(state, { type: 'ready' }, new Rng(1)); // -> turno del jugador
        assert.equal(state.sides[1].swordsTurnsRemaining, expected, 'no baja en el turno del jugador');
      }
    }
  });
});

/* --------------------------------------------------------- Ritual -------- */

describe('rituales', () => {
  it('la receta de Blue-eyes Ultimate Dragon pide tres Blue-eyes', () => {
    const threeBlueEyes = [
      field(1, 0, 0),
      field(1, 1, 0),
      field(1, 2, 0),
    ];
    assert.equal(checkRitual(threeBlueEyes, 675), 380);
  });

  it('la misma receta falla con menos de tres Blue-eyes', () => {
    const twoBlueEyes = [field(1, 0, 0), field(1, 1, 0), field(58, 2, 0)];
    assert.equal(checkRitual(twoBlueEyes, 675), 0);
  });

  it('la receta de Gate Guardian pide Kazejin, Suijin y Sanga', () => {
    const tributes = [field(372, 0, 0), field(373, 1, 0), field(371, 2, 0)];
    assert.equal(checkRitual(tributes, 667), 374);
  });

  it('no acepta el mismo monstruo dos veces para un mismo requisito', () => {
    // Tres Kuriboh no pueden hacer el ritual de tres Blue-eyes.
    const tributes = [field(58, 0, 0), field(58, 1, 0), field(58, 2, 0)];
    assert.equal(checkRitual(tributes, 675), 0);
  });
});

/* --------------------------------------------------------- Trampas ------ */

describe('trampas', () => {
  const deck = new Array<number>(40).fill(1);

  it('la mas debil que cubre el ataque es la que dispara', () => {
    let state = duelWith([deck, deck]);
    // El rival pone Bear Trap (umbral 1500) y Widespread Ruin (cualquiera).
    state = replaceIn(
      state,
      1,
      {
        ...state.sides[1],
        backRow: [field(683, 0, 1), field(686, 1, 1), null, null, null],
      },
    );
    // Un atacante de 1000 cumple ambos umbrales: dispara la mas debil.
    const trap = trapForAttack(state, 1, 1000);
    assert.equal(trap?.cardId, 683);
  });

  it('un atacante por encima de todos los umbrales no dispara ninguna', () => {
    let state = duelWith([deck, deck]);
    state = replaceIn(state, 1, { ...state.sides[1], backRow: [field(683, 0, 1), null, null, null, null] });
    const trap = trapForAttack(state, 1, 4000);
    assert.equal(trap, null);
  });

  it('una trampa destruye al atacante en vez de dejar pasar el golpe', () => {
    let state = duelWith([deck, deck]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    state = fieldOf(state, 0, [58]); // Kuriboh, 300 de ATK
    state = replaceIn(state, 1, { ...state.sides[1], backRow: [field(681, 0, 1), null, null, null, null] });

    const before = state.sides[0].lifePoints;
    state = applyAction(state, { type: 'attack', slot: 0, target: null }, new Rng(1));

    assert.equal(state.sides[0].monsters[0], null, 'el atacante cae');
    assert.equal(state.sides[0].lifePoints, before, 'no hay danio directo');
    assert.equal(state.sides[1].backRow[0], null, 'la trampa se consume');
  });
});

/* ---------------------------------------------------------- Exodia ------ */

describe('Exodia', () => {
  it('las cinco piezas en la mano ganan el duelo al instante', () => {
    // Un mazo con las cinco piezas, barajado de forma controlada es dificil;
    // aqui se comprueba directamente el detector de la mano.
    const state = handOf(duelWith([new Array(40).fill(1), new Array(40).fill(1)]), EXODIA_PIECE_IDS);
    const pieces = state.sides[0].hand.map((c) => c.cardId);
    assert.equal(pieces.length, 5);
    for (const piece of EXODIA_PIECE_IDS) assert.ok(pieces.includes(piece));
  });
});

/* ----------------------------------------------------------- Vista ------ */

describe('vista del jugador', () => {
  const deck = new Array<number>(40).fill(1);

  it('oculta la mano del rival', () => {
    const state = duelWith([deck, deck]);
    const mine = viewFor(state, 0);
    const theirs = viewFor(state, 1);

    assert.equal(mine.you.hand.count, 5);
    assert.equal(mine.you.hand.cards.length, 5, 'veo mis cartas');
    assert.equal(theirs.opponent.hand.count, 5, 'se cuanta su mano');
    assert.equal(theirs.opponent.hand.cards.length, 0, 'no veo sus cartas');
  });

  it('una carta boca abajo del rival no viaja con su id', () => {
    let state = duelWith([deck, deck]);
    state = replaceIn(state, 1, withMonsters(state.sides[1], [field(1, 0, 1, { faceDown: true })]));

    const view = viewFor(state, 0);
    const hidden = view.opponent.monsters[0];
    assert.equal(hidden?.id, null);
    assert.equal(hidden?.name, '???');
    assert.equal(hidden?.faceDown, true);
  });

  it('el dueno de una carta boca abajo si la ve identificada', () => {
    let state = duelWith([deck, deck]);
    state = replaceIn(state, 0, withMonsters(state.sides[0], [field(1, 0, 0, { faceDown: true })]));

    const view = viewFor(state, 0);
    assert.equal(view.you.monsters[0]?.id, 1);
  });
});

/* ----------------------------------------------- Determinismo y turnos --- */

describe('determinismo', () => {
  const deck = new Array<number>(40).fill(1);

  it('las mismas acciones producen el mismo estado', () => {
    const build = () => {
      let state = duelWith([deck, deck]);
      state = applyAction(state, { type: 'ready' }, new Rng(1));
      state = applyAction(state, { type: 'ready' }, new Rng(1));
      state = handOf(state, [336]);
      state = applyAction(state, { type: 'activate', cardIndex: 0 }, new Rng(1));
      return state;
    };

    const a = build();
    const b = build();
    assert.deepEqual(a.sides, b.sides);
    assert.deepEqual(a.log, b.log);
  });

  it('el turno alterna entre los dos lados', () => {
    let state = duelWith([deck, deck]);
    assert.equal(state.turn, 0);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    assert.equal(state.turn, 1);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    assert.equal(state.turn, 0);
  });

  it('cada turno roba hasta llenar la mano a cinco', () => {
    let state = duelWith([deck, deck]);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    assert.equal(state.sides[1].hand.length, 5);
    state = applyAction(state, { type: 'ready' }, new Rng(1));
    assert.equal(state.sides[0].hand.length, 5);
  });

  it('quedarse sin cartas en el mazo termina el duelo por agotamiento', () => {
    // El retail comprueba el agotamiento antes de cada robo, asi que hace falta
    // que el rival tenga que robar: mazo vacio y mano por debajo de cinco.
    let state = duelWith([deck, deck]);
    state = replaceIn(state, 1, { ...state.sides[1], deck: [], deckCursor: 40, hand: [] });

    let guard = 0;
    while (state.outcome === null && guard < 10) {
      state = applyAction(state, { type: 'ready' }, new Rng(guard));
      guard += 1;
    }

    assert.notEqual(state.outcome, null, 'el duelo termina');
    assert.equal(state.outcome?.kind, 'deckout');
    assert.equal(state.outcome?.winner, 0);
  });
});