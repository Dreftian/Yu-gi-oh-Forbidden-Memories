/**
 * Comprobacion manual del emparejamiento contra un servidor en marcha.
 *
 *   node tools/check-match.mjs [url]
 *
 * Conecta dos clientes con tokens distintos, los empareja por la cola y verifica
 * lo unico que importa para el modo en linea:
 *
 *  - los dos reciben la partida;
 *  - cada uno ve sus cinco cartas y ninguna del rival;
 *  - una jugada mueve el turno y ambos ven el mismo.
 *
 * Es la version de linea de comando de la prueba automatizada del servidor
 * (`packages/server/test/net.test.ts`), util para depurar un servidor ya
 * arrancado. Con `YFM_VERBOSE=1` imprime cada mensaje.
 */

import { WebSocket } from 'ws';

const url = process.argv[2] ?? 'ws://127.0.0.1:8787/ws';
const verbose = process.env.YFM_VERBOSE === '1';

/** Espera un poco a que llegue algo, sin depender deASY. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un cliente que acumula todo lo que recibe. */
function connect(name, token) {
  const socket = new WebSocket(url);
  const states = [];
  const notices = [];

  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (message.t === 'state') states.push(message.view);
    if (message.t === 'notice') notices.push(message.text);
    if (verbose) console.log(`  [${name}] <- ${message.t}`);
  });

  return {
    socket,
    states,
    notices,
    ready: new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    }),
    send: (message) => socket.send(JSON.stringify(message)),
    /** Espera hasta tener `count` estados, o se rinde. */
    async untilStates(count, timeoutMs = 4000) {
      const deadline = Date.now() + timeoutMs;
      while (this.states.length < count) {
        if (Date.now() > deadline) {
          throw new Error(`[${name}] solo recibio ${this.states.length} de ${count} estados`);
        }
        await wait(50);
      }
      return this.states[count - 1];
    },
  };
}

console.log(`conectando a ${url}`);

const a = connect('JugadorA', 'token-de-prueba-a');
const b = connect('JugadorB', 'token-de-prueba-b');

await a.ready;
await b.ready;

// El servidor no concede identidad hasta que recibe el `join`.
a.send({ t: 'join', name: 'JugadorA', token: 'token-de-prueba-a' });
b.send({ t: 'join', name: 'JugadorB', token: 'token-de-prueba-b' });
await wait(200);

console.log('A entra en la cola');
a.send({ t: 'queue' });
await wait(200);

console.log('B entra en la cola');
b.send({ t: 'queue' });

const firstA = await a.untilStates(1);
const firstB = await b.untilStates(1);

console.log('emparejados. A termina su turno');
a.send({ t: 'act', action: { type: 'ready' } });

const nextA = await a.untilStates(2);
const nextB = await b.untilStates(2);

/* ------------------------------------------------------------ Comprobado --- */

const problems = [];

if (firstA.you.hand.cards.length !== 5) problems.push('A no ve sus cinco cartas');
if (firstB.you.hand.cards.length !== 5) problems.push('B no ve sus cinco cartas');
if (firstA.opponent.hand.cards.length !== 0) problems.push('A ve la mano del rival');
if (firstB.opponent.hand.cards.length !== 0) problems.push('B ve la mano del rival');
if (firstA.turn !== firstB.turn) problems.push('no ven el mismo turno');
if (firstA.you.lifePoints !== 8000) problems.push('los PV no son 8000');

if (nextA.turn === firstA.turn) problems.push('la jugada no movio el turno');
if (nextA.turn !== nextB.turn) problems.push('tras la jugada no ven el mismo turno');
if (nextA.opponent.hand.cards.length !== 0) problems.push('la mano del rival se ha filtrado');

for (const client of [a, b]) {
  if (client.notices.length > 0) {
    problems.push(`avisos del servidor: ${client.notices.join('; ')}`);
  }
}

console.log(`  turno inicial ${firstA.turn} -> ${nextA.turn}`);
console.log(`  mano propia ${nextA.you.hand.cards.length}, rival ${nextA.opponent.hand.cards.length}`);

if (problems.length > 0) {
  console.error('\nfallos:');
  for (const problem of problems) console.error(`  - ${problem}`);
  a.socket.close();
  b.socket.close();
  process.exit(1);
}

console.log('\ncorrecto: empareja, reparte el turno y la mano del rival nunca viaja');

a.socket.close();
b.socket.close();
process.exit(0);