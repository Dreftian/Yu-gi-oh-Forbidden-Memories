/**
 * Dibujo de cartas.
 *
 * El repositorio no incluye el arte del juego: las texturas estan dentro del
 * disco original, que no se puede distribuir. Asi que la carta se compone por
 * capas con CSS: filete del color de su tipo, doble filete interior, nombre,
 * banda de tipo, ventana de arte con textura holografica y las placas de
 * ATK y DEF. El unico elemento que se genera con codigo es el emblema de la
 * ventana, que sale de una mezcla del id de carta para que dos cartas
 * distintas nunca dibujen el mismo emblema.
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

/**
 * Las siluetas posibles del emblema.
 *
 * Cuatro formas distintas y reconocibles, no ruido: basta una mezcla del id
 * para elegir una, de modo que el mismo id da siempre el mismo dibujo sin
 * guardar nada.
 */
const EMBLEMS = ['e-ring', 'e-crest', 'e-prism', 'e-star'] as const;

/**
 * Mezcla entera de un id, para sacarle varias cifras independientes.
 *
 * Los ids del catalogo son correlativos: con un solo `%` casi todas las cartas
 * caerian en la misma silueta. La mezcla de avalanche (xor y desplazamientos)
 * reparte esos bits por todo el numero.
 */
function mix(id: number): number {
  let h = id >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * El emblema que va dentro de la ventana de arte.
 *
 * El CSS hace toda la forma; aqui solo se le pasan cuatro numeros derivados
 * del id: el tono (un desplazamiento del matiz del tipo, para que cada carta
 * tenga color propio sin salirse de la paleta del marco), el giro, y dos
 * desplazamientos pequenos que evitan que todas los emblemas salgan centrados
 * en el mismo milimetro.
 */
function emblem(id: number): HTMLElement {
  const h = mix(id);
  const node = el('div', { class: `card-emblem ${EMBLEMS[h % EMBLEMS.length]}` });
  node.style.setProperty('--emb-shift', String(((h >>> 4) % 61) - 30));
  node.style.setProperty('--emb-r', `${(h >>> 10) % 360}deg`);
  node.style.setProperty('--emb-x', `${((((h >>> 16) % 9) - 4) / 2).toFixed(2)}%`);
  node.style.setProperty('--emb-y', `${((((h >>> 20) % 9) - 4) / 2).toFixed(2)}%`);
  node.append(el('div', { class: 'card-emblem-core' }));
  return node;
}

/**
 * La banda de tipo, justo bajo el nombre.
 *
 * Antes estos cuatro datos iban apilados dentro del hueco del arte; ahi se
 * perdian entre las rayas de fondo. Ahora son su propia zona, con el tipo
 * en color y el resto en un tono mas soso para que el tipo mande.
 */
function cardMeta(view: CardView, equipped: boolean): HTMLElement {
  const band = el('div', { class: 'card-meta' });

  if (view.type !== undefined) {
    band.append(el('span', { class: 'card-meta-type', text: cardTypeName(view.type) }));
  }
  if (view.level !== undefined && view.level > 0) {
    band.append(el('span', { class: 'card-meta-level', text: `N${view.level}` }));
  }

  const attribute = cardAttributeName(view.attribute);
  if (attribute !== '') band.append(el('span', { class: 'card-meta-attr', text: attribute }));

  const stars = view.stars;
  if (stars !== undefined && stars[0] > 0) {
    // La segunda estrella va en su propio span porque el ancho decide si cabe:
    // el CSS lo quita en la ficha del campo, donde no hay sitio.
    band.append(el('span', { class: 'card-meta-stars', text: guardianStarName(stars[0]) }));
    if (stars[1] !== stars[0]) {
      band.append(el('span', { class: 'card-meta-stars card-meta-star2', text: guardianStarName(stars[1]) }));
    }
  }

  // El equip no cabe en un hueco propio sin tapar el emblema, asi que se marca
  // en la banda, que siempre esta visible.
  if (equipped) band.append(el('span', { class: 'card-meta-equipped', text: 'EQ' }));

  return band;
}

/**
 * Una placa de estadistica.
 *
 * El numero va suelto y en color, como en el marco real: el rojo es ATK y el
 * azul es DEF. La etiqueta se queda solo para lectores de pantalla, porque a
 * 3.4rem de ancho no cabe escribir "ATK" al lado de cada numero.
 */
function statPlate(kind: 'atk' | 'def', value: number): HTMLElement {
  const plate = el('span', { class: `card-stat card-stat-${kind}` });
  plate.append(el('b', { class: 'card-stat-label', text: `${kind === 'atk' ? 'ATK' : 'DEF'} ` }));
  plate.append(el('span', { class: 'card-stat-value', text: String(value) }));
  return plate;
}

/** Una carta visible. */
export function cardView(view: CardView, options: { faceDown?: boolean } = {}): HTMLElement {
  // Una carta boca abajo, o cuya identidad no nos ha llegado, es una ficha.
  if (view.faceDown || options.faceDown === true || view.id === null) {
    return el('div', {
      class: `card-back${view.defensePosition === true ? ' is-defense' : ''}`,
      text: view.defensePosition === true ? 'DEF' : '?',
    });
  }

  const equipped = view.equipped === true;
  const classes = ['card', frameClass(view.type)];
  // El halo de la ficha equipada lo pinta el CSS a partir de esta clase.
  if (equipped) classes.push('is-equipped');
  const node = el('div', { class: classes.join(' ') });

  node.append(el('div', { class: 'card-name', text: view.name }));
  node.append(cardMeta(view, equipped));

  const art = el('div', { class: 'card-art' });
  art.append(emblem(view.id));
  // La marca de posicion de defensa va flotando sobre la ventana: si ocupara
  // su propia fila, en la ficha del campo no le quedaria altura al emblema.
  if (view.defensePosition === true) {
    art.append(el('div', { class: 'card-stats card-stats-def', text: 'DEF' }));
  }
  node.append(art);

  // Magias, trampas y Ancestros sin numeros no gastan fila en placas.
  const hasStats =
    view.attack !== undefined && view.defense !== undefined && (view.attack > 0 || view.defense > 0);
  if (hasStats) {
    const stats = el('div', { class: 'card-stats' });
    stats.append(statPlate('atk', view.attack ?? 0));
    stats.append(statPlate('def', view.defense ?? 0));
    node.append(stats);
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
  if (view.equipped === true) lines.push('Lleva un equip puesto.');
  if (view.defensePosition === true) lines.push('En posicion de defensa.');
  if (view.description !== undefined && view.description !== '') lines.push('', view.description);

  return { title: view.name, body: lines.join('\n') };
}