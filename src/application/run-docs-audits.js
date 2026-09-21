// @ts-check

/**
 * @typedef {object} DocsAuditPairResult
 * @property {string} doc
 * @property {string} focus
 * @property {import('./delegate-task.js').DelegateResult} [result] Present on success.
 * @property {string} [error] Present on failure. This pair failing does not stop the batch.
 */

/**
 * Runs one focused docs-audit per configured pair, each with its own document,
 * code and instruction, rather than one call over everything at once. A single
 * call spanning the whole project loses the focus that makes docs-audit
 * precise — the worker needs to know what to check, not just what exists.
 *
 * Sequential, not parallel: each pair costs a real worker call, and running
 * them one at a time keeps output ordered and avoids firing a burst of
 * concurrent requests at the provider for what is, in practice, an infrequent
 * command.
 *
 * @param {readonly import('../infrastructure/config/load-config.js').DocsAuditPair[]} pairs
 * @param {(command: import('./delegate-task.js').DelegateCommand) => Promise<import('./delegate-task.js').DelegateResult>} delegateTask
 * @returns {Promise<DocsAuditPairResult[]>}
 */
export async function runDocsAudits(pairs, delegateTask) {
  /** @type {DocsAuditPairResult[]} */
  const results = [];

  for (const pair of pairs) {
    try {
      const result = await delegateTask({
        taskId: 'docs-audit',
        instruction: pair.focus,
        refs: [pair.doc, ...pair.code],
      });
      results.push({ doc: pair.doc, focus: pair.focus, result });
    } catch (error) {
      results.push({
        doc: pair.doc,
        focus: pair.focus,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
