// @ts-check
import { readFile } from 'node:fs/promises';

/**
 * Line count is measured by reading the whole target, even when the command
 * that triggered the check (e.g. `head -500`) would only pour part of it into
 * the transcript. The pre-existing advisory message already carried this same
 * approximation; this keeps both hooks consistent rather than introducing a
 * second, more precise, more complex path.
 *
 * @param {string} absolutePath
 * @returns {Promise<number | null>} null when the file cannot be read.
 */
export async function countLines(absolutePath) {
  try {
    const raw = await readFile(absolutePath, 'utf8');
    return raw.split('\n').length;
  } catch {
    return null;
  }
}
