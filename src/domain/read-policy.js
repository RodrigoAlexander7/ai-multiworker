// @ts-check

/**
 * Delegation is not free: each worker call carries a fixed prompt overhead and
 * several seconds of latency. Below the advise threshold a direct read is
 * genuinely cheaper, so the policy stays quiet instead of nagging.
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  adviseLines: 300,
  blockLines: 800,
});

/** @typedef {'allow'|'advise'|'block'} ReadVerdict */

/**
 * @param {number} lineCount
 * @param {{ adviseLines?: number, blockLines?: number }} [thresholds]
 * @returns {ReadVerdict}
 */
export function judgeRead(lineCount, thresholds = {}) {
  const { adviseLines, blockLines } = { ...DEFAULT_THRESHOLDS, ...thresholds };
  if (lineCount >= blockLines) return 'block';
  if (lineCount >= adviseLines) return 'advise';
  return 'allow';
}
