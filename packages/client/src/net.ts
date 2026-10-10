/**
 * Capa de red del cliente.
 *
 * Un WebSocket, una reconexion con espera creciente y nada mas. El cliente no
 * decide nada del duelo: pide acciones y pinta lo que el servidor le manda. La
 * unica excepcion es el modo contra la CPU, que si corre el motor en local.
 */

import type { ClientMessage, DuelView, PlayerAction, ServerMessage } from '@yfm/engine';

/** Lo que la interfaz necesita saber en cada momento. */
export interface NetState {
  /** Estado de la conexion con el servidor. */
  readonly connection: 'idle' | 'connecting' | 'open' | 'closed';
  /** Identidad del jugador, si ya se ha conecta. */
  readonly player: { readonly id: string; readonly name: string } | null;
  /** Numero de jugadores en la cola o jugando. */
  readonly online: number;
  /** Cuantos emparejados hay en la cola. */
  readonly queued: number;
  /** Cuantas partidas estan en marcha. */
  readonly playing: number;
  /** Sala privada creada o a la que se ha entrado. */
  readonly room: { readonly code: string; readonly opponentName: string } | null;
  /** Ultimo estado del duelo recibido. */
  readonly view: DuelView | null;
  /** La partida ha terminado. */
  readonly over: boolean;
  /** Avisos del servidor para la interfaz. */
  readonly notice: { readonly level: 'info' | 'warn' | 'error'; readonly text: string } | null;
  /** Chat recibido. */
  readonly chat: readonly { readonly from: string; readonly text: string }[];
  /** Esta emparejando ahora mismo. */
  readonly searching: boolean;
}

/** Espera maxima entre reintentos de conexion. */
const MAX_BACKOFF_MS = 10_000;

/**
 * La conexion con el servidor.
 *
 * Se apoya en eventos: `onState` avisa de cada cambio para que la interfaz se
 * repinte. No hay framework de estado aqui a proposito: la vista es un solo
 * objeto que se reemplaza entero, y eso lo hace trivial de pintar.
 */
export class NetClient {
  private socket: WebSocket | null = null;
  private backoff = 500;
  private reconnectTimer: number | null = null;
  private deliberateClose = false;
  private name = '';
  private token = '';

  private state: NetState = {
    connection: 'idle',
    player: null,
    online: 0,
    queued: 0,
    playing: 0,
    room: null,
    view: null,
    over: false,
    notice: null,
    chat: [],
    searching: false,
  };

  constructor(private readonly onState: (state: NetState) => void) {}

  /** El estado actual. */
  getState(): NetState {
    return this.state;
  }

  /** Cambia algo del estado y avisa. */
  private patch(changes: Partial<NetState>): void {
    this.state = { ...this.state, ...changes };
    this.onState(this.state);
  }

  /** La direccion del servidor. */
  private endpoint(): string {
    // En desarrollo el proxy de Vite reenvia /ws al servidor, asi que no hay
    // que hardcodear el puerto. En produccion se define con VITE_SERVER_URL.
    const configured = import.meta.env.VITE_SERVER_URL;
    if (typeof configured === 'string' && configured !== '') return configured;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host === '' ? '127.0.0.1:5173' : window.location.host;
    return `${protocol}//${host}/ws`;
  }

  /**
   * Conecta al servidor.
   *
   * `name` y `token` se guardan para reenviarlos en cada reconexion: si la
   * conexion se cae, el jugador vuelve a la partida sin escribir nada.
   */
  connect(name: string, token: string): void {
    this.name = name;
    this.token = token;
    this.deliberateClose = false;
    this.open();
  }

