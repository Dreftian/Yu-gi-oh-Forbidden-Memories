/**
 * Servidor de juego por WebSocket.
 *
 * Sus responsabilidades, y solo estas:
 *
 *  - dar identidad a quien conecta (nombre y token, sin registro ni contrasena);
 *  - emparejar jugadores por la cola o por salas privadas;
 *  - mantener el motor de duelo de cada partida y repartir las vistas.
 *
 * No guarda nada en disco: no hay cuentas, no hay historial persistente. Quien
 * quiera conservar algo lo guarda en su cliente, que es el unico sitio del que
 * no depende este servidor.
 *
 * El servidor es la autoridad del duelo. Los clientes no viajan nunca el estado
 * entero, solo su vista, de modo que la mano del rival no se puede leer ni
 * mirando el trafico.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

import { STARTING_LIFE_POINTS, isValidLifePoints } from '@yfm/engine';
import type { ClientMessage, DuelView, PlayerAction, ServerMessage } from '@yfm/engine';

import { Match } from './match.js';
import { Matchmaker, type Room } from './matchmaker.js';
import { hashToken, randomId, sanitizeName } from './session.js';
import { MAX_CHAT_LENGTH } from '@yfm/engine';

/** Datos de una conexion. */
interface Client {
  readonly socket: WebSocket;
  /** Id de esta conexion; cambia al reconectar. */
  readonly sessionId: string;
  /** Token persistente que guarda el navegador. */
  token: string;
  name: string;
  /** Id estable derivado del token. */
  playerId: string;
  /** Sala privada en la que espera rival. */
  waitingRoomId: string | null;
  /** Partida en curso, si la hay. */
  match: Match | null;
  lastSeen: number;
}

/** Arranque del servidor. */
export interface ServerOptions {
  readonly port: number;
  readonly host?: string;
  /** Semilla forzada para las partidas; si se omite, es aleatoria. */
  readonly seed?: number;
  /** Segundos maximos de espera en la cola. */
  readonly maxQueueSeconds?: number;
  /** Cada cuanto se vacia la cola de los que llevan demasiado. */
  readonly sweepSeconds?: number;
}

/** El servidor de juego. */
export class GameServer {
  private readonly matchmaker: Matchmaker;
  private readonly clients = new Map<WebSocket, Client>();
  private readonly wss: WebSocketServer;
  private readonly http: Server;
  private readonly options: ServerOptions;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(options: ServerOptions) {
    this.options = options;
    this.matchmaker = new Matchmaker(options.maxQueueSeconds ?? 120);

    this.http = createServer((request, response) => this.handleHttp(request, response));
    this.wss = new WebSocketServer({ server: this.http });
    this.wss.on('connection', (socket) => this.onConnection(socket));
  }

  /** Empieza a escuchar. */
  listen(): Promise<number> {
    return new Promise((resolve) => {
      this.http.listen(this.options.port, this.options.host ?? '0.0.0.0', () => {
        const address = this.http.address();
        const port = typeof address === 'object' && address !== null ? address.port : this.options.port;
        resolve(port);
      });
    });
  }

