import type { CallToolResult } from '@modelcontextprotocol/server';

import { TOOL_ERROR_SCHEMA_VERSION } from '../validator/toolErrorSchema.ts';
import type {
  ToolErrorCode,
  ToolErrorDetail,
  ToolErrorPayload,
} from '../validator/toolErrorSchema.ts';

export { TOOL_ERROR_SCHEMA_VERSION } from '../validator/toolErrorSchema.ts';
export type {
  ToolErrorCode,
  ToolErrorDetail,
  ToolErrorDetailReason,
  ToolErrorPayload,
} from '../validator/toolErrorSchema.ts';

export type ToolErrorResult = CallToolResult & {
  isError: true;
  content: [{ type: 'text'; text: string }];
};

export abstract class McpBaseError extends Error {
  readonly code: ToolErrorCode;
  readonly retryable: boolean;
  readonly details?: ToolErrorDetail[];

  protected constructor(
    code: ToolErrorCode,
    message: string,
    retryable: boolean,
    details?: readonly ToolErrorDetail[],
  ) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.details = details ? [...details] : undefined;
  }

  toPayload(): ToolErrorPayload {
    return {
      schemaVersion: TOOL_ERROR_SCHEMA_VERSION,
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.details === undefined ? {} : { details: [...this.details] }),
      },
    };
  }

  toToolResult(): ToolErrorResult {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(this.toPayload()) }],
    };
  }
}

export class UnsupportedChainError extends McpBaseError {
  constructor() {
    super('UNSUPPORTED_CHAIN', 'Base SepoliaのchainId（84532）を指定してください。', false, [
      { field: 'chainId', reason: 'unsupported_value' },
    ]);
  }
}

export class RpcUnavailableError extends McpBaseError {
  constructor() {
    super(
      'RPC_UNAVAILABLE',
      'RPCの復旧後に再確認してください。支払い済みか不明な場合は、先に決済状態を確認してください。',
      true,
    );
  }
}

export class InternalMcpError extends McpBaseError {
  constructor() {
    super(
      'INTERNAL_ERROR',
      '診断結果を生成できませんでした。運営側での調査と決済状態の確認が必要です。',
      false,
    );
  }
}

export function toToolErrorResult(error: unknown): ToolErrorResult {
  return (error instanceof McpBaseError ? error : new InternalMcpError()).toToolResult();
}