  /** Abre el socket y manda la identidad en cuanto esta listo. */
  private open(): void {
    this.patch({ connection: 'connecting' });

    const socket = new WebSocket(this.endpoint());
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.backoff = 500;
      this.patch({ connection: 'open' });
      // El servidor responde con un token si no le damos uno; lo guardamos.
      this.send({ t: 'join', name: this.name, token: this.token });
    });

    socket.addEventListener('message', (event) => {
      const data = String(event.data);
      try {
        this.handle(JSON.parse(data) as ServerMessage);
      } catch {
        // Un mensaje que no se entiende se ignora: no vale la pena tumbar la
        // partida por ello.
      }
    });

    socket.addEventListener('close', () => {
      this.socket = null;
      this.patch({ connection: 'closed', searching: false });
      if (!this.deliberateClose) this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // El evento `close` llega siempre despues; alli se reconecta.
    });
  }

  /** Reconecta esperando cada vez un poco mas, hasta el tope. */
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, wait);
  }

  /** Cierra la conexion sin intentar reconectar. */
  disconnect(): void {
    this.deliberateClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.patch({ connection: 'closed', searching: false });
  }

  /** Envia un mensaje si el socket esta abierto. */
  private send(message: ClientMessage): void {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  /** Reparte un mensaje del servidor. */
  private handle(message: ServerMessage): void {
    switch (message.t) {
      case 'hello':
        // El token puede venir nuevo si es la primera vez: se guarda para que
        // la proxima recarga mantenga la identidad.
        this.token = message.token;
        saveToken(message.token);
        this.patch({
          player: { id: message.playerId, name: message.name },
        });
        break;

      case 'status':
        this.patch({ online: message.online, queued: message.queued, playing: message.playing });
        break;

      case 'searching':
        this.patch({ searching: true, room: null, view: null, over: false });
        break;

      case 'search-cancelled':
        this.patch({ searching: false, notice: { level: 'warn', text: message.reason } });
        break;

      case 'room-created':
        this.patch({
          room: { code: message.room.code, opponentName: message.room.opponent.name },
          searching: false,
          view: null,
          over: false,
        });
        break;

      case 'opponent-joined':
        this.patch({
          room: { code: message.room.code, opponentName: message.room.opponent.name },
        });
        break;

      case 'state':
        this.patch({ view: message.view, over: false, searching: false });
        break;

      case 'over':
        this.patch({ view: message.view, over: true, searching: false });
        break;

      case 'chat':
        this.patch({
          chat: [...this.state.chat, { from: message.from, text: message.text }].slice(-50),
        });
        break;

      case 'notice':
        this.patch({ notice: { level: message.level, text: message.text } });
        break;

      case 'pong':
        // Solo sirve para saber que el canal vivo; no hay nada que pintar.
        break;

      default:
        break;
    }
  }

  /* --------------------------------------------------------- Acciones ----- */

  /** Empieza a emparejarse con quien este en la cola. */
  queue(): void {
    this.patch({ searching: true, notice: null });
    this.send({ t: 'queue' });
  }

  /** Sale de la cola. */
  unqueue(): void {
    this.send({ t: 'unqueue' });
  }

  /** Crea una sala privada y espera al rival. */
  createRoom(lifePoints: number): void {
    this.patch({ room: null, notice: null, searching: false });
    this.send({ t: 'create-room', lifePoints });
  }

  /** Entra en una sala privada. */
  joinRoom(code: string): void {
    this.patch({ room: null, notice: null, searching: false });
    this.send({ t: 'join-room', code });
  }

  /** Sale de la partida o de la sala. */
  leave(): void {
    this.send({ t: 'leave' });
    this.patch({ view: null, room: null, over: false });
  }

  /** Envia una jugada al servidor. */
  act(action: PlayerAction): void {
    this.send({ t: 'act', action });
  }

  /** Envia un mensaje de chat. */
  chat(text: string): void {
    this.send({ t: 'chat', text });
  }

  /** Pide que reenvien la vista, por ejemplo al volver de una pausa. */
  resync(): void {
    this.send({ t: 'resync' });
  }
}

/* ------------------------------------------------------- Identidad -------- */

const TOKEN_KEY = 'yfm.player-token';
const NAME_KEY = 'yfm.player-name';

/** El token guardado en este navegador, o una cadena vacia. */
export function loadToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    // Con las cookies de thirds bloqueadas, localStorage falla; se juega igual
    // con una identidad de sesion.
    return '';
  }
}

/** Guarda el token para la proxima recarga. */
export function saveToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Sin almacenamiento no hay persistencia; no es motivo para no jugar.
  }
}

/** El nombre con el que se juega la ultima vez. */
export function loadName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Guarda el nombre elegido. */
export function saveName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // Igual que antes: sin almacenamiento, sin persistencia.
  }
}