import { createApp } from './composition/createApp.ts';
import { logger } from './utils/logging/logger.ts';

const { app, close } = createApp();
const port = Number(process.env.PORT ?? 4021);
const server = app.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  logger.info('server.started', { result: 'success' });
});
server.on('error', () => {
  logger.error('server.failed', { result: 'system_error' });
  process.exitCode = 1;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  logger.info('server.stopping');
  const timeout = setTimeout(() => {
    logger.error('server.shutdown_timeout', { result: 'system_error' });
    process.exit(1);
  }, 10_000);
  timeout.unref();
  server.close(async () => {
    try {
      await close();
      logger.info('server.stopped', { result: 'success' });
    } catch {
      logger.error('server.shutdown_failed', { result: 'system_error' });
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
