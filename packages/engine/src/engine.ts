/**
 * El motor de duelo: turnos, robo, invocaciones, combate y acciones.
 *
 * `applyAction` es el unico punto de entrada de una accion de jugador. Es puro:
 * mismo estado + misma accion + misma semilla = mismo estado resultante, sin
 * excepciones. Eso es lo que permite que servidor y cliente jueguen la misma
 * partida sin desincronizarse.
 *
 * Las acciones invalidas (turno equivocado, carta que no esta en la mano, zona
 * ocupada, ataque bloqueado) devuelven el estado sin cambios. El cliente
 * muestra el motivo del fallo; el motor no lanza.
 */

import {
  BAD_REACTION_ID,
  CARD_STAT_MAX,
  HAND_SIZE,
  MONSTER_ZONES,
  RITUAL_TRIBUTE_COUNT,
  equipBonus,
} from './constants.js';
import {
  attackAgainst,
  deckCount,
  effectiveAttack,
  effectiveDefense,
  opponentOf,
  replaceSide,
  withEvent,
} from './state.js';
import {
  applySpell,
  checkRitual,
  consumeTrap,
  fallbackTrap,
  hasAllExodiaPieces,
  hasTrap,
  matchRitualTributes,
  trapForAttack,
} from './effects.js';
import {
  card,
  cardName,
  canEquipOn,
  fusionResult,
  isEquip,
  isRitual,
  isTrap,
  terrainBoost,
} from './catalog.js';
import type { Rng } from './rng.js';
import type {
  DuelOutcome,
  DuelState,
  FieldCard,
  FieldZone,
  HandCard,
  PlayerAction,
  Side,
  SideState,
} from './types.js';

/* ------------------------------------------------------------ Ayudas ------ */

/** Anota una linea en el historial del duelo. */
function log(state: DuelState, side: Side, text: string): DuelState {
  return { ...state, log: [...state.log, { turn: state.turnCount, side, text }] };
}

/** Sustituye un lado del estado. */
function withSide(state: DuelState, side: Side, value: SideState): DuelState {
  return { ...state, sides: replaceSide(state.sides, side, value) };
}

/** Suma a un contador de las estadisticas del lado. */
function bumpStat(state: DuelState, side: Side, key: keyof SideState['stats']): DuelState {
  const stats = { ...state.sides[side].stats, [key]: state.sides[side].stats[key] + 1 };
  return withSide(state, side, { ...state.sides[side], stats });
}

/** Construye una carta lista para entrar al campo. */
function makeFieldCard(cardId: number, slot: number, side: Side, terrain: number): FieldCard {
  return {
    cardId,
    slot,
    side,
    defensePosition: false,
    faceDown: false,
    useStar2: false,
    statModifier: 0,
    terrainModifier: terrainBoost(card(cardId)?.type ?? 20, terrain),
    equipId: null,
    usedThisTurn: false,
  };
}

/** Fila de monstruos propia. */
const OWN_MONSTERS: FieldZone = 2;
/** Fila de atras propia. */
const OWN_BACK_ROW: FieldZone = 3;

/* ------------------------------------------------------- Fase de robo ------ */

/**
 * Roba una carta exacta a un lado. Devuelve `null` si el mazo se ha agotado.
 *
 * El retail considera el deck out cuando `deck_draw_cursor >= 40`, es decir
 * cuando ya no queda nada que robar (`src/game/duel_draw_resolution.c`).
 */
function drawOne(state: DuelState, side: Side): DuelState | null {
  const current = state.sides[side];
  const cardId = current.deck[0];
  if (cardId === undefined || current.deckCursor >= deckCount(state, side) + current.deckCursor) return null;
  if (current.deckCursor >= 40) return null;

  const hand: HandCard[] = [...current.hand, { cardId, faceDown: false }];
  const deck = current.deck.slice(1);
  return {
    ...state,
    sides: replaceSide(state.sides, side, { ...current, hand, deck, deckCursor: current.deckCursor + 1 }),
    events: [...state.events, { type: 'draw', side, count: 1 }],
  };
}

