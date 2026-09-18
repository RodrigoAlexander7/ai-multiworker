// @ts-check

export class MultiworkerError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = 'MultiworkerError';
    this.code = code;
  }
}

export class UnknownTaskError extends MultiworkerError {
  /** @param {string} taskId @param {readonly string[]} known */
  constructor(taskId, known) {
    super(`Unknown task "${taskId}". Known tasks: ${known.join(', ')}`, 'UNKNOWN_TASK');
  }
}

export class InputTooLargeError extends MultiworkerError {
  /** @param {number} actualChars @param {number} maxChars */
  constructor(actualChars, maxChars) {
    super(
      `Input is ${actualChars} chars, above the ${maxChars} limit. Narrow the selection before delegating.`,
      'INPUT_TOO_LARGE',
    );
  }
}

export class WorkerFailedError extends MultiworkerError {
  /** @param {string} detail @param {{ attempts?: number }} [meta] */
  constructor(detail, meta = {}) {
    super(`Worker failed: ${detail}`, 'WORKER_FAILED');
    this.attempts = meta.attempts ?? 1;
  }
}
