/**
 * Ajustes de una conexion: nombre, token y limites de lo que se acepta.
 *
 * Sin cuentas ni contrasenas: la identidad es un nombre y un token que el
 * navegador guarda. Es una identidad de sesion, no un inicio de sesion, y por
 * eso no protege nada. Esta en el cliente, no aqui, el jugador decide si le
 * importa.
 */

import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH } from '@yfm/engine';

export { MAX_CHAT_LENGTH, MAX_NAME_LENGTH };

/**
 * Deja un nombre presentable.
 *
 * Recorta a 16 caracteres, quita los caracteres de control y, si no queda
 * nada, pone "Duelista".
 */
export function sanitizeName(raw: string): string {
  let cleaned = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    // Tabuladores, saltos de linea y el resto de controles fuera.
    if (code < 0x20 || code === 0x7f) continue;
    cleaned += ch;
  }
  cleaned = cleaned.trim().slice(0, MAX_NAME_LENGTH);
  return cleaned === '' ? 'Duelista' : cleaned;
}

/**
 * Convierte un token en un id de jugador estable.
 *
 * No es cifrado ni una medida de seguridad: es una forma de que el token del
 * navegador no acabe tal cual en los logs ni en las URLs de las salas. Un hash
 * FNV-1a basta para eso y no arrastra ninguna dependencia.
 */
export function hashToken(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}

/** Un id aleatorio para partidas y sesiones. */
export function randomId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}