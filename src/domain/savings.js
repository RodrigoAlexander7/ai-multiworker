// @ts-check

/**
 * Chars-per-token for source code and log text. Approximate on purpose: this
 * drives a savings report, never a routing or correctness decision.
 */
const CHARS_PER_TOKEN = 4;

/** @param {string} text */
export function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * @typedef {object} SavingsReport
 * @property {number} avoidedTokens Tokens the orchestrator would have ingested reading the raw material.
 * @property {number} spentTokens Tokens the worker's answer actually costs the orchestrator.
 * @property {number} savedTokens
 * @property {number} savedRatio 0..1
 */

/**
 * An answer delivered straight to disk is avoided output rather than spent
 * input: the orchestrator pays for neither the material nor the result, so it
 * counts on the avoided side instead of the spent one.
 *
 * @param {string} rawMaterial
 * @param {string} workerAnswer
 * @param {{ answerEntersContext?: boolean }} [options]
 * @returns {SavingsReport}
 */
export function computeSavings(rawMaterial, workerAnswer, options = {}) {
  const { answerEntersContext = true } = options;
  const answerTokens = estimateTokens(workerAnswer);

  const avoidedTokens = estimateTokens(rawMaterial) + (answerEntersContext ? 0 : answerTokens);
  const spentTokens = answerEntersContext ? answerTokens : 0;
  const savedTokens = avoidedTokens - spentTokens;
  const savedRatio = avoidedTokens === 0 ? 0 : savedTokens / avoidedTokens;

  return { avoidedTokens, spentTokens, savedTokens, savedRatio };
}
