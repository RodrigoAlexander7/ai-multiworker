// @ts-check
import { bulkReadTarget } from './bash-read.js';

/**
 * The file a completed or about-to-run tool call reads in bulk, or null when
 * it does not. Shared by PreToolUse (which decides whether to intercept) and
 * PostToolUse (which checks what actually happened) so the two can never
 * silently diverge on what counts as a bulk read.
 *
 * @param {string} toolName
 * @param {Record<string, any>} toolInput
 * @param {number} adviseLines
 * @returns {string | null}
 */
export function resolveReadTarget(toolName, toolInput, adviseLines) {
  if (toolName === 'Read') {
    // A bounded slice is already cheap; the caller knows what they want.
    if (toolInput.offset != null || toolInput.limit != null) return null;
    return toolInput.file_path ?? null;
  }

  if (toolName !== 'Bash') return null;
  return bulkReadTarget(String(toolInput.command ?? ''), adviseLines);
}
