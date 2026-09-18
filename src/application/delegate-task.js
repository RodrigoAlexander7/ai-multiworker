// @ts-check
import { resolveTask } from '../domain/tasks.js';
import { modelChainFor } from '../domain/routing-policy.js';
import { computeSavings } from '../domain/savings.js';
import { InputTooLargeError, WorkerFailedError } from '../domain/errors.js';

const DEFAULT_MAX_INPUT_CHARS = 4_000_000;
const DEFAULT_TIMEOUT_MS = 240_000;

/**
 * @typedef {object} DelegateDeps
 * @property {import('./ports.js').WorkerPort} worker
 * @property {import('./ports.js').ContentSourcePort} contentSource
 * @property {import('./ports.js').MetricsPort} [metrics]
 * @property {Record<string, readonly string[]>} [modelOverrides]
 * @property {number} [maxInputChars]
 * @property {number} [timeoutMs]
 */

/**
 * @typedef {object} DelegateCommand
 * @property {string} taskId
 * @property {string} instruction
 * @property {readonly string[]} [refs] Paths or other identifiers the content source understands.
 * @property {string} [inlineContent] Material supplied directly instead of via refs.
 * @property {string} [model] Explicit override, bypassing the routing policy.
 * @property {boolean} [answerEntersContext] False when the caller writes the answer straight to disk.
 */

/**
 * @typedef {object} DelegateResult
 * @property {string} answer
 * @property {string} model
 * @property {number} attempts
 * @property {import('../domain/savings.js').SavingsReport} savings
 * @property {import('./ports.js').WorkerUsage} workerUsage
 */

/**
 * @param {DelegateDeps} deps
 * @returns {(command: DelegateCommand) => Promise<DelegateResult>}
 */
export function createDelegateTask(deps) {
  const {
    worker,
    contentSource,
    metrics,
    modelOverrides = {},
    maxInputChars = DEFAULT_MAX_INPUT_CHARS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = deps;

  return async function delegateTask(command) {
    const spec = resolveTask(command.taskId);

    const documents = command.inlineContent
      ? [{ label: 'stdin', content: command.inlineContent }]
      : await contentSource.load(command.refs ?? []);

    const rawMaterial = documents.map((doc) => doc.content).join('\n');
    if (rawMaterial.length > maxInputChars) {
      throw new InputTooLargeError(rawMaterial.length, maxInputChars);
    }

    const prompt = spec.buildPrompt({ instruction: command.instruction, documents });
    const chain = command.model ? [command.model] : modelChainFor(spec.id, modelOverrides);

    const response = await runWithFallback(worker, chain, prompt, timeoutMs);
    const savings = computeSavings(rawMaterial, response.result.text, {
      answerEntersContext: command.answerEntersContext ?? true,
    });

    await metrics?.record({
      taskId: spec.id,
      model: response.result.model,
      attempts: response.attempts,
      savings,
      workerUsage: response.result.usage,
      durationSeconds: response.result.durationSeconds,
    });

    return {
      answer: response.result.text,
      model: response.result.model,
      attempts: response.attempts,
      savings,
      workerUsage: response.result.usage,
    };
  };
}

/**
 * @param {import('./ports.js').WorkerPort} worker
 * @param {readonly string[]} chain
 * @param {string} prompt
 * @param {number} timeoutMs
 * @returns {Promise<{ result: import('./ports.js').WorkerResponse, attempts: number }>}
 */
async function runWithFallback(worker, chain, prompt, timeoutMs) {
  /** @type {string[]} */
  const failures = [];

  for (const [index, model] of chain.entries()) {
    try {
      const result = await worker.run({ prompt, model, timeoutMs });
      return { result, attempts: index + 1 };
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new WorkerFailedError(failures.join(' | '), { attempts: chain.length });
}
