#!/usr/bin/env node
// @ts-check
import path from 'node:path';
import { judgeRead } from '../../domain/read-policy.js';
import { resolveReadTarget } from '../../domain/read-target.js';
import { loadConfig } from '../../infrastructure/config/load-config.js';
import { countLines } from '../../infrastructure/fs/line-count.js';
import { createComplianceSink } from '../../infrastructure/metrics/compliance-sink.js';
import { readStdin } from '../cli/read-stdin.js';

/**
 * Delegating a file never calls the Read tool — the CLI reads it itself, from
 * inside a Node process the transcript never sees. So a completed Read (or a
 * bulk shell dump) on a file at or above the advisory threshold is, on its
 * own, proof the direct path was taken instead of delegation. No session
 * state or correlation with multiworker calls is needed to know that.
 *
 * A hook that throws would break every tool call, so failures are swallowed:
 * this is pure observability and must never affect what the tool call itself
 * did.
 */
async function main() {
  const payload = JSON.parse((await readStdin()) || '{}');
  const toolName = payload.tool_name;
  const toolInput = payload.tool_input ?? {};
  const cwd = payload.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  const target = resolveReadTarget(toolName, toolInput, config.thresholds.adviseLines);
  if (!target) return;

  if (config.exemptPaths.some((fragment) => target.includes(fragment))) return;

  const resolved = path.isAbsolute(target) ? target : path.join(cwd, target);
  const lines = await countLines(resolved);
  if (lines === null) return;

  const verdict = judgeRead(lines, config.thresholds);
  if (verdict === 'allow') return;

  await createComplianceSink().record({
    tool: toolName,
    target,
    lines,
    // 'block' here means the PreToolUse deny should have stopped this read
    // outright and evidently did not — a hook or config problem, not a
    // judgment call, and worth telling apart from an ignored suggestion.
    verdict: verdict === 'block' ? 'block-bypassed' : 'advise-ignored',
  });
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(0));
