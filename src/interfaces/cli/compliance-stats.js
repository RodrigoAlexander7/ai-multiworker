// @ts-check
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** @param {string} [file] */
export async function renderComplianceStats(file) {
  const target = file ?? path.join(process.cwd(), '.multiworker', 'compliance.jsonl');

  let raw = '';
  try {
    raw = await readFile(target, 'utf8');
  } catch {
    return [
      'Compliance: no missed advisories recorded.',
      '(Either every large read was delegated, or the PostToolUse hook is not wired up.)',
    ].join('\n');
  }

  const records = raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

  if (records.length === 0) {
    return 'Compliance: no missed advisories recorded.';
  }

  const bypassed = records.filter((r) => r.verdict === 'block-bypassed');
  const ignored = records.filter((r) => r.verdict === 'advise-ignored');

  const lines = [
    `Compliance: ${records.length} large read(s) went direct instead of being delegated.`,
    `  advised and ignored: ${ignored.length}`,
    `  block bypassed:      ${bypassed.length}${bypassed.length > 0 ? '  (deny did not fire — check the PreToolUse hook and thresholds)' : ''}`,
  ];

  const worst = [...records].sort((a, b) => (b.lines ?? 0) - (a.lines ?? 0)).slice(0, 5);
  if (worst.length > 0) {
    lines.push('', 'Worst offenders:');
    for (const r of worst) {
      lines.push(`  ${String(r.lines ?? '?').padStart(5)} lines  ${r.target} (${r.tool})`);
    }
  }

  return lines.join('\n');
}
