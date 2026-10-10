/**
 * Dibujo de cartas.
 *
 * El repositorio no incluye el arte del juego: las texturas estan dentro del
 * disco original, que no se puede distribuir. Asi que la carta se compone con
 * un marco del color de su tipo, el nombre, el arte como un hueco rayado y las
 * estadisticas. El marco es el color real del retail (oro, verde, rosa, azul),
 * de modo que la silueta de un duelo se lee igual que en el original.
 */

import { cardAttributeName, cardTypeName, guardianStarName } from '@yfm/engine';
import type { CardView } from '@yfm/engine';

import { el } from './dom.js';

/**
 * La clase de marco segun el tipo de carta.
 *
 * Los colores son los del retail (`notes/card-catalog.md`): oro para
 * monstruos, verde para magia y equip, rosa para trampa, azul para ritual.
 */
function frameClass(type: number | undefined): string {
  switch (cardTypeName(type)) {
    case 'Magic':
      return 't-magic';
    case 'Equip':
      return 't-equip';
    case 'Trap':
      return 't-trap';
    case 'Ritual':
      return 't-ritual';
    default:
      return 't-monster';
  }
}

/** Una carta visible. */
export function cardView(view: CardView, options: { faceDown?: boolean } = {}): HTMLElement {
  // Una carta boca abajo, o cuya identidad no nos ha llegado, es una ficha.
  if (view.faceDown || options.faceDown === true || view.id === null) {
    const back = el('div', {
      class: `card-back${view.defensePosition === true ? ' is-defense' : ''}`,
      text: view.defensePosition === true ? 'DEF' : '?',
    });
    return back;
  }

  const node = el('div', { class: `card ${frameClass(view.type)}` });

  node.append(el('div', { class: 'card-name', text: view.name }));

  // El hueco del arte. Sin imagen que poner, muestra el tipo y el atributo.
  const art = el('div', { class: 'card-art' });
  const typeName = cardTypeName(view.type);
  const attributeName = cardAttributeName(view.attribute);
  const level = view.level === undefined || view.level === 0 ? '' : `N${view.level}`;
  const stars =
    view.stars === undefined || view.stars[0] === 0
      ? ''
      : `${guardianStarName(view.stars[0])}${
          view.stars[1] === view.stars[0] ? '' : `/${guardianStarName(view.stars[1])}`
        }`;
  // Los cuatro datos van apilados dentro del hueco del arte; el CSS los
  // muestra en varias lineas con los saltos que se dejan aqui.
  art.append(
    el('span', { text: [typeName, attributeName, level, stars].filter((part) => part !== '').join('\n') }),
  );
  node.append(art);

  if (view.attack !== undefined && view.defense !== undefined && (view.attack > 0 || view.defense > 0)) {
    const stats = el('div', { class: 'card-stats' });
    stats.append(el('span', { text: `${view.attack}` }));
    stats.append(el('span', { text: `${view.defense}` }));
    node.append(stats);
  }

  // El icono de defensa va aparte porque cambia el aspecto de la ficha.
  if (view.defensePosition === true) {
    node.append(el('div', { class: 'card-stats', text: 'DEF' }));
  }

  return node;
}

/**
 * Una carta en la mano.
 *
 * `onSelect` recibe el indice dentro de la mano, que es lo que espera el motor.
 */
export function handCard(
  view: CardView,
  index: number,
  options: {
    selected?: boolean;
    playable?: boolean;
    onSelect?: (index: number) => void;
  } = {},
): HTMLElement {
  const classes = ['card-hand'];
  if (options.selected === true) classes.push('is-selected');
  if (options.playable === true) classes.push('is-playable');

  const node = el('button', { class: classes.join(' ') });
  (node as HTMLButtonElement).type = 'button';
  node.setAttribute(
    'aria-label',
    `${view.name}. ${cardTypeName(view.type)} ATK ${view.attack ?? 0}, DEF ${view.defense ?? 0}.`,
  );
  node.append(cardView(view));

  if (options.onSelect !== undefined) {
    const handler = options.onSelect;
    node.addEventListener('click', () => handler(index));
  }
  return node;
}

/** El texto de una carta, para el panel de inspeccion. */
export function describeCard(view: CardView): { title: string; body: string } {
  if (view.id === null || view.faceDown) {
    return { title: 'Carta boca abajo', body: 'No se ve lo que es hasta que se resuelve.' };
  }

  const lines: string[] = [];
  lines.push(`Tipo: ${cardTypeName(view.type)}`);
  const attribute = cardAttributeName(view.attribute);
  if (attribute !== '') lines.push(`Atributo: ${attribute}`);
  if (view.level !== undefined && view.level > 0) lines.push(`Nivel ${view.level}`);
  if (view.stars !== undefined && view.stars[0] > 0) {
    lines.push(`Estrellas: ${guardianStarName(view.stars[0])} / ${guardianStarName(view.stars[1])}`);
    if (view.useStar2 === true) lines.push('Esta vez juega con la segunda estrella.');
  }
  if (view.attack !== undefined && view.defense !== undefined) {
    lines.push(`ATK ${view.attack} / DEF ${view.defense}`);
  }
  if (view.defensePosition === true) lines.push('En posicion de defensa.');
  if (view.description !== undefined && view.description !== '') lines.push('', view.description);

  return { title: view.name, body: lines.join('\n') };
}