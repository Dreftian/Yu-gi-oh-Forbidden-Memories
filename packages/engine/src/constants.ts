/**
 * Constantes de duelo tomadas del retail.
 *
 * Cada grupo apunta al archivo del decompilado donde sale el numero, para que
 * un valor dudoso se pueda comprobar en lugar de creer.
 */

/* ------------------------------------------------------------ Duelo -------- */

export const DECK_SIZE = 40;
export const HAND_SIZE = 5;
export const MONSTER_ZONES = 5;
export const BACK_ROW_ZONES = 5;

/** `DUEL_STARTING_LIFE_POINTS` en `src/game/card_constants.h`. */
export const STARTING_LIFE_POINTS = 8000;
/** `DUEL_LIFE_POINT_SELECTION_STEP`, el salto del selector de PV del 2P. */
export const LIFE_POINT_STEP = 500;
/** `DUEL_LIFE_POINT_RECOVERY_SCALE` en `src/game/duel_card_effects.c`. */
export const LIFE_POINT_RECOVERY_SCALE = 100;
/** `CARD_STAT_MAX`, techo de ATK y DEF. */
export const CARD_STAT_MAX = 9999;
/** `DECK_CARD_COPY_LIMIT`. */
export const DECK_CARD_COPY_LIMIT = 3;
/** Los cinco trozos de Exodia no admiten copias. */
export const EXODIA_PIECE_COPY_LIMIT = 1;
/** `DUEL_DECK_SHUFFLE_SWAP_COUNT` = `DECK_SIZE * 4`. */
export const DECK_SHUFFLE_SWAP_COUNT = DECK_SIZE * 4;

/** Los cinco trozos de Exodia, ids 17-21 (`card_constants.h`). */
export const EXODIA_PIECE_IDS = [17, 18, 19, 20, 21] as const;
/** `Exodia the Forbidden`, id 21. */
export const EXODIA_ID = 21;

/* ------------------------------------------------------------- Tipos ------- */

/** 0-19 son monstruos; desde 20 no. `CARD_TYPE_MAGIC`. */
export const CARD_TYPE_FIRST_NON_MONSTER = 20;
export const CARD_TYPE_MAGIC = 20;
export const CARD_TYPE_TRAP = 21;
export const CARD_TYPE_RITUAL = 22;
export const CARD_TYPE_EQUIP = 23;

export const MONSTER_TYPE_COUNT = 20;
export const TYPE_COUNT = 24;

/* --------------------------------------------------- Estrellas ----------- */

/**
 * `DUEL_GUARDIAN_STAR_BONUS` en `src/game/duel_calc_guardian_star_matchup.c`.
 * La bonificacion se aplica solo al margen del atacante, no a las dos cartas.
 */
export const GUARDIAN_STAR_BONUS = 500;
/** `DUEL_GUARDIAN_STAR_FIRST_CYCLE_START`: seis miembros. */
export const GUARDIAN_FIRST_CYCLE_START = 1;
export const GUARDIAN_FIRST_CYCLE_COUNT = 6;
/** `DUEL_GUARDIAN_STAR_SECOND_CYCLE_START`: cuatro miembros. */
export const GUARDIAN_SECOND_CYCLE_START = 7;
export const GUARDIAN_SECOND_CYCLE_COUNT = 4;

/* --------------------------------------------------------- Terreno -------- */

/** `DUEL_TERRAIN_STAT_ADJUSTMENT`. */
export const TERRAIN_STAT_ADJUSTMENT = 500;

/**
 * Tabla de terreno: `TERRAIN_BOOST[tipo][terreno - 1]`, en unidades de 500.
 * Traducida de `gDuel_aTerrainBoost[20][6]` en `src/game/duel_terrain_boost.c`.
 */
