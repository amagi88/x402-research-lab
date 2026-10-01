import { expect, test } from '@jest/globals';
import { createGetTxInformationController } from '../src/composition/createGetTxInformationController.ts';

const run = process.env.RUN_ALCHEMY_INTEGRATION === '1' ? test : test.skip;

run(
  'reads a known Base Sepolia transaction and receipt from Alchemy',
  async () => {
    const hash = process.env.BASE_SEPOLIA_TEST_TX_HASH;
    if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error('BASE_SEPOLIA_TEST_TX_HASH must be a 32-byte hex hash');
    }

    const controller = createGetTxInformationController();
    const snapshot = await controller.handle({ txHash: hash, chainId: 84532 });
    expect(snapshot.availability).toBe('confirmed');
    expect(snapshot.transaction?.hash.toLowerCase()).toBe(hash.toLowerCase());
    expect(snapshot.receipt?.transactionHash.toLowerCase()).toBe(hash.toLowerCase());
  },
  60_000,
);
