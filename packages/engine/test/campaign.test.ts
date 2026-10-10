/**
 * Tests del mazo de los duelistas: el pool ponderado del rival.
 *
 * El hecho que hay que fijar aqui es que el mazo del rival NO es una lista fija de
 * 40 cartas: el retail lo SORTEA de un pool con pesos
 * (`notes/research/fusion-and-drop-tables/README.md:25-27`: "the opponent's deck
 * is drawn from it rather than being fixed"; `notes/more-duelists.md:88`:
 * "Weights, not a card list: the game draws 40 cards from the pool"). Los pools
 * tienen entre 21 y 169 cartas distintas, y por eso el mazo cambia de una partida
 * a otra.
 *
 * Ademas de que sale del pool, el mazo tiene que ser JUGABLE, que es una
 * exigencia nuestra y no del retail: `validateDeck` lo rechaza en cuanto se pasa
 * de copias y `materialiseDeck` (`setup.ts`) cambia en silencio cualquier mazo que
 * no lo pase. Un `rollDuelistDeck` que devolviera un mazo con cuatro copias de la
 * misma carta perderia el mazo del duelista sin avisar a nadie.
 *
 *   npm test --workspace @yfm/engine
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DECK_CARD_COPY_LIMIT,
  DUELISTS,
  EXODIA_PIECE_COPY_LIMIT,
  EXODIA_PIECE_IDS,
  Rng,
  card,
  duelistById,
  rollDuelistDeck,
  validateDeck,
} from '../src/index.js';
import type { DropEntry } from '../src/index.js';

/** Semillas de prueba. Deliberadamente fijas: un fallo tiene que ser reproducible. */
const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);

/** Generador que cuenta cuantos valores del retail consume. */
class CountingRng extends Rng {
  calls = 0;

  override next(): number {
    this.calls += 1;
    return super.next();
  }
}

/** Cuantas veces sale cada carta en un mazo. */
function copies(deck: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const cardId of deck) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  return counts;
}

/** El limite legal de copias de una carta: tres, y una si es pieza de Exodia. */
function limitFor(cardId: number): number {
  return (EXODIA_PIECE_IDS as readonly number[]).includes(cardId)
    ? EXODIA_PIECE_COPY_LIMIT
    : DECK_CARD_COPY_LIMIT;
}

/**
 * Simon Muran (id 1) es el duelista que se usa en las pruebas estructurales: su
 * pool son 32 cartas y las cinco ultimas son los trozos de Exodia, asi que tambien
 * cubre el limite de una copia.
 */
const DUELIST_ID = 1;

/**
 * Ocean Mage (id 21) es el que mejor separa los pesos para la prueba de reparto.
 *
 * Su pool son 87 cartas: la mas pesada pesa 160 de 2048 y las nueve mas ligeras
 * pesan 2. En 200 mazos son 8000 sorteos, de los que la pesada se lleva alrededor
 * del 6% (algo menos que su 7,8% nominal, porque al llegar a sus tres copias el
 * sorteo se rechaza y la carta se reparte entre las demas) y las ligeras se quedan
 * con el 0,8% frente al 0,9% que les da su peso.
 *
 * Un reparto uniforme, que es el fallo que hay que cazar, daria lo contrario: 1,1%
 * a la pesada —porque solo hay una— y 10,3% a las nueve ligeras. Las bandas que se
 * comprueban estan a cuatro desviaciones tipicas o mas del valor real, asi que la
 * prueba no es flaky y aun asi un reparto uniforme no pasaria ni de lejos.
 */
const WEIGHTED_DUELIST_ID = 21;

