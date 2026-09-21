// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDocsAudits } from '../src/application/run-docs-audits.js';

/** @param {(instruction: string) => string | Error} respond */
function fakeDelegate(respond) {
  /** @type {string[]} */
  const seen = [];
  return {
    /** @param {import('../src/application/delegate-task.js').DelegateCommand} command */
    async run(command) {
      seen.push(command.instruction);
      const outcome = respond(command.instruction);
      if (outcome instanceof Error) throw outcome;
      return /** @type {import('../src/application/delegate-task.js').DelegateResult} */ ({
        answer: outcome,
      });
    },
    seen,
  };
}

test('each pair gets its own focused instruction, not one call over everything', async () => {
  const fake = fakeDelegate((instruction) => `answer for: ${instruction}`);
  const pairs = [
    { doc: 'a.md', code: ['a.js'], focus: 'focus A' },
    { doc: 'b.md', code: ['b.js'], focus: 'focus B' },
  ];

  const results = await runDocsAudits(pairs, fake.run);

  assert.deepEqual(fake.seen, ['focus A', 'focus B']);
  assert.equal(results[0].result?.answer, 'answer for: focus A');
  assert.equal(results[1].result?.answer, 'answer for: focus B');
});

test('a pair that fails is reported without stopping the rest', async () => {
  const fake = fakeDelegate((instruction) =>
    instruction === 'broken' ? new Error('ENOENT') : 'ok',
  );
  const pairs = [
    { doc: 'a.md', code: ['a.js'], focus: 'broken' },
    { doc: 'b.md', code: ['b.js'], focus: 'fine' },
  ];

  const results = await runDocsAudits(pairs, fake.run);

  assert.equal(results[0].error, 'ENOENT');
  assert.equal(results[0].result, undefined);
  assert.equal(results[1].result?.answer, 'ok');
  assert.equal(results[1].error, undefined);
});

test('an empty pair list runs nothing', async () => {
  const fake = fakeDelegate(() => 'unreachable');
  assert.deepEqual(await runDocsAudits([], fake.run), []);
  assert.deepEqual(fake.seen, []);
});
