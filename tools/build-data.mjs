/**
 * Genera los ficheros de `packages/engine/src/data/` a partir de los datos que
 * ya viven en el checkout del decompilado:
 *
 *   cards.generated.ts          notes/card-catalog.csv (722 cartas),
 *                               languages/en-eu.txt (texto) y
 *                               notes/research/fusion-and-drop-tables/
 *                                 {fusions,equips}.csv
 *   effect-groups.generated.ts  src/game/duel_effect_tables.{c,h} y el contrato
 *                               de notes/card-effect-dispatch.md
 *   duelists.generated.ts       notes/research/fusion-and-drop-tables/
 *                                 {drops,drops_summary}.csv
 *
 * No se copia ningun pixel ni audio del juego: solo texto y tablas, que es lo
 * unico que el repositorio incluye. Las reglas de duelo (terrenos, trampas,
 * grupos de efecto) viven en el codigo del motor, derivadas del decompilado.
 *
 * Los tres ficheros se versionan: son la copia legible de estas tablas y sin
 * ellos el clon no compila.
 *
 * Ejecutar: node tools/build-data.mjs [--decomp <ruta-al-repo-decompilado>]
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/** Raiz del repositorio: aqui viven `packages/` y `tools/`. */
const REPO_ROOT = path.resolve(here, '..');

/** Candidatos para localizar el checkout del decompilado. */
function resolveDepRoot() {
  const flagIndex = process.argv.indexOf('--decomp');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return path.resolve(process.argv[flagIndex + 1]);
  }
  const env = process.env.YFM_DECOMP_ROOT;
  if (env) return path.resolve(env);

  // El decompilado es un checkout hermano dentro de este mismo repositorio, asi
  // que se mira primero dentro de la raiz y despues un nivel por encima, por si
  // alguien lo clonó aparte al lado.
  const candidates = [
    path.join(REPO_ROOT, 'Yu-Gi-Oh-Forbidden-Memories-Recompiled-master'),
    path.join(REPO_ROOT, 'Yu-Gi-Oh-Forbidden-Memories-Recompiled'),
    REPO_ROOT,
    path.resolve(REPO_ROOT, '..'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'notes', 'card-catalog.csv'))) return candidate;
  }
  throw new Error(
    'No encuentro notes/card-catalog.csv. Indica la ruta con --decomp <ruta> o YFM_DECOMP_ROOT.',
  );
}

const DECOMP_ROOT = resolveDepRoot();
const CSV_PATH = path.join(DECOMP_ROOT, 'notes', 'card-catalog.csv');
const LANG_PATH = path.join(DECOMP_ROOT, 'languages', 'en-eu.txt');
const FUSIONS_PATH = path.join(
  DECOMP_ROOT,
  'notes',
  'research',
  'fusion-and-drop-tables',
  'fusions.csv',
);
const EQUIPS_PATH = path.join(
  DECOMP_ROOT,
  'notes',
  'research',
  'fusion-and-drop-tables',
  'equips.csv',
);
const DROPS_PATH = path.join(
  DECOMP_ROOT,
  'notes',
  'research',
  'fusion-and-drop-tables',
  'drops.csv',
);
const DROPS_SUMMARY_PATH = path.join(
  DECOMP_ROOT,
  'notes',
  'research',
  'fusion-and-drop-tables',
  'drops_summary.csv',
);
const EFFECT_TABLES_C_PATH = path.join(
  DECOMP_ROOT,
  'src',
  'game',
  'duel_effect_tables.c',
);
const EFFECT_TABLES_H_PATH = path.join(
  DECOMP_ROOT,
  'src',
  'game',
  'duel_effect_tables.h',
);

console.log(`decompilado: ${DECOMP_ROOT}`);

/* ------------------------------------------------------------------ CSV ---- */

/**
 * Parser de CSV minimo. Los ficheros de este repositorio no usan comillas ni
 * campos multilinea, pero manejamos ambos casos por seguridad.
 */
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}

function readCsvRows(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`falta ${file}`);
  }
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((name, index) => {
      record[name] = (cells[index] ?? '').trim();
    });
    return record;
  });
}

