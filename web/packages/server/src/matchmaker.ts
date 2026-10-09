/**
 * Emparejamiento: la cola de la modalidad rapida y las salas privadas.
 *
 * Dos vias para jugar contra otra persona:
 *
 *  - **Cola**: entras y esperas. En cuanto hay dos, se emparejan. Si solo hay
 *    uno, se puede jugar contra la CPU, que esta en el cliente.
 *  - **Sala privada**: creas una con un codigo de cinco caracteres y se la pasas
 *    a quien quieras.
 *
 * El emparejamiento no decide nada sobre la partida: solo decide con quien se
 * juega. La semilla la pone el servidor y ambos lados reciben la misma, asi que
 * el motor corre identico a los dos.
 */

import { randomInt } from 'node:crypto';

/** Un jugador esperando en la cola. */
export interface QueuedPlayer {
  readonly id: string;
  readonly name: string;
  readonly joinedAt: number;
}

/** Una sala: puede tener uno o dos jugadores. */
export interface Room {
  readonly id: string;
  readonly code: string;
  readonly isPrivate: boolean;
  readonly players: string[];
  /** Puntos de vida iniciales, en el mismo orden que `players`. */
  readonly lifePoints: number[];
  readonly createdAt: number;
  startedAt: number | null;
}

/**
 * Cola de emparejamiento.
 *
 * Es intencionadamente simple y sin ninguna Logica de habilidad: empareja por
 * orden de llegada. Si el juego creciera, este es el sitio donde entraria un
 * ELO, pero no hace falta para jugar.
 */
export class Matchmaker {
  private readonly queue: QueuedPlayer[] = [];
  private readonly rooms = new Map<string, Room>();

  /** Tiempo maximo que se espera en la cola antes de que el jugador la abandone. */
  constructor(
    private readonly maxQueueSeconds = 120,
    private readonly now: () => number = Date.now,
  ) {}

  /** Cuantos hay esperando. */
  get queuedCount(): number {
    return this.queue.length;
  }

  /** Cuantas salas hay abiertas. */
  get roomCount(): number {
    return this.rooms.size;
  }

  /**
   * Mete a un jugador en la cola. Si ya estaba, no lo duplica.
   *
   * Devuelve la pareja encontrada, o `null` si hay que esperar.
   */
  enqueue(player: QueuedPlayer): { opponent: QueuedPlayer } | null {
    if (this.queue.some((entry) => entry.id === player.id)) return null;

    // El rival mas antiguo que este compatible. Como no hay filtros de
    // habilidad, es simplemente el primero de la cola.
    const opponentIndex = this.queue.findIndex((entry) => entry.id !== player.id);
    if (opponentIndex === -1) {
      this.queue.push(player);
      return null;
    }

    const [opponent] = this.queue.splice(opponentIndex, 1);
    if (opponent === undefined) return null;
    return { opponent };
  }

  /** Saca a un jugador de la cola. */
  dequeue(playerId: string): boolean {
    const index = this.queue.findIndex((entry) => entry.id === playerId);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }

  /** Quien esta en la cola esperando. */
  inQueue(playerId: string): QueuedPlayer | undefined {
    return this.queue.find((entry) => entry.id === playerId);
  }

  /** Los que llevan demasiado esperando, para que el servidor los eche. */
  expired(): QueuedPlayer[] {
    const limit = this.now() - this.maxQueueSeconds * 1000;
    const stale = this.queue.filter((entry) => entry.joinedAt < limit);
    for (const entry of stale) this.dequeue(entry.id);
    return stale;
  }

  /**
   * Crea una sala privada con un codigo de cinco letras.
   *
   * El codigo evita las vocales para que dictarlo por voz no genere dudas.
   */
  createPrivate(lifePoints: number): Room {
    const code = this.freshCode();
    const room: Room = {
      id: randomId(),
      code,
      isPrivate: true,
      players: [],
      lifePoints: [],
      createdAt: this.now(),
      startedAt: null,
    };
    this.rooms.set(room.id, room);
    void lifePoints;
    return room;
  }

  /** Crea una sala de emparejamiento, sin codigo. */
  createMatchmaking(lifePoints: readonly number[]): Room {
    const room: Room = {
      id: randomId(),
      code: '',
      isPrivate: false,
      players: [],
      lifePoints: [...lifePoints],
      createdAt: this.now(),
      startedAt: null,
    };
    this.rooms.set(room.id, room);
    return room;
  }

  /** Una sala por su id. */
  room(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** Una sala privada por su codigo, sin distinguir mayusculas. */
  roomByCode(code: string): Room | undefined {
    const wanted = code.trim().toUpperCase();
    for (const room of this.rooms.values()) {
      if (room.isPrivate && room.code === wanted) return room;
    }
    return undefined;
  }

  /** Una sala a la que pertenece un jugador. */
  roomOfPlayer(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.includes(playerId)) return room;
    }
    return undefined;
  }

  /** Borra una sala. */
  close(roomId: string): void {
    this.rooms.delete(roomId);
  }

  /** Genera un codigo de cinco caracteres sin vocales ni ambiguedad. */
  private freshCode(): string {
    // Sin I, O, Q, L para que no se confundan al dictarse.
    const alphabet = 'ABCDEFGHJKMNPPRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 32; attempt += 1) {
      let code = '';
      for (let i = 0; i < 5; i += 1) code += alphabet[randomInt(alphabet.length)];
      const clash = [...this.rooms.values()].some((room) => room.code === code);
      if (!clash) return code;
    }
    // Si 32 intentos fallan, se anade un numero y listo.
    return `R${randomInt(1_000_000).toString(36).toUpperCase()}`;
  }
}

/** Un id de partida o jugador. */
export function randomId(): string {
  return randomInt(0, 0xffffffff).toString(36).toUpperCase();
}