export const TERRAIN_BOOST: readonly (readonly number[])[] = [
  /* Dragon        */ [0, 0, 1, 0, 0, 0],
  /* Spellcaster   */ [0, 0, 0, 0, 0, 1],
  /* Zombie        */ [0, 1, 0, 0, 0, 0],
  /* Warrior       */ [0, 0, 0, 1, 0, 0],
  /* Beast-Warrior */ [1, 0, 0, 1, 0, 0],
  /* Beast         */ [1, 0, 0, 0, 0, 0],
  /* Winged Beast  */ [0, 0, 1, 0, 0, 0],
  /* Fiend         */ [0, 0, 0, 0, 0, 1],
  /* Fairy         */ [0, 0, 0, 0, 0, -1],
  /* Insect        */ [1, 0, 0, 0, 0, 0],
  /* Dinosaur      */ [0, 1, 0, 0, 0, 0],
  /* Reptile       */ [0, 0, 0, 0, 0, 0],
  /* Fish          */ [0, 0, 0, 0, 1, 0],
  /* Sea Serpent   */ [0, 0, 0, 0, 1, 0],
  /* Machine       */ [0, 0, 0, 0, -1, 0],
  /* Thunder       */ [0, 0, 1, 0, 1, 0],
  /* Aqua          */ [0, 0, 0, 0, 1, 0],
  /* Pyro          */ [0, 0, 0, 0, -1, 0],
  /* Rock          */ [0, 1, 0, 0, 0, 0],
  /* Plant         */ [1, 0, 0, 0, 0, 0],
];

/**
 * Los seis campos y sus cartas, 330-335. `0` es terreno normal.
 * El terreno es compartido: cambiarlo afecta a los dos lados.
 */
export const TERRAIN_CARD_IDS: Readonly<Record<number, number>> = {
  1: 330, // Forest
  2: 331, // Wasteland
  3: 332, // Mountain
  4: 333, // Sogen
  5: 334, // Umi
  6: 335, // Yami
};

/** Nombre corto de cada terreno, para la interfaz. */
export const TERRAIN_NAMES: readonly string[] = [
  'Normal',
  'Forest',
  'Wasteland',
  'Mountain',
  'Sogen',
  'Umi',
  'Yami',
];

/* ------------------------------------------------- Swords of Revealing ---- */

/** `DUEL_SWORDS_DURATION_TURNS`. */
export const SWORDS_DURATION_TURNS = 3;
/**
 * `DUEL_SWORDS_INITIAL_COUNTER`: uno mas que la duracion, porque la fase de
 * robo resta antes de que ese lado actue. Poner 3 daria dos turnos bloqueados.
 */
export const SWORDS_INITIAL_COUNTER = SWORDS_DURATION_TURNS + 1;

/* --------------------------------------------------------- Equips --------- */

/**
 * Bonificacion por nivel de equip. La mayoria tiene un nivel (+500) y
 * Megamorph tiene dos (+1000) (`src/game/duel_scene_card_placement.c`).
 */
export const EQUIP_LEVEL_BONUS = 500;
/** `Megamorph`, id 657: el unico equip de dos niveles. */
export const MEGAMORPH_ID = 657;
export const MEGAMORPH_LEVELS = 2;

/**
 * Numero de niveles de cada equip. Solo Megamorph se aparta del 1; el resto
 * hereda el +500 de `EQUIP_LEVEL_BONUS`.
 */
export function equipLevels(equipId: number): number {
  return equipId === MEGAMORPH_ID ? MEGAMORPH_LEVELS : 1;
}

/** Bonificacion total de un equip. */
export function equipBonus(equipId: number): number {
  return equipLevels(equipId) * EQUIP_LEVEL_BONUS;
}

/* --------------------------------------------------------- Magias -------- */

/**
 * Curaciones de las cinco cartas de PV, `gDuel_abLifePointRecoveryUnits`
 * en `src/game/duel_card_effects.c`. Se ordenan por id desde
 * `DUEL_LIFE_POINT_RECOVERY_FIRST_CARD_ID`.
 */
export const LIFE_POINT_RECOVERY_FIRST_CARD_ID = 338;
export const LIFE_POINT_RECOVERY_UNITS: readonly number[] = [2, 5, 10, 20, 50];

/** Cantidad que cura cada carta de PV. */
export function lifePointRecovery(cardId: number): number {
  const index = cardId - LIFE_POINT_RECOVERY_FIRST_CARD_ID;
  const units = LIFE_POINT_RECOVERY_UNITS[index];
  return units === undefined ? 0 : units * LIFE_POINT_RECOVERY_SCALE;
}

/**
 * Danio directo de las cinco cartas de fuego, `gDuel_abDirectDamageUnits`.
 * Se multiplica por 10 al aplicarse.
 */
export const DIRECT_DAMAGE_FIRST_CARD_ID = 343;
export const DIRECT_DAMAGE_UNITS: readonly number[] = [5, 10, 20, 50, 100];

