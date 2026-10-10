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
  CURSEBREAKER_ID,
  DARK_HOLE_ID,
  DARK_PIERCING_LIGHT_ID,
  DRAGON_CAPTURE_JAR_ID,
  HARPIES_FEATHER_DUSTER_ID,
  MONSTER_REMOVAL_RULES,
  MONSTER_REMOVAL_TYPE_LIMIT,
  RAIGEKI_ID,
  SHADOW_SPELL_ID,
  SPELLBINDING_CIRCLE_ID,
  STAT_PENALTY_PER_LEVEL,
  STOP_DEFENSE_ID,
  SWORDS_INITIAL_COUNTER,
  TRAP_THRESHOLDS,
  directDamage,
  equipBonus,
  lifePointRecovery,
  ritualRecipe,
} from './constants.js';
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

/** `Swords of Revealing Light`, id 348. */
const SWORDS_ID = 348;
/** `Fake Trap`, id 690. */
const FAKE_TRAP_ID = 690;
/** Primer id de trampa y ultimo, para reconocer la fila de trampas. */
const TRAP_FIRST_ID = 681;
const TRAP_LAST_ID = 690;

/** `DARK_PIERCING_LIGHT` revela tambien los monstruos propios (quirk del retail). */
const DARK_PIERCING_REVEALS_OWN_FIELD = true;

/** Los ids de carta de los seis terrenos, indexados por terreno 1..6. */
const TERRAIN_CARD_IDS = [0, 330, 331, 332, 333, 334, 335];

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
 * toca por su id y lo aplica.
 *
 * Un hechizo que no tiene ningun grupo asignado se gasta sin hacer nada, que es
 * lo que hace el retail con el grupo 0.
 */
export function applySpell(state: DuelState, side: Side, cardId: number): DuelState {
  const current = state.sides[side];
  const stats = { ...current.stats, spellsUsed: current.stats.spellsUsed + 1 };
  let next: DuelState = { ...state, sides: replaceSide(state.sides, side, { ...current, stats }) };

  // Los seis terrenos, por id exacto.
  const terrain = TERRAIN_CARD_IDS.indexOf(cardId);
  if (terrain >= 1) return applyTerrain(next, side, terrain);

  // Curacion (338-342) y danio directo (343-347), por rango de id.
  if (cardId >= 338 && cardId <= 342) return applyRecovery(next, side, cardId);
  if (cardId >= 343 && cardId <= 347) return applyDirectDamage(next, side, cardId);

  // Eliminacion por tipo o por ATK.
  if (MONSTER_REMOVAL_RULES.some(([id]) => id + 600 === cardId)) {
    return applyMonsterRemoval(next, side, cardId);
  }

  switch (cardId) {
    case STOP_DEFENSE_ID:
      return applyStopDefense(next, side);
    case DRAGON_CAPTURE_JAR_ID:
      return applyDragonCaptureJar(next, side);
    case DARK_HOLE_ID:
      return applyDarkHole(next);
    case RAIGEKI_ID:
      return applyRaigeki(next, side);
    case SWORDS_ID:
      return applySwords(next, side);
    case SPELLBINDING_CIRCLE_ID:
      return applyStatPenalty(next, side, 1);
    case SHADOW_SPELL_ID:
      return applyStatPenalty(next, side, 2);
    case DARK_PIERCING_LIGHT_ID:
      return applyDarkPiercingLight(next);
    case CURSEBREAKER_ID:
      return applyCursebreaker(next, side);
    case HARPIES_FEATHER_DUSTER_ID:
      return applyHarpiesFeatherDuster(next, side);
    default:
      return withEvent(next, { type: 'effect', label: cardName(cardId) });
  }
}

/**
 * Cambio de terreno. El terreno es compartido: afecta a los dos lados, asi que
 * recalcula el modificador de todos los monstruos en juego.
 */
export function applyTerrain(state: DuelState, _side: Side, terrain: number): DuelState {
  const announced = withEvent(state, { type: 'effect', label: `Terreno: ${terrainName(terrain)}` });
  return { ...announced, sides: refreshTerrain(announced.sides, terrain) };
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
 * `Dark-piercing Light`: revela los monstruos boca abajo.
 *
 * El retail recorre los slots 5..14, o sea las dos filas de monstruos, asi que
 * revela tambien los propios. Es un comportamiento genuino del retail, por eso
 * va con su constante y no escondido.
 */
export function applyDarkPiercingLight(state: DuelState): DuelState {
  const announced = withEvent(state, { type: 'effect', label: 'Dark-piercing Light' });
  const sides = DARK_PIERCING_REVEALS_OWN_FIELD ? ([0, 1] as const) : ([state.turn] as const);
  let next = announced;
  for (const side of sides) {
    next = mapRow(next, side, 2, (f) => ({ ...f, faceDown: false }));
  }
  return next;
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
 * El `statModifier` mezcla varias cosas (equips positivos, penalizaciones
 * negativas), asi que solo se levanta la parte negativa y el bonus del equip se
 * conserva.
 */
export function applyCursebreaker(state: DuelState, side: Side): DuelState {
  const announced = withEvent(state, { type: 'effect', label: 'Cursebreaker' });
  return mapRow(announced, side, 2, (f) => {
    const equipped = f.equipId !== null ? equipBonus(f.equipId) : 0;
    // Cuanto del modificador viene del equip: eso no se toca.
    const fromEquip = Math.min(f.statModifier, equipped);
    const fromOther = f.statModifier - fromEquip;
    return { ...f, statModifier: fromEquip + Math.max(0, fromOther) };
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
  if (tributes.length < recipe.tributes.length) return 0;

  // Cada requisito de la receta necesita una carta distinta.
  const used = new Set<number>();
  for (const requirement of recipe.tributes) {
    const match = tributes.findIndex(
      (field, index) => !used.has(index) && tributeMatches(field, requirement),
    );
    if (match === -1) return 0;
    used.add(match);
  }
  return recipe.resultId;
}

/** Una carta cumple un requisito de tributo? */
function tributeMatches(field: FieldCard, requirement: RitualTribute): boolean {
  const data = card(field.cardId);
  if (data === undefined) return false;

  if (requirement.cardId !== undefined) return data.id === requirement.cardId;
  if (requirement.type !== undefined) return data.type === requirement.type;
  if (requirement.level !== undefined) return data.level === requirement.level;
  if (requirement.minAttack !== undefined && effectiveAttack(field) < requirement.minAttack) return false;
  if (requirement.minDefense !== undefined && effectiveDefense(field) < requirement.minDefense) return false;
  if (requirement.defenseGreaterThanAttack !== undefined) {
    const stronger = effectiveDefense(field) > effectiveAttack(field);
    if (requirement.defenseGreaterThanAttack !== stronger) return false;
  }
  // Un requisito sin condiciones admite cualquier monstruo.
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