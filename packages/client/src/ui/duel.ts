/**
 * La pantalla de duelo: el campo, la mano y los controles.
 *
 * El componente no decide nada de reglas. Recibe una vista (`DuelView`) ya
 * calculada por el motor y devuelve acciones. Asi no hay ninguna forma de que la
 * interfaz y las reglas se desincronicen: lo que se puede hacer ya viene
 * resuelto en la vista.
 */

import { TERRAIN_NAMES } from '@yfm/engine';
import type { CardView, DuelView, PlayerAction } from '@yfm/engine';

import { button, chip, el, notice } from './dom.js';
import { cardView, describeCard, handCard } from './card.js';

/** Como se va a jugar una carta elegida de la mano. */
type CardUse = 'summon' | 'set' | 'equip' | 'activate' | 'ritual';

/**
 * Que ha elegido el jugador hasta ahora.
 *
 * Es una maquina de estados pequena y explicita en vez de un conjunto de
 * banderas sueltas: solo hay una intencion viva a la vez, y el clic siguiente
 * siempre sabe interpretarse en funcion de ella.
 */
type Intent =
  | { readonly kind: 'idle' }
  /** Una carta de la mano esperando destino. */
  | { readonly kind: 'card'; readonly index: number; readonly use: CardUse }
  /** Un monstruo propio esperando a quien atacar. */
  | { readonly kind: 'attacker'; readonly slot: number }
  /** Acumulando los tres tributos de un ritual. */
  | { readonly kind: 'ritual'; readonly index: number; readonly tributes: number[] };

/** Lo que la pantalla necesita del resto de la aplicacion. */
export interface DuelHandlers {
  readonly act: (action: PlayerAction) => void;
  readonly leave: () => void;
  readonly surrender: () => void;
  readonly chat: (text: string) => void;
}

/** Datos de la pantalla en este momento. */
export interface DuelScreenOptions {
  readonly view: DuelView;
  readonly over: boolean;
  readonly yourName: string;
  /**
   * Como se llama el rival, si hay un nombre que poner.
   *
   * Es opcional a proposito: en el modo campana el rival es un duelista con
   * nombre, y en los otros dos caminos no hay ninguno y se queda "Rival". Asi la
   * pantalla no necesita saber de donde viene la partida.
   */
  readonly opponentName?: string;
  readonly resultText: string;
}

/** Numero de zonas por fila, como en el retail. */
const ZONE_COUNT = 5;

/** La pantalla de duelo. */
export class DuelScreen {
  private intent: Intent = { kind: 'idle' };
  /** La carta que se esta mirando, para el panel de texto. */
  private hovered: CardView | null = null;
  /** El texto del chat que se esta escribiendo. */
  private chatDraft = '';

  constructor(
    private readonly handlers: DuelHandlers,
    private options: DuelScreenOptions,
  ) {}

  /** Datos nuevos y repintado. */
  update(options: DuelScreenOptions): void {
    // Si ya no es tu turno o se acabo la partida, cualquier intencion a medias
    // deja de tener sentido. Sin esto, un clic tarde podria jugar algo invalido.
    const wasMyTurn = this.options.view.you.isTurn;
    this.options = options;
    if (options.over || !options.view.you.isTurn || !wasMyTurn) this.intent = { kind: 'idle' };
  }

  /** Pinta todo. */
  render(host: HTMLElement): void {
    const { view } = this.options;
    host.replaceChildren();

    host.append(this.infoBar());
    host.append(this.field());

    const layout = el('div', { class: 'duel-layout' });
    layout.append(this.handBar());
    layout.append(this.sidePanel());
    host.append(layout);

    if (this.options.over) host.append(this.resultOverlay());
  }

  /* ------------------------------------------------------ Barra de datos -- */

