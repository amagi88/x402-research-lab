import express from 'express';
const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', stage: 'scaffold', paymentsEnabled: false }));
app.get('/research', (_req, res) => {
  // TODO Week 1: x402 middleware and research resource.
  res.status(501).json({ error: 'Exercise not implemented', next: 'docs/ASSIGNMENT.md' });
});
app.listen(4021, '0.0.0.0', () => console.log('Research scaffold: http://localhost:4021'));
