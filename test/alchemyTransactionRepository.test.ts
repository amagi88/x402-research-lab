import { expect, jest, test } from '@jest/globals';
import { TransactionNotFoundError, TransactionReceiptNotFoundError } from 'viem';
import type { AlchemyClient, AlchemyRpc } from '../src/infrastracture/AlchemyClient.ts';
import { AlchemyTransactionRepository } from '../src/repository/AlchemyTransactionRepository.ts';
import { TransactionDataUnavailableError } from '../src/domain/TransactionErrors.ts';

const hash = `0x${'a'.repeat(64)}` as const;
const blockHash = `0x${'b'.repeat(64)}` as const;
const address = `0x${'1'.repeat(40)}` as const;
const transaction = {
  hash,
  blockHash,
  blockNumber: 100n,
  from: address,
  to: address,
  input: '0x' as const,
  value: 9007199254740993n,
  gas: 21000n,
  nonce: 1,
  gasPrice: 1n,
  r: hash,
  s: hash,
  v: 27n,
  transactionIndex: 0,
  type: 'legacy' as const,
  typeHex: '0x0' as const,
};
const receipt = {
  l1GasPrice: null,
  l1GasUsed: null,
  l1Fee: null,
  l1FeeScalar: null,
  transactionHash: hash,
  blockHash,
  blockNumber: 100n,
  status: 'success' as const,
  gasUsed: 21000n,
  effectiveGasPrice: 1n,
  cumulativeGasUsed: 21000n,
  from: address,
  to: address,
  contractAddress: null,
  logsBloom: '0x' as const,
  transactionIndex: 0,
  type: 'legacy' as const,
  logs: [
    {
      address,
      topics: [hash] as [typeof hash],
      data: '0x1234' as const,
      logIndex: 7,
      blockHash,
      blockNumber: 100n,
      transactionHash: hash,
      transactionIndex: 0,
      removed: false,
    },
  ],
};

function fixture() {
  const client: Pick<AlchemyClient, 'getTransactionSnapshot' | 'getReceipt'> = {
    getTransactionSnapshot: jest.fn(async () => transaction),
    getReceipt: jest.fn(async () => receipt),
  };
  // These transport methods are not called in transaction/receipt tests.
  const rpc: Pick<AlchemyRpc, 'getChainId' | 'getBlock' | 'getBlockNumber'> = {
    getChainId: async () => 84532,
    getBlock: async () => {
      throw new Error('block unavailable');
    },
    getBlockNumber: async () => 105n,
  };
  return { client, rpc, repository: new AlchemyTransactionRepository(client, rpc) };
}

test('maps completed client methods to SDK-independent data without losing big integers', async () => {
  const { client, repository } = fixture();
  const tx = await repository.getTransaction(hash);
  const result = await repository.getReceipt(hash);
  expect(client.getTransactionSnapshot).toHaveBeenCalledWith(hash);
  expect(client.getReceipt).toHaveBeenCalledWith(hash);
  expect(tx?.value).toBe(9007199254740993n);
  expect(tx).not.toHaveProperty('r');
  expect(result?.logs).toEqual([{ address, topics: [hash], data: '0x1234', logIndex: 7 }]);
  expect(result?.logs[0]).not.toBe(receipt.logs[0]);
});

test('converts only the expected SDK not-found errors to null', async () => {
  const { client, repository } = fixture();
  client.getTransactionSnapshot = async () => {
    throw new TransactionNotFoundError({ hash });
  };
  client.getReceipt = async () => {
    throw new TransactionReceiptNotFoundError({ hash });
  };
  await expect(repository.getTransaction(hash)).resolves.toBeNull();
  await expect(repository.getReceipt(hash)).resolves.toBeNull();
});

test('sanitizes SDK failures at the repository boundary', async () => {
  const { client, rpc, repository } = fixture();
  const fail = async (): Promise<never> => {
    throw new Error('https://host/private-key');
  };
  client.getTransactionSnapshot = fail;
  client.getReceipt = fail;
  rpc.getChainId = fail;
  rpc.getBlock = fail;
  rpc.getBlockNumber = fail;
  for (const operation of [
    () => repository.getTransaction(hash),
    () => repository.getReceipt(hash),
    () => repository.getChainId(),
    () => repository.getBlock(hash),
    () => repository.getBlockNumber(),
  ]) {
    await expect(operation()).rejects.toBeInstanceOf(TransactionDataUnavailableError);
    await expect(operation()).rejects.not.toThrow('private-key');
  }
});