/** Cantidad de danio que infiere cada carta directa. */
export function directDamage(cardId: number): number {
  const index = cardId - DIRECT_DAMAGE_FIRST_CARD_ID;
  const units = DIRECT_DAMAGE_UNITS[index];
  return units === undefined ? 0 : units * 10;
}

/** `DUEL_STAT_PENALTY_PER_LEVEL`, el escalon de Spellbinding Circle. */
export const STAT_PENALTY_PER_LEVEL = 500;
/** Spellbinding Circle quita un nivel; Shadow Spell, dos. */
export const SPELLBINDING_CIRCLE_ID = 349;
export const SPELLBINDING_CIRCLE_LEVELS = 1;
export const SHADOW_SPELL_ID = 669;
export const SHADOW_SPELL_LEVELS = 2;

/* --------------------------------------------------- Eliminacion ---------- */

/**
 * Tabla de eliminacion por tipo: 7 pares `{cardId - 600, selector}` en
 * `src/game/duel_monster_removal_rules.c`. Un selector `>= 21` significa umbral
 * de ATK en lugar de tipo.
 */
export const MONSTER_REMOVAL_RULES: readonly (readonly [number, number])[] = [
  [53, 3], // 653 Warrior Elimination -> Warrior
  [56, 2], // 656 Eternal Rest -> Zombie
  [60, 14], // 660 Stain Storm -> Machine
  [61, 150], // 661 Crush Card -> ATK >= 1500 (selector * 10)
  [62, 9], // 662 Eradicating Aerosol -> Insect
  [63, 18], // 663 Breath of Light -> Rock
  [64, 12], // 664 Eternal Draught -> Fish
];

/** Por encima de este selector la carta elimina por ATK, no por tipo. */
export const MONSTER_REMOVAL_TYPE_LIMIT = 21;

/* --------------------------------------------------------- Trampas ------- */

/**
 * Umbrales de trampa en centecimas, `0x8009AF24` mas
 * `Duel_CheckTrapAttack`. La comparacion del retail es inclusiva: `ATK <=
 * umbral` dispara.
 */
export const TRAP_FIRST_ID = 681;
export const TRAP_THRESHOLDS: readonly number[] = [500, 1000, 1500, 2000, 3000, 25500];

/** Cuantas trampas puede tener un lado en el campo. */
export const TRAP_COUNT = 10;
/** `Fake Trap`, el señuelo que no hace nada. */
export const FAKE_TRAP_ID = 690;
/** `Goblin Fan`, refleja el danio directo. */
export const GOBLIN_FAN_ID = 687;
/** `Bad Reaction to Simochi`, convierte la curacion en danio. */
export const BAD_REACTION_ID = 688;
/** `Reverse Trap`, invierte las subidas de estadisticas. */
export const REVERSE_TRAP_ID = 689;

/* --------------------------------------------------------- Ritual -------- */

/** `DUEL_RITUAL_TRIBUTE_COUNT`: el retail exige tres. */
export const RITUAL_TRIBUTE_COUNT = 3;

/**
 * Un tributo de ritual.
 *
 * Hay dos formas y la diferencia importa, porque solo una es el retail.
 *
 * `exact` es el modelo del retail: la tabla `gDuel_awRitualData` son 24 registros
 * de cinco halfwords `[ritual, tributo1, tributo2, tributo3, resultado]`, y
 * `Duel_CheckRitual` compara `card->card_id == p[j]` y nada mas
 * (`src/game/duel_check_ritual.c:413-491`). No hay tipos, ni umbrales de ATK, ni
 * "el de mayor defensa": un tributo del retail es un id de carta.
 *
 * `approximate` NO existe en el retail. Solo esta aqui porque la tabla de 24
 * recetas vive en el disco (`0x801799D8`, offset `+0x34800`, 0x800 bytes) y este
 * repositorio no incluye el disco, asi que de 21 de las 24 recetas no se sabe
 * siquiera que ids pedian. Estas heuristicas traducen el texto de la carta a una
 * condicion aproximada: son jugables, pero no son el retail y por eso llevan la
 * etiqueta `approximate` puesta, para que nadie las lea como el comportamiento
 * original.
 */
