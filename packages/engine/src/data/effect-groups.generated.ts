// Generado por tools/build-data.mjs. No editar a mano.
// Fuente: src/game/duel_effect_tables.{c,h} y notes/card-effect-dispatch.md
// 104 ids de efecto en 15 grupos.

/**
 * Numero de cada grupo de efecto: el indice de la ranura de handler que
 * `DuelEffect_UpdateCardEffect` multiplica por dos y despacha
 * (`duel_effect_tables.h`).
 */
export const EFFECT_GROUP_NONE = 0;
export const EFFECT_GROUP_TERRAIN = 1;
export const EFFECT_GROUP_LIFE_POINT_RECOVERY = 2;
export const EFFECT_GROUP_DIRECT_DAMAGE = 3;
export const EFFECT_GROUP_BOARD_DESTRUCTION = 4;
export const EFFECT_GROUP_MONSTER_REMOVAL = 5;
export const EFFECT_GROUP_STOP_DEFENSE = 6;
export const EFFECT_GROUP_RAIGEKI = 7;
export const EFFECT_GROUP_DARK_PIERCING_LIGHT = 8;
export const EFFECT_GROUP_STAT_PENALTY = 9;
export const EFFECT_GROUP_SWORDS = 10;
export const EFFECT_GROUP_CURSEBREAKER = 11;
export const EFFECT_GROUP_RITUAL = 12;
export const EFFECT_GROUP_HARPIES_FEATHER_DUSTER = 13;

/**
 * Cuantos grupos hay, y cuantos huecos de efecto hay en la tabla.
 *
 * Ojo: `DUEL_EFFECT_GROUP_COUNT` es 15 pero solo existen 14 constantes. El grupo 14 esta reservado en la tabla de handlers y ningun effect id lo selecciona (`notes/magic-effect-groups.md`), asi que no tiene nombre propio aqui.
 */
export const EFFECT_GROUP_COUNT = 15;
export const EFFECT_ID_COUNT = 104;

/** Nombre del grupo, para logs y para la vista de depuracion. */
export const EFFECT_GROUP_NAMES: Readonly<Record<number, string>> = {"0":"NONE","1":"TERRAIN","2":"LIFE_POINT_RECOVERY","3":"DIRECT_DAMAGE","4":"BOARD_DESTRUCTION","5":"MONSTER_REMOVAL","6":"STOP_DEFENSE","7":"RAIGEKI","8":"DARK_PIERCING_LIGHT","9":"STAT_PENALTY","10":"SWORDS","11":"CURSEBREAKER","12":"RITUAL","13":"HARPIES_FEATHER_DUSTER"};

/**
 * Grupo que despacha cada effect id: indice = effect id, 104 entradas sin comprimir.
 *
 * El effect id NO es el id de carta. Lo produce `DuelEffect_StartCardEffect` asi (`notes/card-effect-dispatch.md`): cartas 301..350 -> `id - 301`, cartas 651..700 -> `id - 601` pegadas detras, y Dark Magic Ritual (721) -> indice 100. Para consultar por id de carta usa `effectGroupForCardId`.
 */
export const EFFECT_GROUP_BY_ID: readonly number[] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,4,1,1,1,1,1,1,4,7,2,2,2,2,2,3,3,3,3,3,10,9,8,0,0,5,0,11,5,0,0,0,5,5,5,5,5,12,12,12,0,9,12,12,13,12,12,12,12,12,12,12,12,0,0,0,0,0,0,0,0,0,0,12,12,12,12,12,12,12,12,12,12,12,0,0,0];

/**
 * Effect id de una carta, o -1 si el retail no la lanza por la tabla de
 * efectos (los monstruos, los equips y las trampas sin trabajo propio).
 */
function effectIdForCardId(cardId: number): number {
  if (cardId >= 301 && cardId <= 350) return cardId - 301;
  if (cardId >= 651 && cardId <= 700) return cardId - 601;
  if (cardId === 721) return 100;
  return -1;
}

/**
 * Grupo de efecto de una carta concreta.
 *
 * Devuelve `EFFECT_GROUP_NONE` para los ids que la tabla no cubre, que es lo
 * que hace el retail: una carta sin efecto propio no deja el estado cambiado.
 */
export function effectGroupForCardId(cardId: number): number {
  const effectId = effectIdForCardId(cardId);
  if (effectId < 0 || effectId >= EFFECT_ID_COUNT) return EFFECT_GROUP_NONE;
  return EFFECT_GROUP_BY_ID[effectId];
}
