import { expect, jest, test } from '@jest/globals';
import type { GetTxInformationUseCase } from '../src/usecase/GetTxInformationUseCase.ts';
import { GetTxInformationController } from '../src/controller/getTxInformation.ts';
import {
  TransactionConfigurationError,
  TransactionDataUnavailableError,
  UnsupportedTransactionChainError,
} from '../src/domain/TransactionErrors.ts';
import type { TransactionSnapshot } from '../src/domain/Transaction.ts';
import {
  InternalMcpError,
  RpcUnavailableError,
  UnsupportedChainError,
} from '../src/errors/McpErrors.ts';

const input = { txHash: `0x${'a'.repeat(64)}` as const, chainId: 84532 };
const snapshot: TransactionSnapshot = {
  availability: 'not_found',
  transaction: null,
  receipt: null,
  block: null,
  currentBlockNumber: 100n,
  eventLogs: [],
  limitations: [],
};

test('validates input before invoking the use case and returns its result', async () => {
  const execute = jest.fn<GetTxInformationUseCase['execute']>().mockResolvedValue(snapshot);
  const controller = new GetTxInformationController({ execute });
  await expect(controller.handle({ ...input, txHash: '0xabc' })).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  await expect(controller.handle(input)).resolves.toEqual(snapshot);
  expect(execute).toHaveBeenCalledWith(input);
});

test.each([
  [new TransactionDataUnavailableError(), RpcUnavailableError],
  [new UnsupportedTransactionChainError(), UnsupportedChainError],
  [new TransactionConfigurationError(), InternalMcpError],
  [new Error('secret-rpc-url'), InternalMcpError],
] as const)('maps application failures to existing tool errors', async (error, expected) => {
  const controller = new GetTxInformationController({
    execute: async () => {
      throw error;
    },
  });
  await expect(controller.handle(input)).rejects.toBeInstanceOf(expected);
  await expect(controller.handle(input)).rejects.not.toThrow('secret-rpc-url');
});
