// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelChainFor, DEFAULT_CHAINS } from '../src/domain/routing-policy.js';
import { judgeRead } from '../src/domain/read-policy.js';
import { computeSavings, estimateTokens } from '../src/domain/savings.js';
import { resolveTask, TASK_IDS } from '../src/domain/tasks.js';
import { UnknownTaskError } from '../src/domain/errors.js';

test('routing sends mechanical filtering to a cheaper tier than trusted extraction', () => {
  assert.equal(modelChainFor('search-digest')[0], 'gemini-3.8-flash-low');
  assert.equal(modelChainFor('read')[0], 'gemini-3.8-flash-medium');
  assert.equal(modelChainFor('boilerplate')[0], 'gemini-3.8-flash-high');
});

test('every task chain has fallbacks so one unavailable model does not end the delegation', () => {
  for (const chain of Object.values(DEFAULT_CHAINS)) {
    assert.ok(chain.length > 1, `chain ${chain[0]} has no fallback`);
  }
});

test('routing overrides win over defaults, unknown tasks still resolve', () => {
  assert.deepEqual(modelChainFor('read', { read: ['custom-model'] }), ['custom-model']);
  assert.ok(modelChainFor('not-a-task').length > 0);
});

test('read policy is quiet below the advise threshold', () => {
  assert.equal(judgeRead(120), 'allow');
  assert.equal(judgeRead(299), 'allow');
  assert.equal(judgeRead(300), 'advise');
  assert.equal(judgeRead(799), 'advise');
  assert.equal(judgeRead(800), 'block');
});

test('read policy honours custom thresholds', () => {
  assert.equal(judgeRead(120, { adviseLines: 100, blockLines: 200 }), 'advise');
  assert.equal(judgeRead(250, { adviseLines: 100, blockLines: 200 }), 'block');
});

test('savings compare avoided material against the answer that replaces it', () => {
  const report = computeSavings('x'.repeat(4000), 'y'.repeat(400));
  assert.equal(report.avoidedTokens, 1000);
  assert.equal(report.spentTokens, 100);
  assert.equal(report.savedTokens, 900);
  assert.equal(report.savedRatio, 0.9);
});

test('savings stay defined when there was no material to avoid', () => {
  assert.equal(computeSavings('', 'answer').savedRatio, 0);
  assert.equal(estimateTokens(''), 0);
});

test('every task prompt forbids answering from outside the supplied sources', () => {
  for (const id of TASK_IDS) {
    const prompt = resolveTask(id).buildPrompt({
      instruction: 'find the retry budget',
      documents: [{ label: 'a.js', content: 'const RETRY = 1;' }],
    });
    assert.match(prompt, /NOT_IN_SOURCE|SPEC_AMBIGUOUS/);
    assert.match(prompt, /find the retry budget/);
    assert.match(prompt, /<source label="a\.js">/);
  }
});

test('unknown task names fail loudly with the valid options', () => {
  assert.throws(() => resolveTask('nope'), UnknownTaskError);
});