/* --------------------------------------------------------------- Cartas ---- */

/**
 * Tipo de carta -> id numerico. El orden es el de `gDuel_adwCardStats` bits
 * 26-30 (`src/game/card_constants.h`): 0-19 monstruos, 20 Magia, 21 Trampa,
 * 22 Ritual, 23 Equip.
 */
const TYPE_IDS = {
  Dragon: 0,
  Spellcaster: 1,
  Zombie: 2,
  Warrior: 3,
  'Beast-Warrior': 4,
  Beast: 5,
  'Winged Beast': 6,
  Fiend: 7,
  Fairy: 8,
  Insect: 9,
  Dinosaur: 10,
  Reptile: 11,
  Fish: 12,
  'Sea Serpent': 13,
  Machine: 14,
  Thunder: 15,
  Aqua: 16,
  Pyro: 17,
  Rock: 18,
  Plant: 19,
  Magic: 20,
  Trap: 21,
  Ritual: 22,
  Equip: 23,
};

const TYPE_NAMES = Object.fromEntries(Object.entries(TYPE_IDS).map(([name, id]) => [id, name]));

/** Estrella guardian -> id 1..10. Ver `notes/card-catalog.md`. */
const STAR_IDS = {
  Mars: 1,
  Jupiter: 2,
  Saturn: 3,
  Uranus: 4,
  Pluto: 5,
  Neptune: 6,
  Mercury: 7,
  Sun: 8,
  Moon: 9,
  Venus: 10,
};

const STAR_NAMES = Object.fromEntries(
  Object.entries(STAR_IDS).map(([name, id]) => [id, name]),
);

const ATTRIBUTE_IDS = { Light: 0, Dark: 1, Earth: 2, Water: 3, Fire: 4, Wind: 5 };
const ATTRIBUTE_NAMES = Object.fromEntries(
  Object.entries(ATTRIBUTE_IDS).map(([name, id]) => [id, name]),
);

/** El CSV usa `N/A` cuando la carta no tiene password utilizable. */
function intOrZero(value) {
  if (!value || value === 'N/A') return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Textos de carta del banco `descriptions`: el ID de texto de la carta n es
 * `0xD100 + n`, y el del nombre es `0x8000 + n`. Sacamos solo el texto; los
 * nombres ya vienen en el CSV, que es la fuente de identidad.
 */
function parseCardDescriptions(file) {
  if (!fs.existsSync(file)) {
    console.warn(`aviso: no encuentro ${file}; las cartas saldran sin texto`);
    return new Map();
  }
  const text = fs.readFileSync(file, 'utf8');
  const descriptions = new Map();

  const lines = text.split('\n');
  let inDescriptionsBank = false;
  let currentId = null;
  let buffer = [];

  const flush = () => {
    if (currentId !== null) {
      const body = buffer.join('\n').trim();
      if (body) descriptions.set(currentId, body);
    }
    currentId = null;
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('@bank')) {
      flush();
      inDescriptionsBank = trimmed.includes('descriptions');
      continue;
    }
    if (!inDescriptionsBank) continue;

    const header = /^\[([0-9A-Fa-f]{4,5})\]$/.exec(trimmed);
    if (header) {
      flush();
      currentId = Number.parseInt(header[1], 16);
      continue;
    }
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('#')) continue;
    if (currentId !== null) buffer.push(trimmed);
  }
  flush();

  return descriptions;
}

/**
 * Limpia los codigos de control del banco de texto: conservamos los saltos de
 * linea (son el ajuste de linea real de la caja de la carta) y los iconos se
 * convierten a texto legible.
 */
