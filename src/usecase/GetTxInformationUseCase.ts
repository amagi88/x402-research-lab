import type {
  Block,
  Hex,
  Receipt,
  Transaction,
  TransactionSnapshot,
} from '../domain/Transaction.ts';
import type { TransactionRepository } from '../domain/TransactionRepository.ts';
import {
  TransactionConfigurationError,
  TransactionDataUnavailableError,
  UnsupportedTransactionChainError,
} from '../domain/TransactionErrors.ts';

function sameHash(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export type GetTxInformationInput = { txHash: Hex; chainId: number };

export class GetTxInformationUseCase {
  private readonly repository: TransactionRepository;

  constructor(repository: TransactionRepository) {
    this.repository = repository;
  }

  async execute({ txHash: hash, chainId }: GetTxInformationInput): Promise<TransactionSnapshot> {
    if (chainId !== 84532) throw new UnsupportedTransactionChainError();
    if ((await this.repository.getChainId()) !== chainId) {
      throw new TransactionConfigurationError();
    }
    let transaction: Transaction | null;
    let receipt: Receipt | null;
    try {
      [transaction, receipt] = await Promise.all([
        this.repository.getTransaction(hash),
        this.repository.getReceipt(hash),
      ]);
    } catch {
      throw new TransactionDataUnavailableError();
    }

    if (
      (transaction && !sameHash(transaction.hash, hash)) ||
      (receipt && !sameHash(receipt.transactionHash, hash)) ||
      (!transaction && receipt) ||
      (transaction &&
        receipt &&
        (transaction.blockNumber !== receipt.blockNumber ||
          !transaction.blockHash ||
          !sameHash(transaction.blockHash, receipt.blockHash)))
    ) {
      throw new TransactionDataUnavailableError();
    }

    const limitations: string[] = [];
    let block: Block | null = null;
    let currentBlockNumber: bigint | null = null;

    const [blockResult, headResult] = await Promise.allSettled([
      receipt
        ? Promise.resolve().then(() => this.repository.getBlock(receipt.blockHash))
        : Promise.resolve(null),
      Promise.resolve().then(() => this.repository.getBlockNumber()),
    ]);

    if (receipt) {
      if (
        blockResult.status === 'fulfilled' &&
        blockResult.value &&
        blockResult.value.number === receipt.blockNumber &&
        blockResult.value.hash &&
        sameHash(blockResult.value.hash, receipt.blockHash)
      ) {
        block = blockResult.value;
      } else {
        limitations.push('対象Blockを取得・検証できませんでした。');
      }
    }

    if (headResult.status === 'fulfilled') {
      currentBlockNumber = headResult.value;
    } else {
      limitations.push('現在Block番号を取得できませんでした。');
    }

    return {
      availability: receipt ? 'confirmed' : transaction ? 'transaction_only' : 'not_found',
      transaction,
      receipt,
      block,
      currentBlockNumber,
      eventLogs: receipt
        ? receipt.logs.map((log) => ({
            address: log.address,
            topics: [...log.topics],
            data: log.data,
            logIndex: log.logIndex,
          }))
        : [],
      limitations,
    };
  }
}
