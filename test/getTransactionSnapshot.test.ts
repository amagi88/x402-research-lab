import { expect, jest, test } from '@jest/globals';
import type { Hex as Hash, Transaction, Receipt } from '../src/domain/Transaction.ts';
import {
  TransactionDataUnavailableError,
  TransactionConfigurationError,
  UnsupportedTransactionChainError,
} from '../src/domain/TransactionErrors.ts';
import { GetTxInformationUseCase } from '../src/usecase/GetTxInformationUseCase.ts';
import type { TransactionRepository } from '../src/domain/TransactionRepository.ts';

function getTransactionSnapshot(repository: TransactionRepository, txHash: Hash) {
  return new GetTxInformationUseCase(repository).execute({ txHash, chainId: 84532 });
}

const hash = `0x${'a'.repeat(64)}` as Hash;
const blockHash = `0x${'b'.repeat(64)}` as Hash;
const address = `0x${'1'.repeat(40)}` as const;
const transaction: Transaction = {
  from: address,
  to: address,
  value: 9007199254740993n,
  gas: 21000n,
  nonce: 1,
  hash,
  blockHash,
  blockNumber: 100n,
  input: '0x',
};
const receipt: Receipt = {
  gasUsed: 21000n,
  effectiveGasPrice: 1n,
  transactionHash: hash,
  blockHash,
  blockNumber: 100n,
  status: 'success',
  logs: [{ address, topics: [hash], data: '0x1234', logIndex: 7 }],
};
const block = { hash: blockHash, number: 100n, timestamp: 123n };

function makeRpc(overrides: Partial<TransactionRepository> = {}): TransactionRepository {
  return {
    getChainId: async () => 84532,
    getTransaction: async () => transaction,
    getReceipt: async () => receipt,
    getBlock: async () => block,
    getBlockNumber: async () => 105n,
    ...overrides,
  };
}

test('gets transaction, receipt, block, head, and normalized event logs', async () => {
  const snapshot = await getTransactionSnapshot(makeRpc(), hash);
  expect(snapshot.availability).toBe('confirmed');
  expect(snapshot.transaction?.hash).toBe(hash);
  expect(snapshot.receipt?.transactionHash).toBe(hash);
  expect(snapshot.block?.number).toBe(100n);
  expect(snapshot.currentBlockNumber).toBe(105n);
  expect(snapshot.eventLogs).toEqual([{ address, topics: [hash], data: '0x1234', logIndex: 7 }]);
  expect(snapshot.eventLogs[0]).not.toBe(receipt.logs[0]);
  expect(snapshot.limitations).toEqual([]);
});

test('distinguishes a transaction without a receipt', async () => {
  const snapshot = await getTransactionSnapshot(
    makeRpc({
      getReceipt: async () => {
        return null;
      },
    }),
    hash,
  );
  expect(snapshot.availability).toBe('transaction_only');
  expect(snapshot.transaction).not.toBeNull();
  expect(snapshot.receipt).toBeNull();
  expect(snapshot.block).toBeNull();
  expect(snapshot.eventLogs).toEqual([]);
});

test('distinguishes two successful not-found responses', async () => {
  const snapshot = await getTransactionSnapshot(
    makeRpc({
      getTransaction: async (): Promise<Transaction | null> => {
        return null;
      },
      getReceipt: async () => {
        return null;
      },
    }),
    hash,
  );
  expect(snapshot.availability).toBe('not_found');
  expect(snapshot.transaction).toBeNull();
  expect(snapshot.receipt).toBeNull();
});

test.each([
  ['getTransaction', 'timeout'],
  ['getTransaction', '429 rate limit'],
  ['getReceipt', 'connection refused'],
] as const)('maps %s %s to RPC_UNAVAILABLE without leaking a URL', async (action, reason) => {
  const rpc = makeRpc({
    [action]: async () => {
      throw new Error(`${reason}: https://base-sepolia.g.alchemy.com/v2/private-test-key`);
    },
  });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(getTransactionSnapshot(rpc, hash)).rejects.toBeInstanceOf(
      TransactionDataUnavailableError,
    );
    await expect(getTransactionSnapshot(rpc, hash)).rejects.not.toThrow('private-test-key');
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

test.each([
  [
    'receipt without transaction',
    {
      getTransaction: async (): Promise<Transaction | null> => {
        return null;
      },
    },
  ],
  ['wrong transaction hash', { getTransaction: async () => ({ ...transaction, hash: blockHash }) }],
  ['wrong receipt hash', { getReceipt: async () => ({ ...receipt, transactionHash: blockHash }) }],
  ['different block number', { getReceipt: async () => ({ ...receipt, blockNumber: 99n }) }],
  ['different block hash', { getReceipt: async () => ({ ...receipt, blockHash: hash }) }],
] as const)('rejects inconsistent core data: %s', async (_name, overrides) => {
  await expect(getTransactionSnapshot(makeRpc(overrides), hash)).rejects.toBeInstanceOf(
    TransactionDataUnavailableError,
  );
});

test('keeps core data when block and head requests fail', async () => {
  const snapshot = await getTransactionSnapshot(
    makeRpc({
      getBlock: async () => {
        throw new Error('block unavailable');
      },
      getBlockNumber: async () => {
        throw new Error('head unavailable');
      },
    }),
    hash,
  );
  expect(snapshot.availability).toBe('confirmed');
  expect(snapshot.block).toBeNull();
  expect(snapshot.currentBlockNumber).toBeNull();
  expect(snapshot.limitations).toHaveLength(2);
});

test('rejects a block that does not match the receipt without losing the receipt', async () => {
  const snapshot = await getTransactionSnapshot(
    makeRpc({ getBlock: async () => ({ ...block, number: 99n }) }),
    hash,
  );
  expect(snapshot.receipt).not.toBeNull();
  expect(snapshot.block).toBeNull();
  expect(snapshot.limitations).toHaveLength(1);
});

test('rejects unsupported input chain before calling the repository', async () => {
  const getChainId = jest.fn(async () => 84532);
  await expect(
    new GetTxInformationUseCase(makeRpc({ getChainId })).execute({ txHash: hash, chainId: 1 }),
  ).rejects.toBeInstanceOf(UnsupportedTransactionChainError);
  expect(getChainId).not.toHaveBeenCalled();
});

test('rejects an endpoint on a different chain before fetching transactions', async () => {
  const getTransaction = jest.fn(async () => transaction);
  await expect(
    getTransactionSnapshot(makeRpc({ getChainId: async () => 1, getTransaction }), hash),
  ).rejects.toBeInstanceOf(TransactionConfigurationError);
  expect(getTransaction).not.toHaveBeenCalled();
});
