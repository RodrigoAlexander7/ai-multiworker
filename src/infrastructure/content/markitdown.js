// @ts-check
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { MultiworkerError } from '../../domain/errors.js';

/**
 * Formats whose bytes are not text. Reading these as UTF-8 yields mojibake
 * rather than an error, so the worker would confidently answer questions about
 * noise. HTML is included for a different reason: its markup can outweigh its
 * prose several times over, and Markdown carries the same content for far less.
 */
const CONVERTIBLE = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.xlsx',
  '.xls',
  '.epub',
  '.html',
  '.htm',
]);

/** @param {string} filePath */
export function needsConversion(filePath) {
  return CONVERTIBLE.has(path.extname(filePath).toLowerCase());
}

/** @type {string[] | null | undefined} */
let resolved;

/**
 * pip puts the markitdown script in a directory that is often not on PATH, so
 * the module form is kept as a fallback rather than asking the user to fix
 * their environment.
 *
 * @returns {string[] | null}
 */
function resolveCommand() {
  if (resolved !== undefined) return resolved;

  const candidates = process.env.MARKITDOWN_BIN
    ? [process.env.MARKITDOWN_BIN.split(/\s+/)]
    : [
        [process.platform === 'win32' ? 'markitdown.exe' : 'markitdown'],
        ['python', '-m', 'markitdown'],
        ['python3', '-m', 'markitdown'],
      ];

  resolved =
    candidates.find(([bin, ...args]) => {
      const probe = spawnSync(bin, [...args, '--help'], { shell: false, encoding: 'utf8' });
      return !probe.error && probe.status === 0;
    }) ?? null;

  return resolved;
}

export function markitdownAvailable() {
  return resolveCommand() !== null;
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export function convertToMarkdown(filePath) {
  const command = resolveCommand();
  if (!command) {
    throw new MultiworkerError(
      `Cannot read ${path.basename(filePath)}: markitdown is not installed. ` +
        "Install it with: pip install 'markitdown[all]'",
      'MARKITDOWN_MISSING',
    );
  }

  const [bin, ...args] = command;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args, filePath], {
      shell: false,
      // Python writes stdout in the console codepage, which on Windows is
      // cp1252 and cannot encode most of what a real document contains — a
      // single typographic character aborts the whole conversion.
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    /** @type {Buffer[]} */
    const out = [];
    /** @type {string[]} */
    const err = [];

    child.stdout.on('data', (chunk) => out.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => err.push(String(chunk)));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(
          new MultiworkerError(
            `markitdown failed on ${path.basename(filePath)}: ${err.join('').trim() || `exit ${code}`}`,
            'CONVERSION_FAILED',
          ),
        );
        return;
      }
      resolve(Buffer.concat(out).toString('utf8'));
    });
  });
}

export { CONVERTIBLE as CONVERTIBLE_EXTENSIONS };