/**
 * La mano inicial: cinco cartas a cada lado.
 *
 * El retail roba la mano inicial por el estado 3 del escaneo, que se salta el
 * estado 2 (la fase de robo del turno). Por eso la mano inicial no cuenta como
 * turno (`tests/pc/rank_test.c` lo confirma: tras el primer turno,
 * `deck_draw_cursor == 5` y `turns_taken == 0`).
 */
export function drawOpeningHands(state: DuelState): DuelState {
  let next = state;
  for (const side of [0, 1] as const) {
    for (let i = 0; i < HAND_SIZE; i += 1) {
      const drawn = drawOne(next, side);
      if (drawn === null) {
        return finish(next, { kind: 'deckout', winner: opponentOf(side) });
      }
      next = drawn;
    }
  }

  // Exodia se comprueba en la mano, despues de robar.
  for (const side of [0, 1] as const) {
    if (hasAllExodiaPieces(next.sides[side].hand)) {
      const announced = withEvent(next, { type: 'exodia', side });
      return log(finish(announced, { kind: 'exodia', winner: side }), side, 'SUMMON Exodia.');
    }
  }

  return { ...next, phase: 'main' };
}

/**
 * Comienza el turno de un lado: baja el contador de Swords, sube los contadores,
 * limpia la marca de "ataco este turno" y roba hasta llenar la mano a cinco.
 */
function beginTurn(state: DuelState, side: Side): DuelState {
  const current = state.sides[side];
  const cleared = clearUsedFlags(withSide({ ...state, turn: side, turnCount: state.turnCount + 1 }, side, current), side);

  // Swords se descuenta antes de que este lado actue: por eso el contador
  // arranca en 4 y dura tres turnos visibles.
  const swords = Math.max(0, cleared.sides[side].swordsTurnsRemaining - 1);
  const withSwords = withSide(cleared, side, {
    ...cleared.sides[side],
    swordsTurnsRemaining: swords,
    openedTurn: true,
  });
  const counted = bumpStat(withSwords, side, 'turnsTaken');

  return withEvent(counted, { type: 'turn-start', side });
}

/** Limpia "ataco este turno" en las dos filas del campo de un lado. */
function clearUsedFlags(state: DuelState, side: Side): DuelState {
  const clear = (row: readonly (FieldCard | null)[]) =>
    row.map((field) => (field !== null && field.usedThisTurn ? { ...field, usedThisTurn: false } : field));

  return withSide(state, side, {
    ...state.sides[side],
    monsters: clear(state.sides[side].monsters),
    backRow: clear(state.sides[side].backRow),
  });
}

/**
 * Roba hasta llenar la mano a `HAND_SIZE` cartas.
 *
 * La fase de robo del retail roba `5 - cartas_en_mano`, de modo que si el
 * jugador ha jugado una carta roba una, y si no ha jugado nada roba mas.
 */
function drawToFill(state: DuelState, side: Side): DuelState {
  let next = state;
  while (next.sides[side].hand.length < HAND_SIZE) {
    const drawn = drawOne(next, side);
    if (drawn === null) {
      return finish(next, { kind: 'deckout', winner: opponentOf(side) });
    }
    next = drawn;
  }
  return next;
}

/** Cierra el turno y abre el del rival. */
function endTurn(state: DuelState): DuelState {
  const nextSide = opponentOf(state.turn);
  // La bandera de "el primer turno no tiene combate" se levanta al acabar el
  // primer turno del duelista que empieza.
  const lifted = state.turn === 0 && state.turnCount === 1 ? { ...state, firstTurnNoBattle: false } : state;
  return drawToFill(beginTurn(lifted, nextSide), nextSide);
}

/* -------------------------------------------------------- Inicio de duelo -- */

/**
 * Prepara un duelo jugable desde el estado recien creado: mano inicial, primer
 * turno abierto y primera comprobacion de Exodia.
 */
export function startDuel(state: DuelState): DuelState {
  if (state.outcome !== null) return state;
  return drawToFill(beginTurn(drawOpeningHands(state), 0), 0);
}

/* ---------------------------------------------------------- Acciones ------ */

/**
 * Aplica una accion al estado del duelo y devuelve el estado resultante.
 *
 * Es la funcion que el servidor valida y el cliente reproduce.
 */
