/**
 * La CPU.
 *
 * Una IA sencilla y deliberada: juega la carta mas util de la mano, ataca
 * cuando le conviene y termina el turno. No busca ninguna jugabilidad profunda,
 * pero juega de forma legal y coherente, que es lo que hace falta para tener
 * una partida contra el ordenador que valga.
 *
 * Usa el mismo motor que el jugador, asi que si la IA hiciera algo ilegal, el
 * motor se lo rechazaria igual que a un humano. Aqui solo se generan acciones.
 */

import { applyAction, card } from '@yfm/engine';
import type { DuelState, PlayerAction, Rng, Side } from '@yfm/engine';

/** Limite de acciones por turno, por si algo se encalla. */
const MAX_ACTIONS = 6;

/**
 * Juega el turno entero de la CPU y devuelve el estado resultante.
 *
 * El retail obliga a **una sola carta por turno** (`the-game.md` §5: "One card
 * must be placed every turn"), y opcionalmente **un solo ataque** con un
 * monstruo. La IA juega exactamente eso: una carta, un ataque, cerrar turno.
 *
 * El orden importa: primero el ataque (que puede abrir una brecha) o primero la
 * carta (que puede dejar al campo mas fuerte)? En el original no hay un orden
 * obligatorio, asi que aqui se ataca primero, que es lo que hace lamayoria de
 * los jugadores.
 */
export function cpuTurn(state: DuelState, rng: Rng): DuelState {
  let current = state;

  // Un ataque, como maximo.
  const attack = bestAttack(current, current.turn);
  if (attack !== null) {
    const attacked = applyAction(current, attack, rng);
    if (attacked !== current) current = attacked;
  }
  if (current.outcome !== null) return current;

  // Una carta, como maximo.
  const play = bestCardPlay(current, current.turn, rng);
  if (play !== null) {
    const played = applyAction(current, play, rng);
    if (played !== current) current = played;
  }
  if (current.outcome !== null) return current;

  // Cerrar el turno.
  const finished = applyAction(current, { type: 'ready' }, rng);
  return finished === current ? current : finished;
}

/** Acciones que se consideran en un turno, por si hace falta depurar. */
export const CPU_ACTION_BUDGET = MAX_ACTIONS;

/** El mejor ataque disponible: el que mas ventaja deja. */
function bestAttack(state: DuelState, side: Side): PlayerAction | null {
  const opponent = side === 0 ? 1 : 0;
  const attackers = state.sides[side].monsters
    .map((field, slot) => ({ field, slot }))
    .filter(
      (entry): entry is { field: NonNullable<typeof entry.field>; slot: number } =>
        entry.field !== null && !entry.field.defensePosition && !entry.field.usedThisTurn,
    );
  if (attackers.length === 0) return null;

  const defenders = state.sides[opponent].monsters
    .map((field, slot) => ({ field, slot }))
    .filter(
      (entry): entry is { field: NonNullable<typeof entry.field>; slot: number } => entry.field !== null,
    );

  // Sin monstruos rivales, cualquier atacante va directo a la vida.
  if (defenders.length === 0) {
    const best = attackers.reduce((a, b) =>
      attackValue(b.field) >= attackValue(a.field) ? b : a,
    );
    return { type: 'attack', slot: best.slot, target: null };
  }

  // Con rivales, se busca el intercambio mas favorable.
  let best: PlayerAction | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const attacker of attackers) {
    for (const defender of defenders) {
      const score = exchangeScore(attacker.field, defender.field);
      if (score > bestScore) {
        bestScore = score;
        best = { type: 'attack', slot: attacker.slot, target: defender.slot };
      }
    }
  }
  return best;
}

/** Cuanto vale atacar con una carta. */
function attackValue(field: NonNullable<DuelState['sides'][0]['monsters'][0]>): number {
  const data = card(field.cardId);
  if (data === undefined) return 0;
  return data.attack + field.statModifier + field.terrainModifier;
}

/** Cuanto vale defenderse. */
function defenseValue(field: NonNullable<DuelState['sides'][0]['monsters'][0]>): number {
  const data = card(field.cardId);
  if (data === undefined) return 0;
  if (field.defensePosition) return data.defense + field.statModifier + field.terrainModifier;
  return data.attack + field.statModifier + field.terrainModifier;
}

/**
 * Cuanto gana la CPU con este intercambio.
 *
 * Positivo significa que le conviene. Contra un defensor se compara ATK con
 * DEF; contra un atacante, ATK con ATK.
 */
