import { afterEach, expect, jest, test } from '@jest/globals';
import { logger, setLogCustomerId, withLogContext } from '../src/utils/logging/logger.ts';
import { withMcpLogging } from '../src/utils/logging/mcp.ts';
import type { McpHttpHandler } from '@modelcontextprotocol/server';

const originalLevel = process.env.LOG_LEVEL;
afterEach(() => {
  jest.restoreAllMocks();
  if (originalLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = originalLevel;
});
function capture() {
  process.env.LOG_LEVEL = 'info';
  const entries: Record<string, unknown>[] = [];
  jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    entries.push(JSON.parse(String(chunk)));
    return true;
  });
  return entries;
}

test('concurrent async work keeps customer context isolated and logs valid single-line JSON', async () => {
  const entries = capture();
  await Promise.all(
    ['a', 'b'].map((id) =>
      withLogContext(
        { requestId: id, customerIp: `ip-${id}`, api: 'tools/call:test' },
        async () => {
          setLogCustomerId(id);
          await new Promise((resolve) => setTimeout(resolve, id === 'a' ? 10 : 1));
          logger.info('operation.completed', { result: 'success' });
        },
      ),
    ),
  );
  expect(entries).toHaveLength(2);
  for (const row of entries) {
    expect(row.customerId).toBe(row.requestId);
    expect(row.customerIp).toBe(`ip-${row.requestId}`);
    expect(row).toMatchObject({ level: 'info', api: 'tools/call:test', result: 'success' });
    expect(Number.isNaN(Date.parse(row.timestamp as string))).toBe(false);
  }
  logger.info('outside');
  expect(entries[2]).toMatchObject({ customerId: null, customerIp: null, api: null });
});

test('level filtering and details allow-list prevent accidental raw payload logging', () => {
  const entries = capture();
  logger.debug('hidden');
  logger.info('visible', {
    result: 'success',
    ...{ token: 'secret', body: 'private', level: 'error' },
  });
  expect(entries).toHaveLength(1);
  expect(JSON.stringify(entries)).not.toMatch(/secret|private/);
  expect(entries[0]?.level).toBe('info');
});

test.each([
  [{ result: { content: [] } }, 'info', 'success'],
  [
    { result: { isError: true, content: [{ type: 'text', text: 'invalid arguments secret' }] } },
    'info',
    'business_error',
  ],
  [
    {
      result: {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'UNSUPPORTED_CHAIN' } }) }],
      },
    },
    'info',
    'business_error',
  ],
  [
    {
      result: {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: { code: 'RPC_UNAVAILABLE' } }) }],
      },
    },
    'error',
    'system_error',
  ],
  [{ error: { code: -32603, message: 'secret' } }, 'error', 'system_error'],
  [{ error: { code: -32602, message: 'secret' } }, 'info', 'business_error'],
] as const)(
  'MCP JSON and chunked SSE result classification: %j',
  async (payload, level, result) => {
    const entries = capture();
    for (const sse of [false, true]) {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, ...payload });
      const wire = sse ? `event: message\r\ndata: ${body}\r\n\r\n` : body;
      const bytes = new TextEncoder().encode(wire);
      const stream = new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
          controller.close();
        },
      });
      const handler = {
        fetch: async () =>
          new Response(stream, {
            headers: { 'Content-Type': sse ? 'text/event-stream' : 'application/json' },
          }),
      } as Pick<McpHttpHandler, 'fetch'>;
      const response = await withLogContext({ api: 'tools/call:diagnose_transaction' }, () =>
        withMcpLogging(handler).fetch(new Request('http://localhost/mcp')),
      );
      expect(await response.text()).toBe(wire);
    }
    expect(entries).toHaveLength(2);
    for (const row of entries)
      expect(row).toMatchObject({
        event: 'rpc.completed',
        api: 'tools/call:diagnose_transaction',
        level,
        result,
        rpcId: 1,
      });
    expect(JSON.stringify(entries)).not.toContain('secret');
  },
);
