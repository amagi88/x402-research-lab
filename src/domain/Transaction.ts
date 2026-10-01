export type Hex = `0x${string}`;

export type Transaction = {
  hash: Hex;
  from: Hex;
  to: Hex | null;
  input: Hex;
  value: bigint;
  gas: bigint;
  nonce: number;
  blockHash: Hex | null;
  blockNumber: bigint | null;
};

export type EventLog = {
  address: Hex;
  topics: readonly Hex[];
  data: Hex;
  logIndex: number;
};

export type Receipt = {
  transactionHash: Hex;
  blockHash: Hex;
  blockNumber: bigint;
  status: 'success' | 'reverted';
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: EventLog[];
};

export type Block = { hash: Hex; number: bigint; timestamp: bigint };

export type TransactionSnapshot = {
  availability: 'confirmed' | 'transaction_only' | 'not_found';
  transaction: Transaction | null;
  receipt: Receipt | null;
  block: Block | null;
  currentBlockNumber: bigint | null;
  eventLogs: EventLog[];
  limitations: string[];
};
