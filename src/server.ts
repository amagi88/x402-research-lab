import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createDiagnosisServer } from './diagnosisServer.ts';

const handler = createMcpHandler(() => createDiagnosisServer());
const app = createMcpExpressApp();
const node = toNodeHandler(handler);

app.get('/health', (_req, res) => res.send('OK'));
app.all('/mcp', (req, res) => node(req, res, req.body));

app.listen(4021, () => {
  console.log('Server is running on port 4021');
});
