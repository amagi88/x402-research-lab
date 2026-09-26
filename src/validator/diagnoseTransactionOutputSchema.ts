import * as z from 'zod/v4';

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const amountRawSchema = z.string().regex(/^\d+$/);

const transferEntrySchema = z.object({
  from: addressSchema,
  to: addressSchema,
  amountRaw: amountRawSchema,
});

const commonSchema = z.object({
  schemaVersion: z.literal('1'),
  chainId: z.literal(84532),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  blockNumber: z.number().int().nonnegative().nullable(),
  confirmations: z.number().int().nonnegative().nullable(),
  transfer: z
    .object({
      method: z.enum(['transfer', 'transferFrom']),
      tokenAddress: addressSchema,
      symbol: z.string().nullable(),
      decimals: z.number().int().nonnegative().nullable(),
      intended: z.object({
        from: addressSchema.nullable(),
        to: addressSchema,
        amountRaw: amountRawSchema,
      }),
      observed: z.array(transferEntrySchema),
    })
    .nullable(),
  evidence: z.array(
    z.object({
      source: z.enum(['transaction', 'receipt', 'event_log', 'trace', 'simulation']),
      detail: z.string(),
    }),
  ),
  limitations: z.array(z.string()),
  recommendedActions: z.array(z.object({ action: z.string(), reason: z.string() })),
  explanations: z.object({ developer: z.string(), customer: z.string() }),
});

const failureSchema = z.object({
  reason: z.string().nullable(),
  confidence: z.enum(['confirmed', 'probable', 'unknown']),
});

const outcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['pending', 'success']), code: z.null(), failure: z.null() }),
  z.object({ status: z.literal('failed'), code: z.null(), failure: failureSchema }),
  z.object({
    status: z.literal('not_found'),
    code: z.literal('TRANSACTION_NOT_FOUND'),
    failure: z.null(),
  }),
  z.object({
    status: z.literal('unsupported'),
    code: z.literal('UNSUPPORTED_TRANSACTION_TYPE'),
    failure: z.null(),
  }),
  z.object({
    status: z.literal('indeterminate'),
    code: z.literal('DIAGNOSIS_INDETERMINATE'),
    failure: z.null(),
  }),
]);

export const diagnoseTransactionOutputSchema = z
  .intersection(commonSchema, outcomeSchema)
  .superRefine((result, ctx) => {
    if (result.status === 'not_found') {
      for (const field of ['blockNumber', 'confirmations', 'transfer'] as const) {
        if (result[field] !== null) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'not_foundの場合はnullを指定してください。',
          });
        }
      }
    }

    if (result.status === 'unsupported' && result.transfer !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['transfer'],
        message: 'unsupportedの場合はtransferをnullにしてください。',
      });
    }

    if (result.blockNumber === null && result.confirmations !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmations'],
        message: 'blockNumberが不明な場合はconfirmationsをnullにしてください。',
      });
    }

    if (result.status === 'failed') {
      if (result.failure.reason === null && result.failure.confidence !== 'unknown') {
        ctx.addIssue({
          code: 'custom',
          path: ['failure', 'confidence'],
          message: '原因が不明な場合はconfidenceをunknownにしてください。',
        });
      }
      if (result.failure.reason !== null && result.failure.reason.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['failure', 'reason'],
          message: '原因には具体的な文を指定してください。',
        });
      }
    }
  });

export type DiagnoseTransactionOutput = z.infer<typeof diagnoseTransactionOutputSchema>;
