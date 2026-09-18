// @ts-check
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT_COST_MULTIPLIER } from '../../domain/savings.js';

/** @param {string} [file] */
export async function renderStats(file) {
  const target = file ?? path.join(process.cwd(), '.multiworker', 'metrics.jsonl');

  let raw = '';
  try {
    raw = await readFile(target, 'utf8');
  } catch {
    return 'No delegations recorded yet.\n';
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

  if (records.length === 0) return 'No delegations recorded yet.\n';

  /** @type {Map<string, { count: number, avoidedIn: number, avoidedOut: number, spentIn: number, workerTokens: number }>} */
  const byTask = new Map();
  let legacy = 0;

  for (const record of records) {
    const savings = record.savings ?? {};
    // Records written before the input/output split carry no comparable figures.
    if (savings.avoidedInputTokens === undefined) {
      legacy += 1;
      continue;
    }

    const current = byTask.get(record.taskId) ?? {
      count: 0,
      avoidedIn: 0,
      avoidedOut: 0,
      spentIn: 0,
      workerTokens: 0,
    };
    current.count += 1;
    current.avoidedIn += savings.avoidedInputTokens ?? 0;
    current.avoidedOut += savings.avoidedOutputTokens ?? 0;
    current.spentIn += savings.spentInputTokens ?? 0;
    current.workerTokens += record.workerUsage?.totalTokens ?? 0;
    byTask.set(record.taskId, current);
  }

  if (byTask.size === 0) {
    return `No delegations recorded since the savings format changed (${legacy} older entries ignored).\n`;
  }

  const totals = [...byTask.values()].reduce(
    (acc, item) => ({
      count: acc.count + item.count,
      avoidedIn: acc.avoidedIn + item.avoidedIn,
      avoidedOut: acc.avoidedOut + item.avoidedOut,
      spentIn: acc.spentIn + item.spentIn,
      workerTokens: acc.workerTokens + item.workerTokens,
    }),
    { count: 0, avoidedIn: 0, avoidedOut: 0, spentIn: 0, workerTokens: 0 },
  );

  const lines = [
    `Delegations: ${totals.count}`,
    '',
    `Avoided input  (never read)    ~${totals.avoidedIn}`,
    `Avoided output (never written) ~${totals.avoidedOut}  billed at ${OUTPUT_COST_MULTIPLIER}x`,
    `Spent input    (answers read)  ~${totals.spentIn}`,
    '',
    `Net saved: ~${cost(totals) - totals.spentIn} input-token equivalents (${pct(totals)})`,
    `Worker tokens consumed: ${totals.workerTokens}`,
    '',
    'By task:',
  ];

  for (const [taskId, item] of byTask) {
    lines.push(`  ${taskId.padEnd(15)} n=${String(item.count).padEnd(4)} saved=${pct(item)}`);
  }

  if (legacy > 0) {
    lines.push('', `(${legacy} entries predate the input/output split and were ignored.)`);
  }

  return `${lines.join('\n')}\n`;
}

/** @param {{ avoidedIn: number, avoidedOut: number }} item */
function cost(item) {
  return item.avoidedIn + item.avoidedOut * OUTPUT_COST_MULTIPLIER;
}

/** @param {{ avoidedIn: number, avoidedOut: number, spentIn: number }} item */
function pct(item) {
  const avoided = cost(item);
  if (avoided === 0) return 'n/a';
  return `${Math.round(((avoided - item.spentIn) / avoided) * 100)}%`;
}
