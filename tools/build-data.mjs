/**
 * Genera `packages/engine/src/data/cards.generated.ts` a partir de los datos que
 * ya viven en este repositorio:
 *
 *   notes/card-catalog.csv                     identidad y estadisticas (722 cartas)
 *   languages/en-eu.txt                         texto de las cartas (banco `descriptions`)
 *   notes/research/fusion-and-drop-tables/*.csv fusiones y equips
 *
 * No se copia ningun pixel ni audio del juego: solo texto y tablas, que es lo
 * unico que el repositorio incluye. Las reglas de duelo (terrenos, trampas,
 * grupos de efecto) viven en el codigo del motor, derivadas del decompilado.
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
  return compact;
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
  return compact;
}

/* ------------------------------------------------------------- Emitir ------ */

const cards = buildCards();
const fusions = buildFusions();
const equips = buildEquips();

const withText = cards.filter((c) => c.description.length > 0).length;

const banner = `// Generado por tools/build-data.mjs. No editar a mano.
// Fuente: notes/card-catalog.csv, languages/en-eu.txt,
//         notes/research/fusion-and-drop-tables/{fusions,equips}.csv
// ${cards.length} cartas (${withText} con texto), ${Object.keys(fusions).length}indices de fusion, ${Object.keys(equips).length} equips.
`;

function serialize(value) {
  return JSON.stringify(value, null, 0);
}

const out = `${banner}
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
export const FUSIONS: Readonly<Record<number, readonly (readonly [number, number])[]>> = ${serialize(fusions)};

/**
 * Pares validos equip -> monstruo: \`EQUIPS[equipId]\` lista los ids de
 * monstruo que aceptan ese equip.
 */
export const EQUIPS: Readonly<Record<number, readonly number[]>> = ${serialize(equips)};
`;

const outPath = path.join(
  REPO_ROOT,
  'packages',
  'engine',
  'src',
  'data',
  'cards.generated.ts',
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');

console.log(`escrito ${path.relative(REPO_ROOT, outPath)}`);
console.log(
  `  cartas: ${cards.length} (${withText} con texto, ${cards.length - withText} sin)`,
);
console.log(`  fusiones: ${Object.keys(fusions).length} indices`);
console.log(`  equips: ${Object.keys(equips).length}`);