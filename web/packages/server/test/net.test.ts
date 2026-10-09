/**
 * Prueba de extremo a extremo del emparejamiento.
 *
 * Levanta el servidor de verdad, conecta dos clientes por WebSocket y comprueba
 * que se emparejan, que cada uno ve su propia vista y que la mano del rival no
 * viaja nunca. Es la prueba que importa para el modo en linea: si pasa, el
 * flujo completo funciona.
 *
 *   node --test dist-test/net/*.test.js
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { WebSocket } from 'ws';

import { GameServer } from '../src/index.js';
import type { ClientMessage, ServerMessage } from '@yfm/engine';

/** Un cliente de prueba con las utilidades de las que depende cada test. */
class TestClient {
  readonly messages: ServerMessage[] = [];
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw) => {
      this.messages.push(JSON.parse(String(raw)) as ServerMessage);
    });
  }

  /** Conecta y espera a que el socket este abierto. */
  static async connect(url: string): Promise<TestClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return new TestClient(socket);
  }

  /** Envia un mensaje. */
  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Espera a recibir un mensaje de un tipo dado. */
  async waitFor<T extends ServerMessage['t']>(
    type: T,
    timeoutMs = 3000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(
        (message): message is Extract<ServerMessage, { t: T }> => message.t === type,
      );
      if (found !== undefined) return found;
      if (Date.now() > deadline) {
        const seen = this.messages.map((m) => m.t).join(', ') || 'nada';
        throw new Error(`Se esperaba "${type}" y solo llego: ${seen}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** El ultimo mensaje de un tipo dado, o `undefined`. */
  last<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }> | undefined {
    const matching = this.messages.filter(
      (message): message is Extract<ServerMessage, { t: T }> => message.t === type,
    );
    return matching[matching.length - 1];
  }

  /** Borra los mensajes recibidos, para no arrastrar de un test a otro. */
  clear(): void {
    this.messages.length = 0;
  }

  /** Cierra el socket. */
  close(): void {
    this.socket.close();
  }
}

/** Levanta un servidor efimero en un puerto libre. */
async function startServer(seed?: number): Promise<{ server: GameServer; url: string }> {
  const server = new GameServer({ port: 0, host: '127.0.0.1', seed });
  const port = await server.listen();
  return { server, url: `ws://127.0.0.1:${port}` };
}

/** Cierra un socket y espera a que se libere. */
function closeClient(client: TestClient): void {
  client.close();
}

describe('emparejamiento en linea', () => {
  let server: GameServer;
  let url: string;
  const open: TestClient[] = [];

  before(async () => {
    // Semilla fija: las partidas tienen que ser reproducibles en las pruebas.
    const started = await startServer(12345);
    server = started.server;
    url = started.url;
  });

  after(async () => {
    for (const client of open) closeClient(client);
    // Un margen para que los sockets terminen de cerrarse antes de apagar el
    // servidor: si no, el cierre espera al cliente.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await server.close();
  });

  async function join(name: string, token: string): Promise<TestClient> {
    const client = await TestClient.connect(url);
    open.push(client);
    client.send({ t: 'join', name, token });
    await client.waitFor('hello');
    return client;
  }

  it('da identidad con nombre y token', async () => {
    const client = await join('JugadorUno', 'token-abc');
    const hello = client.last('hello');
    assert.ok(hello !== undefined);
    assert.equal(hello.name, 'JugadorUno');
    assert.equal(hello.token, 'token-abc');
    assert.notEqual(hello.playerId, '');
  });

  it('limpia un nombre vacio o con controles', async () => {
    const client = await TestClient.connect(url);
    open.push(client);
    client.send({ t: 'join', name: '   ', token: 'token-vacio' });
    const hello = await client.waitFor('hello');
    assert.equal(hello.name, 'Duelista', 'un nombre vacio recibe el nombre por defecto');

    const otro = await TestClient.connect(url);
    open.push(otro);
    otro.send({ t: 'join', name: 'Con\nLimpio', token: 'token-nueva' });
    const hello2 = await otro.waitFor('hello');
    assert.equal(hello2.name, 'ConLimpio', 'los saltos de linea se quitan');
  });

  it('empareja a dos jugadores de la cola', async () => {
    const uno = await join('Alice', 'tok-a');
    const dos = await join('Bob', 'tok-b');

    uno.send({ t: 'queue' });
    const searching = await uno.waitFor('searching');
    assert.ok(searching.waiting >= 1);

    dos.send({ t: 'queue' });

    // Los dos reciben el estado del duelo.
    const stateOne = await uno.waitFor('state');
    const stateTwo = await dos.waitFor('state');
    assert.ok(stateOne.view !== undefined);
    assert.ok(stateTwo.view !== undefined);
  });

  it('da a cada jugador su vista y oculta la mano rival', async () => {
    const uno = await join('Carlos', 'tok-c');
    const dos = await join('Dana', 'tok-d');

    uno.send({ t: 'queue' });
    await uno.waitFor('searching');
    dos.send({ t: 'queue' });

    const viewOne = (await uno.waitFor('state')).view;
    const viewTwo = (await dos.waitFor('state')).view;

    // Cada uno ve cinco cartas propias.
    assert.equal(viewOne.you.hand.cards.length, 5, 'veo mis cinco cartas');
    assert.equal(viewTwo.you.hand.cards.length, 5);

    // Y ninguna del rival.
    assert.equal(viewOne.opponent.hand.cards.length, 0, 'la mano rival no viaja');
    assert.equal(viewOne.opponent.hand.count, 5, 'pero si se cuanta cuantas cartas tiene');
    assert.equal(viewTwo.opponent.hand.cards.length, 0);
    assert.equal(viewTwo.opponent.hand.count, 5);

    // Cada uno ve su campo vacio y los 8000 PV de inicio.
    assert.equal(viewOne.you.lifePoints, 8000);
    assert.equal(viewOne.you.deckCount, 35, '40 cartas menos las 5 de la mano');
  });

  it('el turno empieza en el jugador y solo ese puede actuar', async () => {
    const uno = await join('Eve', 'tok-e');
    const dos = await join('Fran', 'tok-f');

    uno.send({ t: 'queue' });
    await uno.waitFor('searching');
    dos.send({ t: 'queue' });

    const viewOne = (await uno.waitFor('state')).view;
    const viewTwo = (await dos.waitFor('state')).view;

    // Empieza el primero de la cola, que es `uno`.
    assert.equal(viewOne.turn, 0);
    assert.equal(viewTwo.turn, 0);

    dos.clear();
    uno.clear();

    // `dos` intenta jugar sin turno: el servidor lo rechaza y se lo dice.
    dos.send({ t: 'act', action: { type: 'ready' } });
    const notice = await dos.waitFor('notice');
    assert.equal(notice.text, 'No es tu turno.');

    // Y el estado no ha cambiado para nadie.
    assert.equal(uno.last('state'), undefined, 'nadie recibio un estado nuevo');
  });

  it('reparte el estado a los dos cuando uno juega', async () => {
    const uno = await join('Gina', 'tok-g');
    const dos = await join('Hugo', 'tok-h');

    uno.send({ t: 'queue' });
    await uno.waitFor('searching');
    dos.send({ t: 'queue' });
    await uno.waitFor('state');
    await dos.waitFor('state');

    uno.clear();
    dos.clear();

    uno.send({ t: 'act', action: { type: 'ready' } });

    const nextOne = (await uno.waitFor('state')).view;
    const nextTwo = (await dos.waitFor('state')).view;

    // El turno pasa al otro, y ambos lo ven.
    assert.equal(nextOne.turn, 1);
    assert.equal(nextTwo.turn, 1);
    assert.equal(nextTwo.you.isTurn, true);
    assert.equal(nextOne.opponent.isTurn, true);
  });

  it('el rival recibe su propia vista, no la del que juega', async () => {
    const uno = await join('Ines', 'tok-i2');
    const dos = await join('Julio', 'tok-j2');

    uno.send({ t: 'queue' });
    await uno.waitFor('searching');
    dos.send({ t: 'queue' });
    await uno.waitFor('state');
    await dos.waitFor('state');

    uno.clear();
    dos.clear();

    uno.send({ t: 'act', action: { type: 'ready' } });
    await uno.waitFor('state');
    const rivalView = (await dos.waitFor('state')).view;

    // El que no ha jugado es el rival: su vista es la que sale marcada como
    // rival, y su mano es la propia. Si el servidor mandara la vista del otro,
    // estas dos aserciones fallarian.
    assert.equal(rivalView.you.isTurn, true, 'al que no ha jugado le toca ahora');
    assert.equal(rivalView.you.hand.cards.length, 5, 've su propia mano');
    assert.equal(rivalView.opponent.hand.cards.length, 0, 'no ve la mano del que ha jugado');
  });

  it('crea una sala privada con codigo y espera al rival', async () => {
    const anfitrion = await join('Iris', 'tok-i');
    anfitrion.send({ t: 'create-room', lifePoints: 4000 });

    const room = await anfitrion.waitFor('room-created');
    assert.match(room.room.code, /^[A-Z0-9]{5,}$/, 'el codigo se puede dictar');
    assert.equal(room.room.opponent.name, 'Esperando...');

    // Un tercero con un codigo equivocado no entra.
    const perdido = await join('Jack', 'tok-j');
    perdido.send({ t: 'join-room', code: 'ZZZZZ' });
    const error = await perdido.waitFor('notice');
    assert.equal(error.text, 'No hay ninguna sala con ese codigo.');

    // Con el codigo correcto, entra y empieza la partida.
    const invitado = await join('Kim', 'tok-k');
    invitado.send({ t: 'join-room', code: room.room.code });

    const state = (await invitado.waitFor('state')).view;
    assert.equal(state.you.hand.cards.length, 5);
    // Los puntos de vida elegidos por el anfitrion se respetan.
    assert.equal(state.you.lifePoints, 4000);
  });

  it('no deja entrar a un tercero en una sala ya empezada', async () => {
    const anfitrion = await join('Leo', 'tok-l');
    anfitrion.send({ t: 'create-room', lifePoints: 8000 });
    const room = await anfitrion.waitFor('room-created');

    const primero = await join('Mona', 'tok-m');
    primero.send({ t: 'join-room', code: room.room.code });
    await primero.waitFor('state');

    // Con dos jugadores dentro la partida ya empezo, asi que el tercero recibe
    // ese aviso en vez de "sala llena": las dos respuestas son correctas segun
    // el momento, y lo que importa es que no entre.
    const tercero = await join('Nico', 'tok-n');
    tercero.send({ t: 'join-room', code: room.room.code });
    const aviso = await tercero.waitFor('notice');
    assert.match(
      aviso.text,
      /ya ha empezado|esta llena/,
      'el tercero se queda fuera',
    );
    assert.equal(tercero.last('state'), undefined, 'y no recibe estado de partida');
  });

  it('saca a los que esperan demasiado en la cola', async () => {
    // Un servidor aparte, con espera maxima de un segundo y barrido cada
    // medio segundo, para que la prueba no tarde.
    const impatient = new GameServer({
      port: 0,
      host: '127.0.0.1',
      maxQueueSeconds: 1,
      sweepSeconds: 1,
    });
    const impatientUrl = `ws://127.0.0.1:${await impatient.listen()}`;

    const cliente = await TestClient.connect(impatientUrl);
    cliente.send({ t: 'join', name: 'Olga', token: 'tok-o' });
    await cliente.waitFor('hello');
    cliente.send({ t: 'queue' });
    await cliente.waitFor('searching');

    const cancelado = await cliente.waitFor('search-cancelled', 8000);
    assert.match(cancelado.reason, /tiempo/i);

    cliente.close();
    await impatient.close();
  });

  it('avisa de cuantos hay conectados', async () => {
    const cliente = await join('Pedro', 'tok-p');
    await cliente.waitFor('status');
    const status = cliente.last('status');
    assert.ok(status !== undefined);
    assert.ok(status.online >= 2, 'al menos los dos clientes de esta prueba');
  });
});