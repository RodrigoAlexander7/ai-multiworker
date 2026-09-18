// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelChainFor, DEFAULT_CHAINS } from '../src/domain/routing-policy.js';
import { judgeRead } from '../src/domain/read-policy.js';
import { computeSavings, estimateTokens, OUTPUT_COST_MULTIPLIER } from '../src/domain/savings.js';
import { resolveTask, TASK_IDS } from '../src/domain/tasks.js';
import { UnknownTaskError } from '../src/domain/errors.js';

test('auditing runs on a higher tier than plain extraction', () => {
  assert.equal(modelChainFor('read')[0], 'gemini-3.8-flash-medium');
  assert.equal(modelChainFor('log-analysis')[0], 'gemini-3.8-flash-medium');
  assert.equal(modelChainFor('docs-audit')[0], 'gemini-3.8-flash-high');
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

test('material the worker read is counted as avoided input', () => {
  const report = computeSavings({
    rawMaterial: 'x'.repeat(4000),
    contextBound: 'y'.repeat(400),
  });

  assert.equal(report.avoidedInputTokens, 1000);
  assert.equal(report.avoidedOutputTokens, 0);
  assert.equal(report.spentInputTokens, 100);
  assert.equal(report.savedCost, 900);
  assert.equal(report.savedRatio, 0.9);
});

test('savings stay defined when there was no material to avoid', () => {
  assert.equal(computeSavings({ rawMaterial: '', contextBound: 'answer' }).savedRatio, 0);
  assert.equal(estimateTokens(''), 0);
});

test('text written to disk is avoided output, weighted at the output rate', () => {
  const report = computeSavings({
    rawMaterial: '',
    contextBound: '',
    diskBound: 'z'.repeat(800),
  });

  assert.equal(report.avoidedOutputTokens, 200);
  assert.equal(report.spentInputTokens, 0);
  assert.equal(report.savedCost, 200 * OUTPUT_COST_MULTIPLIER);
  assert.equal(report.savedRatio, 1);
});

test('avoided output is worth more than the same count of avoided input', () => {
  const asInput = computeSavings({ rawMaterial: 'q'.repeat(4000), contextBound: '' });
  const asOutput = computeSavings({ rawMaterial: '', contextBound: '', diskBound: 'q'.repeat(4000) });

  assert.equal(asInput.savedCost * OUTPUT_COST_MULTIPLIER, asOutput.savedCost);
});

test('a split answer bills only the notes, never the code that went to disk', () => {
  const report = computeSavings({
    rawMaterial: 'm'.repeat(2000),
    contextBound: 'n'.repeat(200),
    diskBound: 'c'.repeat(4000),
  });

  assert.equal(report.avoidedInputTokens, 500);
  assert.equal(report.avoidedOutputTokens, 1000);
  assert.equal(report.spentInputTokens, 50);
  assert.equal(report.savedCost, 500 + 1000 * OUTPUT_COST_MULTIPLIER - 50);
});

test('every task prompt gives the worker a way to report a gap instead of inventing one', () => {
  for (const id of TASK_IDS) {
    const prompt = resolveTask(id).buildPrompt({
      instruction: 'find the retry budget',
      documents: [{ label: 'a.js', content: 'const RETRY = 1;' }],
    });
    assert.match(prompt, /NOT_IN_SOURCE|NO_DISCREPANCIES/);
    assert.match(prompt, /find the retry budget/);
    assert.match(prompt, /<source label="a\.js">/);
  }
});

test('the catalogue holds only the tasks that proved themselves in use', () => {
  assert.deepEqual([...TASK_IDS], ['read', 'log-analysis', 'docs-audit']);
});

test('every task tells the worker it has no tools', () => {
  for (const id of TASK_IDS) {
    const prompt = resolveTask(id).buildPrompt({
      instruction: 'anything',
      documents: [{ label: 'a.js', content: 'code' }],
    });
    assert.match(prompt, /You have no tools/, `${id} may reach for a denied tool`);
  }
});

test('the docs auditor is told that an uncovered claim is not a finding', () => {
  const prompt = resolveTask('docs-audit').buildPrompt({
    instruction: 'check the install steps',
    documents: [{ label: 'README.md', content: '# Docs' }],
  });

  assert.match(prompt, /absence is not contradiction/);
  assert.match(prompt, /Never propose rewrites/);
  assert.match(prompt, /NO_DISCREPANCIES/);
});


test('unknown task names fail loudly with the valid options', () => {
  assert.throws(() => resolveTask('nope'), UnknownTaskError);
});
