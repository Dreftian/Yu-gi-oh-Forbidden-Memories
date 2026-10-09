/**
 * Una partida en curso, con su motor de duelo.
 *
 * El servidor la mantiene viva. Cada accion del jugador se aplica aqui con el
 * motor y el resultado se reparte ya proyectado a la vista de cada quien. Como
 * el motor es determinista y la semilla es del servidor, los dos clientes
 * convergen sin necesidad de sincronizar fotogramas: basta con queapliquen las
 * mismas acciones, y eso lo garantiza el servidor.
 */

import { DuelSession, viewFor } from '@yfm/engine';
import type { DuelView, PlayerAction } from '@yfm/engine';
import type { Room } from './matchmaker.js';

/** Un jugador dentro de una partida. */
export interface Seat {
  /** Posicion en el duelo: 0 o 1. */
  readonly side: 0 | 1;
  readonly playerId: string;
  readonly name: string;
  /** Ultima vez que se le vio por el socket. */
  lastSeen: number;
}

/** Como termina una partida, para el historial en memoria. */
export interface MatchRecord {
  readonly roomId: string;
  readonly players: readonly { readonly id: string; readonly name: string }[];
  readonly winnerName: string;
  readonly winnerSide: 0 | 1;
  readonly finishedAt: number;
  readonly turns: number;
}

/**
 * Empareja la sesion del motor con los dos asientos de la partida.
 *
 * `firstSide` decide quien empieza. El retail siempre empieza el jugador, asi
 * que aqui el que creo la sala empieza; en la cola, el que entro antes. Se
 * invierte para que ambos lados vean su campo abajo.
 */
export class Match {
  private readonly session: DuelSession;
  private readonly seats: [Seat, Seat];
  private finished = false;

  constructor(
    readonly room: Room,
    players: readonly { readonly id: string; readonly name: string }[],
    seed: number,
    /** Puntos de vida iniciales de cada lado, en orden de asiento. */
    lifePoints: readonly [number, number],
    /** Quien empieza: 0 o 1. */
    firstSide: 0 | 1,
    now: number = Date.now(),
  ) {
    // Los asientos senumeran en el orden en que entraron; el que empieza es el
    // que decide el resto.
    const ordered = [players[0], players[1]] as const;
    const lifePointsBySeat: [number, number] =
      firstSide === 0 ? [lifePoints[0] ?? 8000, lifePoints[1] ?? 8000] : [lifePoints[1] ?? 8000, lifePoints[0] ?? 8000];

    this.session = DuelSession.create(seed, [
      { cards: null, lifePoints: lifePointsBySeat[0] },
      { cards: null, lifePoints: lifePointsBySeat[1] },
    ]);

    this.seats = [
      { side: 0, playerId: ordered[0].id, name: ordered[0].name, lastSeen: now },
      { side: 1, playerId: ordered[1].id, name: ordered[1].name, lastSeen: now },
    ];
  }

  /** El asiento de un jugador. */
  seatOf(playerId: string): Seat | undefined {
    return this.seats.find((seat) => seat.playerId === playerId);
  }

  /** Si le toca a este jugador. */
  isTurn(playerId: string): boolean {
    const state = this.session.getState();
    const seat = this.seatOf(playerId);
    return seat !== undefined && state.turn === seat.side && state.outcome === null;
  }

  /** La vista de un jugador. */
  viewFor(playerId: string): DuelView | null {
    const seat = this.seatOf(playerId);
    if (seat === undefined) return null;
    return viewFor(this.session.getState(), seat.side);
  }

  /** Si la partida ya termino. */
  isFinished(): boolean {
    return this.finished || this.session.getState().outcome !== null;
  }

  /**
   * Aplica una accion si le toca a ese jugador.
   *
   * Devuelve `null` si la accion no era legal por turno, en cuyo caso el
   * servidor avisa al cliente y no cambia nada.
   */
  act(playerId: string, action: PlayerAction): DuelView | null {
    if (this.isFinished()) return null;
    // La rendicion se admite siempre, incluso fuera de turno: si quieres
    // abandonar, puedes.
    if (action.type !== 'surrender' && !this.isTurn(playerId)) return null;

    this.session.act(action);
    if (this.session.getState().outcome !== null) this.finished = true;
    return this.viewFor(playerId);
  }

  /** Quien gano, para el historial. */
  winner(): { side: 0 | 1; name: string } | null {
    const outcome = this.session.getState().outcome;
    if (outcome === null) return null;
    const seat = this.seats[outcome.winner];
    return { side: outcome.winner, name: seat.name };
  }

  /** Numero de turnos jugados. */
  turns(): number {
    return this.session.getState().turnCount;
  }

  /** El registro de la partida para el historial. */
  record(): MatchRecord | null {
    const winner = this.winner();
    if (winner === null) return null;
    return {
      roomId: this.room.id,
      players: this.seats.map((seat) => ({ id: seat.playerId, name: seat.name })),
      winnerName: winner.name,
      winnerSide: winner.side,
      finishedAt: Date.now(),
      turns: this.turns(),
    };
  }
}