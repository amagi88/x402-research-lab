import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { getLogContext, logger, withLogContext } from './logger.ts';

export const requestLogging: RequestHandler = (req, res, next) => {
  const started = performance.now();
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  withLogContext(
    {
      requestId,
      customerIp: req.ip ?? req.socket.remoteAddress ?? null,
      customerId: null,
      api: `${req.method} ${req.path}`,
    },
    () => {
      // Keep the context alive even when finish/close is emitted outside its async chain.
      const context = getLogContext();
      let completed = false;
      const complete = (aborted: boolean) => {
        if (completed) return;
        completed = true;
        const result = aborted
          ? 'aborted'
          : res.statusCode >= 500
            ? 'system_error'
            : res.statusCode >= 400
              ? 'business_error'
              : 'success';
        withLogContext(
          { ...context, customerId: getLogContext().customerId ?? context.customerId },
          () => {
            const write = aborted
              ? logger.warn
              : res.statusCode >= 500
                ? logger.error
                : logger.info;
            write('http.completed', {
              result,
              statusCode: res.statusCode,
              durationMs: Math.round(performance.now() - started),
            });
          },
        );
      };
      res.once('finish', () => complete(false));
      res.once('close', () => complete(!res.writableFinished));
      next();
    },
  );
};

/** Avoid Express's default raw stack logging (upstream URLs can contain API keys). */
export const httpErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const candidate = error && typeof error === 'object' && 'status' in error ? error.status : 500;
  const status =
    typeof candidate === 'number' && candidate >= 400 && candidate < 500 ? candidate : 500;
  if (res.headersSent) {
    logger.error('http.response_failed', { result: 'system_error', errorCode: 'INTERNAL_ERROR' });
    res.destroy();
    return;
  }
  res.status(status).json({ error: status < 500 ? 'Invalid request' : 'Internal server error' });
};