function cleanCardText(raw) {
  if (!raw) return '';
  const tokens = {
    '{end}': '',
    '{cont}': '',
    '{choice}': '',
    '{page}': '\n\n',
  };
  let out = raw;
  for (const [token, replacement] of Object.entries(tokens)) {
    out = out.split(token).join(replacement);
  }
  // Iconos de 16x16: {f8 0B XX}. 00-13 tipos, 14-17 no-monstruo, 18-21 estrellas.
  out = out.replace(/\{f8\s+0B\s+([0-9A-Fa-f]{2})\}/g, (_all, hex) => {
    const code = Number.parseInt(hex, 16);
    if (code >= 0x00 && code <= 0x13) return `[${TYPE_NAMES[code] ?? '?'}]`;
    if (code === 0x14) return '[Magia]';
    if (code === 0x15) return '[Trampa]';
    if (code === 0x16) return '[Ritual]';
    if (code === 0x17) return '[Equip]';
    if (code >= 0x18 && code <= 0x15 + 6) return `[${STAR_NAMES[code - 0x18 + 1] ?? '?'}]`;
    return '';
  });
  // Codigos de color: irrelevantes en texto plano.
  out = out.replace(/\{f8\s+0A\s+[0-9A-Fa-f]{2}\}/g, '');
  // Etiquetas y saltos del motor de texto.
  out = out.replace(/\{:[^}]*\}/g, '');
  out = out.replace(/\{[^}]*\}/g, '');
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1]))
    .join('\n')
    .trim();
}

function buildCards() {
  const rows = readCsvRows(CSV_PATH);
  const descriptions = parseCardDescriptions(LANG_PATH);

  const cards = [];
  for (const row of rows) {
    const id = intOrZero(row.id);
    if (id <= 0) continue;
    const typeName = row.type;
    const type = TYPE_IDS[typeName];
    if (type === undefined) {
      throw new Error(`tipo desconocido "${typeName}" en la carta ${id}`);
    }
    const description = cleanCardText(descriptions.get(0xd100 + id));
    cards.push({
      id,
      name: row.name,
      type,
      attribute: row.attribute ? (ATTRIBUTE_IDS[row.attribute] ?? -1) : -1,
      level: intOrZero(row.level),
      stars: [STAR_IDS[row.guardian_star_1] ?? 0, STAR_IDS[row.guardian_star_2] ?? 0],
      attack: intOrZero(row.attack),
      defense: intOrZero(row.defense),
      description,
    });
  }

  cards.sort((a, b) => a.id - b.id);
  return cards;
}

/* ------------------------------------------------------------- Tablas ------ */

/**
 * Fusiones: el CSV trae 25 131 recetas indexadas por material. Las compactamos
 * a `materialId -> [[otherId, resultId], ...]` porque el motor solo necesita la
 * busqueda por material mas pequeno.
 */
function buildFusions() {
  const rows = readCsvRows(FUSIONS_PATH);
  /** @type {Map<number, Array<[number, number]>>} */
  const table = new Map();

  for (const row of rows) {
    const a = intOrZero(row.material_a_id);
    const b = intOrZero(row.material_b_id);
    const result = intOrZero(row.result_id);
    if (a <= 0 || b <= 0 || result <= 0) continue;
    const key = Math.min(a, b);
    const other = Math.max(a, b);
    const entry = table.get(key) ?? [];
    entry.push([other, result]);
    table.set(key, entry);
  }

  /** @type {Record<string, number[][]>} */
  const compact = {};
  for (const key of [...table.keys()].sort((x, y) => x - y)) {
    compact[String(key)] = table.get(key);
  }
  // Las recetas del CSV y las que entran en la tabla: si no coinciden, alguna
  // fila tiene ids invalidos y el numero que se anuncia no seria el real.
  const total = Object.values(compact).reduce((sum, list) => sum + list.length, 0);
  if (total !== rows.length) {
    throw new Error(
      `fusions.csv tiene ${rows.length} recetas y solo ${total} han entrado en ` +
        'la tabla. Revisa las filas con ids a cero.',
    );
  }
  return { table: compact, recipes: rows.length };
}

/**
 * Equips: 4 041 pares (equip, monstruo) validos. Compactamos a
 * `equipId -> [monsterId, ...]`.
 */
