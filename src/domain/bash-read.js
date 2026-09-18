// @ts-check

/** Commands that dump a whole file into the transcript. */
const WHOLE_FILE_READER = /^\s*(?:cat|type|less|more)\s+(.+)$/;

/** Commands capped by their own default, or by an explicit line count. */
const BOUNDED_READER = /^\s*(?:head|tail)\s+(.+)$/;

/**
 * The file a shell command is about to pour into the transcript, or null when
 * the command spends no context on one.
 *
 * @param {string} command
 * @param {number} adviseLines Explicit head/tail counts below this stay cheap.
 * @returns {string | null}
 */
export function bulkReadTarget(command, adviseLines) {
  // A pipe means the output is being filtered before anyone sees it, and a
  // redirect means it never reaches the transcript at all.
  if (command.includes('|') || command.includes('>')) return null;

  const whole = WHOLE_FILE_READER.exec(command);
  // `-n` numbers lines for cat and takes no value, unlike for head/tail.
  if (whole) return firstPath(whole[1], false);

  const bounded = BOUNDED_READER.exec(command);
  if (bounded) {
    // head/tail cap themselves at 10 lines unless told otherwise, so only an
    // explicit count large enough to matter makes this a bulk read.
    const count = explicitCount(bounded[1]);
    return count !== null && count >= adviseLines ? firstPath(bounded[1], true) : null;
  }

  return null;
}

/** Flags whose value arrives as the next argument rather than attached to them. */
const FLAG_TAKES_VALUE = /^(?:-n|--lines)$/;

/** @param {string} args @param {boolean} flagsTakeValue @returns {string | null} */
function firstPath(args, flagsTakeValue) {
  let skipNext = false;

  for (const [, dquoted, squoted, bare] of args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    const quoted = dquoted ?? squoted;
    const value = quoted ?? bare ?? '';

    if (skipNext) {
      skipNext = false;
      continue;
    }
    // A quoted argument is a path even if it happens to start with a dash.
    if (quoted === undefined && value.startsWith('-')) {
      if (flagsTakeValue && FLAG_TAKES_VALUE.test(value)) skipNext = true;
      continue;
    }
    if (value !== '') return value;
  }

  return null;
}

/** @param {string} args @returns {number | null} */
function explicitCount(args) {
  const match = /(?:^|\s)-(?:n\s*|-lines[= ])?(\d+)/.exec(args);
  return match ? Number(match[1]) : null;
}
