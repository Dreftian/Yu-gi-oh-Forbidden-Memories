# Yu-Gi-Oh! Forbidden Memories — versión web con PvP

Una reimplementación en TypeScript de las reglas de duelo de *Forbidden Memories*
(PS1, 1999), jugable en el navegador: contra la CPU en local o contra otra
persona por emparejamiento en línea.

El juego original es un port nativo en C de un descompilado de PlayStation, y
necesita la imagen del disco para arrancar. Esta versión reescribe **las reglas**
en un motor puro, sin el disco, sin emulación y sin nada de Konami: solo usa los
datos de cartas que el repositorio ya incluye (identidad, estadísticas y texto en
cinco idiomas).

## Qué funciona

- **Las 722 cartas** del catálogo, con nombre, tipo, atributo, nivel, estrellas
  guardián, ATK/DEF y descripción real del juego.
- **Combate con las reglas del retail**: diferencia de ATK, posiciones de defensa,
  trampas con umbral, y el empate que destruye a ambos monstruos sin hacer daño.
- **Las 14 familias de efecto** de Magia y Ritual: Raigeki, Dark Hole,
  Swords of Revealing Light, los seis terrenos, las trampas, las cartas de daño
  directo y de curación.
- **Estrellas guardián** con sus dos ciclos de seis y cuatro miembros, y la
  bonificación de ±500 que se aplica solo al atacante.
- **Exodia**: las cinco piezas en la mano a la vez ganan el duel al instante.
- **Fusiones y equips** con las 25 131 recetas y los 4 041 pares reales.
- **Emparejamiento en línea** por cola y salas privadas con código de cinco
  caracteres.
- **Sin registro**: un nombre y un token que genera el servidor. No hay correo ni
  contraseña en ningún sitio.

## Puesta en marcha

```sh
npm install          # compila el motor al terminar
npm run build        # motor, cliente y servidor
npm start            # servidor de juego en el puerto 8787
```

En desarrollo, con recarga en caliente:

```sh
npm run dev          # servidor en 8787 y cliente en 5173
```

El cliente queda en <http://localhost:5173> y el servidor en el 8787. En
desarrollo, Vite hace de proxy de `/ws` hacia el servidor, así que no hay que
configurar nada.

Si el checkout del decompilado no está donde el generador espera, se le dice:

```sh
node tools/build-data.mjs --decomp ../Yu-Gi-Oh-Forbidden-Memories-Recompiled-master
```

El catálogo generado (`packages/engine/src/data/cards.generated.ts`) **está en el
repositorio** a propósito: son 722 cartas con sus estadísticas y su texto, unos
400 KB, y sin él el clon no compila ni tiene con qué jugar. `npm install`
compila el motor, así que no hace falta ningún paso previo.

Para regenerarlo cuando cambien los datos del decompilado:

```sh
npm run build:data
```

### Comprobar el emparejamiento

Con el servidor en marcha:

```sh
node tools/check-match.mjs ws://127.0.0.1:8787/ws
```

Levanta dos clientes, los empareja y comprueba que cada uno ve su mano y que la
del rival no viaja nunca.

## Cómo está organizado

```
web/
├── tools/
│   ├── build-data.mjs      genera el catálogo desde el decompilado
│   └── check-match.mjs     comprobación manual del emparejamiento
└── packages/
    ├── engine/             motor de duelo. Puro: sin DOM, sin Node
    │   ├── src/
    │   │   ├── constants.ts    todos los números del retail, con su referencia
    │   │   ├── rng.ts          el LCG de Psy-Q, idéntico al original
    │   │   ├── catalog.ts      acceso a las cartas y sus tablas
    │   │   ├── state.ts        estado del duelo y sus consultas
    │   │   ├── effects.ts      los 14 grupos de efecto y las trampas
    │   │   ├── engine.ts       turnos, robo, invocaciones y combate
    │   │   ├── view.ts         proyección: qué ve cada jugador
    │   │   └── setup.ts        barajado, reparto y validación de mazos
    │   └── test/              63 tests de reglas
    ├── server/             servidor de emparejamiento
    │   ├── src/matchmaker.ts   la cola y las salas privadas
    │   ├── src/match.ts        una partida con su motor
    │   └── test/               11 tests de extremo a extremo
    └── client/             interfaz web
        └── src/ai.ts           la CPU
```

## Decisiones de diseño

### El motor es puro y lo ejecutan los dos lados