function buildEquips() {
  const rows = readCsvRows(EQUIPS_PATH);
  /** @type {Map<number, number[]>} */
  const table = new Map();

  for (const row of rows) {
    const equipId = intOrZero(row.equip_id);
    const monsterId = intOrZero(row.monster_id);
    if (equipId <= 0 || monsterId <= 0) continue;
    const list = table.get(equipId) ?? [];
    if (!list.includes(monsterId)) list.push(monsterId);
    table.set(equipId, list);
  }

  /** @type {Record<string, number[]>} */
  const compact = {};
  for (const key of [...table.keys()].sort((x, y) => x - y)) {
    compact[String(key)] = table.get(key).sort((a, b) => a - b);
  }
  // Igual que con las fusiones: el total de la tabla tiene que ser el del CSV.
  const total = Object.values(compact).reduce((sum, list) => sum + list.length, 0);
  if (total !== rows.length) {
    throw new Error(
      `equips.csv tiene ${rows.length} pares y solo ${total} han entrado en la ` +
        'tabla (deduplicados o con ids a cero).',
    );
  }
  return { table: compact, pairs: rows.length };
}

/* ------------------------------------------------- Grupos de efecto --------- */

/**
 * Bloques de ids de carta que el retail convierte en "effect id"
 * (`notes/card-effect-dispatch.md`).
 *
 * El mapeo NO es la identidad, y por eso vive aqui escrito y no deducido: si se
 * pierde un bloque, cada carta cae en el grupo equivocado sin que nada falle
 * de forma visible. El contrato documentado es:
 *
 *   - bloque 1, cartas 301..350 -> indice `card_id - 301` (0..49)
 *   - bloque 2, cartas 651..700 -> indice `card_id - 601` (50..99), pegado
 *     justo detras del primero
 *   - Dark Magic Ritual (721)    -> indice 100, el ultimo que documenta el
 *     contrato (`721 - 621`)
 *
 * Las tres entradas que sobran de las 104 no las produce nadie y valen NONE.
 */
const EFFECT_ID_BLOCKS = [
  { first: 301, last: 350, offset: 301 },
  { first: 651, last: 700, offset: 601 },
  { first: 721, last: 721, offset: 621 },
];

/** Effect id de una carta, o -1 si el retail no la lanza por tabla de efecto. */
function effectIdForCardId(cardId) {
  for (const block of EFFECT_ID_BLOCKS) {
    if (cardId >= block.first && cardId <= block.last) return cardId - block.offset;
  }
  return -1;
}

/**
 * `#define DUEL_EFFECT_GROUP_* n` y los dos recuentos, tal cual en
 * `duel_effect_tables.h`. El numero de cada grupo sale de ahi y no de una
 * suposicion: el orden de los grupos es el de la tabla de handlers.
 */
function parseEffectHeader(source) {
  /** @type {Map<string, number>} */
  const groups = new Map();
  let idCount = 0;
  let groupCount = 0;
  const define = /^#define\s+(DUEL_EFFECT_\w+)\s+(\d+)\s*$/gm;
  for (const match of source.matchAll(define)) {
    const [, name, digits] = match;
    const value = Number.parseInt(digits, 10);
    // Los dos recuentos se miran antes que el prefijo de grupo:
    // `DUEL_EFFECT_GROUP_COUNT` tambien empieza por `DUEL_EFFECT_GROUP_`.
    if (name === 'DUEL_EFFECT_ID_COUNT') idCount = value;
    else if (name === 'DUEL_EFFECT_GROUP_COUNT') groupCount = value;
    else if (name.startsWith('DUEL_EFFECT_GROUP_')) groups.set(name, value);
  }
  if (idCount <= 0 || groupCount <= 0 || groups.size === 0) {
    throw new Error(
      `${EFFECT_TABLES_H_PATH}: no encuentro DUEL_EFFECT_ID_COUNT, ` +
        'DUEL_EFFECT_GROUP_COUNT ni las constantes DUEL_EFFECT_GROUP_*.',
    );
  }
  return { groups, idCount, groupCount };
}

/**
 * Los 104 grupos de `gDuelEffect_abGroupByEffectId`. El array viene expandido
 * (dos nombres por linea), pero se parsea por comas igualmente: asi el generador
 * aguanta que el decompilado lo resuma como rangos.
 */