  /** Cierra el servidor y avisa a los conectados. */
  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      this.send(client, { t: 'notice', level: 'info', text: 'El servidor se apaga.' });
      client.socket.close(1001, 'server shutdown');
    }
    if (this.sweeper !== null) clearInterval(this.sweeper);
    this.sweeper = null;
    this.wss.close();
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }

  /** Cuantos hay conectados. */
  get onlineCount(): number {
    return this.clients.size;
  }

  /* ------------------------------------------------------- Conexion ------- */

  private onConnection(socket: WebSocket): void {
    const client: Client = {
      socket,
      sessionId: randomId(),
      token: '',
      name: '',
      playerId: '',
      waitingRoomId: null,
      match: null,
      lastSeen: Date.now(),
    };
    this.clients.set(socket, client);

    socket.on('message', (raw) => this.onMessage(client, String(raw)));
    socket.on('close', () => this.onClose(client));
    socket.on('error', () => this.onClose(client));
    socket.on('pong', () => {
      client.lastSeen = Date.now();
    });

    this.startSweeper();
  }

  /** Cierra la sesion del jugador. */
  private onClose(client: Client): void {
    this.clients.delete(client.socket);
    if (client.playerId === '') return;

    this.matchmaker.dequeue(client.playerId);

    if (client.match !== null) {
      // El rival se queda solo: se le avisa y recibe una vista vacia.
      const rival = this.rivalOf(client);
      if (rival !== undefined) {
        this.send(rival, {
          t: 'notice',
          level: 'info',
          text: `${client.name} ha salido de la partida.`,
        });
        this.send(rival, { t: 'state', view: emptyView() });
        rival.match = null;
      }
      client.match = null;
    }

    // Una sala privada espera un rato a que vuelva con la misma pestana; solo
    // se cierra si se queda vacia.
    const room = this.matchmaker.roomOfPlayer(client.playerId);
    if (room !== undefined && room.startedAt === null && room.players.length === 1) {
      this.matchmaker.close(room.id);
    }

    this.broadcastStatus();
  }

  /* --------------------------------------------------------- Mensajes ----- */

  private onMessage(client: Client, raw: string): void {
    client.lastSeen = Date.now();

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      this.send(client, { t: 'notice', level: 'error', text: 'Mensaje ilegible.' });
      return;
    }

    switch (message.t) {
      case 'join':
        this.handleJoin(client, message.name, message.token);
        break;
      case 'queue':
        this.handleQueue(client);
        break;
      case 'unqueue':
        this.handleUnqueue(client);
        break;
      case 'create-room':
        this.handleCreateRoom(client, message.lifePoints);
        break;
      case 'join-room':
        this.handleJoinRoom(client, message.code);
        break;
      case 'leave':
        this.handleLeave(client);
        break;
      case 'chat':
        this.handleChat(client, message.text);
        break;
      case 'act':
        this.handleAct(client, message.action);
        break;
      case 'resync':
        this.handleResync(client);
        break;
      case 'ping':
        this.send(client, { t: 'pong' });
        break;
      default:
        this.send(client, { t: 'notice', level: 'warn', text: 'Comando desconocido.' });
    }
  }

  /* -------------------------------------------------------- Identidad ------ */

  /**
   * Da identidad al jugador: un nombre y un token.
   *
   * El token se genera si no viene y se devuelve siempre, para que el navegador
   * lo guarde entre recargas. No hay contrasena ni correo.
   */
  private handleJoin(client: Client, rawName: string, rawToken: string): void {
    client.name = sanitizeName(rawName);
    client.token = rawToken.trim() === '' ? randomId() + randomId() : rawToken.trim().slice(0, 64);
    client.playerId = hashToken(client.token);

    this.send(client, {
      t: 'hello',
      playerId: client.playerId,
      token: client.token,
      name: client.name,
    });
    this.broadcastStatus();
  }

  /* -------------------------------------------------------- Emparejar ------ */

  /** Mete al jugador en la cola de emparejamiento. */
  private handleQueue(client: Client): void {
    if (!this.requireIdentity(client)) return;
    if (client.match !== null) {
      this.send(client, { t: 'notice', level: 'warn', text: 'Ya estas en partida.' });
      return;
    }
    this.leaveWaitingRoom(client);

    const entry = { id: client.playerId, name: client.name, joinedAt: Date.now() };
    const found = this.matchmaker.enqueue(entry);

    if (found === null) {
      this.send(client, { t: 'searching', waiting: this.matchmaker.queuedCount });
      this.broadcastStatus();
      return;
    }

    const room = this.matchmaker.createMatchmaking([STARTING_LIFE_POINTS, STARTING_LIFE_POINTS]);
    room.players.push(found.opponent.id, client.playerId);
    room.lifePoints.push(STARTING_LIFE_POINTS, STARTING_LIFE_POINTS);
    room.startedAt = Date.now();

    // Empieza quien llevaba mas tiempo esperando.
    this.startMatch(
      room,
      [
        { id: found.opponent.id, name: found.opponent.name },
        { id: client.playerId, name: client.name },
      ],
      found.opponent.id,
    );
  }

  /** Saca al jugador de la cola. */
  private handleUnqueue(client: Client): void {
    if (client.playerId === '') return;
    if (this.matchmaker.dequeue(client.playerId)) {
      this.send(client, { t: 'search-cancelled', reason: 'Has salido de la cola.' });
      this.broadcastStatus();
    }
  }

  /** Crea una sala privada y espera al rival. */
  private handleCreateRoom(client: Client, lifePoints: number): void {
    if (!this.requireIdentity(client)) return;
    this.matchmaker.dequeue(client.playerId);
    this.leaveWaitingRoom(client);

    const points = isValidLifePoints(lifePoints) ? lifePoints : STARTING_LIFE_POINTS;
    const room = this.matchmaker.createPrivate(points);
    room.players.push(client.playerId);
    room.lifePoints.push(points);

    client.waitingRoomId = room.id;
    this.send(client, {
      t: 'room-created',
      room: {
        id: room.id,
        code: room.code,
        opponent: { id: '', name: 'Esperando...' },
        isPrivate: true,
        startedAt: room.createdAt,
      },
    });
    this.broadcastStatus();
  }

  /** Entra en una sala privada por su codigo. */
  private handleJoinRoom(client: Client, rawCode: string): void {
    if (!this.requireIdentity(client)) return;

    const room = this.matchmaker.roomByCode(rawCode);
    if (room === undefined) {
      this.send(client, { t: 'notice', level: 'error', text: 'No hay ninguna sala con ese codigo.' });
      return;
    }
    if (room.startedAt !== null) {
      this.send(client, { t: 'notice', level: 'error', text: 'Esa partida ya ha empezado.' });
      return;
    }
    if (room.players.length >= 2) {
      this.send(client, { t: 'notice', level: 'error', text: 'La sala esta llena.' });
      return;
    }

    this.matchmaker.dequeue(client.playerId);
    this.leaveWaitingRoom(client);

    const hostId = room.players[0] ?? '';
    const hostName = this.clientOfPlayerId(hostId)?.name ?? 'Host';
    room.players.push(client.playerId);
    room.lifePoints.push(STARTING_LIFE_POINTS);
    room.startedAt = Date.now();

    this.startMatch(
      room,
      [
        { id: hostId, name: hostName },
        { id: client.playerId, name: client.name },
      ],
      hostId,
    );
  }

  /**
   * Arranca la partida: crea el motor, reparte vistas y avisa a los dos.
   *
   * `firstPlayerId` es quien empieza: en la cola, el que entro antes; en una
   * sala privada, el que la creo.
   */
  private startMatch(
    room: Room,
    players: readonly { readonly id: string; readonly name: string }[],
    firstPlayerId: string,
  ): void {
    const seed = this.options.seed ?? Math.floor(Math.random() * 0xffffffff);
    const firstSide: 0 | 1 = players[0]?.id === firstPlayerId ? 0 : 1;
    const lifePoints: [number, number] = [
      room.lifePoints[0] ?? STARTING_LIFE_POINTS,
      room.lifePoints[1] ?? STARTING_LIFE_POINTS,
    ];

    const match = new Match(room, players, seed, lifePoints, firstSide);

    for (const player of players) {
      const client = this.clientOfPlayerId(player.id);
      if (client === undefined) continue;
      client.match = match;
      client.waitingRoomId = null;
      const view = match.viewFor(player.id);
      if (view !== null) {
        this.send(client, {
          t: 'state',
          view,
        });
      }
    }
    this.broadcastStatus();
  }

  /* ---------------------------------------------------------- Partida ------ */

  /** Sale de la partida o de la sala de espera. */
  private handleLeave(client: Client): void {
    if (client.match !== null) {
      const rival = this.rivalOf(client);
      if (rival !== undefined) {
        this.send(rival, {
          t: 'notice',
          level: 'info',
          text: `${client.name} ha salido de la partida.`,
        });
        this.send(rival, { t: 'state', view: emptyView() });
        rival.match = null;
      }
      client.match = null;
    }
    this.leaveWaitingRoom(client);
    this.broadcastStatus();
  }

  /** Sale de la sala privada en la que esperaba. */
  private leaveWaitingRoom(client: Client): void {
    if (client.waitingRoomId === null) return;
    const room = this.matchmaker.room(client.waitingRoomId);
    if (room !== undefined) {
      const index = room.players.indexOf(client.playerId);
      if (index !== -1) room.players.splice(index, 1);
      if (room.players.length === 0) this.matchmaker.close(room.id);
    }
    client.waitingRoomId = null;
  }

  /** Aplica una jugada y reparte las dos vistas. */
  private handleAct(client: Client, action: PlayerAction): void {
    const match = client.match;
    if (match === null) {
      this.send(client, { t: 'notice', level: 'warn', text: 'No estas en partida.' });
      return;
    }

    const view = match.act(client.playerId, action);
    if (view === null) {
      if (!match.isFinished() && !match.isTurn(client.playerId)) {
        this.send(client, { t: 'notice', level: 'warn', text: 'No es tu turno.' });
      }
      return;
    }

    this.send(client, { t: 'state', view });

    // El rival recibe su propia vista, no la del que ha jugado: cada uno ve el
    // campo desde su lado y el motor ya se ha encargado de tapar lo que no debe.
    const rival = this.rivalOf(client);
    if (rival !== undefined && rival.match === match) {
      const rivalView = match.viewFor(rival.playerId);
      if (rivalView !== null) this.send(rival, { t: 'state', view: rivalView });
    }

    if (match.isFinished()) this.finishMatch(match);
  }

  /** Cierra la partida y avisa a los dos. */
  private finishMatch(match: Match): void {
    const record = match.record();
    if (record === null) return;
    for (const player of record.players) {
      const client = this.clientOfPlayerId(player.id);
      if (client === undefined || client.match !== match) continue;
      const view = match.viewFor(player.id);
      if (view !== null) this.send(client, { t: 'over', view });
      client.match = null;
    }
    this.matchmaker.close(match.room.id);
    this.broadcastStatus();
  }

  /** Reenvia la vista actual, para cuando el cliente se reconecta. */
  private handleResync(client: Client): void {
    if (client.match === null) return;
    const view = client.match.viewFor(client.playerId);
    if (view !== null) this.send(client, { t: 'state', view });
  }

  /* ------------------------------------------------------------- Chat ------ */

  /** Pasa un mensaje de chat a la pareja y lo devuelve al que lo manda. */
  private handleChat(client: Client, raw: string): void {
    const text = raw.trim().slice(0, MAX_CHAT_LENGTH);
    if (text === '' || client.name === '') return;

    const message: ServerMessage = { t: 'chat', from: client.name, text, at: Date.now() };
    const rival = this.rivalOf(client);
    if (rival !== undefined) this.send(rival, message);
    this.send(client, message);
  }

  /* ------------------------------------------------------- Utilidades ----- */

  /** Exige identidad, avisando si falta. */
  private requireIdentity(client: Client): boolean {
    if (client.playerId !== '') return true;
    this.send(client, { t: 'notice', level: 'error', text: 'Primero elige un nombre.' });
    return false;
  }

  /** El cliente con ese id de jugador, si sigue conectado. */
  private clientOfPlayerId(playerId: string): Client | undefined {
    if (playerId === '') return undefined;
    for (const client of this.clients.values()) {
      if (client.playerId === playerId) return client;
    }
    return undefined;
  }

  /** La pareja de un jugador. */
  private rivalOf(client: Client): Client | undefined {
    if (client.match === null || client.playerId === '') return undefined;
    const room = this.matchmaker.roomOfPlayer(client.playerId);
    if (room === undefined) return undefined;
    const rivalId = room.players.find((id) => id !== client.playerId);
    return this.clientOfPlayerId(rivalId ?? '');
  }

  /** Avisa a todos de cuantos hay, cuantos esperan y cuantas partidas hay. */
  private broadcastStatus(): void {
    const playing = this.matchmaker.roomCount;
    const status: ServerMessage = {
      t: 'status',
      online: this.clients.size,
      queued: this.matchmaker.queuedCount,
      playing,
    };
    for (const client of this.clients.values()) this.send(client, status);
  }

  /** Envia un mensaje si el socket esta abierto. */
  private send(client: Client, message: ServerMessage): void {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    client.socket.send(JSON.stringify(message));
  }

  /** Una vista vacia, para cuando el rival se va a medias. */
  private emptyView(): DuelView {
    return emptyView();
  }

  /** Expulsa a quien lleva demasiado en la cola y corta los sockets muertos. */
  private startSweeper(): void {
    if (this.sweeper !== null) return;
    const interval = (this.options.sweepSeconds ?? 30) * 1000;

    this.sweeper = setInterval(() => {
      for (const stale of this.matchmaker.expired()) {
        const client = this.clientOfPlayerId(stale.id);
        if (client !== undefined) {
          this.send(client, {
            t: 'search-cancelled',
            reason: 'Se agoto el tiempo de espera.',
          });
        }
      }

      // Cortes de conexion: si el socket lleva muerto mas de un minuto, fuera.
      const now = Date.now();
      for (const client of [...this.clients.values()]) {
        if (now - client.lastSeen > 60_000) {
          client.socket.terminate();
          continue;
        }
        if (client.socket.readyState === WebSocket.OPEN) client.socket.ping();
      }
      this.broadcastStatus();
    }, interval);

    // `unref` para que el temporizador no mantenga vivo el proceso: si solo
    // queda el servidor escuchando, cerrar los sockets debe bastar para salir.
    this.sweeper.unref();
  }

  /* ------------------------------------------------------------- HTTP ------ */

  /** Una respuesta minima: el servidor tambien responde en el navegador. */
  private handleHttp(request: IncomingMessage, response: ServerResponse): void {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          ok: true,
          online: this.clients.size,
          queued: this.matchmaker.queuedCount,
          rooms: this.matchmaker.roomCount,
        }),
      );
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="es">
<meta charset="utf-8">
<title>Yu-Gi-Oh! Forbidden Memories - servidor</title>
<style>
  body { background:#12101c; color:#e8e4d8; font-family:system-ui,sans-serif;
         display:grid; place-items:center; min-height:100vh; margin:0; }
  main { max-width:36rem; padding:2rem; }
  h1 { font-size:1.3rem; }
  code { background:#1e1a2e; padding:.15rem .4rem; border-radius:3px; }
  p { line-height:1.6; color:#b8b2c8; }
</style>
<main>
  <h1>Servidor de duelo en linea</h1>
  <p>El servidor esta funcionando. Esta es la puerta de entrada; el juego se
     juega en la pagina web, no aqui.</p>
  <p>Estado en <code>/health</code>.</p>
</main>
</html>`);
  }
}

/** Una vista sin duel en curso, para cuando el rival se va a medias. */
function emptyView(): DuelView {
  return {
    turn: 0,
    turnCount: 0,
    phase: 'finished',
    terrain: 0,
    you: emptySideView(),
    opponent: emptySideView(),
    log: [],
    events: [],
    outcome: null,
    choice: null,
  };
}

/** Un lado vacio, para la vista de "el rival se fue". */
function emptySideView(): DuelView['you'] {
  return {
    lifePoints: 0,
    displayedLifePoints: 0,
    deckCount: 0,
    hand: { count: 0, cards: [] },
    monsters: [null, null, null, null, null],
    backRow: [null, null, null, null, null],
    swordsTurnsRemaining: 0,
    openedTurn: false,
    isTurn: false,
  };
}