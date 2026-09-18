#!/usr/bin/env node
// @ts-check
import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildApp } from '../../composition.js';
import { TASK_SPECS, TASK_IDS } from '../../domain/tasks.js';
import { MultiworkerError } from '../../domain/errors.js';
import { readStdin } from './read-stdin.js';
import { renderStats } from './stats.js';

const USAGE = `multiworker <task> --instruction "<what you need>" [options]

Tasks:
${TASK_SPECS.map((spec) => `  ${spec.id.padEnd(15)} ${spec.summary}`).join('\n')}
  stats           Show delegation savings recorded so far.

Options:
  --instruction, -i   What the worker must answer or produce (required).
  --file, -f          File to send (repeatable).
  --stdin             Read the material from stdin instead of files.
  --out, -o           Write the answer to this path instead of stdout.
  --model             Bypass the routing policy with an explicit model id.
  --json              Emit a machine-readable result.
`;

async function main() {
  const [task, ...rest] = process.argv.slice(2);

  if (!task || task === '--help' || task === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  if (task === 'stats') {
    process.stdout.write(await renderStats());
    return 0;
  }

  if (!TASK_IDS.includes(task)) {
    process.stderr.write(`Unknown task "${task}".\n\n${USAGE}`);
    return 2;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      instruction: { type: 'string', short: 'i' },
      file: { type: 'string', short: 'f', multiple: true },
      stdin: { type: 'boolean', default: false },
      out: { type: 'string', short: 'o' },
      model: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (!values.instruction) {
    process.stderr.write('Missing --instruction.\n\n' + USAGE);
    return 2;
  }

  const refs = values.file ?? [];
  const inlineContent = values.stdin ? await readStdin() : undefined;

  if (refs.length === 0 && !inlineContent && task !== 'boilerplate') {
    process.stderr.write('Nothing to delegate: pass --file or --stdin.\n');
    return 2;
  }

  const { delegateTask } = await buildApp();
  const result = await delegateTask({
    taskId: task,
    instruction: values.instruction,
    refs,
    inlineContent,
    model: values.model,
  });

  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (values.out) {
    const target = path.resolve(values.out);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, result.answer, 'utf8');
    process.stdout.write(`Wrote ${result.answer.length} chars to ${values.out}\n`);
  } else {
    process.stdout.write(`${result.answer}\n`);
  }

  process.stdout.write(`\n${footer(result)}\n`);
  return 0;
}

/** @param {import('../../application/delegate-task.js').DelegateResult} result */
function footer(result) {
  const pct = Math.round(result.savings.savedRatio * 100);
  return [
    `[multiworker] model=${result.model}`,
    `worker_tokens=${result.workerUsage.totalTokens}`,
    `avoided~${result.savings.avoidedTokens}`,
    `spent~${result.savings.spentTokens}`,
    `saved~${pct}%`,
  ].join(' ');
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (error instanceof MultiworkerError) {
      process.stderr.write(`[multiworker:${error.code}] ${error.message}\n`);
      process.exit(1);
    }
    process.stderr.write(`[multiworker] ${error?.stack ?? error}\n`);
    process.exit(1);
  });
