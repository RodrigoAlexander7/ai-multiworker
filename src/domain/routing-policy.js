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
  // Mechanical filtering, no synthesis required.
  'search-digest': ['gemini-3.8-flash-low', 'gemini-3.7-flash-low', 'gemini-3.6-flash-low'],
  'log-analysis': ['gemini-3.8-flash-medium', 'gemini-3.7-flash-medium', 'gemini-3.6-flash-medium'],
  // Prose a human will read, and code that lands on disk: top tier.
  docs: ['gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-3.6-flash-high'],
  boilerplate: ['gemini-3.8-flash-high', 'gemini-3.1-pro-high', 'gemini-3.7-flash-high'],
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