export function applyAction(state: DuelState, action: PlayerAction, rng: Rng): DuelState {
  if (state.outcome !== null) return state;

  if (action.type === 'surrender') {
    return finish(log(state, state.turn, 'Rendicion.'), { kind: 'surrender', winner: opponentOf(state.turn) });
  }

  const side = state.turn;
  const next = dispatch(state, action, side);

  // Cualquier camino que deje a un lado en cero PV cierra el duel. El retail lo
  // comprueba al entrar en la fase de campo, asi que se hace aqui para que todas
  // las rutas de dano respeten la misma regla.
  return checkLifePoints(next);
}

/** Reparte la accion al manejador correspondiente. */
function dispatch(state: DuelState, action: PlayerAction, side: Side): DuelState {
  switch (action.type) {
    case 'ready':
      // El primer Start levanta la prohibitions de combate del primer turno.
      return endTurn(state.firstTurnNoBattle ? { ...state, firstTurnNoBattle: false } : state);

    case 'end-phase':
      return endTurn(state);

    case 'summon':
      return doSummon(state, side, action.cardIndex, action.slot, action.useStar2);

    case 'set':
      return doSet(state, side, action.cardIndex, action.slot);

    case 'equip':
      return doEquip(state, side, action.cardIndex, action.slot);

    case 'activate':
      return doActivate(state, side, action.cardIndex);

    case 'activate-field':
      return doActivateField(state, side, action.slot);

    case 'ritual':
      return doRitual(state, side, action.cardIndex, action.tributes);

    case 'fusion':
      return doFusion(state, side, action.cardIndices, action.slot);

    case 'attack':
      return doAttack(state, side, action.slot, action.target);

    case 'change-position':
      return doChangePosition(state, side, action.slot);

    default:
      return state;
  }
}

/**
 * Cierra el duel si algun lado se ha quedado sin puntos de vida.
 *
 * El retail lo comprueba al entrar en la fase de campo y lo llama
 * `TOTAL ANNIHILATION` (`src/game/duel_scene_field_actions.c`). Se comprueba aqui,
 * al final de cada accion, para que el dano de cualquier carta lo provoque igual.
 */
function checkLifePoints(state: DuelState): DuelState {
  if (state.outcome !== null) return state;
  for (const side of [0, 1] as const) {
    if (state.sides[side].lifePoints === 0) {
      return log(finish(state, { kind: 'lp', winner: opponentOf(side) }), side, 'TOTAL ANNIHILATION.');
    }
  }
  return state;
}

/** Quita de la mano la carta de un indice dado. */
function takeFromHand(state: DuelState, side: Side, cardIndex: number): DuelState {
  const current = state.sides[side];
  const hand = current.hand.filter((_, index) => index !== cardIndex);
  return withSide(state, side, { ...current, hand });
}

/** Invoca un monstruo de la mano a una zona de monstruos. */
function doSummon(
  state: DuelState,
  side: Side,
  cardIndex: number,
  slot: number,
  useStar2: boolean,
): DuelState {
  const handCard = state.sides[side].hand[cardIndex];
  if (handCard === undefined) return state;
  if (card(handCard.cardId) === undefined || (card(handCard.cardId)?.type ?? 20) >= 20) return state;
  if (slot < 0 || slot >= MONSTER_ZONES) return state;
  if (state.sides[side].monsters[slot] !== null) return state;

  const current = state.sides[side];
  const monsters = [...current.monsters];
  monsters[slot] = { ...makeFieldCard(handCard.cardId, slot, side, state.terrain), useStar2 };

  const placed: DuelState = {
    ...state,
    sides: replaceSide(state.sides, side, {
      ...current,
      hand: current.hand.filter((_, index) => index !== cardIndex),
      monsters,
    }),
    events: [
      ...state.events,
      { type: 'place', side, zone: OWN_MONSTERS, slot, cardId: handCard.cardId, faceDown: false },
    ],
  };
  return log(placed, side, `${cardName(handCard.cardId)} invocado.`);
}

