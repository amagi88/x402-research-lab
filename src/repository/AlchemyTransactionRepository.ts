import { TransactionNotFoundError, TransactionReceiptNotFoundError } from 'viem';
import type { AlchemyClient, AlchemyRpc } from '../infrastracture/AlchemyClient.ts';
import type { Block, Hex, Receipt, Transaction } from '../domain/Transaction.ts';
import type { TransactionRepository } from '../domain/TransactionRepository.ts';
import { TransactionDataUnavailableError } from '../domain/TransactionErrors.ts';

export class AlchemyTransactionRepository implements TransactionRepository {
  private readonly client: Pick<AlchemyClient, 'getTransactionSnapshot' | 'getReceipt'>;
  private readonly rpc: Pick<AlchemyRpc, 'getChainId' | 'getBlock' | 'getBlockNumber'>;

  constructor(
    client: Pick<AlchemyClient, 'getTransactionSnapshot' | 'getReceipt'>,
    rpc: Pick<AlchemyRpc, 'getChainId' | 'getBlock' | 'getBlockNumber'>,
  ) {
    this.client = client;
    this.rpc = rpc;
  }

  async getChainId(): Promise<number> {
    try {
      return await this.rpc.getChainId();
    } catch {
      throw new TransactionDataUnavailableError();
    }
  }

  async getTransaction(hash: Hex): Promise<Transaction | null> {
    try {
      const {
        hash: txHash,
        from,
        to,
        input,
        value,
        gas,
        nonce,
        blockHash,
        blockNumber,
      } = await this.client.getTransactionSnapshot(hash);
      return {
        hash: txHash,
        from: from,
        to: to,
        input: input,
        value: value,
        gas: gas,
        nonce: nonce,
        blockHash: blockHash,
        blockNumber: blockNumber,
      };
    } catch (error) {
      if (error instanceof TransactionNotFoundError) return null;
      throw new TransactionDataUnavailableError();
    }
  }

  async getReceipt(hash: Hex): Promise<Receipt | null> {
    try {
      const { transactionHash, blockHash, blockNumber, status, gasUsed, effectiveGasPrice, logs } =
        await this.client.getReceipt(hash);
      return {
        transactionHash: transactionHash,
        blockHash: blockHash,
        blockNumber: blockNumber,
        status: status,
        gasUsed: gasUsed,
        effectiveGasPrice: effectiveGasPrice,
        logs: logs.map(({ address, topics, data, logIndex }) => ({
          address: address,
          topics: [...topics],
          data: data,
          logIndex: logIndex,
        })),
      };
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) return null;
      throw new TransactionDataUnavailableError();
    }
  }

  async getBlock(hash: Hex): Promise<Block> {
    try {
      const block = await this.rpc.getBlock({ blockHash: hash });
      if (block.hash === null || block.number === null) throw new TransactionDataUnavailableError();
      return { hash: block.hash, number: block.number, timestamp: block.timestamp };
    } catch {
      throw new TransactionDataUnavailableError();
    }
  }

  async getBlockNumber(): Promise<bigint> {
    try {
      return await this.rpc.getBlockNumber();
    } catch {
      throw new TransactionDataUnavailableError();
    }
  }
}
