// Entry point: wire db + app, listen, shut down cleanly.
import { createDb } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';

const db = createDb({ file: config.dataFile });
const app = createApp({ config, db });

const server = app.listen(config.port, () => {
  console.log(`Task manager listening on http://localhost:${config.port}`);
});

function shutdown() {
  const forceExit = setTimeout(() => {
    db.close();
    process.exit(1);
  }, 5000);
  forceExit.unref();
  server.close(() => {
    clearTimeout(forceExit);
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