/** Coloca una carta boca abajo en la fila de atras propia. */
function doSet(state: DuelState, side: Side, cardIndex: number, slot: number): DuelState {
  const handCard = state.sides[side].hand[cardIndex];
  if (handCard === undefined) return state;
  if (slot < 0 || slot >= MONSTER_ZONES) return state;
  if (state.sides[side].backRow[slot] !== null) return state;

  const current = state.sides[side];
  const backRow = [...current.backRow];
  backRow[slot] = { ...makeFieldCard(handCard.cardId, slot, side, state.terrain), faceDown: true };

  const placed: DuelState = {
    ...state,
    sides: replaceSide(state.sides, side, {
      ...current,
      hand: current.hand.filter((_, index) => index !== cardIndex),
      backRow,
    }),
    events: [
      ...state.events,
      { type: 'place', side, zone: OWN_BACK_ROW, slot, cardId: handCard.cardId, faceDown: true },
    ],
  };
  return log(bumpStat(placed, side, 'faceDownPlays'), side, `${cardName(handCard.cardId)} colocado.`);
}

/** Fija un equip de la mano a un monstruo propio. */
function doEquip(state: DuelState, side: Side, cardIndex: number, slot: number): DuelState {
  const handCard = state.sides[side].hand[cardIndex];
  if (handCard === undefined || !isEquip(handCard.cardId)) return state;
  if (slot < 0 || slot >= MONSTER_ZONES) return state;

  const target = state.sides[side].monsters[slot];
  if (target === null) return state;
  if (!canEquipOn(handCard.cardId, target.cardId)) return state;

  const monsters = [...state.sides[side].monsters];
  monsters[slot] = {
    ...target,
    equipId: handCard.cardId,
    statModifier: target.statModifier + equipBonus(handCard.cardId),
  };

  const equipped: DuelState = {
    ...state,
    sides: replaceSide(state.sides, side, {
      ...state.sides[side],
      hand: state.sides[side].hand.filter((_, index) => index !== cardIndex),
      monsters,
    }),
    events: [
      ...state.events,
      { type: 'place', side, zone: OWN_MONSTERS, slot, cardId: target.cardId, faceDown: false },
    ],
  };
  return log(bumpStat(equipped, side, 'equipsUsed'), side, `${cardName(handCard.cardId)} equipado.`);
}

/** Activa una Magia o un Ritual de la mano. */
function doActivate(state: DuelState, side: Side, cardIndex: number): DuelState {
  const handCard = state.sides[side].hand[cardIndex];
  if (handCard === undefined) return state;

  // Un Ritual se resuelve por su propia via, buscando los tributos en el campo.
  if (isRitual(handCard.cardId)) return doRitualAuto(state, side, cardIndex);
  // Las trampas no se activan desde la mano: hay que ponerlas boca abajo.
  if (isTrap(handCard.cardId)) return state;

  const spent = countSpell(takeFromHand(state, side, cardIndex), side);
  const resolved = reactTraps(spent, side, handCard.cardId);
  return log(resolved, side, `${cardName(handCard.cardId)} activado.`);
}

/**
 * Activa una Magia ya colocada en el campo y boca arriba.
 *
 * El retail permite activar una Magia de la fila de atras sin moverla: se
 * consume y su efecto se resuelve.
 */
function doActivateField(state: DuelState, side: Side, slot: number): DuelState {
  const field = state.sides[side].backRow[slot];
  if (field === null || field.faceDown) return state;
  if ((card(field.cardId)?.type ?? -1) !== 20) return state;

  const backRow = [...state.sides[side].backRow];
  backRow[slot] = null;
  const consumed: DuelState = {
    ...state,
    sides: replaceSide(state.sides, side, { ...state.sides[side], backRow }),
    events: [
      ...state.events,
      { type: 'destroy', side, zone: OWN_BACK_ROW, slot, cardId: field.cardId },
    ],
  };
  const resolved = reactTraps(countSpell(consumed, side), side, field.cardId);
  return log(resolved, side, `${cardName(field.cardId)} activado.`);
}

/** Suma un hechizo usado a las estadisticas del lado. */
function countSpell(state: DuelState, side: Side): DuelState {
  return bumpStat(state, side, 'spellsUsed');
}

/**
 * Resuelve el hechizo y deja que las trampas del rival reaccionen.
 *
 * `Bad Reaction to Simochi` (688) convierte la curacion en danio, asi que hay
 * que medir cuanto se ha curado antes de que la trampa intervenga.
 */