describe('mazo de duelista: sale del pool con los pesos', () => {
  it('los 40 duelistas tienen pool, nombre y los pesos que suman 2048', () => {
    // Es el invariante que sostiene el sorteo: el umbral va de 1 a 2048 y cada
    // tabla suma justo eso, asi que ningun umbral se queda fuera del pool.
    assert.equal(DUELISTS.length, 40);
    for (const duelist of DUELISTS) {
      assert.notEqual(duelist.name, '', `duelista ${duelist.id} sin nombre`);
      assert.ok(duelist.deck.length >= 21, `${duelist.name}: pool de ${duelist.deck.length}`);
      const total = duelist.deck.reduce((sum, entry) => sum + entry[1], 0);
      assert.equal(total, 2048, `${duelist.name} (${duelist.id}) suma ${total}`);
      const ids = new Set(duelist.deck.map((entry) => entry[0]));
      assert.equal(ids.size, duelist.deck.length, `${duelist.name} repite carta en el pool`);
    }
  });

  it('cada duelista reparte 40 cartas validas con muchas semillas', () => {
    for (const duelist of DUELISTS) {
      for (const seed of SEEDS) {
        const deck = rollDuelistDeck(duelist.id, new Rng(seed));
        const label = `${duelist.name} (${duelist.id}), semilla ${seed}`;
        assert.equal(deck.length, 40, label);
        assert.equal(validateDeck(deck), null, label);
      }
    }
  });

  it('todas las cartas del mazo existen en el catalogo', () => {
    // Un id que no este en `cards.generated.ts` haria que `validateDeck` lo
    // rechazase, pero conviene que el fallo sea aqui y no en `materialiseDeck`.
    for (const duelist of DUELISTS) {
      for (const cardId of duelist.deck.map((entry: DropEntry) => entry[0])) {
        assert.ok(card(cardId) !== undefined, `${duelist.name}: carta ${cardId} no esta`);
      }
    }
  });

  it('la misma semilla da el mismo mazo', () => {
    for (const duelist of DUELISTS) {
      assert.deepEqual(
        rollDuelistDeck(duelist.id, new Rng(7)),
        rollDuelistDeck(duelist.id, new Rng(7)),
        duelist.name,
      );
    }
  });

  it('el mazo NO es fijo: veinte semillas dan veinte mazos casi distintos', () => {
    // Si el mazo fuera una lista fija —que es como se leia el dato antes de
    // saber que se sortea— estas veinte llamadas darian el mismo mazo 20 veces.
    const seen = new Map<string, number>();
    for (const seed of SEEDS) {
      const key = rollDuelistDeck(DUELIST_ID, new Rng(seed)).join(',');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    // Generoso a proposito: se comprueba que hay variedad, no la cantidad exacta
    // de mazos distintos, que depende de como de repetitivo sea el pool.
    assert.ok(seen.size >= 18, `solo ${seen.size} mazos distintos de 20 semillas`);

    // Y dos semillas concretas no pueden coincidir.
    assert.notDeepEqual(
      rollDuelistDeck(DUELIST_ID, new Rng(1)),
      rollDuelistDeck(DUELIST_ID, new Rng(2)),
    );
  });

  it('nunca pasa del limite de copias de ninguna carta', () => {
    for (const duelist of DUELISTS) {
      for (const seed of SEEDS) {
        const deck = rollDuelistDeck(duelist.id, new Rng(seed));
        for (const [cardId, count] of copies(deck)) {
          assert.ok(
            count <= limitFor(cardId),
            `${duelist.name}, semilla ${seed}: ${count} copias de ${cardId}`,
          );
        }
      }
    }
  });

  it('el mazo sale de SU pool, no de otro', () => {
    for (const duelist of DUELISTS) {
      const allowed = new Set(duelist.deck.map((entry: DropEntry) => entry[0]));
      for (const cardId of rollDuelistDeck(duelist.id, new Rng(3))) {
        assert.ok(allowed.has(cardId), `${duelist.name} ha sacado ${cardId}, que no es suyo`);
      }
    }
  });

  it('las cartas mas pesadas salen mas a menudo que las mas ligeras', () => {
    const duelist = duelistById(WEIGHTED_DUELIST_ID);
    assert.ok(duelist !== undefined);

    // Las dos cartas de los extremos se buscan en el dato, no se escriben a mano:
    // asi la prueba sigue valiendo si la tabla cambia. Y se comprueba que el pool
    // sigue separando los pesos de verdad, para que un fallo diga "el pool ya no
    // sirve para esta prueba" y no un numero raro.
    const weights = duelist.deck.map((entry: DropEntry) => entry[1]);
    const heaviest = Math.max(...weights);
    const lightest = Math.min(...weights);
    const heavyIds = duelist.deck.filter((e: DropEntry) => e[1] === heaviest).map((e: DropEntry) => e[0]);
    const lightIds = duelist.deck.filter((e: DropEntry) => e[1] === lightest).map((e: DropEntry) => e[0]);
    assert.ok(heaviest >= 100 && duelist.deck.length >= 50, 'el pool ya no separa los pesos');

    const seeds = Array.from({ length: 200 }, (_, index) => index + 1);
    let heavy = 0;
    let light = 0;
    let total = 0;

    for (const seed of seeds) {
      for (const cardId of rollDuelistDeck(WEIGHTED_DUELIST_ID, new Rng(seed))) {
        total += 1;
        if (heavyIds.includes(cardId)) heavy += 1;
        if (lightIds.includes(cardId)) light += 1;
      }
    }
    assert.equal(total, 200 * 40);

    // Bandas generosas en proporcion, no igualdad exacta: 8000 sorteos no son una
    // poblacion infinita. Lo que se quiere cazar es un reparto uniforme, que
    // dejaria a la pesada en el 1,1% y a las ligeras en el 10,3%.
    assert.ok(
      heavy > total * 0.04,
      `la carta de peso ${heaviest} sale el ${((100 * heavy) / total).toFixed(2)}% de las veces`,
    );
    assert.ok(
      light < total * 0.03,
      `las ${lightIds.length} cartas de peso ${lightest} suman el ${((100 * light) / total).toFixed(2)}%`,
    );
    assert.ok(
      heavy > light * 4,
      `la pesada sale ${heavy} veces y las ligeras ${light}`,
    );
  });

  it('un duelista desconocido devuelve un mazo inicial valido, no uno vacio', () => {
    // Es la degradacion que se quiere documentar: sin pool no hay sorteo, asi que
    // se cae al mazo inicial, que es lo unico que `materialiseDeck` acepta como
    // sustituto. Devolver un mazo de cero cartas dejaria el duelo sin arrancar.
    for (const unknown of [-1, 40, 9999, Number.NaN]) {
      const deck = rollDuelistDeck(unknown, new Rng(5));
      assert.equal(deck.length, 40, `duelista ${unknown}`);
      assert.equal(validateDeck(deck), null, `duelista ${unknown}`);
    }
    assert.equal(duelistById(40), undefined);
    assert.equal(duelistById(1)?.name, 'Simon Muran');
  });

  it('el sorteo gasta un valor por carta, como el selector de drops del retail', () => {
    // `weightedPick` consume un unico valor por sorteo, a diferencia del
    // generador del mazo inicial, que gasta uno por peso examinado (y son hasta
    // 722). Los limites de abajo acotan el gasto: 40 sorteos si no hay ni un
    // reintento, y como mucho 40 intentos por carta con el tope de seguridad. Un
    // mazo generado con el algoritmo equivocado (el del mazo inicial) gastaria
    // del orden de miles de valores y se caeria del primer limite.
    const rng = new CountingRng(11);
    assert.equal(rollDuelistDeck(DUELIST_ID, rng).length, 40);
    assert.ok(rng.calls >= 40, `solo ${rng.calls} valores para 40 cartas`);
    assert.ok(rng.calls <= 40 * 512, `${rng.calls} valores para 40 cartas`);
  });

  it('un pool tan sesgado que agota los intentos aun devuelve 40 cartas validas', () => {
    // Teana es el caso limite: 21 cartas de las que siete concentran 2020 de los
    // 2048 puntos. Cuando esas siete llegan a sus tres copias, casi todos los
    // sorteos caen en una carta agotada. Aunque el sorteo se rinda, el mazo tiene
    // que seguir siendo jugable, porque `materialiseDeck` cambia en silencio
    // cualquier mazo que `validateDeck` no acepte.
    const teana = duelistById(2);
    assert.ok(teana !== undefined);
    for (const seed of SEEDS) {
      const deck = rollDuelistDeck(2, new Rng(seed));
      assert.equal(deck.length, 40, `semilla ${seed}`);
      assert.equal(validateDeck(deck), null, `semilla ${seed}`);
    }
  });
});