import { McpServer } from '@modelcontextprotocol/server';
import { McpBaseError, UnsupportedChainError, toToolErrorResult } from './errors/McpErrors.ts';
import { diagnoseTransactionInputSchema } from './validator/diagnoseTransactionInputSchema.ts';

const toolName = 'diagnose_transaction';

export function createDiagnosisServer(): McpServer {
  const server = new McpServer({ name: toolName, version: '1.0.0' });

  server.registerTool(
    toolName,
    {
      description: 'Diagnose a transaction on a specific chain.',
      inputSchema: diagnoseTransactionInputSchema,
    },

    async ({ txHash, chainId }) => {
      try {
        if (chainId !== 84532) throw new UnsupportedChainError();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ status: 'not_implemented', txHash, chainId }),
            },
          ],
        };
      } catch (error) {
        if (!(error instanceof McpBaseError)) {
          console.error('Unexpected diagnose_transaction failure');
        }
        return toToolErrorResult(error);
      }
    },
  );

  return server;
}
