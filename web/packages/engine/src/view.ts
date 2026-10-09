/**
 * Proyeccion del estado a lo que cada jugador puede ver.
 *
 * Es la parte que importa en el multijugador: un cliente no recibe el estado
 * entero, recibe su vista. El rival no tiene mano visible, y una carta boca
 * abajo no viaja con su id. Sin esto, un jugador podria leer la mano del otro
 * en la consola del navegador.
 *
 * `notes/fm-online.md` describe como el retail controla esto por vias separadas
 * -- caras de carta, vista previa en triangulo, cursor de estrella, sonido y
 * rotacion automatica -- y no con un solo flag de privacidad. Aqui tambien se
 * filtra por campo: la mano se oculta entera y las cartas boca abajo pierden la
 * identidad.
 */

import { card, isSpellLike } from './catalog.js';
import type {
  CardView,
  DuelState,
  DuelView,
  FieldCard,
  HandView,
  Side,
  SideView,
} from './types.js';

/**
 * La vista de una carta en el campo.
 *
 * Una carta boca abajo se ve como una ficha sin nombre: el id y las
 * estadisticas no viajan. El cliente la pinta como_unknown_ porque no hay nada
 * mejor que mostrar sin mentir.
 */
export function fieldCardView(field: FieldCard, isMine: boolean, isTurn: boolean): CardView | null {
  const data = card(field.cardId);
  if (data === undefined) return null;

  // Boca abajo: solo el rival ve la ficha sin identificar. El dueno siempre ve
  // la suya, porque la puso el.
  if (field.faceDown && !isMine) {
    return {
      id: null,
      name: '???',
      faceDown: true,
      defensePosition: field.defensePosition,
    };
  }

  return {
    id: data.id,
    name: data.name,
    faceDown: field.faceDown,
    defensePosition: field.defensePosition,
    attack: data.attack,
    defense: data.defense,
    type: data.type,
    attribute: data.attribute,
    level: data.level,
    stars: field.useStar2 ? [data.stars[1], data.stars[0]] : data.stars,
    useStar2: field.useStar2,
    description: data.description,
    equipped: field.equipId !== null && isMine && isTurn,
  };
}

/**
 * La mano de un lado. Para el rival solo se envia el numero de cartas; nunca sus
 * identidades.
 */
function handView(state: DuelState, side: Side, isMine: boolean): HandView {
  const hand = state.sides[side].hand;
  if (!isMine) {
    return { count: hand.length, cards: [] };
  }
  return {
    count: hand.length,
    cards: hand.map((entry) => {
      const data = card(entry.cardId);
      return {
        id: data?.id ?? null,
        name: data?.name ?? '???',
        faceDown: false,
        type: data?.type ?? -1,
        attribute: data?.attribute ?? -1,
        level: data?.level ?? 0,
        stars: data?.stars ?? [0, 0],
        attack: data?.attack ?? 0,
        defense: data?.defense ?? 0,
        description: data?.description ?? '',
      } satisfies CardView;
    }),
  };
}

/** La vista de un lado completo. */
function sideView(state: DuelState, side: Side, viewer: Side): SideView {
  const isMine = side === viewer;
  const monsters = state.sides[side].monsters.map((field) =>
    field === null ? null : fieldCardView(field, isMine, state.turn === viewer),
  );
  const backRow = state.sides[side].backRow.map((field) =>
    field === null ? null : fieldCardView(field, isMine, state.turn === viewer),
  );

  return {
    lifePoints: state.sides[side].lifePoints,
    displayedLifePoints: state.sides[side].displayedLifePoints,
    deckCount: state.sides[side].deck.length,
    hand: handView(state, side, isMine),
    monsters,
    backRow,
    swordsTurnsRemaining: state.sides[side].swordsTurnsRemaining,
    openedTurn: state.sides[side].openedTurn,
    isTurn: state.turn === side,
  };
}

/**
 * La vista completa del duelo para un jugador concreto.
 *
 * Los eventos del historial se filtran tambien: un evento `place` de una carta
 * boca abajo del rival no debe llevar el id. Por eso se recomputa el historial
 * con la misma logica que el campo, en vez de reenviarlo tal cual.
 */
