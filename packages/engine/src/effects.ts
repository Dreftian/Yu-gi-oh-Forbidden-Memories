/**
 * Efectos de las cartas de Magia, Ritual y de las trampas.
 *
 * El retail no interpreta el texto de las cartas: tiene 14 grupos de efecto
 * (`notes/magic-effect-groups.md`) y una tabla que mapea cada id de carta a su
 * grupo (`src/game/duel_effect_tables.c`). Este modulo son esos grupos, escritos
 * contra el estado del duelo.
 *
 * Todas las funciones reciben el estado y devuelven uno nuevo. Devuelven el
 * estado intacto cuando el efecto no aplica, para que el jugador vea el fallo en
 * vez de que la carta se consuma sin efecto.
 */

import {
  DARK_HOLE_ID,
  MONSTER_REMOVAL_RULES,
  MONSTER_REMOVAL_TYPE_LIMIT,
  SPELLBINDING_CIRCLE_ID,
  STAT_PENALTY_PER_LEVEL,
  SWORDS_INITIAL_COUNTER,
  TERRAIN_CARD_IDS,
  TRAP_THRESHOLDS,
  directDamage,
  equipBonus,
  lifePointRecovery,
  ritualRecipe,
} from './constants.js';
import {
  EFFECT_GROUP_BOARD_DESTRUCTION,
  EFFECT_GROUP_CURSEBREAKER,
  EFFECT_GROUP_DARK_PIERCING_LIGHT,
  EFFECT_GROUP_DIRECT_DAMAGE,
  EFFECT_GROUP_HARPIES_FEATHER_DUSTER,
  EFFECT_GROUP_LIFE_POINT_RECOVERY,
  EFFECT_GROUP_MONSTER_REMOVAL,
  EFFECT_GROUP_RAIGEKI,
  EFFECT_GROUP_STAT_PENALTY,
  EFFECT_GROUP_STOP_DEFENSE,
  EFFECT_GROUP_SWORDS,
  EFFECT_GROUP_TERRAIN,
  effectGroupForCardId,
} from './data/effect-groups.generated.js';
import { card, cardName } from './catalog.js';
import {
  damage,
  effectiveAttack,
  effectiveDefense,
  heal,
  opponentOf,
  refreshTerrain,
  replaceSide,
  withEvent,
} from './state.js';
import type { RitualTribute } from './constants.js';
import type { DuelState, FieldCard, FieldZone, Side, SideState } from './types.js';

/* ------------------------------------------------------------ Utilidad ----- */

/** `Fake Trap`, id 690. */
const FAKE_TRAP_ID = 690;
/** Primer id de trampa y ultimo, para reconocer la fila de trampas. */
const TRAP_FIRST_ID = 681;
const TRAP_LAST_ID = 690;

function zoneIsMonsters(zone: FieldZone): boolean {
  return zone === 1 || zone === 2;
}

/** El nombre de un terreno, para la etiqueta del evento. */
function terrainName(terrain: number): string {
  return ['Normal', 'Forest', 'Wasteland', 'Mountain', 'Sogen', 'Umi', 'Yami'][terrain] ?? 'Normal';
}

/** Sustituye un lado del estado. */
function withSide(state: DuelState, side: Side, value: SideState): DuelState {
  return { ...state, sides: replaceSide(state.sides, side, value) };
}

/**
 * Reescribe las cartas de una fila. `update` devuelve la carta nueva, o `null`
 * si la carta debe desaparecer del campo.
 */
function mapRow(
  state: DuelState,
  side: Side,
  zone: FieldZone,
  update: (field: FieldCard) => FieldCard | null,
): DuelState {
  const current = state.sides[side];
  const monsters = zoneIsMonsters(zone);
  const row = monsters ? [...current.monsters] : [...current.backRow];
  let changed = false;

  for (let slot = 0; slot < row.length; slot += 1) {
    const field = row[slot];
    if (field === null) continue;
    const updated = update(field);
    if (updated === null) {
      row[slot] = null;
      changed = true;
    } else if (updated !== field) {
      row[slot] = updated;
      changed = true;
    }
  }

  if (!changed) return state;
  const next = { ...current, ...(monsters ? { monsters: row } : { backRow: row }) };
  return withSide(state, side, next);
}

