---
name: delegating-work
description: Delegate token-heavy, low-reasoning work to a cheaper worker model instead of loading it into context. Use when about to read a large file, sift through noisy grep or search output, triage long test/build/CI logs, write documentation or docstrings from existing code, or generate mechanical boilerplate from a specification.
---

# Delegating work to cheap workers

Most of what a coding agent does is not thinking — it is I/O. Reading a 900-line
file to answer one question spends thousands of tokens of expensive context on
material you will never refer to again. A cheap worker can read it instead and
hand back only the answer.

Run delegations with:

```
node "${CLAUDE_PLUGIN_ROOT}/src/interfaces/cli/main.js" <task> -i "<instruction>" [-f <file>...] [--stdin]
```

## What to delegate

| Task | Use it for |
|---|---|
| `read` | Answering a question about one or more large files. |
| `search-digest` | Cutting noisy grep/ripgrep output down to the real matches. |
| `log-analysis` | Pulling root-cause failures out of long test, build or CI output. |
| `docs` | Drafting documentation, READMEs or docstrings from existing code. |
| `boilerplate` | Generating mechanical code fully determined by a specification. |

Files go in with `-f`. Piped material goes in with `--stdin`:

```bash
rg -n "createUser" --stats | node "$CLI" search-digest -i "where is the real definition, ignoring tests" --stdin
npm test 2>&1 | node "$CLI" log-analysis -i "which tests actually failed and why" --stdin
```

For `boilerplate`, send the result straight to disk with `-o` so the generated
code never passes through your context at all:

```bash
node "$CLI" boilerplate -i "<precise spec>" -o src/generated/types.ts
```

## What NOT to delegate

**Anything where writing the instruction costs about as much as doing the work.**
This is the trap. If a worker needs a specification precise enough that it
cannot go wrong, you have already spent the tokens you were trying to save, and
you have added a misinterpretation risk on top. Boilerplate qualifies only when
it is genuinely mechanical — DTOs, barrel files, fixtures, i18n tables, config
scaffolding — not merely "simple".

Also keep for yourself:

- Business logic and anything requiring judgment about the codebase.
- Architecture decisions and cross-file refactors.
- Small files. Below roughly 300 lines a direct read is cheaper than the
  worker's fixed overhead and several seconds of latency.
- Text you need verbatim in order to edit it. Use `Read` with `offset`/`limit`
  to fetch just the slice you will modify.

## Reading the results

Workers are told to stay strictly inside the material they are given, so:

- **`NOT_IN_SOURCE`** means the answer is genuinely absent. Widen the file set
  and delegate again — do not assume the worker simply missed it.
- **`SPEC_AMBIGUOUS`** (from `boilerplate`) means your specification had a real
  gap. Resolve the question it raises, then re-delegate.
- Answers cite `path:line`. Use those citations to `Read` the few lines that
  matter rather than reopening the whole file.

Treat a worker answer as a report from a junior teammate: reliable on
extraction, and worth verifying before you build something load-bearing on top
of it.

## Checking the payoff

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/interfaces/cli/main.js" stats
```

Every delegation is recorded with the tokens it avoided and the tokens its
answer cost.
