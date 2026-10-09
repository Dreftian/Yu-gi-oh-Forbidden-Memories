/**
 * Protocolo de red entre servidor y cliente.
 *
 * El servidor es la autoridad: el cliente envia `Action` y recibe `ServerMessage`.
 * Nunca se viaja un `DuelState` entero, solo la vista de cada jugador, para que
 * la mano del rival no pueda leerse ni aunque alguien mire el trafico.
 *
 * Los nombres de los mensajes son cortos a proposito: viajan en cada turno de
 * una partida y no hay presupuesto para verbosidad.
 */

import type { DuelView, PlayerAction } from './types.js';

/** Como se conecta un jugador. No hay registro: nombre y token. */
export interface PlayerIdentity {
  readonly id: string;
  readonly name: string;
}

/** Lo que el cliente envia. */
export type ClientMessage =
  /** Unirse con nombre y token. Si el token no existe, el servidor lo crea. */
  | { readonly t: 'join'; readonly name: string; readonly token: string }
  /** Entrar en la cola de emparejamiento. */
  | { readonly t: 'queue' }
  /** Salir de la cola. */
  | { readonly t: 'unqueue' }
  /** Crear una sala privada y recibir su codigo. */
  | { readonly t: 'create-room'; readonly lifePoints: number }
  /** Unirse a una sala privada por codigo. */
  | { readonly t: 'join-room'; readonly code: string }
  /** Abandonar la partida en curso. */
  | { readonly t: 'leave' }
  /** Enviar un mensaje de chat a la pareja. */
  | { readonly t: 'chat'; readonly text: string }
  /** Una jugada. El servidor la valida contra el turno y el estado. */
  | { readonly t: 'act'; readonly action: PlayerAction }
  /** Pedir que se le reenvie la vista (tras reconectar, por ejemplo). */
  | { readonly t: 'resync' }
  /** Latido. */
  | { readonly t: 'ping' };

/** Lo que el servidor envia. */
export type ServerMessage =
  /** Conexion aceptada. `token` es el que el cliente guardara en el navegador. */
  | { readonly t: 'hello'; readonly playerId: string; readonly token: string; readonly name: string }
  /** Numero de jugadores en linea y en cola. */
  | { readonly t: 'status'; readonly online: number; readonly queued: number; readonly playing: number }
  /** Se esta emparejando contra el rival. `waiting` dice cuanto falta. */
  | { readonly t: 'searching'; readonly waiting: number }
  /** Emparejamiento encontrado: empieza la partida. */
  | { readonly t: 'matched'; readonly room: RoomInfo }
  /** Sala privada creada con este codigo. */
  | { readonly t: 'room-created'; readonly room: RoomInfo }
  /** Alguien se ha unido a tu sala privada. */
  | { readonly t: 'opponent-joined'; readonly room: RoomInfo }
  /** Te han dejado de emparejar. */
  | { readonly t: 'search-cancelled'; readonly reason: string }
  /** El estado del duelo tal como lo ve este jugador. */
  | { readonly t: 'state'; readonly view: DuelView }
  /** El duelo ha terminado. */
  | { readonly t: 'over'; readonly view: DuelView }
  /** Mensaje de chat. */
  | { readonly t: 'chat'; readonly from: string; readonly text: string; readonly at: number }
  /** Aviso del servidor (sala no encontrada, no es tu turno, ...). */
  | { readonly t: 'notice'; readonly level: 'info' | 'warn' | 'error'; readonly text: string }
  /** Confirmacion de latido. */
  | { readonly t: 'pong' };

/** Datos publicos de una partida en curso. */
export interface RoomInfo {
  readonly id: string;
  /** Codigo para las salas privadas; vacio si es de emparejamiento. */
  readonly code: string;
  readonly opponent: PlayerIdentity;
  readonly isPrivate: boolean;
  readonly startedAt: number;
}

/** Mensaje de error del protocolo. */
export const PROTOCOL_VERSION = 1;

/**
 * Un mensaje de chat no puede ser infinito ni llevar HTML: el cliente lo pinta
 * como texto, pero el servidor lo recorta igual para no gastar memoria.
 */
export const MAX_CHAT_LENGTH = 280;
export const MAX_NAME_LENGTH = 16;