/** Quita la carta de una zona concreta y emite el evento de destruccion. */
function destroyAt(state: DuelState, side: Side, zone: FieldZone, slot: number): DuelState {
  const removed = mapRow(state, side, zone, (field) =>
    field.slot === slot ? null : field,
  );
  const field = state.sides[side][zoneIsMonsters(zone) ? 'monsters' : 'backRow'][slot];
  if (field === null) return state;
  return withEvent(removed, { type: 'destroy', side, zone, slot, cardId: field.cardId });
}

/** Elimina de una fila todas las cartas que cumplan el predicado. */
function destroyWhere(
  state: DuelState,
  side: Side,
  zone: FieldZone,
  predicate: (field: FieldCard) => boolean,
): DuelState {
  const doomed: number[] = [];
  const row = state.sides[side][zoneIsMonsters(zone) ? 'monsters' : 'backRow'];
  for (const field of row) {
    if (field !== null && predicate(field)) doomed.push(field.slot);
  }
  let next = state;
  for (const slot of doomed) next = destroyAt(next, side, zone, slot);
  return next;
}

/* --------------------------------------------------------- Magias ---------- */

/**
 * Punto de entrada de una carta sin monstruo: decide que grupo de efecto le
 * toca y lo aplica.
 *
 * El retail no decide por id de carta: `DuelEffect_StartCardEffect` convierte
 * la carta a un *effect id* y `DuelEffect_UpdateCardEffect` mira ese indice en
 * `gDuelEffect_abGroupByEffectId`, una tabla de 104 entradas, y despacha por el
 * grupo (`src/game/duel_effect_tables.c`, `notes/magic-effect-groups.md`). Esa
 * tabla es `data/effect-groups.generated.ts`, y aqui se consulta igual:
 * `effectGroupForCardId` hace la conversion carta -> effect id y el `switch`
 * siguiente hace grupo -> handler. La lista de ids que cada familia agrupa sale
 * del generador, no de una transcripcion a mano.
 *
 * Cada grupo tiene DOS handlers y se ejecuta el segundo. El primero es
 * `DuelEffect_ClearCardEffect` para todos menos Swords y Ritual, cuyos pares son
 * `DuelEffect_StartSwords`/`DuelEffect_ApplySwords` y
 * `DuelEffect_StartRitual`/`DuelEffect_ApplyRitual`. Aqui no hay fase de
 * "empezar": el motor resuelve el hechizo entero de una vez, asi que solo
 * existe el handler de aplicacion.
 *
 * Un grupo 0 (ni una trampa, ni un equip, ni un efecto sin trabajo) se gasta sin
 * hacer nada, que es lo que hace el retail con `DuelEffect_ClearCardEffect`. Los
 * rituales (grupo 12) tampoco entran aqui: se resuelven por su propia accion,
 * asi que caen en ese mismo caso.
 */
export function applySpell(state: DuelState, side: Side, cardId: number): DuelState {
  const current = state.sides[side];
  const stats = { ...current.stats, spellsUsed: current.stats.spellsUsed + 1 };
  const next: DuelState = { ...state, sides: replaceSide(state.sides, side, { ...current, stats }) };

  switch (effectGroupForCardId(cardId)) {
    case EFFECT_GROUP_TERRAIN:
      return applyTerrain(next, side, terrainOf(cardId));
    case EFFECT_GROUP_LIFE_POINT_RECOVERY:
      return applyRecovery(next, side, cardId);
    case EFFECT_GROUP_DIRECT_DAMAGE:
      return applyDirectDamage(next, side, cardId);
    case EFFECT_GROUP_BOARD_DESTRUCTION:
      // Dark Hole y Dragon Capture Jar comparten handler en el retail; la
      // diferencia la marca la carta, no el grupo.
      return cardId === DARK_HOLE_ID
        ? applyDarkHole(next)
        : applyDragonCaptureJar(next, side);
    case EFFECT_GROUP_MONSTER_REMOVAL:
      return applyMonsterRemoval(next, side, cardId);
    case EFFECT_GROUP_STOP_DEFENSE:
      return applyStopDefense(next, side);
    case EFFECT_GROUP_RAIGEKI:
      return applyRaigeki(next, side);
    case EFFECT_GROUP_DARK_PIERCING_LIGHT:
      return applyDarkPiercingLight(next, side);
    case EFFECT_GROUP_STAT_PENALTY:
      // Spellbinding Circle quita un nivel; Shadow Spell, dos.
      return applyStatPenalty(next, side, cardId === SPELLBINDING_CIRCLE_ID ? 1 : 2);
    case EFFECT_GROUP_SWORDS:
      return applySwords(next, side);
    case EFFECT_GROUP_CURSEBREAKER:
      return applyCursebreaker(next, side);
    case EFFECT_GROUP_HARPIES_FEATHER_DUSTER:
      return applyHarpiesFeatherDuster(next, side);
    default:
      return withEvent(next, { type: 'effect', label: cardName(cardId) });
  }
}

