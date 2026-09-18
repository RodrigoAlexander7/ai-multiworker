// @ts-check

/**
 * Model chains are ordered by preference. The tail exists because the provider
 * returns transient 503s on individual model versions while others stay up,
 * so a failed call retries on an older sibling instead of falling back to the
 * orchestrator doing the work itself.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const DEFAULT_CHAINS = Object.freeze({
  // Extraction the orchestrator will trust without re-reading: accuracy over speed.
  read: ['gemini-3.8-flash-medium', 'gemini-3.7-flash-medium', 'gemini-3.6-flash-medium'],
  'log-analysis': ['gemini-3.8-flash-medium', 'gemini-3.7-flash-medium', 'gemini-3.6-flash-medium'],
  // Cross-checking prose against code is precision work: a sloppy auditor that
  // reports absences as contradictions produces noise nobody will read twice.
  'docs-audit': ['gemini-3.8-flash-high', 'gemini-3.1-pro-high', 'gemini-3.7-flash-high'],
});

const FALLBACK_CHAIN = Object.freeze(['gemini-3.8-flash-medium']);

/**
 * @param {string} taskId
 * @param {Record<string, readonly string[]>} [overrides]
 * @returns {readonly string[]}
 */
export function modelChainFor(taskId, overrides = {}) {
  const chain = overrides[taskId] ?? DEFAULT_CHAINS[taskId] ?? FALLBACK_CHAIN;
  if (chain.length === 0) throw new Error(`Model chain for "${taskId}" is empty`);
  return chain;
}

export { DEFAULT_CHAINS };