  private infoBar(): HTMLElement {
    const { view } = this.options;
    const bar = el('div', { class: 'info-bar' });

    bar.append(lifeBlock(view.you.lifePoints, 'tu vida'));
    bar.append(lifeBlock(view.opponent.lifePoints, 'rival'));
    bar.append(chip('Turno', view.turnCount));
    bar.append(chip('En mazo', view.you.deckCount));

    bar.append(
      el('span', {
        class: `turn-flag${view.you.isTurn ? ' is-active' : ''}`,
        text: view.you.isTurn ? 'Tu turno' : 'Turno del rival',
      }),
    );

    if (view.terrain > 0) {
      bar.append(
        el('span', { class: 'terrain-flag', text: `Terreno: ${TERRAIN_NAMES[view.terrain] ?? 'Normal'}` }),
      );
    }

    // El contador interno va de 4 a 0; lo que se ve son tres turnos como maximo.
    const swords = view.opponent.swordsTurnsRemaining;
    if (swords > 0) {
      bar.append(el('span', { class: 'swords-flag', text: `Swords: ${Math.min(3, swords)} turnos` }));
    }

    return bar;
  }

  /* ------------------------------------------------------------- Campo --- */

private field(): HTMLElement {
    const { view } = this.options;
    const field = el('div', { class: 'field' });

    // De arriba abajo, el rival primero, igual que en el juego original. En el
    // modo campana su etiqueta es el nombre del duelista y ocupa mas que la
    // columna fija de "Rival", asi que lleva su propia clase.
    const rivalName = this.options.opponentName ?? 'Rival';
    field.append(this.fieldRow(rivalName, view.opponent, false, rivalName !== 'Rival'));
    field.append(this.fieldRow('Tu campo', view.you, true));

    return field;
  }

  /** Las dos filas de un lado: atras y monstruos. */
  private fieldRow(label: string, side: DuelView['you'], mine: boolean, wide = false): HTMLElement {
    const row = el('div', { class: 'field-row' });
    const labelNode = el('div', {
      class: wide ? 'field-row-label is-name' : 'field-row-label',
      text: label,
    });
    row.append(labelNode);

    const zones = el('div', { class: 'field-zones' });

    for (let slot = 0; slot < ZONE_COUNT; slot += 1) {
      zones.append(this.zone('back', slot, side.backRow[slot] ?? null, mine));
    }
    for (let slot = 0; slot < ZONE_COUNT; slot += 1) {
      zones.append(this.zone('monster', slot, side.monsters[slot] ?? null, mine));
    }

    row.append(zones);
    return row;
  }

  /** Una zona: la ficha que contiene, o el hueco si esta libre. */
  private zone(
    kind: 'back' | 'monster',
    slot: number,
    card: CardView | null,
    mine: boolean,
  ): HTMLElement {
    const node = el('button', { class: 'zone' });
    (node as HTMLButtonElement).type = 'button';

    if (this.isTarget(kind, slot, mine)) node.classList.add('is-targetable');

    if (card !== null) {
      node.classList.add('has-card');
      node.append(cardView(card));
      node.setAttribute(
        'aria-label',
        `Zona ${slot + 1} de ${kind === 'back' ? 'magias' : 'monstruos'}: ${card.id === null ? 'oculta' : card.name}`,
      );
      node.addEventListener('click', () => {
        this.hovered = card;
        this.onZoneClick(kind, slot, card, mine);
      });
    } else {
      node.setAttribute('aria-label', `Zona ${slot + 1} libre`);
      node.addEventListener('click', () => {
        this.hovered = null;
        this.onZoneClick(kind, slot, null, mine);
      });
    }

    return node;
  }

  /** Esta zona puede ser el destino de lo que hay elegido. */
  private isTarget(kind: 'back' | 'monster', _slot: number, mine: boolean): boolean {
    if (!mine || !this.options.view.you.isTurn || this.options.over) return false;
    const intent = this.intent;

    if (intent.kind === 'card') {
      if (intent.use === 'summon' || intent.use === 'equip' || intent.use === 'ritual') {
        return kind === 'monster';
      }
      if (intent.use === 'set') return kind === 'back';
      return false;
    }

    // Con un atacante elegido, los monstruos rivales son objetivo.
    if (intent.kind === 'attacker') return kind === 'monster' && !mine;
    return false;
  }

  /* -------------------------------------------------------------- Mano --- */