/** Terreno 1..6 de una carta de campo, o 0 si la carta no es un terreno. */
function terrainOf(cardId: number): number {
  for (let terrain = 1; terrain <= 6; terrain += 1) {
    if (TERRAIN_CARD_IDS[terrain] === cardId) return terrain;
  }
  return 0;
}

/**
 * Cambio de terreno. El terreno es compartido: afecta a los dos lados, asi que
 * recalcula el modificador de todos los monstruos en juego.
 *
 * Hay que GUARDAR el terreno en el estado, no solo recalcular lo que ya esta en
 * el campo: `makeFieldCard` lee `state.terrain` al entrar una carta, asi que sin
 * esto un monstruo invocado despues del terreno entraria sin bonificacion. El
 * campo es compartido, de modo que ninguno de los dos lados es dueno de el.
 */
export function applyTerrain(state: DuelState, _side: Side, terrain: number): DuelState {
  const announced = withEvent(state, { type: 'effect', label: `Terreno: ${terrainName(terrain)}` });
  return { ...announced, terrain, sides: refreshTerrain(announced.sides, terrain) };
}

/** Curacion de vida al usuario, con techo en sus PV de inicio. */
export function applyRecovery(state: DuelState, side: Side, cardId: number): DuelState {
  return heal(state, side, lifePointRecovery(cardId));
}

/**
 * Danio directo al rival, con piso en 0.
 *
 * El rival puede haber puesto `Bad Reaction to Simochi`, que convierte la
 * curacion en danio, pero no al revés: esta carta hace danio y ya. El danio lo
 * aplica el codigo de trampa del duelo cuando toca.
 */
export function applyDirectDamage(state: DuelState, side: Side, cardId: number): DuelState {
  return damage(state, opponentOf(side), directDamage(cardId));
}

/** `Stop Defense`: voltea un defensor rival a posicion de ataque. */
export function applyStopDefense(state: DuelState, side: Side): DuelState {
  const target = opponentOf(side);
  const announced = withEvent(state, { type: 'effect', label: 'Stop Defense' });
  for (let slot = 0; slot < 5; slot += 1) {
    const field = announced.sides[target].monsters[slot];
    if (field !== null && field.defensePosition) {
      return mapRow(announced, target, 1, (f) =>
        f.slot === slot ? { ...f, defensePosition: false } : f,
      );
    }
  }
  return announced;
}

/** `Dragon Capture Jar`: destruye los dragones del rival. */
export function applyDragonCaptureJar(state: DuelState, side: Side): DuelState {
  const target = opponentOf(side);
  const announced = withEvent(state, { type: 'effect', label: 'Dragon Capture Jar' });
  return destroyWhere(announced, target, 1, (f) => card(f.cardId)?.type === 0);
}

/**
 * `Dark Hole`: se lleva todas las cartas en juego de los dos lados, monstruos
 * y magicianos. El retail recorre los registros 5..14 y 20..29.
 */
export function applyDarkHole(state: DuelState): DuelState {
  const announced = withEvent(state, { type: 'effect', label: 'Dark Hole' });
  let next = announced;
  for (const side of [0, 1] as const) {
    next = destroyWhere(next, side, 2, () => true);
    next = destroyWhere(next, side, 3, () => true);
  }
  return next;
}

/** `Raigeki`: destruye todos los monstruos del rival. */
export function applyRaigeki(state: DuelState, side: Side): DuelState {
  const announced = withEvent(state, { type: 'effect', label: 'Raigeki' });
  return destroyWhere(announced, opponentOf(side), 2, () => true);
}

