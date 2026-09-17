// TODO Week 1: inspect 402, configure signer and x402 client, retry with payment.
const base = process.env.API_URL ?? 'http://localhost:4021';
const response = await fetch(`${base}/research`, { signal: AbortSignal.timeout(10000) });
console.log('HTTP status:', response.status);
console.log('Body:', await response.text());
console.log('Scaffold only: no signing or payment is performed.');
