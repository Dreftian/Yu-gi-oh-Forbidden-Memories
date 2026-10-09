/**
 * Pantalla de bienvenida: elegir nombre y decidir como jugar.
 *
 * No hay registro. El nombre se guarda en este navegador y el token lo genera
 * el servidor la primera vez; a partir de ahi, volver a entrar es automatico.
 */

import { DECK_SIZE, LIFE_POINT_STEP, STARTING_LIFE_POINTS } from '@yfm/engine';

import { button, el, panel } from './dom.js';

/** Que hace la pantalla con lo que el jugador elige. */
export interface WelcomeHandlers {
  /** Entra con el nombre dado. */
  readonly connect: (name: string) => void;
  /** Olvida el nombre guardado y vuelve al formulario. */
  readonly forget: () => void;
}

/** Parametros de la pantalla. */
export interface WelcomeOptions {
  /** Nombre guardado de la ultima vez. */
  readonly savedName: string;
  /** Si ya hay identidad, se puede saltar el formulario. */
  readonly known: boolean;
}

/** Pinta la pantalla de bienvenida. */
export function renderWelcome(
  host: HTMLElement,
  options: WelcomeOptions,
  handlers: WelcomeHandlers,
): void {
  host.replaceChildren();

  // Si el navegador ya tiene nombre, se ofrece entrar directo.
  if (options.known && options.savedName !== '') {
    const name = options.savedName;
    const quick = panel('Bienvenido de nuevo', el('p', { text: `Vas a entrar como ${name}.` }));
    const row = el('div', { class: 'row' });
    row.append(button('Entrar', () => handlers.connect(name), 'primary'));
    row.append(button('Cambiar nombre', () => handlers.forget(), 'ghost'));
    quick.append(row);
    host.append(quick);
    return;
  }

  const node = panel('Yu-Gi-Oh! Forbidden Memories');

  node.append(
    el('p', {
      text:
        'Duelo de cartas en el navegador, con las reglas del original: ' +
        `${STARTING_LIFE_POINTS} puntos de vida, mano de cinco cartas, ` +
        'estrellas guardian y trampas.',
    }),
  );
  node.append(
    el('p', {
      text:
        'Se juega contra la CPU en este mismo dispositivo, o contra otra persona ' +
        'por emparejamiento en linea. No hace falta registrarse.',
    }),
  );

  const row = el('div', { class: 'row' });
  const input = el('input', { attrs: { type: 'text', maxlength: '16', placeholder: 'Tu nombre' } });
  (input as HTMLInputElement).value = options.savedName;

  const submit = () => {
    const name = (input as HTMLInputElement).value.trim();
    if (name === '') {
      (input as HTMLInputElement).focus();
      return;
    }
    handlers.connect(name);
  };

  input.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') submit();
  });

  row.append(input);
  row.append(button('Entrar', submit, 'primary'));
  node.append(row);

  host.append(node);
  host.append(rulesPanel());
}

/** Un panel con las reglas, para quien no las conozca. */
function rulesPanel(): HTMLElement {
  const node = panel('Las reglas de este duelo');
  const lines = [
    `Mazo de ${DECK_SIZE} cartas, ${STARTING_LIFE_POINTS} puntos de vida y mano de 5.`,
    'Cada turno se roba hasta llenar la mano, y hay que jugar al menos una carta.',
    'No hay tributo ni limite de invocacion: cualquier monstruo entra en una zona libre.',
    'La diferencia de ATK se paga con puntos de vida; contra un defensor se usa la DEF.',
    'Las estrellas guardian dan +500 o -500, y solo al atacante.',
    'Con las cinco piezas de Exodia en la mano a la vez, se gana al instante.',
    `Los puntos de vida iniciales se eligen en pasos de ${LIFE_POINT_STEP}.`,
  ];
  for (const line of lines) {
    node.append(el('p', { text: line }));
  }
  return node;
}