function parseEffectIdGroups(source, groupNames, idCount) {
  const match =
    /gDuelEffect_abGroupByEffectId\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\n\}\s*;/.exec(source);
  if (!match) {
    throw new Error(
      `${EFFECT_TABLES_C_PATH}: no encuentro el array ` +
        'gDuelEffect_abGroupByEffectId[DUEL_EFFECT_ID_COUNT]. Sin el no hay ' +
        'forma honesta de saber que grupo despacha cada carta.',
    );
  }
  const tokens = match[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length !== idCount) {
    throw new Error(
      `la tabla de dispatch tiene ${tokens.length} entradas y ` +
        `DUEL_EFFECT_ID_COUNT dice ${idCount}. Alguien ha editado una de las dos.`,
    );
  }

  return tokens.map((token, index) => {
    const group = groupNames.get(token);
    if (group === undefined) {
      throw new Error(
        `${EFFECT_TABLES_C_PATH}: la entrada ${index} usa ${token}, que no esta ` +
          'definido en duel_effect_tables.h.',
      );
    }
    return group;
  });
}

/**
 * Tabla de dispatch de efectos: el grupo que ejecuta cada uno de los 104 ids de
 * efecto, mas el mapeo carta -> effect id que la produce.
 *
 * `cardCount` es el tamaño del catalogo y se usa para comprobar que los tres
 * bloques de `EFFECT_ID_BLOCKS` apuntan a cartas reales y que los ids que
 * producen caben en la tabla: un error de uno en el offset pasaria
 * desapercibido si solo se mirara el rango del array.
 */
function buildEffectGroups(cardCount) {
  for (const file of [EFFECT_TABLES_C_PATH, EFFECT_TABLES_H_PATH]) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `falta ${file}. Los grupos de efecto salen del codigo del decompilado, ` +
          'no se pueden reconstruir a mano. Indica la ruta con ' +
          '--decomp <ruta> o YFM_DECOMP_ROOT.',
      );
    }
  }

  const header = parseEffectHeader(fs.readFileSync(EFFECT_TABLES_H_PATH, 'utf8'));
  const byId = parseEffectIdGroups(
    fs.readFileSync(EFFECT_TABLES_C_PATH, 'utf8'),
    header.groups,
    header.idCount,
  );

  // Ningun bloque puede apuntar mas alla del catalogo, ni producir un effect id
  // que se salga de la tabla.
  for (const block of EFFECT_ID_BLOCKS) {
    if (block.last > cardCount) {
      throw new Error(
        `el bloque de effect ids ${block.first}..${block.last} apunta a cartas ` +
          `de las ${cardCount} del catalogo. El mapeo de ` +
          'notes/card-effect-dispatch.md ya no cuadra.',
      );
    }
    for (let cardId = block.first; cardId <= block.last; cardId += 1) {
      const effectId = effectIdForCardId(cardId);
      if (effectId < 0 || effectId >= byId.length) {
        throw new Error(
          `la carta ${cardId} produce el effect id ${effectId}, fuera de la ` +
            `tabla de ${byId.length} entradas.`,
        );
      }
    }
  }

  /** Indice de cada grupo -> nombre, para leer los logs sin总线car numeros. */
  /** @type {Record<number, string>} */
  const names = {};
  for (const [name, value] of header.groups) {
    names[value] = name.replace(/^DUEL_EFFECT_GROUP_/, '');
  }

  return {
    names,
    byId,
    idCount: header.idCount,
    groupCount: header.groupCount,
  };
}

/* ------------------------------------------------------ Duelistas ---------- */

/**
 * Los cuatro pools de `drops.csv`. `deck` es el mazo real de duelo del
 * duelista; los otros tres son las cartas S/A/B/C/D que suelta la IA cuando
 * pierde una ronda.
 */
const DECK_POOL = 'deck';
const DROP_POOLS = [
  { key: 'pow', csv: 'S/A POW', summaryCards: 'pow_cards', summaryBest: 'pow_best' },
  { key: 'bcd', csv: 'B/C/D', summaryCards: 'bcd_cards', summaryBest: 'bcd_best' },
  { key: 'tec', csv: 'S/A TEC', summaryCards: 'tec_cards', summaryBest: 'tec_best' },
];

