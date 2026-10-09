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