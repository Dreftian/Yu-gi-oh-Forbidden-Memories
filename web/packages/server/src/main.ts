/**
 * Punto de entrada del servidor.
 *
 * Arranca el servidor de juego y, en desarrollo, sirve tambien el cliente para
 * que basta con un `npm run dev` para tenerlo todo en marcha. En produccion esto
 * no se usa: el cliente se compila aparte y el servidor solo habla WebSocket.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { GameServer } from './index.js';

/** Puerto del servidor de juego. */
const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
/** Puerto del cliente en desarrollo. */
const CLIENT_PORT = Number.parseInt(process.env.CLIENT_PORT ?? '5173', 10);

/** Si hay que servir el cliente ademas del WebSocket. */
const SERVE_CLIENT = process.env.YFM_SERVE_CLIENT === '1';

const server = new GameServer({
  port: PORT,
  host: HOST,
  // En pruebas se pasa YFM_SEED para tener partidas reproducibles.
  seed: process.env.YFM_SEED !== undefined ? Number.parseInt(process.env.YFM_SEED, 10) : undefined,
});

const port = await server.listen();
console.log(`servidor de duelo en http://${HOST}:${port}`);

if (SERVE_CLIENT) {
  const clientDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../client/dist');
  if (fs.existsSync(clientDir)) {
    console.log(`sirviendo el cliente desde ${clientDir}`);
  } else {
    console.log(`el cliente no esta compilado todavia (${clientDir}); falta npm run build`);
  }
}

// Aviso claro para que un cierre accidental no parezca un fallo.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => {
      console.log(`\n${signal}: servidor cerrado.`);
      process.exit(0);
    });
  });
}

void CLIENT_PORT;