/**
 * Los 40 duelistas: su mazo y sus tres pools de drops.
 *
 * `drops.csv` es la fuente de los datos y `drops_summary.csv` se usa solo como
 * comprobacion: si el resumen y el detalle dejan de cuadrar, el detalle es lo
 * que falla y es mejor que se note aqui que en mitad de una partida.
 */
function buildDuelists() {
  const rows = readCsvRows(DROPS_PATH);
  const summaries = readCsvRows(DROPS_SUMMARY_PATH);

  /** @type {Map<number, {name: string, deck: Array<[number, number]>, drops: Record<string, Array<[number, number]>>}>} */
  const duelists = new Map();

  const ensure = (id, name) => {
    let duelist = duelists.get(id);
    if (duelist === undefined) {
      duelist = { name, deck: [], drops: { pow: [], bcd: [], tec: [] } };
      duelists.set(id, duelist);
    }
    return duelist;
  };

  for (const row of rows) {
    const id = intOrZero(row.duelist_id);
    const cardId = intOrZero(row.card_id);
    const weight = intOrZero(row.weight);
    if (id < 0 || cardId <= 0 || weight <= 0) continue;
    const duelist = ensure(id, row.duelist);
    if (row.pool === DECK_POOL) duelist.deck.push([cardId, weight]);
    else {
      const pool = DROP_POOLS.find((candidate) => candidate.csv === row.pool);
      if (pool === undefined) {
        throw new Error(
          `drops.csv: pool desconocido "${row.pool}" en el duelista ${id}.`,
        );
      }
      duelist.drops[pool.key].push([cardId, weight]);
    }
  }

  for (const duelist of duelists.values()) {
    if (duelist.deck.length === 0) {
      throw new Error(`el duelista "${duelist.name}" no tiene pool ${DECK_POOL}.`);
    }
  }

  for (const summary of summaries) {
    const id = intOrZero(summary.duelist_id);
    const duelist = duelists.get(id);
    if (duelist === undefined) {
      throw new Error(
        `drops_summary.csv lista al duelista ${id} y drops.csv no tiene filas suyas.`,
      );
    }
    if (duelist.name !== summary.duelist) {
      throw new Error(
        `el duelista ${id} se llama "${duelist.name}" en drops.csv y ` +
          `"${summary.duelist}" en drops_summary.csv.`,
      );
    }
    // El resumen es el control: mismo numero de cartas y mismo peso maximo.
    const pools = [...DROP_POOLS.map((pool) => [pool, duelist.drops[pool.key]]), [
      { summaryCards: 'deck_cards', summaryBest: 'deck_best' },
      duelist.deck,
    ]];
    for (const [pool, entries] of pools) {
      const expectedCards = intOrZero(summary[pool.summaryCards]);
      const expectedBest = intOrZero(summary[pool.summaryBest]);
      const best = entries.reduce((max, entry) => Math.max(max, entry[1]), 0);
      if (entries.length !== expectedCards || best !== expectedBest) {
        throw new Error(
          `el duelista ${id} (${duelist.name}) tiene ${entries.length} cartas y un ` +
            `peso maximo de ${best} en un pool, y drops_summary.csv dice ` +
            `${expectedCards} y ${expectedBest}.`,
        );
      }
    }
  }

  if (duelists.size !== summaries.length) {
    throw new Error(
      `drops.csv tiene ${duelists.size} duelistas y drops_summary.csv ${summaries.length}.`,
    );
  }

  const ordered = [...duelists.keys()].sort((a, b) => a - b);
  return ordered.map((id) => {
    const duelist = duelists.get(id);
    return {
      id,
      name: duelist.name,
      deck: duelist.deck.map(([cardId]) => cardId),
      drops: {
        pow: duelist.drops.pow,
        bcd: duelist.drops.bcd,
        tec: duelist.drops.tec,
      },
    };
  });
}

/* ------------------------------------------------------------- Emitir ------ */

// Las tres tablas se construyen antes de escribir nada: si a una le falta su
// fuente, el generador muere sin haber tocado los ficheros que ya estaban bien.
// Escribir a medias dejaria un repositorio que no compila y no se ve cual de
// las tres fallo.

