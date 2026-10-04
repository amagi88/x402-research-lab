import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { getLogContext, logger, withLogContext } from './logger.ts';

/** Observe terminal JSON-RPC results without buffering or modifying the delivered response. */
export function withMcpLogging(
  handler: Pick<McpHttpHandler, 'fetch'>,
): Pick<McpHttpHandler, 'fetch'> {
  return {
    async fetch(request, options) {
      const context = getLogContext();
      const started = performance.now();
      const response = await handler.fetch(request, options);
      if (!response.body) return response;
      const sse = response.headers.get('content-type')?.includes('text/event-stream');
      const json = response.headers.get('content-type')?.includes('application/json');
      if (!sse && !json) return response;
      const decoder = new TextDecoder();
      let buffer = '';
      let oversized = false;
      const observe = (text: string) => {
        withLogContext(context, () => {
          if (text.length > 1024 * 1024) {
            logger.warn('rpc.log_payload_too_large');
            return;
          }
          try {
            const message = JSON.parse(text);
            if (!message || typeof message !== 'object' || !('id' in message)) return;
            if (!('result' in message) && !('error' in message)) return;
            let errorCode: string | number | undefined;
            const failed = Boolean(message.error || message.result?.isError);
            if (message.error) errorCode = message.error.code;
            if (message.result?.isError) {
              // Extract only known application codes; never log returned text or arguments.
              for (const content of message.result.content ?? []) {
                if (content.type !== 'text') continue;
                try {
                  const code = JSON.parse(content.text)?.error?.code;
                  if (['UNSUPPORTED_CHAIN', 'RPC_UNAVAILABLE', 'INTERNAL_ERROR'].includes(code)) {
                    errorCode = code;
                    break;
                  }
                } catch {
                  /* SDK validation errors are plain text. */
                }
              }
            }
            const system =
              errorCode === 'RPC_UNAVAILABLE' ||
              errorCode === 'INTERNAL_ERROR' ||
              errorCode === -32603;
            const write = system ? logger.error : logger.info;
            write('rpc.completed', {
              result: system ? 'system_error' : failed ? 'business_error' : 'success',
              errorCode,
              rpcId: message.id,
              durationMs: Math.round(performance.now() - started),
            });
          } catch {
            /* Non-JSON SSE events have no RPC result. */
          }
        });
      };
      const consume = (chunk: string) => {
        buffer += chunk;
        if (sse) {
          let end: number;
          while ((end = buffer.search(/\r?\n\r?\n/)) !== -1) {
            const frame = buffer.slice(0, end);
            const separator = buffer.slice(end).match(/^\r?\n\r?\n/)![0].length;
            buffer = buffer.slice(end + separator);
            if (!oversized)
              observe(
                frame
                  .split(/\r?\n/)
                  .filter((line) => line.startsWith('data:'))
                  .map((line) => line.slice(5).trimStart())
                  .join('\n'),
              );
            oversized = false;
          }
        }
        // Logging must not retain unbounded streaming data.
        if (buffer.length > 1024 * 1024) {
          buffer = '';
          oversized = true;
          withLogContext(context, () => logger.warn('rpc.log_payload_too_large'));
        }
      };
      const stream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            consume(decoder.decode(chunk, { stream: true }));
            controller.enqueue(chunk);
          },
          flush() {
            consume(decoder.decode());
            if (json && !oversized) observe(buffer);
          },
        }),
      );
      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  };
}
