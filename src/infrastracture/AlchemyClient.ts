import { createPublicClient, http } from 'viem';
import type { Hash } from 'viem';
import { baseSepolia } from 'viem/chains';
import { validateRpcUrl } from '../utils/validateHttpsUrl.ts';

export function createAlchemyClient(rpcUrl: string) {
  validateRpcUrl(rpcUrl);
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl, {
      timeout: 10_000,
      retryCount: 1,
      retryDelay: 500,
    }),
  });
}

export type AlchemyRpc = ReturnType<typeof createAlchemyClient>;

export class AlchemyClient {
  private readonly client: AlchemyRpc;

  constructor(rpcUrl: string) {
    this.client = createAlchemyClient(rpcUrl);
  }

  async getTransactionSnapshot(hash: Hash) {
    return await this.client.getTransaction({ hash });
  }

  async getReceipt(hash: Hash) {
    return await this.client.getTransactionReceipt({ hash });
  }
}