export type RitualTribute =
  | { readonly kind: 'exact'; readonly cardId: number }
  | {
      readonly kind: 'approximate';
      /** Tipo de monstruo, como el texto de la carta lo nombra. */
      readonly type?: number;
      /** ATK efectivo minimo, para "un monstruo con ATK 2000 o mas". */
      readonly minAttack?: number;
      /** DEF efectiva mayor que el ATK, para "el de mayor defensa". */
      readonly defenseGreaterThanAttack?: boolean;
    };

/**
 * Una receta de ritual: `ritual -> [tres tributos] -> resultado`.
 *
 * `confirmed` dice si los ids salen de una fuente verificada del decompilado en
 * vez de del texto de la carta. De las 24 recetas solo 3 la tienen
 * (`RITUAL_RECIPES`). Una receta confirmada que aun lleve un tributo
 * aproximado esta marcada como tal en su entrada: es el caso de Dark Magic
 * Ritual (721), del que solo se conoce el resultado.
 */
export interface RitualRecipe {
  readonly ritualId: number;
  readonly resultId: number;
  readonly confirmed: boolean;
  readonly tributes: readonly RitualTribute[];
}

/**
 * Recetas de ritual.
 *
 * La tabla del retail vive en el disco (`0x801799D8`, 24 registros de 5
 * halfwords), asi que aqui no esta. Lo que hay son tres recetas confirmadas y 21
 * aproximadas:
 *
 * - 670, 675 y 721 son las unicas con algo verificado. De 670 y 675 sabemos los
 *   tres ids exactos; de 721 (`notes/research/the-game.md`, seccion 5.7) solo el
 *   resultado, que es 722.
 * - Las otras 21 no se pueden cerrar aqui: sus ids estan en el disco, que este
 *   repositorio no incluye. Sus tributos son la aproximacion por tipo y por ATK
 *   que salia del texto de la carta, marcada como tal.
 *
 * Cuando aparezca la tabla del disco, esto se sustituye por ella sin tocar el
 * motor: la forma de los datos ya es la que el motor lee, y basta con poner
 * `kind: 'exact'` y `confirmed: true` en cada registro.
 */