function reactTraps(state: DuelState, side: Side, cardId: number): DuelState {
  const before = state.sides[side].lifePoints;
  const applied = applySpell(state, side, cardId);

  const defender = opponentOf(side);
  const gained = applied.sides[side].lifePoints - before;

  if (gained > 0 && hasTrap(applied, defender, BAD_REACTION_ID)) {
    // La curacion se convierte en danio: mismo importe, pero restando.
    const healed = applied.sides[side];
    const lifePoints = Math.max(0, healed.lifePoints - gained);
    const reversed: DuelState = {
      ...applied,
      sides: replaceSide(applied.sides, side, { ...healed, lifePoints }),
    };
    const announced = withEvent(reversed, { type: 'damage', side, amount: gained, lifePoints });
    return consumeTrap(announced, defender, BAD_REACTION_ID);
  }

  return applied;
}

/* ----------------------------------------------------------- Ritual ------- */

/**
 * Ritual desde la mano. El retail exige tres registros ocupados distintos de la
 * fila de monstruos propia y solo prueba `OCCUPIED`: un monstruo boca abajo
 * cuenta, y la posicion no importa.
 *
 * El resultado aparece en la zona del tributo central, el segundo de los tres.
 * Si falta material, la carta se gasta sin invocar nada.
 */
function doRitualAuto(state: DuelState, side: Side, cardIndex: number): DuelState {
  const handCard = state.sides[side].hand[cardIndex];
  if (handCard === undefined) return state;

  const spent = takeFromHand(state, side, cardIndex);
  const own = state.sides[side].monsters.filter((m): m is FieldCard => m !== null);
  const result = checkRitual(own, handCard.cardId);

  if (result === 0) {
    // El retail gasta la carta igualmente: falla y no invoca nada.
    const announced = withEvent(bumpStat(spent, side, 'ritualsUsed'), {
      type: 'effect',
      label: 'Material insuficiente.',
    });
    return log(announced, side, `${cardName(handCard.cardId)} fallo.`);
  }

  const chosen = pickTributes(own, handCard.cardId);
  if (chosen.length < RITUAL_TRIBUTE_COUNT) return spent;

  return summonRitualResult(spent, side, handCard.cardId, chosen, result);
}

/** Ritual con los slots de tributo que el jugador indica explicitamente. */
function doRitual(
  state: DuelState,
  side: Side,
  cardIndex: number,
  tributes: readonly number[],
): DuelState {
  const handCard = state.sides[side].hand[cardIndex];
  if (handCard === undefined) return state;

  const chosen: FieldCard[] = [];
  for (const slot of tributes) {
    const field = state.sides[side].monsters[slot];
    if (field !== null && !chosen.includes(field)) chosen.push(field);
  }
  if (chosen.length < RITUAL_TRIBUTE_COUNT) return state;

  const result = checkRitual(chosen, handCard.cardId);
  if (result === 0) return state;

  return summonRitualResult(takeFromHand(state, side, cardIndex), side, handCard.cardId, chosen, result);
}

/** Elige los tres monstruos concretos que cumplen una receta. */
function pickTributes(available: readonly FieldCard[], ritualId: number): FieldCard[] {
  // El mismo emparejamiento de dos pasadas que valida el ritual, para que lo que
  // se paga sea exactamente lo que `checkRitual` dio por bueno.
  return matchRitualTributes(available, ritualId) ?? [];
}

/** Retira los tributos del campo e invoca al resultado del ritual. */
function summonRitualResult(
  state: DuelState,
  side: Side,
  ritualCardId: number,
  tributes: readonly FieldCard[],
  resultId: number,
): DuelState {
  const monsters = [...state.sides[side].monsters];
  for (const tribute of tributes) monsters[tribute.slot] = null;

  // El retail coloca el resultado en la zona del segundo tributo.
  const slot = tributes[1]?.slot ?? 0;
  monsters[slot] = makeFieldCard(resultId, slot, side, state.terrain);

  const summoned: DuelState = {
    ...state,
    sides: replaceSide(state.sides, side, { ...state.sides[side], monsters }),
    events: [
      ...state.events,
      { type: 'place', side, zone: OWN_MONSTERS, slot, cardId: resultId, faceDown: false },
    ],
  };
  return log(
    bumpStat(summoned, side, 'ritualsUsed'),
    side,
    `${cardName(ritualCardId)} invoca a ${cardName(resultId)}.`,
  );
}