  private handBar(): HTMLElement {
    const { view } = this.options;
    const bar = el('div', { class: 'hand-bar' });
    bar.append(el('span', { class: 'life-label', text: `Tu mano (${view.you.hand.cards.length})` }));

    const playable = view.you.isTurn && !this.options.over;
    const cards = view.you.hand.cards;

    if (cards.length === 0) {
      bar.append(el('span', { class: 'life-label', text: 'sin cartas en la mano' }));
    } else {
      const hand = el('div', { class: 'hand' });
      cards.forEach((card, index) => {
        const node = handCard(card, index, {
          selected: this.intent.kind === 'card' && this.intent.index === index,
          playable,
        });
        node.addEventListener('click', () => this.onHandClick(index));
        node.addEventListener('mouseenter', () => {
          this.hovered = card;
        });
        hand.append(node);
      });
      bar.append(hand);
    }

    // Los botones de turno.
    const actions = el('div', { class: 'row' });
    if (this.intent.kind !== 'idle') {
      actions.append(button('Cancelar', () => this.reset()));
    }
    if (playable) {
      actions.append(button('Terminar turno', () => this.handlers.act({ type: 'ready' }), 'primary'));
    }
    actions.append(button('Rendirse', () => this.handlers.surrender(), 'danger ghost'));
    bar.append(actions);

    return bar;
  }

  /* ------------------------------------------- Panel lateral de apoyo --- */

  /** Registro, chat e inspeccion de cartas. */
  private sidePanel(): HTMLElement {
    const wrap = el('div', { class: 'duel-layout' });

    // La carta que se esta mirando.
    const inspect = el('div', { class: 'inspect' });
    const shown = this.pendingCard() ?? this.hovered;
    if (shown === null) {
      inspect.append(el('span', { text: 'Mira una carta para ver su texto.' }));
    } else {
      const described = describeCard(shown);
      inspect.append(el('strong', { class: 'inspect-title', text: described.title }));
      inspect.append(el('span', { text: described.body }));
    }
    wrap.append(inspect);

    // Indicacion de la intencion actual, que si no no se entiende el estado.
    if (this.intent.kind !== 'idle') {
      wrap.append(notice('info', this.intentHelp()));
    }

    // El historial del duelo.
    const logPanel = el('div', { class: 'panel' });
    logPanel.append(el('h2', { text: 'Registro' }));
    const log = el('div', { class: 'log' });
    const entries = this.options.view.log.slice(-24);
    if (entries.length === 0) {
      log.append(el('div', { text: 'Todavia no ha pasado nada.' }));
    } else {
      for (const entry of entries) {
        const line = el('div', { class: 'log-line' });
        line.append(el('span', { class: 'log-side', text: entry.side === 0 ? 'tu' : 'rival' }));
        line.append(el('span', { text: entry.text }));
        log.append(line);
      }
    }
    logPanel.append(log);
    wrap.append(logPanel);

    // El chat con el rival.
    wrap.append(this.chatPanel());
    return wrap;
  }

  /** Explica al jugador que se espera de el. */
  private intentHelp(): string {
    switch (this.intent.kind) {
      case 'card':
        if (this.intent.use === 'summon') return 'Elige una zona de monstruos para invocar.';
        if (this.intent.use === 'set') return 'Elige una zona de magias para colocarla boca abajo.';
        if (this.intent.use === 'equip') return 'Elige el monstruo al que equipar.';
        if (this.intent.use === 'ritual') return 'Ahora elige tres monstruos como tribute.';
        return '';
      case 'attacker':
        return 'Elige al monstruo rival al que atacar. Si no tiene ninguno, pulsa una zona vacia.';
      case 'ritual':
        return `Elige tres monstruos como tribute (${this.intent.tributes.length}/3).`;
      default:
        return '';
    }
  }

