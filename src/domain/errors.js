// @ts-check

export class MultiworkerError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = 'MultiworkerError';
    this.code = code;
    /** Whether retrying the same work on another model could plausibly succeed. */
    this.retryable = true;
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

/**
 * A denied tool permission is a configuration gap, not a transient outage, so
 * it must not consume the fallback chain: every sibling model would be denied
 * in exactly the same way.
 */
export class WorkerPermissionError extends MultiworkerError {
  /** @param {readonly string[]} actions */
  constructor(actions) {
    super(
      `The worker was denied these permissions: ${actions.join(', ')}. ` +
        'Run "multiworker doctor" for the exact settings to add.',
      'WORKER_PERMISSION_DENIED',
    );
    this.actions = actions;
    this.retryable = false;
  }
}
