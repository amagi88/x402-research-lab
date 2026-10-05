import { expect, test } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createDiagnosisServer } from '../src/diagnosisServer.ts';
import { toolErrorSchema } from '../src/validator/toolErrorSchema.ts';

const txHash = '0x' + 'a'.repeat(64);
async function withMcpClient(run: (client: Client) => Promise<void>): Promise<void> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createDiagnosisServer(() => {
    throw new Error('Unexpected controller creation');
  });
  const client = new Client({ name: 'diagnosis-test-client', version: '1.0.0' });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

function firstText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = CallToolResultSchema.parse(result).content[0];
  if (!content || content.type !== 'text') throw new Error('Expected a text Tool result');
  return content.text;
}

test('tools/list exposes diagnose_transaction without loading RPC settings', async () => {
  await withMcpClient(async (client) => {
    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toEqual(['diagnose_transaction']);
    expect(result.tools[0]?.inputSchema).toBeDefined();
  });
});

test.each([
  ['missing txHash', { chainId: 84532 }, 'txHash'],
  ['malformed txHash', { txHash: '0x1234', chainId: 84532 }, 'txHash'],
  ['fractional chainId', { txHash, chainId: 84532.5 }, 'chainId'],
] as const)('SDK rejects %s before the Tool handler', async (_name, args, field) => {
  await withMcpClient(async (client) => {
    const result = await client.callTool({ name: 'diagnose_transaction', arguments: args });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain(field);
  });
});

test('unsupported chain is rejected before creating the RPC controller', async () => {
  await withMcpClient(async (client) => {
    const result = await client.callTool({
      name: 'diagnose_transaction',
      arguments: { txHash, chainId: 1 },
    });
    expect(result.isError).toBe(true);
    const payload = toolErrorSchema.parse(JSON.parse(firstText(result)));
    expect(payload.error.code).toBe('UNSUPPORTED_CHAIN');
    expect(payload.error.retryable).toBe(false);
  });
});
