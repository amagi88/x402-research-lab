import { GetTxInformationController } from '../controller/getTxInformation.ts';
import { AlchemyClient, createAlchemyClient } from '../infrastructure/AlchemyClient.ts';
import { AlchemyTransactionRepository } from '../repository/AlchemyTransactionRepository.ts';
import { GetTxInformationUseCase } from '../usecase/GetTxInformationUseCase.ts';

// 環境設定と具象クラスの組み立てを、この入口に集める。
export function createGetTxInformationController(
  rpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? '',
): GetTxInformationController {
  const repository = new AlchemyTransactionRepository(
    new AlchemyClient(rpcUrl),
    createAlchemyClient(rpcUrl),
  );
  const useCase = new GetTxInformationUseCase(repository);
  return new GetTxInformationController(useCase);
}
