// @ts-check
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MultiworkerError } from '../../domain/errors.js';

/**
 * Line numbers are baked in so the worker can cite `path:line` accurately; the
 * orchestrator uses those citations to jump straight to the relevant code
 * without ever loading the file itself.
 *
 * @param {string} text
 */
function withLineNumbers(text) {
  return text
    .split('\n')
    .map((line, index) => `${String(index + 1).padStart(5, ' ')}| ${line}`)
    .join('\n');
}

/**
 * @param {{ roots?: readonly string[] }} [options]
 * @returns {import('../../application/ports.js').ContentSourcePort}
 */
export function createFsContentSource(options = {}) {
  const roots = (options.roots ?? [process.cwd()]).map((root) => path.resolve(root));

  /** @param {string} candidate */
  function assertInsideRoots(candidate) {
    const resolved = path.resolve(candidate);
    const allowed = roots.some(
      (root) => resolved === root || resolved.startsWith(root + path.sep),
    );
    if (!allowed) {
      throw new MultiworkerError(
        `Refusing to read "${candidate}": outside the allowed roots (${roots.join(', ')})`,
        'PATH_OUTSIDE_ROOT',
      );
    }
    return resolved;
  }

  return {
    async load(refs) {
      return Promise.all(
        refs.map(async (ref) => {
          const resolved = assertInsideRoots(ref);
          const raw = await readFile(resolved, 'utf8');
          return {
            label: path.relative(process.cwd(), resolved) || resolved,
            content: withLineNumbers(raw),
          };
        }),
      );
    },
  };
}