export const RITUAL_RECIPES: readonly RitualRecipe[] = [
  // 665 - "Sacrifices the monster with the highest defense rating and summons
  // Shield." El texto no fija un numero de tributos, asi que la retail pide
  // tres y basta con que el mas defensivo este entre ellos.
  {
    ritualId: 665,
    resultId: 362,
    confirmed: false,
    tributes: [
      { kind: 'approximate', defenseGreaterThanAttack: true },
      { kind: 'approximate' },
      { kind: 'approximate' },
    ],
  },

  // 666 - "Beast-Warrior, Dragon, and Pyro monsters to summon Yamadron."
  {
    ritualId: 666,
    resultId: 357,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 4 }, { kind: 'approximate', type: 0 }, { kind: 'approximate', type: 17 }],
  },

  // 667 - "Kazejin, Suijin, and Sanga of the Thunder to summon Gate Guardian."
  // Los tres ids salen del texto de la carta, no de la tabla del disco.
  {
    ritualId: 667,
    resultId: 374,
    confirmed: false,
    tributes: [
      { kind: 'exact', cardId: 372 },
      { kind: 'exact', cardId: 373 },
      { kind: 'exact', cardId: 371 },
    ],
  },

  // 670 - Confirmada: Beaver Warrior + Gaia the Fierce Knight + Kuriboh ->
  // Black Luster Soldier (`tests/pc/duel_rules_guest_test.c:32-33`).
  {
    ritualId: 670,
    resultId: 364,
    confirmed: true,
    tributes: [
      { kind: 'exact', cardId: 27 },
      { kind: 'exact', cardId: 38 },
      { kind: 'exact', cardId: 58 },
    ],
  },

  // 671 - "Ceremony conducted to summon Zera."
  {
    ritualId: 671,
    resultId: 360,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 7 }, { kind: 'approximate', type: 7 }, { kind: 'approximate', type: 7 }],
  },

  // 673 - "Ceremony conducted to summon War Lion."
  {
    ritualId: 673,
    resultId: 356,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 5 }, { kind: 'approximate', type: 5 }, { kind: 'approximate', type: 5 }],
  },

  // 674 - "Ceremony conducted to summon Fiend's Mirror."
  {
    ritualId: 674,
    resultId: 365,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 7 }, { kind: 'approximate', type: 7 }, { kind: 'approximate', type: 7 }],
  },

  // 675 - Confirmada: tres Blue-eyes -> Blue-eyes Ultimate Dragon
  // (`tests/pc/ritual_tributes_runtime.py`, que deja 675 tal y como esta en el
  // disco). Los tres tributos son el mismo id, y es legal: cada tributo toma una
  // carta distinta del campo.
  {
    ritualId: 675,
    resultId: 380,
    confirmed: true,
    tributes: [
      { kind: 'exact', cardId: 1 },
      { kind: 'exact', cardId: 1 },
      { kind: 'exact', cardId: 1 },
    ],
  },

  // 676 - "Sacrifice Dancer and Warrior to summon Performance of Sword."
  {
    ritualId: 676,
    resultId: 701,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 3 }, { kind: 'approximate', type: 3 }, { kind: 'approximate', type: 3 }],
  },

  // 677 - "A card with the ingredients for making a delicious hamburger."
  {
    ritualId: 677,
    resultId: 702,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 3 }, { kind: 'approximate', type: 3 }, { kind: 'approximate', type: 3 }],
  },

  // 678 - "Sacrifice Beast-Warrior and Golem to summon Sengenjin."
  {
    ritualId: 678,
    resultId: 703,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 4 }, { kind: 'approximate', type: 18 }, { kind: 'approximate', type: 18 }],
  },

  // 679 - "Sacrifice Warrior and Scythe Wielder to summon Skull Guardian."
  {
    ritualId: 679,
    resultId: 704,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 3 }, { kind: 'approximate', type: 3 }, { kind: 'approximate', type: 3 }],
  },

  // 680 - "Sacrifice a horned monster to summon Tri-Horned Dragon."
  {
    ritualId: 680,
    resultId: 705,
    confirmed: false,
    tributes: [
      { kind: 'approximate', minAttack: 2000 },
      { kind: 'approximate', minAttack: 2000 },
      { kind: 'approximate', minAttack: 2000 },
    ],
  },

  // 691 - "Select a specific monster for sacrifice and summon Serpent Night
  // Dragon."
  {
    ritualId: 691,
    resultId: 706,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 0 }, { kind: 'approximate', type: 0 }, { kind: 'approximate', type: 0 }],
  },

  // 692 - "Sacrifice crab and turtle to summon Crab Turtle."
  {
    ritualId: 692,
    resultId: 710,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 12 }, { kind: 'approximate', type: 16 }, { kind: 'approximate', type: 16 }],
  },

  // 693 - "Sacrifice a masked one to summon a new mask."
  {
    ritualId: 693,
    resultId: 720,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 1 }, { kind: 'approximate', type: 1 }, { kind: 'approximate', type: 1 }],
  },

  // 694 - "Sacrifice 3 Fiend monsters ... Resurrection of Chakra."
  {
    ritualId: 694,
    resultId: 709,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 7 }, { kind: 'approximate', type: 7 }, { kind: 'approximate', type: 7 }],
  },

  // 695 - "Sacrifice Puppeteer and Machine monsters to summon the Puppet."
  {
    ritualId: 695,
    resultId: 715,
    confirmed: false,
    tributes: [
      { kind: 'exact', cardId: 166 },
      { kind: 'approximate', type: 14 },
      { kind: 'approximate', type: 14 },
    ],
  },

  // 696 - "Sacrifice the stag beetle and beetle to summon Javelin Beetle."
  {
    ritualId: 696,
    resultId: 717,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 9 }, { kind: 'approximate', type: 9 }, { kind: 'approximate', type: 9 }],
  },

  // 697 - "Sacrifice the Ashura's Arm and Sword-wielder."
  {
    ritualId: 697,
    resultId: 716,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 3 }, { kind: 'approximate', type: 3 }, { kind: 'approximate', type: 3 }],
  },

  // 698 - "Sacrifice a normal Queen to summon Cosmo Queen."
  {
    ritualId: 698,
    resultId: 708,
    confirmed: false,
    tributes: [{ kind: 'approximate', type: 1 }, { kind: 'approximate', type: 1 }, { kind: 'approximate', type: 1 }],
  },

  // 699 - "Sacrifice Temple and Cockroach to summon Dokurorider."
  {
    ritualId: 699,
    resultId: 719,
    confirmed: false,
    tributes: [
      { kind: 'exact', cardId: 146 },
      { kind: 'approximate', type: 9 },
      { kind: 'approximate', type: 9 },
    ],
  },

  // 700 - "Sacrifice Horn and Machine Fish to summon Sea Fortress."
  {
    ritualId: 700,
    resultId: 718,
    confirmed: false,
    tributes: [
      { kind: 'approximate', minAttack: 1000 },
      { kind: 'approximate', type: 14 },
      { kind: 'approximate', type: 12 },
    ],
  },

  // 721 - Dark Magic Ritual, la receta 24, hace Magician of Black Chaos (722).
  // El par ritual -> resultado esta confirmado (`notes/research/the-game.md`,
  // seccion 5.7), pero los tres ids de tributo estan en el disco: lo que hay
  // aqui es la aproximacion por tipo que da el texto de la carta. Es la unica
  // receta confirmada con un tributo aproximado, y por eso lo dice.
  {
    ritualId: 721,
    resultId: 722,
    confirmed: true,
    tributes: [{ kind: 'approximate', type: 1 }, { kind: 'approximate', type: 1 }, { kind: 'approximate', type: 1 }],
  },
];

