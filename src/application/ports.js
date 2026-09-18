// @ts-check

/**
 * Contracts the application layer depends on. Infrastructure supplies the
 * implementations; nothing here knows that the worker happens to be the `agy`
 * CLI, or that metrics happen to land in a JSONL file.
 */

/**
 * @typedef {object} WorkerUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} totalTokens
 */

/**
 * @typedef {object} WorkerRequest
 * @property {string} prompt
 * @property {string} model
 * @property {number} timeoutMs
 */

/**
 * @typedef {object} WorkerResponse
 * @property {string} text
 * @property {string} model
 * @property {WorkerUsage} usage
 * @property {number} durationSeconds
 * @property {readonly string[]} [deniedActions] Tool permissions the worker was refused.
 */

/**
 * @typedef {object} WorkerPort
 * @property {(request: WorkerRequest) => Promise<WorkerResponse>} run
 */

/**
 * @typedef {object} ContentSourcePort
 * @property {(refs: readonly string[]) => Promise<import('../domain/tasks.js').Document[]>} load
 */

/**
 * @typedef {object} DelegationRecord
 * @property {string} taskId
 * @property {string} model
 * @property {number} attempts
 * @property {import('../domain/savings.js').SavingsReport} savings
 * @property {WorkerUsage} workerUsage
 * @property {number} durationSeconds
 */

/**
 * @typedef {object} MetricsPort
 * @property {(record: DelegationRecord) => Promise<void>} record
 */

export {};
