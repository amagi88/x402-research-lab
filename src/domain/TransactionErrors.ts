export class TransactionDataUnavailableError extends Error {
  constructor() {
    super('Transaction data could not be retrieved or verified');
    this.name = 'TransactionDataUnavailableError';
  }
}

export class TransactionConfigurationError extends Error {
  constructor() {
    super('RPC endpoint is not configured for Base Sepolia');
    this.name = 'TransactionConfigurationError';
  }
}

export class UnsupportedTransactionChainError extends Error {
  constructor() {
    super('Only Base Sepolia is supported');
    this.name = 'UnsupportedTransactionChainError';
  }
}