/**
 * `Swords of Revealing Light`: revela los monstruos boca abajo del rival y le
 * bloquea el ataque durante tres turnos.
 *
 * El contador interno arranca en 4, uno mas que la duracion, porque la fase de
 * robo lo resta antes de que ese lado actue (`notes/swords-of-revealing-light.md`).
 */
export function applySwords(state: DuelState, side: Side): DuelState {
  const target = opponentOf(side);
  const revealed = mapRow(state, target, 1, (f) => ({ ...f, faceDown: false }));
  const current = revealed.sides[target];
  const locked = withSide(revealed, target, {
    ...current,
    swordsTurnsRemaining: SWORDS_INITIAL_COUNTER,
  });
  return withEvent(locked, { type: 'effect', label: 'Swords of Revealing Light' });
}

/**
 * `Dark-piercing Light`: revela las cartas boca abajo de la fila S/T del lado
 * que esta en turno, y solo de ahi.
 *
 * El retail recorre `for (i = DUEL_FIELD_ROW_SIZE; i < DUEL_CARD_SIDE_RECORD_COUNT; i++)`
 * sobre `D_800907D8_2d[D_8009B1D5][i]`: `DUEL_FIELD_ROW_SIZE` es el ancho de una
 * fila, asi que el recorrido empieza en la SEGUNDA fila de ESE lado
 * (`D_8009B1D5` es el lado en turno, no los dos). No son las filas de monstruos
 * ni son las de los dos lados (`DuelEffect_ApplyDarkPiercingLight`,
 * `src/game/duel_card_effects.c:547-548`).
 */
export function applyDarkPiercingLight(state: DuelState, side: Side): DuelState {
  const announced = withEvent(state, { type: 'effect', label: 'Dark-piercing Light' });
  return mapRow(announced, side, 3, (f) => ({ ...f, faceDown: false }));
}

/**
 * `Spellbinding Circle` y `Shadow Spell`: bajan los monstruos rivales.
 *
 * La reduccion es permanente: vive en `statModifier` hasta que un
 * `Cursebreaker` la deshaga o el monstruo salga del campo. El retail para en
 * -32768 en vez de dar la vuelta en el halfword con signo.
 */
export function applyStatPenalty(state: DuelState, side: Side, levels: number): DuelState {
  const target = opponentOf(side);
  const label = levels === 1 ? 'Spellbinding Circle' : 'Shadow Spell';
  const announced = withEvent(state, { type: 'effect', label });
  const penalty = levels * STAT_PENALTY_PER_LEVEL;
  return mapRow(announced, target, 2, (f) => ({
    ...f,
    statModifier: Math.max(-32768, f.statModifier - penalty),
  }));
}

/**
 * `Cursebreaker`: deshace las reducciones de nivel de los monstruos propios.
 *
 * El `statModifier` mezcla varias cosas: el bonus que aporta el equip (positivo)
 * y las penalizaciones de `Spellbinding Circle` y `Shadow Spell` (negativas).
 * Cursebreaker levanta las penalizaciones y deja intacto el bonus del equip, asi
 * que el resultado es el maximo entre lo que hay y el suelo que marca el equip.
 *
 * El suelo se tomaba antes como `Math.min(statModifier, equipBonus)`, que con un
 * modificador negativo se quedaba siempre en el propio modificador: la carta no
 * hacia nada, con equip o sin el. Comprueba el caso dificil: con Spellbinding
 * Circle puesta (-1000) y un equip (+500) el modificador es -500, y el piso son
 * los +500 del equip, no -500.
 */
export function applyCursebreaker(state: DuelState, side: Side): DuelState {
  const announced = withEvent(state, { type: 'effect', label: 'Cursebreaker' });
  return mapRow(announced, side, 2, (f) => {
    const equipped = f.equipId !== null ? equipBonus(f.equipId) : 0;
    return { ...f, statModifier: Math.max(f.statModifier, equipped) };
  });
}

/** `Harprie's Feather Duster`: destruye las magias y trampas del rival. */
export function applyHarpiesFeatherDuster(state: DuelState, side: Side): DuelState {
  const announced = withEvent(state, { type: 'effect', label: "Harprie's Feather Duster" });
  return destroyWhere(announced, opponentOf(side), 3, () => true);
}