const cards = buildCards();
const fusions = buildFusions();
const equips = buildEquips();
const effects = buildEffectGroups(cards.length);
const duelists = buildDuelists();

const withText = cards.filter((c) => c.description.length > 0).length;
const deckCards = duelists.reduce((total, duelist) => total + duelist.deck.length, 0);
const dropCards = duelists.reduce(
  (total, duelist) =>
    total + duelist.drops.pow.length + duelist.drops.bcd.length + duelist.drops.tec.length,
  0,
);

/** Ruta de un generado dentro de `packages/engine/src/data/`. */
function generatedPath(fileName) {
  return path.join(REPO_ROOT, 'packages', 'engine', 'src', 'data', fileName);
}

/** Escribe un generado creando el directorio si hace falta. */
function writeGenerated(fileName, contents) {
  const outPath = generatedPath(fileName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, contents, 'utf8');
  console.log(`escrito ${path.relative(REPO_ROOT, outPath)}`);
}

function serialize(value) {
  return JSON.stringify(value, null, 0);
}

/* ------------------------------------------------------------ Cartas ------- */

writeGenerated(
  'cards.generated.ts',
  `// Generado por tools/build-data.mjs. No editar a mano.
// Fuente: notes/card-catalog.csv, languages/en-eu.txt,
//         notes/research/fusion-and-drop-tables/{fusions,equips}.csv
// ${cards.length} cartas (${withText} con texto), ${fusions.recipes} recetas de fusion en ${Object.keys(fusions.table).length} indices, ${equips.pairs} pares de equip en ${Object.keys(equips.table).length} tablas.

import type { CardData } from '../types.js';

/** Atributo de carta por id de tipo. Indice = id, valor = nombre. */
export const TYPE_NAMES = ${serialize(TYPE_NAMES)} as const;

/** Id numerico de tipo por nombre, para mods y validacion. */
export const TYPE_IDS = ${serialize(TYPE_IDS)} as const;

/** Estrella guardian por id. */
export const STAR_NAMES = ${serialize(STAR_NAMES)} as const;

export const STAR_IDS = ${serialize(STAR_IDS)} as const;

export const ATTRIBUTE_NAMES = ${serialize(ATTRIBUTE_NAMES)} as const;

/**
 * Las ${cards.length} cartas de la edicion Norteamericana, indexadas por
 * \`id - 1\`. Los ids son 1..${cards.length} sin huecos.
 */
export const CARDS: readonly CardData[] = ${serialize(cards)};

/**
 * Recetas de fusion indexadas por el id mas pequeno del par:
 * \`FUSIONS[min(a, b)]\` lista \`[otroId, resultadoId]\`.
 */
export const FUSIONS: Readonly<Record<number, readonly (readonly [number, number])[]>> = ${serialize(fusions.table)};

/**
 * Pares validos equip -> monstruo: \`EQUIPS[equipId]\` lista los ids de
 * monstruo que aceptan ese equip.
 */
export const EQUIPS: Readonly<Record<number, readonly number[]>> = ${serialize(equips.table)};
`,
);
console.log(
  `  cartas: ${cards.length} (${withText} con texto, ${cards.length - withText} sin)`,
);
console.log(
  `  fusiones: ${fusions.recipes} recetas en ${Object.keys(fusions.table).length} indices`,
);
console.log(`  equips: ${equips.pairs} pares en ${Object.keys(equips.table).length} tablas`);

/* --------------------------------------------------- Grupos de efecto ------ */

// Se emiten en el orden del header, no en el del mapa: el fichero tiene que
// quedar igual en cualquier ejecucion.
const groupConsts = Object.entries(effects.names)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([value, name]) => `export const EFFECT_GROUP_${name} = ${value};`)
  .join('\n');

