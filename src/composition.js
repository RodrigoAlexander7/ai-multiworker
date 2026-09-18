// @ts-check
import { createDelegateTask } from './application/delegate-task.js';
import { createAgyWorker } from './infrastructure/worker/agy-worker.js';
import { createFsContentSource } from './infrastructure/content/fs-content-source.js';
import { createJsonlMetricsSink } from './infrastructure/metrics/jsonl-metrics-sink.js';
import { loadConfig } from './infrastructure/config/load-config.js';

/**
 * Composition root: the only place that knows which concrete adapters back the
 * application ports.
 *
 * @param {{ cwd?: string }} [options]
 */
export async function buildApp(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  const delegateTask = createDelegateTask({
    worker: createAgyWorker({ cwd }),
    contentSource: createFsContentSource({ roots: [cwd] }),
    metrics: createJsonlMetricsSink(),
    modelOverrides: config.models,
    timeoutMs: config.timeoutMs,
  });

  return { delegateTask, config };
}
