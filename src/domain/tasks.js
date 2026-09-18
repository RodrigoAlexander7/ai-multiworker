// @ts-check
import { UnknownTaskError } from './errors.js';

/**
 * @typedef {object} Document
 * @property {string} label Identifier shown to the worker (usually a file path).
 * @property {string} content
 */

/**
 * @typedef {object} TaskInput
 * @property {string} instruction What the caller wants to know or produce.
 * @property {readonly Document[]} documents
 */

/**
 * @typedef {object} TaskSpec
 * @property {string} id
 * @property {string} summary
 * @property {(input: TaskInput) => string} buildPrompt
 */

/**
 * Workers run headless, where every tool permission is auto-denied. Left to
 * themselves they reach for one anyway — to run a command, to go read a file —
 * and the turn dies with an empty answer.
 */
const NO_TOOLS = [
  '- You have no tools. You cannot run commands, open files or browse. Work from',
  '  the text in this prompt and nothing else.',
].join('\n');

/**
 * Workers are trusted blindly by the orchestrator, so every prompt forbids
 * inference beyond the supplied text: a confident wrong answer is worse than
 * an explicit gap.
 */
const GROUNDING_CONTRACT = [
  'Rules:',
  '- Use ONLY the supplied material. Never rely on outside knowledge or guesses.',
  NO_TOOLS,
  '- If the material does not contain the answer, reply exactly: NOT_IN_SOURCE',
  '- Cite the source label (and line number when visible) for every claim.',
  '- Be terse. No preamble, no restating the question, no closing offers of help.',
].join('\n');

/** @param {readonly Document[]} documents */
function renderDocuments(documents) {
  return documents
    .map((doc) => `<source label="${doc.label}">\n${doc.content}\n</source>`)
    .join('\n\n');
}

/** @type {readonly TaskSpec[]} */
const SPECS = [
  {
    id: 'read',
    summary: 'Answer a question about large files without loading them into the orchestrator.',
    buildPrompt: ({ instruction, documents }) =>
      [
        'You are a code-reading assistant. Answer the request using the sources below.',
        '',
        GROUNDING_CONTRACT,
        '',
        `Request: ${instruction}`,
        '',
        renderDocuments(documents),
      ].join('\n'),
  },
  {
    id: 'log-analysis',
    summary: 'Extract real failures from long test, build or runtime output.',
    buildPrompt: ({ instruction, documents }) =>
      [
        'You are triaging long build/test/runtime output.',
        '',
        GROUNDING_CONTRACT,
        '- Report only root-cause failures. Collapse repeated stack frames.',
        '- Ignore warnings and deprecations unless they caused the failure.',
        '- Format: one block per distinct failure, with the failing location and the exact error text.',
        '',
        `Request: ${instruction}`,
        '',
        renderDocuments(documents),
      ].join('\n'),
  },
  {
    id: 'docs-audit',
    summary: 'Find claims in documentation that the code contradicts.',
    buildPrompt: ({ instruction, documents }) =>
      [
        'You are auditing documentation against the code it describes.',
        '',
        'Rules:',
        NO_TOOLS,
        '- Report ONLY claims the supplied code actively contradicts.',
        // Docs legitimately cover install steps, rationale and context that no
        // source file shows. Flagging those as problems buries the real findings.
        '- A claim the sources simply do not cover is NOT a finding. Documentation',
        '  describes things beyond the code, and absence is not contradiction.',
        '- Never propose rewrites. Report what is wrong and what the code does instead.',
        '- Quote the offending claim in under 15 words. Cite the doc location and',
        '  the code location that disproves it.',
        '- If nothing is contradicted, reply exactly: NO_DISCREPANCIES',
        '',
        'One block per finding, worst first:',
        'CLAIM: "<quoted claim>" (<doc label>:<line>)',
        'REALITY: <what the code actually does> (<code label>:<line>)',
        '',
        `Focus: ${instruction}`,
        '',
        renderDocuments(documents),
      ].join('\n'),
  },
];

const BY_ID = new Map(SPECS.map((spec) => [spec.id, spec]));

export const TASK_IDS = SPECS.map((spec) => spec.id);

/** @param {string} taskId @returns {TaskSpec} */
export function resolveTask(taskId) {
  const spec = BY_ID.get(taskId);
  if (!spec) throw new UnknownTaskError(taskId, TASK_IDS);
  return spec;
}

export { SPECS as TASK_SPECS };
