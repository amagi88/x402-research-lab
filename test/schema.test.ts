import { expect, test } from '@jest/globals';
import {
  InternalMcpError,
  RpcUnavailableError,
  UnsupportedChainError,
  toToolErrorResult,
} from '../src/errors/McpErrors.ts';
import { diagnoseTransactionInputSchema } from '../src/validator/diagnoseTransactionInputSchema.ts';
import { diagnoseTransactionOutputSchema } from '../src/validator/diagnoseTransactionOutputSchema.ts';
import { toolErrorSchema } from '../src/validator/toolErrorSchema.ts';

const txHash = '0x' + 'a'.repeat(64);
const address = '0x' + '1'.repeat(40);

const commonResult = {
  schemaVersion: '1',
  chainId: 84532,
  txHash,
  blockNumber: null,
  confirmations: null,
  transfer: null,
  evidence: [],
  limitations: [],
  recommendedActions: [],
  explanations: { developer: '現時点の調査結果', customer: '現時点の調査結果' },
};

test('input schema accepts a valid hash and integer chainId', () => {
  expect(
    diagnoseTransactionInputSchema.safeParse({
      txHash: '0x' + 'A'.repeat(64),
      chainId: 84532,
    }).success,
  ).toBe(true);
  expect(diagnoseTransactionInputSchema.safeParse({ txHash, chainId: 1 }).success).toBe(true);
});

test.each([
  ['missing txHash', { chainId: 84532 }],
  ['null txHash', { txHash: null, chainId: 84532 }],
  ['short txHash', { txHash: '0x1234', chainId: 84532 }],
  ['non-hex txHash', { txHash: '0x' + 'g'.repeat(64), chainId: 84532 }],
  ['whitespace around txHash', { txHash: ' ' + txHash, chainId: 84532 }],
  ['missing chainId', { txHash }],
  ['string chainId', { txHash, chainId: '84532' }],
  ['fractional chainId', { txHash, chainId: 84532.5 }],
] as const)('input schema rejects %s', (_name, input) => {
  expect(diagnoseTransactionInputSchema.safeParse(input).success).toBe(false);
});

const outcomes = [
  { status: 'pending', code: null, failure: null },
  { status: 'success', code: null, failure: null },
  { status: 'failed', code: null, failure: { reason: null, confidence: 'unknown' } },
  { status: 'not_found', code: 'TRANSACTION_NOT_FOUND', failure: null },
  { status: 'unsupported', code: 'UNSUPPORTED_TRANSACTION_TYPE', failure: null },
  { status: 'indeterminate', code: 'DIAGNOSIS_INDETERMINATE', failure: null },
] as const;

test.each(outcomes)('output schema accepts $status', (outcome) => {
  expect(diagnoseTransactionOutputSchema.safeParse({ ...commonResult, ...outcome }).success).toBe(
    true,
  );
});

test('output schema accepts parsed transfer details and zero confirmations', () => {
  const result = diagnoseTransactionOutputSchema.safeParse({
    ...commonResult,
    status: 'success',
    code: null,
    failure: null,
    blockNumber: 0,
    confirmations: 0,
    transfer: {
      method: 'transfer',
      tokenAddress: address,
      symbol: null,
      decimals: 0,
      intended: { from: null, to: address, amountRaw: '0' },
      observed: [{ from: address, to: address, amountRaw: '0' }],
    },
    evidence: [{ source: 'receipt', detail: 'status=1' }],
    limitations: [],
    recommendedActions: [{ action: '確認する', reason: '根拠があるため' }],
  });
  expect(result.success).toBe(true);
});

test.each([
  [
    'mismatched result code',
    { status: 'not_found', code: 'UNSUPPORTED_TRANSACTION_TYPE', failure: null },
  ],
  ['missing result code', { status: 'not_found', code: null, failure: null }],
  ['code on a pending result', { status: 'pending', code: 'TRANSACTION_NOT_FOUND', failure: null }],
  ['missing failure on failed result', { status: 'failed', code: null, failure: null }],
  [
    'failure on a successful result',
    { status: 'success', code: null, failure: { reason: null, confidence: 'unknown' } },
  ],
  ['omitted nullable field', { status: 'pending', code: null, failure: null, transfer: undefined }],
] as const)('output schema rejects %s', (_name, change) => {
  expect(diagnoseTransactionOutputSchema.safeParse({ ...commonResult, ...change }).success).toBe(
    false,
  );
});

test('output schema rejects invalid chain, address, and amount', () => {
  const valid = {
    ...commonResult,
    status: 'success',
    code: null,
    failure: null,
    transfer: {
      method: 'transfer',
      tokenAddress: address,
      symbol: null,
      decimals: null,
      intended: { from: address, to: address, amountRaw: '1' },
      observed: [],
    },
  };
  expect(diagnoseTransactionOutputSchema.safeParse({ ...valid, chainId: 1 }).success).toBe(false);
  expect(
    diagnoseTransactionOutputSchema.safeParse({
      ...valid,
      transfer: { ...valid.transfer, tokenAddress: '0x1234' },
    }).success,
  ).toBe(false);
  expect(
    diagnoseTransactionOutputSchema.safeParse({
      ...valid,
      transfer: {
        ...valid.transfer,
        intended: { ...valid.transfer.intended, amountRaw: '1.5' },
      },
    }).success,
  ).toBe(false);
});

