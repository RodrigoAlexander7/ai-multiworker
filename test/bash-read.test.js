// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkReadTarget } from '../src/domain/bash-read.js';

const ADVISE = 300;

test('whole-file readers are caught, not just cat', () => {
  for (const command of ['cat big.js', 'type big.js', 'less big.js', 'more big.js']) {
    assert.equal(bulkReadTarget(command, ADVISE), 'big.js', command);
  }
});

test('a pipe means the output is filtered before anyone reads it', () => {
  assert.equal(bulkReadTarget('cat big.js | grep foo', ADVISE), null);
});

test('a redirect means the output never reaches the transcript', () => {
  assert.equal(bulkReadTarget('cat big.js > copy.js', ADVISE), null);
});

test('head and tail are capped by default, so they pass untouched', () => {
  assert.equal(bulkReadTarget('head big.js', ADVISE), null);
  assert.equal(bulkReadTarget('tail -20 big.js', ADVISE), null);
  assert.equal(bulkReadTarget('head -n 50 big.js', ADVISE), null);
});

test('an explicit count large enough to matter makes head a bulk read', () => {
  assert.equal(bulkReadTarget('head -500 big.js', ADVISE), 'big.js');
  assert.equal(bulkReadTarget('head -n 500 big.js', ADVISE), 'big.js');
  assert.equal(bulkReadTarget('tail --lines=900 big.js', ADVISE), 'big.js');
});

test('flags are skipped when picking out the path', () => {
  assert.equal(bulkReadTarget('cat -n big.js', ADVISE), 'big.js');
  assert.equal(bulkReadTarget('cat "with space.js"', ADVISE), 'with space.js');
});

test('commands that are not file dumps are left alone', () => {
  for (const command of ['git status', 'grep -r foo src', 'npm test', 'ls -la', 'echo cat']) {
    assert.equal(bulkReadTarget(command, ADVISE), null, command);
  }
});

test('the threshold governs what counts as an oversized explicit count', () => {
  assert.equal(bulkReadTarget('head -100 big.js', 50), 'big.js');
  assert.equal(bulkReadTarget('head -100 big.js', 800), null);
});