/* ------------------------------------------- Eliminacion por tipo ---------- */

/**
 * Elimina monstruos rivales por tipo, o por ATK si la carta es `Crush Card`.
 *
 * Un selector mayor o igual a 21 es el umbral de ATK multiplicado por diez;
 * cualquier otro es un tipo de monstruo.
 */
export function applyMonsterRemoval(state: DuelState, side: Side, cardId: number): DuelState {
  const rule = MONSTER_REMOVAL_RULES.find(([id]) => id + 600 === cardId);
  if (rule === undefined) return state;

  const target = opponentOf(side);
  const selector = rule[1];
  const byAttack = selector >= MONSTER_REMOVAL_TYPE_LIMIT;
  const attackThreshold = selector * 10;
  const typeSelector = byAttack ? -1 : selector;

  const announced = withEvent(state, { type: 'effect', label: cardName(cardId) });
  return destroyWhere(announced, target, 2, (f) =>
    byAttack ? effectiveAttack(f) >= attackThreshold : card(f.cardId)?.type === typeSelector,
  );
}

/* -------------------------------------------------------- Ritual ---------- */

/**
 * Valida si un conjunto de monstruos cumple una receta de ritual.
 *
 * El retail exige tres registros ocupados distintos de la fila de monstruos
 * propia. Los monstruos boca abajo si cuentan. Devuelve el id del monstruo
 * resultante si la receta se cumple, o 0 si falta material.
 */
export function checkRitual(tributes: readonly FieldCard[], ritualId: number): number {
  const recipe = ritualRecipe(ritualId);
  if (recipe === undefined) return 0;
  return matchRitualTributes(tributes, ritualId) === null ? 0 : recipe.resultId;
}

/**
 * Los tres monstruos concretos que cumplen una receta, o `null` si no hay
 * material. `Duel_CheckRitual` devuelve los registros que despues usa el effect
 * handler para retirarlos del campo, asi que el emparejamiento y la eleccion de
 * a quien pagar tienen que ser la misma cosa: por eso vive aqui y lo usan tanto
 * esta comprobacion como `engine.ts`.
 */
export function matchRitualTributes(
  tributes: readonly FieldCard[],
  ritualId: number,
): FieldCard[] | null {
  const recipe = ritualRecipe(ritualId);
  if (recipe === undefined) return null;
  if (tributes.length < recipe.tributes.length) return null;

  const found: (FieldCard | undefined)[] = new Array<FieldCard | undefined>(recipe.tributes.length);
  const taken = new Set<number>();

  // Dos pasadas, como `Duel_CheckRitual` (`duel_check_ritual.c:413-491`): una
  // primera que toma, para cada tributo, una carta que sea EXACTAMENTE ese id, y
  // una segunda que rellena lo que falte. El retail compara en la segunda pasada
  // el id base de una copia; aqui no hay variantes de carta, asi que el segundo
  // turno es el del matcher aproximado, que solo existe para las 21 recetas sin
  // ids conocidos. El orden importa: sin las dos pasadas, un tributo exacto
  // podia quedarse sin carta porque una aproximacion se llevo antes la que le
  // tocaba.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let slot = 0; slot < recipe.tributes.length; slot += 1) {
      if (found[slot] !== undefined) continue;
      const requirement = recipe.tributes[slot] as RitualTribute;
      if ((requirement.kind === 'exact') !== (pass === 0)) continue;

      const match = tributes.findIndex(
        (field, index) => !taken.has(index) && tributeMatches(field, requirement),
      );
      if (match === -1) return null;
      taken.add(match);
      found[slot] = tributes[match];
    }
  }
  return found.filter((field): field is FieldCard => field !== undefined);
}

/**
 * Una carta cumple un requisito de tributo?
 *
 * `exact` es la comparacion del retail: el id de la carta y nada mas. El resto es
 * la aproximacion que sustituye a los 21 recetas cuyos ids estan en el disco, y
 * se marca como tal en `constants.ts`.
 */