/* ----------------------------------------------------------- Fusion ------- */

/** Fusiona dos monstruos de la mano y coloca el resultado en `slot`. */
function doFusion(
  state: DuelState,
  side: Side,
  cardIndices: readonly number[],
  slot: number,
): DuelState {
  if (cardIndices.length !== 2) return state;

  const hand = state.sides[side].hand;
  const first = hand[cardIndices[0] as number];
  const second = hand[cardIndices[1] as number];
  if (first === undefined || second === undefined) return state;
  if (first === second) return state;

  const resultId = fusionResult(first.cardId, second.cardId);
  if (resultId === 0) return state;
  if (slot < 0 || slot >= MONSTER_ZONES) return state;
  if (state.sides[side].monsters[slot] !== null) return state;

  let next = takeFromHand(takeFromHand(state, side, cardIndices[0] as number), side, cardIndices[1] as number);
  // Los indices se han desplazado al quitar la primera carta.
  const monsters = [...next.sides[side].monsters];
  monsters[slot] = makeFieldCard(resultId, slot, side, state.terrain);

  next = {
    ...next,
    sides: replaceSide(next.sides, side, { ...next.sides[side], monsters }),
    events: [
      ...next.events,
      { type: 'place', side, zone: OWN_MONSTERS, slot, cardId: resultId, faceDown: false },
    ],
  };
  return log(bumpStat(next, side, 'fusionsUsed'), side, `Fusion: ${cardName(resultId)}.`);
}

/* ---------------------------------------------------------- Ataque ------- */

/**
 * Declara un ataque del monstruo de `slot`.
 *
 * Tres bloqueos, los tres del retail:
 *  - el primer turno del duelo no tiene combate (`D_8009B16C & 0x1000`);
 *  - Swords of Revealing Light inmoviliza al lado afectado mientras el contador
 *    sea distinto de cero;
 *  - un monstruo en defensa o que ya ataco este turno no ataca
 *    (`(flags & 0xC800) == 0x8000` en `duel_scene_field_actions.c`).
 */
function doAttack(state: DuelState, side: Side, slot: number, target: number | null): DuelState {
  if (state.firstTurnNoBattle) return state;
  if (state.sides[side].swordsTurnsRemaining > 0) return state;

  const attacker = state.sides[side].monsters[slot];
  if (attacker === null || attacker.defensePosition || attacker.usedThisTurn) return state;

  const declared = bumpStat(withEvent(state, { type: 'attack', side, slot }), side, 'attacksDeclared');

  // Marcar al atacante antes de resolver, como hace la fase de batalla.
  const monsters = [...declared.sides[side].monsters];
  const marked = monsters[slot];
  if (marked !== null) monsters[slot] = { ...marked, usedThisTurn: true };
  const ready = withSide(declared, side, { ...declared.sides[side], monsters });

  const targetSide = opponentOf(side);
  const defender = target === null ? null : ready.sides[targetSide].monsters[target];

  // "Ataque directo" solo si el rival no tiene monstruos en pie.
  const rivalHasMonsters = ready.sides[targetSide].monsters.some((m) => m !== null);
  if (target === null || !rivalHasMonsters || defender === null) {
    return resolveDirectAttack(ready, side, slot);
  }
  return resolveBattle(ready, side, slot, target);
}

/** Ataque directo: el ATK entero va a la vida del rival. */
function resolveDirectAttack(state: DuelState, side: Side, slot: number): DuelState {
  const attacker = state.sides[side].monsters[slot];
  if (attacker === null) return state;

  const target = opponentOf(side);
  const amount = effectiveAttack(attacker);

  const trap = trapForAttack(state, target, amount) ?? fallbackTrap(state, target);
  if (trap !== null) {
    return log(resolveAttackTrap(state, target, trap.cardId, side, slot), side, 'Trampa activada.');
  }

  const battle = withEvent(state, {
    type: 'battle',
    attacker: slot,
    defender: null,
    difference: amount,
    attackerWins: true,
    direct: true,
  });
  return log(damageLife(bumpStat(battle, side, 'attacksLanded'), target, amount), side, `Ataque directo: ${amount}.`);
}

