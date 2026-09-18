// @ts-check
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

  /** @type {Map<string, { count: number, avoided: number, spent: number, workerTokens: number }>} */
  const byTask = new Map();
  for (const record of records) {
    const current = byTask.get(record.taskId) ?? { count: 0, avoided: 0, spent: 0, workerTokens: 0 };
    current.count += 1;
    current.avoided += record.savings?.avoidedTokens ?? 0;
    current.spent += record.savings?.spentTokens ?? 0;
    current.workerTokens += record.workerUsage?.totalTokens ?? 0;
    byTask.set(record.taskId, current);
  }

  const totals = [...byTask.values()].reduce(
    (acc, item) => ({
      count: acc.count + item.count,
      avoided: acc.avoided + item.avoided,
      spent: acc.spent + item.spent,
      workerTokens: acc.workerTokens + item.workerTokens,
    }),
    { count: 0, avoided: 0, spent: 0, workerTokens: 0 },
  );

  const lines = [
    `Delegations: ${totals.count}`,
    `Orchestrator tokens avoided: ~${totals.avoided}`,
    `Orchestrator tokens spent on answers: ~${totals.spent}`,
    `Net saved: ~${totals.avoided - totals.spent} (${pct(totals.avoided, totals.spent)})`,
    `Worker tokens consumed: ${totals.workerTokens}`,
    '',
    'By task:',
  ];

  for (const [taskId, item] of byTask) {
    lines.push(
      `  ${taskId.padEnd(15)} n=${String(item.count).padEnd(4)} saved=${pct(item.avoided, item.spent)}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

/** @param {number} avoided @param {number} spent */
function pct(avoided, spent) {
  if (avoided === 0) return 'n/a';
  return `${Math.round(((avoided - spent) / avoided) * 100)}%`;
}
