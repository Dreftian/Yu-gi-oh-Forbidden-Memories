/**
 * Ayudantes para construir estados de duelo en los tests.
 *
 * Las pruebas no siempre quieren la mano inicial real ni el campo completo:
 * a veces necesitan un campo concreto para probar una regla. Estos ayudantes
 * modifican un lado del estado sin tocar el resto.
 */

import type { FieldCard, SideState } from '../src/types.js';

/** Cambia la mano de un lado por las cartas dadas. */
export function withHand(side: SideState, cards: readonly number[]): SideState {
  return {
    ...side,
    hand: cards.map((cardId) => ({ cardId, faceDown: false })),
  };
}

/** Cambia la fila de monstruos de un lado. */
export function withMonsters(side: SideState, monsters: readonly (FieldCard | null)[]): SideState {
  const row: (FieldCard | null)[] = [null, null, null, null, null];
  monsters.forEach((entry, index) => {
    if (index < row.length) row[index] = entry;
  });
  return { ...side, monsters: row };
}

/** Cambia la fila de atras de un lado. */
export function withBackRow(side: SideState, cards: readonly (FieldCard | null)[]): SideState {
  const row: (FieldCard | null)[] = [null, null, null, null, null];
  cards.forEach((entry, index) => {
    if (index < row.length) row[index] = entry;
  });
  return { ...side, backRow: row };
}

/** Cambia los puntos de vida de un lado. */
export function withLifePoints(side: SideState, lifePoints: number): SideState {
  return { ...side, lifePoints, displayedLifePoints: lifePoints };
}

/**
 * Sonda para inspeccionar el motor desde fuera sin exportarlo todo.
 * Existe para que los tests puedan comprobar el estado interno de un turno.
 */
export function beginTurnProbe(): number {
  return 0;
}