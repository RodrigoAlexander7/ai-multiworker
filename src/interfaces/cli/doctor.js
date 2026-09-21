// @ts-check
import { spawnSync } from 'node:child_process';
import { loadConfig, CONFIG_FILENAME } from '../../infrastructure/config/load-config.js';
import { markitdownAvailable } from '../../infrastructure/content/markitdown.js';

/** @param {string} [cwd] */
export async function renderDoctor(cwd = process.cwd()) {
  const lines = ['multiworker doctor', ''];

  lines.push(`Node     ${process.version}`);

  const agy = locateAgy();
  lines.push(`agy      ${agy ?? 'NOT FOUND'}`);

  if (!agy) {
    lines.push('');
    lines.push('agy does not resolve, so nothing can be delegated. Install the');
    lines.push('Antigravity CLI and run "agy install", or point AGY_BIN at the binary:');
    lines.push('');
    lines.push('  export AGY_BIN=/path/to/agy          # Linux / macOS');
    lines.push('  $env:AGY_BIN = "C:\\path\\to\\agy.exe"  # Windows PowerShell');
    return `${lines.join('\n')}\n`;
  }

  lines.push(`link     ${multiworkerLinked() ? 'multiworker is on PATH' : 'NOT on PATH — run "npm link" from this repo, then open a new terminal'}`);

  const converter = markitdownAvailable()
    ? 'available'
    : "missing — pip install 'markitdown[all]'";
  lines.push(`markitdown  ${converter}`);
  lines.push('            optional: only pdf, docx, pptx, xlsx, epub and html need it');

  const config = await loadConfig(cwd);
  lines.push('');
  lines.push(`Config   ${CONFIG_FILENAME} (defaults apply where absent)`);
  lines.push(`  advise from   ${config.thresholds.adviseLines} lines`);
  lines.push(`  block from    ${config.thresholds.blockLines} lines`);
  lines.push(`  timeout       ${config.timeoutMs} ms`);

  const overridden = Object.keys(config.models);
  lines.push(`  model overrides ${overridden.length > 0 ? overridden.join(', ') : 'none'}`);
  if (config.exemptPaths.length > 0) {
    lines.push(`  exempt paths  ${config.exemptPaths.join(', ')}`);
  }

  lines.push('');
  lines.push('Ready. Every task passes its material to the worker as text, so no');
  lines.push('tool permissions are required and the worker never touches your files.');

  return `${lines.join('\n')}\n`;
}

function locateAgy() {
  const binary = process.env.AGY_BIN ?? (process.platform === 'win32' ? 'agy.exe' : 'agy');
  const probe = spawnSync(binary, ['--help'], { shell: false, encoding: 'utf8' });
  return probe.error ? null : binary;
}

/**
 * Checked independently of how this process itself was launched: doctor can
 * run via `node src/interfaces/cli/main.js` even when the global link is
 * missing, which is exactly the case this warns about.
 *
 * `npm link` puts a `.cmd` shim on Windows, and `.cmd` is a script, not a PE
 * binary — CreateProcess cannot launch it directly, only cmd.exe can. `shell:
 * true` is safe here because the command is a fixed literal, not user input.
 */
function multiworkerLinked() {
  const probe = spawnSync('multiworker --help', { shell: true, encoding: 'utf8' });
  return !probe.error && probe.status === 0;
}
