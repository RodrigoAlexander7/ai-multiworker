#!/usr/bin/env node
// @ts-check
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeRead } from '../../domain/read-policy.js';
import { resolveReadTarget } from '../../domain/read-target.js';
import { estimateTokens } from '../../domain/savings.js';
import { loadConfig } from '../../infrastructure/config/load-config.js';
import { readStdin } from '../cli/read-stdin.js';

const PLUGIN_ROOT =
  process.env.CLAUDE_PLUGIN_ROOT ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const CLI = path.join(PLUGIN_ROOT, 'src', 'interfaces', 'cli', 'main.js');

/** A hook that throws would break every tool call, so failures fall through to allow. */
async function main() {
  const payload = JSON.parse((await readStdin()) || '{}');
  const toolName = payload.tool_name;
  const toolInput = payload.tool_input ?? {};
  const cwd = payload.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  const target = resolveReadTarget(toolName, toolInput, config.thresholds.adviseLines);
  if (!target) return allow();

  if (config.exemptPaths.some((fragment) => target.includes(fragment))) return allow();

  const stat = await measure(target, cwd);
  if (!stat) return allow();

  const verdict = judgeRead(stat.lines, config.thresholds);
  if (verdict === 'allow') return allow();

  const suggestion = suggestionFor(target, stat);
  return verdict === 'block'
    ? deny(`${reason(target, stat)}\n\n${suggestion}`)
    : allow(`${reason(target, stat)} Consider delegating:\n${suggestion}`);
}

/** @param {string} target @param {string} cwd */
async function measure(target, cwd) {
  try {
    const resolved = path.isAbsolute(target) ? target : path.join(cwd, target);
    const raw = await readFile(resolved, 'utf8');
    return { lines: raw.split('\n').length, tokens: estimateTokens(raw) };
  } catch {
    return null;
  }
}

/** @param {string} target @param {{ lines: number, tokens: number }} stat */
function reason(target, stat) {
  return `Reading ${target} directly costs ~${stat.tokens} tokens (${stat.lines} lines).`;
}

/** @param {string} target @param {{ lines: number, tokens: number }} stat */
function suggestionFor(target, stat) {
  return [
    `  node "${CLI}" read -i "<the question you actually need answered>" -f "${target}"`,
    '',
    'A worker reads the file and returns only the answer, so the ~' +
      stat.tokens +
      ' tokens never enter this context.',
    'If you need the literal text to edit it, re-run Read with offset/limit for just the relevant slice.',
  ].join('\n');
}

/** @param {string} [context] */
function allow(context) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      ...(context ? { additionalContext: context } : {}),
    },
  };
}

/** @param {string} message */
function deny(message) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  };
}

main()
  .then((output) => {
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  })
  .catch(() => {
    process.stdout.write(JSON.stringify(allow()));
    process.exit(0);
  });
