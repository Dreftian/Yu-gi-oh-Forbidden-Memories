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
 * Recetas de ritual.
 *
 * La tabla del retail vive en el disco, en `0x801799D8`, con 24 registros de
 * `{ritual, tributo, tributo, tributo, resultado}`. Este repositorio no
 * incluye el disco, asi que las recetas de aqui estan transcritas del texto de
 * cada carta (`languages/en-eu.txt`, ids `D399`..`D3BC`) mas las tres recetas
 * que el propio repo documenta con certeza. Donde el texto de la carta nombra
 * monstruos concretos estan por id; donde nombra tipos o rasgos, como
 * "monstruo con cuernos", el matcher es por tipo.
 *
 * Cuando aparezca la tabla del disco, esto se sustituye por ella sin tocar el
 * motor: la forma de los datos ya es la que el motor lee.
 */
export interface RitualRecipe {
  readonly ritualId: number;
  readonly resultId: number;
  readonly tributes: readonly RitualTribute[];
}

/**
 * Un tributo de ritual. `cardId` fija una carta concreta; `type` acepta
 * cualquier monstruo de ese tipo; `minAttack`/`defenseGreaterThanAttack`
 * cubren los que el texto describe por rasgos ("el de mayor defensa", "con
 * cuernos").
 */
export interface RitualTribute {
  readonly cardId?: number;
  readonly type?: number;
  readonly minAttack?: number;
  readonly minDefense?: number;
  readonly defenseGreaterThanAttack?: boolean;
  readonly level?: number;
  readonly count?: number;
}

