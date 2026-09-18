// @ts-check
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {{ file?: string }} [options]
 * @returns {import('../../application/ports.js').MetricsPort}
 */
export function createJsonlMetricsSink(options = {}) {
  const file = options.file ?? path.join(process.cwd(), '.multiworker', 'metrics.jsonl');

  return {
    async record(entry) {
      const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, `${line}\n`, 'utf8');
      } catch {
        // Metrics are observability, never a reason to fail a delegation.
      }
    },
  };
}
