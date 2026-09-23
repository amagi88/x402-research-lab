import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'diagnose_transaction', version: '1.0.0' });
  server.registerTool(
    'diagnose_transaction',
    {
      description: 'Diagnose a transaction on a specific chain.',
      inputSchema: z.object({ txHash: z.string(), chainId: z.number() }),
    },
    async ({ txHash, chainId }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ status: 'not_implemented', txHash, chainId }),
        },
      ],
    }),
  );
  return server;
});

const app = createMcpExpressApp();
const node = toNodeHandler(handler);
app.get('/health', (_req, res) => res.send('OK'));
app.all('/mcp', (req, res) => node(req, res, req.body));

app.listen(4021);