/**
 * Combate entre dos monstruos.
 *
 * El retail decide con `func_8001EFD4`: aplica la bonificacion de estrella solo
 * al atacante y devuelve la resta. Contra un defensor en defensa se compara ATK
 * contra DEF; contra uno en ataque, ATK contra ATK.
 */
function resolveBattle(state: DuelState, side: Side, attackerSlot: number, defenderSlot: number): DuelState {
  const attacker = state.sides[side].monsters[attackerSlot];
  const defender = state.sides[opponentOf(side)].monsters[defenderSlot];
  if (attacker === null || defender === null) return state;

  const target = opponentOf(side);
  const attackerAtk = attackAgainst(attacker, defender);

  // La trampa se consulta antes que el combate y puede destruir al atacante.
  const trap = trapForAttack(state, target, attackerAtk) ?? fallbackTrap(state, target);
  if (trap !== null) {
    return resolveAttackTrap(state, target, trap.cardId, side, attackerSlot);
  }

  // Un defensor boca abajo se voltea y se resuelve como si estuviera expuesto.
  const exposed = defender.faceDown
    ? withSide(state, target, {
        ...state.sides[target],
        monsters: replaceAt(state.sides[target].monsters, defenderSlot, (f) => ({ ...f, faceDown: false })),
      })
    : state;

  return defender.defensePosition
    ? resolveAgainstDefense(exposed, side, target, attackerSlot, defenderSlot, attacker, defender, attackerAtk)
    : resolveAgainstAttack(exposed, side, target, attackerSlot, defenderSlot, attacker, defender, attackerAtk);
}

/** Sustituye una carta de una fila. */
function replaceAt(
  row: readonly (FieldCard | null)[],
  slot: number,
  update: (field: FieldCard) => FieldCard,
): (FieldCard | null)[] {
  const copy = [...row];
  const field = copy[slot];
  if (field !== null) copy[slot] = update(field);
  return copy;
}

/** Combate contra un defensor en posicion de defensa. */
function resolveAgainstDefense(
  state: DuelState,
  side: Side,
  target: Side,
  attackerSlot: number,
  defenderSlot: number,
  attacker: FieldCard,
  defender: FieldCard,
  attackerAtk: number,
): DuelState {
  // Igual que en ataque: la bonificacion de estrella es solo del atacante.
  const defenderDef = Math.min(CARD_STAT_MAX, effectiveDefense(defender));
  const difference = attackerAtk - defenderDef;

  if (difference > 0) {
    // El defensor cae; el atacante no recibe danio.
    const next = battleEvent(destroyMonster(state, target, defenderSlot), attackerSlot, defenderSlot, difference, true);
    return log(bumpStat(next, side, 'attacksLanded'), side, `${cardName(attacker.cardId)} rompe la defensa.`);
  }
  if (difference === 0) {
    // Empate: no pasa nada (`func_8001EFD4` devuelve 0 con un defensor en el medio).
    return log(battleEvent(state, attackerSlot, defenderSlot, 0, false), side, 'Choque sin resultado.');
  }
  // El atacante es mas debil: la diferencia la paga su dueno.
  const next = battleEvent(damageLife(state, side, -difference), attackerSlot, defenderSlot, difference, false);
  return log(next, side, `${cardName(attacker.cardId)} no supera la defensa.`);
}

