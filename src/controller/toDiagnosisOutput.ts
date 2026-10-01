import type { TransactionSnapshot } from '../domain/Transaction.ts';
import type { DiagnoseTransactionOutput } from '../validator/diagnoseTransactionOutputSchema.ts';
import { diagnoseTransactionOutputSchema } from '../validator/diagnoseTransactionOutputSchema.ts';

function safeBlockNumber(value: bigint | null): number | null {
  if (value === null || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

export function toDiagnosisOutput(
  txHash: string,
  snapshot: TransactionSnapshot,
): DiagnoseTransactionOutput {
  const blockNumber =
    snapshot.availability === 'not_found'
      ? null
      : safeBlockNumber(snapshot.receipt?.blockNumber ?? snapshot.transaction?.blockNumber ?? null);
  const confirmations =
    blockNumber !== null &&
    snapshot.currentBlockNumber !== null &&
    snapshot.currentBlockNumber >= BigInt(blockNumber)
      ? safeBlockNumber(snapshot.currentBlockNumber - BigInt(blockNumber) + 1n)
      : null;
  const limitations = [...snapshot.limitations];
  const evidence: DiagnoseTransactionOutput['evidence'] = [];
  if (snapshot.transaction) {
    evidence.push({ source: 'transaction', detail: 'Transactionを取得しました。' });
  }
  if (snapshot.receipt) {
    evidence.push({ source: 'receipt', detail: `実行結果: ${snapshot.receipt.status}` });
  }

  const common = {
    schemaVersion: '1' as const,
    chainId: 84532 as const,
    txHash,
    blockNumber,
    confirmations,
    transfer: null,
    evidence,
    limitations,
    recommendedActions: [] as { action: string; reason: string }[],
    explanations: { developer: '', customer: '' },
  };

  if (snapshot.availability === 'not_found') {
    limitations.push('照会時点でTransactionとReceiptを確認できませんでした。');
    return diagnoseTransactionOutputSchema.parse({
      ...common,
      blockNumber: null,
      confirmations: null,
      status: 'not_found',
      code: 'TRANSACTION_NOT_FOUND',
      failure: null,
      recommendedActions: [
        {
          action: 'chainIdとtxHashを確認して再照会する',
          reason: 'RPCへの反映前の可能性があります。',
        },
      ],
      explanations: {
        developer: '照会時点でTransactionとReceiptは見つかりませんでした。',
        customer: '取引をまだ確認できません。取引番号を確認し、時間を置いて再確認してください。',
      },
    });
  }

  if (snapshot.availability === 'transaction_only') {
    limitations.push('Receiptがないため実行の成功・失敗を判定できません。');
    return diagnoseTransactionOutputSchema.parse({
      ...common,
      status: 'pending',
      code: null,
      failure: null,
      recommendedActions: [
        { action: '同じtxHashを後で再確認する', reason: 'Receiptの取得を待つ必要があります。' },
      ],
      explanations: {
        developer: 'Transactionは取得しましたが、Receiptは未取得です。',
        customer: '取引の処理結果はまだ分かりません。重複送金を避け、後で確認してください。',
      },
    });
  }

  if (snapshot.receipt?.status === 'success') {
    limitations.push('ERC-20 Transfer Logを解析していないため、実際のトークン移動は未確認です。');
    return diagnoseTransactionOutputSchema.parse({
      ...common,
      status: 'success',
      code: null,
      failure: null,
      explanations: {
        developer: 'ReceiptでTransactionの実行成功を確認しました。トークン移動は未解析です。',
        customer: '取引の実行は成功しました。トークンの移動はまだ確認できていません。',
      },
    });
  }

  limitations.push('revert dataを解析していないため失敗原因は特定できません。');
  return diagnoseTransactionOutputSchema.parse({
    ...common,
    status: 'failed',
    code: null,
    failure: { reason: null, confidence: 'unknown' },
    recommendedActions: [
      { action: '失敗原因を調査する', reason: 'Receiptだけでは原因を特定できません。' },
    ],
    explanations: {
      developer: 'ReceiptでTransactionの実行失敗を確認しました。原因は未解析です。',
      customer: '取引は失敗しました。原因はまだ特定できていません。',
    },
  });
}
