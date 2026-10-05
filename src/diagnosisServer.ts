import { McpServer } from '@modelcontextprotocol/server';
import type { GetTxInformationController } from './controller/getTxInformation.ts';
import { toDiagnosisOutput } from './controller/toDiagnosisOutput.ts';
import { UnsupportedChainError, toToolErrorResult } from './errors/McpErrors.ts';
import { diagnoseTransactionInputSchema } from './validator/diagnoseTransactionInputSchema.ts';

const toolName = 'diagnose_transaction';
type TransactionController = Pick<GetTxInformationController, 'handle'>;

export function createDiagnosisServer(createController: () => TransactionController): McpServer {
  const server = new McpServer({ name: toolName, version: '1.0.0' });
  let controller: TransactionController | undefined;

  server.registerTool(
    toolName,
    {
      description: 'Diagnose a transaction on Base Sepolia.',
      inputSchema: diagnoseTransactionInputSchema,
    },
    async ({ txHash, chainId }) => {
      try {
        if (chainId !== 84532) throw new UnsupportedChainError();
        controller ??= createController();
        const snapshot = await controller.handle({ txHash, chainId });
        const result = toDiagnosisOutput(txHash, snapshot);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  return server;
}