function exchangeScore(
  attacker: NonNullable<DuelState['sides'][0]['monsters'][0]>,
  defender: NonNullable<DuelState['sides'][0]['monsters'][0]>,
): number {
  const atk = attackValue(attacker);
  const def = defenseValue(defender);

  if (defender.defensePosition) {
    if (atk > def) {
      // Rompe la defensa sin dano: bueno, pero el defensor no cae al suelo.
      return 50 + (atk - def);
    }
    // El atacante paga la diferencia: malo.
    return -(def - atk) * 2;
  }

  if (atk > def) {
    // Gana y hace dano al rival: lo mejor.
    return 100 + (atk - def);
  }
  if (atk === def) {
    // Empareje: se lleva al defensor por delante.
    return 40;
  }
  // Pierde el atacante y paga: muy malo.
  return -200 - (def - atk);
}

/**
 * La mejor carta de la mano para jugar.
 *
 * Un ataque directo sin monstruos rivales es lo mas urgente; si no, una Magia
 * de eliminacion, un invocacion fuerte, o una trampa que protect.
 */
function bestCardPlay(
  state: DuelState,
  side: Side,
  rng: import('@yfm/engine').Rng,
): PlayerAction | null {
  const hand = state.sides[side].hand;
  if (hand.length === 0) return null;

  const candidates: { score: number; action: PlayerAction }[] = [];

  hand.forEach((entry, index) => {
    const data = card(entry.cardId);
    if (data === undefined) return;

    // Magia: siempre(--cuando se puede) buena para la CPU.
    if (data.type === 20) {
      const score = magicScore(entry.cardId, state, side);
      if (score > 0) candidates.push({ score, action: { type: 'activate', cardIndex: index } });
      return;
    }

    // Monstruo: invocar al mas fuerte si hay hueco.
    if (data.type < 20) {
      const freeSlot = state.sides[side].monsters.findIndex((m) => m === null);
      if (freeSlot === -1) return;
      const score = data.attack;
      candidates.push({
        score,
        action: { type: 'summon', cardIndex: index, slot: freeSlot, useStar2: false },
      });
      return;
    }

    // Trampa: solo si el rival tiene monstruos a los que frenar.
    if (data.type === 21) {
      const freeSlot = state.sides[side].backRow.findIndex((m) => m === null);
      if (freeSlot === -1) return;
      const opponentMonsters = countOpponentMonsters(state, side);
      if (opponentMonsters === 0) return;
      candidates.push({
        score: 20 + opponentMonsters * 10,
        action: { type: 'set', cardIndex: index, slot: freeSlot },
      });
    }
  });

  if (candidates.length === 0) return null;

  // Entre jugadas de valor parecido, se elige una al azar: evita que la CPU
  // sea predecible hasta el punto de parecer un robot.
  const best = candidates.reduce((max, entry) => Math.max(max, entry.score), 0);
  const top = candidates.filter((entry) => entry.score >= best - 5);
  return rng.pick(top).action;
}

/** Cuanto le conviene a la CPU una Magia concreta ahora mismo. */
function magicScore(cardId: number, state: DuelState, side: Side): number {
  const opponent = side === 0 ? 1 : 0;
  const opponentMonsters = countOpponentMonsters(state, side);

  // Una eliminacion que va al campo rival vale mucho.
  const removal = [329, 336, 337, 653, 656, 660, 661, 662, 663, 664, 672];
  if (removal.includes(cardId)) {
    if (opponentMonsters === 0) return 0;
    // Raigeki y Dark Hole limpian el campo entero.
    if (cardId === 336 || cardId === 337) return 200;
    return 80 + opponentMonsters * 20;
  }

  // El terreno solo tiene efecto si hay monstruos de los que lo aprovecharian.
  if (cardId >= 330 && cardId <= 335) return opponentMonsters > 0 ? 40 : 10;

  // Swords: bloquea al rival y revela su campo.
  if (cardId === 348) return opponentMonsters > 0 ? 70 : 40;

  // Las cartas de vida: cura si esta herida.
  if (cardId >= 338 && cardId <= 342) {
    const missing = state.sides[side].maxLifePoints - state.sides[side].lifePoints;
    if (missing <= 0) return 0;
    return 50 + Math.min(missing, 2000);
  }

  // Dano directo: casi siempre bueno si no se mata a si mismo.
  if (cardId >= 343 && cardId <= 347) {
    const opponentLife = state.sides[opponent].lifePoints;
    const units = cardId - 343;
    const damage = [50, 100, 200, 500, 1000][units] ?? 0;
    if (damage === 0) return 0;
    // Si el rival esta a nada, mejor no gastar la carta.
    if (opponentLife <= damage) return 120; // lo remata
    return 30 + damage / 20;
  }

  // Lo demas: valor bajo pero no nulo.
  return 10;
}

/** Cuantos monstruos tiene el rival. */
function countOpponentMonsters(state: DuelState, side: Side): number {
  const opponent = side === 0 ? 1 : 0;
  return state.sides[opponent].monsters.filter((m) => m !== null).length;
}