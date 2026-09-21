// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReadTarget } from '../src/domain/read-target.js';

const ADVISE = 300;

test('a whole-file Read is a target', () => {
  assert.equal(resolveReadTarget('Read', { file_path: 'big.js' }, ADVISE), 'big.js');
});

test('a bounded Read (offset or limit) is not a target', () => {
  assert.equal(resolveReadTarget('Read', { file_path: 'big.js', offset: 10 }, ADVISE), null);
  assert.equal(resolveReadTarget('Read', { file_path: 'big.js', limit: 50 }, ADVISE), null);
});

test('Bash delegates to the same bulk-read detection PreToolUse uses', () => {
  assert.equal(resolveReadTarget('Bash', { command: 'cat big.js' }, ADVISE), 'big.js');
  assert.equal(resolveReadTarget('Bash', { command: 'cat big.js | grep x' }, ADVISE), null);
});

test('tools other than Read and Bash are never a target', () => {
  assert.equal(resolveReadTarget('Grep', { pattern: 'x' }, ADVISE), null);
  assert.equal(resolveReadTarget('Write', { file_path: 'out.js' }, ADVISE), null);
});
