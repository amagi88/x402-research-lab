import * as z from 'zod/v4';

export const diagnoseTransactionInputSchema = z.object({
  txHash: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'txHashを指定してください。'
          : 'txHashは文字列で指定してください。',
    })
    .regex(/^0x[0-9a-fA-F]{64}$/, {
      error: 'txHashは0xで始まる64桁の16進数を指定してください。',
    })
    .describe('0xで始まる32バイトのトランザクションハッシュ'),
  chainId: z
    .number({
      error: (issue) =>
        issue.input === undefined
          ? 'chainIdを指定してください。'
          : 'chainIdは数値で指定してください。',
    })
    .int({ error: 'chainIdは整数で指定してください。' })
    .describe('Base SepoliaのchainIdは84532'),
});

export type DiagnoseTransactionInput = z.infer<typeof diagnoseTransactionInputSchema>;
