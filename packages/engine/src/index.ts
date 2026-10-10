/**
 * Motor de duelo de Yu-Gi-Oh! Forbidden Memories.
 *
 * Un modulo puro, sin DOM y sin dependencias de Node, que corre igual en el
 * navegador y en el servidor. El servidor es la autoridad en el modo en linea:
 * el cliente envia acciones, el servidor aplica `applyAction` y reparte las
 * vistas. Para la partida contra la CPU, el navegador usa el mismo motor en
 * local.
 */

export type {
  Attribute,
  CardData,
  CardRange,
  CardType,
  CardView,
  DuelLogEntry,
  DuelOutcome,
  DuelPhase,
  DuelStats,
  DuelState,
  DuelView,
  EffectNode,
  FieldCard,
  FieldZone,
  GameEvent,
  GuardianStar,
  HandCard,
  HandView,
  PendingChoice,
  PlayerAction,
  Side,
  SideState,
  SideView,
} from './types.js';

export { BOOT_SEED, RAND_MAX, Rng, THRESHOLD_TOTAL } from './rng.js';

// Los mapas de nombre se reexportan para el cliente y se importan aqui para que
// las funciones de abajo puedan consultarlos.
import { ATTRIBUTE_NAMES, STAR_NAMES, TYPE_NAMES } from './catalog.js';

export * from './constants.js';

export {
  allCards,
  activeStars,
  canEquipOn,
  card,
  cardName,
  cardOrUnknown,
  cardIdsOfType,
  cardsOfType,
  CARD_COUNT,
  DUELISTS,
  duelistById,
  equipStatBonus,
  fusionResult,
  guardianStarBonus,
  isEquip,
  isMagic,
  isMonster,
  isMonsterId,
  isRitual,
  isSpellLike,
  isTrap,
  participatesInFusion,
  rollDuelistDeck,
  starterDeckCardIds,
  terrainBoost,
} from './catalog.js';
export type { DuelistData, DropEntry } from './catalog.js';

// Los mapas de nombre del catalogo (tipo, atributo y estrella) se usan para
// pintar las cartas, asi que forman parte de la API publica.
export { ATTRIBUTE_NAMES, STAR_IDS, STAR_NAMES, TYPE_IDS, TYPE_NAMES } from './catalog.js';

/**
 * Nombre legible de un tipo de carta. `cardTypeName(0)` devuelve "Dragon".
 *
 * Existe como funcion y no como mapa suelto porque los ids llegan como numeros
 * desde el JSON, y así el cliente no tiene que hacer casteos ni mirar claves.
 */
export function cardTypeName(type: number | undefined): string {
  if (type === undefined) return '?';
  return (TYPE_NAMES as Record<number, string>)[type] ?? '?';
}

/** Nombre legible de un atributo. `cardAttributeName(1)` devuelve "Dark". */
export function cardAttributeName(attribute: number | undefined): string {
  if (attribute === undefined || attribute < 0) return '';
  return (ATTRIBUTE_NAMES as Record<number, string>)[attribute] ?? '';
}

/** Nombre legible de una estrella guardian. */
export function guardianStarName(star: number): string {
  return (STAR_NAMES as Record<number, string>)[star] ?? '?';
}

export {
  attackAgainst,
  backRowCount,
  cardAtZone,
  createDuel,
  damage,
  deckCount,
  defenseAgainst,
  effectiveAttack,
  effectiveDefense,
  emptySides,
  freeSlotsIn,
  heal,
  monsterCount,
  opponentHasMonsters,
  opponentOf,
  replaceSide,
  snapshot,
  withEvent,
} from './state.js';

export {
  applyCursebreaker,
  applyDarkHole,
  applyDarkPiercingLight,
  applyDirectDamage,
  applyDragonCaptureJar,
  applyHarpiesFeatherDuster,
  applyMonsterRemoval,
  applyRaigeki,
  applyRecovery,
  applySwords,
  applySpell,
  applyStatPenalty,
  applyStopDefense,
  applyTerrain,
  checkRitual,
  consumeTrap,
  fallbackTrap,
  hasAllExodiaPieces,
  hasTrap,
  matchRitualTributes,
  tributeMatches,
  trapForAttack,
  trapThreshold,
  trapsInPlay,
} from './effects.js';

// La tabla de dispatch de efectos es parte de la API publica: es lo que decide
// que hace cada Magia y Ritual, y el README la cita como tal.
export {
  EFFECT_GROUP_BOARD_DESTRUCTION,
  EFFECT_GROUP_COUNT,
  EFFECT_GROUP_CURSEBREAKER,
  EFFECT_GROUP_DARK_PIERCING_LIGHT,
  EFFECT_GROUP_DIRECT_DAMAGE,
  EFFECT_GROUP_HARPIES_FEATHER_DUSTER,
  EFFECT_GROUP_LIFE_POINT_RECOVERY,
  EFFECT_GROUP_MONSTER_REMOVAL,
  EFFECT_GROUP_NAMES,
  EFFECT_GROUP_NONE,
  EFFECT_GROUP_RAIGEKI,
  EFFECT_GROUP_RITUAL,
  EFFECT_GROUP_STAT_PENALTY,
  EFFECT_GROUP_STOP_DEFENSE,
  EFFECT_GROUP_SWORDS,
  EFFECT_GROUP_TERRAIN,
  effectGroupForCardId,
} from './data/effect-groups.generated.js';

export { applyAction, finish, startDuel } from './engine.js';

export { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, PROTOCOL_VERSION } from './protocol.js';
export type { ClientMessage, PlayerIdentity, RoomInfo, ServerMessage } from './protocol.js';

export {
  createMatch,
  defaultDeckConfig,
  DuelSession,
  isValidLifePoints,
  OPENING_HAND_SIZE,
  validateDeck,
} from './setup.js';
export type { DeckConfig } from './setup.js';

export {
  attackTargets,
  declarableAttackers,
  fieldCardView,
  playableCards,
  viewFor,
} from './view.js';