writeGenerated(
  'effect-groups.generated.ts',
  `// Generado por tools/build-data.mjs. No editar a mano.
// Fuente: src/game/duel_effect_tables.{c,h} y notes/card-effect-dispatch.md
// ${effects.idCount} ids de efecto en ${effects.groupCount} grupos.

/**
 * Numero de cada grupo de efecto: el indice de la ranura de handler que
 * \`DuelEffect_UpdateCardEffect\` multiplica por dos y despacha
 * (\`duel_effect_tables.h\`).
 */
${groupConsts}

/**
 * Cuantos grupos hay, y cuantos huecos de efecto hay en la tabla.
 *
 * Ojo: \`DUEL_EFFECT_GROUP_COUNT\` es ${effects.groupCount} pero solo existen ${effects.groupCount - 1} constantes. El grupo ${effects.groupCount - 1} esta reservado en la tabla de handlers y ningun effect id lo selecciona (\`notes/magic-effect-groups.md\`), asi que no tiene nombre propio aqui.
 */
export const EFFECT_GROUP_COUNT = ${effects.groupCount};
export const EFFECT_ID_COUNT = ${effects.idCount};

/** Nombre del grupo, para logs y para la vista de depuracion. */
export const EFFECT_GROUP_NAMES: Readonly<Record<number, string>> = ${serialize(effects.names)};

/**
 * Grupo que despacha cada effect id: indice = effect id, ${effects.idCount} entradas sin comprimir.
 *
 * El effect id NO es el id de carta. Lo produce \`DuelEffect_StartCardEffect\` asi (\`notes/card-effect-dispatch.md\`): cartas 301..350 -> \`id - 301\`, cartas 651..700 -> \`id - 601\` pegadas detras, y Dark Magic Ritual (721) -> indice 100. Para consultar por id de carta usa \`effectGroupForCardId\`.
 */
export const EFFECT_GROUP_BY_ID: readonly number[] = ${serialize(effects.byId)};

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
 * Devuelve \`EFFECT_GROUP_NONE\` para los ids que la tabla no cubre, que es lo
 * que hace el retail: una carta sin efecto propio no deja el estado cambiado.
 */
export function effectGroupForCardId(cardId: number): number {
  const effectId = effectIdForCardId(cardId);
  if (effectId < 0 || effectId >= EFFECT_ID_COUNT) return EFFECT_GROUP_NONE;
  return EFFECT_GROUP_BY_ID[effectId];
}
`,
);
console.log(
  `  efectos: ${effects.idCount} ids de efecto en ${effects.groupCount} grupos`,
);

/* ---------------------------------------------------------- Duelistas ------ */

writeGenerated(
  'duelists.generated.ts',
  `// Generado por tools/build-data.mjs. No editar a mano.
// Fuente: notes/research/fusion-and-drop-tables/{drops,drops_summary}.csv
// ${duelists.length} duelistas, ${deckCards} cartas de mazo y ${dropCards} cartas de drop.

/** Una carta del pool de drops con su peso de sorteo. */
export type DropEntry = readonly [cardId: number, weight: number];

export interface DuelistData {
  readonly id: number;
  readonly name: string;

  /**
   * Mazo real de duelo, en ids de carta y sin repetir.
   *
   * Es el pool \`deck\` de \`drops.csv\`: las cartas con las que se planta el
   * duelo, no una seleccion. Los pesos del CSV no se guardan porque en un mazo
   * ya esta todo dentro; para los drops, que si se sortean, si.
   */
  readonly deck: readonly number[];

  /** Los tres pools que suelta la IA cuando pierde: S/A, B/C/D y S/A TEC. */
  readonly drops: {
    readonly pow: readonly DropEntry[];
    readonly bcd: readonly DropEntry[];
    readonly tec: readonly DropEntry[];
  };
}

/**
 * Los ${duelists.length} duelistas del juego, por \`id\` ascendente.
 *
 * El id 0 se llama "${duelists[0].name}" y es una copia del 1 que el retail guarda sin usar. Se conserva tal cual porque es dato real de la tabla, y porque inventarse un duelista que no existe seria peor que arrastrar el duplicado. Si algun dia molesta, se quita por el id, no por el nombre.
 */
export const DUELISTS: readonly DuelistData[] = ${serialize(duelists)};
`,
);
console.log(
  `  duelistas: ${duelists.length} (${deckCards} cartas de mazo, ${dropCards} cartas de drop)`,
);