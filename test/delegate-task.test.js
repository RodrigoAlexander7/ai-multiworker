// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDelegateTask } from '../src/application/delegate-task.js';
import {
  InputTooLargeError,
  WorkerFailedError,
  WorkerPermissionError,
} from '../src/domain/errors.js';

/** @param {(model: string) => string | Error} respond */
function fakeWorker(respond) {
  /** @type {string[]} */
  const calls = [];
  /** @type {import('../src/application/ports.js').WorkerPort} */
  const worker = {
    async run({ model }) {
      calls.push(model);
      const outcome = respond(model);
      if (outcome instanceof Error) throw outcome;
      return {
        text: outcome,
        model,
        durationSeconds: 0.1,
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      };
    },
  };
  return { worker, calls };
}

/**
 * @param {Record<string, string>} files
 * @returns {import('../src/application/ports.js').ContentSourcePort}
 */
function fakeContentSource(files) {
  return {
    async load(refs) {
      return refs.map((ref) => ({ label: ref, content: files[ref] ?? '' }));
    },
  };
}

test('delegation returns the worker answer with a savings report', async () => {
  const { worker } = fakeWorker(() => 'handler47, value 8137');
  const delegate = createDelegateTask({
    worker,
    contentSource: fakeContentSource({ 'big.js': 'x'.repeat(8000) }),
  });

  const result = await delegate({
    taskId: 'read',
    instruction: 'find the retry budget',
    refs: ['big.js'],
  });

  assert.equal(result.answer, 'handler47, value 8137');
  assert.equal(result.attempts, 1);
  assert.equal(result.savings.avoidedInputTokens, 2000);
  assert.ok(result.savings.savedRatio > 0.9);
});

test('a failing model falls through to the next in the chain', async () => {
  const { worker, calls } = fakeWorker((model) =>
    model === 'gemini-3.8-flash-medium' ? new Error('503 UNAVAILABLE') : 'answer',
  );
  const delegate = createDelegateTask({ worker, contentSource: fakeContentSource({ 'a.js': 'code' }) });

  const result = await delegate({ taskId: 'read', instruction: 'q', refs: ['a.js'] });

  assert.equal(result.answer, 'answer');
  assert.equal(result.attempts, 2);
  assert.equal(calls[0], 'gemini-3.8-flash-medium');
  assert.equal(calls[1], 'gemini-3.7-flash-medium');
});

test('exhausting the chain reports every model that failed', async () => {
  const { worker, calls } = fakeWorker(() => new Error('503 UNAVAILABLE'));
  const delegate = createDelegateTask({ worker, contentSource: fakeContentSource({ 'a.js': 'code' }) });

  await assert.rejects(
    () => delegate({ taskId: 'read', instruction: 'q', refs: ['a.js'] }),
    (error) => {
      assert.ok(error instanceof WorkerFailedError);
      assert.equal(error.attempts, 3);
      assert.match(error.message, /gemini-3\.8-flash-medium.*gemini-3\.6-flash-medium/s);
      return true;
    },
  );
  assert.equal(calls.length, 3);
});

test('an explicit model bypasses the chain entirely', async () => {
  const { worker, calls } = fakeWorker(() => 'answer');
  const delegate = createDelegateTask({ worker, contentSource: fakeContentSource({ 'a.js': 'code' }) });

  await delegate({ taskId: 'read', instruction: 'q', refs: ['a.js'], model: 'gpt-oss-120b-medium' });

  assert.deepEqual(calls, ['gpt-oss-120b-medium']);
});

test('oversized material is refused before a worker is ever spawned', async () => {
  const { worker, calls } = fakeWorker(() => 'answer');
  const delegate = createDelegateTask({
    worker,
    contentSource: fakeContentSource({ 'a.js': 'x'.repeat(500) }),
    maxInputChars: 100,
  });

  await assert.rejects(
    () => delegate({ taskId: 'read', instruction: 'q', refs: ['a.js'] }),
    InputTooLargeError,
  );
  assert.equal(calls.length, 0);
});

test('metrics record the model that actually answered, not the one first tried', async () => {
  const { worker } = fakeWorker((model) =>
    model === 'gemini-3.8-flash-medium' ? new Error('down') : 'answer',
  );
  /** @type {any[]} */
  const recorded = [];
  const delegate = createDelegateTask({
    worker,
    contentSource: fakeContentSource({ 'a.js': 'code' }),
    metrics: { async record(entry) { recorded.push(entry); } },
  });

  await delegate({ taskId: 'read', instruction: 'q', refs: ['a.js'] });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].model, 'gemini-3.7-flash-medium');
  assert.equal(recorded[0].attempts, 2);
  assert.equal(recorded[0].workerUsage.totalTokens, 12);
});

test('a denied permission fails immediately instead of burning the fallback chain', async () => {
  const { worker, calls } = fakeWorker(() => new WorkerPermissionError(['command']));
  const delegate = createDelegateTask({ worker, contentSource: fakeContentSource({ 'a.js': 'code' }) });

  await assert.rejects(
    () => delegate({ taskId: 'read', instruction: 'q', refs: ['a.js'] }),
    WorkerPermissionError,
  );
  assert.equal(calls.length, 1, 'every sibling model would be denied identically');
});

test('an answer delivered to disk reports full savings', async () => {
  const { worker } = fakeWorker(() => 'a long digest of the sources');
  const delegate = createDelegateTask({
    worker,
    contentSource: fakeContentSource({ 'a.js': 'code' }),
  });

  const result = await delegate({
    taskId: 'read',
    instruction: 'summarise',
    refs: ['a.js'],
    answerEntersContext: false,
  });

  assert.equal(result.savings.spentInputTokens, 0);
  assert.ok(result.savings.avoidedOutputTokens > 0);
  assert.equal(result.savings.savedRatio, 1);
});

test('inline content bypasses the content source for piped material', async () => {
  const { worker } = fakeWorker(() => 'two tests failed');
  const delegate = createDelegateTask({
    worker,
    contentSource: {
      async load() {
        throw new Error('content source must not be used for inline content');
      },
    },
  });

  const result = await delegate({
    taskId: 'log-analysis',
    instruction: 'which tests failed',
    inlineContent: 'FAIL suite.test.js',
  });

  assert.equal(result.answer, 'two tests failed');
});
