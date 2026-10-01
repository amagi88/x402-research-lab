import { afterAll, afterEach, beforeAll, expect, test } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createGetTxInformationController } from '../src/composition/createGetTxInformationController.ts';
import { createDiagnosisServer } from '../src/diagnosisServer.ts';
import { diagnoseTransactionOutputSchema } from '../src/validator/diagnoseTransactionOutputSchema.ts';
import { toolErrorSchema } from '../src/validator/toolErrorSchema.ts';

const rpcUrl = 'https://base-sepolia.g.alchemy.com/v2/msw-test-key';
const txHash = `0x${'a'.repeat(64)}`;
const blockHash = `0x${'b'.repeat(64)}`;
const address = `0x${'1'.repeat(40)}`;
const transaction = {
  hash: txHash,
  from: address,
  to: address,
  input: '0x',
  value: '0x0',
  gas: '0x5208',
  gasPrice: '0x1',
  nonce: '0x1',
  blockHash,
  blockNumber: '0x64',
  transactionIndex: '0x0',
  type: '0x0',
  r: `0x${'0'.repeat(63)}1`,
  s: `0x${'0'.repeat(63)}1`,
  v: '0x1b',
};
const receipt = {
  transactionHash: txHash,
  blockHash,
  blockNumber: '0x64',
  from: address,
  to: address,
  contractAddress: null,
  cumulativeGasUsed: '0x5208',
  gasUsed: '0x5208',
  effectiveGasPrice: '0x1',
  logs: [],
  logsBloom: `0x${'0'.repeat(512)}`,
  status: '0x1',
  transactionIndex: '0x0',
  type: '0x0',
};
const block = {
  hash: blockHash,
  number: '0x64',
  timestamp: '0x7b',
  transactions: [txHash],
  uncles: [],
  baseFeePerGas: '0x1',
  difficulty: '0x0',
  extraData: '0x',
  gasLimit: '0x1c9c380',
  gasUsed: '0x5208',
  logsBloom: `0x${'0'.repeat(512)}`,
  miner: address,
  mixHash: blockHash,
  nonce: '0x0000000000000000',
  parentHash: blockHash,
  receiptsRoot: blockHash,
  sha3Uncles: blockHash,
  size: '0x1',
  stateRoot: blockHash,
  totalDifficulty: '0x0',
  transactionsRoot: blockHash,
};

type RpcBody = { jsonrpc: '2.0'; id: number; method: string; params?: unknown[] };
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockRpc(results: Record<string, unknown>) {
  const called: string[] = [];
  server.use(
    http.post(rpcUrl, async ({ request }) => {
      const body = (await request.json()) as RpcBody;
      called.push(body.method);
      const result = results[body.method];
      if (result === undefined) {
        return HttpResponse.json({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: 'Method not mocked' },
        });
      }
      return HttpResponse.json({ jsonrpc: '2.0', id: body.id, result });
    }),
  );
  return called;
}

async function callTool() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const diagnosisServer = createDiagnosisServer(() => createGetTxInformationController(rpcUrl));
  const client = new Client({ name: 'msw-integration-test', version: '1.0.0' });
  try {
    await diagnosisServer.connect(serverTransport);
    await client.connect(clientTransport);
    return await client.callTool({
      name: 'diagnose_transaction',
      arguments: { txHash, chainId: 84532 },
    });
  } finally {
    await Promise.allSettled([client.close(), diagnosisServer.close()]);
  }
}

function resultText(result: Awaited<ReturnType<Client['callTool']>>) {
  const content = CallToolResultSchema.parse(result).content[0];
  if (!content || content.type !== 'text') throw new Error('Expected text response');
  return content.text;
}

function responses(overrides: Record<string, unknown> = {}) {
  return {
    eth_chainId: '0x14a34',
    eth_getTransactionByHash: transaction,
    eth_getTransactionReceipt: receipt,
    eth_getBlockByHash: block,
    eth_blockNumber: '0x69',
    ...overrides,
  };
}

test.each([
  ['success', {}, 'success', 6],
  ['failed', { eth_getTransactionReceipt: { ...receipt, status: '0x0' } }, 'failed', 6],
  ['pending', { eth_getTransactionReceipt: null }, 'pending', 6],
  [
    'not found',
    { eth_getTransactionByHash: null, eth_getTransactionReceipt: null },
    'not_found',
    null,
  ],
] as const)(
  'MCP → real Repository → MSW JSON-RPC: %s',
  async (_name, overrides, expected, confirmations) => {
    const called = mockRpc(responses(overrides));
    const result = await callTool();
    expect(result.isError).not.toBe(true);
    const output = diagnoseTransactionOutputSchema.parse(JSON.parse(resultText(result)));
    expect(output.status).toBe(expected);
    expect(output.txHash).toBe(txHash);
    expect(output.confirmations).toBe(confirmations);
    expect(output.transfer).toBeNull();
    expect(called).toEqual(
      expect.arrayContaining([
        'eth_chainId',
        'eth_getTransactionByHash',
        'eth_getTransactionReceipt',
        'eth_blockNumber',
      ]),
    );
    if (expected === 'success') expect(output.limitations.join(' ')).toContain('Transfer Log');
    if (expected === 'failed')
      expect(output.failure).toEqual({ reason: null, confidence: 'unknown' });
  },
);

test('RPC error becomes RPC_UNAVAILABLE without reaching an external host', async () => {
  server.use(
    http.post(rpcUrl, async ({ request }) => {
      const body = (await request.json()) as RpcBody;
      if (body.method === 'eth_getTransactionByHash') {
        return HttpResponse.json({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32000, message: 'upstream unavailable' },
        });
      }
      return HttpResponse.json({
        jsonrpc: '2.0',
        id: body.id,
        result: responses()[body.method as keyof ReturnType<typeof responses>],
      });
    }),
  );
  const result = await callTool();
  expect(result.isError).toBe(true);
  expect(toolErrorSchema.parse(JSON.parse(resultText(result))).error.code).toBe('RPC_UNAVAILABLE');
});

test('optional block failures keep the receipt result', async () => {
  const called = mockRpc(responses({ eth_getBlockByHash: null }));
  const result = await callTool();
  const output = diagnoseTransactionOutputSchema.parse(JSON.parse(resultText(result)));
  expect(output.status).toBe('success');
  expect(output.confirmations).toBe(6);
  expect(output.limitations.join(' ')).toContain('対象Block');
  expect(called).toContain('eth_getBlockByHash');
});
