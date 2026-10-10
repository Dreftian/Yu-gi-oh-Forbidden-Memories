/**
 * El vestibulo: donde se elige contra quien jugar.
 *
 * Tres caminos, y solo tres:
 *
 *  - **Emparejamiento**: entras en la cola y el servidor te busca rival.
 *  - **Sala privada**: creas una con un codigo de cinco caracteres y se lo pasas
 *    a quien quieras jugar.
 *  - **Contra la CPU**: se juega en este mismo dispositivo, sin servidor.
 */

import { STARTING_LIFE_POINTS, isValidLifePoints } from '@yfm/engine';

import { button, el, notice, panel } from './dom.js';
import type { NetState } from '../net.js';

/** Lo que hace el vestibulo. */
export interface LobbyHandlers {
  readonly queue: () => void;
  readonly unqueue: () => void;
  readonly createRoom: (lifePoints: number) => void;
  readonly joinRoom: (code: string) => void;
  readonly playCpu: () => void;
}

/** Pinta el vestibulo. */
export function renderLobby(host: HTMLElement, state: NetState, handlers: LobbyHandlers): void {
  host.replaceChildren();

  host.append(
    panel(
      `Hola, ${state.player?.name ?? 'Duelista'}`,
      el('p', {
        text: 'Elige como quieres jugar. El emparejamiento te busca un rival ahora mismo.',
      }),
    ),
  );

  const grid = el('div', { class: 'lobby' });

  /* ---------------------------------------------------- Emparejamiento --- */

  const match = panel('Emparejamiento rapido');
  match.append(
    el('p', {
      text: 'Entra en la cola y espera a que haya otro jugador. Se empieza en cuanto se pueda.',
    }),
  );

  if (state.searching) {
    match.append(el('p', { text: `Buscando rival... hay ${state.queued} en cola.` }));
    match.append(button('Cancelar', () => handlers.unqueue(), 'ghost'));
  } else {
    match.append(button('Buscar rival', () => handlers.queue(), 'primary'));
    match.append(el('div', { class: 'lobby-hint', text: `${state.queued} esperando ahora mismo.` }));
  }

  grid.append(match);

  /* ------------------------------------------------------ Sala privada --- */

  const room = panel('Sala privada');
  room.append(
    el('p', { text: 'Crea una sala y comparte el codigo con quien quieras jugar.' }),
  );

  // Los puntos de vida con los que empieza quien organiza.
  const pointsRow = el('div', { class: 'row' });
  const points = el('input', { attrs: { type: 'text', inputmode: 'numeric', maxlength: '4' } });
  (points as HTMLInputElement).value = String(STARTING_LIFE_POINTS);
  pointsRow.append(el('span', { class: 'life-label', text: 'Vida inicial' }));
  pointsRow.append(points);
  pointsRow.append(
    button('Crear sala', () => {
      const value = Number.parseInt((points as HTMLInputElement).value, 10);
      handlers.createRoom(isValidLifePoints(value) ? value : STARTING_LIFE_POINTS);
    }),
  );
  room.append(pointsRow);

  const joinRow = el('div', { class: 'row' });
  const code = el('input', {
    attrs: { type: 'text', maxlength: '8', placeholder: 'CODIGO', style: 'text-transform:uppercase' },
  });
  joinRow.append(code);
  joinRow.append(
    button('Entrar', () => {
      const value = (code as HTMLInputElement).value.trim().toUpperCase();
      if (value !== '') handlers.joinRoom(value);
    }),
  );
  room.append(joinRow);

  // Si ya hay una sala creada, se muestra su codigo bien grande.
  if (state.room !== null) {
    room.append(el('p', { text: 'Tu codigo:' }));
    room.append(el('div', { class: 'room-code', text: state.room.code }));
    room.append(
      el('div', {
        class: 'lobby-hint',
        text:
          state.room.opponentName === 'Esperando...'
            ? 'Pasa este codigo a tu rival. La partida empieza cuando entre.'
            : `Ha entrado ${state.room.opponentName}.`,
      }),
    );
    const copy = button('Copiar codigo', () => {
      void navigator.clipboard?.writeText(state.room?.code ?? '');
    }, 'ghost');
    room.append(copy);
  }

  grid.append(room);

  /* ------------------------------------------------------------- CPU ----- */

  const cpu = panel('Contra la CPU');
  cpu.append(
    el('p', {
      text:
        'Se juega en este dispositivo, sin conexion. La partida se resuelve aqui mismo, ' +
        'sin pasar por el servidor.',
    }),
  );
  cpu.append(button('Jugar contra la CPU', () => handlers.playCpu(), 'primary'));
  cpu.append(
    el('div', {
      class: 'lobby-hint',
      text: 'La CPU no necesita servidor, asi que funciona sin conexion.',
    }),
  );

  grid.append(cpu);
  host.append(grid);
}

/** El aviso del servidor, si hay. */
export function renderNotice(state: NetState): HTMLElement | null {
  if (state.notice === null) return null;
  return notice(state.notice.level, state.notice.text);
}