// @ts-check
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {object} ComplianceRecord
 * @property {string} tool 'Read' or 'Bash'.
 * @property {string} target File that was read directly instead of delegated.
 * @property {number} lines
 * @property {'advise-ignored'|'block-bypassed'} verdict `block-bypassed` means
 *   the PreToolUse deny did not fire — config drift or a hook failure, not a
 *   judgment call, and worth noticing on its own.
 */

/**
 * A separate file from delegation metrics: this tracks the opposite failure
 * mode — reads that should have been delegated and were not — and mixing the
 * two would make neither easy to reason about.
 *
 * @param {{ file?: string }} [options]
 */
export function createComplianceSink(options = {}) {
  const file = options.file ?? path.join(process.cwd(), '.multiworker', 'compliance.jsonl');

  return {
    /** @param {ComplianceRecord} record */
    async record(record) {
      const line = JSON.stringify({ at: new Date().toISOString(), ...record });
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, `${line}\n`, 'utf8');
      } catch {
        // This is observability, never a reason to fail the read it is watching.
      }
    },
  };
}