export function tributeMatches(field: FieldCard, requirement: RitualTribute): boolean {
  if (requirement.kind === 'exact') return field.cardId === requirement.cardId;

  const data = card(field.cardId);
  if (data === undefined) return false;
  if (requirement.type !== undefined) return data.type === requirement.type;
  if (requirement.minAttack !== undefined && effectiveAttack(field) < requirement.minAttack) return false;
  if (requirement.defenseGreaterThanAttack !== undefined) {
    return effectiveDefense(field) > effectiveAttack(field) === requirement.defenseGreaterThanAttack;
  }
  // Un requisito aproximado sin condiciones admite cualquier monstruo.
  return true;
}

/* -------------------------------------------------------- Trampas --------- */

/** El umbral de una trampa, o `null` si el id no es una de las diez. */
export function trapThreshold(cardId: number): number | null {
  if (cardId < TRAP_FIRST_ID || cardId > TRAP_LAST_ID) return null;
  const index = cardId - TRAP_FIRST_ID;
  if (index < TRAP_THRESHOLDS.length) return TRAP_THRESHOLDS[index] as number;
  // Las tres ultimas (687-689) no responden a un ataque de ATK.
  return null;
}

/** Todas las trampas del campo de un lado. */
export function trapsInPlay(state: DuelState, side: Side): FieldCard[] {
  return state.sides[side].backRow.filter(
    (field): field is FieldCard => field !== null && field.cardId >= TRAP_FIRST_ID && field.cardId <= TRAP_LAST_ID,
  );
}

/**
 * Que trampa del campo se dispara ante un ataque de ATK `attackerAttack`.
 *
 * El retail recorre las trampas de la mas fuerte a la mas debil y dispara la
 * ultima que cubre el ataque, es decir **la mas debil que aun aplica**: Bear
 * Trap (1500) tiene prioridad sobre Widespread Ruin (cualquiera) porque su umbral
 * es mas restrictivo. La comparacion es inclusiva: `ATK <= umbral` dispara.
 *
 * El orden de recorrido importa: si se iterara el campo tal cual esta, el
 * resultado dependeria de en que zona se puso cada trampa.
 */
export function trapForAttack(
  state: DuelState,
  defendingSide: Side,
  attackerAttack: number,
): FieldCard | null {
  // De Widespread Ruin (el mas fuerte) a House of Adhesive Tape (el mas debil).
  const traps = trapsInPlay(state, defendingSide)
    .map((trap) => ({ trap, threshold: trapThreshold(trap.cardId) }))
    .filter((entry): entry is { trap: FieldCard; threshold: number } => entry.threshold !== null)
    .sort((a, b) => b.threshold - a.threshold);

  let candidate: FieldCard | null = null;
  for (const { trap, threshold } of traps) {
    if (attackerAttack <= threshold) candidate = trap;
  }
  return candidate;
}

/**
 * La trampa de recurso: `Fake Trap`, que no hace nada pero ocupa sitio. Si hay
 * una puesta, el retail la gasta en lugar de dejar pasar el ataque.
 */
export function fallbackTrap(state: DuelState, defendingSide: Side): FieldCard | null {
  return trapsInPlay(state, defendingSide).find((t) => t.cardId === FAKE_TRAP_ID) ?? null;
}

/** Consume una trampa concreta del campo y emite su evento. */
export function consumeTrap(state: DuelState, side: Side, trapCardId: number): DuelState {
  const trap = trapsInPlay(state, side).find((t) => t.cardId === trapCardId);
  if (trap === undefined) return state;
  const withoutTrap = destroyAt(state, side, 3, trap.slot);
  return withEvent(withoutTrap, { type: 'trap', cardId: trapCardId });
}

/** Si el lado tiene puesta una trampa concreta. */
export function hasTrap(state: DuelState, side: Side, trapCardId: number): boolean {
  return trapsInPlay(state, side).some((t) => t.cardId === trapCardId);
}

/* ------------------------------------------------- Banner de Exodia ------- */

/**
 * Si la mano del lado tiene las cinco piezas de Exodia a la vez.
 *
 * `Duel_HasAllExodiaPieces` exige una pieza de cada id 17..21 simultaneamente
 * en la mano, no repartidas por el juego.
 */
export function hasAllExodiaPieces(hand: readonly { readonly cardId: number }[]): boolean {
  const ids = new Set(hand.map((c) => c.cardId));
  return ids.has(17) && ids.has(18) && ids.has(19) && ids.has(20) && ids.has(21);
}