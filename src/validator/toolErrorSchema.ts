import * as z from 'zod/v4';

export const TOOL_ERROR_SCHEMA_VERSION = '1' as const;

export const toolErrorSchema = z
  .object({
    schemaVersion: z.literal(TOOL_ERROR_SCHEMA_VERSION),
    error: z.object({
      code: z.enum(['UNSUPPORTED_CHAIN', 'RPC_UNAVAILABLE', 'INTERNAL_ERROR']),
      message: z.string(),
      retryable: z.boolean(),
      details: z
        .array(
          z.object({
            field: z.string(),
            reason: z.literal('unsupported_value'),
          }),
        )
        .optional(),
    }),
  })
  .refine(({ error }) => error.retryable === (error.code === 'RPC_UNAVAILABLE'), {
    message: 'retryableはエラーコードに対応する値を指定してください。',
  });

export type ToolErrorPayload = z.infer<typeof toolErrorSchema>;
export type ToolErrorCode = ToolErrorPayload['error']['code'];
export type ToolErrorDetail = NonNullable<ToolErrorPayload['error']['details']>[number];
export type ToolErrorDetailReason = ToolErrorDetail['reason'];