/** Combate entre dos monstruos en posicion de ataque. */
function resolveAgainstAttack(
  state: DuelState,
  side: Side,
  target: Side,
  attackerSlot: number,
  defenderSlot: number,
  attacker: FieldCard,
  defender: FieldCard,
  attackerAtk: number,
): DuelState {
  // El defensor se compara sin bonificacion de estrella: la del retail se
  // aplica solo a la carta izquierda, que es el atacante.
  const defenderAtk = Math.min(CARD_STAT_MAX, effectiveAttack(defender));
  const difference = attackerAtk - defenderAtk;

  if (difference > 0) {
    const next = battleEvent(
      damageLife(destroyMonster(state, target, defenderSlot), target, difference),
      attackerSlot,
      defenderSlot,
      difference,
      true,
    );
    return log(bumpStat(next, side, 'attacksLanded'), side, `${cardName(attacker.cardId)} gana: ${difference}.`);
  }
  if (difference === 0) {
    // Empate en ataque: `func_8001EFD4` devuelve -1, y los dos caen sin danio.
    const next = destroyMonster(destroyMonster(state, target, defenderSlot), side, attackerSlot);
    return log(battleEvent(next, attackerSlot, defenderSlot, 0, false), side, 'Empate: ambos caen.');
  }
  const next = battleEvent(
    damageLife(destroyMonster(state, side, attackerSlot), side, -difference),
    attackerSlot,
    defenderSlot,
    difference,
    false,
  );
  return log(next, side, `${cardName(attacker.cardId)} cae.`);
}

/** Emite el evento de combate. */
function battleEvent(
  state: DuelState,
  attackerSlot: number,
  defenderSlot: number,
  difference: number,
  attackerWins: boolean,
): DuelState {
  return withEvent(state, {
    type: 'battle',
    attacker: attackerSlot,
    defender: defenderSlot,
    difference,
    attackerWins,
    direct: false,
  });
}

/**
 * Resuelve una trampa que se ha disparado contra un ataque.
 *
 * Las trampas de umbral (681-686) destruyen al atacante; `Fake Trap` solo se
 * consume. Las de rango alto (687-689) ya se resolvieron en el punto de uso.
 */
function resolveAttackTrap(
  state: DuelState,
  defendingSide: Side,
  trapCardId: number,
  attackingSide: Side,
  attackerSlot: number,
): DuelState {
  const consumed = consumeTrap(state, defendingSide, trapCardId);
  const thresholdTrap = trapCardId >= 681 && trapCardId <= 686;
  const next = thresholdTrap ? destroyMonster(consumed, attackingSide, attackerSlot) : consumed;
  return bumpStat(next, defendingSide, 'trapsTriggered');
}

/* --------------------------------------------------------- Campo --------- */

/** Cambia un monstruo propio entre posicion de ataque y de defensa. */
function doChangePosition(state: DuelState, side: Side, slot: number): DuelState {
  const field = state.sides[side].monsters[slot];
  if (field === null || field.usedThisTurn) return state;

  const monsters = [...state.sides[side].monsters];
  monsters[slot] = { ...field, defensePosition: !field.defensePosition };
  return withSide(state, side, { ...state.sides[side], monsters });
}

/* ------------------------------------------------------- Utilidades ------ */

/** Quita un monstruo del campo de un lado y emite el evento. */
function destroyMonster(state: DuelState, side: Side, slot: number): DuelState {
  const field = state.sides[side].monsters[slot];
  if (field === null) return state;

  const monsters = [...state.sides[side].monsters];
  monsters[slot] = null;
  return withEvent(withSide(state, side, { ...state.sides[side], monsters }), {
    type: 'destroy',
    side,
    zone: OWN_MONSTERS,
    slot,
    cardId: field.cardId,
  });
}

/** Suma danio a un lado con piso en 0. Al llegar a 0 el duelo acaba. */
function damageLife(state: DuelState, side: Side, amount: number): DuelState {
  const current = state.sides[side];
  const lifePoints = Math.max(0, current.lifePoints - amount);
  const damaged: DuelState = {
    ...state,
    sides: replaceSide(state.sides, side, { ...current, lifePoints }),
    events: [...state.events, { type: 'damage', side, amount, lifePoints }],
  };
  if (lifePoints === 0 && damaged.outcome === null) {
    return finish(damaged, { kind: 'lp', winner: opponentOf(side) });
  }
  return damaged;
}

/** Termina el duelo. */
export function finish(state: DuelState, outcome: DuelOutcome): DuelState {
  return {
    ...state,
    outcome,
    phase: 'finished',
    events: [
      ...state.events,
      { type: 'finish', outcome, sides: [state.sides[0].lifePoints, state.sides[1].lifePoints] },
    ],
  };
}