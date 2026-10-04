import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogResult = 'success' | 'business_error' | 'system_error' | 'aborted' | 'in_progress';
export interface LogContext {
  customerIp: string | null;
  customerId: string | null;
  requestId: string | null;
  api: string | null;
}
export interface LogDetails {
  result?: LogResult;
  errorCode?: string | number;
  statusCode?: number;
  durationMs?: number;
  rpcId?: string | number | null;
}
const contexts = new AsyncLocalStorage<LogContext>();
const priorities: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const emptyContext: LogContext = {
  customerIp: null,
  customerId: null,
  requestId: null,
  api: null,
};

export function withLogContext<T>(context: Partial<LogContext>, run: () => T): T {
  return contexts.run({ ...emptyContext, ...contexts.getStore(), ...context }, run);
}

/** Call only with an ID established by authentication, never an unchecked request header. */
export function setLogCustomerId(customerId: string): void {
  const context = contexts.getStore();
  if (context) context.customerId = customerId;
}

export function getLogContext(): LogContext {
  return contexts.getStore() ?? { ...emptyContext };
}

export function validateLogLevel(value = process.env.LOG_LEVEL ?? 'info'): LogLevel {
  if (!Object.hasOwn(priorities, value)) throw new Error('Invalid LOG_LEVEL');
  return value as LogLevel;
}

/** Use static event names. Do not pass credentials, request bodies, URLs or raw errors. */
export function log(level: LogLevel, event: string, details: LogDetails = {}): void {
  if (priorities[level] < priorities[validateLogLevel()]) return;
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME ?? 'x402-research-lab',
    ...getLogContext(),
    event,
    result: details.result ?? 'in_progress',
    // Deliberate allow-list: callers cannot accidentally serialize arbitrary payloads/errors.
    errorCode: details.errorCode,
    statusCode: details.statusCode,
    durationMs: details.durationMs,
    rpcId: details.rpcId,
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export const logger = {
  debug: (event: string, details?: LogDetails) => log('debug', event, details),
  info: (event: string, details?: LogDetails) => log('info', event, details),
  warn: (event: string, details?: LogDetails) => log('warn', event, details),
  error: (event: string, details?: LogDetails) => log('error', event, details),
};
