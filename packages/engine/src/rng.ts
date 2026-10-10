/**
 * Generador pseudoaleatorio.
 *
 * Es el LCG estandar de ANSI tal y como lo usa el runtime de Psy-Q
 * (`notes/rng.md`, `src/psyq/rand.h`):
 *
 *   estado = estado * 0x41C64E6D + 0x3039   (32 bits)
 *   rand() = (estado >> 16) & 0x7FFF
 *
 * Se replica exactamente, incluido el sesgo del modulo, porque el juego retail
 * baraja con 160 intercambios de rango completo (no un Fisher-Yates
 * decreciente) y las tarjetas que salen dependian de la posicion exacta del
 * generador. Ademas, dos clientes que compartan semilla y llamadas esperan la
 * misma secuencia: cualquiera que use un PRNG distinto desincroniza la partida.
 */

/** Multiplicador del LCG de Psy-Q. */
const LCG_MULTIPLIER = 0x41c64e6d;
/** Incremento del LCG de Psy-Q. */
const LCG_INCREMENT = 0x3039;
/** `RAND_MAX` del runtime de Psy-Q. */
export const RAND_MAX = 0x7fff;

/** Semilla de arranque que sobrevive al boot del retail (`RAND_BOOT_SEED`). */
export const BOOT_SEED = 0x55555555;

/**
 * `DUEL_DROP_WEIGHT_TOTAL - 1` en `src/game/card_constants.h`: la mascara con la
 * que el retail saca su umbral. El `+ 1` de despues convierte el 0-2047 en el
 * 1-2048 que se compara con el acumulado de una tabla de pesos.
 */
const THRESHOLD_MASK = 0x7ff;

/**
 * `DUEL_DROP_WEIGHT_TOTAL`: el peso total de cada pool que el retail sortea con
 * umbral (las tablas de drops suman 2040 y las del mazo inicial 2048). No es un
 * "`rand() % n`": es el denominador de un muestreo sobre un total fijo, y por eso
 * el rango del umbral son 2048 valores justos (`notes/rng.md`, seccion del
 * umbral).
 */
export const THRESHOLD_TOTAL = THRESHOLD_MASK + 1;

/** Generador lineal congruente de 32 bits con la misma forma que el de Psy-Q. */
export class Rng {
  private state: number;

  constructor(seed: number = BOOT_SEED) {
    this.state = seed >>> 0;
  }

  /** Fija la semilla. `srand` del retail solo guarda el argumento. */
  seed(value: number): void {
    this.state = value >>> 0;
  }

  /** La semilla actual. El retail la expone en `gRand_dwSeed`. */
  current(): number {
    return this.state >>> 0;
  }

  /** Un valor de 0 a `RAND_MAX`, igual que `rand()`. */
  next(): number {
    this.state = (Math.imul(this.state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return (this.state >>> 16) & RAND_MAX;
  }

  /**
   * `Rand_GetInterval(n)` del retail, que es literalmente `rand() % n`.
   * El sesgo del modulo es real: con `n = 40` los indices 0-7 salen algo mas
   * a menudo. Se conserva por fidelidad, no por error.
   */
  interval(n: number): number {
    return n <= 0 ? 0 : this.next() % n;
  }

  /** Un entero en `[min, max]`, ambos incluidos. */
  between(min: number, max: number): number {
    if (max <= min) return min;
    return min + this.interval(max - min + 1);
  }

  /** Un booleano con la mitad de probabilidad. */
  bool(): boolean {
    return (this.next() & 1) === 1;
  }

  /**
   * El umbral de un sorteo ponderado: `(rand() & 0x7FF) + 1`, o sea 1..2048.
   *
   * Es el retail entero (`src/game/duel_shuffle_deck.c:100`, `notes/rng.md`
   * lineas 135-139 y 228-230): `Duel_SelectCardDrop` y
   * `NameEntry_BuildStarterDeck` sortean comparando un acumulado con un umbral
   * en 1..2048, no con un modulo. Como el total de cada tabla de pesos es
   * `DUEL_DROP_WEIGHT_TOTAL` (2048), los 2048 valores del umbral tienen las
   * mismas preimagenes: no hay sesgo, al contrario que en `interval()`.
   */
  threshold(): number {
    return (this.next() & THRESHOLD_MASK) + 1;
  }

  /**
   * El indice del primer peso que hace que el acumulado alcance el umbral.
   *
   * Es el recorrido de `Duel_SelectCardDrop` (`src/game/duel_result_runtime.c`):
   * suma los pesos en orden y devuelve el indice del primero que cierra el
   * umbral, sin reintentar ni renormalizar.
   *
   * Devuelve `-1` cuando ningun peso alcanza el umbral: tabla vacia, total 0, o
   * una tabla editado cuya suma no llega a `threshold()`. Es justo lo que hace el
   * retail, que devuelve 0 (su "ninguna carta") sin reintentar
   * (`notes/rng.md`, lineas 135-145). Se elige `-1` y no una excepcion porque el
   * motor es puro y nunca lanza: el caso de "no sale ninguna" tiene que ser un
   * valor, no una excepcion que tumbe la partida.
   *
   * Ojo: este recorrido NO gasta un valor por peso examinado, a diferencia del
   * generador del mazo inicial, que si lo hace (`catalog.ts`,
   * `starterDeckCardIds`).
   */
  weightedPick(weights: readonly number[]): number {
    const limit = this.threshold();
    let accumulated = 0;
    for (let index = 0; index < weights.length; index += 1) {
      accumulated += weights[index] as number;
      if (accumulated >= limit) return index;
    }
    return -1;
  }

  /** Elige un elemento de una lista no vacia. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() sobre una lista vacia');
    return items[this.interval(items.length)] as T;
  }

  /** Baraja in place. Usa el metodo del retail: intercambios de rango completo. */
  shuffle<T>(items: T[], swapCount: number): void {
    const size = items.length;
    if (size < 2) return;
    for (let i = 0; i < swapCount; i += 1) {
      const x = this.interval(size);
      const y = this.interval(size);
      const tmp = items[x] as T;
      items[x] = items[y] as T;
      items[y] = tmp;
    }
  }

  /**
   * Copia la semilla del generador para poder reabrir una partida a medias.
   * El retail lo hace parando el juego antes de robar (F5/F7).
   */
  snapshot(): number {
    return this.state >>> 0;
  }
}