`applyAction(estado, acción, semilla)` es una función pura: mismo estado, misma
acción y misma semilla dan siempre el mismo resultado. No lanza excepciones ni
consulta el reloj. El servidor la ejecuta y manda el resultado; en el modo contra
la CPU, la ejecuta el navegador.

Por eso no hay sincronización de fotogramas ni números de compensate: si los dos
clientes aplican las mismas acciones, convergen. Y como el PRNG es el mismo
generador lineal congruente de Psy-Q (`state = state * 0x41C64E6D + 0x3039`), el
barajado sale idéntico en los dos.

### El servidor es la autoridad, y solo manda vistas

En línea, el cliente no recibe el estado del duel: recibe **su vista**. La mano
del rival no viaja en ningún mensaje, y una carta boca abajo llega sin su id.
Eso no es una ocultacion: es que el servidor nunca la tiene en el mensaje.

Hay una prueba que lo comprueba en cada emparejamiento.

### No hay arte, y es a proposito

El repositorio no incluye las imágenes del juego: viven dentro del disco, que es
material de Konami y no se puede subir a GitHub. Las cartas se dibujan con un
marco del color real de su tipo (oro, verde, rosa, azul), el nombre, el hueco
del arte y las estadísticas. Se lee como un duelo; no es el original en pantalla.

### Las recetas de ritual están transcritas, no extraídas

La tabla de rituales del retail vive en el disco (`0x801799D8`, 24 registros).
Como aquí no hay disco, `constants.ts` la reconstruye a partir del texto de cada
carta (`languages/en-eu.txt`), más las tres recetas que el repositorio documenta
con certeza. Cuando aparezca la tabla, se sustituye el array sin tocar el motor:
la forma de los datos ya es la que el motor lee.

## Detalles del retail que se respetan

Cosas que no son obvias y que están en el código por una razón concreta:

| Detalle | Por qué |
|---|---|
| 8000 PV, no 4000 | `DUEL_STARTING_LIFE_POINTS` en `card_constants.h` |
| Se roba hasta llenar la mano de 5 | La fase de robo roba `5 - cartas_en_mano` |
| El primer turno no tiene combate | `D_8009B16C & 0x1000` |
| La bonificación de estrella va solo al atacante | `func_8001EFD4` devuelve `atacante - defensor`, sin ajustar el defensor |
| Los ciclos de estrellas son 6 y 4, y no se cruzan | `Duel_CalcGuardianStarMatchup` |
| Swords dura 3 turnos, con contador interno 4 | La fase de robo lo descuenta antes de actuar |
| La trampa que dispara es la más débil que cubre | Se recorre de la más fuerte a la más débil |
| El umbral de trampa es inclusivo | `ATK <= umbral` dispara |
| Dark-piercing Light revela las dos filas | quirk del retail, slots 5..14 |
| No hay límite de equips por monstruo | Solo el techo de 9999 |
| No hay ATK bonus por trozos de Exodia | Solo es condición de victoria |
| El empate en ATK destruye ambos sin daño | `-1` es centinela en `func_8001EFD4` |
| El barajado son 160 intercambios de rango completo | No es un Fisher-Yates; cambiarlo cambia la partida entera |

## Qué no está

- **Las 621 criaturas sin efecto.** En el retail solo hay 33 Magias con efecto
  propio; los monstruos no tienen ninguna mecánica documentada. El texto de la
  carta se muestra, pero no se ejecuta.
- **El modo campaña**, los duelos contra los 39 duelistas, la biblioteca, los
  Guardian Stars como invocación y el constructor de mazos. Esta versión es el
  duelo.
- **Sin persistencia en el servidor.** No hay cuentas ni historial. Si alguien
  quiere rankings, es cosa de añadirla.

## Tests

```sh
npm test
```

63 tests de reglas en el motor y 11 de extremo a extremo en el servidor, que
levantan un servidor real, conectan clientes de verdad y comprueban el
emparejamiento, la privacidad de la mano y el reparto de turnos.

## Sobre subir esto a GitHub

El repositorio no incluye datos del juego original: solo texto y tablas, que es
lo que el propio repositorio ya tenía. Las cartas se identifican por nombre y
estadísticas, que son datos públicos de la base de datos del juego, y el texto
de las cartas es el que el repositorio ya exportaba de las traducciones
europeas. Yu-Gi-Oh! y Forbidden Memories pertenecen a Konami; esto es una
reimplementación de reglas, no una copia del juego.

## Licencia

El código de este directorio es MIT, como el port de PC del repositorio.