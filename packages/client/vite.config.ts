import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Puerto por defecto del cliente en desarrollo. */
const CLIENT_PORT = Number.parseInt(process.env.CLIENT_PORT ?? '5173', 10);
/** Puerto por defecto del servidor de juego. */
const SERVER_PORT = Number.parseInt(process.env.SERVER_PORT ?? '8787', 10);

export default defineConfig({
  root: here,
  // El motor se consume desde su codigo fuente, sin empaquetar: asi el cliente
  // y el servidor ejecutan literalmente el mismo modulo.
  resolve: {
    alias: {
      '@yfm/engine': path.resolve(here, '../engine/src/index.ts'),
    },
  },
  server: {
    port: CLIENT_PORT,
    // En desarrollo el cliente y el servidor viven en puertos distintos, asi que
    // el WebSocket necesita saber donde esta el otro. En produccion se separan
    // con una variable de entorno.
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${SERVER_PORT}`,
        ws: true,
      },
      '/health': {
        target: `http://127.0.0.1:${SERVER_PORT}`,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
});