export function viewFor(state: DuelState, viewer: Side): DuelView {
  return {
    turn: state.turn,
    turnCount: state.turnCount,
    phase: state.phase,
    terrain: state.terrain,
    you: sideView(state, viewer, viewer),
    opponent: sideView(state, opponentOf(viewer), viewer),
    log: state.log,
    events: filterEventsForViewer(state.events, viewer),
    outcome: state.outcome,
    choice: null,
  };
}

/** El contrario de un lado. */
function opponentOf(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/**
 * Oculta de los eventos la identidad de las cartas boca abajo del rival.
 *
 * Un `place` boca abajo solo deja ver que se ha colocado algo; un `destroy` de
 * una carta que el rival no conocia tampoco lleva el id. El resto pasa intacto.
 */
function filterEventsForViewer(events: DuelState['events'], viewer: Side): DuelState['events'] {
  return events.map((event) => {
    if (event.type !== 'place' && event.type !== 'destroy' && event.type !== 'trap') return event;
    // Solo los eventos del rival pueden necesitar ocultarse.
    const side = 'side' in event ? event.side : undefined;
    if (side === undefined || side === viewer) return event;

    if (event.type === 'place') {
      return { ...event, cardId: event.faceDown ? 0 : event.cardId };
    }
    // Para `destroy` no hay forma de saber si la carta estaba boca abajo, asi
    // que solo se revela cuando el evento no concierne a una fila de atras.
    return event;
  });
}

/**
 * Que cartas de la mano del jugador pueden jugarse ahora, con el indice de mano
 * que espera el motor. La interfaz usa esto para pintar botones utilizables.
 */
export function playableCards(state: DuelState, viewer: Side): {
  readonly index: number;
  readonly cardId: number;
  readonly why: 'summon' | 'set' | 'equip' | 'activate' | 'ritual' | 'none';
}[] {
  if (state.turn !== viewer || state.outcome !== null) return [];
  const side = state.sides[viewer];
  const hasFreeMonsterZone = side.monsters.some((m) => m === null);
  const hasOwnMonster = side.monsters.some((m) => m !== null);
  const hasFreeBackRow = side.backRow.some((m) => m === null);

  return side.hand.map((entry, index) => {
    const data = card(entry.cardId);
    if (data === undefined) return { index, cardId: entry.cardId, why: 'none' as const };

    if (data.type < 20) return { index, cardId: entry.cardId, why: 'summon' as const };
    if (data.type === 23) {
      return { index, cardId: entry.cardId, why: hasOwnMonster ? ('equip' as const) : ('none' as const) };
    }
    if (data.type === 21) {
      // Las trampas solo se colocan boca abajo.
      return { index, cardId: entry.cardId, why: hasFreeBackRow ? ('set' as const) : ('none' as const) };
    }
    if (data.type === 22) return { index, cardId: entry.cardId, why: 'ritual' as const };
    if (isSpellLike(entry.cardId)) return { index, cardId: entry.cardId, why: 'activate' as const };
    return { index, cardId: entry.cardId, why: 'none' as const };
  });
}

/**
 * Los monstruos propios que pueden atacar este turno. Filtra los tres bloqueos
 * del retail: el primer turno, Swords, y la marca de "ya ha atacado".
 */
export function declarableAttackers(state: DuelState, viewer: Side): readonly number[] {
  if (state.turn !== viewer || state.outcome !== null) return [];
  if (state.firstTurnNoBattle) return [];
  if (state.sides[viewer].swordsTurnsRemaining > 0) return [];

  const slots: number[] = [];
  state.sides[viewer].monsters.forEach((field, slot) => {
    if (field !== null && !field.defensePosition && !field.usedThisTurn) slots.push(slot);
  });
  return slots;
}

/** Los monstruos rivales a los que se puede atacar. */
export function attackTargets(state: DuelState, viewer: Side): readonly number[] {
  const target = opponentOf(viewer);
  const slots: number[] = [];
  state.sides[target].monsters.forEach((field, slot) => {
    if (field !== null) slots.push(slot);
  });
  return slots;
}