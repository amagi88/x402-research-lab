import type { TransactionSnapshot } from '../domain/Transaction.ts';
import {
  TransactionDataUnavailableError,
  UnsupportedTransactionChainError,
} from '../domain/TransactionErrors.ts';
import {
  InternalMcpError,
  RpcUnavailableError,
  UnsupportedChainError,
} from '../errors/McpErrors.ts';
import type { GetTxInformationUseCase } from '../usecase/GetTxInformationUseCase.ts';
import { diagnoseTransactionInputSchema } from '../validator/diagnoseTransactionInputSchema.ts';

export class GetTxInformationController {
  private readonly useCase: Pick<GetTxInformationUseCase, 'execute'>;

  constructor(useCase: Pick<GetTxInformationUseCase, 'execute'>) {
    this.useCase = useCase;
  }

  async handle(input: unknown): Promise<TransactionSnapshot> {
    const { txHash, chainId } = diagnoseTransactionInputSchema.parse(input);
    try {
      return await this.useCase.execute({ txHash: txHash as `0x${string}`, chainId });
    } catch (error) {
      if (error instanceof UnsupportedTransactionChainError) throw new UnsupportedChainError();
      if (error instanceof TransactionDataUnavailableError) throw new RpcUnavailableError();
      throw new InternalMcpError();
    }
  }
}