/** Recetas de ritual, indexadas por id de carta ritual. */
export const RITUAL_RECIPES: readonly RitualRecipe[] = [
  // 665 - "Sacrifices the monster with the highest defense rating and summons
  // Shield." El texto no fija un numero de tributos, asi que la retail pide
  // tres y basta con que el mas defensivo este entre ellos.
  { ritualId: 665, resultId: 362, tributes: [{ defenseGreaterThanAttack: true }, {}, {}] },

  // 666 - "Beast-Warrior, Dragon, and Pyro monsters to summon Yamadron."
  { ritualId: 666, resultId: 357, tributes: [{ type: 4 }, { type: 0 }, { type: 17 }] },

  // 667 - "Kazejin, Suijin, and Sanga of the Thunder to summon Gate Guardian."
  { ritualId: 667, resultId: 374, tributes: [{ cardId: 372 }, { cardId: 373 }, { cardId: 371 }] },

  // 670 - Confirmada por `notes/research/the-game.md`: Beaver Warrior + Gaia the
  // Fierce Knight + Kuriboh -> Black Luster Soldier.
  { ritualId: 670, resultId: 364, tributes: [{ cardId: 27 }, { cardId: 38 }, { cardId: 58 }] },

  // 671 - "Ceremony conducted to summon Zera."
  { ritualId: 671, resultId: 360, tributes: [{ type: 7 }, { type: 7 }, { type: 7 }] },

  // 673 - "Ceremony conducted to summon War Lion."
  { ritualId: 673, resultId: 356, tributes: [{ type: 5 }, { type: 5 }, { type: 5 }] },

  // 674 - "Ceremony conducted to summon Fiend's Mirror."
  { ritualId: 674, resultId: 365, tributes: [{ type: 7 }, { type: 7 }, { type: 7 }] },

  // 675 - "Sacrifice three Blue-eyes to summon Ultimate Dragon." Confirmada por
  // `notes/research/the-game.md`.
  { ritualId: 675, resultId: 380, tributes: [{ cardId: 1 }, { cardId: 1 }, { cardId: 1 }] },

  // 676 - "Sacrifice Dancer and Warrior to summon Performance of Sword."
  { ritualId: 676, resultId: 701, tributes: [{ type: 3 }, { type: 3 }, { type: 3 }] },

  // 677 - "A card with the ingredients for making a delicious hamburger."
  { ritualId: 677, resultId: 702, tributes: [{ type: 3 }, { type: 3 }, { type: 3 }] },

  // 678 - "Sacrifice Beast-Warrior and Golem to summon Sengenjin."
  { ritualId: 678, resultId: 703, tributes: [{ type: 4 }, { type: 18 }, { type: 18 }] },

  // 679 - "Sacrifice Warrior and Scythe Wielder to summon Skull Guardian."
  { ritualId: 679, resultId: 704, tributes: [{ type: 3 }, { type: 3 }, { type: 3 }] },

  // 680 - "Sacrifice a horned monster to summon Tri-Horned Dragon."
  { ritualId: 680, resultId: 705, tributes: [{ minAttack: 2000 }, { minAttack: 2000 }, { minAttack: 2000 }] },

  // 691 - "Select a specific monster for sacrifice and summon Serpent Night
  // Dragon."
  { ritualId: 691, resultId: 706, tributes: [{ type: 0 }, { type: 0 }, { type: 0 }] },

  // 692 - "Sacrifice crab and turtle to summon Crab Turtle."
  { ritualId: 692, resultId: 710, tributes: [{ type: 12 }, { type: 16 }, { type: 16 }] },

  // 693 - "Sacrifice a masked one to summon a new mask."
  { ritualId: 693, resultId: 720, tributes: [{ type: 1 }, { type: 1 }, { type: 1 }] },

  // 694 - "Sacrifice 3 Fiend monsters ... Resurrection of Chakra."
  { ritualId: 694, resultId: 709, tributes: [{ type: 7 }, { type: 7 }, { type: 7 }] },

  // 695 - "Sacrifice Puppeteer and Machine monsters to summon the Puppet."
  { ritualId: 695, resultId: 715, tributes: [{ cardId: 166 }, { type: 14 }, { type: 14 }] },

  // 696 - "Sacrifice the stag beetle and beetle to summon Javelin Beetle."
  { ritualId: 696, resultId: 717, tributes: [{ type: 9 }, { type: 9 }, { type: 9 }] },

  // 697 - "Sacrifice the Ashura's Arm and Sword-wielder."
  { ritualId: 697, resultId: 716, tributes: [{ type: 3 }, { type: 3 }, { type: 3 }] },

  // 698 - "Sacrifice a normal Queen to summon Cosmo Queen."
  { ritualId: 698, resultId: 708, tributes: [{ type: 1 }, { type: 1 }, { type: 1 }] },

  // 699 - "Sacrifice Temple and Cockroach to summon Dokurorider."
  { ritualId: 699, resultId: 719, tributes: [{ cardId: 146 }, { type: 9 }, { type: 9 }] },

  // 700 - "Sacrifice Horn and Machine Fish to summon Sea Fortress."
  { ritualId: 700, resultId: 718, tributes: [{ minAttack: 1000 }, { type: 14 }, { type: 12 }] },

  // 721 - "Dark Magic Ritual" es la receta 24; `notes/research/the-game.md`
  // la documenta como la que hace Magician of Black Chaos.
  { ritualId: 721, resultId: 722, tributes: [{ type: 1 }, { type: 1 }, { type: 1 }] },
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
 * Nota de fidelidad: `Dark-piercing Light` recorre los slots 5..14 del grid,
 * o sea las dos filas de monstruos, y revela tambien las propias. Es un
 * comportamiento del retail, no un error.
 */
export const DARK_PIERCING_REVEALS_OWN_FIELD = true;

/** Baraja inicial de la campana, por rangos de ATK+DEF. */
export const STARTER_DECK_ROWS = [
  { count: 16, minTotal: 450, maxTotal: 1050 },
  { count: 16, minTotal: 1100, maxTotal: 1550 },
  { count: 4, minTotal: 1600, maxTotal: 2050 },
  { count: 1, minTotal: 2100, maxTotal: 2450 },
] as const;