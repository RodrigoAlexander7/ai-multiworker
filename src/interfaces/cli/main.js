#!/usr/bin/env node
// @ts-check
import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildApp } from '../../composition.js';
import { TASK_SPECS, TASK_IDS } from '../../domain/tasks.js';
import { MultiworkerError } from '../../domain/errors.js';
import { OUTPUT_COST_MULTIPLIER } from '../../domain/savings.js';
import { runDocsAudits } from '../../application/run-docs-audits.js';
import { readStdin } from './read-stdin.js';
import { renderStats } from './stats.js';
import { renderComplianceStats } from './compliance-stats.js';
import { renderDoctor } from './doctor.js';
import { CONFIG_FILENAME } from '../../infrastructure/config/load-config.js';

const USAGE = `multiworker <task> --instruction "<what you need>" [options]

Tasks:
${TASK_SPECS.map((spec) => `  ${spec.id.padEnd(15)} ${spec.summary}`).join('\n')}
  stats           Show delegation savings and missed advisories so far.
  doctor          Check the environment and print any missing setup.

Options:
  --instruction, -i   What the worker must answer or produce (required).
  --file, -f          File to send (repeatable).
  --stdin             Read the material from stdin instead of files.
  --out, -o           Write the answer to this path instead of stdout.
  --model             Bypass the routing policy with an explicit model id.
  --json              Emit a machine-readable result.
  --all               docs-audit only: run every pair configured under
                      "docsAudits" in ${CONFIG_FILENAME}, instead of -i/-f.
`;

async function main() {
  const [task, ...rest] = process.argv.slice(2);

  if (!task || task === '--help' || task === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  if (task === 'stats') {
    process.stdout.write(await renderStats());
    process.stdout.write(`\n${await renderComplianceStats()}\n`);
    return 0;
  }

  if (task === 'doctor') {
    process.stdout.write(await renderDoctor());
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
      all: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.all) {
    if (task !== 'docs-audit') {
      process.stderr.write('--all is only defined for docs-audit.\n');
      return 2;
    }
    return runAllDocsAudits(values.json === true);
  }

  if (!values.instruction) {
    process.stderr.write('Missing --instruction.\n\n' + USAGE);
    return 2;
  }

  const refs = values.file ?? [];
  const inlineContent = values.stdin ? await readStdin() : undefined;

  if (refs.length === 0 && !inlineContent) {
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
    answerEntersContext: !values.out,
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

  if (result.deniedActions.length > 0) {
    process.stderr.write(
      `\n[multiworker] Partial answer: the worker was denied ${result.deniedActions.join(', ')}.\n` +
        'Run "multiworker doctor" for the settings to add.\n',
    );
  }

  process.stdout.write(`\n${footer(result)}\n`);
  return 0;
}

/**
 * @param {boolean} json
 * @returns {Promise<number>}
 */
async function runAllDocsAudits(json) {
  const { delegateTask, config } = await buildApp();

  if (config.docsAudits.length === 0) {
    process.stderr.write(
      [
        `No "docsAudits" configured in ${CONFIG_FILENAME}. Add pairs, e.g.:`,
        '',
        '  {',
        '    "docsAudits": [',
        '      { "doc": "docs/api.md", "code": ["src/api/routes.py"], "focus": "endpoints and payloads" }',
        '    ]',
        '  }',
        '',
        'Each pair is one focused audit — the focus keeps the worker checking',
        'something specific instead of everything at once.',
      ].join('\n') + '\n',
    );
    return 2;
  }

  const results = await runDocsAudits(config.docsAudits, delegateTask);

  if (json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    for (const item of results) {
      process.stdout.write(`\n=== ${item.doc} — ${item.focus} ===\n`);
      process.stdout.write(item.error ? `ERROR: ${item.error}\n` : `${item.result?.answer}\n`);
    }
  }

  const failed = results.filter((item) => item.error).length;
  const clean = results.filter((item) => item.result?.answer.trim() === 'NO_DISCREPANCIES').length;

  process.stdout.write(
    `\n[multiworker] ${results.length} pair(s), ${clean} clean, ` +
      `${results.length - clean - failed} with findings, ${failed} failed\n`,
  );

  return failed === results.length ? 1 : 0;
}

/** @param {import('../../application/delegate-task.js').DelegateResult} result */
function footer(result) {
  const { avoidedInputTokens, avoidedOutputTokens, spentInputTokens, savedRatio } = result.savings;

  const avoided =
    avoidedOutputTokens > 0
      ? `avoided~${avoidedInputTokens}in+${avoidedOutputTokens}out`
      : `avoided~${avoidedInputTokens}in`;

  // With nothing avoided there is no baseline, and "0%" would read as a failure
  // rather than as an absent measurement.
  const saved =
    avoidedInputTokens === 0 && avoidedOutputTokens === 0
      ? 'saved~n/a'
      : `saved~${Math.round(savedRatio * 100)}%` +
        // Without this the percentage looks wrong against the raw counts, since
        // the avoided output is weighted before the ratio is taken.
        (avoidedOutputTokens > 0 ? ` (out@${OUTPUT_COST_MULTIPLIER}x)` : '');

  return [
    `[multiworker] model=${result.model}`,
    `worker_tokens=${result.workerUsage.totalTokens}`,
    // Tokens alone hide the other half of the trade: a delegation that saves
    // context but costs half a minute is a bad deal for interactive work.
    `took=${result.durationSeconds.toFixed(1)}s`,
    avoided,
    `spent~${spentInputTokens}in`,
    saved,
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