  /** El panel de chat. */
  private chatPanel(): HTMLElement {
    const node = el('div', { class: 'panel' });
    node.append(el('h2', { text: 'Chat' }));

    const messages = el('div', { class: 'chat' });
    messages.append(
      el('div', { class: 'chat-line', text: 'El chat solo llega a tu rival.' }),
    );
    node.append(messages);

    const form = el('div', { class: 'chat-form' });
    const input = el('input', { attrs: { type: 'text', maxlength: '280', placeholder: 'Escribe algo' } });
    (input as HTMLInputElement).value = this.chatDraft;
    input.addEventListener('input', () => {
      this.chatDraft = (input as HTMLInputElement).value;
    });
    input.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') {
        this.sendChat(input);
      }
    });
    form.append(input);
    form.append(button('Enviar', () => this.sendChat(input)));
    node.append(form);

    return node;
  }

  /** Manda lo que haya escrito y limpia el campo. */
  private sendChat(input: HTMLInputElement): void {
    const text = (input as HTMLInputElement).value.trim();
    if (text === '') return;
    this.handlers.chat(text);
    this.chatDraft = '';
    (input as HTMLInputElement).value = '';
  }

  /* ------------------------------------------------------------- Clics --- */

  /** El jugador elige una carta de la mano. */
  private onHandClick(index: number): void {
    if (!this.options.view.you.isTurn || this.options.over) return;

    const card = this.options.view.you.hand.cards[index];
    if (card === undefined) return;
    this.hovered = card;

    // Pulsar dos veces la misma carta la cancela.
    if (this.intent.kind === 'card' && this.intent.index === index) {
      this.reset();
      return;
    }

    const use = this.decideUse(card);
    if (use === null) {
      // No hay donde ponerla: se explica en vez de ignorear el clic en silencio.
      this.hovered = card;
      this.reset();
      return;
    }

    // Las magias se activan solas: no hay destino que elegir.
    if (use === 'activate') {
      this.handlers.act({ type: 'activate', cardIndex: index });
      this.reset();
      return;
    }

    this.intent = { kind: 'card', index, use };
  }

  /**
   * Decide como se juega una carta, o `null` si ahora mismo no se puede.
   *
   * Los monstruos necesitan zona libre; un equip necesita un monstruo al que
   * fijarse; una trampa necesita hueco en la fila de atras; un ritual necesita
   * monstruos en el campo.
   */
  private decideUse(card: CardView): CardUse | null {
    const type = card.type;
    if (type === undefined) return null;

    const view = this.options.view;
    const freeMonster = view.you.monsters.some((m) => m === null);
    const freeBack = view.you.backRow.some((m) => m === null);
    const hasMonster = view.you.monsters.some((m) => m !== null);
    const ownedMonsters = view.you.monsters.filter((m) => m !== null).length;

    if (type < 20) return freeMonster ? 'summon' : null;
    if (type === 22) return ownedMonsters >= 3 ? 'ritual' : null;
    if (type === 23) return hasMonster ? 'equip' : null;
    if (type === 21) return freeBack ? 'set' : null;
    // Magia: siempre se puede activar.
    return 'activate';
  }

  /** El jugador hace clic en una zona del campo. */
  private onZoneClick(
    kind: 'back' | 'monster',
    slot: number,
    card: CardView | null,
    mine: boolean,
  ): void {
    if (!this.options.view.you.isTurn || this.options.over) return;
    const intent = this.intent;

    // Hay una carta de la mano esperando destino.
    if (intent.kind === 'card') {
      switch (intent.use) {
        case 'summon':
          if (kind !== 'monster' || !mine || card !== null) return;
          this.handlers.act({ type: 'summon', cardIndex: intent.index, slot, useStar2: false });
          this.reset();
          return;

        case 'set':
          if (kind !== 'back' || !mine || card !== null) return;
          this.handlers.act({ type: 'set', cardIndex: intent.index, slot });
          this.reset();
          return;

        case 'equip':
          if (kind !== 'monster' || !mine || card === null) return;
          this.handlers.act({ type: 'equip', cardIndex: intent.index, slot });
          this.reset();
          return;

        case 'ritual':
          // El ritual pasa a su propio estado: acumula tres tributos y lanza.
          if (kind !== 'monster' || !mine || card === null) return;
          this.intent = { kind: 'ritual', index: intent.index, tributes: [slot] };
          return;

        default:
          return;
      }
    }

    // Acumulando los tributos de un ritual ya en marcha.
    if (intent.kind === 'ritual') {
      if (kind !== 'monster' || !mine || card === null) return;
      if (intent.tributes.includes(slot)) return;
      this.addTribute(intent.index, intent.tributes, slot);
      return;
    }

    // Un monstruo propio, sin nada elegido: se elige como tribute del ritual
    // que este en la mano, o como atacante.
    if (mine && kind === 'monster' && card !== null && intent.kind === 'idle') {
      this.intent = { kind: 'attacker', slot };
      return;
    }

    // Un monstruo rival con un atacante elegido: se declara el ataque.
    if (!mine && kind === 'monster' && card !== null && intent.kind === 'attacker') {
      this.handlers.act({ type: 'attack', slot: intent.slot, target: slot });
      this.reset();
      return;
    }

    // Una Magia propia boca arriba: se activa desde el campo.
    if (mine && kind === 'back' && card !== null && card.id !== null && card.type === 20 && !card.faceDown) {
      this.handlers.act({ type: 'activate-field', slot });
      this.reset();
    }
  }

  /**
 * Anade un tributo y, al llegar a tres, lanza el ritual.
   *
   * El retail exige tres registros ocupados distintos de la fila propia: por eso
   * se ignoran las zonas ya elegidas y por eso son tres y no dos.
   */
  private addTribute(index: number, tributes: readonly number[], slot: number): void {
    const next = [...tributes, slot];
    if (next.length < 3) {
      this.intent = { kind: 'ritual', index, tributes: next };
      return;
    }
    this.handlers.act({ type: 'ritual', cardIndex: index, tributes: next });
    this.reset();
  }

  /** Vuelve al estado sin intencion pendiente. */
  private reset(): void {
    this.intent = { kind: 'idle' };
  }

  /** La carta de la mano que esta pendiente, si la hay. */
  private pendingCard(): CardView | null {
    if (this.intent.kind !== 'card') return null;
    return this.options.view.you.hand.cards[this.intent.index] ?? null;
  }

  /* ----------------------------------------------------------- Resultado -- */

  /** El cartel de final de partida. */
  private resultOverlay(): HTMLElement {
    const { view } = this.options;
    const won = view.outcome !== null && view.outcome.winner === 0;

    const box = el('div', { class: 'overlay' });
    const card = el('div', { class: 'overlay-card result' });

    card.append(el('h2', { class: won ? 'win' : 'lose', text: this.options.resultText }));

    const stats = el('div', { class: 'stats-grid' });
    stats.append(statBox('Turnos', view.turnCount));
    stats.append(statBox('Tu vida', view.you.lifePoints));
    stats.append(statBox('Vida rival', view.opponent.lifePoints));
    stats.append(statBox('Mazo rival', view.opponent.deckCount));
    card.append(stats);

    card.append(button('Volver al menu', () => this.handlers.leave(), 'primary'));
    box.append(card);
    return box;
  }
}

