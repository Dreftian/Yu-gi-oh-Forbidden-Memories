/**
 * Punto de entrada del cliente.
 *
 * Monta la aplicacion y decide que pantalla se ve: bienvenida, vestibulo o
 * duelo. El flujo tiene dos ramas que comparten el motor pero no la red:
 *
 *  - **En linea**: el servidor manda. El cliente solo envia jugadas y pinta lo
 *    que le llega.
 *  - **Contra la CPU**: el motor corre aqui. No hace falta servidor, asi que
 *    funciona sin conexion.
 */

import { DuelSession, STARTING_LIFE_POINTS, viewFor } from '@yfm/engine';
import type { DuelState, DuelView, PlayerAction } from '@yfm/engine';

import { NetClient, loadName, loadToken, saveName } from './net.js';
import type { NetState } from './net.js';
import { cpuTurn } from './ai.js';
import { DuelScreen, resultText } from './ui/duel.js';
import type { DuelHandlers } from './ui/duel.js';
import { button, chip, el, render } from './ui/dom.js';
import { renderLobby, renderNotice } from './ui/lobby.js';
import { renderWelcome } from './ui/welcome.js';
import { Rng } from '@yfm/engine';

/** Que pantalla se esta viendo. */
type Screen = 'welcome' | 'lobby' | 'duel' | 'cpu';

/** Cuanto espera antes de preguntar por un rival que no llega. */
const AI_DELAY_MS = 450;

/** La aplicacion completa. */
class App {
  private readonly root: HTMLElement;
  private readonly net: NetClient;
  private screen: Screen = 'welcome';
  private duel: DuelScreen | null = null;

  /** La sesion del modo contra la CPU. */
  private cpu: { session: DuelSession; state: DuelState; rng: Rng } | null = null;
  /** Si la CPU ya esta pensando, para no encadenar dos turnos suyos. */
  private cpuThinking = false;
  /** Para cancelar el turno de la CPU si el jugador sale antes de tiempo. */
  private cpuTimer: number | null = null;

  /** El token guardado, para reconectar sin pedir nombre otra vez. */
  private token = loadToken();
  private name = loadName();

  constructor(root: HTMLElement) {
    this.root = root;
    this.net = new NetClient(() => this.render());
  }

  /** Arranca. */
  start(): void {
    // Si hay token guardado se entra directo al vestibulo: recargar no debe
    // costing el nombre otra vez.
    if (this.token !== '') {
      this.net.connect(this.name === '' ? 'Duelista' : this.name, this.token);
    }
    this.render();
  }

  /** Cambia de pantalla y repinta. */
  private go(screen: Screen): void {
    this.screen = screen;
    this.render();
  }

  /** Repinta la pantalla actual. */
  private render(): void {
    const state = this.net.getState();

    // El servidor manda una vista y hay que estar en la pantalla de duelo.
    if (state.view !== null && this.screen === 'lobby') this.go('duel');

    this.root.replaceChildren();
    this.root.append(this.topbar(state));

    const noticeNode = renderNotice(state);
    if (noticeNode !== null) this.root.append(noticeNode);

    switch (this.screen) {
      case 'welcome':
        this.renderWelcome();
        break;
      case 'lobby':
        this.renderLobby(state);
        break;
      case 'duel':
        this.renderDuel(state);
        break;
      case 'cpu':
        this.renderCpu();
        break;
      default:
        break;
    }
  }

  /* ----------------------------------------------------------- Cabecera -- */

  private topbar(state: NetState): HTMLElement {
    const bar = el('header', { class: 'topbar' });

    const title = el('h1');
    title.append('Yu-Gi-Oh! ');
    title.append(el('span', { text: 'Forbidden Memories' }));
    bar.append(title);

    bar.append(el('div', { class: 'topbar-spacer' }));

    // El estado de la conexion, que es lo primero que hay que saber.
    const connected = state.connection === 'open';
    const chipNode = chip(
      connected ? 'En linea' : 'Sin conexion',
      connected ? `${state.online} jugadores` : '...',
      connected ? '' : 'is-offline',
    );
    bar.append(chipNode);

    if (connected && state.playing > 0) bar.append(chip('Partidas', state.playing));

    if (this.screen !== 'welcome') {
      bar.append(button('Menu', () => this.toMenu(), 'ghost'));
    }
    return bar;
  }

  /* ---------------------------------------------------------- Bienvenida -- */

  private renderWelcome(): void {
    renderWelcome(
      this.root,
      { savedName: this.name, known: this.token !== '' },
      {
        connect: (name) => this.connect(name),
        forget: () => {
          // Olvidar el nombre es local: el token se conserva para que al
          // escribir el nuevo nombre no pierda la identidad.
          this.name = '';
          saveName('');
          this.render();
        },
      },
    );
  }

  /** Conecta al servidor con el nombre elegido. */
  private connect(name: string): void {
    this.name = name;
    saveName(name);
    this.net.connect(name, this.token);
    this.go('lobby');
  }

  /* ----------------------------------------------------------- Vestibulo -- */

  private renderLobby(state: NetState): void {
    const host = el('div');
    this.root.append(host);

    renderLobby(host, state, {
      queue: () => this.net.queue(),
      unqueue: () => this.net.unqueue(),
      createRoom: (lifePoints) => this.net.createRoom(lifePoints),
      joinRoom: (code) => this.net.joinRoom(code),
      playCpu: () => this.startCpuDuel(),
    });
  }

