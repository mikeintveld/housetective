import test from 'node:test';
import assert from 'node:assert';

process.env.OPENAI_API_KEY = 'test';
const { default: handler, coerceResult } = await import('./verify.js');

// Test coerceResult fallback values

test('coerceResult provides fallback red_flags and recommendation', () => {
  const result = coerceResult(null);
  assert.deepStrictEqual(result.red_flags, []);
  assert.strictEqual(typeof result.recommendation, 'string');
});

// Test coerceResult uses provided fields

test('coerceResult uses provided red_flags and recommendation', () => {
  const input = {
    score: 10,
    verdict: 'scam',
    top_signals: [],
    advice: [],
    notes: '',
    explanation: '',
    red_flags: [
      { text: 'Suspicious email', severity: 'high' },
      { text: 'No photos', severity: 'medium' }
    ],
    recommendation: 'Avoid listing'
  };
  const result = coerceResult(input);
  assert.strictEqual(result.red_flags.length, 2);
  assert.deepStrictEqual(result.red_flags[0], { text: 'Suspicious email', severity: 'high' });
  assert.strictEqual(result.recommendation, 'Avoid listing');
});

// Test handler fallback outputs fields

test('handler returns red_flags and recommendation in fallback', async () => {
  const req = { method: 'POST', body: JSON.stringify({ url: 'http://127.0.0.1:1' }) };
  const res = {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.red_flags));
  assert.strictEqual(typeof res.body.recommendation, 'string');
});
