// @ts-check
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_THRESHOLDS } from '../../domain/read-policy.js';

const CONFIG_FILENAME = '.multiworker.json';

/**
 * @typedef {object} MultiworkerConfig
 * @property {Record<string, readonly string[]>} models
 * @property {{ adviseLines: number, blockLines: number }} thresholds
 * @property {number} timeoutMs
 * @property {string[]} exemptPaths Globless substrings; a matching path is never intercepted.
 */

/** @type {MultiworkerConfig} */
const DEFAULTS = {
  models: {},
  thresholds: { ...DEFAULT_THRESHOLDS },
  timeoutMs: 240_000,
  exemptPaths: [],
};

/**
 * @param {string} [cwd]
 * @returns {Promise<MultiworkerConfig>}
 */
export async function loadConfig(cwd = process.cwd()) {
  let fileConfig = {};
  try {
    const raw = await readFile(path.join(cwd, CONFIG_FILENAME), 'utf8');
    fileConfig = JSON.parse(raw);
  } catch {
    // Absent or unreadable config is the normal case: defaults apply.
  }

  return {
    models: { ...DEFAULTS.models, ...(fileConfig.models ?? {}) },
    thresholds: { ...DEFAULTS.thresholds, ...(fileConfig.thresholds ?? {}) },
    timeoutMs: fileConfig.timeoutMs ?? DEFAULTS.timeoutMs,
    exemptPaths: fileConfig.exemptPaths ?? DEFAULTS.exemptPaths,
  };
}

export { CONFIG_FILENAME };