const transferDetails = {
  method: 'transfer',
  tokenAddress: address,
  symbol: null,
  decimals: null,
  intended: { from: address, to: address, amountRaw: '1' },
  observed: [],
};

test.each([
  {
    name: 'not_found with a block number',
    result: { status: 'not_found', code: 'TRANSACTION_NOT_FOUND', failure: null, blockNumber: 1 },
    path: ['blockNumber'],
  },
  {
    name: 'not_found with confirmations',
    result: {
      status: 'not_found',
      code: 'TRANSACTION_NOT_FOUND',
      failure: null,
      blockNumber: 1,
      confirmations: 1,
    },
    path: ['confirmations'],
  },
  {
    name: 'not_found with transfer details',
    result: {
      status: 'not_found',
      code: 'TRANSACTION_NOT_FOUND',
      failure: null,
      transfer: transferDetails,
    },
    path: ['transfer'],
  },
  {
    name: 'unsupported with transfer details',
    result: {
      status: 'unsupported',
      code: 'UNSUPPORTED_TRANSACTION_TYPE',
      failure: null,
      transfer: transferDetails,
    },
    path: ['transfer'],
  },
  {
    name: 'confirmations without a block number',
    result: { status: 'success', code: null, failure: null, confirmations: 1 },
    path: ['confirmations'],
  },
  {
    name: 'confirmed cause without a reason',
    result: {
      status: 'failed',
      code: null,
      failure: { reason: null, confidence: 'confirmed' },
    },
    path: ['failure', 'confidence'],
  },
  {
    name: 'probable cause without a reason',
    result: {
      status: 'failed',
      code: null,
      failure: { reason: null, confidence: 'probable' },
    },
    path: ['failure', 'confidence'],
  },
  {
    name: 'blank failure reason',
    result: {
      status: 'failed',
      code: null,
      failure: { reason: '  ', confidence: 'confirmed' },
    },
    path: ['failure', 'reason'],
  },
] as const)('output schema rejects $name', ({ result, path }) => {
  const parsed = diagnoseTransactionOutputSchema.safeParse({ ...commonResult, ...result });
  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: [...path] }));
  }
});

test.each([
  {
    name: 'known block without confirmations',
    result: { status: 'success', code: null, failure: null, blockNumber: 1 },
  },
  {
    name: 'pending with a known block',
    result: { status: 'pending', code: null, failure: null, blockNumber: 1 },
  },
  {
    name: 'confirmed cause with a reason',
    result: {
      status: 'failed',
      code: null,
      failure: { reason: 'revert dataで原因を確認', confidence: 'confirmed' },
    },
  },
  {
    name: 'probable cause with a reason',
    result: {
      status: 'failed',
      code: null,
      failure: { reason: '再現結果から推定', confidence: 'probable' },
    },
  },
] as const)('output schema accepts $name', ({ result }) => {
  expect(diagnoseTransactionOutputSchema.safeParse({ ...commonResult, ...result }).success).toBe(
    true,
  );
});

test.each([
  { error: new UnsupportedChainError(), code: 'UNSUPPORTED_CHAIN', retryable: false },
  { error: new RpcUnavailableError(), code: 'RPC_UNAVAILABLE', retryable: true },
  { error: new InternalMcpError(), code: 'INTERNAL_ERROR', retryable: false },
] as const)(
  'Tool error schema accepts $code with its retryable value',
  ({ error, code, retryable }) => {
    const result = error.toToolResult();
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    const payload: unknown = JSON.parse(result.content[0].text);
    expect(toolErrorSchema.safeParse(payload).success).toBe(true);
    expect(diagnoseTransactionOutputSchema.safeParse(payload).success).toBe(false);
    const parsed = toolErrorSchema.parse(payload);
    expect(parsed.error.code).toBe(code);
    expect(parsed.error.retryable).toBe(retryable);
  },
);

test('Tool error schema rejects wrong retryable, code, and schema version', () => {
  const payload = new RpcUnavailableError().toPayload();
  expect(
    toolErrorSchema.safeParse({
      ...payload,
      error: { ...payload.error, retryable: false },
    }).success,
  ).toBe(false);
  expect(
    toolErrorSchema.safeParse({
      ...payload,
      error: { ...payload.error, code: 'TRANSACTION_NOT_FOUND' },
    }).success,
  ).toBe(false);
  expect(toolErrorSchema.safeParse({ ...payload, schemaVersion: '2' }).success).toBe(false);
});

test.each([
  { error: new UnsupportedChainError(), retryable: true },
  { error: new InternalMcpError(), retryable: true },
] as const)(
  'Tool error schema rejects incorrect retryable for $error.code',
  ({ error, retryable }) => {
    const payload = error.toPayload();
    expect(
      toolErrorSchema.safeParse({
        ...payload,
        error: { ...payload.error, retryable },
      }).success,
    ).toBe(false);
  },
);

test('unexpected errors become INTERNAL_ERROR without exposing the original message', () => {
  const result = toToolErrorResult(new Error('secret payment signature'));
  const payload = toolErrorSchema.parse(JSON.parse(result.content[0].text));
  expect(payload.error.code).toBe('INTERNAL_ERROR');
  expect(result.content[0].text).not.toContain('secret payment signature');
});
