import { afterEach, expect, jest, test } from '@jest/globals';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/composition/createApp.ts';
import { createDiagnosisServer } from '../src/diagnosisServer.ts';
import { InternalMcpError } from '../src/errors/McpErrors.ts';

const originalProxy = process.env.TRUST_PROXY;
afterEach(() => {
  jest.restoreAllMocks();
  if (originalProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalProxy;
});

test('HTTP server logs health, rejected JSON, MCP business/system errors and does not trust spoofed identity', async () => {
  delete process.env.TRUST_PROXY;
  const entries: Record<string, unknown>[] = [];
  jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    entries.push(JSON.parse(String(chunk)));
    return true;
  });
  const { app, close } = createApp(() =>
    createDiagnosisServer(() => ({
      async handle() {
        throw new InternalMcpError();
      },
    })),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const health = await fetch(`${url}/health?token=secret`, {
      headers: { 'X-Forwarded-For': '198.51.100.42', 'X-Customer-Id': 'spoofed' },
    });
    expect(await health.text()).toBe('OK');
    expect(health.headers.get('x-request-id')).toBeTruthy();
    const badJson = await fetch(`${url}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{secret',
    });
    expect(badJson.status).toBe(400);
    await badJson.text();
    for (const args of [
      { txHash: 'bad', chainId: 84532 },
      { txHash: `0x${'a'.repeat(64)}`, chainId: 1 },
      { txHash: `0x${'a'.repeat(64)}`, chainId: 84532 },
    ]) {
      const response = await fetch(`${url}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'diagnose_transaction', arguments: args },
        }),
      });
      expect(response.status).toBe(200);
      await response.text();
    }
    const http = entries.filter((row) => row.event === 'http.completed');
    expect(http).toHaveLength(5);
    expect(http[0]).toMatchObject({
      customerIp: '127.0.0.1',
      customerId: null,
      api: 'GET /health',
      level: 'info',
      result: 'success',
    });
    expect(http[1]).toMatchObject({ statusCode: 400, level: 'info', result: 'business_error' });
    const rpc = entries.filter((row) => row.event === 'rpc.completed');
    expect(rpc.map((row) => [row.level, row.result])).toEqual([
      ['info', 'business_error'],
      ['info', 'business_error'],
      ['error', 'system_error'],
    ]);
    expect(rpc[0]?.requestId).toBe(http[2]?.requestId);
    expect(JSON.stringify(entries)).not.toMatch(/secret|spoofed/);
  } finally {
    await close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('trusted proxy and verified customer ID propagate to custom and completion logs', async () => {
  const { default: express } = await import('express');
  const { requestLogging } = await import('../src/utils/logging/http.ts');
  const { logger, setLogCustomerId } = await import('../src/utils/logging/logger.ts');
  const entries: Record<string, unknown>[] = [];
  jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    entries.push(JSON.parse(String(chunk)));
    return true;
  });
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(requestLogging);
  app.get('/verified', async (_req, res) => {
    setLogCustomerId('verified-customer');
    await Promise.resolve();
    logger.info('custom.step', { result: 'success' });
    res.send('OK');
  });
  app.get('/abort', (_req, res) => {
    res.write('partial');
    setImmediate(() => res.destroy());
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await (
      await fetch(`${url}/verified`, { headers: { 'X-Forwarded-For': '198.51.100.42' } })
    ).text();
    expect(entries).toHaveLength(2);
    for (const row of entries)
      expect(row).toMatchObject({
        customerId: 'verified-customer',
        customerIp: '198.51.100.42',
        api: 'GET /verified',
      });
    expect(entries[0]?.requestId).toBe(entries[1]?.requestId);
    await expect(fetch(`${url}/abort`).then((response) => response.text())).rejects.toThrow();
    const aborted = entries.filter((row) => row.api === 'GET /abort');
    expect(aborted).toHaveLength(1);
    expect(aborted[0]).toMatchObject({ level: 'warn', result: 'aborted', customerId: null });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