/** Busca la receta de un ritual, si existe. */
export function ritualRecipe(ritualId: number): RitualRecipe | undefined {
  return RITUAL_RECIPES.find((recipe) => recipe.ritualId === ritualId);
}

/* -------------------------------------------------------- Magias sueltas - */

/** `Stop Defense`, voltea un defensor a posicion de ataque. */
export const STOP_DEFENSE_ID = 320;
/** `Dragon Capture Jar`, destruye los dragones del rival. */
export const DRAGON_CAPTURE_JAR_ID = 329;
/** `Dark Hole`, se lleva todo lo que hay en juego de los dos lados. */
export const DARK_HOLE_ID = 336;
/** `Raigeki`, destruye todos los monstruos del rival. */
export const RAIGEKI_ID = 337;
/** `Swords of Revealing Light`. */
export const SWORDS_OF_REVEALING_LIGHT_ID = 348;
/** `Dark-piercing Light`. */
export const DARK_PIERCING_LIGHT_ID = 350;
/** `Cursebreaker`, deshace las reducciones de nivel del propio campo. */
export const CURSEBREAKER_ID = 655;
/** `Harprie's Feather Duster`, destruye magicianos y trampas rivales. */
export const HARPIES_FEATHER_DUSTER_ID = 672;

/**
 * Las siete filas del mazo inicial, como en `notes/starter-deck-pools.md`.
 *
 * Cada fila dice cuantas cartas saca de ella y que cartas son (`minTotal`/
 * `maxTotal` para las cuatro de monstruos, que el retail etiqueta por ATK+DEF;
 * `cardIds` y `cardType` para las tres de no-monstruos). Los CONTADORES son los
 * del retail; los PESOS no son obtenibles y por eso la tabla de pesos la arma
 * `catalog.ts` de forma uniforme (`starterRowWeights`).
 */
export type StarterDeckRow =
  | { readonly drawCount: number; readonly minTotal: number; readonly maxTotal: number }
  | { readonly drawCount: number; readonly cardIds: readonly number[] }
  | { readonly drawCount: number; readonly cardType: number };

export const STARTER_DECK_ROWS: readonly StarterDeckRow[] = [
  { drawCount: 16, minTotal: 450, maxTotal: 1050 },
  { drawCount: 16, minTotal: 1100, maxTotal: 1550 },
  { drawCount: 4, minTotal: 1600, maxTotal: 2050 },
  { drawCount: 1, minTotal: 2100, maxTotal: 2450 },
  // Dark Hole y Raigeki.
  { drawCount: 1, cardIds: [DARK_HOLE_ID, RAIGEKI_ID] },
  // Los seis terrenos, 330-335.
  { drawCount: 1, cardIds: [330, 331, 332, 333, 334, 335] },
  // Los equips del catalogo.
  { drawCount: 1, cardType: CARD_TYPE_EQUIP },
];

/**
 * `STARTER_DECK_WEIGHT_SCAN_COUNT` en `src/game/card_constants.h`: el retail
 * recorre los indices 0..719 de una fila de 722 pesos y se salta los dos
 * ultimos, asi que 721 y 722 no pueden salir de un mazo inicial.
 */
export const STARTER_DECK_WEIGHT_SCAN_COUNT = 720;