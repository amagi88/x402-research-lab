import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createDiagnosisServer } from '../diagnosisServer.ts';
import { getLogContext, setLogCustomerId, validateLogLevel } from '../utils/logging/logger.ts';
import { requestLogging, httpErrorHandler } from '../utils/logging/http.ts';
import { withMcpLogging } from '../utils/logging/mcp.ts';

export function createApp(createServer = createDiagnosisServer) {
  validateLogLevel();
  const app = express();
  app.disable('x-powered-by');
  // Trust explicit proxy addresses/subnets, never arbitrary forwarded headers.
  app.set('trust proxy', process.env.TRUST_PROXY?.trim() || false);
  app.use(requestLogging);
  const handler = createMcpHandler(({ authInfo }) => {
    if (authInfo?.clientId) setLogCustomerId(authInfo.clientId);
    return createServer();
  });
  const node = toNodeHandler(withMcpLogging(handler));
  const mcpApp = createMcpExpressApp({
    allowedHosts: process.env.MCP_ALLOWED_HOSTS?.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  });
  mcpApp.get('/health', (_req, res) => res.send('OK'));
  mcpApp.all('/mcp', (req, res) => {
    const method = typeof req.body?.method === 'string' ? req.body.method.slice(0, 128) : null;
    const tool =
      method === 'tools/call' && typeof req.body?.params?.name === 'string'
        ? req.body.params.name.slice(0, 128)
        : null;
    getLogContext().api = method ? (tool ? `${method}:${tool}` : method) : `${req.method} /mcp`;
    return node(req, res, req.body);
  });
  app.use(mcpApp);
  app.use(httpErrorHandler);
  return { app, close: () => handler.close() };
}
