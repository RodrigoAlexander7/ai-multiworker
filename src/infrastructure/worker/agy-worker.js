// @ts-check
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { WorkerFailedError, WorkerPermissionError } from '../../domain/errors.js';

/**
 * Node's spawn does not apply PATHEXT resolution unless a shell is used, and a
 * shell would expose delegated file content to the command line. Naming the
 * executable explicitly keeps `shell: false`.
 */
function defaultBinary() {
  return process.env.AGY_BIN ?? (process.platform === 'win32' ? 'agy.exe' : 'agy');
}

/**
 * @param {{ binary?: string, cwd?: string }} [options]
 * @returns {import('../../application/ports.js').WorkerPort}
 */
export function createAgyWorker(options = {}) {
  const binary = options.binary ?? defaultBinary();
  const cwd = options.cwd ?? process.cwd();

  return {
    async run({ prompt, model, timeoutMs }) {
      const args = [
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--model',
        model,
        // Delegated material is untrusted text; without this a file whose line
        // starts with "/" could be expanded as a slash command by the worker.
        '--disable-slash-commands',
        '--print-timeout',
        `${Math.ceil(timeoutMs / 1000)}s`,
        '-p=',
      ];

      const child = spawn(binary, args, { cwd, shell: false });
      const startedAt = Date.now();

      /** @type {any} */
      let resultEvent = null;
      /** @type {string[]} */
      const stderrChunks = [];
      /** @type {string[]} */
      const unparsed = [];

      child.stderr.on('data', (chunk) => stderrChunks.push(String(chunk)));

      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === '') return;
        try {
          const event = JSON.parse(trimmed);
          if (event?.event === 'result') resultEvent = event.result;
        } catch {
          unparsed.push(trimmed);
        }
      });

      const message = {
        event: 'user',
        message: { role: 'user', content: [{ type: 'text', text: prompt }] },
      };
      child.stdin.end(`${JSON.stringify(message)}\n`);

      const timer = setTimeout(() => child.kill(), timeoutMs);
      try {
        await once(child, rl);
      } finally {
        clearTimeout(timer);
      }

      const durationSeconds = (Date.now() - startedAt) / 1000;

      if (!resultEvent) {
        const detail = stderrChunks.join('').trim() || unparsed.join(' ') || 'no result event';
        throw new WorkerFailedError(`${model} produced no result (${detail})`);
      }
      if (resultEvent.status !== 'SUCCESS') {
        throw new WorkerFailedError(`${model} returned ${resultEvent.status}: ${resultEvent.error ?? 'unknown'}`);
      }

      const deniedActions = (resultEvent.denied_actions ?? []).map(
        (/** @type {any} */ action) => action.action ?? action.display_name ?? String(action),
      );

      const text = String(resultEvent.response ?? '').trim();
      if (text === '') {
        // A denied permission reports SUCCESS with an empty response, which would
        // otherwise surface as a baffling blank answer.
        if (deniedActions.length > 0) throw new WorkerPermissionError(deniedActions);
        throw new WorkerFailedError(`${model} returned an empty response`);
      }

      const usage = resultEvent.usage ?? {};
      return {
        text,
        model,
        deniedActions,
        durationSeconds: resultEvent.duration_seconds ?? durationSeconds,
        usage: {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        },
      };
    },
  };
}

/**
 * Resolves once the child has exited AND stdout has been fully consumed, so no
 * trailing result event is lost to the exit race.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {import('node:readline').Interface} rl
 */
function once(child, rl) {
  const closed = new Promise((resolve) => rl.once('close', resolve));
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return Promise.all([closed, exited]);
}
