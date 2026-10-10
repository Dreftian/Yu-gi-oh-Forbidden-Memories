/**
 * La campana: elegir con cual de los 40 duelistas del retail te peleas.
 *
 * Cada duelista tiene un pool de mazo con pesos, no un mazo fijo: las 40 cartas
 * se sortean de ese pool en cada partida
 * (`notes/research/fusion-and-drop-tables/README.md:25-27`). Por eso la pantalla
 *enseña dos cosas de cada uno: cuantas cartas tiene en el pool (de 21 a 169) y
 * cuales son sus cartas mas pesadas, que son las que mas veces salen.
 *
 * Solo pinta. El duelo lo arranca `main.ts` con `rollDuelistDeck` y el mismo motor
 * y la misma IA del modo contra la CPU: aqui no hay ninguna regla.
 *
 * Todo el texto viene del dato generado y se pinta con `el()`, nunca con
 * innerHTML: un nombre con `<` tiene que verse como texto.
 */

import { DUELISTS, card } from '@yfm/engine';
import type { CardView, DuelistData, DropEntry } from '@yfm/engine';

import { button, el, panel } from './dom.js';
import { cardView } from './card.js';

/** Lo que hace la pantalla de campana. */
export interface CampaignHandlers {
  /** Empieza un duelo local contra ese duelista. */
  readonly duel: (duelistId: number) => void;
  /** Vuelve al vestibulo. */
  readonly back: () => void;
}

/** Cuantas cartas de muestra se pintan por duelista. */
const SAMPLE_SIZE = 3;

/**
 * Las cartas de mayor peso del pool, de mas a menos.
 *
 * Se ordenan por peso porque es lo que el jugador quiere ver: la carta que sale
 * dos veces mas es la que define como juega ese duelista. Los empates se rompen
 * por id para que el orden sea siempre el mismo con el mismo dato.
 */
function heaviestCards(duelist: DuelistData, count: number): DropEntry[] {
  return [...duelist.deck]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, count);
}

/** La vista de una carta del catalogo, para pintarla con `cardView`. */
function cardViewOf(cardId: number): CardView | null {
  const data = card(cardId);
  if (data === undefined) return null;
  return {
    id: data.id,
    name: data.name,
    faceDown: false,
    type: data.type,
    attribute: data.attribute,
    level: data.level,
    stars: data.stars,
    attack: data.attack,
    defense: data.defense,
  };
}

/** Una casilla: el nombre, el tamano del pool, sus cartas mas pesadas y el boton. */
function duelistTile(duelist: DuelistData, handlers: CampaignHandlers): HTMLElement {
  const sample = heaviestCards(duelist, SAMPLE_SIZE).map((entry) => entry[0]);
  const names = sample.map((cardId) => card(cardId)?.name ?? '???');

  // La casilla entera es el boton, como las cartas de la mano: asi es un solo
  // punto de tabulacion por duelista y el teclado llega a todos sin effort. El
  // `aria-label` cuenta lo mismo que el texto, para quien no ve las mini-cartas.
  const tile = el('button', { class: 'campaign-tile' });
  (tile as HTMLButtonElement).type = 'button';
  tile.setAttribute(
    'aria-label',
    `Duelear contra ${duelist.name}. Su mazo se sortea de un pool de ${duelist.deck.length} cartas. ` +
      `Las mas frecuentes son ${names.join(', ')}.`,
  );
  tile.addEventListener('click', () => handlers.duel(duelist.id));

  tile.append(el('span', { class: 'campaign-name', text: duelist.name }));

  const meta = el('span', { class: 'campaign-pool' });
  meta.append(el('span', { text: `Pool de mazo: ${duelist.deck.length} cartas` }));
  tile.append(meta);

  const cards = el('span', { class: 'campaign-cards' });
  for (const cardId of sample) {
    const view = cardViewOf(cardId);
    if (view === null) continue;
    const mini = el('span', { class: 'campaign-mini' });
    mini.append(cardView(view));
    cards.append(mini);
  }
  tile.append(cards);

  tile.append(el('span', { class: 'campaign-go', text: 'Duelear' }));

  return tile;
}

/** Pinta el selector de duelistas. */
export function renderCampaign(host: HTMLElement, handlers: CampaignHandlers): void {
  host.replaceChildren();

  const head = panel(
    'Campana',
    el('p', {
      text:
        'Elige duelista. Su mazo no es una lista fija: en el original se sortea de su ' +
        'propio pool con los pesos de la tabla, asi que dos partidas contra el mismo ' +
        'duelista no se juegan con el mismo mazo.',
    }),
  );
  head.append(button('Volver al vestibulo', () => handlers.back(), 'ghost'));
  host.append(head);

  const grid = el('div', { class: 'campaign-grid' });
  // El id 0 del retail es "(unused; copy of Simon Muran)", una copia del 1 que el
  // juego guarda sin usar. Se pinta tambien: es dato real de la tabla y decidir
  // aqui que duelistas "cuentan" seria inventarse una regla que no existe.
  for (const duelist of DUELISTS) grid.append(duelistTile(duelist, handlers));

  host.append(panel(`Los ${DUELISTS.length} duelistas`, grid));
}