/** Un dato del resumen de final. */
function statBox(label: string, value: number | string): HTMLElement {
  const node = el('div', { class: 'stat' });
  node.append(el('div', { class: 'stat-value', text: String(value) }));
  node.append(el('div', { class: 'stat-label', text: label }));
  return node;
}

/** Un bloque de puntos de vida. */
function lifeBlock(value: number, label: string): HTMLElement {
  const node = el('div', { class: 'life' });
  node.append(el('span', { class: 'life-value', text: String(value) }));
  node.append(el('span', { class: 'life-label', text: label }));
  return node;
}

/** El titulo del final, en funcion de como acabo y de quien gano. */
export function resultText(view: DuelView, youWon: boolean): string {
  const outcome = view.outcome;
  if (outcome === null) return '';
  switch (outcome.kind) {
    case 'lp':
      return youWon ? 'Victoria por aniquilacion' : 'Derrota por aniquilacion';
    case 'deckout':
      return youWon ? 'Victoria por agotamiento' : 'Derrota por agotamiento';
    case 'exodia':
      return youWon ? 'SUMMON Exodia' : 'El rival hizo SUMMON Exodia';
    case 'surrender':
      return youWon ? 'Victoria por rendicion' : 'Has rendido';
    default:
      return 'Partida terminada';
  }
}