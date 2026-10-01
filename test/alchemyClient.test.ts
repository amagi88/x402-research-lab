import { expect, test } from '@jest/globals';
import { AlchemyClient, createAlchemyClient } from '../src/infrastracture/AlchemyClient.ts';
import { UrlError } from '../src/errors/CommonErrors.ts';

test.each([
  '',
  'not-a-url',
  'http://base-sepolia.g.alchemy.com/v2/key',
  'https://base-sepolia.g.alchemy.com/v2/<API_KEY>',
  'https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY',
  'https://user:pass@base-sepolia.g.alchemy.com/v2/key',
])('rejects invalid RPC URL without exposing the value', (value) => {
  expect(() => createAlchemyClient(value)).toThrow(UrlError);
  expect(() => createAlchemyClient(value)).not.toThrow('base-sepolia.g.alchemy.com');
});

test('creates the completed client with explicit configuration without connecting', () => {
  expect(new AlchemyClient('https://base-sepolia.g.alchemy.com/v2/test-key')).toBeDefined();
});