  /* ------------------------------------------------------------- Duelo ---- */

  private renderDuel(state: NetState): void {
    const view = state.view;
    if (view === null) {
      this.root.append(el('div', { class: 'hand-empty', text: 'Emparejando...' }));
      return;
    }

    const handlers: DuelHandlers = {
      act: (action) => this.net.act(action),
      leave: () => this.leaveDuel(),
      surrender: () => this.net.act({ type: 'surrender' }),
      chat: (text) => this.net.chat(text),
    };

    const options = {
      view,
      over: state.over,
      yourName: state.player?.name ?? '',
      resultText: resultText(view, view.outcome?.winner === 0),
    };

    // La pantalla se reutiliza entre repintados para no perder la intencion a
    // medias: si se recreara en cada clic, elegir una carta y su destino seria
    // imposible.
    if (this.duel === null) this.duel = new DuelScreen(handlers, options);
    this.duel.update(options);

    const host = el('div');
    this.root.append(host);
    this.duel.render(host);

    if (state.chat.length > 0) {
      const chat = el('div', { class: 'panel' });
      chat.append(el('h2', { text: 'Chat del rival' }));
      const box = el('div', { class: 'chat' });
      for (const message of state.chat.slice(-8)) {
        const line = el('div', { class: 'chat-line' });
        line.append(el('b', { text: `${message.from}: ` }));
        line.append(el('span', { text: message.text }));
        box.append(line);
      }
      chat.append(box);
      this.root.append(chat);
    }
  }

  /** Salir de la partida en linea y volver al vestibulo. */
  private leaveDuel(): void {
    this.net.leave();
    this.duel = null;
    this.go('lobby');
  }

  /** Vuelve al menu cancelando lo que hubiera en marcha. */
  private toMenu(): void {
    this.cancelCpuTimer();
    this.cpu = null;
    this.duel = null;
    if (this.screen === 'duel') this.net.leave();
    this.go(this.token === '' ? 'welcome' : 'lobby');
  }

  /* ------------------------------------------------------- Contra la CPU -- */

  /** Arranca una partida local contra la CPU. */
  private startCpuDuel(): void {
    const seed = Math.floor(Math.random() * 0xffffffff);
    const session = DuelSession.create(seed, [
      { cards: null, lifePoints: STARTING_LIFE_POINTS },
      { cards: null, lifePoints: STARTING_LIFE_POINTS },
    ]);
    this.cpu = { session, state: session.getState(), rng: new Rng(seed) };
    this.duel = null;
    this.go('cpu');
    this.maybeRunCpu();
  }

  /** Repinta la partida local. */
  private renderCpu(): void {
    const cpu = this.cpu;
    if (cpu === null) {
      this.go('lobby');
      return;
    }

    const view: DuelView = viewFor(cpu.state, 0);
    const handlers: DuelHandlers = {
      act: (action) => this.cpuAct(action),
      leave: () => this.toMenu(),
      surrender: () => {
        const next = cpu.session.act({ type: 'surrender' });
        cpu.state = next;
        this.render();
      },
      // En local no hay nadie al que escribirle.
      chat: () => {},
    };

    const options = {
      view,
      over: cpu.state.outcome !== null,
      yourName: 'Tu',
      resultText: resultText(view, cpu.state.outcome?.winner === 0),
    };

    if (this.duel === null) this.duel = new DuelScreen(handlers, options);
    this.duel.update(options);

    const host = el('div');
    this.root.append(host);
    this.duel.render(host);
  }

  /** Aplica una jugada del jugador en la partida local. */
  private cpuAct(action: PlayerAction): void {
    const cpu = this.cpu;
    if (cpu === null || cpu.state.outcome !== null) return;

    const next = cpu.session.act(action);
    cpu.state = next;
    this.render();
    this.maybeRunCpu();
  }

  /**
   * Lanza el turno de la CPU si toca y no esta pensando ya.
   *
   * El retardo no es cosmetico: sin el, la pantalla se redibuja dozens de veces
   * seguidas y las animaciones no llegan a verse.
   */
  private maybeRunCpu(): void {
    const cpu = this.cpu;
    if (cpu === null || cpu.state.outcome !== null) return;
    if (cpu.state.turn !== 1) return;
    if (this.cpuThinking) return;

    this.cpuThinking = true;
    this.cpuTimer = window.setTimeout(() => {
      this.cpuTimer = null;
      const current = this.cpu;
      if (current === null || current.state.outcome !== null) {
        this.cpuThinking = false;
        return;
      }
      current.state = cpuTurn(current.state, current.rng);
      this.cpuThinking = false;
      this.render();
      // La CPU puede haber pasado el turno al jugador; no hace falta seguir.
    }, AI_DELAY_MS);
  }

  /** Cancela el turno pendiente de la CPU. */
  private cancelCpuTimer(): void {
    if (this.cpuTimer !== null) {
      window.clearTimeout(this.cpuTimer);
      this.cpuTimer = null;
    }
    this.cpuThinking = false;
  }
}

/* ------------------------------------------------------------- Arranque --- */

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Falta el contenedor #app en la pagina.');
}

const app = new App(root);
app.start();

// Un saludo para la consola del navegador, util cuando se depura.
void render;