import type { Block, Hex, Receipt, Transaction } from './Transaction.ts';

// UseCaseが必要とするデータ取得の契約。通信方法やSDKの型を持ち込まない。
export interface TransactionRepository {
  getChainId(): Promise<number>;
  getTransaction(hash: Hex): Promise<Transaction | null>;
  getReceipt(hash: Hex): Promise<Receipt | null>;
  getBlock(hash: Hex): Promise<Block>;
  getBlockNumber(): Promise<bigint>;
}
