// @ts-check

/**
 * Chars-per-token for source code and log text. Approximate on purpose: this
 * drives a savings report, never a routing or correctness decision.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Output tokens are billed at roughly five times input tokens. Avoiding a token
 * the orchestrator would have *written* is therefore worth about five times
 * avoiding one it would have *read*, and a report that counts them alike
 * understates exactly the delegations that pay off most.
 */
export const OUTPUT_COST_MULTIPLIER = 5;

/** @param {string} text */
export function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * @typedef {object} SavingsReport
 * @property {number} avoidedInputTokens Material the orchestrator never had to read.
 * @property {number} avoidedOutputTokens Text the orchestrator never had to write.
 * @property {number} spentInputTokens What actually reached its context.
 * @property {number} savedCost Net saving in input-token equivalents.
 * @property {number} savedRatio 0..1, cost-weighted.
 */

/**
 * Splits the ledger by where each piece of text ended up, and by which kind of
 * token it would otherwise have been. Material the worker read would have been
 * input; output delivered straight to disk would have been generated, so it
 * counts at the output rate.
 *
 * @param {object} flow
 * @param {string} flow.rawMaterial Source text the worker consumed instead of the orchestrator.
 * @param {string} flow.contextBound Text that reaches the orchestrator.
 * @param {string} [flow.diskBound] Text written straight to disk, bypassing the orchestrator.
 * @returns {SavingsReport}
 */
export function computeSavings({ rawMaterial, contextBound, diskBound = '' }) {
  const avoidedInputTokens = estimateTokens(rawMaterial);
  const avoidedOutputTokens = estimateTokens(diskBound);
  const spentInputTokens = estimateTokens(contextBound);

  const avoidedCost = avoidedInputTokens + avoidedOutputTokens * OUTPUT_COST_MULTIPLIER;
  const savedCost = avoidedCost - spentInputTokens;
  const savedRatio = avoidedCost === 0 ? 0 : savedCost / avoidedCost;

  return {
    avoidedInputTokens,
    avoidedOutputTokens,
    spentInputTokens,
    savedCost,
    savedRatio,
  };
}
