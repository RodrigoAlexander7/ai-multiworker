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
 * @property {'read'|'write'} side
 * @property {(input: TaskInput) => string} buildPrompt
 */

/**
 * Workers are trusted blindly by the orchestrator, so every prompt forbids
 * inference beyond the supplied text: a confident wrong answer is worse than
 * an explicit gap.
 */
const GROUNDING_CONTRACT = [
  'Rules:',
  '- Use ONLY the supplied material. Never rely on outside knowledge or guesses.',
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
    side: 'read',
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
    id: 'search-digest',
    summary: 'Filter noisy search output down to the genuinely relevant matches.',
    side: 'read',
    buildPrompt: ({ instruction, documents }) =>
      [
        'You are filtering raw search results. Keep only matches that genuinely satisfy the request.',
        '',
        GROUNDING_CONTRACT,
        '- Output a list of `path:line — why it matches` and nothing else.',
        '- Discard vendored, generated, minified and test-fixture noise unless the request asks for it.',
        '',
        `Request: ${instruction}`,
        '',
        renderDocuments(documents),
      ].join('\n'),
  },
  {
    id: 'log-analysis',
    summary: 'Extract real failures from long test, build or runtime output.',
    side: 'read',
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
    id: 'docs',
    summary: 'Draft documentation or docstrings from existing code.',
    side: 'write',
    buildPrompt: ({ instruction, documents }) =>
      [
        'You are writing documentation for the code below.',
        '',
        GROUNDING_CONTRACT,
        '- Document only behaviour visible in the sources. Never invent options or guarantees.',
        '- Output the finished document body only, with no commentary around it.',
        '',
        `Request: ${instruction}`,
        '',
        renderDocuments(documents),
      ].join('\n'),
  },
  {
    id: 'boilerplate',
    summary: 'Generate mechanical code fully determined by a specification.',
    side: 'write',
    buildPrompt: ({ instruction, documents }) =>
      [
        'You are generating mechanical boilerplate from a specification.',
        '',
        GROUNDING_CONTRACT,
        '- Follow the specification literally. Make no design decisions of your own.',
        '- If the specification is ambiguous, reply exactly: SPEC_AMBIGUOUS followed by the specific question.',
        '- Output raw code only, with no markdown fences and no explanation.',
        '',
        `Specification: ${instruction}`,
        documents.length > 0 ? `\n${renderDocuments(documents)}` : '',
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
